import { MetricDefinition } from '../../contracts/semantic-definition';

// These columns occur in deployed V1 templates. Their grain and values still require
// a controlled Sage certification before either metric may be queried or bound.
const common = {
  family: 'finance_general', dataType: 'currency' as const,
  defaultAggregation: 'sum' as const, allowedDimensions: ['month'], allowedFilters: [],
  supportedComparisons: [], sourceMapping: { connector: 'sage100',
    resource: 'finance_general', dateDimension: 'accounting_date', sourceCurrency: 'XOF' },
  defaultCacheTtlSeconds: 60, nullPolicy: 'preserve' as const, requiresPeriod: true,
  certification: { version: 1 as const, state: 'awaiting_source_validation' as const,
    reason: 'Source, grain et formule Sage non certifies' },
  resultPolicy: { unit: 'XOF', scale: 2, valueEncoding: 'decimal_string' as const,
    sourceRowCount: 'required' as const, empty: 'preserve' as const,
    shapes: ['scalar', 'time_series'] as const, dimensionPatterns: { month: '^\\d{4}-\\d{2}$' } },
  requiredPermission: { action: 'read', resource: 'data' },
};

export const revenueTtcMetric: MetricDefinition = {
  ...common, key: 'revenue_ttc', label: 'Chiffre d’affaires TTC',
  supportedVisualizations: ['card', 'table'],
  sourceMapping: { ...common.sourceMapping, measureExpressionId: 'revenue_ttc' },
  resultPolicy: { ...common.resultPolicy, shapes: [...common.resultPolicy.shapes] },
};

export const grossMarginMetric: MetricDefinition = {
  ...common, key: 'gross_margin', label: 'Marge brute',
  supportedVisualizations: ['card', 'bar', 'line', 'table'],
  sourceMapping: { ...common.sourceMapping, measureExpressionId: 'gross_margin' },
  resultPolicy: { ...common.resultPolicy, shapes: [...common.resultPolicy.shapes] },
};

export const ebitdaMetric: MetricDefinition = {
  ...common, key: 'ebitda', label: 'EBITDA',
  supportedVisualizations: ['card', 'table'],
  sourceMapping: { ...common.sourceMapping, measureExpressionId: 'ebitda' },
  resultPolicy: { ...common.resultPolicy, shapes: ['scalar'] },
};
