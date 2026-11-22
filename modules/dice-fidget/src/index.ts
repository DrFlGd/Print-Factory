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
  // Extra panels, image inputs and the like go in ui(api); see docs/MODULES.md.
});
