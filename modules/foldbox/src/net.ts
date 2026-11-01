/**
 * Box nets as a tree of panels. Every panel but the root names its parent and the hinge
 * segment it shares with it; the folds are the tree's edges and everything else is a cut.
 * Panels that are not hinged together are always laid out a cut's width apart, so the
 * blank is just the union of the panels.
 *
 * Frame: the base is centred on the origin, x along the length, y front (−) to back (+).
 * The sheet prints with the outside of the box on the bed and the fold grooves on top; every
 * fold closes towards the grooves, so every fold angle is positive (up, out of the bed).
 *
 * The structures are the usual glue-free carton ones: a roll-end tray (front and back walls
 * with corner ears; each end wall rolls over its own thickness and down inside, trapping the
 * ears, and its tabs drop into slots in the floor) and the mailer (that tray with a lid and a
 * tuck on the back wall). Dimensions are derived here from the sheet thickness.
 */
import type { Contour } from '@pf/core';
import { rect, roundedRect, translate } from '@pf/shapes';

export interface Panel {
  id: string;
  name: string;
  /** Outline, counter-clockwise, flat coordinates. */
  outline: Contour;
  holes: Contour[];
  parent?: string;
  /** The shared edge with the parent: [ax, ay, bx, by]. */
  hinge?: [number, number, number, number];
  /** Fold angle at full fold, degrees. */
  angle: number;
}

export type Style = 'mailer' | 'mailer-flaps' | 'tray' | 'tray-lid';

export interface NetOptions {
  style: Style;
  /** Inside length, width, height. */
  L: number;
  W: number;
  H: number;
  /** Sheet thickness (the caliper). */
  t: number;
  /** Width of a cut between unhinged neighbours. */
  gap: number;
  tuckDepth: number;
  tuckLock: 'friction' | 'slit' | 'none';
  thumbNotch: boolean;
  handHoles: boolean;
  window: boolean;
  windowScale: number;
  windowRadius: number;
  /** Tray-and-lid: the lid's depth and its play per side over the tray. */
  lidHeight: number;
  lidPlay: number;
}

export interface Net {
  panels: Panel[];
  /** Panel the window and the default artwork go on. */
  face: string;
}

/** How far the end tabs reach below the inner ply. */
export const TAB_DROP = 1.5;

const box = (x0: number, y0: number, x1: number, y1: number): Contour => [x0, y0, x1, y0, x1, y1, x0, y1];
const stadium = (cx: number, cy: number, w: number, h: number): Contour => translate([roundedRect(w, h, Math.min(w, h) / 2 - 1e-3)], cx, cy)[0]!;

/**
 * Width of the strip over the top of an end wall. Rolled over, the inner ply's printed face
 * turns back towards the wall, so the strip has to leave room for the wall, the ears and the
 * ply: three thicknesses, and a little play for the ears.
 */
export const rollOf = (t: number) => 3 * t + 0.15;

/** Outside size the structure adds to the inside size, per axis. */
export function allowance(t: number): { L: number; W: number; H: number } {
  return { L: 2 * rollOf(t), W: 2 * t, H: t };
}

/**
 * A roll-end tray. `prefix` names its panels, `dy` shifts it in the flat layout, and `back`
 * reports the back wall so a lid can hang off it.
 */
function rollTray(o: NetOptions, L: number, W: number, H: number, prefix: string, dy: number): { panels: Panel[]; Lb: number; Wb: number; Hw: number } {
  const { t, gap } = o;
  const a = allowance(t);
  const Lb = L + a.L;
  const Wb = W + a.W;
  const Hw = H + a.H;
  const id = (s: string) => `${prefix}${s}`;
  const panels: Panel[] = [];
  const add = (p: Panel) => panels.push({ ...p, outline: translate([p.outline], 0, dy)[0]!, holes: p.holes.map((h) => translate([h], 0, dy)[0]!), hinge: p.hinge ? [p.hinge[0], p.hinge[1] + dy, p.hinge[2], p.hinge[3] + dy] : undefined });

  // Floor, with the slots the end tabs drop into.
  const tabW = Math.min(14, Math.max(5, Wb / 4));
  // The ply stops TAB_DROP above the floor and its tabs reach through the floor, ending flush underneath.
  const tabL = 2 * t + TAB_DROP;
  const tabYs = Wb >= 4 * tabW ? [-Wb / 4, Wb / 4] : [0];
  const slots: Contour[] = [];
  const S = rollOf(t);
  for (const s of [-1, 1]) for (const y of tabYs) slots.push(box(s * (Lb / 2 - S - 0.3), y - tabW / 2 - 0.3, s * (Lb / 2 - S + t + 0.3), y + tabW / 2 + 0.3));
  add({ id: id('base'), name: 'Floor', outline: box(-Lb / 2, -Wb / 2, Lb / 2, Wb / 2), holes: slots.map(ccw), angle: 0 });

  // Front and back walls, each with two ears that fold in behind the end walls.
  const ear = Math.max(4, Wb / 2 - 1.5);
  const earTop = gap;
  for (const side of [-1, 1] as const) {
    const wall = side < 0 ? 'front' : 'back';
    const y0 = side * (Wb / 2);
    const y1 = side * (Wb / 2 + Hw);
    const x0 = -Lb / 2 + t;
    const x1 = Lb / 2 - t;
    const outline = box(x0, Math.min(y0, y1), x1, Math.max(y0, y1));
    const holes: Contour[] = [];
    if (o.thumbNotch && wall === 'front' && o.style !== 'tray-lid') {
      const r = Math.min(10, Hw * 0.35, Lb * 0.12);
      holes.push(stadium(0, y1, 2 * r, 2 * r));
    }
    add({ id: id(wall), name: wall === 'front' ? 'Front wall' : 'Back wall', outline, holes, parent: id('base'), hinge: [x0, y0, x1, y0], angle: 90 });
    for (const end of [-1, 1] as const) {
      const hx = end * (Lb / 2 - t);
      const far = hx + end * ear;
      const yA = side * (Wb / 2 + earTop);
      const yB = side * (Wb / 2 + Hw - (wall === 'back' ? gap : 0));
      const ylo = Math.min(yA, yB);
      const yhi = Math.max(yA, yB);
      const c = Math.min(2, ear / 3, (yhi - ylo) / 3);
      // The free corners are cut off so the ear slips in behind the end wall.
      const pts = end > 0 ? [hx, ylo, far - c, ylo, far, ylo + c, far, yhi - c, far - c, yhi, hx, yhi] : [far + c, ylo, hx, ylo, hx, yhi, far + c, yhi, far, yhi - c, far, ylo + c];
      add({ id: id(`${wall}-ear-${end > 0 ? 'r' : 'l'}`), name: `${wall === 'front' ? 'Front' : 'Back'} ${end > 0 ? 'right' : 'left'} ear`, outline: ccw(pts), holes: [], parent: id(wall), hinge: [hx, ylo, hx, yhi], angle: 90 });
    }
  }

  // End walls: wall, a strip over the top, and an inner ply with tabs.
  const ply = Hw - 2 * t - TAB_DROP;
  const plyHalf = Wb / 2 - t - 0.3;
  for (const end of [-1, 1] as const) {
    const e = end > 0 ? 'r' : 'l';
    const name = end > 0 ? 'Right' : 'Left';
    const x = (v: number) => end * v;
    const wallHoles: Contour[] = [];
    const plyHoles: Contour[] = [];
    if (o.handHoles) {
      const hw = Math.min(80, Wb * 0.5);
      const hh = Math.min(22, Hw * 0.28);
      const z = Hw * 0.68;
      wallHoles.push(stadium(x(Lb / 2 + z), 0, hh, hw));
      plyHoles.push(stadium(x(Lb / 2 + Hw + S + (Hw - z)), 0, hh, hw));
    }
    const span = (a: number, b: number) => [Math.min(x(a), x(b)), Math.max(x(a), x(b))] as const;
    const [w0, w1] = span(Lb / 2, Lb / 2 + Hw);
    add({ id: id(`end-${e}`), name: `${name} end`, outline: box(w0, -Wb / 2, w1, Wb / 2), holes: wallHoles.map(ccw), parent: id('base'), hinge: [x(Lb / 2), -Wb / 2, x(Lb / 2), Wb / 2], angle: 90 });
    const [s0, s1] = span(Lb / 2 + Hw, Lb / 2 + Hw + S);
    add({ id: id(`roll-${e}`), name: `${name} end roll`, outline: box(s0, -Wb / 2, s1, Wb / 2), holes: [], parent: id(`end-${e}`), hinge: [x(Lb / 2 + Hw), -Wb / 2, x(Lb / 2 + Hw), Wb / 2], angle: 90 });
    const p0 = Lb / 2 + Hw + S;
    const p1 = p0 + ply;
    const pts: number[] = [];
    // Ply outline with the tabs on its free edge, walked from the hinge.
    pts.push(p0, -plyHalf, p1, -plyHalf);
    for (const ty of tabYs) {
      const n = 0.6;
      pts.push(p1, ty - tabW / 2, p1 + tabL, ty - tabW / 2 + n, p1 + tabL, ty + tabW / 2 - n, p1, ty + tabW / 2);
    }
    pts.push(p1, plyHalf, p0, plyHalf);
    const mapped: number[] = [];
    for (let i = 0; i < pts.length; i += 2) mapped.push(x(pts[i]!), pts[i + 1]!);
    add({ id: id(`ply-${e}`), name: `${name} inner ply`, outline: ccw(mapped), holes: plyHoles.map(ccw), parent: id(`roll-${e}`), hinge: [x(p0), -plyHalf, x(p0), plyHalf], angle: 90 });
  }
  return { panels, Lb, Wb, Hw };
}

function ccw(c: Contour): Contour {
  let a = 0;
  for (let i = 0, j = c.length - 2; i < c.length; j = i, i += 2) a += c[j]! * c[i + 1]! - c[i]! * c[j + 1]!;
  if (a >= 0) return c;
  const out: number[] = [];
  for (let i = c.length - 2; i >= 0; i -= 2) out.push(c[i]!, c[i + 1]!);
  return out;
}

export function tuckDepthOf(o: NetOptions): number {
  return o.tuckDepth > 0 ? Math.min(o.tuckDepth, o.H - o.t) : Math.max(4, Math.min(30, o.H * 0.7, o.W * 0.5));
}

function windowIn(panel: Panel, o: NetOptions): Contour | null {
  if (!o.window) return null;
  const xs = panel.outline.filter((_, i) => i % 2 === 0);
  const ys = panel.outline.filter((_, i) => i % 2 === 1);
  const w = (Math.max(...xs) - Math.min(...xs)) * o.windowScale;
  const h = (Math.max(...ys) - Math.min(...ys)) * o.windowScale;
  if (w < 6 || h < 6) return null;
  const c = translate([roundedRect(w, h, Math.min(o.windowRadius, w / 2 - 0.01, h / 2 - 0.01))], (Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2)[0]!;
  return c;
}

export function buildNet(o: NetOptions): Net {
  const { t, gap } = o;
  if (o.style === 'tray' || o.style === 'tray-lid') {
    const tray = rollTray(o, o.L, o.W, o.H, '', 0);
    const panels = tray.panels;
    let face = 'front';
    if (o.style === 'tray-lid') {
      // The lid is a second tray turned over the first: its inside is the tray's outside plus play.
      const L2 = tray.Lb + 2 * o.lidPlay;
      const W2 = tray.Wb + 2 * o.lidPlay;
      const a = allowance(t);
      const H2 = Math.max(4, Math.min(o.lidHeight, o.H + a.H));
      const dy = tray.Wb / 2 + tray.Hw + 6 + (W2 + a.W) / 2 + H2 + a.H;
      panels.push(...rollTray({ ...o, thumbNotch: false, handHoles: false }, L2, W2, H2, 'lid-', dy).panels);
      face = 'lid-base';
    }
    const host = panels.find((p) => p.id === face)!;
    const win = windowIn(host, o);
    if (win) host.holes.push(win);
    return { panels, face };
  }
  const tray = rollTray(o, o.L, o.W, o.H, '', 0);
  const { Lb, Wb, Hw } = tray;
  const panels = tray.panels;
  // Lid off the back wall's top edge; it reaches the front wall's inside face so the tuck drops in.
  const y0 = Wb / 2 + Hw;
  const y1 = y0 + Wb - t;
  const half = Lb / 2 + t;
  const lid: Panel = { id: 'lid', name: 'Lid', outline: box(-half, y0, half, y1), holes: [], parent: 'back', hinge: [Lb / 2 - t, y0, -Lb / 2 + t, y0], angle: 90 };
  const win = windowIn(lid, o);
  if (win) lid.holes.push(win);
  panels.push(lid);
  const d = tuckDepthOf(o);
  const tw = o.L - (o.tuckLock === 'friction' ? 1.0 : 1.6);
  const c = Math.min(d * 0.4, 6);
  const tuck: Contour = [tw / 2, y1, tw / 2, y1 + d - c, tw / 2 - c, y1 + d, -tw / 2 + c, y1 + d, -tw / 2, y1 + d - c, -tw / 2, y1];
  const hinge: [number, number, number, number] = [-tw / 2, y1, tw / 2, y1];
  if (o.tuckLock === 'slit') {
    // Shoulders a little wider than the opening, just past the fold: they catch inside the front wall.
    const sh = 0.6;
    const s0 = y1 + 1.2;
    const s1 = s0 + 3;
    tuck.splice(0, 2, tw / 2, y1, tw / 2 + sh, s0, tw / 2 + sh, s1, tw / 2, s1 + sh);
    tuck.splice(tuck.length - 2, 0, -tw / 2, s1 + sh, -tw / 2 - sh, s1, -tw / 2 - sh, s0);
  }
  panels.push({ id: 'tuck', name: 'Tuck', outline: ccw(tuck), holes: [], parent: 'lid', hinge, angle: 90 });
  if (o.style === 'mailer-flaps') {
    const fd = Math.max(4, Math.min(20, o.H * 0.5));
    for (const end of [-1, 1] as const) {
      const ya = y0 + gap + 2;
      const yb = y1 - 2;
      const xa = end * half;
      const xb = end * (half + fd);
      const cc = Math.min(fd * 0.4, 4);
      const pts = end > 0 ? [xa, ya, xb, ya + cc, xb, yb - cc, xa, yb] : [xb, ya + cc, xa, ya, xa, yb, xb, yb - cc];
      panels.push({ id: `lid-flap-${end > 0 ? 'r' : 'l'}`, name: `Lid ${end > 0 ? 'right' : 'left'} flap`, outline: ccw(pts), holes: [], parent: 'lid', hinge: [xa, ya, xa, yb], angle: 90 });
    }
  }
  return { panels, face: 'lid' };
}
