import { MetricDefinition } from '../../contracts/semantic-definition';

// Source CA HT existante : la formule financière appartient à la vue Sage.
export const revenueHtMetric: MetricDefinition = {
  key: 'revenue_ht', label: 'Chiffre d’affaires HT',
  description: 'Somme de la colonne ca_ht exposée par la vue finance Sage.',
  dataType: 'currency', defaultAggregation: 'sum',
  allowedDimensions: ['month'], allowedFilters: [],
  supportedComparisons: ['previous_period', 'previous_year'],
  supportedVisualizations: ['card', 'table'],
  sourceMapping: { connector: 'sage100', resource: 'finance_general',
    measureExpressionId: 'revenue', dateDimension: 'accounting_date', sourceCurrency: 'XOF' },
  defaultCacheTtlSeconds: 60, nullPolicy: 'preserve', requiresPeriod: true,
  requiredPermission: { action: 'read', resource: 'data' },
};
