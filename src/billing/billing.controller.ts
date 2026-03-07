import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions, OrganizationId, CurrentUser, Public } from '../auth/decorators';

@ApiTags('Billing')
@Controller('billing')
@ApiBearerAuth()
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly stripeWebhookService: StripeWebhookService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Lecture
  // ──────────────────────────────────────────────────────────────────────────

  @Get('subscription')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'billing' })
  @ApiOperation({
    summary: 'Statut de l\'abonnement actuel',
    description:
      'Retourne l\'abonnement en cours de l\'organisation : plan souscrit, statut, ' +
      'dates de la periode, annulation programmee.',
  })
  @ApiResponse({ status: 200, description: 'Statut de l\'abonnement.' })
  getSubscription(@OrganizationId() organizationId: string) {
    return this.billingService.getSubscription(organizationId);
  }

  @Get('invoices')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'billing' })
  @ApiOperation({
    summary: 'Historique des factures',
    description:
      'Retourne toutes les factures Stripe de l\'organisation triees par date decroissante. ' +
      'Inclut les liens PDF et URL de la page de facture hebergee par Stripe.',
  })
  @ApiResponse({ status: 200, description: 'Liste des factures.' })
  getInvoices(@OrganizationId() organizationId: string) {
    return this.billingService.getInvoices(organizationId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Actions
  // ──────────────────────────────────────────────────────────────────────────

  @Post('checkout')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'billing' })
  @ApiOperation({
    summary: 'Creer une session de paiement Stripe',
    description:
      'Cree une session Stripe Checkout et retourne l\'URL vers laquelle rediriger le client. ' +
      'Le client saisit sa carte directement sur la page Stripe securisee. ' +
      'Apres paiement, Stripe appelle le webhook /billing/webhook pour activer l\'abonnement.',
  })
  @ApiResponse({ status: 201, description: 'Session Checkout creee — retourne { url }.' })
  @ApiResponse({ status: 400, description: 'Plan non configure pour le paiement en ligne.' })
  @ApiResponse({ status: 404, description: 'Plan introuvable.' })
  createCheckout(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckoutSession(organizationId, userId, dto);
  }

  @Post('portal')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'billing' })
  @ApiOperation({
    summary: 'Ouvrir le portail client Stripe',
    description:
      'Cree une session Stripe Customer Portal et retourne l\'URL. ' +
      'Le client peut y modifier sa carte bancaire, consulter ses factures ' +
      'ou changer de plan sans intervention de votre equipe.',
  })
  @ApiResponse({ status: 201, description: 'Session Portal creee — retourne { url }.' })
  @ApiResponse({ status: 404, description: 'Aucun abonnement actif.' })
  createPortal(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.billingService.createPortalSession(organizationId, userId);
  }

  @Post('cancel')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'billing' })
  @ApiOperation({
    summary: 'Annuler l\'abonnement',
    description:
      'Par defaut (immediately=false) : l\'abonnement est programme pour etre annule ' +
      'a la fin de la periode en cours — l\'acces reste actif jusqu\'a cette date. ' +
      'Si immediately=true : l\'abonnement est coupe immediatement.',
  })
  @ApiResponse({ status: 200, description: 'Annulation enregistree.' })
  @ApiResponse({ status: 400, description: 'Abonnement deja annule.' })
  @ApiResponse({ status: 404, description: 'Aucun abonnement actif.' })
  cancelSubscription(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CancelSubscriptionDto,
  ) {
    return this.billingService.cancelSubscription(organizationId, userId, dto);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Webhook Stripe (Public — verifie par signature)
  // ──────────────────────────────────────────────────────────────────────────

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook Stripe (usage interne)',
    description:
      'Endpoint appele directement par Stripe lors d\'evenements de paiement. ' +
      'Ne pas appeler manuellement. La signature HMAC est verifiee pour chaque requete.',
  })
  @ApiResponse({ status: 200, description: 'Evenement traite.' })
  @ApiResponse({ status: 400, description: 'Signature invalide.' })
  async handleWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
  ) {
    // NestJS avec bodyParser parse le body en JSON par defaut.
    // Pour Stripe, on a besoin du body RAW (Buffer) pour verifier la signature.
    // Le module est configure avec rawBody: true dans billing.module.ts.
    const rawBody: Buffer = (req as any).rawBody;

    const event = this.stripeWebhookService.constructEvent(rawBody, signature);
    await this.stripeWebhookService.handleEvent(event);

    return { received: true };
  }
}
