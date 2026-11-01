/**
 * Things that stand up, cut flat: a tent (two panels leaning on each other, two braces holding
 * them apart), a foot stand (a plate leaning back on two feet that cross under it in half-laps)
 * and a slot stand (an upright whose tongue drops into a slot in a flat base).
 *
 * Each works in the piece's cross section: Y runs front (−) to back (+), Z is up, the table is
 * Z = 0. The joints are solved there, from where the pieces really are once leaned, so a slot is
 * as wide as the board crossing it at that angle and no wider. Each returns the flat pieces, the
 * clear box on the face for the caller's lettering and code, and the poses that put the pieces
 * together in 3D.
 */
import type { Diagnostic } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { rect, roundedRect, translate } from '@pf/shapes';
import type { Ctx } from './lib';

type Pt = [number, number];
const D = Math.PI / 180;

/** A box on a face: what is clear for lettering and codes. */
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const boxW = (b: Box) => b.x1 - b.x0;
export const boxH = (b: Box) => b.y1 - b.y0;

/** A convex polygon clipped to lo ≤ f(p) ≤ hi, for a linear f. */
export function clipSlab(poly: Pt[], f: (p: Pt) => number, lo: number, hi: number): Pt[] {
  const half = (pts: Pt[], keep: (p: Pt) => number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const fa = keep(a);
      const fb = keep(b);
      if (fa >= 0) out.push(a);
      if (fa >= 0 !== fb >= 0) {
        const t = fa / (fa - fb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  return half(
    half(poly, (p) => f(p) - lo),
    (p) => hi - f(p),
  );
}

const span = (pts: Pt[], k: 0 | 1): [number, number] => [Math.min(...pts.map((p) => p[k])), Math.max(...pts.map((p) => p[k]))];

/** A board's cross section: the rectangle v ∈ [v0, v1] along it, w ∈ [0, t] through it, placed. */
const board = (at: (v: number, w: number) => Pt, v0: number, v1: number, t: number): Pt[] => [at(v0, 0), at(v1, 0), at(v1, t), at(v0, t)];

/** A board W × H standing on y = 0: rounded at the top, square where it meets the table. */
export function topRounded(ctx: Ctx, W: number, H: number, r: number): CrossSection {
  const rr = Math.max(0, Math.min(r, W / 2 - 0.01, H / 2 - 0.01));
  return ctx.cs([roundedRect(W, H, rr)]).translate([0, H / 2]).add(ctx.cs([rect(W, H / 2)]).translate([0, H / 4]));
}

/* ------------------------------------------------------------------------------- tent */

export interface Tent {
  /** One panel, flat: bottom edge on y = 0, centred on x = 0. Both panels are this. */
  panel: CrossSection;
  /** One brace, flat, drawn in the cross section (x = Y, y = Z). */
  brace: CrossSection;
  /** Where the panel's face is clear of the slots and the edges. */
  content: Box;
  /** The two braces' places across the tent. */
  braceX: number;
  angle: number;
  notes: Diagnostic[];
}

/**
 * Two panels `W` wide and `H` along the slope leaning on each other at `angle` from the table,
 * held apart by two braces through slots near their side edges. A brace's notches are cut where
 * the panels cross its lower half, so it drops onto them and the pair can neither fold shut nor
 * spread; its upper half passes through the panels' slots.
 */
export function tent(ctx: Ctx, W: number, H: number, t: number, angle: number, margin: number): Tent {
  const notes: Diagnostic[] = [];
  const th = Math.max(55, Math.min(84, angle));
  if (th !== angle) notes.push({ level: 'info', message: `A tent stands between 55° and 84°; it is drawn at ${th}°.` });
  const phi = (90 - th) * D;
  const [s, c] = [Math.sin(phi), Math.cos(phi)];
  const clear = 0.1;
  // The left panel in the cross section: u down from the apex, w out from its inner face.
  const left = (u: number, w: number): Pt => [-(u * s + w * c), (H - u) * c + w * s];
  const panelXs = board(left, 0, H, t);
  const hb = Math.max(8, Math.min(16, H * 0.12));
  const zb = H * c * 0.2;
  const zm = zb + hb / 2;
  const zt = zb + hb;
  // The brace's notch: where the panel is across the brace's lower half.
  const [ya, yb] = span(clipSlab(panelXs, (p) => p[1], zb - 0.01, zm), 0);
  const tab = Math.max(5, 2 * t);
  const reach = -(ya - tab);
  let brace = ctx.cs([roundedRect(2 * reach, hb, Math.min(2, hb / 4))]).translate([0, zb + hb / 2]);
  for (const side of [-1, 1]) {
    const lo = side < 0 ? ya - clear : -(yb + clear);
    const hi = side < 0 ? yb + clear : -(ya - clear);
    brace = brace.subtract(ctx.cs([rect(hi - lo, zm - zb + 1)]).translate([(lo + hi) / 2, (zb - 1 + zm) / 2]));
  }
  // The panel's slot: where the brace's upper half passes through it, as u along the panel.
  const inPanel: Pt[] = [
    [0, 0],
    [H, 0],
    [H, t],
    [0, t],
  ];
  const [ua, ub] = span(
    clipSlab(inPanel, ([u, w]) => (H - u) * c + w * s, zm, zt),
    0,
  );
  const xb = W / 2 - Math.max(8, W * 0.1);
  let panel = topRounded(ctx, W, H, Math.min(6, W / 10));
  for (const x of [-xb, xb]) panel = panel.subtract(ctx.cs([rect(t + 2 * clear, ub - ua + 2 * clear)]).translate([x, H - (ua + ub) / 2]));
  // Between the slots, which sit near the side edges, the face is clear from bottom to top.
  const content: Box = { x0: -xb + t / 2 + margin, x1: xb - t / 2 - margin, y0: margin, y1: H - margin };
  return { panel, brace, content, braceX: xb, angle: th, notes };
}

/** Poses for a tent's pieces: the two panels, then the two braces. */
export function tentPoses(g: Tent, H: number, t: number) {
  const phi = (90 - g.angle) * D;
  return {
    front: { at: [0, -H * Math.sin(phi), 0] as [number, number, number], pose: { rx: g.angle, z: 0 } },
    back: { at: [0, H * Math.sin(phi), 0] as [number, number, number], pose: { rx: g.angle, rz: 180, z: 0 } },
    brace: (side: -1 | 1) => ({ at: [side * g.braceX - t / 2, 0, 0] as [number, number, number], pose: { rx: 90, rz: 90, z: 0 } }),
  };
}

/* ------------------------------------------------------------------------- foot stand */

export interface FootStand {
  /** The plate, flat: bottom edge on y = 0. */
  plate: CrossSection;
  /** One foot, flat, drawn in the cross section (x = Y, y = Z). */
  foot: CrossSection;
  content: Box;
  footX: number;
  notes: Diagnostic[];
}

/**
 * A plate `W` × `H` leaning back `lean` degrees from upright on two feet that run front to back
 * under it. The plate's slots rise from its bottom edge; each foot's notch drops from its crown
 * along the plate, cut where the plate really is at that lean, so the two roots meet and the
 * plate's bottom edge lands on the table.
 */
export function footStand(ctx: Ctx, W: number, H: number, t: number, lean: number, margin: number): FootStand {
  const notes: Diagnostic[] = [];
  const l = Math.max(0, Math.min(25, lean)) * D;
  const [s, c] = [Math.sin(l), Math.cos(l)];
  const clear = 0.1;
  // The plate in the cross section: v up it from the bottom, w back from its front face.
  const at = (v: number, w: number): Pt => [v * s + w * c, v * c - w * s + t * s];
  const lap = Math.max(12, Math.min(30, H * 0.14));
  const web = Math.max(8, 2.5 * t);
  const crown = lap * c + t * s + web;
  const notch = clipSlab(board(at, lap, H, t), (p) => p[1], -1, crown + 2);
  const front = Math.max(25, H * 0.22);
  const back = Math.max(H * s + 20, H * 0.42);
  const L = front + back;
  const foot = ctx
    .cs([roundedRect(L, 2 * crown, Math.min(crown * 0.9, L / 4))])
    .translate([(back - front) / 2, 0])
    .intersect(ctx.cs([rect(L + 2, crown + 1)]).translate([(back - front) / 2, (crown + 1) / 2]))
    .subtract(ctx.cs([notch.flat()]).offset(clear, 'Miter', 2, 0));
  const xf = W / 2 - Math.max(10, W * 0.18);
  let plate = topRounded(ctx, W, H, Math.min(6, W / 10));
  for (const x of [-xf, xf]) plate = plate.subtract(ctx.cs([rect(t + 2 * clear, lap * 2)]).translate([x, 0]));
  const content: Box = { x0: -W / 2 + margin, x1: W / 2 - margin, y0: lap + margin * 0.6, y1: H - margin };
  // Will it tip backwards? Its weight is at half the plate's height, leaned back.
  const reachBack = (H / 2) * s + (t / 2) * c;
  if (reachBack > back * 0.8) notes.push({ level: 'warning', message: 'The plate leans back past its feet. Lean it less or make it shorter.' });
  return { plate, foot, content, footX: xf, notes };
}

export function footPoses(g: FootStand, lean: number, t: number) {
  const l = Math.max(0, Math.min(25, lean));
  return {
    plate: { at: [0, t * Math.cos(l * D), 0] as [number, number, number], pose: { rx: 90 - l, z: 0 } },
    foot: (side: -1 | 1) => ({ at: [side * g.footX - t / 2, 0, 0] as [number, number, number], pose: { rx: 90, rz: 90, z: 0 } }),
  };
}

/* ------------------------------------------------------------------------- slot stand */

export interface SlotStand {
  /** The upright, flat: the tongue's tip on y = 0, the face above it. */
  upright: CrossSection;
  /** The base, flat: lies on the table, x across and y front to back. */
  base: CrossSection;
  content: Box;
  /** Where the face starts above the tongue, along the upright. */
  shoulder: number;
  notes: Diagnostic[];
}

/**
 * An upright `W` × `H` leaning back `lean` degrees out of a flat base. The tongue is as long as
 * the base is thick (measured along the lean), so it finishes flush underneath while the
 * shoulders bear on the base; the slot is the tongue's own footprint at that lean. The base is
 * placed so the stand's weight lands on its middle: `load` is an extra piece on the face (its
 * area and its height up the face), which moves it.
 */
export function slotStand(ctx: Ctx, W: number, H: number, t: number, lean: number, margin: number, load?: { area: number; v: number }, corner = 6): SlotStand {
  const notes: Diagnostic[] = [];
  const l = Math.max(0, Math.min(25, lean)) * D;
  const [s, c] = [Math.sin(l), Math.cos(l)];
  const clear = 0.1;
  const at = (v: number, w: number): Pt => [v * s + w * c, v * c - w * s + t * s];
  const Lt = t / c;
  const tw = Math.max(20, W * 0.6);
  const face = topRounded(ctx, W, H, corner).translate([0, Lt]);
  const upright = face.add(ctx.cs([rect(tw, Lt + 0.5)]).translate([0, (Lt + 0.5) / 2]));
  // The slot: the tongue's footprint through the base's thickness.
  const [y0, y1] = span(clipSlab(board(at, 0, Lt, t), (p) => p[1], 0, t), 0);
  // The base sits under the stand's weight.
  const aU = W * H;
  const yU = at(Lt + H / 2, t / 2)[0];
  const aL = load?.area ?? 0;
  const yL = load ? at(Lt + load.v, -t / 2)[0] : 0;
  const yc = (aU * yU + aL * yL) / (aU + aL);
  const depth = Math.max(50, H * 0.5, 2 * (y1 - yc) + 24, 2 * (yc - y0) + 24);
  const Wb = W + 10;
  const base = ctx
    .cs([roundedRect(Wb, depth, 4)])
    .translate([0, yc])
    .subtract(ctx.cs([rect(tw + 2 * clear, y1 - y0 + 2 * clear)]).translate([0, (y0 + y1) / 2]));
  const content: Box = { x0: -W / 2 + margin, x1: W / 2 - margin, y0: Lt + margin, y1: Lt + H - margin };
  if (H / Math.max(1, depth) > 3.5) notes.push({ level: 'warning', message: 'A tall, narrow stand tips easily. Make it shorter or wider.' });
  return { upright, base, content, shoulder: Lt, notes };
}

export function slotPoses(lean: number, t: number) {
  const deg = Math.max(0, Math.min(25, lean));
  const l = deg * D;
  return {
    upright: { at: [0, t * Math.cos(l), 0] as [number, number, number], pose: { rx: 90 - deg, z: 0 } },
    /** A piece glued flat on the upright's face, its centre `v` up the upright. */
    onFace: (v: number) => ({ at: [0, v * Math.sin(l), 0] as [number, number, number], pose: { rx: 90 - deg, z: v * Math.cos(l) + t * Math.sin(l) } }),
  };
}

export const roundRect = (ctx: Ctx, w: number, h: number, r: number, x = 0, y = 0) => ctx.cs(translate([roundedRect(w, h, r)], x, y));
