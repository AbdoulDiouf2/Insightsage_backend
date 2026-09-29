import { FilterOperator } from './query-request';
export type ConnectorId = string;
export type ValueType = 'string' | 'date' | 'number' | 'boolean';
export type MeasureType = 'currency' | 'number' | 'percentage' | 'duration';
export type Aggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct_count';
export type ResultShape = 'scalar' | 'time_series';
export interface MetricResultPolicy {
  unit: string;
  scale?: number;
  precision?: number;
  valueEncoding: 'decimal_string' | 'number';
  sourceRowCount: 'required' | 'optional';
  empty: 'preserve' | 'zero_if_empty_set';
  shapes: ResultShape[];
  dimensionPatterns?: Record<string, string>;
}
export type ComparisonType = 'previous_period' | 'previous_year' | 'budget' | 'target';
export interface SourceMetricMapping {
  connector: ConnectorId;
  resource: string;
  measureExpressionId: string;
  dateDimension?: string;
  sourceCurrency?: string;
  sourceTimezone?: string;
}
export interface SourceDimensionMapping {
  connector: ConnectorId;
  resource: string;
  expressionId: string;
}
export interface MetricDefinition {
  key: string;
  family?: string;
  label: string;
  description?: string;
  dataType: MeasureType;
  defaultAggregation: Aggregation;
  allowedDimensions: string[];
  allowedFilters: string[];
  supportedComparisons: ComparisonType[];
  supportedVisualizations: string[];
  sourceMapping: SourceMetricMapping;
  defaultCacheTtlSeconds: number;
  nullPolicy: 'preserve' | 'zero_if_empty_set';
  resultPolicy?: MetricResultPolicy;
  certificationStatus?: 'certified' | 'uncertified';
  requiresPeriod?: boolean;
  requiredPermission: { action: string; resource: string };
}
export interface DimensionDefinition {
  key: string;
  label: string;
  dataType: ValueType;
  sourceMapping: SourceDimensionMapping;
  allowedOperators: FilterOperator[];
  nullable: boolean;
  comparisonAlignment?: 'calendar_month_offset';
  temporalGrain?: 'month';
}
export interface SourceResource {
  connector: ConnectorId;
  key: string;
  schemaVersion: string;
  table: string; // identifiant SQL revu côté serveur
  expressions: Record<string, string>; // expressionId -> identifiant SQL revu
  dateStorage?: 'local_date';
  fixedFilters?: Array<{ expressionId: string; operator: 'starts_with' | 'eq'; value: string }>;
}
