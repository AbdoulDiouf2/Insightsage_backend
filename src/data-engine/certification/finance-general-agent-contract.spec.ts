import { SemanticRegistryService } from '../semantic/semantic-registry.service';
import { SecurityScopeService } from '../planner/security-scope.service';
import { QueryValidatorService } from '../planner/query-validator.service';
import { PeriodResolverService } from '../planner/period-resolver.service';
import { SqlCompilerService } from '../planner/sql-compiler.service';
import { QueryPlannerService } from '../planner/query-planner.service';
import { financeGeneralCampaign } from './campaigns/finance-general.campaign';
import { user } from '../../../test/fixtures/data-engine-v2/synthetic-query';

describe('finance_general Backend to Agent V2 certification contract', () => {
  const registry = new SemanticRegistryService();
  const planner = new QueryPlannerService(registry,
    new QueryValidatorService(registry, new SecurityScopeService()),
    new PeriodResolverService(), new SqlCompilerService());
  const expressions: Record<string, string> = {
    revenue_ttc: 'ca_ttc', gross_margin: 'marge_brute', ebitda: 'ebitda',
  };

  it('compiles exactly the nine allowlisted SQL and typed date parameter pairs', () => {
    expect(registry.version).toBe(financeGeneralCampaign.registryVersion);
    let cases = 0;
    for (const metric of financeGeneralCampaign.metrics)
      for (const [from, to] of financeGeneralCampaign.periods) {
        const grouped = metric.dimensions.length === 1;
        const plan = planner.planCandidate({ version: '2', metric: metric.key,
          dimensions: [...metric.dimensions], period: { type: 'absolute', from, to } },
        user(), 'Africa/Dakar');
        const expected = `SELECT TOP (1000) CONVERT(varchar(64), SUM([${expressions[metric.key]}])) AS [value], COUNT_BIG(*) AS [__source_row_count]` +
          (grouped ? ', [annee_mois] AS [month]' : '') +
          ' FROM [dbo].[VW_FINANCE_GENERAL] WHERE [dt_jour] >= @periodFrom AND [dt_jour] < @periodTo' +
          (grouped ? ' GROUP BY [annee_mois] ORDER BY [annee_mois] ASC' : '');
        expect(plan.execution.statement).toBe(expected);
        expect(plan.execution.parameters).toEqual({
          periodFrom: from.slice(0, 10), periodTo: to.slice(0, 10),
        });
        expect(plan.registryVersion).toBe(financeGeneralCampaign.registryVersion);
        cases++;
      }
    expect(cases).toBe(9);
  });
});
