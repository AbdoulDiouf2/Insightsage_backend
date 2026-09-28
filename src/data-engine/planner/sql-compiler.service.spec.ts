import { SqlCompilerService } from './sql-compiler.service';
import { SemanticRegistryService } from '../semantic/semantic-registry.service';
import { registerSynthetic } from '../../../test/fixtures/data-engine-v2/synthetic-query';

describe('SqlCompiler V2', () => {
  const registry = new SemanticRegistryService();
  registerSynthetic(registry);
  const compiler = new SqlCompilerService();
  const metric = registry.metric('synthetic_amount');
  const resource = registry.resource('simulated', 'synthetic');
  const region = registry.dimension('region');
  it('paramètre une valeur hostile sans l’insérer dans les identifiants SQL', () => {
    const value = "x'; DROP TABLE Synthetic;--";
    const sql = compiler.compile(metric, resource, [region],
      [{ definition: region, operator: 'eq', value }], undefined,
      { version: '2', metric: metric.key, dimensions: ['region'] });
    expect(sql.statement).toContain('[dbo].[Synthetic]');
    expect(sql.statement).not.toContain(value);
    expect(sql.parameters.f0).toBe(value);
  });
  it('refuse un identifiant source non revu', () => {
    expect(() => compiler.compile(metric, { ...resource, table: 'dbo.X;DROP' }, [], [], undefined,
      { version: '2', metric: metric.key })).toThrow();
  });
});
