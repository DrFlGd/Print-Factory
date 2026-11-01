/**
 * The Picture panel (optional: without a picture the body is a plain shape), and a Colours
 * panel to choose each picture colour's filament. Choices are kept in the "colours" input,
 * keyed by palette index, and cleared when a new picture is traced.
 */
import type { ModuleUI, RGB } from '@pf/core';
import { hexToRgb, rgbToHex } from '@pf/core';
import type { PreparedImage } from '@pf/shell';
import { h, imageInput } from '@pf/shell';
import type { ColourOverrides } from './build';

export function ui(api: ModuleUI): () => void {
  const offImage = imageInput(api, {
    panelTitle: 'Picture',
    title: 'Prepare the picture',
    maxColors: 6,
    hint: 'PNG, JPG, WebP or SVG; it goes on the cap. Set Cap shape to Follow the picture to cut the cap round it.',
    onChange: () => api.setInput('colours', undefined),
  });
  const body = api.panel({ title: 'Picture colours', id: 'colours' });
  let signature = '';
  const overrides = () => api.getInput<ColourOverrides>('colours') ?? {};

  function render() {
    const img = api.getInput<PreparedImage>('image');
    const ov = overrides();
    const rows = (img?.regions ?? []).map((r) => ({ key: String(r.index), color: r.color as RGB }));
    const sig = JSON.stringify([rows, ov]);
    if (sig === signature) return;
    signature = sig;
    body.replaceChildren();
    if (!rows.length) {
      body.append(h('p', { class: 'pf-muted' }, 'Choose a picture to pick a filament for each of its colours.'));
      return;
    }
    for (const r of rows) {
      const colour = h('input', { type: 'color', class: 'pf-colour-input', value: rgbToHex(ov[r.key]?.color ?? r.color), title: 'Filament colour' });
      colour.addEventListener('change', () => api.setInput('colours', { ...overrides(), [r.key]: { color: hexToRgb(colour.value) } }));
      body.append(h('div', { class: 'pf-colour-row' }, colour, h('span', { class: 'pf-mono pf-grow' }, rgbToHex(r.color).toUpperCase())));
    }
    if (Object.keys(ov).length) body.append(h('button', { type: 'button', class: 'pf-btn', onclick: () => api.setInput('colours', undefined) }, 'Reset colours'));
  }

  const offValues = api.onValues(render);
  const offResult = api.onResult(render);
  render();
  return () => {
    offImage();
    offValues();
    offResult();
  };
}
