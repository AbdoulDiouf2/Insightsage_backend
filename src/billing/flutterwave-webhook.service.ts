import { Injectable, Logger } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { MailerService } from '../mailer/mailer.service';
import { BillingStatus } from '@prisma/client';

@Injectable()
export class FlutterwaveWebhookService {
  private readonly logger = new Logger(FlutterwaveWebhookService.name);
  private readonly secretHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
    private readonly mailer: MailerService,
  ) {
    this.secretHash = this.config.get<string>('FLW_SECRET_HASH') ?? '';
    if (!this.secretHash) {
      this.logger.warn(
        'FLW_SECRET_HASH est vide — le webhook Flutterwave rejettera toutes les requêtes.',
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Verification signature
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Vérifie que la requête provient bien de Flutterwave.
   * Flutterwave envoie le secret hash dans le header "verif-hash".
   *
   * Utilise timingSafeEqual pour éviter les timing attacks.
   * Rejette immédiatement si FLW_SECRET_HASH n'est pas configuré.
   */
  verifyWebhook(signature: string): boolean {
    if (!this.secretHash || !signature) {
      return false;
    }
    try {
      const sigBuf = Buffer.from(signature);
      const secretBuf = Buffer.from(this.secretHash);
      // Les buffers doivent avoir la même longueur pour timingSafeEqual
      if (sigBuf.length !== secretBuf.length) {
        return false;
      }
      return timingSafeEqual(sigBuf, secretBuf);
    } catch {
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Routeur principal
  // ──────────────────────────────────────────────────────────────────────────

  async handleEvent(payload: any): Promise<void> {
    const event: string = payload?.event;
    this.logger.log(`Flutterwave webhook recu : ${event}`);

    switch (event) {
      case 'charge.completed':
        await this.handleChargeCompleted(payload.data);
        break;

      case 'subscription.cancelled':
        await this.handleSubscriptionCancelled(payload.data);
        break;

      default:
        this.logger.debug(`Evenement Flutterwave non traite : ${event}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Handlers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * charge.completed
   * Paiement reussi (premier paiement ou renouvellement mensuel).
   * Declenche uniquement si status === "successful" et payment_plan present.
   */
  private async handleChargeCompleted(data: any) {
    if (data?.status !== 'successful') return;

    // Ignorer les charges sans payment_plan (paiements one-shot)
    const fwPlanId: string | undefined = data.payment_plan;
    if (!fwPlanId) return;

    const organizationId: string | undefined = data.meta?.organizationId;
    const planId: string | undefined = data.meta?.planId;

    if (!organizationId || !planId) {
      this.logger.warn('charge.completed : meta manquants (organizationId ou planId)', data);
      return;
    }

    const fwTransactionId: string = String(data.id);
    const fwSubscriptionId: string | undefined = data.subscription_id
      ? String(data.subscription_id)
      : undefined;
    const fwCustomerId: string | undefined = data.customer?.id
      ? String(data.customer.id)
      : undefined;

    const amountPaid: number = Math.round(data.amount ?? 0);
    const currency: string = (data.currency ?? 'XOF').toLowerCase();
    const paidAt = new Date();

    // currentPeriodStart = maintenant, currentPeriodEnd = +1 mois
    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await this.prisma.$transaction(async (tx) => {
      // Upsert BillingCustomer
      const customer = await tx.billingCustomer.upsert({
        where: { organizationId },
        create: {
          organizationId,
          fwCustomerId: fwCustomerId ?? null,
          email: data.customer?.email ?? `org-${organizationId}@cockpit.internal`,
        },
        update: {
          fwCustomerId: fwCustomerId ?? undefined,
          email: data.customer?.email ?? undefined,
        },
      });

      // Upsert BillingSubscription
      await tx.billingSubscription.upsert({
        where: { organizationId },
        create: {
          organizationId,
          customerId: customer.id,
          fwSubscriptionId: fwSubscriptionId ?? null,
          planId,
          status: BillingStatus.ACTIVE,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
        update: {
          fwSubscriptionId: fwSubscriptionId ?? undefined,
          planId,
          status: BillingStatus.ACTIVE,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
      });

      // Upsert BillingInvoice
      await tx.billingInvoice.upsert({
        where: { fwTransactionId },
        create: {
          organizationId,
          subscriptionId: (await tx.billingSubscription.findUniqueOrThrow({
            where: { organizationId },
            select: { id: true },
          })).id,
          fwTransactionId,
          amountPaid,
          currency,
          status: 'paid',
          paidAt,
        },
        update: {
          status: 'paid',
          paidAt,
        },
      });

      // Mettre a jour Organization.planId
      await tx.organization.update({
        where: { id: organizationId },
        data: { planId },
      });
    });

    await this.auditLog.log({
      organizationId,
      event: 'payment_succeeded',
      payload: {
        fwTransactionId,
        fwSubscriptionId,
        amountPaid,
        currency,
      },
    });

    this.logger.log(`Paiement FW reussi pour org ${organizationId} (plan ${planId})`);
  }

  /**
   * subscription.cancelled
   * Abonnement annule cote Flutterwave → statut CANCELLED en DB.
   */
  private async handleSubscriptionCancelled(data: any) {
    const fwSubscriptionId: string | undefined = data?.id ? String(data.id) : undefined;

    if (!fwSubscriptionId) return;

    const sub = await this.prisma.billingSubscription.findUnique({
      where: { fwSubscriptionId },
    });

    if (!sub) {
      this.logger.warn(`Abonnement FW introuvable en DB : ${fwSubscriptionId}`);
      return;
    }

    await this.prisma.billingSubscription.update({
      where: { fwSubscriptionId },
      data: {
        status: BillingStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    await this.auditLog.log({
      organizationId: sub.organizationId,
      event: 'subscription_cancelled',
      payload: {
        fwSubscriptionId,
        cancelledAt: new Date().toISOString(),
      },
    });

    // Alerter le proprietaire par email si paiement echoue => annulation automatique
    const org = await this.prisma.organization.findUnique({
      where: { id: sub.organizationId },
      include: { owner: { select: { email: true, firstName: true } } },
    });

    if (org?.owner?.email) {
      try {
        await this.mailer.sendPaymentFailedAlert(
          org.owner.email,
          org.owner.firstName ?? org.name,
          0,
          'XOF',
        );
      } catch (err) {
        this.logger.error('Echec envoi email subscription_cancelled', err);
      }
    }

    this.logger.log(`Abonnement FW annule pour org ${sub.organizationId}`);
  }
}
