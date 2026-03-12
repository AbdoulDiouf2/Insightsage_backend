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
import { RegisterAgentDto } from './dto/register-agent.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { GenerateTokenDto } from './dto/generate-token.dto';
import { randomBytes } from 'crypto';
import { JobStatus } from '@prisma/client';
import { SqlSecurityService } from './sql-security.service';
import { LicenseGuardianService } from '../subscriptions/license-guardian.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REDIS_CLIENT } from '../redis/redis.module';
import type { RedisClientType } from 'redis';

// Durée de vie d'un token : 30 jours (Section 2.4)
const TOKEN_TTL_DAYS = 30;
// Seuil d'alerte : 7 jours avant expiration
const TOKEN_EXPIRY_WARNING_DAYS = 7;
// Timeout pour un job temps réel : 30 secondes
const JOB_TIMEOUT_MS = 30000;
// Limite de requêtes par minute par organisation
const MAX_REQUESTS_PER_MINUTE = 10;

@Injectable()
export class AgentsService implements OnModuleInit {
  private readonly logger = new Logger(AgentsService.name);
  private connectedAgents = new Set<string>(); // Map organizationId -> presence via WebSocket

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private sqlSecurity: SqlSecurityService,
    private licenseGuardian: LicenseGuardianService,
    private eventEmitter: EventEmitter2,
    @Inject(REDIS_CLIENT) private redis: RedisClientType,
  ) { }

  onModuleInit() {
    // Lancer les tâches de nettoyage toutes les minutes
    setInterval(() => {
      this.markStaleAgentsOffline().catch(() => { });
      this.cleanupStaleJobs().catch(() => { });
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

    const result = await this.prisma.agent.updateMany({
      where: {
        status: 'online',
        lastSeen: { lt: twoMinutesAgo },
      },
      data: { status: 'offline' },
    });

    return { markedOffline: result.count };
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

    return this.prisma.agentJob.update({
      where: { id: jobId },
      data: {
        status: error ? JobStatus.FAILED : JobStatus.COMPLETED,
        result: transformedResult || null,
        errorMessage: error || null,
        completedAt: new Date(),
      },
    });
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
        status: JobStatus.PENDING,
        createdAt: { lt: timeoutDate },
      },
      data: {
        status: JobStatus.FAILED,
        errorMessage: 'Job timeout: Aucune réponse de l\'agent après 30 secondes.',
        completedAt: new Date(),
      },
    });

    if (result.count > 0) {
      this.auditLog
        .log({
          organizationId: 'system',
          event: 'agent_job_timeout',
          payload: { count: result.count },
        })
        .catch(() => { });
    }

    return { timedOutJobs: result.count };
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
