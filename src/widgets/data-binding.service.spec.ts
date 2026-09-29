import { DataBindingService } from './data-binding.service';
import { SemanticRegistryService } from '../data-engine/semantic/semantic-registry.service';

describe('Widget Store semantic binding', () => {
  const service = new DataBindingService(new SemanticRegistryService());
  const valid = { kind: 'data_engine_v2', metric: 'revenue_ht',
    defaults: { comparison: 'previous_period' } };

  it('keeps null as legacy V1 and validates a registered metric', () => {
    expect(service.validate(null)).toBeNull();
    expect(service.validate(valid, 'card')).toEqual(valid);
  });

  it('rejects unknown metric, unsupported defaults and forbidden properties', () => {
    expect(() => service.validate({ ...valid, metric: 'missing' })).toThrow();
    expect(() => service.validate({ ...valid, defaults: { comparison: 'budget' } })).toThrow();
    for (const field of ['sql', 'connector', 'organizationId', 'scope', 'filters'])
      expect(() => service.validate({ ...valid, [field]: 'unsafe' })).toThrow();
    expect(() => service.validate({ ...valid, kind: 'other' })).toThrow();
  });

  it('marks malformed stored binding unavailable instead of treating it as V1', () => {
    expect(service.publicValue({ kind: 'data_engine_v2', metric: 'missing' })).toEqual({ kind: 'unavailable' });
  });
  it('validates a declared time series and rejects unsupported combinations', () => {
    const series = { kind: 'data_engine_v2', metric: 'revenue_ht',
      query: { dimensions: ['month'], comparison: 'previous_year' },
      presentation: { shape: 'time_series' } };
    expect(service.validate(series, 'table')).toEqual(series);
    expect(() => service.validate({ ...series, query: { dimensions: ['agency'] } })).toThrow();
    expect(() => service.validate({ ...series, presentation: { shape: 'scalar' } })).toThrow();
    expect(() => service.validate({ ...series, defaults: {} })).toThrow();
    expect(() => service.validate({ kind: 'data_engine_v2', metric: 'gross_margin' })).toThrow();
    expect(service.publicValue({ kind: 'data_engine_v2', metric: 'gross_margin' }))
      .toEqual({ kind: 'unavailable' });
  });
});
