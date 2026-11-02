/**
 * Plant pots with a matching drip tray: round, polygonal, fluted or scalloped, straight or
 * twisted, tapering out (or in) from the base, with drainage holes and an optional band at
 * the rim. The tray follows the pot's footprint and has ribs that hold the pot out of the
 * water that drains into it.
 *
 * The walls are one extrusion of the outline, scaled from the base to the top and turned by
 * the twist; the inside is the same outline, set in by the wall, scaled and turned at the
 * same rate, so the wall stays even all the way up.
 */
import type { BuildResult, Contour, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold, ManifoldContext } from '@pf/engine-manifold';

export interface Params {
  parts: 'both' | 'pot' | 'tray';
  shape: 'round' | 'polygon' | 'fluted' | 'scalloped';
  sides: number;
  corner: number;
  lobes: number;
  depth: number;
  twist: number;
  topDiameter: number;
  bottomDiameter: number;
  height: number;
  wall: number;
  floor: number;
  rim: 'plain' | 'band';
  drain: 'none' | 'one' | 'several';
  drainDia: number;
  gap: number;
  trayHeight: number;
  ribs: boolean;
  detail: 'draft' | 'standard' | 'fine';
  potColor: RGB;
  trayColor: RGB;
}

type Ctx = ManifoldContext<Params>;

const TRAY_WALL = 2;
const TRAY_FLOOR = 2;
const RIB_H = 2.5;
const RIB_W = 2;
/** Space between the pot and the tray on the bed, mm. */
const LAYOUT_GAP = 10;
const DETAIL = {
  draft: { segments: 96, step: 1.6 },
  standard: { segments: 192, step: 0.8 },
  fine: { segments: 360, step: 0.4 },
} as const;

export async function build(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  const notes: Diagnostic[] = [];
  const pot = potOf(ctx, notes);
  if (!pot) return { parts: [], diagnostics: notes, summary: '' };
  const tray = p.parts === 'pot' ? null : trayOf(ctx, pot);
  const parts: Part[] = [];
  const assembled = ctx.inputs.assembled === true;
  let x = 0;
  if (p.parts !== 'tray') {
    const q = ctx.part(assembled && tray ? pot.solid.translate([0, 0, tray.seat]) : placed(pot.solid, 0), 'Pot', p.potColor, { group: 'pot' });
    if (q) parts.push(q);
    x = pot.halfWidth + LAYOUT_GAP;
  }
  if (tray) {
    const tb = tray.solid.boundingBox();
    const half = (tb.max[0] - tb.min[0]) / 2;
    const q = ctx.part(assembled ? tray.solid : placed(tray.solid, p.parts === 'tray' ? 0 : x + half), 'Tray', p.trayColor, { group: 'tray' });
    if (q) parts.push(q);
  }
  const bits = [`${fmt(p.topDiameter)} × ${fmt(p.height)} mm`, `holds about ${ml(pot.volume)}`];
  if (tray) bits.push(`tray ${fmt(tray.width)} × ${fmt(tray.depth)} × ${fmt(p.trayHeight)} mm`);
  if (p.parts === 'tray') bits.splice(0, 2, `tray for a ${fmt(p.bottomDiameter)} mm base`);
  return { parts, diagnostics: notes, summary: bits.join(' · ') };
}

/** A uniform top scale for `extrude` (a bare number there scales x only). */
const scale2 = (k: number): [number, number] => [k, k];
const fmt = (x: number) => (Math.round(x * 10) / 10).toString();
const ml = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} L` : `${Math.round(v)} mL`);

/** Centres a solid on (x, 0) and puts it on the bed. */
function placed(m: Manifold, x: number): Manifold {
  const b = m.boundingBox();
  return m.translate([x - (b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]]);
}

/* ------------------------------------------------------------------ the outline */

/** The deepest a flute or scallop goes, as a share of the radius. */
const MAX_DEPTH = 0.25;

/** How far the outline's flutes or scallops go in at radius R. */
function depthAt(p: Params, R: number): number {
  return p.shape === 'fluted' || p.shape === 'scalloped' ? Math.max(0, Math.min(p.depth, R * MAX_DEPTH)) : 0;
}

/**
 * The pot's outline at radius R (half the width; across the flats for a polygon), its
 * widest point R from the centre. A polygon has a flat at the front.
 */
function outline(ctx: Ctx, R: number): CrossSection {
  const p = ctx.params;
  const N = DETAIL[p.detail].segments;
  if (p.shape === 'polygon') {
    const n = Math.max(3, Math.min(12, Math.round(p.sides)));
    const c = Math.max(0, Math.min(p.corner, R * 0.9));
    const ap = R - c;
    const rc = ap / Math.cos(Math.PI / n);
    const pts: Contour = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.PI / n) * (2 * i + 1);
      pts.push(rc * Math.cos(a), rc * Math.sin(a));
    }
    const s = ctx.cs([pts]);
    return c > 0.01 ? s.offset(c, 'Round', 2, Math.max(16, Math.round(N / n))) : s;
  }
  const d = depthAt(p, R);
  const k = Math.max(3, Math.round(p.lobes));
  const n = p.shape === 'round' ? N : Math.max(N, k * 16);
  const pts: Contour = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    let r = R;
    if (p.shape === 'fluted') r = R - (d * (1 - Math.cos(k * a))) / 2;
    else if (p.shape === 'scalloped') r = R - d * (1 - Math.abs(Math.cos((k * a) / 2)));
    pts.push(r * Math.cos(a), r * Math.sin(a));
  }
  return ctx.cs([pts]);
}

/* ------------------------------------------------------------------ the pot */

interface Pot {
  solid: Manifold;
  /** The outline at height z, as the pot has it there (scaled and turned). */
  at(z: number): CrossSection;
  halfWidth: number;
  /** Inside volume up to the rim, mL. */
  volume: number;
}

function potOf(ctx: Ctx, notes: Diagnostic[]): Pot | null {
  const p = ctx.params;
  const { Manifold } = ctx;
  const H = p.height;
  const Rb = p.bottomDiameter / 2;
  const Rt = p.topDiameter / 2;
  const w = p.wall;
  const s = Rt / Rb;
  const T = p.twist;
  const A = outline(ctx, Rb);
  const radius = (z: number) => Rb * (1 + ((s - 1) * z) / H);
  const at = (z: number) => A.scale(radius(z) / Rb).rotate((T * z) / H);
  const divisions = (h: number) => (Math.abs(T) > 0.01 ? Math.max(2, Math.ceil(Math.max(h / DETAIL[p.detail].step, (Math.abs(T) * h) / H / 1.5))) : 0);

  const minR = Math.min(Rb, Rt) - depthAt(p, Math.min(Rb, Rt));
  if (p.floor >= H - 5) {
    notes.push({ level: 'error', message: 'The floor is nearly as tall as the pot: make the pot taller.' });
    return null;
  }
  if (minR - w < 8) {
    notes.push({ level: 'error', message: 'The walls meet in the middle: make the pot wider or the walls thinner.' });
    return null;
  }
  // Taper and twist both lean the walls; past 45° they print badly.
  if (Math.abs(Rt - Rb) > H) notes.push({ level: 'warning', message: 'The sides lean out more than 45°: print with supports or make the top narrower.' });
  if (Math.abs(T) > 0.01 && p.shape !== 'round' && (Math.max(Rb, Rt) * ((Math.abs(T) * Math.PI) / 180)) / H > 1) {
    notes.push({ level: 'warning', message: 'The twist leans the ridges more than 45°: twist less or make the pot taller.' });
  }

  let pot = Manifold.extrude(A, H, divisions(H), T, scale2(s));
  if (p.rim === 'band') {
    const bandH = Math.max(6, Math.min(14, H * 0.12));
    const bw = Math.max(2, Math.min(4, Rt * 0.06));
    const z0 = H - bandH;
    const shape = at(z0).add(at(H)).offset(bw, 'Round', 2, 32);
    pot = pot.add(ctx.edged(shape, bandH + bw, { bottom: bw, top: Math.min(0.8, w / 2), z0: z0 - bw, style: 'chamfer' }));
  }

  // The inside, from the floor to just over the rim, scaled and turned at the pot's rate.
  const e = 1;
  const hi = H - p.floor + e;
  const inner = (z0: number, h: number) =>
    Manifold.extrude(at(z0).offset(-w, 'Round', 2, 32), h, divisions(h), (T * h) / H, scale2((radius(z0 + h) - w) / (radius(z0) - w))).translate([0, 0, z0]);
  const cavity = inner(p.floor, hi);
  pot = pot.subtract(cavity);

  // Drainage through the floor.
  if (p.drain !== 'none') {
    const r = Math.max(1.5, p.drainDia / 2);
    const holes: Manifold[] = [Manifold.cylinder(p.floor + 2, r, r, 32).translate([0, 0, -1])];
    const inside = Math.min(Rb, radius(p.floor)) - depthAt(p, Rb) - w;
    const ring = inside * 0.55;
    if (p.drain === 'several' && ring - r > r + 3 && ring + r < inside - 2) {
      const n = Math.max(4, Math.min(8, Math.floor((2 * Math.PI * ring) / (4 * r))));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI + Math.PI / 2;
        holes.push(Manifold.cylinder(p.floor + 2, r, r, 24).translate([ring * Math.cos(a), ring * Math.sin(a), -1]));
      }
    }
    if (r > inside - 2) notes.push({ level: 'warning', message: 'The drainage hole is nearly as wide as the floor.' });
    pot = pot.subtract(Manifold.union(holes));
  } else if (p.parts !== 'tray') {
    notes.push({ level: 'info', message: 'No drainage holes: use it as a cover pot, with the plant in its nursery pot inside.' });
  }

  const vol = inner(p.floor, H - p.floor).volume() / 1000;
  const bb = pot.boundingBox();
  return { solid: pot, at, halfWidth: (bb.max[0] - bb.min[0]) / 2, volume: vol };
}

/* ------------------------------------------------------------------ the tray */

interface Tray {
  solid: Manifold;
  /** Where the pot's base sits, mm above the bed. */
  seat: number;
  width: number;
  depth: number;
}

function trayOf(ctx: Ctx, pot: Pot): Tray {
  const p = ctx.params;
  const { Manifold } = ctx;
  const seat = TRAY_FLOOR + (p.ribs ? RIB_H : 0);
  const Ht = Math.max(seat + 4, p.trayHeight);
  // Everything of the pot that sits inside the tray, with the gap all round.
  const reach = Math.max(0, Math.min(p.height, Ht - seat + 1));
  const inside = pot.at(0).add(pot.at(reach)).offset(Math.max(0.5, p.gap), 'Round', 2, 48);
  const outside = inside.offset(TRAY_WALL, 'Round', 2, 48);
  let tray = ctx.edged(outside, Ht, { bottom: 0.6, top: 0.8, style: 'chamfer' }).subtract(ctx.extrude(inside, Ht, TRAY_FLOOR));
  if (p.ribs) {
    // Radial ribs, clear of the middle so water reaches all of the tray.
    const b = outside.bounds();
    const far = Math.hypot(Math.max(-b.min[0], b.max[0]), Math.max(-b.min[1], b.max[1]));
    const r0 = Math.max(p.drainDia / 2 + 3, 6);
    const n = Math.max(4, Math.min(12, Math.round((2 * Math.PI * (p.bottomDiameter / 2)) / 30)));
    const ribs: CrossSection[] = [];
    for (let i = 0; i < n; i++) {
      ribs.push(
        ctx
          .cs([[r0, -RIB_W / 2, far, -RIB_W / 2, far, RIB_W / 2, r0, RIB_W / 2]])
          .rotate((i * 360) / n + 90 / n),
      );
    }
    const footprint = pot.at(0).offset(-1, 'Round', 2, 32);
    const rib = ctx.CrossSection.union(ribs).intersect(footprint);
    tray = tray.add(ctx.extrude(rib, RIB_H + 0.01, TRAY_FLOOR - 0.01));
  }
  const bb = tray.boundingBox();
  return { solid: tray, seat, width: bb.max[0] - bb.min[0], depth: bb.max[1] - bb.min[1] };
}
