import { DimensionDefinition } from '../../contracts/semantic-definition';

export const revenueMonthDimension: DimensionDefinition = {
  key: 'month', label: 'Mois comptable', dataType: 'string',
  sourceMapping: { connector: 'sage100', resource: 'finance_general', expressionId: 'month' },
  allowedOperators: [], nullable: false,
  comparisonAlignment: 'calendar_month_offset',
  temporalGrain: 'month',
};
