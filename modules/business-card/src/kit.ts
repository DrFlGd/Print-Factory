/**
 * What every template is made of: the lettering set in groups that fit a box at one scale and
 * never under a printable size, the contact icons, the mark (logo or initials), patterns in a
 * region, and the colours that read on each other.
 */
import type { Contour, Diagnostic, RGB } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { circle, patternGeometry, rect, roundedRect, rotate, translate } from '@pf/shapes';
import { symbolShapes } from '@pf/symbols';
import { text as layoutText } from '@pf/text';
import type { Colour, Ctx, Params, PatternArea, Piece, Role } from './types';

/** The card's margin and the gutter between things, mm. */
export const MARGIN = 4;
export const GUTTER = 3;
/** The least capital height that prints legibly with a 0.4 mm nozzle, mm: names and details. */
export const NAME_FLOOR = 3.2;
export const DETAIL_FLOOR = 2.2;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export const boxW = (b: Box) => b.x1 - b.x0;
export const boxH = (b: Box) => b.y1 - b.y0;
export const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });
export const boxOf = (cs: CrossSection): Box => {
  const b = cs.bounds();
  return { x0: b.min[0], y0: b.min[1], x1: b.max[0], y1: b.max[1] };
};

/* ---------------------------------------------------------------- colour */

const lum = (c: RGB) => {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
export const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
export const lighter = (a: RGB, b: RGB) => lum(a) > lum(b);

/* ---------------------------------------------------------------- lettering */

export function cased(s: string, mode: Params['nameCase']): string {
  if (mode === 'upper') return s.toUpperCase();
  if (mode === 'title') return s.replace(/\p{L}[\p{L}'’-]*/gu, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
  return s;
}

/** One line of text: its region with the baseline at y = 0 and the ink starting at x = 0. */
export interface Line {
  cs: CrossSection;
  w: number;
  cap: number;
  floor: number;
  colour: Colour;
  role: Role;
  /** Space between the line above's baseline and this line's capitals, mm. */
  gap: number;
  /** An icon in front of it, centred on the capitals, with its own colour. */
  icon?: { cs: CrossSection; w: number; colour: Colour };
  /** A rule instead of text (the accent line under a name): length and thickness, mm. */
  rule?: { len: number; th: number };
  onField?: boolean;
}

export async function line(ctx: Ctx, font: string, value: string, cap: number, o: { floor: number; colour: Colour; role: Role; gap: number; spacing?: number; notes?: Diagnostic[] }): Promise<Line | null> {
  const v = value.replace(/\s+/g, ' ').trim();
  if (!v) return null;
  const t = await layoutText(font, v, { capHeight: cap, letterSpacing: ((o.spacing ?? 0) / 100) * cap, align: 'left', tolerance: 0.01 }, ctx.inputs);
  if (t.missing.length && o.notes) o.notes.push({ level: 'warning', message: `No bundled font has ${t.missing.map((c) => `“${c}”`).join(' ')}; left out.` });
  if (!t.contours.length) return null;
  const cs = ctx.cs(translate(t.contours, -t.bounds.minX, 0), 'NonZero');
  return { cs, w: t.bounds.maxX - t.bounds.minX, cap, floor: o.floor, colour: o.colour, role: o.role, gap: o.gap };
}

export const ruleLine = (len: number, th: number, colour: Colour, gap: number): Line => ({
  cs: null as unknown as CrossSection,
  w: len,
  cap: th,
  floor: 0,
  colour,
  role: 'rule',
  gap,
  rule: { len, th },
});

/** The thickening a stroke gets so it still prints at a small size, mm. */
const grow = (cap: number) => Math.max(0, 0.44 - 0.15 * cap) / 2;

/** Lines stacked one under the next, fitted to a box at one scale. */
export class Group {
  lines: Line[];
  constructor(lines: (Line | null | undefined)[]) {
    this.lines = lines.filter((l): l is Line => !!l);
  }
  get empty() {
    return this.lines.length === 0;
  }
  /** Width and height at scale `k`, mm. */
  size(k = 1): { w: number; h: number } {
    let w = 0;
    let y = 0;
    this.lines.forEach((l, i) => {
      const iw = l.icon ? l.icon.w + l.cap * 0.75 : 0;
      w = Math.max(w, (iw + l.w) * k);
      y += (i === 0 ? l.cap : l.cap + l.gap) * k;
    });
    const last = this.lines[this.lines.length - 1];
    const desc = last && !last.rule ? last.cap * 0.28 * k : 0;
    return { w, h: y + desc };
  }
  /** The least scale before a line drops under its floor. */
  get kMin(): number {
    return Math.min(1, Math.max(0, ...this.lines.map((l) => (l.floor ? l.floor / l.cap : 0))));
  }
  /** The scale that fits `w × h` (never over 1, never under the floors), and whether it truly fits. */
  fit(w: number, h: number): { k: number; fits: boolean } {
    const s = this.size(1);
    const want = Math.min(1, w / Math.max(s.w, 1e-6), h / Math.max(s.h, 1e-6));
    const k = Math.max(this.kMin, want);
    return { k, fits: want >= this.kMin - 1e-6 };
  }
  /** The pieces with the group's top-left (or top-right, or top-centre) at (x, y). */
  place(ctx: Ctx, x: number, y: number, k: number, align: 'left' | 'center' | 'right' = 'left'): Piece[] {
    const out: Piece[] = [];
    let base = y;
    this.lines.forEach((l, i) => {
      base -= (i === 0 ? l.cap : l.cap + l.gap) * k;
      const iw = l.icon ? (l.icon.w + l.cap * 0.75) * k : 0;
      const lw = iw + l.w * k;
      const x0 = align === 'left' ? x : align === 'right' ? x - lw : x - lw / 2;
      if (l.rule) {
        const th = Math.max(0.6, l.rule.th * k);
        const r = ctx.cs([rect(l.rule.len * k, th)]).translate([x0 + (l.rule.len * k) / 2, base + th / 2]);
        out.push({ cs: r, colour: l.colour, role: 'rule', onField: l.onField });
        return;
      }
      if (l.icon) out.push({ cs: l.icon.cs.scale([k, k]).translate([x0 + (l.icon.w * k) / 2, base + (l.cap * k) / 2]), colour: l.icon.colour, role: 'icons', onField: l.onField });
      const g = grow(l.cap * k);
      let cs = l.cs.scale([k, k]).translate([x0 + iw, base]);
      if (g > 0) cs = cs.offset(g, 'Round', 2, 12);
      out.push({ cs, colour: l.colour, role: l.role, onField: l.onField });
    });
    return out;
  }
}

/** Where a group goes in a box: aligned left/centre/right and top/middle/bottom, fitted. */
export function setIn(ctx: Ctx, g: Group, b: Box, align: 'left' | 'center' | 'right', v: 'top' | 'middle' | 'bottom', notes: Diagnostic[], what: string): { pieces: Piece[]; used: Box } {
  if (g.empty) return { pieces: [], used: box(b.x0, b.y1, b.x0, b.y1) };
  const { k, fits } = g.fit(boxW(b), boxH(b));
  if (!fits) notes.push({ level: 'warning', message: `The ${what} is too long for its room on this design, even at the smallest size that prints; shorten it or pick another design.` });
  const s = g.size(k);
  const x = align === 'left' ? b.x0 : align === 'right' ? b.x1 : (b.x0 + b.x1) / 2;
  const y = v === 'top' ? b.y1 : v === 'bottom' ? b.y0 + s.h : (b.y0 + b.y1) / 2 + s.h / 2;
  const x0 = align === 'left' ? x : align === 'right' ? x - s.w : x - s.w / 2;
  return { pieces: g.place(ctx, x, y, k, align), used: box(x0, y - s.h, x0 + s.w, y) };
}

/* ---------------------------------------------------------------- icons */

const ICON_IDS = { phone: 'tabler:phone', email: 'tabler:mail', website: 'globe' } as const;
export type ContactKind = keyof typeof ICON_IDS;

async function glyph(ctx: Ctx, id: string, size: number): Promise<CrossSection | null> {
  if (id === 'globe') return globe(ctx, size, false, Math.max(0.42, size * 0.1));
  const shapes = await symbolShapes(id, size, ctx.inputs);
  if (!shapes.length) return null;
  return ctx.CrossSection.union(shapes.map((s) => ctx.cs(s.contours, s.fillRule)));
}

/** A globe, `s` across: filled with its lines left open, or drawn in lines `t` wide. */
function globe(ctx: Ctx, s: number, lines: boolean, t: number): CrossSection {
  const R = s / 2;
  const ell = (rx: number, ry: number) => {
    const pts: number[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * 2 * Math.PI;
      pts.push(rx * Math.cos(a), ry * Math.sin(a));
    }
    return ctx.cs([pts]);
  };
  const ringE = (rx: number, ry: number) => ell(rx + t / 2, ry + t / 2).subtract(ell(Math.max(0.01, rx - t / 2), Math.max(0.01, ry - t / 2)));
  const bar = (y: number) => ctx.cs([rect(s * 2, t)]).translate([0, y]);
  const inner = ctx.CrossSection.union([ringE(R * 0.42, R), ctx.cs([rect(t, s * 2)]), bar(0), bar(R * 0.5), bar(-R * 0.5)]);
  if (lines) return ringE(R - t / 2, R - t / 2).add(inner.intersect(ell(R - t / 2, R - t / 2)));
  return ell(R, R).subtract(inner.intersect(ell(R - t, R - t)));
}

/** A contact line's icon, `cap` the line's capital height; centred on the origin. */
export async function icon(ctx: Ctx, kind: ContactKind, cap: number, style: Params['iconStyle']): Promise<{ cs: CrossSection; w: number } | null> {
  if (style === 'none') return null;
  if (style === 'circle' || style === 'square') {
    const s = cap * 1.55;
    const g = await glyph(ctx, ICON_IDS[kind], s * 0.6);
    const back = ctx.cs([style === 'circle' ? circle(s / 2, 40) : roundedRect(s, s, s * 0.22)]);
    return { cs: g ? back.subtract(g.offset(0.12, 'Round', 2, 12)) : back, w: s };
  }
  const s = cap * 1.3;
  const g = await glyph(ctx, ICON_IDS[kind], s);
  if (!g) return null;
  if (style === 'modern' && kind === 'website') return { cs: globe(ctx, s, true, Math.max(0.42, s * 0.11)), w: s };
  if (style === 'modern') {
    // A line drawing of the icon: its outline, a nozzle's line wide.
    const t = Math.max(0.42, s * 0.11);
    const ring = g.subtract(g.offset(-t, 'Round', 2, 12));
    return { cs: ring.isEmpty() ? g : ring, w: s };
  }
  return { cs: g, w: s };
}

/* ---------------------------------------------------------------- mark */

/** The initials of a name, at most three. */
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 3)
    .join('');

/** The mark (the logo, or the initials), fitted in a `size` square and centred on the origin. */
export async function mark(ctx: Ctx, size: number): Promise<CrossSection | null> {
  const p = ctx.params;
  if (p.logoMode === 'none' || size < 3) return null;
  let cs: CrossSection | null = null;
  if (p.logoMode === 'symbol' && p.logo) cs = await glyph(ctx, p.logo, size);
  if (!cs || cs.isEmpty()) {
    const ini = initials(p.name);
    if (!ini) return null;
    const t = await layoutText(p.font, ini, { capHeight: size, align: 'left', tolerance: 0.01 }, ctx.inputs);
    if (!t.contours.length) return null;
    cs = ctx.cs(t.contours, 'NonZero');
  }
  const b = cs.bounds();
  const k = size / Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], 1e-6);
  const s = cs.scale([k, k]);
  const c = s.bounds();
  return s.translate([-(c.min[0] + c.max[0]) / 2, -(c.min[1] + c.max[1]) / 2]);
}

/* ---------------------------------------------------------------- tap mark */

/** The printed mark over an NFC tag: a card with waves coming off it, `size` across. */
export function tapMark(ctx: Ctx, size: number): CrossSection {
  const s = size;
  const t = Math.max(0.6, s * 0.075);
  const arcs: CrossSection[] = [];
  for (let i = 0; i < 3; i++) {
    const r = s * (0.2 + i * 0.15);
    const pts: number[] = [];
    const a0 = -0.7;
    const a1 = 0.7;
    const N = 24;
    for (let j = 0; j <= N; j++) {
      const a = a0 + ((a1 - a0) * j) / N;
      pts.push((r + t / 2) * Math.cos(a), (r + t / 2) * Math.sin(a));
    }
    for (let j = N; j >= 0; j--) {
      const a = a0 + ((a1 - a0) * j) / N;
      pts.push((r - t / 2) * Math.cos(a), (r - t / 2) * Math.sin(a));
    }
    arcs.push(ctx.cs([pts]).offset(t * 0.25, 'Round', 2, 8).offset(-t * 0.25, 'Round', 2, 8));
  }
  const dot = ctx.cs([circle(s * 0.08, 24)]);
  const all = ctx.CrossSection.union([...arcs, dot]);
  const b = all.bounds();
  return all.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
}

/* ---------------------------------------------------------------- patterns */

export const PATTERNS = ['hexagons', 'asanoha', 'seigaiha', 'shippo', 'stars', 'diamonds', 'dots', 'waves', 'blocks', 'rays', 'dahlia'] as const;

/**
 * A pattern in `area`: its lines (or cells) as a region to paint, carve or cut. `size` is the
 * pattern's repeat at 100 % zoom. `origin` puts the pattern's centre somewhere else (a burst
 * opening from a corner). Pieces too small to print are dropped.
 */
export function patternIn(ctx: Ctx, area: CrossSection, size: number, o: { origin?: [number, number]; id?: string; mode?: Params['patternMode'] } = {}): PatternArea | null {
  const p = ctx.params;
  if (area.isEmpty()) return null;
  const id = o.id ?? p.pattern;
  const mode = o.mode ?? p.patternMode;
  const s = Math.max(2, size * (p.patternZoom / 100));
  const b = area.bounds();
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  const [ox, oy] = o.origin ?? [cx, cy];
  const R = Math.hypot(Math.abs(ox - cx) + (b.max[0] - b.min[0]) / 2, Math.abs(oy - cy) + (b.max[1] - b.min[1]) / 2) + s;
  const geo = patternGeometry(id, R, s);
  const place = (cs: Contour[]) => translate(rotate(cs, p.patternAngle), ox, oy);
  const web = Math.max(0.5, p.patternLine);
  const cells: CrossSection[] = [];
  for (const cell of geo.cells) {
    const [add] = place([cell.add]);
    let xs = Infinity;
    let xe = -Infinity;
    let ys = Infinity;
    let ye = -Infinity;
    for (let i = 0; i < add!.length; i += 2) {
      xs = Math.min(xs, add![i]!);
      xe = Math.max(xe, add![i]!);
      ys = Math.min(ys, add![i + 1]!);
      ye = Math.max(ye, add![i + 1]!);
    }
    if (xe < b.min[0] || xs > b.max[0] || ye < b.min[1] || ys > b.max[1]) continue;
    let c = ctx.cs([add!]);
    if (cell.minus?.length) c = c.subtract(ctx.cs(place(cell.minus), 'NonZero'));
    c = c.offset(-web / 2, 'Miter', 2, 0);
    if (!c.isEmpty()) cells.push(c);
  }
  const all = ctx.CrossSection.union(cells);
  // Cut through, the card is the web and the cells are holes; a hole keeps a web of card off the
  // area's edge so the lattice hangs together.
  const paint = mode === 'cut' ? all.intersect(area.offset(-web, 'Miter', 2, 0)) : p.patternPaint === 'cells' ? all.intersect(area) : area.subtract(all);
  const minA = Math.max(0.25, web * web * 0.6);
  const kept = paint.decompose().filter((q) => q.area() >= minA);
  const cs = ctx.CrossSection.union(kept);
  return cs.isEmpty() ? null : { cs, mode, area };
}

/* ---------------------------------------------------------------- misc */

/** A disc. */
export const disc = (ctx: Ctx, x: number, y: number, r: number) => ctx.cs([circle(r, Math.max(48, Math.round(r * 8)))]).translate([x, y]);
export const rectAt = (ctx: Ctx, b: Box) => ctx.cs([rect(boxW(b), boxH(b))]).translate([(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]);
export const roundAt = (ctx: Ctx, b: Box, r: number) => ctx.cs([roundedRect(boxW(b), boxH(b), Math.min(r, boxW(b) / 2 - 0.01, boxH(b) / 2 - 0.01))]).translate([(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]);
export const ringAt = (ctx: Ctx, x: number, y: number, r: number, t: number) => disc(ctx, x, y, r + t / 2).subtract(disc(ctx, x, y, r - t / 2));
