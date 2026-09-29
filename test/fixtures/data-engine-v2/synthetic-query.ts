import { SemanticRegistryService } from '../../../src/data-engine/semantic/semantic-registry.service';
import { AuthenticatedIdentity } from '../../../src/data-engine/planner/security-scope.service';
import { metricDefinitionHash } from '../../../src/data-engine/certification/certification-state';
import { MetricDefinition } from '../../../src/data-engine/contracts/semantic-definition';

export const user = (organizationId = 'org-1'): AuthenticatedIdentity => ({
  id: 'user-1', organizationId,
  userRoles: [{ role: { permissions: [{ permission: { action: 'read', resource: 'data' } }] } }],
});
export function registerSynthetic(registry: SemanticRegistryService) {
  registry.registerResource({ connector: 'simulated', key: 'synthetic', schemaVersion: '1',
    table: 'dbo.Synthetic', expressions: { amount: 'Amount', date: 'TxnDate', region: 'Region' } });
  const metric: MetricDefinition = { key: 'synthetic_amount', label: 'Synthetic amount', dataType: 'number',
    defaultAggregation: 'sum', allowedDimensions: ['region'], allowedFilters: ['region'],
    supportedComparisons: ['previous_period', 'previous_year'], supportedVisualizations: ['card'],
    sourceMapping: { connector: 'simulated', resource: 'synthetic', measureExpressionId: 'amount',
      dateDimension: 'date', sourceCurrency: 'XOF' },
    defaultCacheTtlSeconds: 60, nullPolicy: 'preserve',
    certification: { version: 1, state: 'certified', evidence: {
      referenceId: 'synthetic-fixture', reviewedAt: '2026-09-29', source: 'in-memory',
      definitionSha256: '', periodFrom: '2022-01-01', periodTo: '2022-02-01',
      value: '1', sourceRows: 1 } },
    requiredPermission: { action: 'read', resource: 'data' } };
  metric.certification.evidence!.definitionSha256 = metricDefinitionHash(metric);
  registry.registerMetric(metric);
  registry.registerDimension({ key: 'region', label: 'Region', dataType: 'string',
    sourceMapping: { connector: 'simulated', resource: 'synthetic', expressionId: 'region' },
    allowedOperators: ['eq', 'in'], nullable: false });
}
