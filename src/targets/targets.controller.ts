import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { PeriodType, TargetScenario } from '@prisma/client';
import { TargetsService } from './targets.service';
import { CreateTargetDto } from './dto/create-target.dto';
import { UpdateTargetDto } from './dto/update-target.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions, OrganizationId, CurrentUser } from '../auth/decorators';

@ApiTags('Targets')
@Controller('targets')
@ApiBearerAuth()
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'targets' })
  @ApiOperation({
    summary: 'Lister les objectifs KPI de l\'organisation',
    description:
      'Retourne les objectifs filtrables par KPI, annee, type de periode et scenario. ' +
      'Chaque objectif inclut les details du KPI (unite, direction).',
  })
  @ApiQuery({ name: 'kpiKey', required: false, description: 'Filtrer par KPI (ex: ca_ht)' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Filtrer par annee (ex: 2025)' })
  @ApiQuery({ name: 'periodType', required: false, enum: PeriodType, description: 'Filtrer par type de periode' })
  @ApiQuery({ name: 'scenario', required: false, enum: TargetScenario, description: 'Filtrer par scenario budgetaire' })
  @ApiResponse({ status: 200, description: 'Liste des objectifs.' })
  findAll(
    @OrganizationId() organizationId: string,
    @Query('kpiKey') kpiKey?: string,
    @Query('year') year?: string,
    @Query('periodType') periodType?: PeriodType,
    @Query('scenario') scenario?: TargetScenario,
  ) {
    return this.targetsService.findAll(organizationId, {
      kpiKey,
      year: year ? parseInt(year, 10) : undefined,
      periodType,
      scenario,
    });
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'targets' })
  @ApiOperation({ summary: 'Recuperer les details d\'un objectif par son ID' })
  @ApiResponse({ status: 200, description: 'Detail de l\'objectif.' })
  @ApiResponse({ status: 404, description: 'Objectif introuvable.' })
  findOne(
    @OrganizationId() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.targetsService.findOne(id, organizationId);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'targets' })
  @ApiOperation({
    summary: 'Creer ou remplacer un objectif KPI',
    description:
      'Si un objectif existe deja pour la combinaison org + kpi + periode + scenario, ' +
      'il est automatiquement mis a jour (upsert). Aucun doublon ne peut exister.',
  })
  @ApiResponse({ status: 201, description: 'Objectif cree ou mis a jour.' })
  @ApiResponse({ status: 400, description: 'Donnees invalides (KPI inconnu, periodIndex hors plage, deltaReference manquant).' })
  create(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTargetDto,
  ) {
    return this.targetsService.create(organizationId, dto, userId);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'targets' })
  @ApiOperation({
    summary: 'Modifier un objectif existant',
    description:
      'Permet de modifier la valeur, le type de valeur, la reference delta, l\'annee ou le label. ' +
      'Seuls les champs fournis sont mis a jour.',
  })
  @ApiResponse({ status: 200, description: 'Objectif mis a jour.' })
  @ApiResponse({ status: 404, description: 'Objectif introuvable.' })
  update(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTargetDto,
  ) {
    return this.targetsService.update(id, organizationId, dto, userId);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'targets' })
  @ApiOperation({ summary: 'Supprimer un objectif KPI' })
  @ApiResponse({ status: 200, description: 'Objectif supprime.' })
  @ApiResponse({ status: 404, description: 'Objectif introuvable.' })
  remove(
    @OrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.targetsService.remove(id, organizationId, userId);
  }
}
