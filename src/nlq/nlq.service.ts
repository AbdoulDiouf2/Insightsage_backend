import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { AgentsGateway } from '../agents/agents.gateway';
import { AiRouterService } from '../ai/ai-router.service';

// Seuil de confiance minimum pour accepter la classification IA
const AI_CONFIDENCE_THRESHOLD = 0.7;

@Injectable()
export class NlqService {
    private readonly logger = new Logger(NlqService.name);

    constructor(
        private prisma: PrismaService,
        private agentsService: AgentsService,
        private agentsGateway: AgentsGateway,
        private aiRouter: AiRouterService,
    ) { }

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

            const matchCount = intent.keywords.filter(keyword =>
                normalizedText.includes(keyword.toLowerCase())
            ).length;

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

        try {
            // 4. Récupération du template
            const template = await this.getTemplate(intent.key, org.sageType);

            // 5. Exécution via l'agent
            // Note: Le SQL du template contient déjà les placeholders {{database_name}}
            // qui seront injectés par agentsService.executeRealTimeQuery
            const job = await this.agentsService.executeRealTimeQuery(
                organizationId,
                template.sqlQuery,
                this.agentsGateway,
            );

            // 6. Mise à jour session
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

            return {
                sessionId: session.id,
                intent: intent.label,
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
