import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Get,
  Patch,
  Delete,
  Param,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateClientDto } from './dto/create-client.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminUpdateOrganizationDto } from './dto/update-organization.dto';
import { AdminUpdateUserDto } from './dto/update-user.dto';
import { CreateSubscriptionPlanDto, UpdateSubscriptionPlanDto } from './dto/subscription-plan.dto';
import {
  CreateKpiDefinitionDto,
  UpdateKpiDefinitionDto,
  CreateWidgetTemplateDto,
  UpdateWidgetTemplateDto,
  CreateKpiPackDto,
  UpdateKpiPackDto,
} from './dto/kpi-store.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions, CurrentUser } from '../auth/decorators';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(PermissionsGuard)
@RequirePermissions({ action: 'manage', resource: 'all' }) // Only InsightSage developers/superadmins
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) { }

  @Get('dashboard-stats')
  @ApiOperation({ summary: 'Get overall system statistics for dashboard' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Post('clients')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Onboard a new client organization and its root DAF',
  })
  @ApiResponse({ status: 201, description: 'Client created successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires superadmin role',
  })
  async createClient(@Body() dto: CreateClientDto) {
    return this.adminService.createClientAccount(dto);
  }

  // --- Organizations Management ---

  @Get('organizations')
  @ApiOperation({ summary: 'List all organizations (SuperAdmin only)' })
  async findAllOrganizations() {
    return this.adminService.findAllOrganizations();
  }

  @Get('organizations/:id')
  @ApiOperation({ summary: 'Get organization details by ID' })
  async findOrganizationById(@Param('id') id: string) {
    return this.adminService.findOrganizationById(id);
  }

  @Patch('organizations/:id')
  @ApiOperation({ summary: 'Update organization details' })
  async updateOrganization(
    @Param('id') id: string,
    @CurrentUser('id') adminUserId: string,
    @Body() dto: AdminUpdateOrganizationDto,
  ) {
    return this.adminService.updateOrganization(id, dto, adminUserId);
  }

  @Delete('organizations/:id')
  @ApiOperation({ summary: 'Delete an organization and all its data' })
  async deleteOrganization(
    @Param('id') id: string,
    @CurrentUser('id') adminUserId: string,
  ) {
    return this.adminService.deleteOrganization(id, adminUserId);
  }

  // --- Users Management ---

  @Get('users')
  @ApiOperation({ summary: 'List all users across all organizations' })
  async findAllUsers() {
    return this.adminService.findAllUsers();
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get details of a specific user (SuperAdmin)' })
  async findUserById(@Param('id') id: string) {
    return this.adminService.findUserById(id);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update user details' })
  async updateUser(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Directly create a user in an organization (SuperAdmin)' })
  async createUser(@Body() dto: CreateUserDto) {
    return this.adminService.createUser(dto);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete a user' })
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser('id') adminUserId: string,
  ) {
    return this.adminService.deleteUser(id, adminUserId);
  }

  // --- Audit Logs ---

  @Get('audit-logs')
  @ApiOperation({ summary: 'View system-wide audit logs' })
  async findAllAuditLogs() {
    return this.adminService.findAllAuditLogs();
  }

  @Get('invitations')
  @ApiOperation({ summary: 'List all invitations across the platform' })
  async findAllInvitations() {
    return this.adminService.findAllInvitations();
  }

  // --- Subscription Plans Management ---

  @Get('subscription-plans')
  @ApiOperation({
    summary: 'Lister tous les plans d\'abonnement (actifs et inactifs)',
    description: 'Réservé aux superadmins. Retourne tous les plans avec le nombre d\'organisations associées.',
  })
  async findAllSubscriptionPlans() {
    return this.adminService.findAllSubscriptionPlans();
  }

  @Get('subscription-plans/:id')
  @ApiOperation({
    summary: 'Récupérer un plan d\'abonnement par ID',
    description: 'Réservé aux superadmins.',
  })
  async findSubscriptionPlanById(@Param('id') id: string) {
    return this.adminService.findSubscriptionPlanById(id);
  }

  @Post('subscription-plans')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un nouveau plan d\'abonnement',
    description: 'Permet d\'ajouter un nouveau palier sans redéploiement.',
  })
  async createSubscriptionPlan(@Body() dto: CreateSubscriptionPlanDto) {
    return this.adminService.createSubscriptionPlan(dto);
  }

  @Patch('subscription-plans/:id')
  @ApiOperation({
    summary: 'Modifier un plan d\'abonnement',
    description: 'Modifier prix, limites, feature flags ou informations Stripe sans redéploiement.',
  })
  async updateSubscriptionPlan(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionPlanDto,
  ) {
    return this.adminService.updateSubscriptionPlan(id, dto);
  }

  @Delete('subscription-plans/:id')
  @ApiOperation({
    summary: 'Désactiver un plan d\'abonnement',
    description: 'Désactive le plan (isActive = false) sans supprimer les données.',
  })
  async deactivateSubscriptionPlan(@Param('id') id: string) {
    return this.adminService.deactivateSubscriptionPlan(id);
  }

  // ─── Billing — Vue SuperAdmin ─────────────────────────────────────────────

  @Get('billing/subscriptions')
  @ApiOperation({
    summary: 'Lister les abonnements Flutterwave de toutes les organisations',
    description:
      'Retourne tous les abonnements actifs avec leur statut (ACTIVE, PAST_DUE, CANCELLED...), ' +
      'le plan souscrit, la derniere facture et un resume des statuts. ' +
      'Inclut egalement les organisations sans abonnement.',
  })
  @ApiResponse({ status: 200, description: 'Liste des abonnements + resume.' })
  async findAllBillingSubscriptions() {
    return this.adminService.findAllBillingSubscriptions();
  }

  @Get('billing/subscriptions/:orgId')
  @ApiParam({ name: 'orgId', description: 'ID de l\'organisation' })
  @ApiOperation({
    summary: 'Detail de l\'abonnement d\'une organisation',
    description:
      'Retourne l\'abonnement Flutterwave complet d\'une organisation : plan, statut, ' +
      'dates de periode, customer Flutterwave et historique complet des factures.',
  })
  @ApiResponse({ status: 200, description: 'Detail abonnement + factures.' })
  @ApiResponse({ status: 404, description: 'Organisation introuvable.' })
  async findBillingSubscriptionByOrg(@Param('orgId') orgId: string) {
    return this.adminService.findBillingSubscriptionByOrg(orgId);
  }

  // ─── KPI Definitions Management ───────────────────────────────────────────

  @Get('kpi-definitions')
  @ApiOperation({
    summary: 'Lister toutes les KPI Definitions',
    description: 'Retourne toutes les définitions de KPI (actives et inactives), triées par catégorie.',
  })
  async findAllKpiDefinitions() {
    return this.adminService.findAllKpiDefinitions();
  }

  @Get('kpi-definitions/:id')
  @ApiOperation({ summary: 'Récupérer une KPI Definition par ID' })
  @ApiParam({ name: 'id', description: 'ID de la KPI Definition' })
  async findKpiDefinitionById(@Param('id') id: string) {
    return this.adminService.findKpiDefinitionById(id);
  }

  @Post('kpi-definitions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer une nouvelle KPI Definition',
    description: 'La clé (key) doit être unique. Exemples : revenue_mom, dmp, ar_aging.',
  })
  async createKpiDefinition(@Body() dto: CreateKpiDefinitionDto) {
    return this.adminService.createKpiDefinition(dto);
  }

  @Patch('kpi-definitions/:id')
  @ApiOperation({ summary: 'Modifier une KPI Definition' })
  @ApiParam({ name: 'id', description: 'ID de la KPI Definition' })
  async updateKpiDefinition(
    @Param('id') id: string,
    @Body() dto: UpdateKpiDefinitionDto,
  ) {
    return this.adminService.updateKpiDefinition(id, dto);
  }

  @Delete('kpi-definitions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activer / Désactiver une KPI Definition',
    description: 'Toggle isActive (soft delete). Appeler à nouveau pour réactiver.',
  })
  @ApiParam({ name: 'id', description: 'ID de la KPI Definition' })
  async toggleKpiDefinition(@Param('id') id: string) {
    return this.adminService.toggleKpiDefinition(id);
  }

  // ─── Widget Templates Management ──────────────────────────────────────────

  @Get('widget-templates')
  @ApiOperation({
    summary: 'Lister tous les Widget Templates',
    description: 'Retourne tous les templates de widgets (actifs et inactifs).',
  })
  async findAllWidgetTemplates() {
    return this.adminService.findAllWidgetTemplates();
  }

  @Get('widget-templates/:id')
  @ApiOperation({ summary: 'Détail d\'un Widget Template' })
  @ApiParam({ name: 'id', description: 'ID UUID du Widget Template' })
  async findWidgetTemplateById(@Param('id') id: string) {
    return this.adminService.findWidgetTemplateById(id);
  }

  @Post('widget-templates')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un nouveau Widget Template',
    description: 'Le vizType doit être unique : card | bar | line | gauge | table.',
  })
  async createWidgetTemplate(@Body() dto: CreateWidgetTemplateDto) {
    return this.adminService.createWidgetTemplate(dto);
  }

  @Patch('widget-templates/:id')
  @ApiOperation({ summary: 'Modifier un Widget Template' })
  @ApiParam({ name: 'id', description: 'ID du Widget Template' })
  async updateWidgetTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateWidgetTemplateDto,
  ) {
    return this.adminService.updateWidgetTemplate(id, dto);
  }

  @Delete('widget-templates/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activer / Désactiver un Widget Template',
    description: 'Toggle isActive (soft delete). Appeler à nouveau pour réactiver.',
  })
  @ApiParam({ name: 'id', description: 'ID du Widget Template' })
  async toggleWidgetTemplate(@Param('id') id: string) {
    return this.adminService.toggleWidgetTemplate(id);
  }

  // ─── KPI Packs Management ─────────────────────────────────────────────────

  @Get('kpi-packs')
  @ApiOperation({
    summary: 'Lister tous les KPI Packs',
    description: 'Retourne tous les packs KPI (actifs et inactifs), triés par profil métier.',
  })
  async findAllKpiPacks() {
    return this.adminService.findAllKpiPacks();
  }

  @Get('kpi-packs/:id')
  @ApiOperation({ summary: 'Récupérer un KPI Pack par ID' })
  @ApiParam({ name: 'id', description: 'ID du KPI Pack' })
  async findKpiPackById(@Param('id') id: string) {
    return this.adminService.findKpiPackById(id);
  }

  @Post('kpi-packs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un nouveau KPI Pack',
    description: 'Le nom (name) doit être unique. Exemples : pack_daf, pack_dg.',
  })
  async createKpiPack(@Body() dto: CreateKpiPackDto) {
    return this.adminService.createKpiPack(dto);
  }

  @Patch('kpi-packs/:id')
  @ApiOperation({ summary: 'Modifier un KPI Pack (label, profil, clés KPI)' })
  @ApiParam({ name: 'id', description: 'ID du KPI Pack' })
  async updateKpiPack(
    @Param('id') id: string,
    @Body() dto: UpdateKpiPackDto,
  ) {
    return this.adminService.updateKpiPack(id, dto);
  }

  @Delete('kpi-packs/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activer / Désactiver un KPI Pack',
    description: 'Toggle isActive (soft delete). Appeler à nouveau pour réactiver.',
  })
  @ApiParam({ name: 'id', description: 'ID du KPI Pack' })
  async toggleKpiPack(@Param('id') id: string) {
    return this.adminService.toggleKpiPack(id);
  }

  // ─── NLQ Management ───────────────────────────────────────────────────────

  @Get('nlq-intents')
  @ApiOperation({
    summary: 'Lister toutes les intentions NLQ',
    description: 'Retourne toutes les intentions NLQ définies dans le système.',
  })
  async findAllNlqIntents() {
    return this.adminService.findAllNlqIntents();
  }

  @Get('nlq-intents/:id')
  @ApiOperation({ summary: 'Récupérer un NLQ Intent par ID' })
  @ApiParam({ name: 'id', description: 'ID de l\'intent (UUID)' })
  async findNlqIntentById(@Param('id') id: string) {
    return this.adminService.findNlqIntentById(id);
  }

  @Get('nlq-templates')
  @ApiOperation({
    summary: 'Lister tous les templates SQL NLQ',
    description: 'Retourne tous les templates SQL associés aux intentions NLQ.',
  })
  async findAllNlqTemplates() {
    return this.adminService.findAllNlqTemplates();
  }

  @Get('nlq-templates/:id')
  @ApiOperation({ summary: 'Récupérer un NLQ SQL Template par ID' })
  @ApiParam({ name: 'id', description: 'ID du template (UUID)' })
  async findNlqTemplateById(@Param('id') id: string) {
    return this.adminService.findNlqTemplateById(id);
  }

  @Patch('nlq-templates/:id/toggle')
  @ApiOperation({ summary: 'Activer / désactiver un NLQ SQL Template' })
  @ApiParam({ name: 'id', description: 'ID UUID du NLQ Template' })
  async toggleNlqTemplate(@Param('id') id: string) {
    return this.adminService.toggleNlqTemplate(id);
  }

  @Get('nlq-sessions')
  @ApiOperation({
    summary: 'Lister les sessions NLQ (SuperAdmin)',
    description: 'Retourne les 500 dernières sessions NLQ avec organisation, utilisateur et intention détectée.',
  })
  async findAllNlqSessions() {
    return this.adminService.findAllNlqSessions();
  }

  @Get('nlq-sessions/:id')
  @ApiOperation({ summary: 'Détail complet d\'une session NLQ (SuperAdmin)' })
  @ApiParam({ name: 'id', description: 'ID UUID de la session NLQ' })
  async findNlqSessionById(@Param('id') id: string) {
    return this.adminService.findNlqSessionById(id);
  }

  // ─── Dashboards Management ────────────────────────────────────────────────

  @Get('dashboards')
  @ApiOperation({ summary: 'Lister tous les dashboards (SuperAdmin)' })
  async findAllDashboards() {
    return this.adminService.findAllDashboards();
  }

  @Get('dashboards/:id')
  @ApiOperation({ summary: 'Détail d\'un dashboard par ID (SuperAdmin)' })
  @ApiParam({ name: 'id', description: 'ID du dashboard' })
  async findDashboardById(@Param('id') id: string) {
    return this.adminService.findDashboardById(id);
  }

  @Delete('dashboards/:id')
  @ApiOperation({ summary: 'Supprimer un dashboard (SuperAdmin)' })
  @ApiParam({ name: 'id', description: 'ID du dashboard' })
  async deleteDashboard(
    @Param('id') id: string,
    @CurrentUser('id') adminUserId: string,
  ) {
    return this.adminService.deleteDashboard(id, adminUserId);
  }

  @Delete('agents/:id')
  @ApiOperation({ summary: 'Supprimer un agent (SuperAdmin)' })
  @ApiParam({ name: 'id', description: 'ID de l\'agent' })
  async deleteAgent(
    @Param('id') id: string,
    @CurrentUser('id') adminUserId: string,
  ) {
    return this.adminService.deleteAgent(id, adminUserId);
  }

  // ── System config ────────────────────────────────────────────────────────────

  @Get('system-config')
  @ApiOperation({ summary: 'Récupérer la configuration système globale' })
  async getSystemConfig() {
    return this.adminService.getSystemConfig();
  }

  @Patch('system-config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre à jour la configuration système globale' })
  async updateSystemConfig(@Body() body: Record<string, unknown>) {
    return this.adminService.updateSystemConfig(body as any);
  }
}
