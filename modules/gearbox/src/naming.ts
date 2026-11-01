/** Values to part names, without the engine's files, so the page can name exports. */
import { partKind, type Params as KindParams } from './parts';
import { fieldFor } from './schema';

export type Params = Record<string, string | number | boolean>;

/** The part's own parameters, read from the fields that carry them. */
export function kindParams(kindId: string, v: Params): KindParams {
  const kind = partKind(kindId)!;
  const out: KindParams = {};
  for (const d of kind.params) {
    const raw = v[fieldFor(kindId, d.key)];
    out[d.key] = raw === undefined ? kind.defaults[d.key]! : typeof raw === 'boolean' ? String(raw) : raw;
  }
  return out;
}

/** What a part is called in the catalog and on its file: G40, B4x4, CRANK40. */
export function partName(v: Params): string {
  if (v.mode === 'kit') return `kit-${v.kit}`;
  const id = String(v.part);
  return partKind(id)?.name(kindParams(id, v)) ?? id;
}

