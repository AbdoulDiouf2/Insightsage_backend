import { BadRequestException } from '@nestjs/common';
import { DataBindingService, DataEngineBinding } from './data-binding.service';

export interface BindingBatchEntry {
  key: string;
  name: string;
  visualization: string;
  before: DataEngineBinding | null;
  after: DataEngineBinding;
}
export interface BindingBatchManifest {
  version: 1;
  entries: BindingBatchEntry[];
}

/** Validate an authored rollout manifest before passing it to the transactional SQL script. */
export function validateBindingBatchManifest(value: unknown,
  bindings: DataBindingService): BindingBatchManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Manifest binding invalide');
  const manifest = value as Record<string, unknown>;
  if (Object.keys(manifest).sort().join(',') !== 'entries,version' ||
      manifest.version !== 1 || !Array.isArray(manifest.entries) || !manifest.entries.length)
    throw new BadRequestException('Version ou entrees du manifeste invalides');
  const seen = new Set<string>();
  const entries = manifest.entries.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new BadRequestException('Entree du manifeste invalide');
    const entry = raw as Record<string, unknown>;
    if (Object.keys(entry).sort().join(',') !== 'after,before,key,name,visualization' ||
        typeof entry.key !== 'string' || !entry.key || seen.has(entry.key) ||
        typeof entry.name !== 'string' || !entry.name ||
        typeof entry.visualization !== 'string' || !entry.visualization ||
        entry.after == null)
      throw new BadRequestException('Entree du manifeste invalide');
    seen.add(entry.key);
    const before = bindings.validate(entry.before, entry.visualization);
    const after = bindings.validate(entry.after, entry.visualization);
    if (!after || JSON.stringify(before) === JSON.stringify(after))
      throw new BadRequestException('Transition de binding invalide');
    return { key: entry.key, name: entry.name, visualization: entry.visualization,
      before, after };
  });
  return { version: 1, entries };
}
