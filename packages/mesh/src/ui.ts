/**
 * The 3D model panel a module adds in its `ui(api)`: choose or drop an STL, 3MF or OBJ, see
 * what the import made of it, remove it. Preparing runs in its own worker so the page stays
 * responsive; the result is stored as an input under `key` (project files and autosave keep
 * it, share links do not).
 */
import type { ModuleUI, PickedFile } from '@pf/core';
import { h, icon } from '@pf/shell';
import type { StoredMesh } from './codec';
import { isStoredMesh } from './codec';
import { MODEL_ACCEPT, MODEL_FILE } from './parse';

export interface MeshInputOptions {
  /** The input key (default "model"). */
  key?: string;
  /** Panel title (default "3D model"). */
  panelTitle?: string;
  /** Shown while no model is loaded. */
  hint?: string;
  /** Only take dropped files while this says so (when the module has another use for drops). */
  accepts?(): boolean;
  onChange?(m: StoredMesh | undefined): void;
}

/** Files over this are refused before reading: a browser tab cannot hold the result anyway. */
const MAX_BYTES = 100 * 1024 * 1024;

export function meshInput(api: ModuleUI, opts: MeshInputOptions = {}): () => void {
  const key = opts.key ?? 'model';
  const body = api.panel({ title: opts.panelTitle ?? '3D model', id: `mesh-${key}` });
  const status = h('p', { class: 'pf-muted pf-image-caption' });
  const notes = h('ul', { class: 'pf-muted pf-mesh-notes' });
  const choose = h('button', { type: 'button', class: 'pf-btn pf-btn-primary', onclick: () => void pick() }, icon('upload', 16), 'Choose 3D model…');
  const remove = h(
    'button',
    {
      type: 'button',
      class: 'pf-btn',
      onclick: () => {
        api.setInput(key, undefined);
        opts.onChange?.(undefined);
        render();
      },
    },
    'Remove',
  );
  const drop = h('div', { class: 'pf-image-empty pf-mesh-drop' }, icon('cube', 28), h('span', null, 'Drop an STL, 3MF or OBJ here'));
  body.append(drop, status, notes, h('div', { class: 'pf-image-actions' }, choose, remove));
  let busy = false;
  let worker: Worker | null = null;

  async function pick() {
    const f = await api.host.openFile(MODEL_ACCEPT);
    if (f) await load(f);
  }

  function prepare(file: PickedFile): Promise<StoredMesh> {
    worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const w = worker;
    return new Promise((resolve, reject) => {
      w.onmessage = (e: MessageEvent<StoredMesh | { error: string }>) => ('error' in e.data ? reject(new Error(e.data.error)) : resolve(e.data));
      w.onerror = (e) => reject(new Error(e.message || 'The model could not be prepared.'));
      const bytes = file.bytes.slice();
      w.postMessage({ name: file.name, bytes }, [bytes.buffer]);
    });
  }

  async function load(file: PickedFile) {
    if (busy) return;
    if (file.bytes.byteLength > MAX_BYTES) {
      api.toast(`${file.name} is over 100 MB (about two million triangles, far more than a print can show); simplify it in your 3D software first.`, 'error');
      return;
    }
    busy = true;
    choose.disabled = true;
    status.textContent = `Preparing ${file.name}…`;
    notes.replaceChildren();
    try {
      const m = await prepare(file);
      api.setInput(key, m);
      opts.onChange?.(m);
      if (m.notes.length) api.toast(`${m.name}: ${m.notes[0]}`, 'info');
    } catch (e) {
      api.toast(`Could not use ${file.name}: ${(e as Error).message}`, 'error');
    } finally {
      busy = false;
      choose.disabled = false;
      render();
    }
  }

  function render() {
    if (busy) return;
    const m = api.getInput<StoredMesh>(key);
    const ok = isStoredMesh(m);
    drop.hidden = ok;
    remove.disabled = !ok;
    notes.replaceChildren(...(ok ? m.notes.map((n) => h('li', null, n)) : []));
    status.textContent = ok
      ? `${m.name}: ${m.size.map((x) => x.toFixed(x < 10 ? 1 : 0)).join(' × ')} as drawn, ${m.triangles.toLocaleString('en')} triangles.`
      : (opts.hint ?? 'STL, 3MF or OBJ. It is repaired if it needs it and simplified to 100,000 triangles.');
  }

  const offDrop = api.onDrop((f) => {
    if (MODEL_FILE.test(f.name) && (opts.accepts?.() ?? true)) void load(f);
  });
  const offResult = api.onResult(() => render());
  render();
  return () => {
    offDrop();
    offResult();
    worker?.terminate();
  };
}
