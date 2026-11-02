/**
 * Mounts one module into a page: the common generator UI.
 *
 *   ┌ top bar: name · presets · undo/redo · open/save/share · settings ┐
 *   │ settings form      │ 3D or 2D stage            │ export, panels  │
 *   │ + module panels    │ status · diagnostics      │ about           │
 *   └────────────────────┴───────────────────────────┴─────────────────┘
 *
 * Everything a module gets for free lives here: the build loop, export, project files,
 * share links, autosave, presets, undo, the printer bed and theme. `mountModule` returns
 * a teardown that stops the worker and removes every listener, so the hub can switch
 * modules without leaks.
 */
import type { BuildResult, Diagnostic, ExportFormat, Host, InputValue, ModuleDefinition, ModuleUI, ParamValue, ParamValues, Preset } from '@pf/core';
import { applyPreset, boundsSize, coerceValue, coerceValues, defaults, formatSize, partBounds, printable, triangleCount, translateParts } from '@pf/core';
import { BEDS, bed as bedById, checkFit } from '@pf/plate';
import type { Bed } from '@pf/plate';
import { clearAutosave, decodeSettings, deleteUserPreset, encodeSettings, History, loadAutosave, makeProject, projectValues, readProject, saveAutosave, saveUserPreset, userPresets } from '@pf/project';
import type { DrawingView, Stage, ViewPreset } from '@pf/viewer';
import { createDrawingView, createStage } from '@pf/viewer';
import { append, h, icon, iconButton } from './dom';
import { createEngine } from './engine';
import { available, baseName, exportFiles, FORMAT_LABELS } from './exporter';
import { createForm } from './form';
import { browserHost, readFile } from './host';
import { markdown } from './markdown';
import { customFontData, fontInputKey } from '@pf/text';
import { customSymbolSvg, symbolInputKey } from '@pf/symbols';
import { menu, prompt, toast } from './overlay';
import { applyTheme, onPrefs, prefs, setPrefs, themeOf } from './prefs';

export interface MountOptions {
  host?: Host;
  /** Settings from a share link (the `s` token). */
  share?: string;
  /** Builds the link a share token opens; default: this page with `#/m/<id>?s=…`. */
  linkFor?: (token: string) => string;
  /** Shows a back button that calls this (the hub's gallery). */
  onHome?: () => void;
  /** Called when the settings change, with the new share token (the hub mirrors it in the URL). */
  onSettings?: (token: string) => void;
}

export interface Mounted {
  unmount(): void;
  /** For tests and the browser check. */
  readonly state: { values: ParamValues; result: BuildResult | null; building: boolean; error: string | null; builds: number };
  setValues(v: Partial<ParamValues>): void;
  exportFile(format: ExportFormat): Promise<{ name: string; bytes: number }>;
  /** Points the preview camera (for screenshots): a view, and how much closer than the fit. */
  view(preset: ViewPreset, zoom?: number): void;
}

const STAGE_THEMES = {
  light: { background: '#eceff3', bedColor: '#dde2e8', gridColor: '#c1c8d1' },
  dark: { background: '#16191e', bedColor: '#23272e', gridColor: '#353b45' },
};

export function mountModule(target: HTMLElement, def: ModuleDefinition, opts: MountOptions = {}): Mounted {
  const host = opts.host ?? browserHost();
  const id = def.manifest.id;
  const cleanups: (() => void)[] = [];
  const listen = <K extends keyof WindowEventMap>(t: Window | Document, ev: K, fn: (e: WindowEventMap[K]) => void) => {
    t.addEventListener(ev, fn as EventListener);
    cleanups.push(() => t.removeEventListener(ev, fn as EventListener));
  };
  applyTheme();

  /* ---------------------------------------------------------------- state */
  let values: ParamValues = defaults(def.params);
  if (opts.share) {
    try {
      values = decodeSettings(def, opts.share);
    } catch (e) {
      toast((e as Error).message, 'warning');
    }
  }
  const inputs: Record<string, InputValue> = {};
  const transient = new Set<string>();
  const history = new History<ParamValues>(values);
  let result: BuildResult | null = null;
  let error: string | null = null;
  let builds = 0;
  let building = false;
  let lastMs = 0;
  let bed: Bed = bedById(prefs().bed);
  const valueListeners = new Set<(v: ParamValues) => void>();
  const resultListeners = new Set<(r: BuildResult) => void>();
  const collapsedKey = `pf:collapsed:${id}`;
  let collapsed: Set<string>;
  try {
    collapsed = new Set(JSON.parse(localStorage.getItem(collapsedKey) ?? '[]') as string[]);
  } catch {
    collapsed = new Set();
  }

  /* ---------------------------------------------------------------- layout */
  const undoBtn = iconButton('undo', 'Undo (Ctrl+Z)', () => undo());
  const redoBtn = iconButton('redo', 'Redo (Ctrl+Shift+Z)', () => redo());
  const presetsBtn = h('button', { type: 'button', class: 'pf-btn', 'aria-haspopup': 'menu' }, icon('star'), h('span', null, 'Presets'));
  presetsBtn.addEventListener('click', () => void openPresets());
  const settingsBtn = iconButton('settings', 'Settings', () => openSettings());
  const top = h(
    'header',
    { class: 'pf-top' },
    opts.onHome ? iconButton('back', 'All generators', () => opts.onHome!(), { class: 'pf-home' }) : null,
    h('div', { class: 'pf-title' }, h('h1', null, def.manifest.name), h('span', { class: 'pf-version' }, `v${def.manifest.version}`)),
    h('div', { class: 'pf-top-actions' }, presetsBtn, h('span', { class: 'pf-sep' }), undoBtn, redoBtn, h('span', { class: 'pf-sep' }), iconButton('open', 'Open project (Ctrl+O)', () => void openProject()), iconButton('save', 'Save project (Ctrl+S)', () => void saveProject()), iconButton('share', 'Copy share link', () => void share()), settingsBtn),
  );

  const left = h('aside', { class: 'pf-side pf-left', 'aria-label': 'Settings' });
  const right = h('aside', { class: 'pf-side pf-right', 'aria-label': 'Export' });
  const stageHost = h('div', { class: 'pf-stage-host' });
  const busy = h('span', { class: 'pf-busy', hidden: true }, h('span', { class: 'pf-spinner' }), 'Building…');
  const summary = h('span', { class: 'pf-summary' });
  const diagList = h('ul', { class: 'pf-diagnostics', 'aria-live': 'polite' });
  const viewToggle = h('div', { class: 'pf-segmented pf-view-toggle', role: 'radiogroup', 'aria-label': 'View', hidden: true });
  const tools = h(
    'div',
    { class: 'pf-stage-tools' },
    viewToggle,
    h(
      'div',
      { class: 'pf-tool-group' },
      iconButton('cube', 'Iso view', () => stage?.fit('iso')),
      iconButton('grid', 'Top view', () => stage?.fit('top')),
      iconButton('fit', 'Fit to view (double-click the stage)', () => (view === '2d' ? drawingView?.fit() : stage?.fit())),
      iconButton('wire', 'Wireframe', (e) => {
        wire = !wire;
        (e.currentTarget as HTMLElement).classList.toggle('pf-on', wire);
        stage?.setWireframe(wire);
      }),
    ),
  );
  const stageSection = h('section', { class: 'pf-stage', 'aria-label': 'Preview' }, stageHost, tools, h('div', { class: 'pf-status' }, busy, summary), diagList);
  const app = h('div', { class: 'pf-app', dataset: { module: id } }, top, h('main', { class: 'pf-main' }, left, stageSection, right));
  target.replaceChildren(app);

  /* ---------------------------------------------------------------- form */
  const textParam = def.params.parameters.find((p) => p.type === 'string');
  const form = createForm(def.params, values, {
    host,
    onChange: (name, v, final) => change({ [name]: v }, final),
    sampleText: () => (textParam ? String(values[textParam.name] ?? '') : ''),
    collapsed,
    onToggleGroup(group, open) {
      if (open) collapsed.delete(group);
      else collapsed.add(group);
      try {
        localStorage.setItem(collapsedKey, JSON.stringify([...collapsed]));
      } catch {
        /* ignore */
      }
    },
  });
  left.append(form.element);
  const leftPanels = h('div', { class: 'pf-panels' });
  left.prepend(leftPanels);

  /* ---------------------------------------------------------------- export panel */
  const exportBox = h('div', { class: 'pf-export' });
  const bedSelect = h('select', { class: 'pf-select', 'aria-label': 'Printer' }, ...BEDS.filter((b) => (def.manifest.process === 'laser' ? b.kind === 'laser' : b.kind === 'printer')).map((b) => h('option', { value: b.id }, b.name)));
  if (![...bedSelect.options].some((o) => o.value === bed.id)) bed = bedById(bedSelect.options[0]?.value);
  bedSelect.value = bed.id;
  bedSelect.addEventListener('change', () => {
    bed = bedById(bedSelect.value);
    setPrefs({ bed: bed.id });
    stage?.setBed(def.manifest.process === 'laser' ? null : bed);
    if (result) show(result, false);
  });
  const rightPanels = h('div', { class: 'pf-panels' });
  const about = def.readme ? h('details', { class: 'pf-group pf-about' }, h('summary', null, 'About this generator'), h('div', { class: 'pf-prose', innerHTML: markdown(def.readme) })) : null;
  append(
    right,
    [h('section', { class: 'pf-group-static' }, h('h2', { class: 'pf-panel-title' }, 'Export'), exportBox, h('label', { class: 'pf-field-label' }, def.manifest.process === 'laser' ? 'Sheet' : 'Printer'), bedSelect),
    rightPanels,
    about,
    def.manifest.credits || def.manifest.license ? h('p', { class: 'pf-credits' }, [def.manifest.credits, def.manifest.license && `Licence: ${def.manifest.license}`].filter(Boolean).join(' · ')) : null],
  );

  function renderExports() {
    const formats = available(def, result);
    const blocked = (result?.diagnostics ?? []).some((d) => d.level === 'error') || Boolean(error);
    exportBox.replaceChildren(
      ...def.manifest.exports.map((f, i) =>
        h(
          'button',
          {
            type: 'button',
            class: `pf-btn ${i === 0 ? 'pf-btn-primary' : ''} pf-export-btn`,
            disabled: blocked || building || !formats.includes(f),
            title: FORMAT_LABELS[f].hint,
            dataset: { format: f },
            onclick: () => void doExport(f),
          },
          icon('download'),
          h('span', null, FORMAT_LABELS[f].label),
          h('small', null, FORMAT_LABELS[f].hint),
        ),
      ),
    );
  }

  /* ---------------------------------------------------------------- stage */
  let stage: Stage | null = null;
  let drawingView: DrawingView | null = null;
  let view: '3d' | '2d' = def.manifest.view ?? (def.manifest.process === 'laser' ? '2d' : '3d');
  let wire = false;
  try {
    stage = createStage(stageHost, STAGE_THEMES[themeOf()]);
    stage.setBed(def.manifest.process === 'laser' ? null : bed);
  } catch (e) {
    stageHost.append(h('p', { class: 'pf-stage-fallback' }, 'The 3D preview needs WebGL, which this browser has turned off. Export still works.'));
    console.warn(e);
  }
  function setView(v: '3d' | '2d') {
    view = v;
    stageSection.dataset.view = v;
    if (v === '2d' && !drawingView) drawingView = createDrawingView(stageHost);
    if (stage) stage.canvas.hidden = v !== '3d';
    if (drawingView) {
      drawingView.element.hidden = v !== '2d';
      if (v === '2d' && result?.drawing) {
        drawingView.setDrawing(result.drawing);
        drawingView.fit();
      }
    }
    viewToggle.querySelectorAll('button').forEach((b) => b.classList.toggle('pf-on', b.dataset.view === v));
  }
  viewToggle.append(
    ...(['3d', '2d'] as const).map((v) => h('button', { type: 'button', class: 'pf-seg', dataset: { view: v }, onclick: () => setView(v) }, v === '3d' ? '3D' : 'Drawing')),
  );
  setView(view);
  cleanups.push(
    onPrefs(() => {
      applyTheme();
      stage?.setTheme(STAGE_THEMES[themeOf()]);
      form.refreshUnits();
    }),
  );
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const onScheme = () => {
    applyTheme();
    stage?.setTheme(STAGE_THEMES[themeOf()]);
  };
  mq?.addEventListener('change', onScheme);
  cleanups.push(() => mq?.removeEventListener('change', onScheme));

  /* ---------------------------------------------------------------- build loop */
  const engine = createEngine(def.createWorker);
  engine.onLog((t) => console.info(`[${id}]`, t));
  cleanups.push(() => engine.dispose());
  let scheduled = false;

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      void rebuild();
    });
  }

  function persistentInputs(): Record<string, InputValue> {
    const out: Record<string, InputValue> = {};
    for (const [k, v] of Object.entries(inputs)) if (!transient.has(k)) out[k] = v;
    return out;
  }

  async function rebuild() {
    building = true;
    busy.hidden = false;
    renderExports();
    try {
      const out = await engine.build(values, inputs);
      if (!out) return;
      error = null;
      lastMs = out.ms;
      builds++;
      show(out.result, true);
    } catch (e) {
      error = (e as Error).message || String(e);
      showDiagnostics([{ level: 'error', message: error }]);
      summary.textContent = 'Build failed';
    } finally {
      if (!engine.busy) {
        building = false;
        busy.hidden = true;
        renderExports();
      }
    }
  }

  function show(r: BuildResult, fresh: boolean) {
    result = r;
    const parts = r.parts;
    if (parts.length && def.manifest.process !== 'laser') {
      // Sit the model in the middle of the bed for display; exports re-centre on their own.
      const b = partBounds(printable(parts).length ? printable(parts) : parts);
      translateParts(parts, bed.size[0] / 2 - (b.min[0] + b.max[0]) / 2, bed.size[1] / 2 - (b.min[1] + b.max[1]) / 2, -b.min[2]);
    }
    stage?.setParts(parts);
    const hasDrawing = Boolean(r.drawing?.layers.length);
    viewToggle.hidden = !(hasDrawing && parts.length);
    if (hasDrawing && !parts.length && view !== '2d') setView('2d');
    if (!hasDrawing && view === '2d') setView('3d');
    if (drawingView && r.drawing) drawingView.setDrawing(r.drawing);
    const pr = printable(parts);
    const size = pr.length ? formatSize(boundsSize(partBounds(pr))) : '';
    summary.textContent = [r.summary ?? size, pr.length ? `${triangleCount(pr).toLocaleString()} triangles` : '', lastMs ? `${Math.round(lastMs)} ms` : ''].filter(Boolean).join(' · ');
    const diags = [...(r.diagnostics ?? []), ...(def.manifest.process === 'laser' ? [] : checkFit(parts, bed))];
    showDiagnostics(diags);
    renderExports();
    if (fresh) resultListeners.forEach((cb) => cb(r));
  }

  function showDiagnostics(list: Diagnostic[]) {
    diagList.replaceChildren(...list.map((d) => h('li', { class: `pf-diag pf-diag-${d.level}` }, icon(d.level === 'info' ? 'info' : 'info', 16), h('span', null, d.message))));
  }

  /* ---------------------------------------------------------------- changes */
  let autosaveTimer = 0;
  /** Custom fonts and symbols live only in this page; hand their data to the build. */
  function carryCustom(next: ParamValues) {
    for (const p of def.params.parameters) {
      const id = String(next[p.name] ?? '');
      if (!id.startsWith('custom:')) continue;
      if (p.type === 'font' && !inputs[fontInputKey(id)]) {
        const data = customFontData(id);
        if (data) inputs[fontInputKey(id)] = data;
      }
      if (p.type === 'symbol' && !inputs[symbolInputKey(id)]) {
        const svg = customSymbolSvg(id);
        if (svg) inputs[symbolInputKey(id)] = svg;
      }
    }
  }

  function change(patch: Partial<ParamValues>, final = true, record = true) {
    const next = { ...values };
    for (const [k, v] of Object.entries(patch)) {
      const p = def.params.parameters.find((x) => x.name === k);
      if (p && v !== undefined) next[k] = coerceValue(p, v);
    }
    carryCustom(next);
    values = next;
    if (record) {
      history.push(values);
      if (final) history.seal();
    }
    form.update(values);
    updateHistoryButtons();
    valueListeners.forEach((cb) => cb(values));
    schedule();
    clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      void saveAutosave(host.storage, def, values, persistentInputs());
      opts.onSettings?.(encodeSettings(def, values));
    }, 400);
  }

  function replaceAll(v: ParamValues, record = true) {
    values = coerceValues(def.params, v);
    if (record) {
      history.seal();
      history.push(values);
      history.seal();
    }
    form.update(values);
    updateHistoryButtons();
    valueListeners.forEach((cb) => cb(values));
    schedule();
    void saveAutosave(host.storage, def, values, persistentInputs());
    opts.onSettings?.(encodeSettings(def, values));
  }

  function updateHistoryButtons() {
    undoBtn.disabled = !history.canUndo;
    redoBtn.disabled = !history.canRedo;
  }
  function undo() {
    const v = history.undo();
    if (v) replaceAll(v, false);
  }
  function redo() {
    const v = history.redo();
    if (v) replaceAll(v, false);
  }

  /* ---------------------------------------------------------------- presets */
  async function openPresets() {
    const mine = await userPresets(host.storage, id);
    const builtIn: Preset[] = def.presets ?? [];
    menu(presetsBtn, [
      ...builtIn.map((p) => ({ label: p.name, hint: p.description, onSelect: () => replaceAll(applyPreset(def.params, p)) })),
      ...mine.map((p, i) => ({
        label: p.name,
        hint: 'Saved by you',
        separator: i === 0 && builtIn.length > 0,
        onSelect: () => replaceAll(applyPreset(def.params, p)),
        aside: {
          label: `Delete ${p.name}`,
          onSelect: async () => {
            await deleteUserPreset(host.storage, id, p.id);
            toast(`Deleted “${p.name}”.`);
          },
        },
      })),
      {
        label: 'Save current settings as a preset…',
        separator: true,
        onSelect: async () => {
          const name = await prompt('Save preset', 'Name', '');
          if (!name) return;
          await saveUserPreset(host.storage, def, name, values);
          toast(`Saved “${name}”.`, 'success');
        },
      },
      {
        label: 'Reset to defaults',
        onSelect: () => {
          replaceAll(defaults(def.params));
          void clearAutosave(host.storage, def);
        },
      },
    ]);
  }

  /* ---------------------------------------------------------------- settings */
  function openSettings() {
    const p = prefs();
    menu(
      settingsBtn,
      [
        { label: `Theme: ${p.theme === 'system' ? 'match system' : p.theme}`, hint: 'Light, dark or system', onSelect: () => setPrefs({ theme: p.theme === 'system' ? 'light' : p.theme === 'light' ? 'dark' : 'system' }) },
        { label: `Units: ${p.units === 'mm' ? 'millimetres' : 'inches'}`, hint: 'How lengths are shown; files are always mm', onSelect: () => setPrefs({ units: p.units === 'mm' ? 'in' : 'mm' }) },
      ],
      'Settings',
    );
  }

  /* ---------------------------------------------------------------- projects and sharing */
  async function saveProject() {
    const name = `${baseName({ def, values })}.project.json`;
    await host.saveFile(name, JSON.stringify(makeProject(def, values, persistentInputs()), null, 2), 'application/json');
  }

  async function loadProjectText(text: string) {
    try {
      const p = readProject(text, def);
      for (const k of Object.keys(inputs)) delete inputs[k];
      Object.assign(inputs, p.inputs ?? {});
      replaceAll(projectValues(def, p));
      toast(`Opened ${p.name ?? 'project'}.`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function openProject() {
    const f = await host.openFile('.json,application/json');
    if (f) await loadProjectText(new TextDecoder().decode(f.bytes));
  }

  async function share() {
    const token = encodeSettings(def, values);
    const link = opts.linkFor ? opts.linkFor(token) : `${location.href.split('#')[0]}#/m/${id}${token ? `?s=${token}` : ''}`;
    try {
      await navigator.clipboard.writeText(link);
      toast(Object.keys(persistentInputs()).length ? 'Link copied. Images and imported files are not in links: save a project to keep them.' : 'Link copied.', 'success');
    } catch {
      void prompt('Share link', 'Copy this link', link, 'Done');
    }
  }

  async function doExport(f: ExportFormat): Promise<{ name: string; bytes: number }> {
    if (!result) throw new Error('Nothing built yet.');
    const file = await exportFiles(f, { def, values, inputs, result, bed, thumbnail: stage ? () => stage!.capture(512) : undefined });
    await host.saveFile(file.name, file.data, file.mime);
    return { name: file.name, bytes: typeof file.data === 'string' ? file.data.length : file.data.byteLength };
  }

  /* ---------------------------------------------------------------- keys and drop */
  listen(window, 'keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const typing = (e.target as HTMLElement)?.matches?.('input[type=text],textarea,input[type=search]');
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !typing) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (k === 'y' && !typing) {
      e.preventDefault();
      redo();
    } else if (k === 's') {
      e.preventDefault();
      void saveProject();
    } else if (k === 'o') {
      e.preventDefault();
      void openProject();
    } else if (k === 'e') {
      e.preventDefault();
      const f = available(def, result)[0];
      if (f) void doExport(f);
    }
  });
  app.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      app.classList.add('pf-dropping');
    }
  });
  app.addEventListener('dragleave', (e) => {
    if (e.target === app) app.classList.remove('pf-dropping');
  });
  app.addEventListener('drop', async (e) => {
    app.classList.remove('pf-dropping');
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    if (/\.json$/i.test(f.name)) return loadProjectText(await f.text());
    dropHandlers.forEach((cb) => cb(f));
  });
  const dropHandlers = new Set<(f: File) => void>();

  /* ---------------------------------------------------------------- module UI */
  const api: ModuleUI = {
    host,
    values: () => values,
    set: (name, v) => change({ [name]: v }),
    setMany: (v) => change(v),
    setInput(key, value, o) {
      if (value === undefined) delete inputs[key];
      else inputs[key] = value;
      if (o?.persist === false) transient.add(key);
      else transient.delete(key);
      schedule();
      void saveAutosave(host.storage, def, values, persistentInputs());
    },
    getInput: <T>(key: string) => inputs[key] as T | undefined,
    panel({ title, side = 'left', id: pid, collapsed: fold }) {
      const body = h('div', { class: 'pf-group-body' });
      const sec = h('details', { class: 'pf-group pf-module-panel', open: !fold, dataset: { panel: pid ?? title } }, h('summary', null, title), body);
      (side === 'left' ? leftPanels : rightPanels).append(sec);
      return body;
    },
    onValues(cb) {
      valueListeners.add(cb);
      return () => valueListeners.delete(cb);
    },
    onResult(cb) {
      resultListeners.add(cb);
      return () => resultListeners.delete(cb);
    },
    toast,
    onDrop(cb) {
      const fn = (f: File) => void readFile(f).then(cb);
      dropHandlers.add(fn);
      return () => dropHandlers.delete(fn);
    },
    rebuild: schedule,
  };

  /* ---------------------------------------------------------------- start */
  updateHistoryButtons();
  renderExports();
  let teardown: void | (() => void);
  const start = async () => {
    if (!opts.share) {
      const saved = await loadAutosave(host.storage, def);
      if (saved) {
        Object.assign(inputs, saved.inputs);
        values = saved.values;
        history.seal();
        history.push(values);
        form.update(values);
      }
    }
    try {
      teardown = def.ui?.(api);
    } catch (e) {
      console.error(e);
      toast(`This generator's extra controls failed to load: ${(e as Error).message}`, 'error');
    }
    schedule();
  };
  void start();

  return {
    unmount() {
      clearTimeout(autosaveTimer);
      try {
        if (typeof teardown === 'function') teardown();
      } catch (e) {
        console.error(e);
      }
      cleanups.forEach((c) => c());
      stage?.dispose();
      drawingView?.dispose();
      app.remove();
    },
    get state() {
      return { values, result, building, error, builds };
    },
    setValues: (v) => change(v as Partial<Record<string, ParamValue>>),
    exportFile: doExport,
    view: (preset, zoom) => stage?.fit(preset, zoom),
  };
}
