/**
 * The 2D view for laser and other flat output: the drawing's layers as SVG, cut and score
 * lines a constant 1.25 px whatever the zoom, engraving filled. Wheel zooms at the
 * cursor, drag pans, double-click fits.
 */
import type { Contour, Drawing } from '@pf/core';
import { rgbToHex } from '@pf/core';

export interface DrawingView {
  setDrawing(d: Drawing | null): void;
  setHiddenLayers(names: readonly string[]): void;
  fit(): void;
  dispose(): void;
  readonly element: HTMLElement;
}

const NS = 'http://www.w3.org/2000/svg';

function pathData(cs: readonly Contour[], closed: boolean): string {
  const out: string[] = [];
  for (const c of cs) {
    if (c.length < 4) continue;
    let s = `M${c[0]!.toFixed(3)} ${(-c[1]!).toFixed(3)}`;
    for (let i = 2; i < c.length; i += 2) s += `L${c[i]!.toFixed(3)} ${(-c[i + 1]!).toFixed(3)}`;
    out.push(closed ? s + 'Z' : s);
  }
  return out.join('');
}

export function createDrawingView(host: HTMLElement): DrawingView {
  const el = document.createElement('div');
  el.className = 'pf-drawing';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  el.appendChild(svg);
  host.appendChild(el);
  let drawing: Drawing | null = null;
  let hidden = new Set<string>();
  let vb = { x: -50, y: -50, w: 100, h: 100 };
  let framed = false;

  const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

  function extent(): { x: number; y: number; w: number; h: number } | null {
    if (!drawing) return null;
    if (drawing.sheets?.length) {
      const xs = drawing.sheets.flatMap((s) => [s.x, s.x + s.width]);
      const ys = drawing.sheets.flatMap((s) => [-s.y, -(s.y + s.height)]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    if (drawing.width && drawing.height) return { x: 0, y: -drawing.height, w: drawing.width, h: drawing.height };
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const l of drawing.layers)
      for (const c of [...l.contours, ...(l.polylines ?? [])])
        for (let i = 0; i < c.length; i += 2) {
          x0 = Math.min(x0, c[i]!);
          x1 = Math.max(x1, c[i]!);
          y0 = Math.min(y0, -c[i + 1]!);
          y1 = Math.max(y1, -c[i + 1]!);
        }
    return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }

  function fit() {
    const e = extent();
    if (!e) return;
    const r = el.getBoundingClientRect();
    const aspect = r.width && r.height ? r.width / r.height : 1;
    const pad = Math.max(e.w, e.h) * 0.06 + 1;
    let w = e.w + pad * 2;
    let h = e.h + pad * 2;
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
    vb = { x: e.x + e.w / 2 - w / 2, y: e.y + e.h / 2 - h / 2, w, h };
    apply();
  }

  function draw() {
    svg.replaceChildren();
    if (!drawing) return;
    const sheets = drawing.sheets?.length ? drawing.sheets : drawing.width && drawing.height ? [{ name: '', x: 0, y: 0, width: drawing.width, height: drawing.height }] : [];
    for (const s of sheets) {
      const sheet = document.createElementNS(NS, 'rect');
      sheet.setAttribute('x', String(s.x));
      sheet.setAttribute('y', String(-(s.y + s.height)));
      sheet.setAttribute('width', String(s.width));
      sheet.setAttribute('height', String(s.height));
      sheet.setAttribute('class', 'pf-drawing-sheet');
      svg.appendChild(sheet);
      if (s.name && sheets.length > 1) {
        const label = document.createElementNS(NS, 'text');
        label.setAttribute('x', String(s.x));
        label.setAttribute('y', String(-(s.y + s.height) - Math.max(3, s.height * 0.015)));
        label.setAttribute('font-size', String(Math.max(6, s.height * 0.035)));
        label.setAttribute('class', 'pf-drawing-label');
        label.textContent = s.name;
        svg.appendChild(label);
      }
    }
    for (const l of drawing.layers) {
      if (hidden.has(l.name)) continue;
      const g = document.createElementNS(NS, 'g');
      g.dataset.layer = l.name;
      const color = rgbToHex(l.color);
      const add = (d: string, fill: boolean) => {
        if (!d) return;
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        if (fill) {
          p.setAttribute('fill', color);
          p.setAttribute('fill-rule', 'evenodd');
          p.setAttribute('fill-opacity', '0.85');
        } else {
          p.setAttribute('fill', 'none');
          p.setAttribute('stroke', color);
          p.setAttribute('stroke-width', '1.25');
          p.setAttribute('vector-effect', 'non-scaling-stroke');
          if (l.operation === 'score') p.setAttribute('stroke-dasharray', '4 3');
        }
        g.appendChild(p);
      };
      add(pathData(l.contours, true), l.operation === 'engrave');
      add(pathData(l.polylines ?? [], false), false);
      svg.appendChild(g);
    }
  }

  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      const k = Math.exp(e.deltaY * 0.0015);
      const nw = vb.w * k;
      const nh = vb.h * k;
      vb = { x: vb.x + (vb.w - nw) * fx, y: vb.y + (vb.h - nh) * fy, w: nw, h: nh };
      apply();
    },
    { passive: false },
  );
  let drag: { x: number; y: number; vb: typeof vb } | null = null;
  el.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, vb: { ...vb } };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const k = Math.max(drag.vb.w / r.width, drag.vb.h / r.height);
    vb = { ...drag.vb, x: drag.vb.x - (e.clientX - drag.x) * k, y: drag.vb.y - (e.clientY - drag.y) * k };
    apply();
  });
  el.addEventListener('pointerup', () => (drag = null));
  el.addEventListener('dblclick', fit);
  const ro = new ResizeObserver(() => framed && fit());
  ro.observe(el);

  return {
    element: el,
    setDrawing(d) {
      drawing = d;
      draw();
      if (!framed && d) {
        fit();
        framed = true;
      }
    },
    setHiddenLayers(names) {
      hidden = new Set(names);
      draw();
    },
    fit,
    dispose() {
      ro.disconnect();
      el.remove();
    },
  };
}
