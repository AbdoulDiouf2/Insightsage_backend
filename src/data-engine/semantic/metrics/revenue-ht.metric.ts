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
  certification: { version: 1, state: 'certified', evidence: {
    referenceId: 'docs/data-engine/pilots/revenue-ht-certification.md#gate-1',
    reviewedAt: '2026-09-29', source: 'BIJOU/VW_FINANCE_GENERAL',
    definitionSha256: 'fd505e68e3f3b054d726cd6a6dde531c513de011f6e5c63e0f189e86aee06bec',
    periodFrom: '2022-01-01', periodTo: '2022-02-01',
    value: '4186862.37', sourceRows: 62 } },
  resultPolicy: { unit: 'XOF', scale: 2, valueEncoding: 'decimal_string',
    sourceRowCount: 'required', empty: 'preserve', shapes: ['scalar', 'time_series'],
    dimensionPatterns: { month: '^\\d{4}-\\d{2}$' } },
  requiredPermission: { action: 'read', resource: 'data' },
};
