import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { BillingStatus } from '@prisma/client';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY')!, {
      apiVersion: '2026-02-25.clover',
    });
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
        stripeInvoiceId: true,
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
  // Checkout
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Cree une session Stripe Checkout et retourne l'URL de paiement.
   * L'organisation est redirigee vers Stripe pour saisir sa carte.
   */
  async createCheckoutSession(
    organizationId: string,
    userId: string,
    dto: CreateCheckoutDto,
  ): Promise<{ url: string }> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');

    // Verifier que le plan existe et a un stripePriceId configure
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: dto.planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan d\'abonnement introuvable.');
    }

    if (!plan.stripePriceId || plan.stripePriceId.startsWith('price_PLACEHOLDER') || plan.stripePriceId.endsWith('_PLACEHOLDER')) {
      throw new BadRequestException(
        'Ce plan n\'est pas encore configure pour le paiement en ligne. Contactez le support.',
      );
    }

    // Recuperer ou creer le customer Stripe pour cette organisation
    const customer = await this.getOrCreateStripeCustomer(organizationId);

    const successUrl = dto.successUrl ?? `${frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = dto.cancelUrl ?? `${frontendUrl}/billing/cancel`;

    // Creer la session Stripe Checkout
    const session = await this.stripe.checkout.sessions.create({
      customer: customer.stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      currency: 'xof',
      metadata: {
        organizationId,
        planId: dto.planId,
      },
      subscription_data: {
        metadata: {
          organizationId,
          planId: dto.planId,
        },
      },
    });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'billing_checkout_initiated',
      payload: {
        planId: dto.planId,
        planName: plan.name,
        sessionId: session.id,
      },
    });

    return { url: session.url! };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Portail Client
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Cree une session Stripe Customer Portal.
   * Permet au client de gerer sa carte, voir ses factures, modifier l'abonnement.
   */
  async createPortalSession(
    organizationId: string,
    userId: string,
  ): Promise<{ url: string }> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');

    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { organizationId },
    });

    if (!billingCustomer) {
      throw new NotFoundException(
        'Aucun abonnement actif. Veuillez d\'abord souscrire a un plan.',
      );
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: billingCustomer.stripeCustomerId,
      return_url: `${frontendUrl}/billing`,
    });

    await this.auditLog.log({
      organizationId,
      userId,
      event: 'billing_portal_opened',
      payload: { stripeCustomerId: billingCustomer.stripeCustomerId },
    });

    return { url: session.url };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Annulation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Annule l'abonnement Stripe de l'organisation.
   * Par defaut : annulation a la fin de la periode (acces maintenu jusqu'a la date).
   * Si immediately=true : annulation immediate, acces coupe maintenant.
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

    if (dto.immediately) {
      // Annulation immediate : Stripe met fin au sub maintenant
      await this.stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    } else {
      // Annulation a la fin de periode (cancel_at_period_end)
      await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

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
        stripeSubscriptionId: sub.stripeSubscriptionId,
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

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers internes
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Recupere le BillingCustomer existant ou en cree un nouveau dans Stripe.
   */
  async getOrCreateStripeCustomer(organizationId: string) {
    const existing = await this.prisma.billingCustomer.findUnique({
      where: { organizationId },
    });

    if (existing) return existing;

    // Recuperer les infos de l'organisation pour le customer Stripe
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { owner: { select: { email: true, firstName: true, lastName: true } } },
    });

    if (!org) throw new NotFoundException('Organisation introuvable.');

    const ownerEmail = org.owner?.email ?? `org-${organizationId}@cockpit.internal`;
    const ownerName = org.owner
      ? `${org.owner.firstName ?? ''} ${org.owner.lastName ?? ''}`.trim()
      : org.name;

    // Creer le customer dans Stripe
    const stripeCustomer = await this.stripe.customers.create({
      email: ownerEmail,
      name: org.name,
      metadata: {
        organizationId,
        ownerName,
      },
    });

    // Persister en DB
    return this.prisma.billingCustomer.create({
      data: {
        organizationId,
        stripeCustomerId: stripeCustomer.id,
        email: ownerEmail,
      },
    });
  }
}
