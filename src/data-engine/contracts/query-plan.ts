import { SecurityScope } from './security-scope';
import { MetricDefinition, ValueType, ConnectorId, ComparisonType } from './semantic-definition';
import { FilterOperator } from './query-request';
export type SqlParameter = string | number | boolean | null;
export interface ResolvedDimension { key: string; expressionId: string; dataType: ValueType }
export interface ResolvedFilter { field: string; expressionId: string; operator: FilterOperator; value: unknown; parameterNames: string[] }
export interface ResolvedPeriod { dateDimension: string; fromInclusive: string; toExclusive: string; timezone: string }
export interface ResolvedComparison { type: ComparisonType; fromInclusive?: string; toExclusive?: string; sourceKey?: string }
export interface QueryPlan {
  version: '2';
  queryId: string;
  requestId: string;
  securityScope: SecurityScope;
  metric: MetricDefinition;
  dimensions: ResolvedDimension[];
  analyticalFilters: ResolvedFilter[];
  period?: ResolvedPeriod;
  comparison?: ResolvedComparison;
  source: { connector: ConnectorId; resource: string; schemaVersion: string };
  execution: { statement: string; parameters: Record<string, SqlParameter> };
  comparisonExecution?: { statement: string; parameters: Record<string, SqlParameter> };
  limits: { maxRows: number; timeoutMs: number };
  queryFingerprint: string;
  registryVersion: string;
}
