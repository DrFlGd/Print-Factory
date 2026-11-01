/**
 * Prepare Image: the one dialog every image-based module uses to turn a picture into
 * flat colour regions.
 *
 * Original and result side by side; background removal; the number of colours; a switch
 * per colour to keep or drop it; speckle cleanup; exposure, contrast and saturation.
 * Confirm traces with exactly what the result shows. Cancel changes nothing.
 */
import type { Contour, PickedFile, RGB } from '@pf/core';
import { rgbToHex } from '@pf/core';
import type { Adjustments, Quantized, Raster, TracedImage } from '@pf/trace';
import { adjust, cleanLabels, decodeImage, quantize, removeBackground, traceLabels } from '@pf/trace';
import { h } from './dom';
import { dialog } from './overlay';

export interface ImageSettings {
  colors: number;
  removeBackground: boolean;
  tolerance: number;
  /** 0..3 majority-filter passes. */
  smoothing: number;
  /** Specks smaller than this share of the image (0..2 %) merge into their neighbours. */
  speck: number;
  /** Palette indices to drop. */
  drop: number[];
  adjust: Required<Pick<Adjustments, 'exposure' | 'contrast' | 'saturation'>>;
  /** Merge every kept colour into one (stencils, silhouettes). */
  single?: boolean;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  colors: 4,
  removeBackground: true,
  tolerance: 0.08,
  smoothing: 1,
  speck: 0.15,
  drop: [],
  adjust: { exposure: 0, contrast: 0, saturation: 0 },
};

/** What a module stores as an input: everything the build needs, no bitmap. */
export interface PreparedImage {
  name: string;
  /** Traced size in px; contours are in these units, Y up. */
  width: number;
  height: number;
  palette: RGB[];
  regions: { index: number; color: RGB; contours: Contour[] }[];
  silhouette: Contour[];
  settings: ImageSettings;
}

export interface PrepareOptions {
  title?: string;
  /** Upper limit for the colours slider. */
  maxColors?: number;
  /** Hide the colour controls (one-colour modules). */
  monochrome?: boolean;
  /** Longer side of the traced image in px. */
  resolution?: number;
}

function process(src: Raster, s: ImageSettings): { q: Quantized; cut: Raster } {
  let r = adjust(src, s.adjust);
  if (s.removeBackground) r = removeBackground(r, { tolerance: s.tolerance });
  const total = src.width * src.height;
  let q = quantize(r, s.single ? 2 : s.colors);
  q = cleanLabels(q, { passes: s.smoothing, minPixels: Math.round((s.speck / 100) * total) });
  return { q, cut: r };
}

function drawLabels(canvas: HTMLCanvasElement, q: Quantized, drop: Set<number>) {
  canvas.width = q.width;
  canvas.height = q.height;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(q.width, q.height);
  for (let p = 0; p < q.labels.length; p++) {
    const l = q.labels[p]!;
    if (l < 0 || drop.has(l)) continue;
    const c = q.palette[l]!;
    img.data.set([c[0], c[1], c[2], 255], p * 4);
  }
  g.putImageData(img, 0, 0);
}

function drawRaster(canvas: HTMLCanvasElement, r: Raster) {
  canvas.width = r.width;
  canvas.height = r.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
}

/** Traces with the given settings, no dialog (for re-tracing a stored image). */
export function traceWith(src: Raster, s: ImageSettings, name = 'image'): PreparedImage {
  const { q } = process(src, s);
  const drop = new Set(s.drop);
  const t: TracedImage = traceLabels(q, { keep: (i) => !drop.has(i), smooth: 1, simplify: 0.5, minArea: 6 });
  let regions = t.regions.map((r) => ({ index: r.index, color: r.color, contours: r.contours }));
  if (s.single) regions = regions.length ? [{ index: 0, color: regions[0]!.color, contours: t.silhouette }] : [];
  return { name, width: q.width, height: q.height, palette: q.palette, regions, silhouette: t.silhouette, settings: s };
}

export async function decodePicked(file: PickedFile | Blob, resolution = 900): Promise<Raster> {
  const blob = file instanceof Blob ? file : new Blob([file.bytes as BlobPart], { type: file.type });
  return decodeImage(blob, resolution);
}

/**
 * Opens the dialog. Resolves with the traced image, or null when cancelled. `src` is
 * kept by the caller to reopen the dialog later without asking for the file again.
 */
export function prepareImage(src: Raster, name: string, initial: Partial<ImageSettings> = {}, opts: PrepareOptions = {}): Promise<PreparedImage | null> {
  return new Promise((resolve) => {
    let s: ImageSettings = { ...DEFAULT_IMAGE_SETTINGS, ...initial, adjust: { ...DEFAULT_IMAGE_SETTINGS.adjust, ...initial.adjust } };
    if (opts.monochrome) s.single = true;
    let answer: PreparedImage | null = null;
    const d = dialog({ title: opts.title ?? 'Prepare image', wide: true, onClose: () => resolve(answer) });
    const original = h('canvas', { class: 'pf-prep-canvas pf-checker' });
    const result = h('canvas', { class: 'pf-prep-canvas pf-checker' });
    drawRaster(original, src);
    const chips = h('div', { class: 'pf-prep-colors' });
    const status = h('p', { class: 'pf-muted pf-prep-status' });
    let zoom = 1;
    const views = h('div', { class: 'pf-prep-views' }, h('figure', null, h('figcaption', null, 'Original'), h('div', { class: 'pf-prep-frame' }, original)), h('figure', null, h('figcaption', null, 'Result'), h('div', { class: 'pf-prep-frame' }, result)));
    views.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        zoom = Math.min(8, Math.max(1, zoom * Math.exp(-e.deltaY * 0.002)));
        views.style.setProperty('--pf-zoom', String(zoom));
      },
      { passive: false },
    );

    const slider = (label: string, min: number, max: number, step: number, get: () => number, put: (v: number) => void, fmt = (v: number) => String(v)) => {
      const out = h('output', null, fmt(get()));
      const r = h('input', { type: 'range', class: 'pf-range', min: String(min), max: String(max), step: String(step), value: String(get()), 'aria-label': label });
      r.addEventListener('input', () => {
        put(Number(r.value));
        out.textContent = fmt(Number(r.value));
        schedule();
      });
      return h('label', { class: 'pf-prep-slider' }, h('span', null, label), r, out);
    };
    const toggle = (label: string, get: () => boolean, put: (v: boolean) => void) => {
      const c = h('input', { type: 'checkbox', class: 'pf-switch', checked: get() });
      c.addEventListener('change', () => {
        put(c.checked);
        schedule();
      });
      return h('label', { class: 'pf-check' }, c, h('span', null, label));
    };

    const controls = h(
      'div',
      { class: 'pf-prep-controls' },
      toggle('Remove background', () => s.removeBackground, (v) => (s = { ...s, removeBackground: v })),
      slider('Background tolerance', 0.01, 0.3, 0.01, () => s.tolerance, (v) => (s = { ...s, tolerance: v }), (v) => v.toFixed(2)),
      opts.monochrome ? null : slider('Colours', 1, opts.maxColors ?? 8, 1, () => s.colors, (v) => (s = { ...s, colors: v, drop: [] })),
      slider('Smoothing', 0, 3, 1, () => s.smoothing, (v) => (s = { ...s, smoothing: v })),
      slider('Remove specks', 0, 2, 0.05, () => s.speck, (v) => (s = { ...s, speck: v }), (v) => `${v.toFixed(2)} %`),
      slider('Exposure', -2, 2, 0.1, () => s.adjust.exposure, (v) => (s = { ...s, adjust: { ...s.adjust, exposure: v } }), (v) => v.toFixed(1)),
      slider('Contrast', -1, 1, 0.05, () => s.adjust.contrast, (v) => (s = { ...s, adjust: { ...s.adjust, contrast: v } }), (v) => v.toFixed(2)),
      opts.monochrome ? null : slider('Saturation', -1, 1, 0.05, () => s.adjust.saturation, (v) => (s = { ...s, adjust: { ...s.adjust, saturation: v } }), (v) => v.toFixed(2)),
      opts.monochrome ? null : h('div', null, h('span', { class: 'pf-field-label' }, 'Keep colours'), chips),
      status,
    );
    d.body.append(h('div', { class: 'pf-prep' }, views, controls));
    d.footer.append(
      h('span', { class: 'pf-muted pf-grow' }, 'Ctrl + scroll to zoom the previews.'),
      h('button', { type: 'button', class: 'pf-btn', onclick: () => d.close() }, 'Cancel'),
      h(
        'button',
        {
          type: 'button',
          class: 'pf-btn pf-btn-primary',
          onclick: () => {
            answer = traceWith(src, s, name);
            if (!answer.regions.length) {
              status.textContent = 'Nothing is left to trace. Keep at least one colour or lower the background tolerance.';
              answer = null;
              return;
            }
            d.close();
          },
        },
        'Use this image',
      ),
    );

    let timer = 0;
    function schedule() {
      clearTimeout(timer);
      timer = window.setTimeout(run, 60);
    }
    function run() {
      const { q } = process(src, s);
      const drop = new Set(s.drop);
      drawLabels(result, q, drop);
      chips.replaceChildren(
        ...q.palette.map((c, i) =>
          h(
            'button',
            {
              type: 'button',
              class: `pf-chip ${drop.has(i) ? '' : 'pf-on'}`,
              'aria-pressed': String(!drop.has(i)),
              title: `${rgbToHex(c)}, ${((q.counts[i]! / q.labels.length) * 100).toFixed(1)} % of the image`,
              onclick: () => {
                const next = new Set(s.drop);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                s = { ...s, drop: [...next] };
                run();
              },
            },
            h('span', { class: 'pf-chip-swatch', style: { background: rgbToHex(c) } }),
            rgbToHex(c).toUpperCase(),
          ),
        ),
      );
      const kept = q.palette.length - drop.size;
      status.textContent = `${src.width} × ${src.height} px, ${kept} of ${q.palette.length} colour${q.palette.length === 1 ? '' : 's'} kept.`;
    }
    run();
  });
}
