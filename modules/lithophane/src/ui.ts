/** The Photo panel: choose a picture; it is kept as greyscale for the build. */
import type { ModuleUI, PickedFile } from '@pf/core';
import { decodePicked, h, icon } from '@pf/shell';
import type { PhotoInput } from './image';
import { photoFromRgba } from './image';

const IMAGE_FILE = /\.(png|jpe?g|webp|gif|bmp|svg)$/i;
/** Pixels on the longer side: 0.15 mm a sample over 150 mm. */
const RESOLUTION = 1000;

export function ui(api: ModuleUI): () => void {
  const body = api.panel({ title: 'Photo', id: 'lithophane-photo' });
  const canvas = h('canvas', { class: 'pf-litho-preview' }) as HTMLCanvasElement;
  canvas.style.cssText = 'width:100%;max-height:220px;object-fit:contain;border-radius:6px;background:#888;display:block';
  const caption = h('p', { class: 'pf-muted' });
  const choose = h('button', { type: 'button', class: 'pf-btn pf-btn-primary', onclick: () => void pick() }, icon('upload', 16), 'Choose photo…');
  const remove = h('button', { type: 'button', class: 'pf-btn', onclick: () => set(undefined) }, 'Use the sample');
  body.append(canvas, caption, h('div', { class: 'pf-image-actions' }, choose, remove), h('p', { class: 'pf-muted' }, 'Any photo works; strong contrast and a clear subject come out best. Framing, brightness and contrast are in the settings.'));

  async function pick() {
    const f = await api.host.openFile('image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,.svg');
    if (f) await load(f);
  }
  async function load(f: PickedFile) {
    try {
      const r = await decodePicked(f, RESOLUTION);
      set(photoFromRgba(f.name, r.width, r.height, r.data));
    } catch (e) {
      api.toast(`Could not read ${f.name}: ${(e as Error).message}`, 'error');
    }
  }
  function set(v: PhotoInput | undefined) {
    api.setInput('photo', v);
    render();
  }
  let shown: PhotoInput | undefined | null = null;
  function render() {
    const v = api.getInput<PhotoInput>('photo');
    if (v === shown) return;
    shown = v;
    remove.toggleAttribute('disabled', !v);
    if (!v) {
      canvas.width = 1;
      canvas.height = 1;
      caption.textContent = 'No photo yet: the lithophane shows a sample picture.';
      return;
    }
    const bin = atob(v.gray);
    canvas.width = v.width;
    canvas.height = v.height;
    const c2 = canvas.getContext('2d');
    if (c2) {
      const img = c2.createImageData(v.width, v.height);
      for (let i = 0; i < v.width * v.height; i++) {
        const g = bin.charCodeAt(i);
        img.data[i * 4] = g;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = g;
        img.data[i * 4 + 3] = 255;
      }
      c2.putImageData(img, 0, 0);
    }
    caption.textContent = `${v.name}: ${v.width} × ${v.height} px.`;
  }
  const offDrop = api.onDrop((f) => {
    if (/^image\//.test(f.type) || IMAGE_FILE.test(f.name)) void load(f);
  });
  const offResult = api.onResult(() => render());
  render();
  return () => {
    offDrop();
    offResult();
  };
}
