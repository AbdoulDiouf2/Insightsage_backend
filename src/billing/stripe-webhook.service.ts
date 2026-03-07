import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { MailerService } from '../mailer/mailer.service';
import { BillingStatus } from '@prisma/client';

/**
 * Retourne { start, end } en Date depuis un Subscription Stripe.
 * Stripe API 2026-02-25.clover : current_period_start/end sont sur items.data[0].current_period
 * On tombe en fallback sur le champ top-level via cast any (backward compat).
 */
function getSubPeriod(sub: Stripe.Subscription): { start: Date; end: Date } {
  const item = sub.items?.data[0] as any;
  const startTs: number = item?.current_period?.start ?? (sub as any).current_period_start ?? 0;
  const endTs: number   = item?.current_period?.end   ?? (sub as any).current_period_end   ?? 0;
  return { start: new Date(startTs * 1000), end: new Date(endTs * 1000) };
}

/**
 * Retourne l'ID de souscription depuis une Invoice Stripe.
 * Stripe API 2026-02-25.clover : invoice.subscription a ete supprime.
 * Le champ est maintenant sur invoice.parent.subscription_details.subscription (cast any).
 */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const inv = invoice as any;
  const sub = inv.subscription ?? inv.parent?.subscription_details?.subscription;
  if (!sub) return undefined;
  return typeof sub === 'string' ? sub : sub.id;
}

// Mapping statut Stripe → enum BillingStatus Prisma
const STRIPE_STATUS_MAP: Record<string, BillingStatus> = {
  trialing: BillingStatus.TRIALING,
  active: BillingStatus.ACTIVE,
  past_due: BillingStatus.PAST_DUE,
  canceled: BillingStatus.CANCELLED,
  unpaid: BillingStatus.UNPAID,
  paused: BillingStatus.PAUSED,
};

@Injectable()
export class StripeWebhookService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLog: AuditLogService,
    private readonly mailer: MailerService,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY')!, {
      apiVersion: '2026-02-25.clover',
    });
  }

  /**
   * Verifie la signature Stripe et construit l'objet Event.
   * Lance BadRequestException si la signature est invalide (tentative de fraude).
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new BadRequestException('Webhook secret non configure.');
    }

    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      throw new BadRequestException('Signature Stripe invalide.');
    }
  }

  /**
   * Point d'entree principal : route chaque evenement Stripe vers son handler.
   */
  async handleEvent(event: Stripe.Event): Promise<void> {
    this.logger.log(`Stripe webhook recu : ${event.type} [${event.id}]`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        this.logger.debug(`Evenement Stripe non traite : ${event.type}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Handlers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * checkout.session.completed
   * Le client a paye avec succes → on cree l'abonnement en DB.
   */
  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const organizationId = session.metadata?.organizationId;
    const planId = session.metadata?.planId;

    if (!organizationId || !planId || !session.subscription) {
      this.logger.warn('checkout.session.completed : metadata manquants', { session });
      return;
    }

    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;

    // Recuperer les details de l'abonnement Stripe
    const stripeSub = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);

    const subPeriod = getSubPeriod(stripeSub);

    await this.prisma.$transaction(async (tx) => {
      // Creer ou mettre a jour BillingSubscription
      await tx.billingSubscription.upsert({
        where: { organizationId },
        create: {
          organizationId,
          customerId: await this.ensureBillingCustomer(tx, organizationId, session.customer as string),
          stripeSubscriptionId,
          planId,
          status: STRIPE_STATUS_MAP[stripeSub.status] ?? BillingStatus.ACTIVE,
          currentPeriodStart: subPeriod.start,
          currentPeriodEnd: subPeriod.end,
          trialEndsAt: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
        },
        update: {
          stripeSubscriptionId,
          planId,
          status: STRIPE_STATUS_MAP[stripeSub.status] ?? BillingStatus.ACTIVE,
          currentPeriodStart: subPeriod.start,
          currentPeriodEnd: subPeriod.end,
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
      event: 'subscription_created',
      payload: { planId, stripeSubscriptionId, sessionId: session.id },
    });

    this.logger.log(`Abonnement active pour org ${organizationId} (plan ${planId})`);
  }

  /**
   * invoice.payment_succeeded
   * Renouvellement mensuel reussi → on met a jour les dates + on enregistre la facture.
   */
  private async handlePaymentSucceeded(invoice: Stripe.Invoice) {
    const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);

    if (!stripeSubscriptionId) return;

    const sub = await this.prisma.billingSubscription.findUnique({
      where: { stripeSubscriptionId },
    });

    if (!sub) {
      this.logger.warn(`Abonnement introuvable pour sub Stripe : ${stripeSubscriptionId}`);
      return;
    }

    // Recuperer les nouvelles dates depuis Stripe
    const stripeSub = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
    const subPeriod = getSubPeriod(stripeSub);

    await this.prisma.$transaction(async (tx) => {
      // Mettre a jour l'abonnement
      await tx.billingSubscription.update({
        where: { stripeSubscriptionId },
        data: {
          status: BillingStatus.ACTIVE,
          currentPeriodStart: subPeriod.start,
          currentPeriodEnd: subPeriod.end,
          cancelAtPeriodEnd: false,
        },
      });

      // Enregistrer la facture
      await tx.billingInvoice.upsert({
        where: { stripeInvoiceId: invoice.id },
        create: {
          organizationId: sub.organizationId,
          subscriptionId: sub.id,
          stripeInvoiceId: invoice.id,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          status: invoice.status ?? 'paid',
          pdfUrl: invoice.invoice_pdf,
          hostedUrl: invoice.hosted_invoice_url,
          paidAt: invoice.status_transitions?.paid_at
            ? new Date(invoice.status_transitions.paid_at * 1000)
            : new Date(),
        },
        update: {
          status: invoice.status ?? 'paid',
          pdfUrl: invoice.invoice_pdf,
          hostedUrl: invoice.hosted_invoice_url,
        },
      });
    });

    await this.auditLog.log({
      organizationId: sub.organizationId,
      event: 'payment_succeeded',
      payload: {
        stripeInvoiceId: invoice.id,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
      },
    });
  }

  /**
   * invoice.payment_failed
   * Paiement echoue → statut PAST_DUE + email d'alerte.
   */
  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);

    if (!stripeSubscriptionId) return;

    const sub = await this.prisma.billingSubscription.findUnique({
      where: { stripeSubscriptionId },
    });

    if (!sub) return;

    await this.prisma.billingSubscription.update({
      where: { stripeSubscriptionId },
      data: { status: BillingStatus.PAST_DUE },
    });

    await this.auditLog.log({
      organizationId: sub.organizationId,
      event: 'payment_failed',
      payload: {
        stripeInvoiceId: invoice.id,
        amountDue: invoice.amount_due,
        currency: invoice.currency,
        nextPaymentAttempt: invoice.next_payment_attempt,
      },
    });

    // Recuperer l'email du proprietaire pour l'alerter
    const org = await this.prisma.organization.findUnique({
      where: { id: sub.organizationId },
      include: { owner: { select: { email: true, firstName: true } } },
    });

    if (org?.owner?.email) {
      try {
        await this.mailer.sendPaymentFailedAlert(
          org.owner.email,
          org.owner.firstName ?? org.name,
          invoice.amount_due,
          invoice.currency.toUpperCase(),
        );
      } catch (err) {
        this.logger.error('Echec envoi email payment_failed', err);
      }
    }

    this.logger.warn(`Paiement echoue pour org ${sub.organizationId}`);
  }

  /**
   * customer.subscription.updated
   * Changement de plan, de statut ou de dates → synchronisation DB.
   */
  private async handleSubscriptionUpdated(stripeSub: Stripe.Subscription) {
    const organizationId = stripeSub.metadata?.organizationId;
    const planId = stripeSub.metadata?.planId;

    const sub = await this.prisma.billingSubscription.findUnique({
      where: { stripeSubscriptionId: stripeSub.id },
    });

    if (!sub) return;

    const subPeriod = getSubPeriod(stripeSub);
    const updateData: Record<string, any> = {
      status: STRIPE_STATUS_MAP[stripeSub.status] ?? sub.status,
      currentPeriodStart: subPeriod.start,
      currentPeriodEnd: subPeriod.end,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    };

    if (planId && planId !== sub.planId) {
      updateData.planId = planId;
    }

    await this.prisma.billingSubscription.update({
      where: { stripeSubscriptionId: stripeSub.id },
      data: updateData,
    });

    // Si le plan a change, mettre a jour Organization.planId
    if (planId && planId !== sub.planId) {
      await this.prisma.organization.update({
        where: { id: sub.organizationId },
        data: { planId },
      });
    }

    await this.auditLog.log({
      organizationId: sub.organizationId,
      event: 'subscription_updated',
      payload: {
        stripeSubscriptionId: stripeSub.id,
        newStatus: stripeSub.status,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      },
    });
  }

  /**
   * customer.subscription.deleted
   * Abonnement definitivement annule → statut CANCELLED en DB.
   */
  private async handleSubscriptionDeleted(stripeSub: Stripe.Subscription) {
    const sub = await this.prisma.billingSubscription.findUnique({
      where: { stripeSubscriptionId: stripeSub.id },
    });

    if (!sub) return;

    await this.prisma.billingSubscription.update({
      where: { stripeSubscriptionId: stripeSub.id },
      data: {
        status: BillingStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    await this.auditLog.log({
      organizationId: sub.organizationId,
      event: 'subscription_cancelled',
      payload: {
        stripeSubscriptionId: stripeSub.id,
        cancelledAt: new Date().toISOString(),
      },
    });

    this.logger.log(`Abonnement annule pour org ${sub.organizationId}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helper interne
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Assure qu'un BillingCustomer existe en DB et retourne son ID.
   */
  private async ensureBillingCustomer(
    tx: any,
    organizationId: string,
    stripeCustomerId: string,
  ): Promise<string> {
    const existing = await tx.billingCustomer.findUnique({
      where: { organizationId },
    });

    if (existing) return existing.id;

    // Recuperer l'email depuis le customer Stripe
    const stripeCustomer = await this.stripe.customers.retrieve(stripeCustomerId);
    const email =
      !stripeCustomer.deleted && (stripeCustomer as Stripe.Customer).email
        ? (stripeCustomer as Stripe.Customer).email!
        : `org-${organizationId}@cockpit.internal`;

    const created = await tx.billingCustomer.create({
      data: {
        organizationId,
        stripeCustomerId,
        email,
      },
    });

    return created.id;
  }
}
