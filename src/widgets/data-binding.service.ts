import { BadRequestException, Injectable } from '@nestjs/common';
import { SemanticRegistryService } from '../data-engine/semantic/semantic-registry.service';

export interface DataEngineBinding {
  kind: 'data_engine_v2';
  metric: string;
  defaults?: { comparison?: 'previous_period' | 'previous_year' };
}

const exactKeys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every(key => allowed.includes(key));

@Injectable()
export class DataBindingService {
  constructor(private readonly registry: SemanticRegistryService) {}

  validate(value: unknown, visualization?: string): DataEngineBinding | null {
    if (value == null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Binding invalide');
    const binding = value as Record<string, unknown>;
    if (!exactKeys(binding, ['kind', 'metric', 'defaults']) ||
      binding.kind !== 'data_engine_v2' || typeof binding.metric !== 'string' || !binding.metric)
      throw new BadRequestException('Binding invalide');
    let comparison: 'previous_period' | 'previous_year' | undefined;
    if (binding.defaults !== undefined) {
      if (!binding.defaults || typeof binding.defaults !== 'object' || Array.isArray(binding.defaults) ||
        !exactKeys(binding.defaults as Record<string, unknown>, ['comparison']))
        throw new BadRequestException('Defaults de binding invalides');
      const raw = (binding.defaults as Record<string, unknown>).comparison;
      if (raw !== undefined && raw !== 'previous_period' && raw !== 'previous_year')
        throw new BadRequestException('Comparaison de binding invalide');
      comparison = raw as typeof comparison;
    }
    let metric;
    try { metric = this.registry.metric(binding.metric); }
    catch { throw new BadRequestException('Metrique V2 inconnue'); }
    if (comparison && !metric.supportedComparisons.includes(comparison))
      throw new BadRequestException('Comparaison incompatible avec la metrique');
    if (visualization && !metric.supportedVisualizations.includes(visualization))
      throw new BadRequestException('Visualisation incompatible avec la metrique');
    return { kind: 'data_engine_v2', metric: binding.metric,
      ...(binding.defaults !== undefined ? { defaults: comparison ? { comparison } : {} } : {}) };
  }

  publicValue(value: unknown, visualization?: string): DataEngineBinding | { kind: 'unavailable' } | null {
    if (value == null) return null;
    try { return this.validate(value, visualization); }
    catch { return { kind: 'unavailable' }; }
  }
}
