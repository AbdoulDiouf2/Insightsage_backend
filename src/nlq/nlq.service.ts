import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { AgentsGateway } from '../agents/agents.gateway';
import { AiRouterService } from '../ai/ai-router.service';
import { REDIS_CLIENT } from '../redis/redis.module';

const AI_CONFIDENCE_THRESHOLD = 0.7;
const HISTORY_TTL = 60 * 60 * 24 * 7; // 7 jours
const HISTORY_MAX = 20;

export interface NlqHistoryEntry {
    queryText: string;
    intentLabel: string;
    intentKey: string;
    vizType: string;
    jobId: string;
    ts: number;
}

@Injectable()
export class NlqService {
    private readonly logger = new Logger(NlqService.name);

    constructor(
        private prisma: PrismaService,
        private agentsService: AgentsService,
        private agentsGateway: AgentsGateway,
        private aiRouter: AiRouterService,
        @Inject(REDIS_CLIENT) private redis: any,
    ) { }

    private histKey(organizationId: string, userId: string) {
        return `nlq:hist:${organizationId}:${userId}`;
    }

    private favsKey(organizationId: string, userId: string) {
        return `nlq:favs:${organizationId}:${userId}`;
    }

    async getFavorites(organizationId: string, userId: string): Promise<string[]> {
        const members = await this.redis.sMembers(this.favsKey(organizationId, userId));
        return members;
    }

    async addFavorite(organizationId: string, userId: string, jobId: string): Promise<{ favorites: string[] }> {
        const key = this.favsKey(organizationId, userId);
        await this.redis.sAdd(key, jobId);
        const favorites = await this.redis.sMembers(key);
        return { favorites };
    }

    async removeFavorite(organizationId: string, userId: string, jobId: string): Promise<{ favorites: string[] }> {
        const key = this.favsKey(organizationId, userId);
        await this.redis.sRem(key, jobId);
        const favorites = await this.redis.sMembers(key);
        return { favorites };
    }

    private async saveToHistory(organizationId: string, userId: string, entry: NlqHistoryEntry) {
        const key = this.histKey(organizationId, userId);
        await this.redis.lPush(key, JSON.stringify(entry));
        await this.redis.lTrim(key, 0, HISTORY_MAX - 1);
        await this.redis.expire(key, HISTORY_TTL);
    }

    async getHistory(organizationId: string, userId: string): Promise<NlqHistoryEntry[]> {
        const key = this.histKey(organizationId, userId);
        const raw: string[] = await this.redis.lRange(key, 0, HISTORY_MAX - 1);
        return raw.map(s => JSON.parse(s) as NlqHistoryEntry);
    }

    /**
     * Analyse le texte utilisateur pour détecter une intention métier.
     * Fallback par scoring de mots-clés — utilisé quand Claude n'est pas disponible
     * ou n'a pas une confiance suffisante.
     */
    async detectIntent(text: string, intents?: Awaited<ReturnType<typeof this.prisma.nlqIntent.findMany>>) {
        const normalizedText = text.toLowerCase().trim();
        if (!normalizedText) return null;

        if (!intents) intents = await this.prisma.nlqIntent.findMany();

        // Score de correspondance : clé technique (match exact prioritaire) + mots-clés
        const scoredIntents = intents.map(intent => {
            // Match exact sur la clé technique (ex: "f01_ca_ht pour current_quarter en XOF")
            const keyMatch = normalizedText.includes(intent.key.toLowerCase()) ? 100 : 0;

            const matchCount = intent.keywords.filter(keyword => {
                const kw = keyword.toLowerCase();
                // Exact substring match (fast path)
                if (normalizedText.includes(kw)) return true;
                // Word-bag match: all significant words of keyword phrase must appear in text.
                // Handles "top 5 clients" matching keyword "top clients" (number inserted between words).
                const words = kw.split(/\s+/).filter(w => w.length > 1);
                return words.length >= 2 && words.every(w => normalizedText.includes(w));
            }).length;

            return { ...intent, score: keyMatch + matchCount };
        });

        // On garde la meilleure correspondance si elle a au moins un match
        const bestMatch = scoredIntents
            .filter(i => i.score > 0)
            .sort((a, b) => b.score - a.score)[0];

        return bestMatch || null;
    }

    /**
     * Récupère le template SQL pour une intention et un type de Sage
     */
    async getTemplate(intentKey: string, sageType: string) {
        const template = await this.prisma.nlqTemplate.findUnique({
            where: {
                intentKey_sageType: {
                    intentKey,
                    sageType,
                },
            },
        });

        if (!template) {
            throw new NotFoundException(
                `Aucun template SQL trouvé pour l'intention "${intentKey}" sur ${sageType}.`
            );
        }

        if (!template.isActive) {
            throw new NotFoundException(
                `Le template SQL pour l'intention "${intentKey}" sur ${sageType} est désactivé.`
            );
        }

        return template;
    }

    /**
     * Orchestre l'exécution d'une requête NLQ
     */
    async processQuery(organizationId: string, userId: string, text: string) {
        const startTime = Date.now();

        if (!organizationId) {
            throw new BadRequestException('organizationId manquant.');
        }

        // 1. Récupération des infos organisation (sageType)
        const org = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { sageType: true },
        });

        if (!org?.sageType) {
            throw new BadRequestException("Type de Sage non configuré pour cette organisation.");
        }

        // 2. Détection d'intention — Claude en priorité, fallback keyword matching
        const intents = await this.prisma.nlqIntent.findMany();
        type NlqIntentRow = (typeof intents)[number];
        let intent: (NlqIntentRow & { score?: number }) | null = null;

        const { intentKey, confidence } = await this.aiRouter.classifyNlqIntent(
            text,
            intents,
            org.sageType,
        );

        if (intentKey && confidence >= AI_CONFIDENCE_THRESHOLD) {
            intent = intents.find(i => i.key === intentKey) ?? null;
            this.logger.log(`IA classification: "${intentKey}" (confiance: ${confidence.toFixed(2)})`);
        } else {
            // Fallback sur keyword matching si l'IA n'est pas assez confiante ou désactivée
            intent = await this.detectIntent(text, intents);
            this.logger.log(`Fallback keyword matching → intent: ${intent?.key ?? 'none'}`);
        }

        // 3. Création de la session
        const session = await this.prisma.nlqSession.create({
            data: {
                queryText: text,
                organizationId,
                userId,
                intentKey: intent?.key || null,
                status: intent ? 'pending' : 'no_intent',
            },
        });

        if (!intent) {
            return {
                sessionId: session.id,
                status: 'NO_INTENT',
                message: "Désolé, je n'ai pas compris votre demande. Pouvez-vous reformuler ?",
            };
        }

        // 4. Vérification préalable : template désactivé ou placeholder non-exécutable ?
        const templateCheck = await this.prisma.nlqTemplate.findUnique({
            where: { intentKey_sageType: { intentKey: intent.key, sageType: org.sageType } },
            select: { isActive: true, sqlQuery: true },
        });
        if (templateCheck && !templateCheck.isActive) {
            const latencyMs = Date.now() - startTime;
            await this.prisma.nlqSession.update({
                where: { id: session.id },
                data: { status: 'disabled', latencyMs },
            });
            return {
                sessionId: session.id,
                status: 'TEMPLATE_DISABLED',
                message: 'Ce KPI est temporairement désactivé.',
            };
        }
        // SQL commençant par -- = placeholder (ex: ml07_nlq_natural_language_query)
        // Ce KPI est une interface interactive, pas un KPI de données à exécuter.
        if (templateCheck && templateCheck.sqlQuery.trim().startsWith('--')) {
            const latencyMs = Date.now() - startTime;
            await this.prisma.nlqSession.update({
                where: { id: session.id },
                data: { status: 'success', latencyMs },
            });
            return {
                sessionId: session.id,
                status: 'NLQ_INTERACTIVE',
                intentKey: intent.key,
                message: 'Interface NLQ interactive — saisissez votre question.',
            };
        }

        try {
            // 5. Récupération du template
            const template = await this.getTemplate(intent.key, org.sageType);

            // 6. Exécution via l'agent
            const job = await this.agentsService.executeRealTimeQuery(
                organizationId,
                template.sqlQuery,
                this.agentsGateway,
            );

            // 7. Mise à jour session
            const latencyMs = Date.now() - startTime;
            await this.prisma.nlqSession.update({
                where: { id: session.id },
                data: {
                    sqlGenerated: template.sqlQuery,
                    status: 'success',
                    latencyMs,
                    jobId: job.id,
                },
            });

            // 8. Sauvegarde dans l'historique Redis
            this.saveToHistory(organizationId, userId, {
                queryText: text,
                intentLabel: intent.label,
                intentKey: intent.key,
                vizType: template.defaultVizType,
                jobId: job.id,
                ts: Date.now(),
            }).catch(() => {});

            return {
                sessionId: session.id,
                intent: intent.label,
                intentKey: intent.key,
                vizType: template.defaultVizType,
                jobId: job.id,
                status: 'SUCCESS',
            };

        } catch (error) {
            const latencyMs = Date.now() - startTime;
            await this.prisma.nlqSession.update({
                where: { id: session.id },
                data: {
                    status: 'error',
                    errorMessage: error.message,
                    latencyMs,
                },
            });

            throw error;
        }
    }

    /**
     * Ajoute une requête NLQ réussie à un dashboard
     */
    async addToDashboard(organizationId: string, userId: string, sessionId: string, dashboardId: string, name?: string, position?: any) {
        // 1. Trouver la session
        const session = await this.prisma.nlqSession.findUnique({
            where: { id: sessionId },
            include: {
                intent: {
                    include: { templates: true }
                }
            }
        });

        if (!session || session.organizationId !== organizationId) {
            throw new NotFoundException("Session NLQ introuvable.");
        }

        if (session.status !== 'success' || !session.sqlGenerated) {
            throw new BadRequestException("Seules les sessions NLQ réussies peuvent être ajoutées au dashboard.");
        }

        // 2. Vérifier le dashboard
        const dashboard = await this.prisma.dashboard.findUnique({
            where: { id: dashboardId }
        });

        if (!dashboard || dashboard.organizationId !== organizationId) {
            throw new NotFoundException("Dashboard introuvable.");
        }

        // 3. Créer le widget
        return this.prisma.widget.create({
            data: {
                name: name || session.intent?.label || "Recherche NLQ",
                type: 'chart', // Par défaut
                vizType: session.intent?.templates.find(t => t.intentKey === session.intentKey)?.defaultVizType || 'bar',
                config: {
                    isNlq: true,
                    sql: session.sqlGenerated,
                    intentKey: session.intentKey,
                    queryText: session.queryText
                },
                position: position || { x: 0, y: 0, w: 4, h: 3 },
                organizationId,
                dashboardId,
                userId
            }
        });
    }
}
