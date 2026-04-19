import { Controller, Get, Post, Patch, Delete, Query, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WidgetsService } from './widgets.service';
import { OrganizationId, RequirePermissions } from '../auth/decorators';
import { PermissionsGuard } from '../auth/guards';
import {
  CreateKpiDefinitionDto,
  UpdateKpiDefinitionDto,
  CreateWidgetTemplateDto,
  UpdateWidgetTemplateDto,
  CreateKpiPackDto,
  UpdateKpiPackDto,
} from '../admin/dto/kpi-store.dto';

@ApiTags('Widget Store')
@ApiBearerAuth()
@Controller('widget-store')
@UseGuards(PermissionsGuard)
export class WidgetsController {
  constructor(private readonly widgetsService: WidgetsService) {}

  @Get()
  @RequirePermissions({ action: 'read', resource: 'widgets' })
  @ApiOperation({
    summary: 'Catalogue Widget Store',
    description:
      "Retourne les KPI packs disponibles selon le plan d'abonnement de l'organisation, les KPI definitions et les widget templates. Filtrable par profil métier.",
  })
  @ApiQuery({
    name: 'profile',
    required: false,
    description: 'Profil métier pour filtrer les packs (daf, dg, controller, manager, analyst)',
    example: 'daf',
  })
  getStore(
    @OrganizationId() organizationId: string,
    @Query('profile') profile?: string,
  ) {
    return this.widgetsService.getStore(organizationId, profile);
  }

  // ─── KPI Definitions ───────────────────────────────────────────────────────

  @Post('kpi-definitions')
  @RequirePermissions({ action: 'write', resource: 'widgets' })
  @ApiOperation({ summary: 'Créer une KPI Definition' })
  createKpiDefinition(@Body() dto: CreateKpiDefinitionDto) {
    return this.widgetsService.createKpiDefinition(dto);
  }

  @Patch('kpi-definitions/:id')
  @RequirePermissions({ action: 'write', resource: 'widgets' })
  @ApiOperation({ summary: 'Modifier une KPI Definition' })
  updateKpiDefinition(@Param('id') id: string, @Body() dto: UpdateKpiDefinitionDto) {
    return this.widgetsService.updateKpiDefinition(id, dto);
  }

  @Delete('kpi-definitions/:id')
  @RequirePermissions({ action: 'write', resource: 'widgets' })
  @ApiOperation({ summary: 'Activer/désactiver une KPI Definition' })
  toggleKpiDefinition(@Param('id') id: string) {
    return this.widgetsService.toggleKpiDefinition(id);
  }

  // ─── Widget Templates ──────────────────────────────────────────────────────

  @Post('widget-templates')
  @RequirePermissions({ action: 'write', resource: 'widgets' })
  @ApiOperation({ summary: 'Créer un Widget Template' })
  createWidgetTemplate(@Body() dto: CreateWidgetTemplateDto) {
    return this.widgetsService.createWidgetTemplate(dto);
  }

  @Patch('widget-templates/:id')
  @RequirePermissions({ action: 'write', resource: 'widgets' })
  @ApiOperation({ summary: 'Modifier un Widget Template' })
  updateWidgetTemplate(@Param('id') id: string, @Body() dto: UpdateWidgetTemplateDto) {
    return this.widgetsService.updateWidgetTemplate(id, dto);
  }

  @Delete('widget-templates/:id')
  @RequirePermissions({ action: 'write', resource: 'widgets' })
  @ApiOperation({ summary: 'Activer/désactiver un Widget Template' })
  toggleWidgetTemplate(@Param('id') id: string) {
    return this.widgetsService.toggleWidgetTemplate(id);
  }

  // ─── KPI Packs ────────────────────────────────────────────────────────────

  @Post('kpi-packs')
  @RequirePermissions({ action: 'write', resource: 'widgets' })
  @ApiOperation({ summary: 'Créer un KPI Pack' })
  createKpiPack(@Body() dto: CreateKpiPackDto) {
    return this.widgetsService.createKpiPack(dto);
  }

  @Patch('kpi-packs/:id')
  @RequirePermissions({ action: 'write', resource: 'widgets' })
  @ApiOperation({ summary: 'Modifier un KPI Pack' })
  updateKpiPack(@Param('id') id: string, @Body() dto: UpdateKpiPackDto) {
    return this.widgetsService.updateKpiPack(id, dto);
  }

  @Delete('kpi-packs/:id')
  @RequirePermissions({ action: 'write', resource: 'widgets' })
  @ApiOperation({ summary: 'Activer/désactiver un KPI Pack' })
  toggleKpiPack(@Param('id') id: string) {
    return this.widgetsService.toggleKpiPack(id);
  }
}
