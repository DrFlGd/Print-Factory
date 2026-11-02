import type { ModuleManifest, ParamSchema, Preset } from '@pf/core';
import { defineModule } from '@pf/core';
import manifest from '../module.json';
import params from '../params.json';
import presets from '../presets.json';
import readme from '../README.md?raw';

export default defineModule({
  manifest: manifest as ModuleManifest,
  params: params as ParamSchema,
  presets: presets as Preset[],
  readme,
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  fileName: (v) => {
    const what = v.product === 'holder' ? String(v.holder ?? 'holder') : v.product === 'frame' ? 'frame' : String(v.product ?? 'frame');
    return `photo-${what}-${String(v.photo ?? '').replace(/[^a-z0-9]+/gi, '')}`;
  },
});
