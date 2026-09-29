import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DimensionDefinition, MetricDefinition, SourceResource } from '../contracts/semantic-definition';
import { QueryFailure } from '../contracts/query-error';
import { revenueHtMetric } from './metrics/revenue-ht.metric';
import { revenueMonthDimension } from './dimensions/sage100-finance.dimensions';
import { financeGeneralResource } from '../connectors/sage100/sage100-finance.resources';

@Injectable()
export class SemanticRegistryService {
  get version(): string {
    const entries = [this.metrics, this.dimensions, this.resources].map(map =>
      [...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
    return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  }
  private readonly metrics = new Map<string, MetricDefinition>();
  private readonly dimensions = new Map<string, DimensionDefinition>();
  private readonly resources = new Map<string, SourceResource>();
  constructor() {
    this.registerResource(financeGeneralResource);
    this.registerDimension(revenueMonthDimension);
    this.registerMetric(revenueHtMetric);
  }

  // Les définitions ne sont enregistrées que par du code backend audité.
  registerMetric(metric: MetricDefinition) { this.metrics.set(metric.key, metric); }
  registerDimension(dimension: DimensionDefinition) { this.dimensions.set(dimension.key, dimension); }
  registerResource(resource: SourceResource) { this.resources.set(`${resource.connector}:${resource.key}`, resource); }
  metric(key: string): MetricDefinition {
    const value = this.metrics.get(key);
    if (!value) throw new QueryFailure('NOT_CONFIGURED', 'Métrique non configurée');
    return value;
  }
  dimension(key: string): DimensionDefinition {
    const value = this.dimensions.get(key);
    if (!value) throw new QueryFailure('QUERY_INVALID', 'Dimension ou filtre inconnu');
    return value;
  }
  resource(connector: string, key: string): SourceResource {
    const value = this.resources.get(`${connector}:${key}`);
    if (!value) throw new QueryFailure('NOT_CONFIGURED', 'Source non configurée');
    return value;
  }
}
