import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClaudeService {
  private readonly client: Anthropic;
  private readonly logger = new Logger(ClaudeService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.client = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  /**
   * Vérifie si une feature flag Claude est activée dans SystemConfig.
   * Par défaut : activée si le champ n'existe pas encore (backward compat).
   */
  private async isFeatureEnabled(flag: 'claudeNlq' | 'claudeInsights'): Promise<boolean> {
    try {
      const config = await this.prisma.systemConfig.findUnique({
        where: { id: 'default' },
        select: { featureFlags: true },
      });

      if (!config?.featureFlags || typeof config.featureFlags !== 'object') {
        return true; // Pas de config → activé par défaut
      }

      const flags = config.featureFlags as Record<string, unknown>;
      // Si la clé est absente → activé par défaut ; si elle vaut false → désactivé
      return flags[flag] !== false;
    } catch {
      return true; // En cas d'erreur DB → ne pas bloquer
    }
  }

  /**
   * Classifie une question NLQ en intention métier.
   * Retourne intentKey + confiance + entités extraites.
   * Fallback sur null si Claude ne peut pas répondre.
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
    if (!this.config.get('ANTHROPIC_API_KEY')) {
      this.logger.warn('ANTHROPIC_API_KEY non configurée — classification Claude ignorée');
      return { intentKey: null, confidence: 0, extractedEntities: {} };
    }

    const intentList = intents
      .map(i => `- ${i.key}: ${i.label}. ${i.description}. Mots-clés: ${i.keywords.join(', ')}`)
      .join('\n');

    try {
      const response = await this.client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 512,
        thinking: { type: 'adaptive' },
        messages: [
          {
            role: 'user',
            content: `Tu es un assistant de classification pour un ERP de type ${sageType}.

Question utilisateur : "${question}"

Intentions disponibles :
${intentList}

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après :
{
  "intentKey": "<clé de l'intention la plus proche parmi la liste, ou null si aucune ne convient>",
  "confidence": <nombre entre 0.0 et 1.0>,
  "extractedEntities": {
    "period": "<mois|trimestre|annee|null>",
    "filter": "<valeur du filtre détectée dans la question, ou null>"
  }
}`,
          },
        ],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        this.logger.warn('Aucun bloc texte dans la réponse Claude');
        return { intentKey: null, confidence: 0, extractedEntities: {} };
      }

      // Supprime les balises markdown ```json ... ``` si Claude les ajoute
      const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(raw);
      return {
        intentKey: parsed.intentKey ?? null,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        extractedEntities: parsed.extractedEntities ?? {},
      };
    } catch (err) {
      this.logger.error(`Erreur classification Claude : ${err.message}`);
      return { intentKey: null, confidence: 0, extractedEntities: {} };
    }
  }

  /**
   * Génère un commentaire d'analyse CFO en français pour un KPI.
   * Destiné aux widgets du dashboard.
   */
  async generateKpiInsight(
    kpiName: string,
    data: unknown,
    unit: string,
    orgContext: { sector?: string; size?: string },
  ): Promise<string> {
    if (!this.config.get('ANTHROPIC_API_KEY')) {
      this.logger.warn('ANTHROPIC_API_KEY non configurée — insight Claude ignoré');
      return '';
    }

    const enabled = await this.isFeatureEnabled('claudeInsights');
    if (!enabled) {
      this.logger.log('Claude Insights désactivé via feature flags');
      return '';
    }

    try {
      const response = await this.client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: `Tu es analyste financier senior. Génère un commentaire court (2 à 3 phrases maximum) en français pour ce KPI, depuis la perspective d'un Directeur Administratif et Financier.

KPI : ${kpiName}${unit ? ` (${unit})` : ''}
Données : ${JSON.stringify(data)}
${orgContext.sector ? `Secteur : ${orgContext.sector}` : ''}
${orgContext.size ? `Taille entreprise : ${orgContext.size}` : ''}

Sois précis, actionnable et professionnel. Pas de bullet points. Pas de titre.`,
          },
        ],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock && textBlock.type === 'text' ? textBlock.text.trim() : '';
    } catch (err) {
      this.logger.error(`Erreur génération insight Claude : ${err.message}`);
      return '';
    }
  }
}
