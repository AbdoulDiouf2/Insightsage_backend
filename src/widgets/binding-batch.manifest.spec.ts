import { SemanticRegistryService } from '../data-engine/semantic/semantic-registry.service';
import { DataBindingService } from './data-binding.service';
import { validateBindingBatchManifest } from './binding-batch.manifest';

const binding = new DataBindingService(new SemanticRegistryService());
const entry = { key: 'f01_ca_ht', name: 'Chiffre d’Affaires HT', visualization: 'card',
  before: null, after: { kind: 'data_engine_v2', metric: 'revenue_ht' } };
describe('versioned binding batch manifest', () => {
  it('accepts a certified semantic binding and an exact rollback state', () => {
    expect(validateBindingBatchManifest({ version: 1, entries: [entry] }, binding))
      .toEqual({ version: 1, entries: [entry] });
  });
  it('refuses duplicates, uncertified metrics, unknown fields and no-op transitions', () => {
    for (const candidate of [
      { version: 1, entries: [entry, entry] },
      { version: 1, entries: [{ ...entry, after: { ...entry.after, metric: 'gross_margin' } }] },
      { version: 1, entries: [{ ...entry, sql: 'SELECT 1' }] },
      { version: 1, entries: [{ ...entry, before: entry.after }] },
      { version: 2, entries: [entry] },
    ]) expect(() => validateBindingBatchManifest(candidate, binding)).toThrow();
  });
});
