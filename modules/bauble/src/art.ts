/**
 * A name or a logo as a sampled mask: its outlines filled into a fine grid, read back with
 * smoothing, so it can be wrapped onto the bauble's surface vertex by vertex.
 */
import type { Contour, Diagnostic } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { bounds, rectSize, scale, translate } from '@pf/shapes';
import { symbolShapes } from '@pf/symbols';
import { text as layoutText } from '@pf/text';
import type { Ctx } from './types';

/** A traced picture, as the image panel leaves it (Y up, px). */
export interface TracedImage {
  width: number;
  height: number;
  silhouette: Contour[];
}

/**
 * The name and the logo as one outline centred on the origin: the logo `artSize` tall, the
 * name under it with capitals 0.4 of that. Null when there is neither.
 */
export async function artSection(ctx: Ctx, notes: Diagnostic[]): Promise<CrossSection | null> {
  const p = ctx.params;
  const pieces: CrossSection[] = [];
  let bottom = 0;
  const value = p.text.split('\n').slice(0, 3).join('\n').trim();
  if (value) {
    const t = await layoutText(p.font, value, { capHeight: p.artSize * 0.4, align: 'center', lineHeight: 1.1, tolerance: 0.02 }, ctx.inputs);
    if (t.missing.length) notes.push({ level: 'warning', message: `No bundled font has ${t.missing.map((c) => `“${c}”`).join(' ')}; left out.` });
    const cs = ctx.cs(t.contours, 'NonZero');
    if (!cs.isEmpty()) {
      const b = cs.bounds();
      pieces.push(cs.translate([-(b.min[0] + b.max[0]) / 2, -b.max[1]]));
      bottom = 1;
    }
  }
  let logo: CrossSection | null = null;
  if (p.logo === 'symbol' && p.symbol) {
    const shapes = await symbolShapes(p.symbol, p.artSize, ctx.inputs);
    if (shapes.length) logo = ctx.CrossSection.union(shapes.map((s) => ctx.cs(s.contours, s.fillRule)));
  } else if (p.logo === 'image') {
    const img = ctx.inputs.image as TracedImage | undefined;
    if (img?.silhouette?.length) {
      const r = rectSize(bounds(img.silhouette));
      const k = p.artSize / Math.max(r.width, r.height, 1e-6);
      logo = ctx.cs(scale(translate(img.silhouette, -r.cx, -r.cy), k), 'NonZero');
    } else notes.push({ level: 'info', message: 'Choose a picture in the Picture panel for the logo.' });
  }
  if (logo && !logo.isEmpty()) {
    const b = logo.bounds();
    // The logo above the name.
    pieces.push(logo.translate([-(b.min[0] + b.max[0]) / 2, -b.min[1] + (bottom ? p.artSize * 0.12 : 0)]));
  }
  if (!pieces.length) return null;
  const all = ctx.CrossSection.union(pieces);
  const b = all.bounds();
  return all.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
}

export interface ArtMask {
  /** Bounds in mm, art space (x across, y up). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 0–1 coverage at (x, y) mm. */
  at(x: number, y: number): number;
}

/** Fills closed contours (even–odd, as from a cleaned CrossSection) into a grid `res` mm square. */
export function rasterize(contours: Contour[], res = 0.1, pad = 0): ArtMask | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of contours)
    for (let i = 0; i < c.length; i += 2) {
      x0 = Math.min(x0, c[i]!);
      x1 = Math.max(x1, c[i]!);
      y0 = Math.min(y0, c[i + 1]!);
      y1 = Math.max(y1, c[i + 1]!);
    }
  if (!Number.isFinite(x0)) return null;
  x0 -= pad + res;
  y0 -= pad + res;
  x1 += pad + res;
  y1 += pad + res;
  const w = Math.ceil((x1 - x0) / res) + 1;
  const h = Math.ceil((y1 - y0) / res) + 1;
  const grid = new Uint8Array(w * h);
  const xs: number[] = [];
  for (let row = 0; row < h; row++) {
    const y = y0 + (row + 0.5) * res;
    xs.length = 0;
    for (const c of contours) {
      for (let i = 0, j = c.length - 2; i < c.length; j = i, i += 2) {
        const ya = c[j + 1]!;
        const yb = c[i + 1]!;
        if (ya > y !== yb > y) xs.push(c[j]! + ((c[i]! - c[j]!) * (y - ya)) / (yb - ya));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil((xs[k]! - x0) / res - 0.5));
      const b = Math.min(w - 1, Math.floor((xs[k + 1]! - x0) / res - 0.5));
      for (let col = a; col <= b; col++) grid[row * w + col] = 1;
    }
  }
  const cell = (cx: number, cy: number) => (cx < 0 || cy < 0 || cx >= w || cy >= h ? 0 : grid[cy * w + cx]!);
  return {
    x0,
    y0,
    x1,
    y1,
    at(x, y) {
      if (x < x0 || x > x1 || y < y0 || y > y1) return 0;
      const fx = (x - x0) / res - 0.5;
      const fy = (y - y0) / res - 0.5;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      return cell(ix, iy) * (1 - tx) * (1 - ty) + cell(ix + 1, iy) * tx * (1 - ty) + cell(ix, iy + 1) * (1 - tx) * ty + cell(ix + 1, iy + 1) * tx * ty;
    },
  };
}
