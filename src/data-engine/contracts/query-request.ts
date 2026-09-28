import { Type } from 'class-transformer';
import { Allow, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export const FILTER_OPERATORS = ['eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'between', 'contains'] as const;
export type FilterOperator = typeof FILTER_OPERATORS[number];
export const RELATIVE_PERIODS = ['today', 'current_week', 'current_month', 'current_quarter', 'current_year', 'previous_month', 'previous_quarter', 'previous_year'] as const;

export class QueryFilter {
  @IsString() field!: string;
  @IsIn(FILTER_OPERATORS) operator!: FilterOperator;
  @Allow() value!: string | number | boolean | null | Array<string | number | boolean>;
}
export type AnalyticalFilters = QueryFilter[];

export class PeriodDefinition {
  @IsIn(['relative', 'absolute']) type!: 'relative' | 'absolute';
  @IsOptional() @IsIn(RELATIVE_PERIODS) value?: typeof RELATIVE_PERIODS[number];
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}
export class ComparisonDefinition {
  @IsIn(['previous_period', 'previous_year', 'budget', 'target'])
  type!: 'previous_period' | 'previous_year' | 'budget' | 'target';
}
export class SortDefinition {
  @IsString() field!: string;
  @IsIn(['asc', 'desc']) direction!: 'asc' | 'desc';
}
export class QueryContext {
  @IsOptional() @IsString() requestId?: string;
  @IsOptional() @IsString() dashboardId?: string;
  @IsOptional() @IsString() widgetId?: string;
  @IsOptional() @IsIn(['dashboard', 'exploration', 'export', 'zuri']) source?: 'dashboard' | 'exploration' | 'export' | 'zuri';
}
export class QueryRequest {
  @IsIn(['2']) version!: '2';
  @IsString() metric!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) dimensions?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => QueryFilter) filters?: AnalyticalFilters;
  @IsOptional() @ValidateNested() @Type(() => PeriodDefinition) period?: PeriodDefinition;
  @IsOptional() @ValidateNested() @Type(() => ComparisonDefinition) comparison?: ComparisonDefinition;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SortDefinition) sort?: SortDefinition[];
  @IsOptional() @IsInt() @Min(1) @Max(1000) limit?: number;
  @IsOptional() @ValidateNested() @Type(() => QueryContext) context?: QueryContext;
}
