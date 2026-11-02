/**
 * Screw-top containers: a jar whose lid screws on, or a stack of tiers that screw into each
 * other with a lid on top. Round, hexagonal, octagonal or square, a wide mouth with a flush
 * lid or a narrow neck with a shoulder, one to three thread starts, dividers, a lid label.
 *
 * Everything prints without supports: overhangs are 45° at most, the threads have 45°
 * flanks, lids print upside down, and each stacking tier has its male thread at the bottom
 * (a hollow spigot standing on the bed) and its female thread in the rim at the top.
 */
import type { BuildResult, Contour, Diagnostic, Part } from '@pf/core';
import type { CrossSection, Manifold } from '@pf/engine-manifold';
import { centerOn, circle, roundedRect, scale, bounds } from '@pf/shapes';
import { text as layoutText } from '@pf/text';
import type { Pt, Row } from './lathe';
import { depthOf, grooveWave, lathe, resample, threadWave } from './lathe';
import type { Ctx, Params } from './types';

export type { Params } from './types';

export const PITCH = { fine: 2, standard: 3, coarse: 4 } as const;
/** Clearance between the threads, mm, radially and along each flank. */
export const FIT = { tight: 0.2, standard: 0.3, loose: 0.45 } as const;
/** Mesh rows up the thread and edge round it, mm. */
const STEP = { draft: [0.25, 0.9], standard: [0.15, 0.5], fine: [0.1, 0.3] } as const;
const CHAMFER = 0.6;
/** Between the lid's ceiling and the neck's rim when closed, mm. */
const HEADROOM = 0.4;
const ENGRAVE = 0.6;
const PLA = 1.24; // g/cm³, for the weights in the summary

const TAU = 2 * Math.PI;

interface Thread {
  pitch: number;
  depth: number;
  lead: number;
  c: number;
  /** Root radius of the male thread. */
  Rr: number;
  /** Outside of the female part (lid or rim): the lid's radius on a narrow neck. */
  Rl: number;
}

interface Kit {
  ctx: Ctx;
  p: Params;
  notes: Diagnostic[];
  sec: CrossSection;
  inner: CrossSection;
  /** Inscribed (half the across-flats) and circumscribed radii of the outline and its inside. */
  Ri: number;
  Rc: number;
  Rcc: number;
  round: boolean;
  t: Thread;
  row: number;
  edge: number;
  w: number;
}

export async function build(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  const notes: Diagnostic[] = [];
  const k = kit(ctx, notes);
  if (!k) return { parts: [], diagnostics: notes };
  const out = p.product === 'stack' ? await stack(k) : await jar(k);
  return { parts: out.parts, diagnostics: notes, summary: out.summary };
}

/* ------------------------------------------------------------------ shared measures */

/** The body's outline: across the flats `D` for the polygons, corners rounded `rc`. */
export function outline(shape: Params['shape'], D: number, rc: number): Contour {
  const a = D / 2;
  if (shape === 'round') return circle(a, Math.max(96, Math.round(TAU * a)));
  if (shape === 'square') return roundedRect(D, D, Math.min(rc, a - 1), 12);
  const n = shape === 'hexagon' ? 6 : 8;
  const r = Math.max(0.2, Math.min(rc, a - 1));
  // The polygon whose corners are the rounding circles' centres, then the arcs round them.
  const R = (a - r) / Math.cos(Math.PI / n);
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = (TAU * i) / n + Math.PI / n;
    const cx = R * Math.cos(c);
    const cy = R * Math.sin(c);
    for (let s = 0; s <= 6; s++) {
      const t = c - Math.PI / n + ((TAU / n) * s) / 6;
      pts.push(cx + r * Math.cos(t), cy + r * Math.sin(t));
    }
  }
  return pts;
}

const maxRadius = (cs: Contour[]) => {
  let m = 0;
  for (const c of cs) for (let i = 0; i < c.length; i += 2) m = Math.max(m, Math.hypot(c[i]!, c[i + 1]!));
  return m;
};

function kit(ctx: Ctx, notes: Diagnostic[]): Kit | null {
  const p = ctx.params;
  const round = p.shape === 'round';
  const w = Math.max(0.8, p.wall);
  const shape = outline(p.shape, p.diameter, p.corner);
  const sec = ctx.cs([shape]);
  const inner = ctx.offset(sec, -w);
  const Ri = p.diameter / 2;
  const Rc = maxRadius([shape]);
  const Rcc = maxRadius(ctx.contours(inner));
  const pitch = PITCH[p.pitch];
  const depth = depthOf(pitch);
  const c = FIT[p.fit];
  const starts = Number(p.starts) || 1;
  const lidWall = Math.max(1.2, w);
  const narrow = p.product === 'jar' && p.mouth === 'narrow';
  let Rr = Ri - lidWall - depth - c;
  let Rl = Ri;
  if (narrow) {
    Rr = p.neckDiameter / 2 - depth;
    Rl = Rr + c + depth + lidWall;
    if (Rl > Ri - 1) {
      notes.push({ level: 'warning', message: `A ${p.neckDiameter} mm neck leaves no shoulder on a ${p.diameter} mm body; it is made with a wide mouth instead.` });
      Rr = Ri - lidWall - depth - c;
      Rl = Ri;
    }
  }
  if (Rr - w < 3) {
    notes.push({ level: 'error', message: 'The mouth would be under 6 mm across: make the container wider, the walls thinner or the thread finer.' });
    return null;
  }
  const [row, edge] = STEP[p.detail];
  return { ctx, p, notes, sec, inner, Ri, Rc, Rcc, round, w, row, edge, t: { pitch, depth, lead: starts * pitch, c, Rr, Rl } };
}

const slab = (k: Kit, s: CrossSection, z: number) => k.ctx.extrude(s, 0.01, z);
const disc = (k: Kit, r: number) => k.ctx.cs([circle(r, columnsFor(k, r))]);
const cyl = (k: Kit, r: number, z0: number, z1: number) => k.ctx.extrude(disc(k, r), z1 - z0, z0);
/** The solid between two sections, a 45° slope at its widest. */
const taper = (k: Kit, a: CrossSection, za: number, b: CrossSection, zb: number) => slab(k, a, za).add(slab(k, b, zb - 0.01)).hull();
const columnsFor = (k: Kit, r: number) => Math.max(48, Math.round((TAU * r) / k.edge));

/** The male thread on a neck or spigot: `zA` to `zB`, its phase measured from `z0`. */
function male(k: Kit, z0: number, zA: number, zB: number) {
  const { pitch, depth, lead } = k.t;
  const F = Math.min(2, (zB - zA) / 3);
  return (row: Row, th: number) => {
    if (row.nr < 0.9 || row.z < zA || row.z > zB) return 0;
    const fade = Math.min(1, (row.z - zA) / F, (zB - row.z) / F);
    return depth * fade * threadWave(row.z - z0 - (th / TAU) * lead, pitch);
  };
}

/** The female thread cut into a bore, `zA` to `zB`, phase from `z0` like the male. */
function female(k: Kit, z0: number, zA: number, zB: number) {
  const { pitch, depth, lead, c } = k.t;
  return (row: Row, th: number) => {
    if (row.nr < 0.9 || row.z < zA || row.z > zB) return 0;
    return depth * grooveWave(row.z - z0 - (th / TAU) * lead, pitch, c);
  };
}

/** A threaded neck or spigot, `z0` to `z1`, its outer edge at `z1` (or `z0`) chamfered. */
function threadedTube(k: Kit, z0: number, z1: number, phase: number, zA: number, zB: number, chamferAt: 'top' | 'bottom'): Manifold {
  const R = k.t.Rr;
  const ch = Math.min(CHAMFER, (z1 - z0) / 4);
  const prof: Pt[] =
    chamferAt === 'top'
      ? [[0, z0], [R, z0], [R, z1 - ch], [R - ch, z1], [0, z1]]
      : [[0, z0], [R - ch, z0], [R, z0 + ch], [R, z1], [0, z1]];
  return lathe(k.ctx.wasm, resample(prof, k.row), columnsFor(k, R), male(k, phase, zA, zB));
}

/** The bore of a lid or rim, `z0` to `z1`, the thread grooves from `zA` to `zB`. */
function threadedBore(k: Kit, z0: number, z1: number, phase: number, zA: number, zB: number): Manifold {
  const R = k.t.Rr + k.t.c;
  return lathe(k.ctx.wasm, resample([[0, z0], [R, z0], [R, z1], [0, z1]], k.row), columnsFor(k, R + k.t.depth), female(k, phase, zA, zB));
}

/**
 * The outside of a lid or cap, `z0` to `z1`: the body's outline (or a circle `R` on a narrow
 * neck), chamfered at the bottom and rounded over at the top, knurled or ribbed when round.
 */
function capOuter(k: Kit, R: number | null, z0: number, z1: number, bottom: number): Manifold {
  const { ctx, p } = k;
  const top = Math.min(1, (z1 - z0) / 3);
  if (R === null && !k.round) return ctx.edged(k.sec, z1 - z0, { z0, bottom, top, style: 'chamfer' });
  const r = R ?? k.Ri;
  const prof: Pt[] = [[0, z0]];
  if (bottom > 0) prof.push([r - bottom, z0], [r, z0 + bottom]);
  else prof.push([r, z0]);
  prof.push([r, z1 - top], [r - top, z1], [0, z1]);
  const g0 = z0 + bottom + 0.8;
  const g1 = z1 - top - 0.8;
  const N = Math.max(12, Math.round((TAU * r) / (p.grip === 'ribs' ? 3.5 : 3)));
  const tri = (x: number) => 1 - 2 * Math.abs((((x % 1) + 1) % 1) - 0.5);
  const grip =
    p.grip === 'smooth' || g1 - g0 < 2
      ? undefined
      : (row: Row, th: number) => {
          if (row.nr < 0.9 || row.z < g0 || row.z > g1) return 0;
          const fade = Math.min(1, (row.z - g0) / 0.6, (g1 - row.z) / 0.6);
          const u = (N * th) / TAU;
          if (p.grip === 'ribs') return -0.7 * fade * Math.max(0, Math.cos(TAU * u)) ** 3;
          const g = (x: number) => Math.max(0, (tri(x) - 0.55) / 0.45);
          return -0.6 * fade * Math.max(g(u + row.z / 3), g(u - row.z / 3));
        };
  const cols = Math.max(columnsFor(k, r), grip ? N * (p.grip === 'ribs' ? 8 : 10) : 0);
  return lathe(ctx.wasm, resample(prof, grip ? Math.min(0.3, k.row * 2) : 2), cols, grip);
}

/**
 * The inside of a body: the outline's inside from the floor, narrowing at 45° to a circle
 * `rTop` at `zNarrow`, then straight up to `zTop`. `zFloor` is where it starts; `round`
 * rounds its bottom edge.
 */
function cavity(k: Kit, zFloor: number, zNarrow: number, rTop: number, zTop: number, roundBottom: boolean): { solid: Manifold; lower: Manifold; zStraight: number } | null {
  const { ctx } = k;
  const zs = zNarrow - Math.max(0, k.Rcc - rTop);
  if (zs < zFloor + 1) return null;
  const lower = roundBottom ? ctx.edged(k.inner, zs - zFloor, { z0: zFloor, bottom: Math.min(3, (zs - zFloor) / 3), style: 'round' }) : ctx.extrude(k.inner, zs - zFloor, zFloor);
  let solid = lower.add(taper(k, k.inner, zs - 0.01, disc(k, rTop), zNarrow));
  if (zTop > zNarrow) solid = solid.add(cyl(k, rTop, zNarrow - 0.02, zTop));
  return { solid, lower, zStraight: zs };
}

/** Radial walls in the cavity, as many as asked (2 is one wall across). */
function dividers(k: Kit, lower: Manifold, z0: number, z1: number): Manifold | null {
  const n = Number(k.p.dividers) || 0;
  if (n < 2 || z1 - z0 < 2) return null;
  const { ctx } = k;
  const t = Math.max(1, Math.min(1.6, k.w * 0.8));
  const L = k.Rc + 2;
  let s: CrossSection = disc(k, t);
  for (let i = 0; i < n; i++) s = s.add(ctx.cs([[0, -t / 2, L, -t / 2, L, t / 2, 0, t / 2]]).rotate(90 + (360 * i) / n));
  return ctx.extrude(s, z1 - z0, z0).intersect(lower);
}

/** The label engraved into a lid's top at `z`, fitted inside radius `r`. */
async function label(k: Kit, z: number, r: number): Promise<Manifold | null> {
  const { ctx, p } = k;
  const v = p.label.trim();
  if (!v) return null;
  if (p.product === 'jar' && p.loop) {
    k.notes.push({ level: 'info', message: 'The label is left off a lid with a loop.' });
    return null;
  }
  const t = await layoutText(p.font, v, { capHeight: p.textSize, align: 'center', tolerance: 0.01 }, ctx.inputs);
  let cs = t.contours;
  if (!cs.length) return null;
  const b = bounds(cs);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  // Fit the text's box in the circle, keeping its proportions.
  const f = Math.min(1, (2 * r) / Math.hypot(w, h));
  if (f < 0.999) {
    cs = scale(cs, f);
    if (p.textSize * f < 3) k.notes.push({ level: 'warning', message: `The label is shrunk to ${(p.textSize * f).toFixed(1)} mm to fit the lid: shorten it to keep it legible.` });
  }
  cs = centerOn(cs);
  return ctx.extrude(ctx.cs(cs, 'NonZero'), ENGRAVE + 0.5, z - ENGRAVE);
}

/** A loop on a lid's top for a keyring or cord, at `z`. */
function loop(k: Kit, z: number): Manifold {
  const { ctx } = k;
  const hole = 4;
  const W = hole + 5;
  const sec = ctx.cs([[-W / 2, -0.6, W / 2, -0.6, W / 2, W / 2, -W / 2, W / 2]]).add(ctx.cs([circle(W / 2, 48)]).translate([0, W / 2])).subtract(ctx.cs([circle(hole / 2, 32)]).translate([0, W / 2]));
  return ctx.extrude(sec, 3, -1.5).rotate([90, 0, 0]).translate([0, 0, z]);
}

const grams = (m: Manifold) => (m.volume() / 1000) * PLA;
const ml = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} L` : `${Math.round(v)} mL`);
const turnsText = (x: number) => {
  if (x < 0.95) return `${Math.round(x * 360)}°`;
  const q = Math.round(x * 4) / 4;
  return q === 1 ? '1 turn' : `${q} turns`;
};

/** The parts as they go together, not laid out to print (the tests check the fit this way). */
const assembled = (ctx: Ctx) => ctx.inputs.assembled === true;

/** Puts a solid on the bed at x. */
function placed(m: Manifold, x: number): Manifold {
  const b = m.boundingBox();
  return m.translate([x - (b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]]);
}

/* ------------------------------------------------------------------ the jar */

async function jar(k: Kit): Promise<{ parts: Part[]; summary: string }> {
  const { ctx, p, notes, t, w } = k;
  const neckH = Math.max(3 * t.pitch, p.threadHeight);
  const H = p.height;
  const Hb = H - neckH;
  const nt = H;
  const narrow = t.Rl < k.Ri - 0.01;
  if (Hb < p.floor + 4) {
    notes.push({ level: 'error', message: `The jar is too short for a ${neckH} mm thread: make it taller or the thread shorter.` });
    return { parts: [], summary: '' };
  }

  // The outside.
  let body: Manifold;
  if (narrow) {
    const zCol = Hb - 1.5;
    const zs = zCol - Math.max(0, k.Rc - t.Rl);
    if (zs < p.floor + 2) {
      notes.push({ level: 'error', message: 'The shoulder down to the neck does not fit: make the jar taller or the neck wider.' });
      return { parts: [], summary: '' };
    }
    body = ctx
      .edged(k.sec, zs, { bottom: CHAMFER, style: 'chamfer' })
      .add(taper(k, k.sec, zs - 0.01, disc(k, t.Rl), zCol))
      .add(ctx.edged(disc(k, t.Rl), Hb - zCol + 0.02, { z0: zCol - 0.02, top: CHAMFER, style: 'chamfer' }));
  } else body = ctx.edged(k.sec, Hb, { bottom: CHAMFER, top: CHAMFER, style: 'chamfer' });

  // The neck, its thread fading in above the shoulder and out below the rim.
  const zA = Hb + 0.8;
  const zB = nt - 0.6;
  body = body.add(threadedTube(k, Hb - 1, nt, Hb, zA, zB, 'top'));

  // The inside.
  const cav = cavity(k, p.floor, Hb - 0.5, t.Rr - w, nt + 1, true);
  if (!cav) {
    notes.push({ level: 'error', message: 'The inside cannot narrow to the mouth at 45° in this height: make the jar taller, rounder or the mouth wider.' });
    return { parts: [], summary: '' };
  }
  body = body.subtract(cav.solid);
  const walls = dividers(k, cav.lower, p.floor - 0.01, cav.zStraight);
  if (walls) body = body.add(walls);
  if (Number(p.dividers) >= 2 && narrow) notes.push({ level: 'info', message: 'Dividers are best in a wide-mouth jar: they stop below the shoulder here.' });
  const capacity = cav.solid.volume() - Math.PI * (t.Rr - w) ** 2 * 1 - (walls?.volume() ?? 0);

  // The lid, built where it sits when closed: its skirt on the shoulder, its ceiling over the rim.
  const skirt = neckH + HEADROOM;
  const lidTop = Math.max(1, p.lidTop);
  const Lh = Math.max(skirt + lidTop, p.lidHeight);
  const zTop = Hb + Lh;
  const ceiling = zTop - lidTop;
  let lid = capOuter(k, narrow ? t.Rl : null, Hb, zTop, CHAMFER);
  lid = lid.subtract(threadedBore(k, Hb - 1, ceiling, Hb, Hb - 1, Math.min(ceiling, nt + t.pitch)));
  const text = await label(k, zTop, (narrow ? t.Rl : k.Ri) - 3);
  if (text) lid = lid.subtract(text);
  if (p.loop) {
    lid = lid.add(loop(k, zTop - 0.4));
    if (2 * t.Rr > 30) notes.push({ level: 'warning', message: 'A lid with a loop prints opening down, so its ceiling bridges the mouth: fine on a capsule, droopy over 30 mm.' });
  }
  if (Lh > skirt + lidTop + 0.5 && !p.loop) notes.push({ level: 'info', message: 'The tall lid is a cup of its own: it prints upside down with no supports.' });

  const lidPrint = p.loop ? lid : lid.rotate([180, 0, 0]);
  const gap = 2 * k.Rc + 10;
  const parts: Part[] = [];
  const show = assembled(ctx);
  const bp = ctx.part(show ? body : placed(body, 0), 'Jar', p.bodyColor, { group: 'body' });
  const lp = ctx.part(show ? lid : placed(lidPrint, gap), 'Lid', p.lidColor, { group: 'lid' });
  if (bp) parts.push(bp);
  if (lp) parts.push(lp);
  const turns = (zB - Hb) / t.lead;
  return {
    parts,
    summary: `${across(k)} × ${(Hb + Lh).toFixed(0)} mm closed · holds ${ml(capacity / 1000)} · mouth ${(2 * (t.Rr - w)).toFixed(0)} mm · ${turnsText(turns)} to close · ${(grams(body) + grams(lid)).toFixed(0)} g`,
  };
}

const across = (k: Kit) => (k.round ? `Ø${k.p.diameter}` : `${k.p.diameter} mm across`);

/* ------------------------------------------------------------------ the stack */

async function stack(k: Kit): Promise<{ parts: Part[]; summary: string }> {
  const { ctx, p, notes, t, w } = k;
  const rimH = Math.max(3 * t.pitch, p.threadHeight);
  const Ls = rimH - HEADROOM;
  const n = Math.max(1, Math.min(8, Math.round(p.tiers)));
  // The joint: a spigot widens at 45° from its root to Rf, just outside the rim's grooves,
  // where it seats in a matching countersink in the rim below; above that the tier flares out
  // to its outline, again at 45°, so nothing overhangs.
  const Rf = t.Rr + t.c + t.depth + 0.4;
  const seat = Rf - t.Rr;
  const flare = Math.max(0, k.Rc - Rf);
  const flareIn = Math.max(0, k.Rcc - (t.Rr - w));
  const spigot = (zb: number) =>
    threadedTube(k, 0, zb + 0.5, zb, 0.8, zb - seat - 0.3, 'bottom')
      .add(taper(k, disc(k, t.Rr - 0.01), zb - seat, disc(k, Rf), zb))
      .add(taper(k, disc(k, Rf), zb - 0.01, k.sec, zb + flare));
  // A hair (0.05 mm) wider than the spigot's cone, so the two never share a surface.
  const countersink = (zt: number) => taper(k, disc(k, t.Rr + t.c - 0.01), zt - seat + t.c - 0.05, disc(k, Rf + 1), zt + 1);
  const H = p.height;
  const parts: Part[] = [];
  const gap = 2 * k.Rc + 10;
  let capacity = 0;
  let mass = 0;

  for (let i = 0; i < n; i++) {
    const zb = i === 0 ? 0 : Ls;
    const zt = zb + H;
    const zRim = zt - rimH;
    let outer: Manifold;
    let cav: { solid: Manifold; lower: Manifold; zStraight: number } | null;
    if (i === 0) {
      outer = ctx.edged(k.sec, H, { bottom: CHAMFER, top: CHAMFER, style: 'chamfer' });
      cav = cavity(k, p.floor, zRim, t.Rr + t.c, zRim, true);
    } else {
      outer = spigot(zb).add(ctx.edged(k.sec, zt - zb - flare + 0.01, { z0: zb + flare - 0.01, top: CHAMFER, style: 'chamfer' }));
      // The spigot is hollow down to its own floor, then the inside widens to the outline.
      const up = cavity(k, zb + flareIn, zRim, t.Rr + t.c, zRim, false);
      cav = up && {
        solid: up.solid.add(cyl(k, t.Rr - w, p.floor, zb + 0.01)).add(taper(k, disc(k, t.Rr - w), zb, k.inner, zb + flareIn + 0.01)),
        lower: up.lower,
        zStraight: up.zStraight,
      };
    }
    if (!cav || zRim - zb < flare + 2) {
      notes.push({ level: 'error', message: `Each tier needs more height for this shape and a ${rimH} mm thread: make the tiers taller.` });
      return { parts: [], summary: '' };
    }
    let tier = outer.subtract(cav.solid).subtract(threadedBore(k, zRim - 0.5, zt + 1, zt, zRim, zt + 1)).subtract(countersink(zt));
    // Walls stand on the floor: in an upper tier that is down inside the spigot.
    const walls = dividers(k, i === 0 ? cav.lower : cav.solid, p.floor - 0.01, cav.zStraight);
    if (walls) tier = tier.add(walls);
    capacity += cav.solid.volume() - (walls?.volume() ?? 0);
    mass += grams(tier);
    const part = ctx.part(assembled(ctx) ? tier.translate([0, 0, i === 0 ? 0 : i * H - Ls]) : placed(tier, i * gap), `Tier ${i + 1}`, p.bodyColor, { group: `tier-${i + 1}` });
    if (part) parts.push(part);
  }

  // The lid: a cap on a short hollow spigot, printed upside down.
  const lidTop = Math.max(1, p.lidTop);
  const capH = Math.max(lidTop + 4, p.lidHeight - flare);
  const zc = Ls + flare;
  let lid = spigot(Ls)
    .add(capOuter(k, null, zc - 0.01, zc + capH, 0))
    .subtract(cyl(k, t.Rr - w, -1, Ls));
  const text = await label(k, zc + capH, k.Ri - 3);
  if (text) lid = lid.subtract(text);
  mass += grams(lid);
  const lp = ctx.part(assembled(ctx) ? lid.translate([0, 0, n * H - Ls]) : placed(lid.rotate([180, 0, 0]), n * gap), 'Lid', p.lidColor, { group: 'lid' });
  if (lp) parts.push(lp);
  if (!k.round && flare > 8) notes.push({ level: 'info', message: `Each joint steps in ${flare.toFixed(0)} mm at the corners so the tiers print without supports; a rounder shape or smaller corners narrow it.` });

  const total = n * H + flare + capH;
  const turns = (Ls - seat - 0.3) / t.lead;
  return {
    parts,
    summary: `${n} tiers · ${across(k)} × ${total.toFixed(0)} mm stacked · ${ml(capacity / 1000 / n)} each · ${turnsText(turns)} to close · ${mass.toFixed(0)} g`,
  };
}
