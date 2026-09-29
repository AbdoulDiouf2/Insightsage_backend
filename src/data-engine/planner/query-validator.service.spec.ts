import { SemanticRegistryService } from '../semantic/semantic-registry.service';
import { SecurityScopeService } from './security-scope.service';
import { QueryValidatorService } from './query-validator.service';
import { registerSynthetic, user } from '../../../test/fixtures/data-engine-v2/synthetic-query';
import { DEFAULT_ROLES } from '../../../prisma/rbac-seed';

describe('QueryRequest V2', () => {
  const registry = new SemanticRegistryService();
  registerSynthetic(registry);
  const validator = new QueryValidatorService(registry, new SecurityScopeService());
  const base = { version: '2' as const, metric: 'synthetic_amount' };

  it('refuse un champ de périmètre public et le SQL libre', () => {
    expect(() => validator.validate({ ...base, scope: { organizationId: 'other' } } as any, user())).toThrow('Champ public interdit');
    expect(() => validator.validate({ ...base, sql: 'DROP TABLE X' } as any, user())).toThrow('Champ public interdit');
  });
  it('refuse metric, dimension et filtre inconnus', () => {
    expect(() => validator.validate({ ...base, metric: 'unknown' }, user())).toThrow('Métrique non configurée');
    expect(() => validator.validate({ ...base, dimensions: ['unknown'] }, user())).toThrow();
    expect(() => validator.validate({ ...base, filters: [{ field: 'unknown', operator: 'eq', value: 'x' }] }, user())).toThrow();
    expect(() => validator.validate({ ...base, filters: [{ field: 'region', operator: 'eq', value: { sql: 'x' } }] } as any, user())).toThrow('Valeur de filtre invalide');
  });
  it('dérive le tenant et vérifie la permission', () => {
    expect(validator.validate(base, user('org-A')).securityScope.organizationId).toBe('org-A');
    expect(() => validator.validate(base, { id: 'u', organizationId: 'org-A' })).toThrow('Permission manquante');
    expect(() => validator.validate(base, { id: 'u' })).toThrow('Organisation authentifiée requise');
  });
  it('accepte un DAF et conserve son organisation même avec read:data', () => {
    const daf = DEFAULT_ROLES.find(role => role.name === 'daf')!;
    const identity = { id: 'daf-A', organizationId: 'org-A', userRoles: [{ role: {
      permissions: daf.permissions.map(permission => ({ permission })),
    } }] };
    expect(validator.validate(base, identity).securityScope).toEqual({ organizationId: 'org-A' });
    expect(() => validator.validate({ ...base, organizationId: 'org-B' } as any, identity))
      .toThrow('Champ public interdit');
    expect(() => validator.validate({ ...base, scope: { organizationId: 'org-B' } } as any, identity))
      .toThrow('Champ public interdit');
  });
  it('rejette les comparaisons et devises non configurées', () => {
    expect(() => validator.validate({ ...base, comparison: { type: 'budget' } }, user())).toThrow();
    expect(() => validator.validate({ ...base, currency: 'EUR' }, user())).toThrow();
  });
});
