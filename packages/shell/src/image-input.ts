/**
 * The image panel every picture-based module shares: choose or drop an image, prepare it
 * in the Prepare Image dialog, see what was traced, adjust it again, remove it.
 *
 * The traced result (no bitmap) is stored as an input under `key`, so it is saved in
 * project files and share-free autosaves and reaches the worker. The decoded bitmap stays
 * in memory only, so "Adjust" works until the page is reloaded; after that the image has
 * to be chosen again to change how it was traced.
 */
import type { ModuleUI, PickedFile } from '@pf/core';
import { rgbToHex } from '@pf/core';
import type { Raster } from '@pf/trace';
import { h, icon } from './dom';
import type { ImageSettings, PreparedImage, PrepareOptions } from './prepare-image';
import { decodePicked, prepareImage } from './prepare-image';

export interface ImageInputOptions extends PrepareOptions {
  /** The input key (default "image"). */
  key?: string;
  /** Panel title (default "Image"). */
  panelTitle?: string;
  /** Shown while no image is loaded. */
  hint?: string;
  /** Called after a new image is confirmed or removed. */
  onChange?(image: PreparedImage | undefined): void;
}

const IMAGE_FILE = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** A small SVG of the traced regions in their colours. */
export function tracedPreview(img: PreparedImage, size = 220): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${img.width} ${img.height}`);
  svg.setAttribute('class', 'pf-traced');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(Math.round((size * img.height) / Math.max(1, img.width))));
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', `matrix(1 0 0 -1 0 ${img.height})`);
  for (const r of img.regions) {
    let d = '';
    for (const c of r.contours) {
      if (c.length < 6) continue;
      d += `M${c[0]!.toFixed(1)} ${c[1]!.toFixed(1)}`;
      for (let i = 2; i < c.length; i += 2) d += `L${c[i]!.toFixed(1)} ${c[i + 1]!.toFixed(1)}`;
      d += 'Z';
    }
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', rgbToHex(r.color));
    p.setAttribute('fill-rule', 'evenodd');
    g.append(p);
  }
  svg.append(g);
  return svg;
}

export function imageInput(api: ModuleUI, opts: ImageInputOptions = {}): () => void {
  const key = opts.key ?? 'image';
  const body = api.panel({ title: opts.panelTitle ?? 'Image', id: `image-${key}` });
  let source: { raster: Raster; name: string } | null = null;
  let shown: PreparedImage | undefined | null = null;

  const preview = h('div', { class: 'pf-image-preview pf-checker' });
  const caption = h('p', { class: 'pf-muted pf-image-caption' });
  const choose = h('button', { type: 'button', class: 'pf-btn pf-btn-primary', onclick: () => void pick() }, icon('upload', 16), 'Choose image…');
  const adjust = h('button', { type: 'button', class: 'pf-btn', onclick: () => void open() }, 'Adjust…');
  const remove = h('button', {
    type: 'button',
    class: 'pf-btn',
    onclick: () => {
      source = null;
      api.setInput(key, undefined);
      opts.onChange?.(undefined);
      render();
    },
  }, 'Remove');
  body.append(preview, caption, h('div', { class: 'pf-image-actions' }, choose, adjust, remove));

  async function pick() {
    const f = await api.host.openFile('image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,.svg');
    if (f) await load(f);
  }

  async function load(file: PickedFile) {
    try {
      // Some hosts hand an SVG over without a type.
      const typed = IMAGE_FILE.test(file.name) && /\.svg$/i.test(file.name) && !file.type ? { ...file, type: 'image/svg+xml' } : file;
      source = { raster: await decodePicked(typed, opts.resolution ?? 900), name: file.name };
    } catch (e) {
      api.toast(`Could not read ${file.name}: ${(e as Error).message}`, 'error');
      return;
    }
    // A new picture has its own palette, so colour choices do not carry over.
    const prev = api.getInput<PreparedImage>(key)?.settings;
    await open(prev ? { ...prev, drop: [] } : {});
  }

  async function open(initial?: Partial<ImageSettings>) {
    if (!source) return;
    const out = await prepareImage(source.raster, source.name, initial ?? api.getInput<PreparedImage>(key)?.settings ?? {}, opts);
    if (!out) return;
    api.setInput(key, out);
    opts.onChange?.(out);
    render();
  }

  function render() {
    const img = api.getInput<PreparedImage>(key);
    if (img === shown && preview.childElementCount) return;
    shown = img;
    preview.replaceChildren();
    if (img) {
      preview.append(tracedPreview(img));
      const colours = img.regions.length;
      caption.textContent = `${img.name}: ${colours} colour${colours === 1 ? '' : 's'}${source ? '' : ' (choose it again to change how it is traced)'}.`;
    } else {
      preview.append(h('div', { class: 'pf-image-empty' }, icon('image', 28), h('span', null, 'Drop an image here')));
      caption.textContent = opts.hint ?? 'PNG, JPG, WebP or SVG. Logos and flat artwork work best.';
    }
    adjust.disabled = !source || !img;
    remove.disabled = !img;
  }

  const offDrop = api.onDrop((f) => {
    if (/^image\//.test(f.type) || IMAGE_FILE.test(f.name)) void load(f);
  });
  // Opening a project replaces the inputs; the next result shows the new image.
  const offResult = api.onResult(() => render());
  render();
  return () => {
    offDrop();
    offResult();
  };
}
