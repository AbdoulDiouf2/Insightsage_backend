import { SemanticRegistryService } from './semantic-registry.service';
import { SecurityScopeService } from '../planner/security-scope.service';
import { QueryValidatorService } from '../planner/query-validator.service';
import { PeriodResolverService } from '../planner/period-resolver.service';
import { SqlCompilerService } from '../planner/sql-compiler.service';
import { QueryPlannerService } from '../planner/query-planner.service';
import { validateMetricRows } from '../results/metric-result-policy';
import { DataBindingService } from '../../widgets/data-binding.service';
import { revenueHtMetric } from './metrics/revenue-ht.metric';
import { user } from '../../../test/fixtures/data-engine-v2/synthetic-query';

const registry = new SemanticRegistryService();
const planner = new QueryPlannerService(registry,
  new QueryValidatorService(registry, new SecurityScopeService()),
  new PeriodResolverService(), new SqlCompilerService());
const binding = new DataBindingService(registry);
const period = { type: 'absolute' as const,
  from: '2022-01-01T00:00:00.000Z', to: '2022-02-01T00:00:00.000Z' };
const identity = user();

describe.each(registry.familyMetrics('finance_general'))('finance_general declaration $key', metric => {
  const request = { version: '2' as const, metric: metric.key, period };
  if (metric.certificationStatus === 'uncertified') {
    it('cannot be queried or bound before source and business certification', () => {
      expect(() => planner.plan(request, identity, 'Africa/Dakar')).toThrow();
      expect(() => binding.validate({ kind: 'data_engine_v2', metric: metric.key })).toThrow();
    });
    return;
  }
  it('compiles allowed expressions with typed period parameters and tenant fingerprint', () => {
    const plan = planner.plan(request, identity, 'Africa/Dakar');
    const expression = registry.resource(metric.sourceMapping.connector,
      metric.sourceMapping.resource).expressions[metric.sourceMapping.measureExpressionId];
    expect(plan.execution.statement).toContain(`SUM([${expression}])`);
    expect(plan.execution.statement).toContain('@periodFrom');
    expect(plan.execution.parameters).toMatchObject({ periodFrom: '2022-01-01', periodTo: '2022-02-01' });
    expect(plan.execution.statement).not.toContain('2022-01-01');
    expect(planner.plan(request, user('second-tenant'), 'Africa/Dakar').queryFingerprint)
      .not.toBe(plan.queryFingerprint);
    expect(binding.validate({ kind: 'data_engine_v2', metric: metric.key }, 'card'))
      .toMatchObject({ metric: metric.key });
  });
  it('validates scalar empty and zero independently from metric name', () => {
    const plan = planner.plan(request, identity, 'Africa/Dakar');
    expect(() => validateMetricRows(plan, [{ value: null, __source_row_count: 0 }])).not.toThrow();
    expect(() => validateMetricRows(plan, [{ value: '0.00', __source_row_count: 1 }])).not.toThrow();
    for (const row of [{ value: '0.00', __source_row_count: 0 },
      { value: 0, __source_row_count: 1 }, { value: '0.0', __source_row_count: 1 },
      { value: '0.00', __source_row_count: -1 },
      { value: '1.00', __source_row_count: 1, untrusted: 'secret' }])
      expect(() => validateMetricRows(plan, [row])).toThrow();
    expect(() => validateMetricRows(plan, [
      { value: '1.00', __source_row_count: 1 },
      { value: '2.00', __source_row_count: 1 },
    ])).toThrow();
  });
  it('plans dimension and comparison only when declared and aligned', () => {
    const plan = planner.plan({ ...request, dimensions: ['month'],
      comparison: { type: 'previous_period' } }, identity, 'Africa/Dakar');
    expect(plan.comparisonExecution).toBeDefined();
    expect(plan.dimensions[0].comparisonAlignment).toBe('calendar_month_offset');
    expect(() => validateMetricRows(plan,
      [{ month: '2022-01', value: '1.00', __source_row_count: 1 }])).not.toThrow();
    expect(() => validateMetricRows(plan,
      [{ month: 'Jan', value: '1.00', __source_row_count: 1 }])).toThrow();
    expect(() => validateMetricRows(plan, [
      { month: '2022-01', value: '1.00', __source_row_count: 1 },
      { month: '2022-01', value: '2.00', __source_row_count: 1 },
    ])).toThrow();
    expect(() => planner.plan({ ...request, dimensions: ['unknown'] },
      identity, 'Africa/Dakar')).toThrow();
  });
});

it('can add a certified simple measure by declaration without a metric-name branch', () => {
  const extension = new SemanticRegistryService();
  extension.registerMetric({ ...revenueHtMetric, key: 'synthetic_finance_measure',
    sourceMapping: { ...revenueHtMetric.sourceMapping, measureExpressionId: 'revenue_ttc' } });
  const extendedPlanner = new QueryPlannerService(extension,
    new QueryValidatorService(extension, new SecurityScopeService()),
    new PeriodResolverService(), new SqlCompilerService());
  const plan = extendedPlanner.plan({ version: '2', metric: 'synthetic_finance_measure', period },
    identity, 'Africa/Dakar');
  expect(plan.execution.statement).toContain('SUM([ca_ttc])');
  expect(() => validateMetricRows(plan,
    [{ value: '42.00', __source_row_count: 1 }])).not.toThrow();
  expect(new DataBindingService(extension).validate({ kind: 'data_engine_v2',
    metric: 'synthetic_finance_measure' }, 'card')).toBeTruthy();
});
