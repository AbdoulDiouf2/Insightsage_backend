import { BadRequestException, Injectable } from '@nestjs/common';
import { SemanticRegistryService } from '../data-engine/semantic/semantic-registry.service';
import { ResultShape } from '../data-engine/contracts/semantic-definition';

export interface DataEngineBinding {
  kind: 'data_engine_v2';
  metric: string;
  defaults?: { comparison?: 'previous_period' | 'previous_year' };
  query?: { dimensions?: string[]; comparison?: 'previous_period' | 'previous_year' };
  presentation?: { shape: ResultShape };
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
    if (!exactKeys(binding, ['kind', 'metric', 'defaults', 'query', 'presentation']) ||
      binding.kind !== 'data_engine_v2' || typeof binding.metric !== 'string' || !binding.metric)
      throw new BadRequestException('Binding invalide');
    if (binding.defaults !== undefined && binding.query !== undefined)
      throw new BadRequestException('Deux contrats de requete incompatibles');
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
    let dimensions: string[] = [];
    if (binding.query !== undefined) {
      if (!binding.query || typeof binding.query !== 'object' || Array.isArray(binding.query) ||
          !exactKeys(binding.query as Record<string, unknown>, ['dimensions', 'comparison']))
        throw new BadRequestException('Requete de binding invalide');
      const query = binding.query as Record<string, unknown>;
      if (query.dimensions !== undefined &&
          (!Array.isArray(query.dimensions) || !query.dimensions.every(d => typeof d === 'string') ||
            new Set(query.dimensions).size !== query.dimensions.length))
        throw new BadRequestException('Dimensions de binding invalides');
      dimensions = query.dimensions as string[] ?? [];
      if (query.comparison !== undefined &&
          query.comparison !== 'previous_period' && query.comparison !== 'previous_year')
        throw new BadRequestException('Comparaison de binding invalide');
      comparison = query.comparison as typeof comparison;
    }
    let shape: ResultShape = 'scalar';
    if (binding.presentation !== undefined) {
      if (!binding.presentation || typeof binding.presentation !== 'object' ||
          Array.isArray(binding.presentation) ||
          !exactKeys(binding.presentation as Record<string, unknown>, ['shape']))
        throw new BadRequestException('Presentation de binding invalide');
      const value = (binding.presentation as Record<string, unknown>).shape;
      if (value !== 'scalar' && value !== 'time_series')
        throw new BadRequestException('Forme de binding invalide');
      shape = value;
    }
    let metric;
    try { metric = this.registry.metric(binding.metric); }
    catch { throw new BadRequestException('Metrique V2 inconnue'); }
    if (metric.certificationStatus === 'uncertified')
      throw new BadRequestException('Metrique V2 non certifiee');
    if (comparison && !metric.supportedComparisons.includes(comparison))
      throw new BadRequestException('Comparaison incompatible avec la metrique');
    if (metric.resultPolicy && !metric.resultPolicy.shapes.includes(shape))
      throw new BadRequestException('Forme incompatible avec la metrique');
    if (shape === 'scalar' && dimensions.length || shape === 'time_series' && dimensions.length !== 1)
      throw new BadRequestException('Forme et dimensions incompatibles');
    for (const key of dimensions) {
      if (!metric.allowedDimensions.includes(key))
        throw new BadRequestException('Dimension incompatible avec la metrique');
      const dimension = this.registry.dimension(key);
      if (dimension.sourceMapping.connector !== metric.sourceMapping.connector ||
          dimension.sourceMapping.resource !== metric.sourceMapping.resource ||
          shape === 'time_series' && !dimension.temporalGrain ||
          comparison && !dimension.comparisonAlignment)
        throw new BadRequestException('Dimension incompatible avec la source');
    }
    if (visualization && !metric.supportedVisualizations.includes(visualization))
      throw new BadRequestException('Visualisation incompatible avec la metrique');
    return { kind: 'data_engine_v2', metric: binding.metric,
      ...(binding.defaults !== undefined ? { defaults: comparison ? { comparison } : {} } : {}),
      ...(binding.query !== undefined ? { query: { dimensions,
        ...(comparison ? { comparison } : {}) } } : {}),
      ...(binding.presentation !== undefined ? { presentation: { shape } } : {}) };
  }

  publicValue(value: unknown, visualization?: string): DataEngineBinding | { kind: 'unavailable' } | null {
    if (value == null) return null;
    try { return this.validate(value, visualization); }
    catch { return { kind: 'unavailable' }; }
  }
}
