import { SemanticRegistryService } from '../../semantic/semantic-registry.service';
import { financeGeneralCampaign } from './finance-general.campaign';

export interface CertificationCampaign {
  id: string;
  family: string;
  version: number;
  registryVersion: string;
  evidence: readonly string[];
  periods: readonly (readonly [string, string])[];
  metrics: readonly {
    readonly key: string;
    readonly dimensions: readonly string[];
    readonly comparison: string | null;
  }[];
}

// Server-owned declarations only. Adding a family requires a reviewed campaign,
// not a new route or a branch in the certification engine.
export const certificationCampaigns: readonly CertificationCampaign[] = [
  { ...financeGeneralCampaign, family: 'finance_general' },
];

export function validateCampaigns(
  campaigns: readonly CertificationCampaign[],
  registry: SemanticRegistryService,
): void {
  const ids = new Set<string>();
  const cases = new Set<string>();
  for (const campaign of campaigns) {
    if (
      !campaign.id ||
      ids.has(campaign.id) ||
      campaign.version !== 1 ||
      campaign.registryVersion !== registry.version ||
      !campaign.periods.length ||
      !campaign.metrics.length ||
      !campaign.evidence.length
    )
      throw new Error(
        `Invalid or stale certification campaign: ${campaign.id}`,
      );
    ids.add(campaign.id);
    for (const [from, to] of campaign.periods) {
      if (
        !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(from) ||
        !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(to) ||
        from >= to
      )
        throw new Error(`Invalid campaign period: ${campaign.id}`);
      for (const metricCase of campaign.metrics) {
        const metric = registry.metric(metricCase.key);
        if (
          metric.family !== campaign.family ||
          metric.certification.state !== 'awaiting_source_validation' ||
          metricCase.dimensions.some(
            (d) => !metric.allowedDimensions.includes(d),
          ) ||
          metricCase.comparison !== null
        )
          throw new Error(
            `Invalid campaign metric: ${campaign.id}/${metricCase.key}`,
          );
        const key = JSON.stringify([
          metricCase.key,
          from,
          to,
          metricCase.dimensions,
          metricCase.comparison,
        ]);
        if (cases.has(key))
          throw new Error(`Duplicated campaign case: ${campaign.id}`);
        cases.add(key);
      }
    }
  }
}
