import { MeasureType, ValueType } from './semantic-definition';
export interface QueryResultField {
  key: string;
  type: MeasureType | ValueType;
  nullable: boolean;
  unit?: string;
  role: 'metric' | 'dimension' | 'comparison';
}
export interface QueryResult {
  queryId: string;
  status: 'success' | 'empty';
  schema: QueryResultField[];
  rows: Record<string, unknown>[];
  meta: {
    rowCount: number;
    generatedAt: string;
    queryExecutedAt: string;
    sourceFreshness?: string;
    cachedAt?: string;
    executionTimeMs?: number;
    cache: 'none' | 'browser' | 'backend';
    truncated: boolean;
  };
}
