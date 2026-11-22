import type { ModuleManifest, ParamSchema, Preset } from '@pf/core';
import { defineModule } from '@pf/core';
import manifest from '../module.json';
import params from '../params.json';
import presets from '../presets.json';
import readme from '../README.md?raw';
import { ui } from './ui';

export default defineModule({
  manifest: manifest as ModuleManifest,
  params: params as ParamSchema,
  presets: presets as Preset[],
  readme,
  ui,
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  fileName: (v) => 'cookie-' + String(v.product) + '-' + String(v.source === 'ready' ? v.shapeId : v.source === 'text' ? v.shapeText : v.source),
});
