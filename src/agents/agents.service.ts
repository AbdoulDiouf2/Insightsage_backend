import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { RegisterAgentDto } from './dto/register-agent.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { GenerateTokenDto } from './dto/generate-token.dto';
import { randomBytes } from 'crypto';

// Durée de vie d'un token : 30 jours (Section 2.4)
const TOKEN_TTL_DAYS = 30;
// Seuil d'alerte : 7 jours avant expiration
const TOKEN_EXPIRY_WARNING_DAYS = 7;

@Injectable()
export class AgentsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private generateToken(): string {
    // Format: isag_xxxxxxxxxxxxxxxxxxxxxxxxxxxx (48 hex chars)
    const randomPart = randomBytes(24).toString('hex');
    return `isag_${randomPart}`;
  }

  private getTokenExpiresAt(): Date {
    return new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 3600 * 1000);
  }

  private getDaysUntilExpiry(tokenExpiresAt: Date | null): number | null {
    if (!tokenExpiresAt) return null;
    const ms = tokenExpiresAt.getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)));
  }

  /**
   * Vérifie que le token n'est ni révoqué ni expiré.
   * Lève une ForbiddenException si invalide.
   */
  private assertTokenValid(agent: {
    isRevoked: boolean;
    revokedAt: Date | null;
    tokenExpiresAt: Date | null;
    id: string;
    organizationId: string;
  }): void {
    if (agent.isRevoked) {
      throw new ForbiddenException(
        'Ce token agent a été révoqué. Générez un nouveau token via le portail admin.',
      );
    }
    if (agent.tokenExpiresAt && agent.tokenExpiresAt < new Date()) {
      // Log best-effort, sans bloquer
      this.auditLog
        .log({
          organizationId: agent.organizationId,
          event: 'agent_token_expired',
          payload: { agentId: agent.id },
        })
        .catch(() => {});
      throw new ForbiddenException(
        'Ce token agent a expiré (validité 30 jours). Régénérez un token via le portail admin.',
      );
    }
  }

  private buildTokenInfo(agent: {
    tokenExpiresAt: Date | null;
    isRevoked: boolean;
    revokedAt: Date | null;
  }) {
    const daysUntilExpiry = this.getDaysUntilExpiry(agent.tokenExpiresAt);
    return {
      tokenExpiresAt: agent.tokenExpiresAt,
      daysUntilExpiry,
      isExpiringSoon:
        daysUntilExpiry !== null &&
        daysUntilExpiry <= TOKEN_EXPIRY_WARNING_DAYS,
      isRevoked: agent.isRevoked,
      revokedAt: agent.revokedAt,
    };
  }

  // ─── Endpoints SaaS Admin ─────────────────────────────────────────────────

  /**
   * Génère un nouveau token agent pour une organisation (Section 2.4)
   */
  async generateAgentToken(organizationId: string, dto: GenerateTokenDto) {
    const existingAgent = await this.prisma.agent.findFirst({
      where: { organizationId },
    });

    if (existingAgent && !dto.force) {
      throw new BadRequestException(
        "L'organisation a déjà un agent. Utilisez force=true pour en créer un autre.",
      );
    }

    const token = this.generateToken();
    const tokenExpiresAt = this.getTokenExpiresAt();

    const agent = await this.prisma.agent.create({
      data: {
        token,
        name: dto.name || `Agent-${organizationId.slice(0, 8)}`,
        status: 'pending',
        organizationId,
        tokenExpiresAt,
      },
    });

    await this.auditLog.log({
      organizationId,
      event: 'agent_token_generated',
      payload: { agentId: agent.id, agentName: agent.name },
    });

    return {
      id: agent.id,
      token: agent.token,
      name: agent.name,
      status: agent.status,
      tokenExpiresAt: agent.tokenExpiresAt,
      daysUntilExpiry: TOKEN_TTL_DAYS,
      message: "Token généré. Utilisez ce token dans la configuration de l'agent.",
      instructions: {
        step1: 'Copiez le token ci-dessus',
        step2: "Collez-le dans agent/config/config.yaml sous backend.agent_token",
        step3: "Démarrez l'agent : python -m src.main",
      },
    };
  }

  /**
   * Révoque explicitement le token d'un agent (Section 2.4)
   */
  async revokeToken(agentId: string, organizationId: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });

    if (!agent) {
      throw new NotFoundException('Agent introuvable');
    }
    if (agent.organizationId !== organizationId) {
      throw new ForbiddenException('Accès refusé à cet agent');
    }
    if (agent.isRevoked) {
      throw new BadRequestException('Ce token est déjà révoqué');
    }

    const updatedAgent = await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        status: 'pending',
      },
    });

    await this.auditLog.log({
      organizationId,
      event: 'agent_token_revoked',
      payload: { agentId, agentName: agent.name },
    });

    return {
      id: updatedAgent.id,
      name: updatedAgent.name,
      isRevoked: true,
      revokedAt: updatedAgent.revokedAt,
      message:
        "Token révoqué. L'agent ne peut plus se connecter. Régénérez un token pour le réactiver.",
    };
  }

  /**
   * Régénère le token d'un agent (remet le compteur d'expiration à zéro)
   */
  async regenerateToken(agentId: string, organizationId: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });

    if (!agent) {
      throw new NotFoundException('Agent introuvable');
    }
    if (agent.organizationId !== organizationId) {
      throw new ForbiddenException('Accès refusé');
    }

    const newToken = this.generateToken();
    const tokenExpiresAt = this.getTokenExpiresAt();

    const updatedAgent = await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        token: newToken,
        status: 'pending',
        lastSeen: null,
        tokenExpiresAt,
        isRevoked: false,
        revokedAt: null,
      },
    });

    await this.auditLog.log({
      organizationId,
      event: 'agent_token_regenerated',
      payload: { agentId, agentName: agent.name },
    });

    return {
      id: updatedAgent.id,
      token: newToken,
      tokenExpiresAt: updatedAgent.tokenExpiresAt,
      daysUntilExpiry: TOKEN_TTL_DAYS,
      message:
        "Token régénéré (validité 30 jours). Mettez à jour la configuration de l'agent.",
    };
  }

  // ─── Endpoints Agent On-Premise ───────────────────────────────────────────

  /**
   * Enregistrement de l'agent (appelé par l'agent on-premise au démarrage)
   */
  async registerAgent(dto: RegisterAgentDto, ipAddress?: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { token: dto.agent_token },
      include: { organization: true },
    });

    if (!agent) {
      throw new NotFoundException('Token agent invalide');
    }

    // Vérifier validité du token (Section 2.4)
    this.assertTokenValid(agent);

    const updatedAgent = await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        status: 'online',
        version: dto.agent_version || '1.0.0',
        name: dto.agent_name || agent.name,
        lastSeen: new Date(),
        errorCount: 0,
        lastError: null,
      },
    });

    await this.auditLog.log({
      organizationId: agent.organizationId,
      event: 'agent_registered',
      payload: {
        agentId: agent.id,
        sageType: dto.sage_type,
        sageVersion: dto.sage_version,
        ipAddress,
      },
      ipAddress,
    });

    const daysUntilExpiry = this.getDaysUntilExpiry(agent.tokenExpiresAt);

    return {
      success: true,
      agent_id: updatedAgent.id,
      organization_id: agent.organizationId,
      organization_name: agent.organization.name,
      message: 'Agent enregistré avec succès',
      tokenInfo: {
        tokenExpiresAt: agent.tokenExpiresAt,
        daysUntilExpiry,
        isExpiringSoon:
          daysUntilExpiry !== null &&
          daysUntilExpiry <= TOKEN_EXPIRY_WARNING_DAYS,
      },
    };
  }

  /**
   * Traitement du heartbeat agent (appelé toutes les 30 secondes)
   */
  async processHeartbeat(dto: HeartbeatDto) {
    const agent = await this.prisma.agent.findUnique({
      where: { token: dto.agentToken },
    });

    if (!agent) {
      throw new NotFoundException('Agent introuvable');
    }

    // Vérifier validité du token (Section 2.4)
    this.assertTokenValid(agent);

    let newStatus = dto.status || 'online';
    let errorCount = agent.errorCount;
    let lastError = agent.lastError;

    if (dto.errorCount && dto.errorCount > 0) {
      errorCount = dto.errorCount;
      newStatus = dto.errorCount > 5 ? 'error' : 'online';
    }
    if (dto.lastError) {
      lastError = dto.lastError;
    }

    const updatedAgent = await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        status: newStatus,
        lastSeen: new Date(),
        version: dto.agentVersion || agent.version,
        errorCount,
        lastError,
      },
    });

    if (newStatus === 'error' && agent.status !== 'error') {
      await this.auditLog.log({
        organizationId: agent.organizationId,
        event: 'agent_error',
        payload: { agentId: agent.id, errorCount, lastError },
      });
    }

    const daysUntilExpiry = this.getDaysUntilExpiry(agent.tokenExpiresAt);
    const isExpiringSoon =
      daysUntilExpiry !== null && daysUntilExpiry <= TOKEN_EXPIRY_WARNING_DAYS;

    return {
      success: true,
      status: updatedAgent.status,
      serverTime: new Date().toISOString(),
      nextHeartbeat: 30,
      tokenInfo: {
        daysUntilExpiry,
        isExpiringSoon,
        ...(isExpiringSoon && {
          warning: `Votre token expire dans ${daysUntilExpiry} jour(s). Régénérez-le depuis le portail admin.`,
        }),
      },
    };
  }

  // ─── Endpoints lecture statut ─────────────────────────────────────────────

  async getAgentStatusByOrg(organizationId: string) {
    const agents = await this.prisma.agent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date().getTime();

    return agents.map((agent) => {
      const isStale = agent.lastSeen
        ? now - agent.lastSeen.getTime() > 2 * 60 * 1000
        : true;

      return {
        id: agent.id,
        name: agent.name,
        status: isStale && agent.status === 'online' ? 'offline' : agent.status,
        version: agent.version,
        lastSeen: agent.lastSeen,
        lastSync: agent.lastSync,
        rowsSynced: Number(agent.rowsSynced),
        errorCount: agent.errorCount,
        lastError: agent.lastError,
        isStale,
        ...this.buildTokenInfo(agent),
      };
    });
  }

  async getAgentById(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true } },
      },
    });

    if (!agent) {
      throw new NotFoundException('Agent introuvable');
    }

    return {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      version: agent.version,
      lastSeen: agent.lastSeen,
      lastSync: agent.lastSync,
      rowsSynced: Number(agent.rowsSynced),
      errorCount: agent.errorCount,
      lastError: agent.lastError,
      organizationId: agent.organizationId,
      organization: agent.organization,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      // Aperçu masqué du token — le token complet n'est jamais ré-exposé
      tokenPreview: agent.token.slice(0, 15) + '...',
      ...this.buildTokenInfo(agent),
    };
  }

  /**
   * Marque les agents sans heartbeat récent comme offline (appelé par un cron job)
   */
  async markStaleAgentsOffline() {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    const result = await this.prisma.agent.updateMany({
      where: {
        status: 'online',
        lastSeen: { lt: twoMinutesAgo },
      },
      data: { status: 'offline' },
    });

    return { markedOffline: result.count };
  }
}
