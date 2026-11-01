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
    if (v.product === 'fit-test') return 'keycap-fit-test';
    const name = v.legend === 'text' ? String(v.text) : v.legend === 'symbol' ? String(v.symbol).replace(/^.*:/, '') : '';
    return `keycap-${String(v.size)}-${name || 'blank'}`;
  },
});
