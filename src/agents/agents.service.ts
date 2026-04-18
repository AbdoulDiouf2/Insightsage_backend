import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
  Inject,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterAgentDto } from './dto/register-agent.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { GenerateTokenDto } from './dto/generate-token.dto';
import { ValidateAgentDto } from './dto/validate-agent.dto';
import { IngestDto } from './dto/ingest.dto';
import { HeartbeatV1Dto } from './dto/heartbeat-v1.dto';
import { randomBytes } from 'crypto';
import { JobStatus } from '@prisma/client';
import { SqlSecurityService } from './sql-security.service';
import { LicenseGuardianService } from '../subscriptions/license-guardian.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REDIS_CLIENT } from '../redis/redis.module';
import type { RedisClientType } from 'redis';
import { ClaudeService } from '../claude/claude.service';

// Durée de vie d'un token : 30 jours (Section 2.4)
const TOKEN_TTL_DAYS = 30;
// Seuil d'alerte : 7 jours avant expiration
const TOKEN_EXPIRY_WARNING_DAYS = 7;
// Timeout pour un job temps réel : 30 secondes
const JOB_TIMEOUT_MS = 30000;
// Limite de requêtes par minute par organisation
const MAX_REQUESTS_PER_MINUTE = 500;

@Injectable()
export class AgentsService implements OnModuleInit {
  private readonly logger = new Logger(AgentsService.name);
  private connectedAgents = new Set<string>(); // Map organizationId -> presence via WebSocket

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notifications: NotificationsService,
    private sqlSecurity: SqlSecurityService,
    private licenseGuardian: LicenseGuardianService,
    private eventEmitter: EventEmitter2,
    private claudeService: ClaudeService,
    @Inject(REDIS_CLIENT) private redis: RedisClientType,
  ) { }

  onModuleInit() {
    // Lancer les tâches de nettoyage toutes les minutes
    setInterval(() => {
      this.markStaleAgentsOffline().catch(() => { });
      this.cleanupStaleJobs().catch(() => { });
      this.warnExpiringTokens().catch(() => { });
    }, 60000);
  }

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
        .catch(() => { });
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

  private async checkRateLimit(organizationId: string): Promise<void> {
    const key = `sql_rl:${organizationId}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        // Première requête de la fenêtre — définir TTL de 60 secondes
        await this.redis.expire(key, 60);
      }
      if (count > MAX_REQUESTS_PER_MINUTE) {
        throw new BadRequestException(
          `Limite de requêtes atteinte (${MAX_REQUESTS_PER_MINUTE}/min). Veuillez patienter.`,
        );
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      // Si Redis est indisponible, on laisse passer (fail-open) plutôt que de bloquer
      this.logger.warn(`Redis indisponible pour rate limiting org ${organizationId}: ${err.message}`);
    }
  }

  /**
   * Transformateur de résultat (Normalisation)
   * Nettoie les données brutes de l'agent pour un format standard utilisable par le front
   */
  private transformResult(result: any): any {
    if (!result) return null;

    // Cas 1: L'agent renvoie un tableau d'objets (format SQL classique)
    if (Array.isArray(result)) {
      // Si vide
      if (result.length === 0) return { value: 0, data: [] };

      // Si c'est une seule ligne avec une seule colonne (ex: SELECT COUNT(*)...)
      if (result.length === 1) {
        const firstRow = result[0];
        const keys = Object.keys(firstRow);
        if (keys.length === 1) {
          const rawValue = firstRow[keys[0]];
          // Tentative de conversion numérique
          const numericValue = Number(rawValue);
          if (!isNaN(numericValue)) return { value: numericValue, raw: result };
        }
      }

      // Sinon on renvoie le tableau tel quel mais identifié
      return { data: result, count: result.length };
    }

    return result;
  }

  // ─── Endpoints SaaS Admin ─────────────────────────────────────────────────

  /**
   * Génère un nouveau token agent pour une organisation (Section 2.4)
   */
  async generateAgentToken(organizationId: string, userId: string, dto: GenerateTokenDto) {
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
      userId,
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
  async revokeToken(agentId: string, organizationId: string, userId?: string) {
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
      userId,
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
  async regenerateToken(agentId: string, organizationId: string, userId?: string) {
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
      userId,
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
      // L'alerte admin est déclenchée automatiquement par AuditLogService sur agent_error
    }

    // Le heartbeat (toutes les 30s) n'est PAS loggué en DB pour éviter l'explosion du volume.
    // L'info de présence est déjà dans Agent.lastSeen + Agent.status.

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
      include: { organization: { select: { name: true } } },
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
        organization: agent.organization,
        isStale,
        isSocketConnected: this.connectedAgents.has(organizationId),
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
      isSocketConnected: this.connectedAgents.has(agent.organizationId),
      // Aperçu masqué du token — le token complet n'est jamais ré-exposé
      tokenPreview: agent.token.slice(0, 15) + '...',
      ...this.buildTokenInfo(agent),
    };
  }

  async getJobStats(agentId: string, organizationId: string) {
    const rows = await this.prisma.agentJob.groupBy({
      by: ['status'],
      where: { agentId, organizationId },
      _count: { status: true },
    });

    const stats: Record<string, number> = {
      PENDING: 0,
      RUNNING: 0,
      COMPLETED: 0,
      FAILED: 0,
    };

    for (const row of rows) {
      stats[row.status] = row._count.status;
    }

    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    return { ...stats, total };
  }

  /**
   * Marque les agents sans heartbeat récent comme offline (appelé par un cron job)
   */
  async markStaleAgentsOffline() {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    // Trouver d'abord les agents concernés (updateMany ne retourne pas les enregistrements)
    const staleAgents = await this.prisma.agent.findMany({
      where: { status: 'online', lastSeen: { lt: twoMinutesAgo } },
      select: { id: true, name: true, organization: { select: { name: true } } },
    });

    if (staleAgents.length === 0) return { markedOffline: 0 };

    const result = await this.prisma.agent.updateMany({
      where: { id: { in: staleAgents.map((a) => a.id) } },
      data: { status: 'offline' },
    });

    // Notifier les admins (fire-and-forget)
    for (const agent of staleAgents) {
      this.notifications
        .notifyAgentOffline(agent.name, agent.organization?.name ?? agent.id)
        .catch(() => {});
    }

    return { markedOffline: result.count };
  }

  /**
   * Envoie des alertes email aux admins J-7, J-3, J-1 avant l'expiration d'un token agent.
   * Appelé toutes les minutes par le cron interne ; le cooldown de 23h dans NotificationsService
   * garantit qu'un seul email est envoyé par seuil par agent.
   */
  async warnExpiringTokens() {
    const sevenDaysFromNow = new Date(Date.now() + TOKEN_EXPIRY_WARNING_DAYS * 24 * 3600 * 1000);
    const agents = await this.prisma.agent.findMany({
      where: {
        isRevoked: false,
        tokenExpiresAt: { gt: new Date(), lte: sevenDaysFromNow },
      },
      include: { organization: { select: { name: true } } },
    });

    for (const agent of agents) {
      const daysLeft = this.getDaysUntilExpiry(agent.tokenExpiresAt);
      if (daysLeft !== null && [7, 3, 1].includes(daysLeft)) {
        this.notifications
          .notifyTokenExpiringSoon(agent.id, agent.name, agent.organization.name, daysLeft)
          .catch(() => {});
      }
    }
  }

  // ─── WebSocket & Real-Time Support ──────────────────────────────────────────

  /**
   * Valide un token agent pour le handshake WebSocket
   */
  async validateAgentToken(token: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (!agent) {
      throw new ForbiddenException('Token agent invalide');
    }

    if (agent.isRevoked) {
      throw new ForbiddenException('Token révoqué');
    }

    if (agent.tokenExpiresAt && agent.tokenExpiresAt < new Date()) {
      throw new ForbiddenException('Token expiré');
    }

    return agent;
  }

  /**
   * Crée un job d'exécution SQL pour un agent
   */
  async createJob(organizationId: string, agentId: string, sql: string, userId?: string) {
    return this.prisma.agentJob.create({
      data: {
        organizationId,
        agentId,
        userId: userId || null,
        sql,
        status: JobStatus.PENDING,
      },
    });
  }

  /**
   * Met à jour le résultat d'un job
   */
  async updateJobResult(
    jobId: string,
    organizationId: string,
    result?: any,
    error?: string,
  ) {
    const job = await this.prisma.agentJob.findUnique({
      where: { id: jobId },
    });

    if (!job || job.organizationId !== organizationId) {
      throw new NotFoundException('Job introuvable ou accès refusé');
    }

    // Normalisation du résultat avant stockage
    const transformedResult = error ? null : this.transformResult(result);

    const updatedJob = await this.prisma.agentJob.update({
      where: { id: jobId },
      data: {
        status: error ? JobStatus.FAILED : JobStatus.COMPLETED,
        result: transformedResult || null,
        errorMessage: error || null,
        completedAt: new Date(),
      },
    });

    // Génération d'insight CFO en arrière-plan (fire-and-forget)
    if (!error && transformedResult) {
      this.generateAndStoreInsight(jobId, organizationId, transformedResult).catch(() => {});
    }

    return updatedJob;
  }

  /**
   * Génère un insight CFO via Claude pour un job complété,
   * le persiste sur AgentJob et l'émet via EventEmitter vers CockpitGateway.
   */
  private async generateAndStoreInsight(
    jobId: string,
    organizationId: string,
    result: unknown,
  ): Promise<void> {
    const [session, org] = await Promise.all([
      this.prisma.nlqSession.findFirst({
        where: { jobId },
        include: { intent: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { sector: true, size: true },
      }),
    ]);

    const kpiName = (session as any)?.intent?.label ?? 'KPI';
    const insight = await this.claudeService.generateKpiInsight(
      kpiName,
      result,
      '',
      { sector: org?.sector ?? undefined, size: org?.size ?? undefined },
    );

    if (!insight) return;

    await this.prisma.agentJob.update({
      where: { id: jobId },
      data: { aiInsight: insight },
    });

    this.eventEmitter.emit('agent.job.insight_ready', {
      organizationId,
      jobId,
      insight,
    });

    this.logger.log(`Insight CFO généré pour job ${jobId}`);
  }

  /**
   * Méthode principale pour exécuter une requête en temps réel (NLQ)
   */
  async executeRealTimeQuery(
    organizationId: string,
    sql: string,
    gateway: any, // On passe la gateway pour éviter les cycles d'injection si nécessaire
    userId?: string,
  ) {
    // 0. Injection dynamique de la configuration (Scoping par Dossier/Société)
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { sageConfig: true },
    });

    let finalSql = sql;
    if (org?.sageConfig && typeof org.sageConfig === 'object') {
      const config = org.sageConfig as Record<string, any>;
      // Remplace les placeholders type {{database_name}} par leur valeur réelle
      for (const [key, value] of Object.entries(config)) {
        const placeholder = `{{${key}}}`;
        if (finalSql.includes(placeholder)) {
          finalSql = finalSql.split(placeholder).join(String(value));
        }
      }
    }

    // 1. Validation de sécurité (Defense in Depth)
    const validation = this.sqlSecurity.validate(finalSql);
    if (!validation.isValid) {
      throw new BadRequestException(
        `Requête SQL invalide: ${validation.error}`,
      );
    }

    // 2. Vérification de la limite de licence (Synchronisation quotidienne) - DESACTIVÉ
    // await this.licenseGuardian.assertLimit(organizationId, 'maxAgentSyncPerDay');

    // 3. Rate limiting check (Redis distribué)
    await this.checkRateLimit(organizationId);

    // 3.5 Stratégie de Caching : Vérifier si une requête identique a été faite récemment (< 5 min)
    const CACHE_TTL_MS = 5 * 60 * 1000;
    const cachedJob = await this.prisma.agentJob.findFirst({
      where: {
        organizationId,
        sql: finalSql,
        status: JobStatus.COMPLETED,
        completedAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
      },
      orderBy: { completedAt: 'desc' },
    });

    if (cachedJob) {
      return cachedJob; // On renvoie le job déjà complété avec son résultat
    }

    // 4. Trouver l'agent online pour cette organisation
    const agent = await this.prisma.agent.findFirst({
      where: { organizationId, status: 'online', isRevoked: false },
    });

    if (!agent) {
      throw new NotFoundException(
        "Aucun agent n'est actuellement connecté pour cette organisation.",
      );
    }

    // 5. Créer le job
    const job = await this.createJob(organizationId, agent.id, finalSql, userId);

    // 6. Envoyer via WebSocket
    const sent = await gateway.emitExecuteSql(organizationId, job.id, finalSql);

    if (!sent) {
      // Si l'agent n'est pas connecté via WebSocket, on marque le job en erreur
      await this.updateJobResult(job.id, organizationId, null, "L'agent est online par heartbeat mais pas par WebSocket.");
      throw new BadRequestException("L'agent n'est pas prêt pour une exécution en temps réel.");
    }

    // 7. Marquer le job comme RUNNING et enregistrer l'heure de début
    return this.prisma.agentJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.RUNNING,
        startedAt: new Date(),
      },
    });
  }

  /**
   * Nettoie les jobs "stale" qui n'ont pas reçu de réponse (Timeout)
   */
  async cleanupStaleJobs() {
    const timeoutDate = new Date(Date.now() - JOB_TIMEOUT_MS);

    const result = await this.prisma.agentJob.updateMany({
      where: {
        status: { in: [JobStatus.PENDING, JobStatus.RUNNING] },
        createdAt: { lt: timeoutDate },
      },
      data: {
        status: JobStatus.FAILED,
        errorMessage: 'Job timeout: Aucune réponse de l\'agent après 30 secondes.',
        completedAt: new Date(),
      },
    });

    if (result.count > 0) {
      this.logger.warn(`agent_job_timeout : ${result.count} job(s) marqué(s) FAILED (timeout 30s)`);
    }

    return { timedOutJobs: result.count };
  }

  /**
   * Fail tous les jobs PENDING/RUNNING d'une organisation lors d'une déconnexion agent.
   */
  async failActiveJobsForOrg(organizationId: string) {
    const result = await this.prisma.agentJob.updateMany({
      where: {
        organizationId,
        status: { in: [JobStatus.PENDING, JobStatus.RUNNING] },
      },
      data: {
        status: JobStatus.FAILED,
        errorMessage: 'Agent déconnecté : le job n\'a pas pu être complété.',
        completedAt: new Date(),
      },
    });

    if (result.count > 0) {
      this.logger.warn(`failActiveJobsForOrg [${organizationId}] : ${result.count} job(s) annulé(s) suite à déconnexion agent.`);
    }
  }

  // ─── Presence Management (called by Gateway) ─────────────────────────────

  setAgentConnected(organizationId: string) {
    this.connectedAgents.add(organizationId);
  }

  setAgentDisconnected(organizationId: string) {
    this.connectedAgents.delete(organizationId);
  }

  isAgentConnected(organizationId: string): boolean {
    return this.connectedAgents.has(organizationId);
  }

  // ─── Config Agent (pushed on WebSocket connect) ──────────────────────────────

  /**
   * Reçoit la configuration Sage envoyée par l'agent lors de sa connexion WebSocket.
   * Met à jour l'Agent et l'Organisation, puis auto-complète le step 3 de l'onboarding si en attente.
   */
  async applyAgentConfig(
    agentId: string,
    organizationId: string,
    config: {
      sageType?: string;
      sageMode?: string;
      sageHost?: string;
      sagePort?: number;
      sageVersion?: string;
      sqlServer?: string;
    },
  ) {
    // Mise à jour de l'agent (métadonnées locales)
    await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        ...(config.sageVersion && { sageVersion: config.sageVersion }),
        ...(config.sqlServer && { sqlServer: config.sqlServer }),
      },
    });

    // Mise à jour de l'organisation avec la config Sage fournie par l'agent
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(config.sageType && { sageType: config.sageType }),
        ...(config.sageMode && { sageMode: config.sageMode }),
        ...(config.sageHost && { sageHost: config.sageHost }),
        ...(config.sagePort && { sagePort: config.sagePort }),
      },
    });

    // Auto-complétion du step 3 de l'onboarding si l'étape n'est pas encore complétée
    const onboarding = await this.prisma.onboardingStatus.findUnique({
      where: { organizationId },
    });
    if (onboarding && !onboarding.completedSteps.includes(3) && !onboarding.isComplete) {
      const completedSteps = [...onboarding.completedSteps, 3].sort((a, b) => a - b);
      const nextStep = Math.max(onboarding.currentStep, 4);
      const isComplete = completedSteps.length >= 5;
      await this.prisma.onboardingStatus.update({
        where: { organizationId },
        data: { completedSteps, currentStep: nextStep, isComplete },
      });
    }

    await this.auditLog.log({
      organizationId,
      event: 'agent_config_received',
      payload: {
        agentId,
        sageType: config.sageType,
        sageMode: config.sageMode,
        sageVersion: config.sageVersion,
        sqlServer: config.sqlServer,
      },
    });

    this.logger.log(`Agent config applied for org ${organizationId}: ${JSON.stringify({ sageType: config.sageType, sageMode: config.sageMode })}`);
  }

  // ─── Agent v1 — Endpoints installeur Electron ────────────────────────────────

  /**
   * Validation du token à l'installation (Step 5 installeur Electron).
   * Appelé sans JWT, le token agent est dans le body.
   */
  async validateAgent(dto: ValidateAgentDto, ipAddress?: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { token: dto.token },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            subscriptionPlan: { select: { name: true } },
          },
        },
      },
    });

    if (!agent) {
      return { valid: false, error: 'Token invalide ou inexistant' };
    }

    if (agent.isRevoked) {
      return { valid: false, error: 'Token révoqué — régénérez un token depuis le portail' };
    }

    if (agent.tokenExpiresAt && agent.tokenExpiresAt < new Date()) {
      return { valid: false, error: 'Token expiré — régénérez un token depuis le portail' };
    }

    // Enregistrer les infos machine de l'installeur
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        machineId: dto.machineId ?? agent.machineId,
        sqlServer: dto.sqlServer ?? agent.sqlServer,
        status: 'online',
        lastSeen: new Date(),
      },
    });

    await this.auditLog.log({
      organizationId: agent.organizationId,
      event: 'agent_registered',
      payload: {
        agentId: agent.id,
        source: 'electron_installer',
        machineId: dto.machineId,
        sqlServer: dto.sqlServer,
        sageTables: dto.sageTables,
        ipAddress,
      },
      ipAddress,
    });

    return {
      valid: true,
      agentId: agent.id,
      clientName: agent.organization.name,
      plan: agent.organization.subscriptionPlan?.name ?? 'unknown',
      organizationId: agent.organizationId,
    };
  }

  /**
   * Architecture Zero-Copy : les données ERP ne sont jamais stockées dans le cloud.
   * Seules les métadonnées de sync (compteurs, watermarks) sont conservées.
   * Les données réelles sont fournies à la demande via WebSocket (execute_sql).
   */
  async ingestData(agentId: string, organizationId: string, dto: IngestDto) {
    // Mise à jour des stats de l'agent uniquement (pas de stockage des lignes)
    await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        lastSeen: new Date(),
        lastSync: new Date(),
        rowsSynced: { increment: BigInt(dto.row_count) },
        sageVersion: dto.schema_version ?? undefined,
      },
    });

    return {
      accepted: true,
      processed: dto.row_count,
      watermark_ack: dto.watermark_max ?? null,
    };
  }

  /**
   * Retourne la configuration de synchronisation pour l'agent.
   * Peut être mise à jour à distance sans réinstaller l'agent.
   */
  async getAgentConfig(agentId: string, organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        subscriptionPlan: { select: { name: true, hasNlq: true, maxAgentSyncPerDay: true } },
      },
    });

    // Config de synchronisation par vue (définie dans ARCHITECTURE_AGENT_ONPREMISES.md)
    const syncIntervals = [
      { view: 'VW_KPI_SYNTESE',         interval: 5,   mode: 'FULL' },
      { view: 'VW_METADATA_AGENT',      interval: 5,   mode: 'FULL' },
      { view: 'VW_GRAND_LIVRE_GENERAL', interval: 15,  mode: 'INCREMENTAL' },
      { view: 'VW_CLIENTS',             interval: 15,  mode: 'INCREMENTAL' },
      { view: 'VW_FOURNISSEURS',        interval: 15,  mode: 'INCREMENTAL' },
      { view: 'VW_TRESORERIE',          interval: 15,  mode: 'INCREMENTAL' },
      { view: 'VW_COMMANDES',           interval: 30,  mode: 'INCREMENTAL' },
      { view: 'VW_ANALYTIQUE',          interval: 30,  mode: 'INCREMENTAL' },
      { view: 'VW_STOCKS',              interval: 60,  mode: 'INCREMENTAL' },
      { view: 'VW_FINANCE_GENERAL',     interval: 60,  mode: 'INCREMENTAL' },
      { view: 'VW_IMMOBILISATIONS',     interval: 360, mode: 'FULL' },
      { view: 'VW_PAIE',                interval: 360, mode: 'FULL' },
    ];

    return {
      sync_intervals: syncIntervals,
      views_enabled: syncIntervals.map((c) => c.view),
      features: {
        nlq: org?.subscriptionPlan?.hasNlq ?? false,
        plan: org?.subscriptionPlan?.name ?? 'unknown',
        maxSyncPerDay: org?.subscriptionPlan?.maxAgentSyncPerDay ?? null,
      },
    };
  }

  /**
   * Heartbeat v1 — format allégé sans token dans le body (auth par Bearer header).
   * Retourne les commandes distantes en attente (ex: FORCE_FULL_SYNC).
   */
  async heartbeatV1(agentId: string, organizationId: string, dto: HeartbeatV1Dto) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent introuvable');

    // Consommer la commande en attente (one-shot)
    const commands: string[] = agent.pendingCommand ? [agent.pendingCommand] : [];

    await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        status: dto.status ?? 'online',
        lastSeen: new Date(),
        lastSync: dto.lastSync ? new Date(dto.lastSync) : agent.lastSync,
        rowsSynced: dto.nbRecordsTotal != null ? BigInt(dto.nbRecordsTotal) : agent.rowsSynced,
        pendingCommand: null, // Effacer la commande après envoi
      },
    });

    return {
      ok: true,
      serverTime: new Date().toISOString(),
      nextHeartbeat: 300, // 5 minutes (au lieu de 30s — le push est le canal principal)
      commands,
    };
  }

  /**
   * Déclenche une commande distante sur un agent (ex: forcer une resync complète).
   * Utilisé par le portail admin. La commande sera transmise au prochain heartbeat.
   */
  async sendCommand(agentId: string, organizationId: string, command: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent introuvable');
    if (agent.organizationId !== organizationId) throw new ForbiddenException('Accès refusé');

    await this.prisma.agent.update({
      where: { id: agentId },
      data: { pendingCommand: command },
    });

    return { queued: true, command, message: `Commande "${command}" sera transmise au prochain heartbeat` };
  }

  /**
   * Retourne l'historique des batches de synchronisation d'un agent.
   */
  async getAgentSyncBatches(agentId: string, organizationId: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent introuvable');
    if (agent.organizationId !== organizationId) throw new ForbiddenException('Accès refusé');

    const batches = await this.prisma.agentSyncBatch.findMany({
      where: { agentId, organizationId },
      orderBy: { processedAt: 'desc' },
      take: 100,
    });

    // Convertir les BigInt en string pour la sérialisation JSON
    return batches.map((b) => ({
      ...b,
      watermarkMin: b.watermarkMin?.toString() ?? null,
      watermarkMax: b.watermarkMax?.toString() ?? null,
    }));
  }

  /**
   * Retourne le dernier snapshot de données pour une vue et une organisation.
   */
  async getViewSnapshot(organizationId: string, viewName: string) {
    const snapshot = await this.prisma.agentViewSnapshot.findUnique({
      where: { organizationId_viewName: { organizationId, viewName } },
    });

    if (!snapshot) {
      throw new NotFoundException(`Aucun snapshot disponible pour la vue "${viewName}"`);
    }

    return {
      ...snapshot,
      watermarkMax: snapshot.watermarkMax?.toString() ?? null,
    };
  }

  /**
   * Récupère un job par ID avec vérification tenant isolation
   */
  async getJobById(jobId: string, organizationId: string) {
    const job = await this.prisma.agentJob.findUnique({
      where: { id: jobId },
    });

    if (!job || job.organizationId !== organizationId) {
      throw new NotFoundException('Job introuvable');
    }

    return job;
  }

  /**
   * Crée une entrée de log pour un agent
   */
  async createLog(
    organizationId: string,
    agentId: string,
    data: { level: string; message: string; timestamp: Date },
  ) {
    const log = await this.prisma.agentLog.create({
      data: {
        organizationId,
        agentId,
        level: data.level,
        message: data.message,
        timestamp: data.timestamp,
      },
    });

    this.eventEmitter.emit('agent.log.created', { organizationId, log });

    return log;
  }

  /**
   * Récupère les logs d'un agent avec pagination
   */
  async getAgentLogs(
    organizationId: string,
    agentId: string,
    page = 1,
    limit = 50,
    search?: string,
  ) {
    const where: any = { organizationId, agentId };
    if (search) {
      where.message = { contains: search, mode: 'insensitive' };
    }

    const [logs, total] = await Promise.all([
      this.prisma.agentLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.agentLog.count({
        where,
      }),
    ]);

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Récupère l'historique des jobs (requêtes) d'un agent avec pagination
   */
  async getAgentJobs(
    organizationId: string,
    agentId: string,
    page = 1,
    limit = 20,
    status?: JobStatus,
    search?: string,
  ) {
    const where: any = { organizationId, agentId };
    if (status) {
      where.status = status;
    }
    if (search) {
      where.sql = { contains: search, mode: 'insensitive' };
    }

    const [jobs, total] = await Promise.all([
      this.prisma.agentJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            }
          }
        }
      }),
      this.prisma.agentJob.count({
        where,
      }),
    ]);

    return {
      jobs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }
}
