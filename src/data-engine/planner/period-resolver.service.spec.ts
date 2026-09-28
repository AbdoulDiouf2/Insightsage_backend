import { PeriodResolverService } from './period-resolver.service';
import fixture from '../../../test/fixtures/data-engine-v2/synthetic-quarter-dakar.json';

describe('PeriodResolver V2', () => {
  const resolver = new PeriodResolverService();
  it('résout le trimestre Dakar en bornes [inclus, exclus)', () => {
    const period = resolver.resolve(fixture.period as any, fixture.timezone, 'date', new Date(fixture.now));
    expect(period?.fromInclusive).toBe(fixture.expectedFrom);
    expect(period?.toExclusive).toBe(fixture.expectedTo);
  });
  it('valide les bornes absolues et refuse un intervalle inversé', () => {
    expect(resolver.resolve({ type: 'absolute', from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z' }, 'UTC', 'date')?.toExclusive).toBe('2026-02-01T00:00:00.000Z');
    expect(() => resolver.resolve({ type: 'absolute', from: '2026-02-01T00:00:00Z',
      to: '2026-01-01T00:00:00Z' }, 'UTC', 'date')).toThrow();
  });
});
