import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeService } from '../claude/claude.service';
import { LocalLlmService } from './local-llm.service';

type NlqProvider = 'claude' | 'local' | 'none';

interface AiConfig {
  nlqProvider?: NlqProvider;
  localLlmUrl?: string;
  localLlmModel?: string;
  claudeInsights?: boolean;
}

@Injectable()
export class AiRouterService {
  private readonly logger = new Logger(AiRouterService.name);

  constructor(
    private prisma: PrismaService,
    private claudeService: ClaudeService,
    private localLlmService: LocalLlmService,
  ) {}

  private async getAiConfig(): Promise<AiConfig> {
    try {
      const config = await this.prisma.systemConfig.findUnique({
        where: { id: 'default' },
        select: { featureFlags: true },
      });
      return (config?.featureFlags as AiConfig) ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Route la classification NLQ vers le bon moteur IA.
   * Retourne null-équivalent si aucun moteur n'est configuré → fallback keyword matching dans NlqService.
   */
  async classifyNlqIntent(
    question: string,
    intents: Array<{ key: string; label: string; description: string | null; keywords: string[] }>,
    sageType: string,
  ): Promise<{
    intentKey: string | null;
    confidence: number;
    extractedEntities: Record<string, string | null>;
  }> {
    const config = await this.getAiConfig();
    const provider: NlqProvider = config.nlqProvider ?? 'claude';

    if (provider === 'claude') {
      this.logger.log('Moteur IA : Claude');
      return this.claudeService.classifyNlqIntent(question, intents, sageType);
    }

    if (provider === 'local') {
      const { localLlmUrl, localLlmModel } = config;
      if (!localLlmUrl || !localLlmModel) {
        this.logger.warn('LLM local sélectionné mais URL ou modèle non configuré — fallback keyword matching');
        return { intentKey: null, confidence: 0, extractedEntities: {} };
      }
      try {
        this.logger.log(`Moteur IA : LLM local (${localLlmModel} @ ${localLlmUrl})`);
        return await this.localLlmService.classifyNlqIntent(
          question, intents, sageType, localLlmUrl, localLlmModel,
        );
      } catch (err) {
        this.logger.warn(`LLM local indisponible (${err.message}) — fallback keyword matching`);
        return { intentKey: null, confidence: 0, extractedEntities: {} };
      }
    }

    // provider === 'none'
    this.logger.log('Moteur IA : désactivé — keyword matching');
    return { intentKey: null, confidence: 0, extractedEntities: {} };
  }

  /**
   * Liste les modèles disponibles sur un serveur LLM local.
   * Utilisé par l'endpoint admin pour peupler le dropdown.
   */
  async listLocalModels(baseUrl: string): Promise<string[]> {
    return this.localLlmService.listModels(baseUrl);
  }
}
