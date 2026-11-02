/** The frame's edge: a rectangle, an arch, scallops, ric-rac or a squiggle, and a crest on top. */
import type { Contour } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { circle, heart, roundedRect } from '@pf/shapes';
import type { Ctx, Params } from './types';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export const bw = (b: Box) => b.x1 - b.x0;
export const bh = (b: Box) => b.y1 - b.y0;
export const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });
export const grow = (b: Box, d: number): Box => box(b.x0 - d, b.y0 - d, b.x1 + d, b.y1 + d);

export function rrect(ctx: Ctx, b: Box, r: number): CrossSection {
  const rr = Math.max(0.01, Math.min(r, bw(b) / 2 - 0.01, bh(b) / 2 - 0.01));
  return ctx.cs([roundedRect(bw(b), bh(b), rr)]).translate([(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]);
}

export const discAt = (ctx: Ctx, x: number, y: number, r: number) => ctx.cs([circle(r, Math.max(48, Math.round(r * 6)))]).translate([x, y]);

export function cornerRadius(p: Params, b: Box, rim: number): number {
  if (p.corners === 'square') return 0.6;
  if (p.corners === 'rounded') return Math.min(rim * 0.9 + 1.5, 9);
  return Math.min(bw(b), bh(b)) * 0.14 + rim * 0.5;
}

/**
 * A closed contour's points moved along their outward normals by `f(s, period)`, where s is
 * the distance round it. The wave's period is stretched so a whole number of them fits.
 */
export function wavy(c: Contour, period: number, f: (phase: number) => number, step = 0.35): Contour {
  // Resample evenly.
  const pts: [number, number][] = [];
  const n = c.length / 2;
  let per = 0;
  for (let i = 0; i < n; i++) per += Math.hypot(c[((i + 1) % n) * 2]! - c[i * 2]!, c[((i + 1) % n) * 2 + 1]! - c[i * 2 + 1]!);
  const N = Math.max(64, Math.round(per / step));
  const waves = Math.max(3, Math.round(per / period));
  let seg = 0;
  let acc = 0;
  for (let k = 0; k < N; k++) {
    const s = (k / N) * per;
    while (seg < n - 1 && acc + Math.hypot(c[((seg + 1) % n) * 2]! - c[seg * 2]!, c[((seg + 1) % n) * 2 + 1]! - c[seg * 2 + 1]!) < s) {
      acc += Math.hypot(c[((seg + 1) % n) * 2]! - c[seg * 2]!, c[((seg + 1) % n) * 2 + 1]! - c[seg * 2 + 1]!);
      seg++;
    }
    const ax = c[seg * 2]!;
    const ay = c[seg * 2 + 1]!;
    const bx = c[((seg + 1) % n) * 2]!;
    const by = c[((seg + 1) % n) * 2 + 1]!;
    const L = Math.hypot(bx - ax, by - ay) || 1;
    const t = (s - acc) / L;
    pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
  }
  const out: number[] = [];
  for (let k = 0; k < N; k++) {
    const [px, py] = pts[(k - 1 + N) % N]!;
    const [nx0, ny0] = pts[(k + 1) % N]!;
    const tx = nx0 - px;
    const ty = ny0 - py;
    const L = Math.hypot(tx, ty) || 1;
    // Counter-clockwise: the outward normal is the tangent turned clockwise.
    const nx = ty / L;
    const ny = -tx / L;
    const d = f((k / N) * waves);
    out.push(pts[k]![0] + nx * d, pts[k]![1] + ny * d);
  }
  return out;
}

export interface Shape {
  /** The body's outline. */
  body: CrossSection;
  /** A wavy window (the squiggle's), else null: the window is drawn round the print. */
  window: CrossSection | null;
  /** A wavy band of the second colour round the edge (ric-rac). */
  trim: CrossSection | null;
  /** The crest above the top edge, for initials: its centre and radius. */
  crest: { x: number; y: number; r: number } | null;
}

/** The body round `b` (the frame's plain rectangle) for the print box `pb`. */
export function frameShape(ctx: Ctx, p: Params, b: Box, pb: Box, rim: number): Shape {
  const r = cornerRadius(p, b, rim);
  let body: CrossSection;
  let window: CrossSection | null = null;
  let trim: CrossSection | null = null;
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const rc = (c: Contour) => ctx.cs([c]).translate([cx, cy]);
  if (p.outline === 'arch') {
    const R = bw(b) / 2;
    // The arch's circle holds the print's top corners with most of the rim round them.
    const yc = Math.max(b.y1 - R, pb.y1 - Math.sqrt(Math.max(0, (R - rim * 0.7) ** 2 - (bw(pb) / 2) ** 2)));
    body = rrect(ctx, box(b.x0, b.y0, b.x1, yc + 0.01), r).add(rrect(ctx, box(b.x0, (b.y0 + yc) / 2, b.x1, yc), 0.01)).add(discAt(ctx, cx, yc, R));
  } else if (p.outline === 'scallop') {
    // Round bumps, each a half circle on the box: the wave is |sin|, its notches sharp.
    const A = 2.6;
    const base = roundedRect(bw(b) - 2 * A, bh(b) - 2 * A, Math.max(1, r - A));
    body = rc(wavy(base, 11, (ph) => A * Math.abs(Math.sin(Math.PI * ph)) ** 0.6));
  } else if (p.outline === 'ricrac') {
    const base = roundedRect(bw(b) - 2.4, bh(b) - 2.4, Math.max(1, r - 1.2));
    body = rc(wavy(base, 7, (ph) => 1.2 * Math.sin(2 * Math.PI * ph)));
    const band = rc(wavy(roundedRect(bw(b) - 2.4 - 6, bh(b) - 2.4 - 6, Math.max(1, r - 4.2)), 7 * 0.93, (ph) => 1.2 * Math.sin(2 * Math.PI * ph)));
    trim = band.subtract(band.offset(-2.2, 'Round', 2, 12));
  } else if (p.outline === 'squiggle') {
    // A band of even width swinging either side of a rounded box just outside the print.
    const h = p.border === 'thick' ? 8 : p.border === 'thin' ? 5.5 : 6.5;
    const a = 3;
    const e = 2;
    const mid = roundedRect(bw(pb) + 2 * e, bh(pb) + 2 * e, 7);
    const mcx = (pb.x0 + pb.x1) / 2;
    const mcy = (pb.y0 + pb.y1) / 2;
    const outer = ctx.cs([wavy(mid, 22, (ph) => h + a * Math.sin(2 * Math.PI * ph))]).translate([mcx, mcy]);
    window = ctx.cs([wavy(mid, 22, (ph) => -h + a * Math.sin(2 * Math.PI * ph))]).translate([mcx, mcy]);
    body = outer;
    // Words under (or over) a squiggle sit on a plain chin joined to the band.
    const reach = e + h + a;
    if (b.y0 < pb.y0 - reach - 1) body = body.add(rrect(ctx, box(pb.x0 - e, b.y0, pb.x1 + e, pb.y0 + 2), 6));
    if (b.y1 > pb.y1 + reach + 1) body = body.add(rrect(ctx, box(pb.x0 - e, pb.y1 - 2, pb.x1 + e, b.y1), 6));
  } else body = rrect(ctx, b, r);
  let crest: Shape['crest'] = null;
  if (p.crest) {
    const R = Math.min(bw(b) * 0.24, 20);
    const y = b.y1 + R * 0.3;
    crest = { x: cx, y, r: R };
    body = body.add(discAt(ctx, cx, y, R));
  }
  return { body, window, trim, crest };
}

/** A heart outline `w` wide, centred. */
export function heartOf(ctx: Ctx, w: number): CrossSection {
  const c = ctx.cs([heart(w)]);
  const bb = c.bounds();
  const k = w / (bb.max[0] - bb.min[0]);
  const s = c.scale([k, k]);
  const b2 = s.bounds();
  return s.translate([-(b2.min[0] + b2.max[0]) / 2, -(b2.min[1] + b2.max[1]) / 2]);
}
