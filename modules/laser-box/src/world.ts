/**
 * The joint model. A box is described as it stands on the table, every piece a SLAB: the
 * whole block of sheet it would be with nothing cut into it, at its face of the box, so
 * neighbouring slabs overlap along every shared edge. Each overlap is then given to one of the
 * two pieces, bit by bit:
 *
 *   - inside a JOINT's range, along its axis, `b` keeps the joint's intervals (its fingers or
 *     tabs) and `a` keeps the rest;
 *   - anywhere else, and wherever three slabs overlap (a box corner), the higher RANK keeps it.
 *
 * A piece's outline is its slab's rectangle less what it gave away, so a finger on one piece is
 * the notch on the other by construction.
 *
 * Fit is the one deliberate disagreement: each piece reads its own fingers `along(j)` wider a
 * side than its neighbour does, so a finger and its notch overlap by `fit` across the finger
 * (interference when positive, play when negative). A slot's hole is also read `fit / 4`
 * narrower a side across the sheet, because the tab's thickness is raw sheet.
 *
 * World frame: X across the front of the box, Y front to back, Z up; the box's outside corner
 * at the origin. A piece's own 2D frame has `u` as its X and `v` as its Y, and `u × v` points
 * out of its show face (outwards from the box), the face that is up on the laser bed.
 */
import type { Contour } from '@pf/core';
import type { CrossSection, ManifoldContext } from '@pf/engine-manifold';
import { rect, translate } from '@pf/shapes';

export type V3 = [number, number, number];
export type Axis = 0 | 1 | 2;
export type FaceId = 'lid' | 'front' | 'back' | 'left' | 'right' | 'bottom';

export interface Slab {
  id: string;
  label: string;
  min: V3;
  max: V3;
  rank: number;
  u: V3;
  v: V3;
  face: FaceId | null;
  /** Moving parts share a group (a drawer, a lid), which moves as one in the open preview. */
  group?: string;
}

export interface Joint {
  a: string;
  b: string;
  axis: Axis;
  range: [number, number];
  intervals: [number, number][];
  kind: 'finger' | 'slot';
  fit: number;
  /** Flex tabs: extra interference along the joint, taken by the slits. */
  flex?: number;
}

/** What no joint describes, in the piece's own frame. */
export interface Feature {
  /** Replaces the slab's rectangle (a lip frame with rounded corners). */
  shape?: Contour[];
  add?: Contour[];
  cut?: Contour[];
  /** Regions a pattern keeps off, on top of every joint and cut. */
  keepOut?: Contour[];
  /** Only a cut-through pattern keeps off these (a lid's glued-on lip). */
  keepOutCut?: Contour[];
}

export type Motion = { kind: 'hinge'; at: V3; axis: V3; degrees: number } | { kind: 'slide'; dir: V3; distance: number } | { kind: 'lift'; distance: number };

export interface World {
  slabs: Slab[];
  joints: Joint[];
  features: Map<string, Feature>;
  motions: Map<string, Motion>;
  /** The box's outside size, mm. */
  outside: V3;
  /** The space inside (a drawer box: one drawer's), mm. */
  inside: V3;
  warnings: string[];
}

export const axisOf = (v: V3): Axis => (Math.abs(v[0]) > 0.5 ? 0 : Math.abs(v[1]) > 0.5 ? 1 : 2);
const signOf = (v: V3): number => (v[axisOf(v)] < 0 ? -1 : 1);
export const normalOf = (s: Slab): Axis => (3 - axisOf(s.u) - axisOf(s.v)) as Axis;
export const thicknessOf = (s: Slab): number => s.max[normalOf(s)] - s.min[normalOf(s)];
export function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

interface Box3 {
  min: V3;
  max: V3;
}

const EPS = 1e-7;

function intersect(a: Box3, b: Box3): Box3 | null {
  const min = [0, 0, 0] as V3;
  const max = [0, 0, 0] as V3;
  for (let i = 0; i < 3; i++) {
    min[i] = Math.max(a.min[i]!, b.min[i]!);
    max[i] = Math.min(a.max[i]!, b.max[i]!);
    if (max[i]! - min[i]! <= EPS) return null;
  }
  return { min, max };
}

function along(b: Box3, axis: Axis, lo: number, hi: number): Box3 | null {
  const min = [...b.min] as V3;
  const max = [...b.max] as V3;
  min[axis] = Math.max(min[axis], lo);
  max[axis] = Math.min(max[axis], hi);
  return max[axis] - min[axis] > EPS ? { min, max } : null;
}

/** Slab size in its own frame: width along u, height along v. */
export function sizeOf(s: Slab): [number, number] {
  return [s.max[axisOf(s.u)] - s.min[axisOf(s.u)], s.max[axisOf(s.v)] - s.min[axisOf(s.v)]];
}

/** A world coordinate along u or v, in the slab's frame. */
function local(s: Slab, dir: V3, value: number): number {
  const i = axisOf(dir);
  return signOf(dir) > 0 ? value - s.min[i] : s.max[i] - value;
}

/** A world box's footprint in a slab's frame. */
export function footprint(s: Slab, b: Box3): Contour {
  const xs = [local(s, s.u, b.min[axisOf(s.u)]), local(s, s.u, b.max[axisOf(s.u)])].sort((p, q) => p - q);
  const ys = [local(s, s.v, b.min[axisOf(s.v)]), local(s, s.v, b.max[axisOf(s.v)])].sort((p, q) => p - q);
  return translate([rect(xs[1]! - xs[0]!, ys[1]! - ys[0]!)], (xs[0]! + xs[1]!) / 2, (ys[0]! + ys[1]!) / 2)[0]!;
}

/** A world point (y along v from the slab's frame) as a 2D point in that frame. */
export function toLocal(s: Slab, p: V3): [number, number] {
  return [local(s, s.u, p[axisOf(s.u)]), local(s, s.v, p[axisOf(s.v)])];
}

/**
 * The column-major 4×4 that puts a piece's frame (x along u, y along v, z out of its show
 * face, the piece 0..t thick) where it sits in the box.
 */
export function poseOf(s: Slab): number[] {
  const n = cross(s.u, s.v);
  const o = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const d = s.u[i] || s.v[i] || n[i];
    o[i] = (d ?? 0) < 0 ? s.max[i]! : s.min[i]!;
  }
  return [...s.u, 0, ...s.v, 0, ...n, 0, o[0]!, o[1]!, o[2]!, 1];
}

const outranks = (p: Slab, q: Slab) => p.rank > q.rank || (p.rank === q.rank && p.id < q.id);

export interface Resolved {
  slab: Slab;
  /** The piece as cut, before kerf. */
  section: CrossSection;
  /** Flex tab slits, open lines in the piece's frame. */
  slits: Contour[];
  /** Where a pattern may go (null: nowhere). */
  safe: CrossSection | null;
  /** Like `safe`, also off `keepOutCut`, for patterns cut through. */
  safeCut: CrossSection | null;
}

/** Every piece's outline. `margin` keeps patterns that far off joints and cuts. */
export function resolve(ctx: ManifoldContext<unknown>, w: World, margin: number, t: number): Resolved[] {
  const jointOf = (p: string, q: string) => w.joints.find((j) => (j.a === p && j.b === q) || (j.a === q && j.b === p));
  const out: Resolved[] = [];
  for (const P of w.slabs) {
    const lost: Contour[] = [];
    const keep3: Contour[] = [];
    const lose3: Contour[] = [];
    const touched: Contour[] = [];
    const slits: Contour[] = [];
    for (const Q of w.slabs) {
      if (Q === P) continue;
      const O = intersect(P, Q);
      if (!O) continue;
      touched.push(footprint(P, O));
      for (const R of w.slabs) {
        if (R === P || R === Q) continue;
        const T = intersect(O, R);
        if (!T) continue;
        (outranks(P, Q) && outranks(P, R) ? keep3 : lose3).push(footprint(P, T));
      }
      const j = jointOf(P.id, Q.id);
      if (!j) {
        if (outranks(Q, P)) lost.push(footprint(P, O));
        continue;
      }
      const grow = (j.fit + (j.flex ?? 0)) / 4;
      const [r0, r1] = j.range;
      // Outside the range, by rank.
      if (outranks(Q, P))
        for (const part of [along(O, j.axis, -Infinity, r0), along(O, j.axis, r1, Infinity)]) if (part) lost.push(footprint(P, part));
      if (j.b === P.id) {
        // P keeps its tabs, each read `grow` wider a side; gives away the rest of the range.
        let at = r0;
        const ivs = j.intervals.map(([a, b]) => [Math.max(r0, a - grow), Math.min(r1, b + grow)] as [number, number]);
        for (const [a, b] of ivs) {
          const gap = along(O, j.axis, at, a);
          if (gap) lost.push(footprint(P, gap));
          at = b;
        }
        const tail = along(O, j.axis, at, r1);
        if (tail) lost.push(footprint(P, tail));
        if (j.kind === 'slot' && j.flex !== undefined) {
          // Two slits in each tab, an arm's width in from its sides, through the other piece.
          const n = normalOf(Q);
          for (const [a, b] of j.intervals) {
            const wd = b - a;
            if (wd < 2.5 * t) continue;
            const arm = wd >= 4 * t ? t : wd / 4;
            if (arm < t / 2) continue;
            for (const x of [a + arm, b - arm]) {
              const p0 = [0, 0, 0] as V3;
              const p1 = [0, 0, 0] as V3;
              for (let i = 0; i < 3; i++) p0[i] = p1[i] = (O.min[i]! + O.max[i]!) / 2;
              p0[j.axis] = p1[j.axis] = x;
              p0[n] = Q.min[n];
              p1[n] = Q.max[n];
              slits.push([...toLocal(P, p0), ...toLocal(P, p1)]);
            }
          }
        }
      } else {
        // P gives away Q's tabs, each read `grow` narrower a side; a slot also narrower across.
        let O2: Box3 | null = O;
        if (j.kind === 'slot') {
          const n = normalOf(Q);
          const d = j.fit / 4;
          O2 = intersect(P, { min: Q.min.map((v, i) => (i === n ? v + d : v)) as V3, max: Q.max.map((v, i) => (i === n ? v - d : v)) as V3 });
        }
        if (O2)
          for (const [a, b] of j.intervals) {
            // An interval that runs to the end of the range stops there: that end is a stop, not a fit.
            const part = along(O2, j.axis, a <= r0 + EPS ? r0 : a + grow, b >= r1 - EPS ? r1 : b - grow);
            if (part) lost.push(footprint(P, part));
          }
      }
    }
    const f = w.features.get(P.id) ?? {};
    const [W, H] = sizeOf(P);
    const base = f.shape ? ctx.cs(f.shape) : ctx.cs(translate([rect(W, H)], W / 2, H / 2));
    let lostCs = lost.length ? ctx.cs(lost, 'NonZero') : null;
    if (lostCs && keep3.length) lostCs = lostCs.subtract(ctx.cs(keep3, 'NonZero'));
    if (lose3.length) lostCs = lostCs ? lostCs.add(ctx.cs(lose3, 'NonZero')) : ctx.cs(lose3, 'NonZero');
    let section = lostCs ? base.subtract(lostCs) : base;
    if (f.add?.length) section = section.add(ctx.cs(f.add, 'NonZero'));
    if (f.cut?.length) section = section.subtract(ctx.cs(f.cut, 'NonZero'));

    let safe: CrossSection | null = null;
    let safeCut: CrossSection | null = null;
    if (P.face) {
      const off = [...touched, ...(f.cut ?? []), ...(f.keepOut ?? [])];
      let s = base.offset(-margin, 'Miter', 2, 0);
      if (off.length) s = s.subtract(ctx.offset(ctx.cs(off, 'NonZero'), margin, 'Miter'));
      s = largest(s);
      safe = s.isEmpty() ? null : s;
      if (safe && f.keepOutCut?.length) {
        const c = largest(safe.subtract(ctx.offset(ctx.cs(f.keepOutCut, 'NonZero'), margin, 'Miter')));
        safeCut = c.isEmpty() ? null : c;
      } else safeCut = safe;
    }
    out.push({ slab: P, section, slits, safe, safeCut });
  }
  return out;
}

function largest(s: CrossSection): CrossSection {
  const parts = s.decompose();
  if (parts.length <= 1) return s;
  let best = parts[0]!;
  for (const p of parts) if (p.area() > best.area()) best = p;
  return best;
}
