import { SemanticRegistryService } from '../semantic/semantic-registry.service';
import { SecurityScopeService } from './security-scope.service';
import { QueryValidatorService } from './query-validator.service';
import { PeriodResolverService } from './period-resolver.service';
import { SqlCompilerService } from './sql-compiler.service';
import { QueryPlannerService } from './query-planner.service';
import { registerSynthetic, user } from '../../../test/fixtures/data-engine-v2/synthetic-query';

describe('QueryPlanner V2', () => {
  const registry = new SemanticRegistryService();
  registerSynthetic(registry);
  const planner = new QueryPlannerService(registry,
    new QueryValidatorService(registry, new SecurityScopeService()),
    new PeriodResolverService(), new SqlCompilerService());
  const base = { version: '2' as const, metric: 'synthetic_amount',
    dimensions: ['region'], filters: [{ field: 'region', operator: 'eq' as const, value: 'Dakar' }] };

  it('planifie une comparaison avec bornes explicites et valeurs paramétrées', () => {
    const plan = planner.plan({ ...base,
      period: { type: 'absolute', from: '2026-09-01T00:00:00Z', to: '2026-10-01T00:00:00Z' },
      comparison: { type: 'previous_period' } }, user(), 'UTC');
    expect(plan.comparison?.fromInclusive).toBe('2026-08-02T00:00:00.000Z');
    expect(plan.comparisonExecution?.parameters.periodFrom).toBe(plan.comparison?.fromInclusive);
    expect(plan.comparisonExecution?.statement).not.toContain('Dakar');
    expect(plan.comparisonExecution?.parameters.f0).toBe('Dakar');
  });
  it('produit un SQL dont les valeurs sont paramétrées', () => {
    const plan = planner.plan(base, user(), 'Africa/Dakar');
    expect(plan.execution.statement).toContain('@f0');
    expect(plan.execution.statement).not.toContain('Dakar');
    expect(plan.execution.parameters.f0).toBe('Dakar');
    expect(plan.securityScope.organizationId).toBe('org-1');
  });
  it('invalide l’empreinte quand le mapping du registre change', () => {
    const before = planner.plan(base, user(), 'UTC');
    const version = registry.version;
    registry.registerResource({ connector: 'simulated', key: 'synthetic', schemaVersion: '2',
      table: 'dbo.Synthetic', expressions: { amount: 'Amount', date: 'TxnDate', region: 'Region' } });
    const after = planner.plan(base, user(), 'UTC');
    expect(registry.version).not.toBe(version);
    expect(after.queryFingerprint).not.toBe(before.queryFingerprint);
  });
  it('inclut tenant, filtres, période et version dans l’empreinte', () => {
    const one = planner.plan(base, user('org-1'), 'UTC');
    const same = planner.plan(base, user('org-1'), 'UTC');
    const tenant = planner.plan(base, user('org-2'), 'UTC');
    const filter = planner.plan({ ...base, filters: [{ ...base.filters[0], value: 'Paris' }] }, user(), 'UTC');
    const period = planner.plan({ ...base, period: { type: 'relative' as const, value: 'current_month' as const } },
      user(), 'UTC', new Date('2026-09-28T12:00:00Z'));
    expect(one.queryFingerprint).toBe(same.queryFingerprint);
    expect(tenant.queryFingerprint).not.toBe(one.queryFingerprint);
    expect(filter.queryFingerprint).not.toBe(one.queryFingerprint);
    expect(period.queryFingerprint).not.toBe(one.queryFingerprint);
  });
});
