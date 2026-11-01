/**
 * Building blocks the designs share: lettering as regions, outlines that hug them, keyring
 * loops and holes, text on an arc, patterns inside a region, QR codes and a few blank shapes.
 */
import type { Contour } from '@pf/core';
import type { CrossSection, ManifoldContext } from '@pf/engine-manifold';
import { bounds, circle, clipPolylines, closeLoop, namedShape, patternGeometry, rect, rectSize, rotate, translate } from '@pf/shapes';
import { symbolShapes } from '@pf/symbols';
import { text as layoutText } from '@pf/text';
import qrcode from 'qrcode-generator';

export type Ctx = ManifoldContext<Record<string, unknown>>;

export interface Lettering {
  cs: CrossSection;
  /** Ink bounds. */
  b: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; cx: number; cy: number };
}

function boxOf(cs: Contour[]) {
  const b = bounds(cs);
  const s = rectSize(b);
  return { ...b, ...s };
}

/** Text as a region, centred on the origin, capital H `cap` mm tall. */
export async function lettering(ctx: Ctx, font: string, value: string, cap: number, opts: { spacing?: number; lineHeight?: number; align?: 'left' | 'center' | 'right' } = {}): Promise<Lettering | null> {
  if (!value.trim()) return null;
  const l = await layoutText(font, value, { capHeight: cap, letterSpacing: opts.spacing ?? 0, lineHeight: opts.lineHeight ?? 1.15, align: opts.align ?? 'center' }, ctx.inputs);
  if (!l.contours.length) return null;
  const b = rectSize(l.bounds);
  const cs = ctx.cs(translate(l.contours, -b.cx, -b.cy), 'NonZero');
  return { cs, b: boxOf(ctx.contours(cs)) };
}

/** Lettering scaled down (never up) to fit `w × h`. */
export function fit(ctx: Ctx, l: Lettering, w: number, h: number): Lettering {
  const k = Math.min(1, w / Math.max(l.b.width, 1e-6), h / Math.max(l.b.height, 1e-6));
  if (k >= 1) return l;
  const cs = l.cs.scale([k, k]);
  return { cs, b: boxOf(ctx.contours(cs)) };
}

export function region(ctx: Ctx, cs: CrossSection): Lettering {
  return { cs, b: boxOf(ctx.contours(cs)) };
}

/** A symbol as a region, `size` across its larger side, centred. */
export async function symbolRegion(ctx: Ctx, id: string, size: number): Promise<CrossSection | null> {
  const shapes = await symbolShapes(id, size, ctx.inputs);
  if (!shapes.length) return null;
  return ctx.CrossSection.union(shapes.map((s) => ctx.cs(s.contours, s.fillRule)));
}

/** Only the outer boundaries: the region with every hole filled. */
export function solid(ctx: Ctx, s: CrossSection): CrossSection {
  return ctx.CrossSection.union(s.decompose().map((part) => ctx.cs(ctx.contours(part).filter((c) => signed(c) > 0))));
}

function signed(c: Contour): number {
  let a = 0;
  for (let i = 0; i < c.length; i += 2) {
    const j = (i + 2) % c.length;
    a += c[i]! * c[j + 1]! - c[j]! * c[i + 1]!;
  }
  return a / 2;
}

/** Up to `max` points spread along a region's outlines. */
function samples(ctx: Ctx, s: CrossSection, max = 600): [number, number][] {
  const cs = ctx.contours(s);
  const total = cs.reduce((n, c) => n + c.length / 2, 0);
  const step = Math.max(1, Math.floor(total / max));
  const out: [number, number][] = [];
  for (const c of cs) for (let i = 0; i < c.length; i += 2 * step) out.push([c[i]!, c[i + 1]!]);
  return out;
}

/**
 * Joins the pieces of a region into one with bars `w` mm wide, each across the shortest gap
 * between two pieces, pieces joined in order of nearness (a minimum spanning tree), so the
 * bars are as short as they can be.
 */
export function bridge(ctx: Ctx, s: CrossSection, w: number): CrossSection {
  const parts = s.decompose();
  if (parts.length <= 1) return s;
  const pts = parts.map((q) => samples(ctx, q));
  const gap = (i: number, j: number): { d: number; a: [number, number]; b: [number, number] } => {
    let best = { d: Infinity, a: pts[i]![0]!, b: pts[j]![0]! };
    for (const a of pts[i]!)
      for (const b of pts[j]!) {
        const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
        if (d < best.d) best = { d, a, b };
      }
    return best;
  };
  const joined = new Set([0]);
  const bars: Contour[] = [];
  while (joined.size < parts.length) {
    let best: { d: number; a: [number, number]; b: [number, number]; j: number } | null = null;
    for (const i of joined)
      for (let j = 0; j < parts.length; j++) {
        if (joined.has(j)) continue;
        const g = gap(i, j);
        if (!best || g.d < best.d) best = { ...g, j };
      }
    const { a, b, j } = best!;
    joined.add(j);
    // A bar from one edge to the other, reaching a bar's width into each piece.
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = len > 1e-9 ? (b[0] - a[0]) / len : 1;
    const uy = len > 1e-9 ? (b[1] - a[1]) / len : 0;
    const x0 = a[0] - ux * w;
    const y0 = a[1] - uy * w;
    const x1 = b[0] + ux * w;
    const y1 = b[1] + uy * w;
    const nx = (-uy * w) / 2;
    const ny = (ux * w) / 2;
    bars.push([x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 - nx, y1 - ny, x1 + nx, y1 + ny]);
  }
  const out = s.add(ctx.cs(bars, 'NonZero'));
  // A bar can just meet a piece at a corner; one more pass joins whatever is still apart.
  return out.decompose().length > 1 && out.decompose().length < parts.length ? bridge(ctx, out, w) : out;
}

/** The holes (counters) of a region. */
export function holesOf(ctx: Ctx, s: CrossSection): CrossSection {
  return solid(ctx, s).subtract(s);
}

/** An outline that follows a region at `margin`, its gaps closed by `smooth`, solid inside. */
export function hug(ctx: Ctx, s: CrossSection, margin: number, smooth: number): CrossSection {
  let out = s.offset(margin + smooth, 'Round', 2, 48);
  if (smooth > 0) out = out.offset(-smooth, 'Round', 2, 48);
  out = solid(ctx, out);
  if (out.decompose().length > 1) out = solid(ctx, bridge(ctx, out, Math.max(2, margin * 1.5)));
  return out;
}

export type RingKind = 'loop' | 'hole' | 'none';
export type RingSide = 'left' | 'top' | 'right';

/**
 * A keyring loop (a tab outside the body, joined by a neck) or a hole (inside, a wall from
 * the edge). Returns the body with the loop and the hole's centre.
 */
export function ring(ctx: Ctx, body: CrossSection, kind: RingKind, side: RingSide, d: number, wall: number): { body: CrossSection; hole: CrossSection | null; at: [number, number] | null } {
  if (kind === 'none') return { body, hole: null, at: null };
  const r = d / 2;
  const outer = r + wall;
  const b = body.bounds();
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  const across = (x: number): number => {
    // The middle of the body's span at x (or across y at the top).
    const strip = ctx.cs(translate([rect(0.6, b.max[1] - b.min[1] + 2)], x, cy));
    const cut = body.intersect(strip);
    if (cut.isEmpty()) return cy;
    const q = cut.bounds();
    return (q.min[1] + q.max[1]) / 2;
  };
  const acrossTop = (): number => {
    const strip = ctx.cs(translate([rect(b.max[0] - b.min[0] + 2, 0.6)], cx, b.max[1] - Math.min(2, (b.max[1] - b.min[1]) / 4)));
    const cut = body.intersect(strip);
    if (cut.isEmpty()) return cx;
    const q = cut.bounds();
    return (q.min[0] + q.max[0]) / 2;
  };
  let x: number;
  let y: number;
  if (kind === 'loop') {
    const reach = outer - wall * 0.6;
    if (side === 'top') {
      x = acrossTop();
      y = b.max[1] + reach;
    } else {
      x = side === 'left' ? b.min[0] - reach : b.max[0] + reach;
      y = across(side === 'left' ? b.min[0] + 0.5 : b.max[0] - 0.5);
    }
    const tab = ctx.cs(translate([circle(outer)], x, y));
    const len = side === 'top' ? y - b.max[1] + 2 * wall : Math.abs(x - (side === 'left' ? b.min[0] : b.max[0])) + 2 * wall;
    const neck = side === 'top' ? ctx.cs(translate([rect(outer * 1.4, len)], x, y - len / 2)) : ctx.cs(translate([rect(len, outer * 1.4)], side === 'left' ? x + len / 2 : x - len / 2, y));
    const joined = body.add(tab).add(neck.intersect(body.offset(wall, 'Round', 2, 32)));
    const hole = ctx.cs(translate([circle(r)], x, y));
    return { body: joined.subtract(hole), hole, at: [x, y] };
  }
  // A hole: as near the chosen edge as leaves a wall all round it.
  const legal = body.offset(-outer, 'Round', 2, 32);
  if (legal.isEmpty()) return { body, hole: null, at: null };
  const lb = legal.bounds();
  if (side === 'top') {
    x = acrossTop();
    const strip = legal.intersect(ctx.cs(translate([rect(0.4, lb.max[1] - lb.min[1] + 2)], x, (lb.min[1] + lb.max[1]) / 2)));
    if (strip.isEmpty()) {
      const top = legal.intersect(ctx.cs(translate([rect(lb.max[0] - lb.min[0] + 2, 0.4)], (lb.min[0] + lb.max[0]) / 2, lb.max[1] - 0.2))).bounds();
      x = (top.min[0] + top.max[0]) / 2;
      y = lb.max[1] - 0.2;
    } else y = strip.bounds().max[1];
  } else {
    x = side === 'left' ? lb.min[0] + 0.2 : lb.max[0] - 0.2;
    const strip = legal.intersect(ctx.cs(translate([rect(0.4, lb.max[1] - lb.min[1] + 2)], x, (lb.min[1] + lb.max[1]) / 2))).bounds();
    y = (strip.min[1] + strip.max[1]) / 2;
  }
  const hole = ctx.cs(translate([circle(r)], x, y));
  return { body: body.subtract(hole), hole, at: [x, y] };
}

/**
 * Text bent round a circle of radius `R`: along the top reading clockwise, or along the
 * bottom reading anticlockwise with the letters' tops towards the centre. Each glyph keeps its
 * shape and turns to the radius at its middle.
 */
export async function arcText(ctx: Ctx, font: string, value: string, cap: number, R: number, where: 'top' | 'bottom', spacing = 0): Promise<CrossSection | null> {
  if (!value.trim()) return null;
  const l = await layoutText(font, value, { capHeight: cap, letterSpacing: spacing }, ctx.inputs);
  if (!l.glyphs.length) return null;
  const first = l.glyphs[0]!;
  const last = l.glyphs[l.glyphs.length - 1]!;
  const mid = (first.x + last.x + last.advance) / 2;
  const out: Contour[] = [];
  for (const g of l.glyphs) {
    if (!g.contours.length) continue;
    const xc = g.x + g.advance / 2;
    const deg = (((xc - mid) / R) * 180) / Math.PI;
    const local = translate(g.contours, -xc, where === 'top' ? R : -R - cap);
    out.push(...rotate(local, where === 'top' ? -deg : deg));
  }
  return out.length ? ctx.cs(out, 'NonZero') : null;
}

/* ---------------------------------------------------------------- patterns */

export interface Marks {
  cut: CrossSection | null;
  engrave: CrossSection | null;
  score: Contour[];
}

export const noMarks = (): Marks => ({ cut: null, engrave: null, score: [] });

/** A pattern inside `area`: cut as a lattice or engraved with `web` between cells, or scored. */
export function patternIn(ctx: Ctx, area: CrossSection, id: string, size: number, angle: number, op: 'cut' | 'engrave' | 'score', web: number, origin?: [number, number]): Marks {
  if (area.isEmpty()) return noMarks();
  const b = rectSize(bounds(ctx.contours(area)));
  // The pattern's centre: the area's middle, or a point given (a burst opening from an edge).
  const [ox, oy] = origin ?? [b.cx, b.cy];
  const R = Math.hypot(Math.abs(ox - b.cx) + b.width / 2, Math.abs(oy - b.cy) + b.height / 2) + size;
  const geo = patternGeometry(id, R, size);
  const place = (cs: Contour[]) => translate(rotate(cs, angle), ox, oy);
  if (op === 'score') return { cut: null, engrave: null, score: clipPolylines(place(geo.lines), ctx.contours(area)) };
  const w = op === 'cut' ? Math.max(0.4, web) : Math.max(0, web);
  const inner = op === 'cut' ? area.offset(-w, 'Miter', 2, 0) : area;
  if (inner.isEmpty()) return noMarks();
  const ib = bounds(ctx.contours(inner));
  const cells: CrossSection[] = [];
  for (const cell of geo.cells) {
    const [add] = place([cell.add]);
    const cb = bounds(add!);
    if (cb.maxX < ib.minX || cb.minX > ib.maxX || cb.maxY < ib.minY || cb.minY > ib.maxY) continue;
    let c = ctx.cs([add!]);
    if (cell.minus?.length) c = c.subtract(ctx.cs(place(cell.minus), 'NonZero'));
    if (w > 0) c = c.offset(-w / 2, 'Miter', 2, 0);
    if (!c.isEmpty()) cells.push(c);
  }
  const all = ctx.CrossSection.union(cells).intersect(inner);
  const kept = all.decompose().filter((q) => q.area() >= Math.max(0.8, w * w));
  const cs = ctx.CrossSection.union(kept);
  return op === 'cut' ? { cut: cs, engrave: null, score: [] } : { cut: null, engrave: cs, score: [] };
}

/** Lines round a region, for a scored frame. */
export function outlineOf(ctx: Ctx, s: CrossSection): Contour[] {
  return ctx.contours(s).map(closeLoop);
}

/* ---------------------------------------------------------------- QR */

/** The dark modules of a QR code for `data`, as a region `size` mm square centred on the origin. */
export function qrRegion(ctx: Ctx, data: string, size: number, ecc: 'L' | 'M' | 'Q' | 'H'): { cs: CrossSection; modules: number } | null {
  if (!data) return null;
  const qr = qrcode(0, ecc);
  qr.addData(String.fromCharCode(...new TextEncoder().encode(data)), 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const m = size / n;
  const squares: Contour[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      // A hair larger, so neighbours weld into one region.
      const x = -size / 2 + c * m;
      const y = size / 2 - (r + 1) * m;
      squares.push([x - 1e-4, y - 1e-4, x + m + 1e-4, y - 1e-4, x + m + 1e-4, y + m + 1e-4, x - 1e-4, y + m + 1e-4]);
    }
  return { cs: ctx.cs(squares, 'NonZero'), modules: n };
}

/* ---------------------------------------------------------------- blanks */

/** A dog bone, `w` wide. */
export function bone(w: number, h: number): Contour[] {
  const r = h * 0.3;
  const bar = translate([rect(w - 2 * r, h * 0.56)], 0, 0);
  const ends = [-1, 1].flatMap((s) => [translate([circle(r)], s * (w / 2 - r), h / 2 - r)[0]!, translate([circle(r)], s * (w / 2 - r), -(h / 2 - r))[0]!]);
  return [...bar, ...ends];
}

/** A military-style tag: a rounded rectangle with its corners clipped. */
export function dogTag(w: number, h: number): Contour {
  const c = Math.min(w, h) * 0.18;
  const pts: number[] = [];
  const hw = w / 2;
  const hh = h / 2;
  const r = c * 0.6;
  const corner = (x: number, y: number, a0: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = ((a0 + (90 * i) / 6) * Math.PI) / 180;
      pts.push(x + r * Math.cos(a), y + r * Math.sin(a));
    }
  };
  corner(hw - c, -hh + c, -90);
  corner(hw - c, hh - c, 0);
  corner(-hw + c, hh - c, 90);
  corner(-hw + c, -hh + c, 180);
  return pts;
}

export const BLANKS = ['circle', 'heart', 'rounded-square', 'rectangle', 'pill', 'hexagon', 'octagon', 'star', 'shield', 'oval', 'bone', 'dog-tag', 'squircle'] as const;

/** A blank `w` wide (its height follows the shape), as a region centred on the origin. */
export function blank(ctx: Ctx, shape: string, w: number, h: number): CrossSection {
  if (shape === 'bone') return ctx.cs(bone(w, h), 'NonZero');
  if (shape === 'dog-tag') return ctx.cs([dogTag(w, h)]);
  return ctx.cs([namedShape(shape, w, h, Math.min(w, h) * 0.18)]);
}

/** The usual height for a blank `w` wide. */
export function blankHeight(shape: string, w: number): number {
  switch (shape) {
    case 'bone':
      return w * 0.5;
    case 'dog-tag':
    case 'rectangle':
    case 'oval':
      return w * 0.62;
    case 'pill':
      return w * 0.4;
    case 'shield':
      return w * 1.15;
    default:
      return w;
  }
}

