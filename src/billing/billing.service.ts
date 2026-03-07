import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { BillingStatus } from '@prisma/client';

const FW_BASE_URL = 'https://api.flutterwave.com/v3';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly fwSecretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {
    this.fwSecretKey = this.config.get<string>('FLW_SECRET_KEY')!;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers HTTP Flutterwave
  // ──────────────────────────────────────────────────────────────────────────

  private fwHeaders() {
    return {
      Authorization: `Bearer ${this.fwSecretKey}`,
      'Content-Type': 'application/json',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lecture
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Retourne l'abonnement actif de l'organisation avec les details du plan.
   */
  async getSubscription(organizationId: string) {
    const sub = await this.prisma.billingSubscription.findUnique({
      where: { organizationId },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            label: true,
            priceMonthly: true,
            maxUsers: true,
            maxKpis: true,
            maxWidgets: true,
            hasNlq: true,
            hasAdvancedReports: true,
          },
        },
      },
    });

    if (!sub) {
      return { hasSubscription: false, subscription: null };
    }

    return { hasSubscription: true, subscription: sub };
  }

  /**
   * Retourne l'historique des factures de l'organisation.
   */
  async getInvoices(organizationId: string) {
    return this.prisma.billingInvoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fwTransactionId: true,
        amountPaid: true,
        currency: true,
        status: true,
        pdfUrl: true,
        hostedUrl: true,
        paidAt: true,
        createdAt: true,
      },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Checkout / Payment Link
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Cree un lien de paiement Flutterwave Hosted Payment et retourne l'URL.
   * L'organisation est redirigee vers Flutterwave pour saisir ses informations de paiement.
   */
  async createCheckoutSession(
    organizationId: string,
    userId: string,
    dto: CreateCheckoutDto,
  ): Promise<{ url: string }> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');

    // Verifier que le plan existe et a un fwPlanId configure
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: dto.planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan d\'abonnement introuvable.');
    }

    if (!plan.fwPlanId) {
      throw new BadRequestException(
        'Ce plan n\'est pas encore configure pour le paiement en ligne. Contactez le support.',
      );
    }

    // Recuperer les infos de l'organisation / proprietaire
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { owner: { select: { email: true, firstName: true, lastName: true } } },
    });

    if (!org) throw new NotFoundException('Organisation introuvable.');

    const ownerEmail = org.owner?.email ?? `org-${organizationId}@cockpit.internal`;
    const ownerName = org.owner
      ? `${org.owner.firstName ?? ''} ${org.owner.lastName ?? ''}`.trim()
      : org.name;

    const redirectUrl = dto.successUrl ?? `${frontendUrl}/billing/success`;

    // Creer le lien de paiement Flutterwave (Hosted Payment)
    const response = await axios.post(
      `${FW_BASE_URL}/payments`,
      {
        tx_ref: `cockpit-${organizationId}-${Date.now()}`,
        amount: plan.priceMonthly,
        currency: 'XOF',
        redirect_url: redirectUrl,
        payment_plan: plan.fwPlanId,
        customer: {
          email: ownerEmail,
          name: ownerName,
        },
        meta: {
          organizationId,
          planId: dto.planId,
        },
        customizations: {
          title: `Cockpit — Plan ${plan.label}`,
          description: `Abonnement mensuel ${plan.label}`,
        },
      },
      { headers: this.fwHeaders() },
    );

    const paymentLink: string = response.data?.data?.link;
    if (!paymentLink) {
      this.logger.error('Flutterwave payment link creation failed', response.data);
      throw new BadRequestException('Impossible de creer le lien de paiement. Reessayez.');
    }

    // Upsert BillingCustomer (fwCustomerId arrive via webhook charge.completed)
    await this.prisma.billingCustomer.upsert({
      where: { organizationId },
      create: { organizationId, email: ownerEmail },
      update: { email: ownerEmail },
    });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'billing_checkout_initiated',
      payload: {
        planId: dto.planId,
        planName: plan.name,
        fwPlanId: plan.fwPlanId,
      },
    });

    return { url: paymentLink };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Annulation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Annule l'abonnement Flutterwave de l'organisation.
   *   immediately=false : on marque cancelAtPeriodEnd, l'acces reste actif jusqu'a currentPeriodEnd.
   *   immediately=true  : appel API FW pour annulation immediate.
   */
  async cancelSubscription(
    organizationId: string,
    userId: string,
    dto: CancelSubscriptionDto,
  ) {
    const sub = await this.prisma.billingSubscription.findUnique({
      where: { organizationId },
    });

    if (!sub) {
      throw new NotFoundException('Aucun abonnement actif trouve.');
    }

    if (sub.status === BillingStatus.CANCELLED) {
      throw new BadRequestException('L\'abonnement est deja annule.');
    }

    if (dto.immediately && sub.fwSubscriptionId) {
      // Annulation immediate via API Flutterwave
      await axios.put(
        `${FW_BASE_URL}/subscriptions/${sub.fwSubscriptionId}/cancel`,
        {},
        { headers: this.fwHeaders() },
      );

      await this.prisma.billingSubscription.update({
        where: { organizationId },
        data: {
          status: BillingStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });
    } else {
      // Annulation programmee a la fin de la periode
      await this.prisma.billingSubscription.update({
        where: { organizationId },
        data: { cancelAtPeriodEnd: true },
      });
    }

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'subscription_cancelled',
      payload: {
        fwSubscriptionId: sub.fwSubscriptionId,
        immediately: dto.immediately ?? false,
      },
    });

    return {
      message: dto.immediately
        ? 'Abonnement annule immediatement.'
        : 'Abonnement programme pour annulation a la fin de la periode en cours.',
      cancelAtPeriodEnd: !dto.immediately,
      currentPeriodEnd: sub.currentPeriodEnd,
    };
  }
}
