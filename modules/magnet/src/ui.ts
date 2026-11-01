/**
 * The Picture panel, plus a Colours panel: per colour of the picture, the filament it
 * prints in and how many steps it is raised. Choices are stored as the "colours" input,
 * keyed by the picture's palette index, and cleared when a new picture is traced.
 */
import type { ModuleUI, RGB } from '@pf/core';
import { hexToRgb, rgbToHex } from '@pf/core';
import type { PreparedImage } from '@pf/shell';
import { h, imageInput } from '@pf/shell';
import type { ColourOverrides } from './build';

const LEVELS = ['Flush', 'Raised 1', 'Raised 2', 'Raised 3', 'Raised 4'];

export function ui(api: ModuleUI): () => void {
  const offImage = imageInput(api, {
    panelTitle: 'Picture',
    title: 'Prepare the picture',
    maxColors: 8,
    hint: 'PNG, JPG, WebP or SVG. Logos and flat artwork work best.',
    onChange: () => api.setInput('colours', undefined),
  });
  const body = api.panel({ title: 'Colours in the design', id: 'colours' });
  let signature = '';

  const overrides = () => api.getInput<ColourOverrides>('colours') ?? {};
  const update = (key: string, patch: { color?: RGB; level?: number }) => {
    const all = { ...overrides() };
    all[key] = { ...all[key], ...patch };
    api.setInput('colours', all);
  };

  function render() {
    const v = api.values();
    const img = api.getInput<PreparedImage>('image');
    const ov = overrides();
    const rows =
      v.source === 'text'
        ? [{ key: 'text', color: v.textColor as RGB, fixed: true }]
        : (img?.regions ?? []).map((r) => ({ key: String(r.index), color: r.color, fixed: false }));
    const sig = JSON.stringify([rows, ov, v.source]);
    if (sig === signature) return;
    signature = sig;
    body.replaceChildren();
    if (!rows.length) {
      body.append(h('p', { class: 'pf-muted' }, 'Choose a picture to pick each colour’s filament and height.'));
      return;
    }
    for (const r of rows) {
      const o = ov[r.key] ?? {};
      const colour = h('input', { type: 'color', class: 'pf-colour-input', value: rgbToHex(o.color ?? r.color), title: 'Filament colour', disabled: r.fixed });
      colour.addEventListener('change', () => update(r.key, { color: hexToRgb(colour.value) }));
      const level = h('select', { class: 'pf-select', 'aria-label': 'Height' }, ...LEVELS.map((l, i) => h('option', { value: String(i), selected: (o.level ?? 0) === i }, l)));
      level.addEventListener('change', () => update(r.key, { level: Number(level.value) }));
      body.append(h('div', { class: 'pf-colour-row' }, colour, h('span', { class: 'pf-mono pf-grow' }, r.fixed ? 'Text' : rgbToHex(r.color).toUpperCase()), level));
    }
    if (Object.keys(ov).length)
      body.append(h('button', { type: 'button', class: 'pf-btn', onclick: () => api.setInput('colours', undefined) }, 'Reset colours'));
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
