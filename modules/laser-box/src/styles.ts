/**
 * The four box styles as slabs, joints and features. Every style is the same body (four walls
 * and a floor) with a different top, except the chest of drawers, which is a case with drawers.
 *
 * Ranks, which decide who keeps a corner block three pieces share: the front and back keep
 * every corner (3), the sides keep their runs along the floor (2), floors, shelves and lids
 * keep nothing at a corner (1), dividers least (0). A drawer's front plate outranks all of its
 * drawer (4) so its slots stay whole.
 */
import type { Contour } from '@pf/core';
import { circle, rect, reverse, roundedRect, translate } from '@pf/shapes';
import type { Interval } from './fingers';
import { fingerMin, fingerWidth, flexWidth, planAround } from './fingers';
import type { Axis, FaceId, Feature, Joint, Motion, Slab, V3, World } from './world';

export type Style = 'open' | 'lid' | 'hinge' | 'drawer';
export type Bottom = 'flush' | 'slots' | 'feet';

export interface Spec {
  style: Style;
  /** Outside size, mm (see `outsideOf` for inside sizes). */
  L: number;
  W: number;
  H: number;
  t: number;
  /** Interference on friction joints, mm across a finger: + grips, − slides. */
  fit: number;
  /** Flex tabs where a tab goes into a slot. */
  flex: boolean;
  /** Finger width to aim at, mm; 0 picks one from the sheet. */
  finger: number;
  bottom: Bottom;
  dividersX: number;
  dividersY: number;
  drawers: number;
  fingerHole: boolean;
}

/** How far the floor sits above the table. */
export const floorRise = (b: Bottom, t: number): number => (b === 'flush' ? 0 : b === 'slots' ? Math.max(t, 3) : Math.max(2.5 * t, 8));
/** Clearance round a lift-off lid's lip, mm: it comes off by hand, so never a press. */
export const lipPlay = (fit: number): number => Math.min(0.5, Math.max(0.2, 0.35 - fit));
/** Extra interference a flex tab takes along its joint; its slits give. */
export const FLEX_EXTRA = 0.1;

/* Hinged lid clearances, mm. */
const SIDE_PLAY = 0.3;
const FRONT_PLAY = 0.3;
const SWING_PLAY = 0.3;
const PIN_PLAY = 0.5;
/** The latch's grip across its tab, mm: a light press, opened every day. */
export const latchGrip = (fit: number): number => Math.min(0.2, Math.max(-0.05, fit + 0.05));

/* Drawer clearances in their bays, mm. */
export const DRAWER_SIDE = 0.5;
export const DRAWER_TOP = 1;
export const DRAWER_BACK = 1;

const X: V3 = [1, 0, 0];
const Y: V3 = [0, 1, 0];
const Z: V3 = [0, 0, 1];
const nX: V3 = [-1, 0, 0];
const nY: V3 = [0, -1, 0];

class Builder {
  slabs: Slab[] = [];
  joints: Joint[] = [];
  features = new Map<string, Feature>();
  motions = new Map<string, Motion>();
  warnings: string[] = [];
  constructor(readonly s: Spec) {}
  get t() {
    return this.s.t;
  }
  slab(id: string, label: string, min: V3, max: V3, rank: number, u: V3, v: V3, face: FaceId | null, group?: string): Slab {
    const s: Slab = { id, label, min, max, rank, u, v, face, group };
    this.slabs.push(s);
    return s;
  }
  feature(id: string): Feature {
    let f = this.features.get(id);
    if (!f) this.features.set(id, (f = {}));
    return f;
  }
  warn(msg: string) {
    if (!this.warnings.includes(msg)) this.warnings.push(msg);
  }
  /**
   * A joint between `a` and `b` along `axis`, `b` keeping the tabs, planned on `range` clear
   * of `avoid`. `extra` hands `b` whole stretches as well (a hinged lid's ears).
   */
  joint(a: string, b: string, axis: Axis, range: Interval, kind: Joint['kind'], opts: { avoid?: Interval[]; clear?: number; extra?: Interval[]; fit?: number; intervals?: Interval[]; planTo?: number } = {}) {
    const t = this.t;
    const flex = kind === 'slot' && this.s.flex;
    const target = this.s.finger > 0 ? this.s.finger : flex ? flexWidth(t) : fingerWidth(t);
    const intervals = opts.intervals ?? planAround(range[0], opts.planTo ?? range[1], opts.avoid ?? [], target, fingerMin(t), opts.clear ?? 0);
    if (!opts.intervals && !intervals.length && range[1] - range[0] > 1) this.warn('An edge is too short for a finger and was left plain. Make the box a little larger or the sheet thinner.');
    this.joints.push({ a, b, axis, range, intervals: [...intervals, ...(opts.extra ?? [])], kind, fit: opts.fit ?? this.s.fit, flex: flex ? FLEX_EXTRA : undefined });
  }
}

/** Where along a wall a thumb notch goes: its middle, or the middle compartment's. */
function notchAt(len: number, dividers: number[]): number {
  const mid = len / 2;
  if (!dividers.some((d) => Math.abs(d - mid) < 15)) return mid;
  const edges = [0, ...dividers, len];
  let best = mid;
  let dist = Infinity;
  for (let i = 0; i + 1 < edges.length; i++) {
    const c = (edges[i]! + edges[i + 1]!) / 2;
    if (Math.abs(c - mid) < dist) {
      dist = Math.abs(c - mid);
      best = c;
    }
  }
  return best;
}

/** The skirt cut away between feet along a wall's bottom edge `len` long, `h` tall. */
function arches(len: number, h: number, t: number, x0 = 0, x1 = len): Contour[] {
  const foot = Math.max(10, 3 * t);
  const span = x1 - x0;
  const n = Math.max(1, Math.ceil((span - 2 * foot) / 140));
  const gap = (span - (n + 1) * foot) / n;
  if (gap < 10 || h < 1) return [];
  const r = Math.min(3, h, gap / 2);
  const out: Contour[] = [];
  for (let i = 0; i < n; i++) {
    const a = x0 + foot + i * (foot + gap);
    // Overshoots the bottom edge so nothing is left there.
    out.push(...translate([roundedRect(gap, h + 1 + r, r)], a + gap / 2, (h - 1 - r) / 2));
  }
  return out;
}

interface BodyOpts {
  L: number;
  W: number;
  tops: { front: number; back: number; sides: number };
  dividerTop: number;
  /** Side walls keep their back corners whole this far down from the top. */
  ears?: number;
}

/** Four walls, a floor and the dividers. Returns the floor's top and the dividers' centres. */
function body(B: Builder, o: BodyOpts): { floorTop: number; xs: number[]; ys: number[] } {
  const { t, s } = B;
  const { L, W, tops } = o;
  const f = floorRise(s.bottom, t);
  const ft = f + t;
  B.slab('front', 'Front', [0, 0, 0], [L, t, tops.front], 3, X, Z, 'front');
  B.slab('back', 'Back', [0, W - t, 0], [L, W, tops.back], 3, nX, Z, 'back');
  B.slab('left', 'Left side', [0, 0, 0], [t, W, tops.sides], 2, nY, Z, 'left');
  B.slab('right', 'Right side', [L - t, 0, 0], [L, W, tops.sides], 2, Y, Z, 'right');
  B.slab('floor', 'Bottom', [0, 0, f], [L, W, ft], 1, X, nY, 'bottom');

  const band: Interval[] = f > 0 ? [[f, ft]] : [[0, t]];
  for (const wall of ['front', 'back'])
    for (const side of ['left', 'right']) {
      const top = Math.min(wall === 'front' ? tops.front : tops.back, tops.sides);
      const ears = wall === 'back' ? (o.ears ?? 0) : 0;
      B.joint(wall, side, 2, [0, top], 'finger', { avoid: band, planTo: top - ears, extra: ears > 0 ? [[top - ears, top]] : [] });
    }

  // Dividers, evenly spaced inside.
  const nx = Math.max(0, Math.round(s.dividersX));
  const ny = Math.max(0, Math.round(s.dividersY));
  let xs = Array.from({ length: nx }, (_, i) => t + ((L - 2 * t) * (i + 1)) / (nx + 1));
  let ys = Array.from({ length: ny }, (_, i) => t + ((W - 2 * t) * (i + 1)) / (ny + 1));
  const top = o.dividerTop;
  if ((nx || ny) && top - ft < 3 * t + 5) {
    B.warn('The box is too shallow for dividers.');
    xs = [];
    ys = [];
  }
  const cross = (cs: number[]): Interval[] => cs.map((c) => [c - t / 2, c + t / 2]);
  const kind = s.bottom === 'flush' ? 'finger' : 'slot';
  B.joint('front', 'floor', 0, [t, L - t], kind, { avoid: cross(xs), clear: t });
  B.joint('back', 'floor', 0, [t, L - t], kind, { avoid: cross(xs), clear: t });
  B.joint('left', 'floor', 1, [t, W - t], kind, { avoid: cross(ys), clear: t });
  B.joint('right', 'floor', 1, [t, W - t], kind, { avoid: cross(ys), clear: t });

  xs.forEach((x, i) => {
    const id = `dx${i + 1}`;
    B.slab(id, 'Divider, front to back', [x - t / 2, 0, f], [x + t / 2, W, top], 0, Y, Z, null);
    B.joint('front', id, 2, [ft, top], 'slot');
    B.joint('back', id, 2, [ft, top], 'slot');
    B.joint('floor', id, 1, [t, W - t], 'slot', { avoid: cross(ys), clear: t });
  });
  ys.forEach((y, i) => {
    const id = `dy${i + 1}`;
    B.slab(id, 'Divider, side to side', [0, y - t / 2, f], [L, y + t / 2, top], 0, X, Z, null);
    B.joint('left', id, 2, [ft, top], 'slot');
    B.joint('right', id, 2, [ft, top], 'slot');
    B.joint('floor', id, 0, [t, L - t], 'slot', { avoid: cross(xs), clear: t });
    // Where two cross they halve into each other: the front-to-back one keeps the lower half.
    xs.forEach((_, k) => B.joint(id, `dx${k + 1}`, 2, [ft, top], 'finger', { intervals: [[ft, (ft + top) / 2]], fit: 0 }));
  });

  if (s.bottom === 'feet') {
    const h = f - t;
    B.feature('front').cut = arches(L, h, t);
    B.feature('back').cut = arches(L, h, t);
    B.feature('left').cut = arches(W, h, t);
    B.feature('right').cut = arches(W, h, t);
  }
  return { floorTop: ft, xs, ys };
}

function openBox(B: Builder): void {
  const { L, W, H } = B.s;
  body(B, { L, W, tops: { front: H, back: H, sides: H }, dividerTop: H });
}

function liftOffLid(B: Builder): void {
  const { L, W, H, fit } = B.s;
  const t = B.t;
  const top = H - t;
  const { floorTop, xs } = body(B, { L, W, tops: { front: top, back: top, sides: top }, dividerTop: top - t - 0.5 });
  const p = lipPlay(fit);
  B.slab('lid', 'Lid', [0, 0, top], [L, W, H], 1, X, Y, 'lid', 'lid');
  const lx = L - 2 * t - 2 * p;
  const ly = W - 2 * t - 2 * p;
  const lw = Math.min(Math.max(2 * t, 6), Math.min(lx, ly) / 4);
  B.slab('lip', 'Lid lip (glue under the lid)', [t + p, t + p, top - t], [L - t - p, W - t - p, top], 1, X, Y, null, 'lid');
  const r = Math.min(3, lw);
  B.feature('lip').shape = translate([roundedRect(lx, ly, r)], lx / 2, ly / 2);
  B.feature('lip').cut = translate([rect(lx - 2 * lw, ly - 2 * lw)], lx / 2, ly / 2);
  // A pattern cut through the lid stays inside the lip's window.
  const win = translate([rect(lx - 2 * lw, ly - 2 * lw)], L / 2, W / 2)[0]!;
  B.feature('lid').keepOutCut = [translate([rect(L, W)], L / 2, W / 2)[0]!, reverse(win)];
  B.motions.set('lid', { kind: 'lift', distance: Math.max(25, H * 0.6) });
  if (B.s.fingerHole) {
    const r = Math.min(12, (top - floorTop) * 0.35);
    if (r >= 5) B.feature('front').cut = [...(B.feature('front').cut ?? []), ...translate([circle(r)], notchAt(L, xs), top)];
  }
}

/**
 * Hinged lid. The lid sits between the side walls, flush with every wall's top. Its back
 * corners run out as square pins (the lid's own sheet, t × t) through round holes in the side
 * walls, ⌀ = √2·t + PIN_PLAY, centred on the lid's mid-thickness. That hole breaks the top
 * edge, so each side wall carries a round knuckle over it. Turning, the lid's back edge sweeps
 * a circle of radius ρ = t/√2 about the pin: the back wall stands ρ − t/2 + SWING_PLAY behind
 * it, and opened past upright the lid's top comes to rest on the back wall's top edge.
 *
 * The latch: a recess a sheet deep in the front wall's top edge, and a pull tab on the lid's
 * front edge that drops into it. The recess floor holds the lid's front up, the tab's sides
 * grip the recess's by `latchGrip`, and the tab's overhang is the pull.
 */
function hingedLid(B: Builder): void {
  const { L, W, H, fit } = B.s;
  const t = B.t;
  const rho = t / Math.SQRT2;
  const yp = W - t - rho - SWING_PLAY;
  const d = Math.SQRT2 * t + PIN_PLAY;
  const rim = Math.max(1.5, 0.8 * t);
  const R = d / 2 + rim;
  const ears = t / 2 + R;
  body(B, { L, W, tops: { front: H, back: H, sides: H }, dividerTop: H - t / 2 - rho - SWING_PLAY - 0.2, ears });

  const x0 = t + SIDE_PLAY;
  const y0 = t + FRONT_PLAY;
  const lw = L - 2 * x0;
  const ld = yp + t / 2 - y0;
  B.slab('lid', 'Lid', [x0, y0, H - t], [L - x0, yp + t / 2, H], 1, X, Y, 'lid', 'lid');
  const lid = B.feature('lid');
  lid.add = [...translate([rect(x0, t)], -x0 / 2, ld - t / 2), ...translate([rect(x0, t)], lw + x0 / 2, ld - t / 2)];
  const rw = Math.min(30, Math.max(16, L / 4));
  const tw = rw + latchGrip(fit);
  const out = Math.max(4, t + 1);
  const reach = t + FRONT_PLAY + out;
  const r = Math.min(2.5, out - 0.5);
  lid.add.push(...translate([roundedRect(tw, reach + r, r)], lw / 2, (r - reach) / 2));
  lid.keepOut = translate([rect(tw + 2, 4)], lw / 2, 0);
  B.feature('front').cut = [...(B.feature('front').cut ?? []), ...translate([rect(rw, t + 1)], L / 2, H - t + (t + 1) / 2)];

  // Knuckle and pin hole on each side wall.
  const cz = H - t / 2;
  const half = Math.sqrt(R * R - (t / 2) ** 2);
  for (const [id, cx] of [
    ['left', W - yp],
    ['right', yp],
  ] as const) {
    // Only above the top line: below it the wall's own wood (and its corner notches) stand.
    const knuckle: number[] = [cx + half, H - 0.01];
    const a0 = Math.asin(t / 2 / R);
    const n = 32;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((Math.PI - 2 * a0) * i) / n;
      knuckle.push(cx + R * Math.cos(a), cz + R * Math.sin(a));
    }
    knuckle.push(cx - half, H - 0.01);
    const f = B.feature(id);
    f.add = [...(f.add ?? []), knuckle];
    f.cut = [...(f.cut ?? []), ...translate([circle(d / 2, 48)], cx, cz)];
    f.keepOut = [...(f.keepOut ?? []), ...translate([circle(R + 1, 48)], cx, cz)];
  }
  B.motions.set('lid', { kind: 'hinge', at: [0, yp, cz], axis: [-1, 0, 0], degrees: 105 });
}

/**
 * Chest of drawers: a case (back, sides, floor, shelves and top; open at the front) with up to
 * three bays, a drawer in each. A drawer is a small open box sliding on its bay's floor,
 * DRAWER_SIDE clear each side, DRAWER_TOP under the ceiling and DRAWER_BACK short of the back.
 * Its front is an overlay plate wider and taller than the bay that covers the case's front
 * edges (the fronts tile the box's front with 1 mm between them): pushed home, the plate's back
 * against those edges is the stop. The drawer's sides and floor tab through the plate.
 */
function drawers(B: Builder): { bay: number; N: number } {
  const { L, W, H, bottom, fingerHole } = B.s;
  const t = B.t;
  const f = floorRise(bottom, t);
  const bayOf = (n: number) => (H - f - (n + 1) * t) / n;
  const asked = Math.max(1, Math.min(3, Math.round(B.s.drawers)));
  let N = asked;
  while (N > 1 && bayOf(N) < 3 * t + 12) N--;
  if (N < asked) B.warn(`Only ${N} drawer${N === 1 ? '' : 's'} fit this height. Make the box taller for ${asked}.`);
  const hb = bayOf(N);
  const y0 = t;
  B.slab('back', 'Back', [0, W - t, 0], [L, W, H], 3, nX, Z, 'back');
  B.slab('left', 'Left side', [0, y0, 0], [t, W, H], 2, nY, Z, 'left');
  B.slab('right', 'Right side', [L - t, y0, 0], [L, W, H], 2, Y, Z, 'right');
  B.slab('floor', 'Bottom', [0, y0, f], [L, W, f + t], 1, X, nY, 'bottom');
  B.slab('top', 'Top', [0, y0, H - t], [L, W, H], 1, X, Y, 'lid');
  const shelves = Array.from({ length: N - 1 }, (_, k) => f + t + (k + 1) * hb + k * t);
  shelves.forEach((z, k) => B.slab(`shelf${k + 1}`, 'Shelf', [0, y0, z], [L, W, z + t], 1, X, Y, null));

  const bands: Interval[] = [[f, f + t], ...shelves.map((z) => [z, z + t] as Interval), [H - t, H]];
  for (const side of ['left', 'right']) B.joint('back', side, 2, [0, H], 'finger', { avoid: bands });
  const floorKind = bottom === 'flush' ? 'finger' : 'slot';
  for (const side of ['left', 'right']) {
    B.joint(side, 'floor', 1, [y0, W - t], floorKind);
    B.joint(side, 'top', 1, [y0, W - t], 'finger');
    shelves.forEach((_, k) => B.joint(side, `shelf${k + 1}`, 1, [y0, W - t], 'slot'));
  }
  B.joint('back', 'floor', 0, [t, L - t], floorKind);
  B.joint('back', 'top', 0, [t, L - t], 'finger');
  shelves.forEach((_, k) => B.joint('back', `shelf${k + 1}`, 0, [t, L - t], 'slot'));
  if (bottom === 'feet') {
    const h = f - t;
    B.feature('back').cut = arches(L, h, t);
    B.feature('left').cut = arches(W - y0, h, t);
    B.feature('right').cut = arches(W - y0, h, t);
  }

  // The drawers.
  const dx0 = t + DRAWER_SIDE;
  const dx1 = L - t - DRAWER_SIDE;
  const dy1 = W - t - DRAWER_BACK;
  for (let k = 0; k < N; k++) {
    const p = `d${k + 1}-`;
    const g = `drawer${k + 1}`;
    const zf = f + t + k * (hb + t);
    const z1 = zf + hb - DRAWER_TOP;
    const pz0 = k === 0 ? f : zf - t / 2 + 0.5;
    const pz1 = k === N - 1 ? H : zf + hb + t / 2 - 0.5;
    const name = N > 1 ? `Drawer ${k + 1}` : 'Drawer';
    B.slab(`${p}front`, `${name} front`, [0, 0, pz0], [L, t, pz1], 4, X, Z, 'front', g);
    B.slab(`${p}back`, `${name} back`, [dx0, dy1 - t, zf], [dx1, dy1, z1], 3, nX, Z, null, g);
    B.slab(`${p}left`, `${name} left side`, [dx0, 0, zf], [dx0 + t, dy1, z1], 2, nY, Z, null, g);
    B.slab(`${p}right`, `${name} right side`, [dx1 - t, 0, zf], [dx1, dy1, z1], 2, Y, Z, null, g);
    // Raised a sheet, so the plate keeps wood under its slots.
    B.slab(`${p}floor`, `${name} bottom`, [dx0, 0, zf + t], [dx1, dy1, zf + 2 * t], 1, X, nY, null, g);
    const band: Interval[] = [[zf + t, zf + 2 * t]];
    for (const side of ['left', 'right']) {
      B.joint(`${p}front`, `${p}${side}`, 2, [zf, z1], 'slot', { avoid: band });
      B.joint(`${p}back`, `${p}${side}`, 2, [zf, z1], 'finger', { avoid: band });
      B.joint(`${p}${side}`, `${p}floor`, 1, [t, dy1 - t], 'slot');
    }
    B.joint(`${p}front`, `${p}floor`, 0, [dx0 + t, dx1 - t], 'slot');
    B.joint(`${p}back`, `${p}floor`, 0, [dx0 + t, dx1 - t], 'slot');
    if (fingerHole) {
      const inner = z1 - (zf + 2 * t);
      const hh = Math.min(14, inner * 0.4);
      const hw = Math.min(32, (dx1 - dx0 - 2 * t) * 0.4);
      if (hh >= 6 && hw >= hh) B.feature(`${p}front`).cut = translate([roundedRect(hw, hh, hh / 2)], L / 2, zf + 2 * t + inner * 0.62 - pz0);
    }
    B.motions.set(g, { kind: 'slide', dir: [0, -1, 0], distance: (dy1 - t) * 0.6 });
  }
  return { bay: hb, N };
}

/** The outside size a box needs for an inside size, per style. */
export function outsideOf(style: Style, bottom: Bottom, t: number, L: number, W: number, H: number, drawers: number): V3 {
  const f = floorRise(bottom, t);
  if (style === 'drawer') {
    const N = Math.max(1, Math.min(3, Math.round(drawers)));
    const hb = H + DRAWER_TOP + 2 * t;
    return [L + 4 * t + 2 * DRAWER_SIDE, W + 3 * t + DRAWER_BACK, f + (N + 1) * t + N * hb];
  }
  const lid = style === 'open' ? 0 : t;
  return [L + 2 * t, W + 2 * t, H + f + t + lid];
}

export function buildWorld(s: Spec): World {
  const B = new Builder(s);
  const t = s.t;
  const f = floorRise(s.bottom, t);
  let inside: V3;
  if (s.style === 'drawer') {
    const { bay } = drawers(B);
    inside = [s.L - 4 * t - 2 * DRAWER_SIDE, s.W - 3 * t - DRAWER_BACK, bay - DRAWER_TOP - 2 * t];
  } else {
    if (s.style === 'open') openBox(B);
    else if (s.style === 'lid') liftOffLid(B);
    else hingedLid(B);
    inside = [s.L - 2 * t, s.W - 2 * t, s.H - f - t - (s.style === 'open' ? 0 : t)];
  }
  return { slabs: B.slabs, joints: B.joints, features: B.features, motions: B.motions, outside: [s.L, s.W, s.H], inside, warnings: B.warnings };
}
