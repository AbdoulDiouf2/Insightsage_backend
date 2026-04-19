import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LocalLlmService {
  private readonly logger = new Logger(LocalLlmService.name);

  /**
   * Liste les modèles disponibles sur le serveur local (API OpenAI-compatible).
   * Compatible avec Ollama (/v1/models), LM Studio, llama.cpp.
   */
  async listModels(baseUrl: string): Promise<string[]> {
    const url = `${baseUrl.replace(/\/$/, '')}/v1/models`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Impossible de contacter le serveur LLM local : ${response.status}`);
    }

    const data = await response.json();
    // Format OpenAI-compatible : { data: [{ id: 'model-name', ... }] }
    return (data.data ?? []).map((m: { id: string }) => m.id);
  }

  /**
   * Génère un insight CFO via un LLM local (API OpenAI-compatible).
   * Même interface que ClaudeService.generateKpiInsight().
   */
  async generateKpiInsight(
    kpiName: string,
    data: unknown,
    unit: string,
    orgContext: { sector?: string; size?: string },
    baseUrl: string,
    model: string,
  ): Promise<string> {
    const prompt = `Tu es analyste financier senior. Génère un commentaire court (2 à 3 phrases maximum) en français pour ce KPI, depuis la perspective d'un Directeur Administratif et Financier.

KPI : ${kpiName}${unit ? ` (${unit})` : ''}
Données : ${JSON.stringify(data)}
${orgContext.sector ? `Secteur : ${orgContext.sector}` : ''}
${orgContext.size ? `Taille entreprise : ${orgContext.size}` : ''}

Sois précis, actionnable et professionnel. Pas de bullet points. Pas de titre.`;

    const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Erreur LLM local : ${response.status}`);
    }

    const data2 = await response.json();
    return (data2.choices?.[0]?.message?.content ?? '').trim();
  }

  /**
   * Classifie une intention NLQ via un LLM local (API OpenAI-compatible).
   * Même interface de retour que ClaudeService.classifyNlqIntent().
   */
  async classifyNlqIntent(
    question: string,
    intents: Array<{ key: string; label: string; description: string | null; keywords: string[] }>,
    sageType: string,
    baseUrl: string,
    model: string,
  ): Promise<{
    intentKey: string | null;
    confidence: number;
    extractedEntities: Record<string, string | null>;
  }> {
    const intentList = intents
      .map(i => `- ${i.key}: ${i.label}. ${i.description ?? ''}. Mots-clés: ${i.keywords.join(', ')}`)
      .join('\n');

    const prompt = `Tu es un assistant de classification pour un ERP de type ${sageType}.

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
}`;

    const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Erreur LLM local : ${response.status}`);
    }

    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content ?? '';

    // Supprime les balises markdown si le modèle les ajoute
    const raw = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(raw);

    return {
      intentKey: parsed.intentKey ?? null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      extractedEntities: parsed.extractedEntities ?? {},
    };
  }
}
