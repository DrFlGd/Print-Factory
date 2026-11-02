import type { ModuleManifest, ParamSchema, Preset } from '@pf/core';
import { defineModule } from '@pf/core';
import manifest from '../module.json';
import params from '../params.json';
import presets from '../presets.json';
import readme from '../README.md?raw';

const slug = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);

export default defineModule({
  manifest: manifest as ModuleManifest,
  params: params as ParamSchema,
  presets: presets as Preset[],
  readme,
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  fileName: (v) => {
    const n = slug(v.name);
    return n ? `business-card-${n}` : 'business-card';
  },
});
