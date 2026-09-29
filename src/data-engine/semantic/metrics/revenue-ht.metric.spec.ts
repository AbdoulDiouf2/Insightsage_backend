import { SemanticRegistryService } from '../semantic-registry.service';
import { SecurityScopeService } from '../../planner/security-scope.service';
import { QueryValidatorService } from '../../planner/query-validator.service';
import { PeriodResolverService } from '../../planner/period-resolver.service';
import { SqlCompilerService } from '../../planner/sql-compiler.service';
import { QueryPlannerService } from '../../planner/query-planner.service';
import { user } from '../../../../test/fixtures/data-engine-v2/synthetic-query';
import { revenueHtMetric } from './revenue-ht.metric';
import { revenueMonthDimension } from '../dimensions/sage100-finance.dimensions';
import { financeGeneralResource } from '../../connectors/sage100/sage100-finance.resources';

describe('revenue_ht production metric', () => {
  let registry: SemanticRegistryService;
  let planner: QueryPlannerService;
  beforeAll(() => {
    registry = new SemanticRegistryService();
    planner = new QueryPlannerService(registry,
      new QueryValidatorService(registry, new SecurityScopeService()),
      new PeriodResolverService(), new SqlCompilerService());
  });
  it('enregistre les définitions sans ancien flag et conserve registryVersion', () => {
    const previous = process.env.DATA_ENGINE_REVENUE_HT_PILOT_ENABLED;
    try {
      delete process.env.DATA_ENGINE_REVENUE_HT_PILOT_ENABLED;
      const absent = new SemanticRegistryService();
      process.env.DATA_ENGINE_REVENUE_HT_PILOT_ENABLED = 'false';
      const disabled = new SemanticRegistryService();
      for (const candidate of [absent, disabled]) {
        expect(candidate.metric('revenue_ht')).toEqual(revenueHtMetric);
        expect(candidate.dimension('month')).toEqual(revenueMonthDimension);
        expect(candidate.resource('sage100', 'finance_general')).toEqual(financeGeneralResource);
        expect(candidate.version).toBe('1970e0f8d7084e161a259eb9f331b18f1cc4ef125a54bddc235d0df30e49aeef');
      }
    } finally {
      if (previous === undefined) delete process.env.DATA_ENGINE_REVENUE_HT_PILOT_ENABLED;
      else process.env.DATA_ENGINE_REVENUE_HT_PILOT_ENABLED = previous;
    }
  });
  const base = { version: '2' as const, metric: 'revenue_ht',
    period: { type: 'relative' as const, value: 'current_month' as const } };
  it('borne la date locale avec paramètres sans recalculer le CA de la vue', () => {
    const plan = planner.plan(base, user(), 'Africa/Dakar', new Date('2026-09-28T12:00:00Z'));
    expect(plan.execution.statement).not.toContain('[cg_num] LIKE');
    expect(plan.execution.statement).toContain('[dt_jour] >= @periodFrom AND [dt_jour] < @periodTo');
    expect(plan.execution.statement).toContain('CONVERT(varchar(64), SUM([ca_ht]))');
    expect(plan.execution.parameters).toEqual({ periodFrom: '2026-09-01',
      periodTo: '2026-10-01' });
    expect(plan.execution.statement).not.toContain('2026-09-01');
  });
  it('supporte uniquement month et les deux comparaisons temporelles', () => {
    const month = planner.plan({ ...base, dimensions: ['month'],
      comparison: { type: 'previous_year' } }, user(), 'Africa/Dakar',
      new Date('2026-09-28T12:00:00Z'));
    expect(month.execution.statement).toContain('GROUP BY [annee_mois]');
    expect(month.comparisonExecution?.parameters.periodFrom).toBe('2025-09-01');
    expect(month.comparisonExecution?.parameters.periodTo).toBe('2025-10-01');
    expect(() => planner.plan({ ...base, dimensions: ['agency'] }, user(), 'UTC')).toThrow();
    expect(() => planner.plan({ ...base, comparison: { type: 'budget' } },
      user(), 'UTC')).toThrow();
  });
  it('distingue empreintes par période, dimension, comparaison et tenant', () => {
    const now = new Date('2026-09-28T12:00:00Z');
    const one = planner.plan(base, user(), 'Africa/Dakar', now);
    const variants = [
      planner.plan({ ...base, period: { type: 'relative', value: 'current_quarter' } }, user(), 'Africa/Dakar', now),
      planner.plan({ ...base, dimensions: ['month'] }, user(), 'Africa/Dakar', now),
      planner.plan({ ...base, comparison: { type: 'previous_period' } }, user(), 'Africa/Dakar', now),
      planner.plan(base, user('org-2'), 'Africa/Dakar', now),
    ];
    for (const variant of variants) expect(variant.queryFingerprint).not.toBe(one.queryFingerprint);
  });
  it('aligne previous_period sur le mois calendaire précédent', () => {
    const plan = planner.plan({ ...base, comparison: { type: 'previous_period' } },
      user(), 'Africa/Dakar', new Date('2026-09-28T12:00:00Z'));
    expect(plan.comparisonExecution?.parameters.periodFrom).toBe('2026-08-01');
    expect(plan.comparisonExecution?.parameters.periodTo).toBe('2026-09-01');
    expect(() => planner.plan({ version: '2', metric: 'revenue_ht' },
      user(), 'Africa/Dakar')).toThrow();
  });
  it('garde les dates civiles autour du changement d’heure', () => {
    const plan = planner.plan({ ...base, comparison: { type: 'previous_period' } },
      user(), 'Europe/Paris', new Date('2026-03-30T12:00:00Z'));
    expect(plan.execution.parameters.periodFrom).toBe('2026-03-01');
    expect(plan.execution.parameters.periodTo).toBe('2026-04-01');
    expect(plan.comparisonExecution?.parameters.periodFrom).toBe('2026-02-01');
    expect(plan.comparisonExecution?.parameters.periodTo).toBe('2026-03-01');
  });
  it('refuse les bornes intrajournalières avec une date SQL DATE', () => {
    expect(() => planner.plan({ ...base, period: { type: 'absolute',
      from: '2026-09-01T12:00:00Z', to: '2026-10-01T00:00:00Z' } },
      user(), 'Africa/Dakar')).toThrow();
  });
});
