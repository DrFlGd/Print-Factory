/**
 * The Picture panel (optional: without a picture the body is a plain shape), and a Colours
 * panel to choose each picture colour's filament. Choices are kept in the "colours" input,
 * keyed by palette index, and cleared when a new picture is traced.
 */
import type { BuildResult, ModuleUI, ParamValues, RGB } from '@pf/core';
import { hexToRgb, rgbToHex } from '@pf/core';
import type { PreparedImage } from '@pf/shell';
import { meshInput } from '@pf/mesh/ui';
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
  const offModel = meshInput(api, {
    key: 'model',
    hint: 'STL, 3MF or OBJ. Repaired if it needs it, simplified to 100,000 triangles, and scaled to the Size you set.',
    // A model chosen or dropped means model mode, and the cards pick the best way to cut it.
    onChange: (m) => {
      pickBest = true;
      if (m && api.values().source !== 'model') api.set('source', 'model');
    },
  });
  let pickBest = false;
  const cards = cutterCards(api, () => {
    const p = pickBest;
    pickBest = false;
    return p;
  });
  const body = api.panel({ title: 'Picture colours', id: 'colours' });
  // Each panel only while its design source is chosen.
  const panelOf = (id: string) => document.querySelector<HTMLElement>(`.pf-module-panel[data-panel="${id}"]`);
  const showPanels = () => {
    const src = api.values().source;
    for (const [id, on] of [['image-image', src === 'picture'], ['colours', src === 'picture'], ['mesh-model', src === 'model'], ['cutters', src === 'model']] as const) {
      const el = panelOf(id);
      if (el) el.hidden = !on;
    }
  };
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

  const offValues = api.onValues(() => {
    render();
    showPanels();
  });
  const offResult = api.onResult(render);
  render();
  showPanels();
  queueMicrotask(showPanels);
  return () => {
    offImage();
    offModel();
    offValues();
    offResult();
    cards();
  };
}

const CUTTERS = [
  { value: 'slice', label: 'Slice' },
  { value: 'button', label: 'Button' },
  { value: 'stand', label: 'Stand' },
] as const;
/** What changes how the model can be cut (not its colours, the view or the way chosen). */
const SHAPE_PARAMS = ['source', 'sample', 'modelSize', 'modelUp', 'modelSpin', 'flatten', 'hideGap', 'standShape', 'standMargin', 'buttonShape', 'buttonSize', 'buttonRaise', 'buttonX', 'buttonY', 'switchX', 'switchY', 'switchTurn', 'tolerance', 'stemFit', 'socketFit'];

/**
 * The "Ways to make it click" panel: the model cut each way, built in the background and
 * pictured pulled apart, with what the moving piece weighs; a card chooses its way. When
 * `pick()` says so (a model was just loaded), the first way that works is chosen for you:
 * Slice, then Button, then Stand.
 */
function cutterCards(api: ModuleUI, pick: () => boolean): () => void {
  const body = api.panel({ title: 'Ways to make it click', id: 'cutters' });
  body.append(h('p', { class: 'pf-muted' }, 'Your model cut each way. Choose one; Slice, Button, then Stand is chosen for you when you load a model.'));
  const grid = h('div', { class: 'pf-picture-cards', role: 'radiogroup', 'aria-label': 'Way to make it click' });
  body.append(grid);
  type State = { status: 'waiting' | 'ok' | 'unfit'; picture?: string; note?: string };
  const state = new Map<string, State>(CUTTERS.map((c) => [c.value, { status: 'waiting' }]));
  const buttons = CUTTERS.map((c) => {
    const b = h('button', { type: 'button', class: 'pf-picture-card', role: 'radio', onclick: () => api.set('cutter', c.value) });
    grid.append(b);
    return { c, b };
  });
  function paint() {
    const now = api.values().cutter;
    for (const { c, b } of buttons) {
      const st = state.get(c.value)!;
      b.classList.toggle('pf-on', now === c.value);
      b.classList.toggle('pf-unfit', st.status === 'unfit');
      b.setAttribute('aria-checked', String(now === c.value));
      b.title = st.status === 'unfit' ? (st.note ?? 'Does not fit this model') : '';
      const pic = h('div', { class: 'pf-picture' }, st.picture ? h('img', { src: st.picture, alt: `${c.label}: the model cut this way, pulled apart` }) : st.status === 'waiting' ? h('span', { class: 'pf-spinner' }) : 'Does not fit');
      b.replaceChildren(pic, h('strong', null, c.label), h('small', null, st.status === 'ok' ? (st.note ?? '') : st.status === 'unfit' ? 'Does not fit' : 'Building…'));
    }
  }
  let signature = '';
  let model: unknown;
  let sample = api.values().sample;
  let gen = 0;
  let timer = 0;
  async function refresh(choose: boolean) {
    const mine = ++gen;
    for (const c of CUTTERS) state.set(c.value, { status: 'waiting' });
    paint();
    const fits: string[] = [];
    for (const c of CUTTERS) {
      let r: BuildResult | null = null;
      try {
        r = await api.preview({ cutter: c.value, preview: 'exploded' });
      } catch (e) {
        if (mine !== gen) return;
        state.set(c.value, { status: 'unfit', note: (e as Error).message });
        paint();
        continue;
      }
      if (mine !== gen) return;
      if (!r) continue;
      const err = (r.diagnostics ?? []).find((d) => d.level === 'error');
      const meta = (r.meta ?? {}) as { ok?: boolean; movingGrams?: number };
      const shown = r.parts.filter((q) => q.role === 'preview');
      const picture = shown.length ? await api.picture(shown, { width: 240, height: 180 }) : undefined;
      if (mine !== gen) return;
      if (err || !meta.ok) state.set(c.value, { status: 'unfit', picture, note: err?.message });
      else {
        const warn = (r.diagnostics ?? []).some((d) => d.level === 'warning');
        state.set(c.value, { status: 'ok', picture, note: `${warn ? '⚠ ' : ''}≈ ${Math.round(meta.movingGrams ?? 0)} g moving` });
        if (!warn) fits.push(c.value);
      }
      paint();
    }
    // Chosen for you: the first way that works without a warning, else the first that works at all.
    if (choose) {
      const any = CUTTERS.map((c) => c.value).filter((v) => state.get(v)!.status === 'ok');
      const best = fits[0] ?? any[0];
      if (best && best !== api.values().cutter) api.set('cutter', best);
    }
  }
  function check(v: ParamValues) {
    paint();
    if (v.source !== 'model') return;
    const sig = JSON.stringify(SHAPE_PARAMS.map((k) => v[k]));
    const m = api.getInput('model');
    if (sig === signature && m === model) return;
    // A new model, or a new sample while there is none, gets the way that suits it.
    const choose = pick() || (!m && v.sample !== sample);
    sample = v.sample;
    signature = sig;
    model = m;
    clearTimeout(timer);
    timer = window.setTimeout(() => void refresh(choose), choose ? 0 : 700);
  }
  const offValues = api.onValues(check);
  // A model loaded changes no value: catch it when its build comes back.
  const offResult = api.onResult(() => check(api.values()));
  check(api.values());
  return () => {
    gen++;
    clearTimeout(timer);
    offValues();
    offResult();
  };
}
