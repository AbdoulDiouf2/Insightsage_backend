import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { DashboardsService } from './dashboards.service';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import { AddWidgetDto } from './dto/add-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';
import {
  CurrentUser,
  OrganizationId,
  RequirePermissions,
} from '../auth/decorators';
import { PermissionsGuard } from '../auth/guards';

@ApiTags('Dashboards')
@ApiBearerAuth()
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  // ─── KPI Packs (placé avant :id pour éviter les conflits de route) ────────

  @Get('/kpi-packs')
  @RequirePermissions({ action: 'read', resource: 'dashboards' })
  @UseGuards(PermissionsGuard)
  @ApiOperation({
    summary: 'Lister les packs KPI disponibles',
    description:
      'Retourne les packs de KPIs préconfigurés avec les détails des KPI definitions. Filtrable par profil métier.',
  })
  @ApiQuery({
    name: 'profile',
    required: false,
    description: 'Profil métier (daf, dg, controller, manager, analyst)',
    example: 'daf',
  })
  getKpiPacks(@Query('profile') profile?: string) {
    return this.dashboardsService.getKpiPacks(profile);
  }

  // ─── Dashboards CRUD ──────────────────────────────────────────────────────

  @Get('me')
  @RequirePermissions({ action: 'read', resource: 'dashboards' })
  @UseGuards(PermissionsGuard)
  @ApiOperation({
    summary: 'Récupérer le cockpit personnel',
    description:
      "Retourne le dashboard par défaut de l'utilisateur courant (isDefault=true), ou le premier dashboard disponible.",
  })
  findMine(
    @CurrentUser('id') userId: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.dashboardsService.findMine(userId, organizationId);
  }

  @Get()
  @RequirePermissions({ action: 'read', resource: 'dashboards' })
  @UseGuards(PermissionsGuard)
  @ApiOperation({
    summary: "Lister tous les dashboards de l'organisation",
    description:
      "Retourne tous les dashboards de l'organisation avec le nombre de widgets et les infos de l'owner.",
  })
  findAll(@OrganizationId() organizationId: string) {
    return this.dashboardsService.findAll(organizationId);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', resource: 'dashboards' })
  @UseGuards(PermissionsGuard)
  @ApiOperation({
    summary: 'Récupérer un dashboard avec ses widgets',
    description: "Retourne le détail d'un dashboard incluant tous ses widgets.",
  })
  @ApiParam({ name: 'id', description: 'ID du dashboard' })
  findOne(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.dashboardsService.findOne(id, organizationId);
  }

  @Post()
  @RequirePermissions({ action: 'write', resource: 'dashboards' })
  @UseGuards(PermissionsGuard)
  @ApiOperation({
    summary: 'Créer un nouveau dashboard',
    description:
      "Crée un dashboard pour l'utilisateur courant. Si isDefault=true, les autres dashboards de l'utilisateur sont désactivés comme default.",
  })
  create(
    @CurrentUser('id') userId: string,
    @OrganizationId() organizationId: string,
    @Body() dto: CreateDashboardDto,
  ) {
    return this.dashboardsService.create(userId, organizationId, dto);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'write', resource: 'dashboards' })
  @UseGuards(PermissionsGuard)
  @ApiOperation({
    summary: 'Modifier un dashboard',
    description: 'Renommer le dashboard, mettre à jour le layout ou changer le dashboard par défaut.',
  })
  @ApiParam({ name: 'id', description: 'ID du dashboard' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @OrganizationId() organizationId: string,
    @Body() dto: UpdateDashboardDto,
  ) {
    return this.dashboardsService.update(id, userId, organizationId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions({ action: 'delete', resource: 'dashboards' })
  @UseGuards(PermissionsGuard)
  @ApiOperation({
    summary: 'Supprimer un dashboard',
    description:
      'Supprime le dashboard et tous ses widgets associés. Seul le propriétaire peut supprimer son dashboard.',
  })
  @ApiParam({ name: 'id', description: 'ID du dashboard' })
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.dashboardsService.remove(id, userId, organizationId);
  }

  // ─── Widgets dans un dashboard ────────────────────────────────────────────

  @Post(':id/widgets')
  @ApiTags('Widget Management')
  @RequirePermissions({ action: 'write', resource: 'dashboards' })
  @UseGuards(PermissionsGuard)
  @ApiOperation({
    summary: 'Ajouter un widget au dashboard',
    description:
      "Ajoute un widget (KPI, graphique ou tableau) au dashboard. Vérifie la limite maxWidgets du plan d'abonnement.",
  })
  @ApiParam({ name: 'id', description: 'ID du dashboard' })
  addWidget(
    @Param('id') dashboardId: string,
    @CurrentUser('id') userId: string,
    @OrganizationId() organizationId: string,
    @Body() dto: AddWidgetDto,
  ) {
    return this.dashboardsService.addWidget(dashboardId, userId, organizationId, dto);
  }

  @Patch(':id/widgets/:widgetId')
  @ApiTags('Widget Management')
  @RequirePermissions({ action: 'write', resource: 'dashboards' })
  @UseGuards(PermissionsGuard)
  @ApiOperation({
    summary: 'Modifier un widget du dashboard',
    description: 'Met à jour la configuration, la position, le type de visualisation ou le statut actif/inactif du widget.',
  })
  @ApiParam({ name: 'id', description: 'ID du dashboard' })
  @ApiParam({ name: 'widgetId', description: 'ID du widget' })
  updateWidget(
    @Param('id') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @CurrentUser('id') userId: string,
    @OrganizationId() organizationId: string,
    @Body() dto: UpdateWidgetDto,
  ) {
    return this.dashboardsService.updateWidget(
      widgetId,
      dashboardId,
      userId,
      organizationId,
      dto,
    );
  }

  @Delete(':id/widgets/:widgetId')
  @ApiTags('Widget Management')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions({ action: 'write', resource: 'dashboards' })
  @UseGuards(PermissionsGuard)
  @ApiOperation({
    summary: 'Supprimer un widget du dashboard',
    description: 'Supprime définitivement un widget du dashboard.',
  })
  @ApiParam({ name: 'id', description: 'ID du dashboard' })
  @ApiParam({ name: 'widgetId', description: 'ID du widget' })
  removeWidget(
    @Param('id') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @CurrentUser('id') userId: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.dashboardsService.removeWidget(
      widgetId,
      dashboardId,
      userId,
      organizationId,
    );
  }
}
