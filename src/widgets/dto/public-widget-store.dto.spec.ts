import { publicKpiDefinition, publicWidgetTemplate } from './public-widget-store.dto';
import { DataBindingService } from '../data-binding.service';
import { SemanticRegistryService } from '../../data-engine/semantic/semantic-registry.service';

it('allowlists a public definition and excludes Sage metadata', () => {
  const result = publicKpiDefinition({
    id: 'k1', key: 'f01_ca_ht', name: 'CA HT', category: 'finance',
    defaultVizType: 'card', profiles: ['DAF'], direction: 'HIGHER_IS_BETTER',
    isActive: true, dataBinding: { kind: 'data_engine_v2', metric: 'revenue_ht' },
    sqlSage100View: 'VW_FINANCE_GENERAL', sqlSage100Tables: ['G_ECRITUREC'],
    sqlQuery: 'SELECT *', mlUsage: 'private',
  } as any, new DataBindingService(new SemanticRegistryService()));
  expect(result.dataBinding).toEqual({ kind: 'data_engine_v2', metric: 'revenue_ht' });
  expect(JSON.stringify(result)).not.toMatch(/VW_FINANCE|G_ECRITUREC|SELECT|sqlSage|mlUsage/);
});

it('does not serialize arbitrary template config or SQL', () => {
  const result = publicWidgetTemplate({ id: 't1', name: 'Card', vizType: 'card',
    subtype: 'default', description: null, isActive: true,
    defaultConfig: { showTrend: true, sql: 'SELECT secret', period: 'SELECT secret' } });
  expect(result.defaultConfig).toEqual({ showTrend: true });
  expect(JSON.stringify(result)).not.toContain('SELECT');
});
