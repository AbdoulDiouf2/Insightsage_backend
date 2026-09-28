import { Injectable } from '@nestjs/common';
import { QueryRequest } from '../contracts/query-request';
import { ResolvedPeriod, SqlParameter } from '../contracts/query-plan';
import { MetricDefinition, DimensionDefinition, SourceResource } from '../contracts/semantic-definition';
import { QueryFailure } from '../contracts/query-error';

@Injectable()
export class SqlCompilerService {
  private identifier(value: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new QueryFailure('NOT_CONFIGURED', 'Identifiant source invalide');
    return `[${value}]`;
  }
  private expression(resource: SourceResource, id: string): string {
    const expression = resource.expressions[id];
    if (!expression) throw new QueryFailure('NOT_CONFIGURED', 'Expression source non configurée');
    return expression.split('.').map(part => this.identifier(part)).join('.');
  }
  compile(metric: MetricDefinition, resource: SourceResource, dimensions: DimensionDefinition[],
    filters: Array<{ definition: DimensionDefinition; operator: string; value: unknown }>,
    period: ResolvedPeriod | undefined, request: QueryRequest) {
    const parameters: Record<string, SqlParameter> = {};
    const measure = this.expression(resource, metric.sourceMapping.measureExpressionId);
    const aggregate = metric.defaultAggregation === 'distinct_count' ? `COUNT(DISTINCT ${measure})`
      : `${metric.defaultAggregation.toUpperCase()}(${measure})`;
    const groups = dimensions.map(d => this.expression(resource, d.sourceMapping.expressionId));
    const exactAggregate = metric.dataType === 'currency'
      ? `CONVERT(varchar(64), ${aggregate})` : aggregate;
    const select = [`${exactAggregate} AS [value]`,
      `COUNT_BIG(*) AS [__source_row_count]`,
      ...groups.map((g, i) => `${g} AS ${this.identifier(dimensions[i].key)}`)];
    const clauses: string[] = [];
    for (const [i, filter] of (resource.fixedFilters ?? []).entries()) {
      const name = `source${i}`;
      const expression = this.expression(resource, filter.expressionId);
      parameters[name] = filter.operator === 'starts_with' ? `${filter.value}%` : filter.value;
      clauses.push(`${expression} ${filter.operator === 'starts_with' ? 'LIKE' : '='} @${name}`);
    }
    if (period) {
      const date = this.expression(resource, period.dateDimension);
      if (resource.dateStorage === 'local_date') {
        const localDay = (instant: string) => new Intl.DateTimeFormat('en-CA', {
          timeZone: period.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date(instant));
        const startDay = localDay(period.fromInclusive);
        const endDay = localDay(period.toExclusive);
        // Une DATE source ne peut représenter des bornes intrajournalières.
        const localMidnight = (instant: string) => {
          const parts = new Intl.DateTimeFormat('en-GB', { timeZone: period.timezone,
            hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
            .format(new Date(instant));
          return parts === '00:00:00';
        };
        if (!localMidnight(period.fromInclusive) || !localMidnight(period.toExclusive))
          throw new QueryFailure('QUERY_INVALID', 'La source DATE exige des bornes locales à minuit');
        parameters.periodFrom = startDay;
        parameters.periodTo = endDay;
      } else {
        parameters.periodFrom = period.fromInclusive;
        parameters.periodTo = period.toExclusive;
      }
      clauses.push(`${date} >= @periodFrom AND ${date} < @periodTo`);
    }
    filters.forEach((filter, i) => {
      const expression = this.expression(resource, filter.definition.sourceMapping.expressionId);
      const name = `f${i}`;
      const value = filter.value;
      if (value === null) {
        if (!['eq', 'neq'].includes(filter.operator)) throw new QueryFailure('QUERY_INVALID', 'Opérateur NULL invalide');
        clauses.push(`${expression} IS ${filter.operator === 'neq' ? 'NOT ' : ''}NULL`);
        return;
      }
      if (Array.isArray(value)) {
        if (filter.operator === 'between') {
          parameters[`${name}_0`] = value[0] as SqlParameter;
          parameters[`${name}_1`] = value[1] as SqlParameter;
          clauses.push(`${expression} BETWEEN @${name}_0 AND @${name}_1`);
        } else {
          const placeholders = value.map((item, j) => {
            parameters[`${name}_${j}`] = item as SqlParameter;
            return `@${name}_${j}`;
          });
          clauses.push(`${expression} ${filter.operator === 'not_in' ? 'NOT IN' : 'IN'} (${placeholders.join(', ')})`);
        }
        return;
      }
      parameters[name] = filter.operator === 'contains' ? `%${String(value).replace(/[\%_]/g, '\\$&')}%` : value as SqlParameter;
      const op: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', contains: 'LIKE' };
      clauses.push(`${expression} ${op[filter.operator]} @${name}${filter.operator === 'contains' ? " ESCAPE '\\'" : ''}`);
    });
    const table = resource.table.split('.').map(part => this.identifier(part)).join('.');
    const top = request.limit ?? 1000;
    const groupBy = groups.length ? ` GROUP BY ${groups.join(', ')}` : '';
    const orderBy = request.sort?.length ? ` ORDER BY ${request.sort.map(s =>
      `${this.expression(resource, dimensions.find(d => d.key === s.field)!.sourceMapping.expressionId)} ${s.direction.toUpperCase()}`).join(', ')}` :
      groups.length ? ` ORDER BY ${groups.map(g => `${g} ASC`).join(', ')}` : '';
    const statement = `SELECT TOP (${top}) ${select.join(', ')} FROM ${table}` +
      (clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '') + groupBy + orderBy;
    return { statement, parameters };
  }
}
