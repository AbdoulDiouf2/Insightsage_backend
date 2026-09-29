/** Reviewed input envelope only. It does not certify any metric or authorize a user. */
export const financeGeneralCampaign = {
  id: 'finance_general_source_validation_v1',
  version: 1,
  registryVersion: '0a4bf4c981ffa24cdc3aea6c5d2db923fe720d3d4e9ed4d4b6b8fd3ac7481892',
  evidence: ['typed_result', 'source_row_count', 'direct_sage_reference',
    'source_grain_review', 'business_review'],
  periods: [
    ['2022-01-01T00:00:00.000Z', '2022-02-01T00:00:00.000Z'],
    ['2022-02-01T00:00:00.000Z', '2022-03-01T00:00:00.000Z'],
    ['2021-01-01T00:00:00.000Z', '2021-02-01T00:00:00.000Z'],
  ],
  metrics: [
    { key: 'revenue_ttc', dimensions: [], comparison: null },
    { key: 'gross_margin', dimensions: ['month'], comparison: null },
    { key: 'ebitda', dimensions: [], comparison: null },
  ],
} as const;
