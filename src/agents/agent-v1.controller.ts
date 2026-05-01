import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Headers,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AgentsService } from './agents.service';
import { AgentTokenGuard } from './guards/agent-token.guard';
import { CurrentAgent } from './decorators/current-agent.decorator';
import { ValidateAgentDto } from './dto/validate-agent.dto';
import { IngestDto } from './dto/ingest.dto';
import { HeartbeatV1Dto } from './dto/heartbeat-v1.dto';
import { Public, RequirePermissions, OrganizationId, CurrentUser } from '../auth/decorators';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Agent v1')
@Controller('v1/agent')
export class AgentV1Controller {
  constructor(private readonly agentsService: AgentsService) {}

  // ============================================================
  // ENDPOINTS AGENT → BACKEND (authentification par token agent)
  // ============================================================

  /**
   * Validation du token à l'installation (Step 5 installeur Electron).
   * Pas de JWT requis — le token agent est dans le body.
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Valider un token agent à l'installation",
    description:
      "Appelé par l'installeur Electron (Step 5). Vérifie le token, retourne les infos de l'organisation.",
  })
  @ApiResponse({ status: 200, description: 'Token valide ou invalide (champ valid)' })
  async validate(@Body() dto: ValidateAgentDto, @Ip() ip: string) {
    return this.agentsService.validateAgent(dto, ip);
  }

  /**
   * Réception d'un batch de données synchronisées.
   * Auth par Bearer token agent (AgentTokenGuard).
   */
  @Public()
  @UseGuards(AgentTokenGuard)
  @Throttle({ default: { ttl: 60000, limit: 500 } }) // ~1 ingest/7s par agent
  @Post('ingest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ingestion de données depuis une vue Sage 100',
    description:
      "Reçoit un batch de lignes extraites d'une vue SQL Sage 100. Stocke les métadonnées (AgentSyncBatch) et le dernier snapshot (AgentViewSnapshot).",
  })
  @ApiResponse({ status: 200, description: 'Batch accepté' })
  @ApiResponse({ status: 401, description: 'Token agent invalide' })
  async ingest(
    @CurrentAgent('id') agentId: string,
    @CurrentAgent('organizationId') organizationId: string,
    @Body() dto: IngestDto,
  ) {
    return this.agentsService.ingestData(agentId, organizationId, dto);
  }

  /**
   * Récupération de la configuration de synchronisation.
   * Auth par Bearer token agent.
   */
  @Public()
  @UseGuards(AgentTokenGuard)
  @Get('config')
  @ApiOperation({
    summary: "Configuration distante de l'agent",
    description:
      "Retourne les intervalles de synchronisation, les vues activées et les features du plan. Permet de modifier la config sans réinstaller l'agent.",
  })
  @ApiResponse({ status: 200, description: 'Configuration retournée' })
  async getConfig(
    @CurrentAgent('id') agentId: string,
    @CurrentAgent('organizationId') organizationId: string,
  ) {
    return this.agentsService.getAgentConfig(agentId, organizationId);
  }

  /**
   * Heartbeat v1 — signal de vie toutes les 5 minutes.
   * Auth par Bearer token agent. Retourne les commandes distantes en attente.
   */
  @Public()
  @UseGuards(AgentTokenGuard)
  @Throttle({ default: { ttl: 60000, limit: 120 } })
  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Signal de vie de l'agent (v1)",
    description:
      "Appelé toutes les 5 minutes. Met à jour lastSeen, transmet les commandes en attente (ex: FORCE_FULL_SYNC).",
  })
  @ApiResponse({ status: 200, description: '{ ok, serverTime, nextHeartbeat, commands[] }' })
  async heartbeat(
    @CurrentAgent('id') agentId: string,
    @CurrentAgent('organizationId') organizationId: string,
    @Body() dto: HeartbeatV1Dto,
  ) {
    return this.agentsService.heartbeatV1(agentId, organizationId, dto);
  }

  /**
   * Vérifie si une nouvelle version de l'agent est disponible.
   * Appelé par le ManagementDashboard Electron au démarrage.
   */
  @Public()
  @UseGuards(AgentTokenGuard)
  @Throttle({ default: { ttl: 300000, limit: 10 } }) // 10 checks / 5min
  @Get('check-update')
  @ApiOperation({
    summary: "Vérifier la disponibilité d'une mise à jour de l'agent",
    description:
      "Appelé par le dashboard de gestion Electron. Retourne hasUpdate + metadata si une version plus récente est disponible pour la plateforme win32.",
  })
  @ApiResponse({ status: 200, description: '{ hasUpdate, latest: { version, fileUrl, checksum, changelog } | null }' })
  async checkUpdate(
    @Headers('x-agent-version') agentVersion: string,
  ) {
    return this.agentsService.getLatestRelease('win32', agentVersion || '0.0.0');
  }

  // ============================================================
  // ENDPOINTS PORTAIL → AGENT (authentification JWT standard)
  // ============================================================

  /**
   * Déclenche une commande distante sur l'agent (ex: forcer une resync complète).
   * Réservé aux utilisateurs avec permission manage:agents.
   */
  @Post(':id/command')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'manage', resource: 'agents' })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Envoyer une commande distante à un agent',
    description:
      "La commande sera transmise à l'agent lors de son prochain heartbeat. Commandes disponibles: FORCE_FULL_SYNC.",
  })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  @ApiResponse({ status: 201, description: 'Commande mise en file' })
  async sendCommand(
    @Param('id') agentId: string,
    @OrganizationId() organizationId: string,
    @Body() body: { command: string },
  ) {
    return this.agentsService.sendCommand(agentId, organizationId, body.command);
  }

  /**
   * Liste les batches de synchronisation d'un agent (historique).
   */
  @Get(':id/sync-batches')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'agents' })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Historique des batches de sync d'un agent" })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  async getSyncBatches(
    @Param('id') agentId: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.agentsService.getAgentSyncBatches(agentId, organizationId);
  }

  /**
   * Retourne le dernier snapshot d'une vue pour une organisation.
   */
  @Get('snapshots/:viewName')
  @UseGuards(PermissionsGuard)
  @RequirePermissions({ action: 'read', resource: 'dashboards' })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Dernier snapshot de données pour une vue Sage 100',
    description: 'Retourne les dernières données synchronisées pour la vue demandée.',
  })
  @ApiParam({ name: 'viewName', description: 'ex: VW_GRAND_LIVRE_GENERAL' })
  async getSnapshot(
    @Param('viewName') viewName: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.agentsService.getViewSnapshot(organizationId, viewName);
  }
}
