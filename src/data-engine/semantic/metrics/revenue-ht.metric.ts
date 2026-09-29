import { MetricDefinition } from '../../contracts/semantic-definition';

// Source CA HT existante : la formule financière appartient à la vue Sage.
export const revenueHtMetric: MetricDefinition = {
  key: 'revenue_ht', family: 'finance_general', label: 'Chiffre d’affaires HT',
  description: 'Somme de la colonne ca_ht exposée par la vue finance Sage.',
  dataType: 'currency', defaultAggregation: 'sum',
  allowedDimensions: ['month'], allowedFilters: [],
  supportedComparisons: ['previous_period', 'previous_year'],
  supportedVisualizations: ['card', 'table'],
  sourceMapping: { connector: 'sage100', resource: 'finance_general',
    measureExpressionId: 'revenue', dateDimension: 'accounting_date', sourceCurrency: 'XOF' },
  defaultCacheTtlSeconds: 60, nullPolicy: 'preserve', requiresPeriod: true,
  certificationStatus: 'certified',
  resultPolicy: { unit: 'XOF', scale: 2, valueEncoding: 'decimal_string',
    sourceRowCount: 'required', empty: 'preserve', shapes: ['scalar', 'time_series'],
    dimensionPatterns: { month: '^\\d{4}-\\d{2}$' } },
  requiredPermission: { action: 'read', resource: 'data' },
};
