import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { QueryRequest } from '../contracts/query-request';
import { QueryPlan } from '../contracts/query-plan';
import { QueryFailure } from '../contracts/query-error';
import { SemanticRegistryService } from '../semantic/semantic-registry.service';
import { QueryValidatorService } from './query-validator.service';
import { PeriodResolverService } from './period-resolver.service';
import { SqlCompilerService } from './sql-compiler.service';
import { AuthenticatedIdentity } from './security-scope.service';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
@Injectable()
export class QueryPlannerService {
  constructor(private readonly registry: SemanticRegistryService,
    private readonly validator: QueryValidatorService,
    private readonly periods: PeriodResolverService,
    private readonly compiler: SqlCompilerService) {}

  plan(request: QueryRequest, user: AuthenticatedIdentity, timezone: string, now = new Date()): QueryPlan {
    const { metric, resource, securityScope } = this.validator.validate(request, user);
    const dimensions = (request.dimensions ?? []).map(key => this.registry.dimension(key));
    const filters = (request.filters ?? []).map(f => ({ definition: this.registry.dimension(f.field),
      operator: f.operator, value: f.value }));
    const period = this.periods.resolve(request.period, timezone,
      metric.sourceMapping.dateDimension ?? '', now);
    if (request.comparison && !period)
      throw new QueryFailure('QUERY_INVALID', 'Période requise pour une comparaison');
    const comparison = request.comparison && period &&
      (request.comparison.type === 'previous_period' || request.comparison.type === 'previous_year')
      ? this.periods.compare(period, request.comparison.type, request.period) : undefined;
    const execution = this.compiler.compile(metric, resource, dimensions, filters, period, request);
    const comparisonExecution = comparison
      ? this.compiler.compile(metric, resource, dimensions, filters, comparison, request) : undefined;
    const semantic = {
      scope: securityScope,
      metric: metric.key,
      dimensions: [...(request.dimensions ?? [])].sort(),
      filters: (request.filters ?? []).map(f => ({ field: f.field, operator: f.operator, value: f.value }))
        .sort((a, b) => canonical(a).localeCompare(canonical(b))),
      period, comparison: comparison ? { type: request.comparison!.type, period: comparison } : request.comparison, currency: request.currency ?? metric.sourceMapping.sourceCurrency,
      sort: request.sort, limit: request.limit ?? 1000,
      connector: resource.connector, resource: resource.key, schemaVersion: resource.schemaVersion,
      registryVersion: this.registry.version,
    };
    return {
      version: '2', queryId: randomUUID(), requestId: request.context?.requestId ?? randomUUID(),
      securityScope, metric,
      dimensions: dimensions.map(d => ({ key: d.key, expressionId: d.sourceMapping.expressionId,
        dataType: d.dataType, comparisonAlignment: d.comparisonAlignment })),
      analyticalFilters: (request.filters ?? []).map((f, i) => ({
        field: f.field, expressionId: filters[i].definition.sourceMapping.expressionId,
        operator: f.operator, value: f.value,
        parameterNames: Object.keys(execution.parameters).filter(k => k.startsWith(`f${i}`)),
      })),
      period, comparison: comparison ? { type: request.comparison!.type,
        fromInclusive: comparison.fromInclusive, toExclusive: comparison.toExclusive } : undefined,
      source: { connector: resource.connector, resource: resource.key, schemaVersion: resource.schemaVersion },
      execution, comparisonExecution, limits: { maxRows: request.limit ?? 1000, timeoutMs: 30000 },
      queryFingerprint: createHash('sha256').update(canonical(semantic)).digest('hex'),
      registryVersion: this.registry.version,
    };
  }
}
