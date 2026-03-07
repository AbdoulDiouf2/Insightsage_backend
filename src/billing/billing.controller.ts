import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { FlutterwaveWebhookService } from './flutterwave-webhook.service';
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
    private readonly fwWebhookService: FlutterwaveWebhookService,
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
      'Retourne toutes les factures Flutterwave de l\'organisation triees par date decroissante.',
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
    summary: 'Creer un lien de paiement Flutterwave',
    description:
      'Cree un lien de paiement Flutterwave Hosted Payment et retourne l\'URL vers laquelle ' +
      'rediriger le client. Apres paiement, Flutterwave appelle le webhook /billing/webhook ' +
      'pour activer l\'abonnement.',
  })
  @ApiResponse({ status: 201, description: 'Lien de paiement cree — retourne { url }.' })
  @ApiResponse({ status: 400, description: 'Plan non configure pour le paiement en ligne.' })
  @ApiResponse({ status: 404, description: 'Plan introuvable.' })
  createCheckout(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckoutSession(organizationId, userId, dto);
  }

  @Post('cancel')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'billing' })
  @ApiOperation({
    summary: 'Annuler l\'abonnement',
    description:
      'Par defaut (immediately=false) : l\'abonnement est programme pour etre annule ' +
      'a la fin de la periode en cours — l\'acces reste actif jusqu\'a cette date. ' +
      'Si immediately=true : l\'abonnement est coupe immediatement via l\'API Flutterwave.',
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
  // Webhook Flutterwave (Public — verifie par secret hash)
  // ──────────────────────────────────────────────────────────────────────────

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook Flutterwave (usage interne)',
    description:
      'Endpoint appele directement par Flutterwave lors d\'evenements de paiement. ' +
      'Ne pas appeler manuellement. Le secret hash est verifie via le header "verif-hash".',
  })
  @ApiResponse({ status: 200, description: 'Evenement traite.' })
  @ApiResponse({ status: 401, description: 'Signature invalide.' })
  async handleWebhook(
    @Headers('verif-hash') signature: string,
    @Body() payload: any,
  ) {
    if (!this.fwWebhookService.verifyWebhook(signature)) {
      throw new UnauthorizedException('Signature Flutterwave invalide.');
    }

    await this.fwWebhookService.handleEvent(payload);
    return { received: true };
  }
}
