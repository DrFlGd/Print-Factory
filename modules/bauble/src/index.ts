import type { ModuleManifest, ParamSchema, Preset } from '@pf/core';
import { defineModule } from '@pf/core';
import { imageInput } from '@pf/shell';
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
  // A picture for the logo (Logo: Picture), traced to one colour.
  ui: (api) =>
    imageInput(api, {
      panelTitle: 'Picture',
      title: 'Prepare the logo',
      monochrome: true,
      hint: 'PNG, JPG or SVG, for Logo: Picture. Logos and flat artwork work best.',
      onChange: (img) => {
        if (img && api.values().logo !== 'image') api.set('logo', 'image');
      },
    }),
  fileName: (v) => {
    const kind = v.product === 'flat' ? 'ornament' : v.product === 'topper' ? 'tree-topper' : 'bauble';
    const name = slug(v.text);
    return name ? `${kind}-${name}` : kind;
  },
});
