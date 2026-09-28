import { SemanticRegistryService } from '../../../src/data-engine/semantic/semantic-registry.service';
import { AuthenticatedIdentity } from '../../../src/data-engine/planner/security-scope.service';

export const user = (organizationId = 'org-1'): AuthenticatedIdentity => ({
  id: 'user-1', organizationId,
  userRoles: [{ role: { permissions: [{ permission: { action: 'read', resource: 'data' } }] } }],
});
export function registerSynthetic(registry: SemanticRegistryService) {
  registry.registerResource({ connector: 'simulated', key: 'synthetic', schemaVersion: '1',
    table: 'dbo.Synthetic', expressions: { amount: 'Amount', date: 'TxnDate', region: 'Region' } });
  registry.registerMetric({ key: 'synthetic_amount', label: 'Synthetic amount', dataType: 'number',
    defaultAggregation: 'sum', allowedDimensions: ['region'], allowedFilters: ['region'],
    supportedComparisons: ['previous_period', 'previous_year'], supportedVisualizations: ['card'],
    sourceMapping: { connector: 'simulated', resource: 'synthetic', measureExpressionId: 'amount',
      dateDimension: 'date', sourceCurrency: 'XOF' },
    defaultCacheTtlSeconds: 60, nullPolicy: 'preserve',
    requiredPermission: { action: 'read', resource: 'data' } });
  registry.registerDimension({ key: 'region', label: 'Region', dataType: 'string',
    sourceMapping: { connector: 'simulated', resource: 'synthetic', expressionId: 'region' },
    allowedOperators: ['eq', 'in'], nullable: false });
}
