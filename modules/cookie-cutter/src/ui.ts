import type { BuildResult, ModuleUI, Part } from '@pf/core';
import { buildSTL, buildThreeMF, buildZip } from '@pf/export';
import { h, imageInput } from '@pf/shell';
import { symbolSvg } from '@pf/symbols';
import { cookieShape, COOKIE_SHAPES, READY_CATEGORIES } from './catalog';
import { outlinePdf } from './pdf';

const extras: Record<string, string> = {
  snowflake: '❄', 'candy-cane': '🍬', reindeer: '🦌', 'santa-hat': '🎅',
  mitten: '🧤', stocking: '🧦', snowman: '☃', 'bauble-star': '🎄',
  wreath: '🎄', 'cinnamon-sticks': '🍂', angel: '👼', 'santa-claus': '🎅',
  'gingerbread-house': '🏠', 'classic-tree': '🌲',
};
const style = [
  '.pf-cookie-source {display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 12px}',
  '.pf-cookie-source button,.pf-cookie-chips button {background:var(--pf-panel-2);color:inherit;border:1px solid var(--pf-border,#343a42);border-radius:12px;padding:8px 10px;cursor:pointer;font-size:12px}',
  '.pf-cookie-source button.selected,.pf-cookie-chips button.selected,.pf-cookie-cell.selected {background:color-mix(in srgb,#f97316 14%,transparent);border-color:#f97316;color:#f97316}',
  '.pf-cookie-chips {display:flex;gap:5px;flex-wrap:wrap;margin:10px 0}',
  '.pf-cookie-chips button {border-radius:28px;font-size:11px;padding:7px 9px}',
  '.pf-cookie-catalog {max-height:375px;overflow-y:auto;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:10px 0 4px}',
  '.pf-cookie-cell {border:1px solid var(--pf-border,#353a42);border-radius:12px;min-height:70px;padding:8px 4px;background:var(--pf-panel-2);color:inherit;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer}',
  '.pf-cookie-cell span:first-child {display:flex;align-items:center;justify-content:center;height:27px;width:35px;font-size:25px;line-height:1}',
  '.pf-cookie-cell svg {height:27px;width:27px;max-width:100%;fill:currentColor}',
  '.pf-cookie-cell span:last-child {font-size:10px;line-height:1.2;text-align:center;overflow-wrap:anywhere}',
  '.pf-cookie-count {font-size:12px;opacity:.75;margin:4px 0}',
  '.pf-cookie-file {margin:12px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
  '.pf-cookie-file button {white-space:nowrap}',
  '.pf-cookie-export {width:100%;margin:6px 0;justify-content:center;padding:12px}',
  '.pf-cookie-print-note {font-size:12px;line-height:1.55;opacity:.85}',
].join('\n');

function panelVisible(body: HTMLElement, yes: boolean) {
  const panel = body.closest<HTMLElement>('.pf-module-panel');
  if (panel) panel.hidden = !yes;
}
function asciiFile(name: string): string {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'cookie';
}
function plateParts(parts: readonly Part[], plate: number, sheetStep: number): Part[] {
  return parts.filter(part => part.group?.startsWith('plate-' + (plate + 1) + '-')).map(part => {
    const positions = new Float32Array(part.positions);
    for (let i = 0; i < positions.length; i += 3) positions[i] -= plate * sheetStep;
    return { ...part, positions };
  });
}

export function ui(api: ModuleUI): () => void {
  const css = h('style', null, style);
  const body = api.panel({ title: 'Cookie shape', id: 'cookie-shapes' });
  body.append(css, h('p', { class: 'pf-muted' }, 'Shape source'));
  const tabs = h('div', { class: 'pf-cookie-source' });
  const tabDefs = [
    ['ready', 'Ready shape'], ['text', 'Text'], ['svg', 'SVG graphic'], ['picture', 'Picture'],
  ] as const;
  const tabBtns = tabDefs.map(([id, label]) => h('button', {
    type: 'button',
    onclick: () => api.set('source', id),
  }, label));
  tabs.append(...tabBtns);
  const ready = h('div');
  const search = h('input', { type: 'search', class: 'pf-input', placeholder: 'Search shapes…', 'aria-label': 'Search 104 ready cookie shapes' });
  search.style.width = '100%';
  const chips = h('div', { class: 'pf-cookie-chips' });
  const count = h('p', { class: 'pf-cookie-count' });
  const gallery = h('div', { class: 'pf-cookie-catalog' });
  gallery.setAttribute('aria-label', 'Available cookie shapes');
  ready.append(search, chips, count, gallery);
  body.append(tabs, ready);
  let category: string = 'Most popular';
  let lastGallery = '';
  let alive = true;
  function renderGallery() {
    const selected = String(api.values().shapeId || '');
    const q = search.value.trim().toLowerCase();
    const key = JSON.stringify([selected, category, q]);
    if (key === lastGallery) return;
    lastGallery = key;
    chips.replaceChildren();
    for (const label of READY_CATEGORIES) {
      const btn = h('button', { type: 'button', class: label === category ? 'selected' : '',
        onclick: () => { category = label; renderGallery(); } }, label);
      chips.append(btn);
    }
    const shown = COOKIE_SHAPES.filter((shape, i) => {
      if (q && !(shape.label.toLowerCase().includes(q) || shape.category.toLowerCase().includes(q))) return false;
      if (q) return true;
      return category === 'All' || (category === 'Most popular' ? i < 20 : shape.category === category);
    });
    count.textContent = shown.length + ' / ' + COOKIE_SHAPES.length + ' shapes';
    gallery.replaceChildren();
    for (const shape of shown) {
      const drawing = h('span', null, extras[shape.id] ?? '✦');
      const label = h('span', null, shape.label);
      const btn = h('button', {
        type: 'button', class: 'pf-cookie-cell' + (selected === shape.id ? ' selected' : ''),
        'aria-label': shape.label, 'aria-pressed': String(selected === shape.id),
        onclick: () => api.setMany({ shapeId: shape.id, source: 'ready' }),
      }, drawing, label);
      gallery.append(btn);
      if (shape.symbol) {
        void symbolSvg(shape.symbol).then(svg => {
          if (!alive || !svg || !btn.isConnected) return;
          drawing.innerHTML = svg.replace(/<script[\s\S]*?<\/script>/gi, '');
        });
      }
    }
  }
  search.addEventListener('input', renderGallery);

  const svgPanel = api.panel({ title: 'SVG graphic', id: 'cookie-svg' });
  const svgDescription = h('p', { class: 'pf-muted' }, 'Choose an SVG graphic (closed filled shapes). It is saved in the project, and used as both a cookie outline and an optional imprint.');
  const svgName = h('p', { class: 'pf-muted' });
  const choose = h('button', { type: 'button', class: 'pf-btn pf-btn-primary' }, 'Choose SVG…');
  const remove = h('button', { type: 'button', class: 'pf-btn' }, 'Remove SVG');
  svgPanel.append(svgDescription, h('div', { class: 'pf-cookie-file' }, choose, remove), svgName);
  function updateSvg() {
    const loaded = api.getInput<string>('cookieSvg');
    svgName.textContent = loaded ? 'SVG loaded. Use Size and Adjust the shape to fit.' : 'No SVG selected.';
    remove.disabled = !loaded;
  }
  async function loadSvg(f: { name: string; bytes: Uint8Array }) {
    if (!/\.svg$/i.test(f.name)) { api.toast('Please choose an SVG file.', 'warning'); return; }
    const source = new TextDecoder().decode(f.bytes);
    if (!/<svg[\s>]/i.test(source) || source.length > 2_000_000) {
      api.toast('That file is not a usable SVG, or is too large.', 'error'); return;
    }
    api.setInput('cookieSvg', source);
    api.set('source', 'svg');
    updateSvg();
  }
  choose.addEventListener('click', async () => {
    const f = await api.host.openFile('image/svg+xml,.svg');
    if (f) await loadSvg(f);
  });
  remove.addEventListener('click', () => {
    api.setInput('cookieSvg', undefined);
    updateSvg();
  });

  const offImage = imageInput(api, {
    panelTitle: 'Picture',
    title: 'Prepare cookie picture',
    monochrome: true,
    hint: 'PNG, JPG, WebP or SVG. Trace the background away and keep the main silhouette.',
    onChange: (img) => { if (img) api.set('source', 'picture'); },
  });

  const alphabet = api.panel({ title: 'Alphabet A–Z', id: 'cookie-alphabet' });
  alphabet.append(h('p', { class: 'pf-muted' }, 'Export the full alphabet with the selected font. Add Polish characters and digits using the controls above. The 3MF export contains separate printable build-plate files.'));
  const as3mf = h('button', { class: 'pf-btn pf-btn-primary pf-cookie-export', type: 'button' }, 'Alphabet as 3MF (several plates)');
  const asStl = h('button', { class: 'pf-btn pf-cookie-export', type: 'button' }, 'Alphabet as ZIP of STL files');
  alphabet.append(as3mf, asStl);
  let busy = false;
  async function alphabetExport(format: '3mf' | 'stl') {
    if (busy) return;
    busy = true; as3mf.disabled = true; asStl.disabled = true;
    as3mf.textContent = 'Generating alphabet…';
    asStl.textContent = 'Generating alphabet…';
    try {
      const settings = api.values();
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + (settings.polish ? 'ĄĆĘŁŃÓŚŹŻ' : '') + (settings.digits ? '0123456789' : '');
      const generated = await api.preview({ alphabetChars: chars });
      if (!generated?.parts?.length) throw new Error('The alphabet build did not finish.');
      const meta = generated.meta ?? {};
      const bed = Number(meta.bed ?? settings.printerBed);
      const sheetStep = Number(meta.sheetStep ?? bed + 40);
      const perPlate = Number(meta.perPlate ?? 1);
      const plateCount = Math.ceil(generated.parts.length / perPlate);
      const files: Record<string, Uint8Array> = {};
      if (format === '3mf') {
        for (let plate = 0; plate < plateCount; plate++) {
          const parts = plateParts(generated.parts, plate, sheetStep);
          if (parts.length) files['alphabet-plate-' + String(plate + 1).padStart(2, '0') + '.3mf'] =
            buildThreeMF(parts, { title: 'Cookie cutters - alphabet plate ' + (plate + 1), plate: [bed, bed], generator: 'cookie-cutter@1.0.0' });
        }
        await api.host.saveFile('cookie-alphabet-3mf-plates.zip', buildZip(files), 'application/zip');
      } else {
        for (let i = 0; i < generated.parts.length; i++) {
          const part = generated.parts[i]!;
          const plate = Math.floor(i / perPlate);
          const shifted = plateParts([part], plate, sheetStep)[0];
          if (shifted) files[String(i + 1).padStart(2, '0') + '-' + asciiFile(part.name) + '.stl'] = buildSTL([shifted], part.name);
        }
        await api.host.saveFile('cookie-alphabet-stl.zip', buildZip(files), 'application/zip');
      }
      api.toast('Alphabet exported. Print each plate within your bed size.', 'success');
    } catch (e) {
      api.toast('Alphabet export failed: ' + (e as Error).message, 'error');
    } finally {
      busy = false;
      as3mf.disabled = false; asStl.disabled = false;
      as3mf.textContent = 'Alphabet as 3MF (several plates)';
      asStl.textContent = 'Alphabet as ZIP of STL files';
    }
  }
  as3mf.addEventListener('click', () => void alphabetExport('3mf'));
  asStl.addEventListener('click', () => void alphabetExport('stl'));

  const downloads = api.panel({ title: 'Download the model', id: 'cookie-download' });
  downloads.append(h('p', { class: 'pf-muted' }, 'Use Print Factory’s Export menu for 3MF, STL, OBJ, SVG, DXF, ZIP and a shareable project link.'));
  const pdf = h('button', { type: 'button', class: 'pf-btn pf-cookie-export' }, '1:1 outline PDF');
  downloads.append(pdf, h('p', { class: 'pf-muted' }, 'Print at 100% / Actual size. Check the 100 mm calibration line before using it as a dough template.'));
  let latest: BuildResult | null = null;
  pdf.addEventListener('click', () => {
    try {
      if (!latest?.drawing) throw new Error('No outline is ready.');
      void api.host.saveFile('cookie-outline-1-to-1.pdf', outlinePdf(latest.drawing), 'application/pdf');
    } catch (e) { api.toast((e as Error).message, 'error'); }
  });
  const print = api.panel({ title: 'How to print', id: 'cookie-print' });
  print.append(h('p', { class: 'pf-cookie-print-note' },
    'Print the cutter rim down and cutting edge up; typically no supports or infill. 0.2 mm layers and 2 walls work well. A 1.2 mm wall is three 0.4 mm lines. For longer food contact use a suitable material and food-safe fabrication process; layer grooves can harbour bacteria. Hand wash in lukewarm water—PLA may deform above 55–60°C.'));

  const offValues = api.onValues(() => {
    const source = String(api.values().source);
    tabDefs.forEach(([id], i) => tabBtns[i]!.classList.toggle('selected', source === id));
    ready.hidden = source !== 'ready';
    panelVisible(svgPanel, source === 'svg');
    const imageBody = document.querySelector<HTMLElement>('.pf-module-panel[data-panel="image-image"]');
    if (imageBody) imageBody.hidden = source !== 'picture';
    panelVisible(alphabet, api.values().product === 'cutter');
    if (source === 'ready') renderGallery();
    if (source === 'svg') updateSvg();
  });
  const offResult = api.onResult(result => { latest = result; });
  const offDrop = api.onDrop(f => {
    if (api.values().source === 'svg' && /\.svg$/i.test(f.name)) void loadSvg(f);
  });
  // The form and image-input panels are mounted before the UI callback returns.
  // Apply visibility once again when the shell has finished adding the module panels.
  queueMicrotask(() => {
    const s = String(api.values().source);
    ready.hidden = s !== 'ready';
    panelVisible(svgPanel, s === 'svg');
    const imageBody = document.querySelector<HTMLElement>('.pf-module-panel[data-panel="image-image"]');
    if (imageBody) imageBody.hidden = s !== 'picture';
    panelVisible(alphabet, api.values().product === 'cutter');
    tabDefs.forEach(([id], i) => tabBtns[i]!.classList.toggle('selected', s === id));
    renderGallery();
    updateSvg();
  });
  return () => {
    alive = false;
    offImage(); offValues(); offResult(); offDrop();
  };
}
