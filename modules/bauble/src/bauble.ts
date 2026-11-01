/**
 * The bauble, printed upright in one piece without supports, with a cap that screws on.
 *
 * Vase · relief: a single spiral wall (vase mode), its pattern a relief on that wall.
 * Lace · openwork: a thicker wall printed normally, the pattern's lines left standing and the
 * rest cut away (or, with "engrave", the pattern cut out of a solid wall).
 *
 * Patterns are laid on conformally: tiles stay square however the radius changes, smaller
 * towards the top and bottom, the lines `line` mm wide everywhere. A name or a logo is wrapped
 * on the front. Where the wall leans close to the overhang limit the decoration fades out so
 * nothing leans past it.
 */
import type { Contour, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold } from '@pf/engine-manifold';
import { circle, rect, teardrop } from '@pf/shapes';
import type { ArtMask } from './art';
import { artSection, rasterize } from './art';
import type { Pt } from './lathe';
import { lathe, resample } from './lathe';
import type { Tile } from './patterns';
import { connectivity, mask, THEMES, tile } from './patterns';
import { outline } from './shapes';
import type { Ctx, Params } from './types';
import { PATTERN_PARAM } from './types';

export const THREAD = { pitch: 2.5, depth: 0.8, crest: 0.4 };
/** Mesh edge on the body, mm, by resolution. */
const EDGE = { draft: 0.9, standard: 0.5, fine: 0.16 };
/** Lace grid and mesh edge, mm, by resolution. */
const LACE = { draft: [0.4, 1.8], standard: [0.3, 1.2], fine: [0.15, 0.6] } as const;

/** The thread's height over its root, 0–1, at axial position x (mm) within one pitch. */
export function threadWave(x: number): number {
  const { pitch, depth, crest } = THREAD;
  const f = ((x % pitch) + pitch) % pitch;
  if (f < depth) return f / depth;
  if (f < depth + crest) return 1;
  if (f < 2 * depth + crest) return 1 - (f - depth - crest) / depth;
  return 0;
}

/** The cap's groove: the thread widened by the clearance on both flanks. */
export function grooveWave(x: number, c: number): number {
  return Math.max(threadWave(x - c), threadWave(x + c), threadWave(x));
}

/** The pattern chosen for the theme, or none. */
export function patternFor(p: Params): string | null {
  const list = THEMES[p.theme] as readonly string[] | undefined;
  if (!list?.length) return null;
  const key = PATTERN_PARAM[p.theme];
  const chosen = key ? String(p[key]) : '';
  return list.includes(chosen) ? chosen : list[0]!;
}

/* ------------------------------------------------------------------ the profile, densely */

interface Sample {
  r: number;
  z: number;
  nr: number;
  nz: number;
  /** Degrees from the vertical. */
  slope: number;
  /** Pattern rows (tile units) from the widest point. */
  v: number;
}

/** A profile sampled every 0.1 mm of its length, its normals smoothed over `smooth` mm. */
export class Track {
  readonly s: number[] = [];
  readonly r: number[] = [];
  readonly z: number[] = [];
  readonly nr: number[] = [];
  readonly nz: number[] = [];
  readonly slope: number[] = [];
  readonly v: number[] = [];
  readonly S: number;
  /** Arc length at the widest point. */
  readonly sMax: number;

  constructor(pts: Pt[], smooth: number) {
    const d = resample(pts, () => 0.1);
    let acc = 0;
    d.forEach((q, i) => {
      if (i) acc += Math.hypot(q[0] - d[i - 1]![0], q[1] - d[i - 1]![1]);
      this.s.push(acc);
      this.r.push(q[0]);
      this.z.push(q[1]);
    });
    this.S = acc;
    const n = d.length;
    const k = Math.max(1, Math.round(smooth / 0.1));
    for (let i = 0; i < n; i++) {
      const a = d[Math.max(0, i - k)]!;
      const b = d[Math.min(n - 1, i + k)]!;
      const tr = b[0] - a[0];
      const tz = b[1] - a[1];
      const l = Math.hypot(tr, tz) || 1;
      this.nr.push(tz / l);
      this.nz.push(-tr / l);
      this.slope.push((Math.atan2(Math.abs(tr), Math.abs(tz)) * 180) / Math.PI);
      this.v.push(0);
    }
    // The widest point: the middle of the widest run.
    const rMax = Math.max(...this.r);
    let first = -1;
    let last = -1;
    for (let i = 0; i < n; i++)
      if (this.r[i]! > rMax - 0.02) {
        if (first < 0) first = i;
        last = i;
      }
    this.sMax = (this.s[first]! + this.s[last]!) / 2;
  }

  /** Fills `v` as ∫ ds / height(r) from the widest point. */
  rows(height: (r: number) => number) {
    const n = this.s.length;
    let i0 = 0;
    while (i0 < n - 1 && this.s[i0]! < this.sMax) i0++;
    this.v[i0] = 0;
    for (let i = i0 + 1; i < n; i++) this.v[i] = this.v[i - 1]! + (this.s[i]! - this.s[i - 1]!) / height((this.r[i]! + this.r[i - 1]!) / 2);
    for (let i = i0 - 1; i >= 0; i--) this.v[i] = this.v[i + 1]! - (this.s[i + 1]! - this.s[i]!) / height((this.r[i]! + this.r[i + 1]!) / 2);
  }

  at(s: number): Sample {
    const a = this.s;
    let lo = 0;
    let hi = a.length - 1;
    if (s <= 0) hi = 1;
    else if (s >= this.S) lo = hi - 1;
    else
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (a[m]! <= s) lo = m;
        else hi = m;
      }
    const t = Math.max(0, Math.min(1, (s - a[lo]!) / (a[hi]! - a[lo]! || 1)));
    const f = (x: number[]) => x[lo]! + (x[hi]! - x[lo]!) * t;
    const nr = f(this.nr);
    const nz = f(this.nz);
    const l = Math.hypot(nr, nz) || 1;
    return { r: f(this.r), z: f(this.z), nr: nr / l, nz: nz / l, slope: f(this.slope), v: f(this.v) };
  }

  /** Arc length at height z, on the part of the profile above (upper) or below the widest point. */
  sOfZ(z: number, upper: boolean): number {
    const n = this.s.length;
    let i0 = 0;
    while (i0 < n - 1 && this.s[i0]! < this.sMax) i0++;
    // The profile climbs, so z rises with the index on both sides of the widest point.
    let lo = upper ? i0 : 0;
    let hi = upper ? n - 1 : i0;
    const z_ = this.z;
    if (z <= z_[lo]!) return this.s[lo]!;
    if (z >= z_[hi]!) return this.s[hi]!;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (z_[m]! <= z) lo = m;
      else hi = m;
    }
    const t = (z - z_[lo]!) / (z_[hi]! - z_[lo]! || 1);
    return this.s[lo]! + (this.s[hi]! - this.s[lo]!) * t;
  }

  /** Arc length where the profile first reaches height z. */
  sAtZ(z: number): number {
    for (let i = 0; i < this.z.length; i++) if (this.z[i]! >= z) return this.s[i]!;
    return this.S;
  }
}

/* ------------------------------------------------------------------ decoration */

interface Look {
  /** 0–1: how much decoration this spot may take (0 on cones, foot, neck, past the coverage). */
  room: number;
  /** 0–1: pattern here. */
  pat: number;
  /** 0–1: the plate behind the art. */
  keep: number;
  /** 0–1: the art itself. */
  ink: number;
}

interface Art {
  art: ArtMask;
  keep: ArtMask;
}

async function artMasks(ctx: Ctx, notes: Diagnostic[]): Promise<Art | null> {
  const all = await artSection(ctx, notes);
  if (!all || all.isEmpty()) return null;
  const art = rasterize(ctx.contours(all), 0.08);
  const keep = rasterize(ctx.contours(all.offset(1.6, 'Round', 2, 16)), 0.2);
  return art && keep ? { art, keep } : null;
}

const FRONT = -Math.PI / 2;

export interface LookOptions {
  /** Lace: where the lines don't join up one way, ribs along the tile edges that way. */
  ribs?: { u: boolean; v: boolean };
  /** The decoration fades out where a tile is narrower than `fade[1]` lines, gone at `fade[0]`. */
  fade: [number, number];
}

export function looker(p: Params, tr: Track, t: Tile | null, art: Art | null, sNeck: number, sFoot: number, opts: LookOptions): (s: number, th: number) => Look {
  const repeats = Math.max(1, Math.round(p.repeats));
  const vs = Math.max(0.2, p.verticalScale);
  const tileW = (r: number) => Math.max(0.5, (2 * Math.PI * r) / repeats);
  tr.rows((r) => tileW(r) * vs);
  const reach = (Math.max(0, Math.min(100, p.coverage)) / 100) * Math.max(tr.sMax, sNeck - tr.sMax);
  const line = Math.max(0.3, p.line);
  const [f0, f1] = opts.fade;
  const k = (x: number) => Math.max(0, Math.min(1, x));
  return (s, th) => {
    const q = tr.at(s);
    const none = { room: 0, pat: 0, keep: 0, ink: 0 };
    if (q.r < 0.5 || s < sFoot || s > sNeck) return none;
    const ds = s - tr.sMax;
    const w = tileW(q.r);
    // Fades out where the tiles get too small for the lines (towards the ends), over the
    // last 3 mm of the coverage, and 2 mm before the foot and the neck.
    const size = t ? k((w * Math.sqrt(vs) - f0 * line) / ((f1 - f0) * line)) : 1;
    const room = size * k((reach - Math.abs(ds)) / 3) * k((s - sFoot) / 2) * k((sNeck - s) / 2);
    let keep = 0;
    let ink = 0;
    if (art) {
      let a = th - FRONT;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      const x = a * q.r;
      const y = ds - p.artOffset;
      keep = art.keep.at(x, y);
      ink = art.art.at(x, y) * k((sNeck - s) / 2) * k((s - sFoot) / 2);
    }
    if (room <= 0) return { room: 0, pat: 0, keep, ink };
    let pat = 0;
    if (t && keep < 1) {
      const u = (th / (2 * Math.PI)) * repeats;
      const scale = w * Math.sqrt(vs);
      pat = mask(t, u, q.v, scale, line);
      const r = opts.ribs;
      if (r && (r.u || r.v)) {
        const half = line / 2;
        const aa = 0.12;
        const band = (d: number) => k((half + aa - d) / (2 * aa));
        if (r.v) pat = Math.max(pat, band(Math.abs(u - Math.round(u)) * w));
        if (r.u) pat = Math.max(pat, band(Math.abs(q.v - Math.round(q.v / t.h) * t.h) * w * vs));
      }
    }
    return { room, pat, keep, ink };
  };
}

/* ------------------------------------------------------------------ lace */

/**
 * Closed outlines of the region where f < 0, f sampled on a grid (row-major, w × h, spacing
 * gx × gy, first sample at x0, y0). The grid's border must be ≥ 0.
 */
export function isolines(f: Float32Array, w: number, h: number, x0: number, y0: number, gx: number, gy: number): Contour[] {
  const at = (i: number, j: number) => f[j * w + i]!;
  // Crossing points on cell edges: horizontal edge (i,j)-(i+1,j) is 2(j w + i), vertical (i,j)-(i,j+1) is 2(j w + i)+1.
  const pos = new Map<number, [number, number]>();
  const point = (id: number): [number, number] => {
    let q = pos.get(id);
    if (q) return q;
    const e = id >> 1;
    const i = e % w;
    const j = (e - i) / w;
    const a = at(i, j);
    if (id & 1) {
      const b = at(i, j + 1);
      q = [x0 + i * gx, y0 + (j + a / (a - b)) * gy];
    } else {
      const b = at(i + 1, j);
      q = [x0 + (i + a / (a - b)) * gx, y0 + j * gy];
    }
    pos.set(id, q);
    return q;
  };
  const next = new Map<number, number>();
  const link = (a: number, b: number) => next.set(a, b);
  for (let j = 0; j + 1 < h; j++)
    for (let i = 0; i + 1 < w; i++) {
      const v0 = at(i, j) < 0 ? 1 : 0; // bottom left
      const v1 = at(i + 1, j) < 0 ? 2 : 0; // bottom right
      const v2 = at(i + 1, j + 1) < 0 ? 4 : 0; // top right
      const v3 = at(i, j + 1) < 0 ? 8 : 0; // top left
      const c = v0 | v1 | v2 | v3;
      if (c === 0 || c === 15) continue;
      const B = 2 * (j * w + i);
      const T = 2 * ((j + 1) * w + i);
      const L = 2 * (j * w + i) + 1;
      const R = 2 * (j * w + i + 1) + 1;
      // Each segment runs with the inside (f < 0) on its left, so outlines come out
      // counter-clockwise round the holes.
      switch (c) {
        case 1: link(L, B); break;
        case 2: link(B, R); break;
        case 3: link(L, R); break;
        case 4: link(R, T); break;
        case 6: link(B, T); break;
        case 7: link(L, T); break;
        case 8: link(T, L); break;
        case 9: link(T, B); break;
        case 11: link(T, R); break;
        case 12: link(R, L); break;
        case 13: link(R, B); break;
        case 14: link(B, L); break;
        case 5:
        case 10: {
          const mid = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4 < 0;
          if (c === 5) {
            if (mid) { link(L, T); link(R, B); } else { link(L, B); link(R, T); }
          } else {
            if (mid) { link(B, L); link(T, R); } else { link(B, R); link(T, L); }
          }
          break;
        }
      }
    }
  const out: Contour[] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const c: number[] = [];
    let id: number | undefined = start;
    while (id !== undefined && !seen.has(id)) {
      seen.add(id);
      const q = point(id);
      c.push(q[0], q[1]);
      id = next.get(id);
    }
    if (c.length >= 6) out.push(c);
  }
  return out;
}

/* ------------------------------------------------------------------ the cap */

/**
 * The cap: a sleeve with the thread cut inside, a top, a tab with a teardrop hole. With a
 * light hole on top, a hole through the top and the tab made an arch over it.
 */
function makeCap(ctx: Ctx, edge: number): { cap: Manifold; capTop: number; rc: number } {
  const p = ctx.params;
  const c = Math.max(0, p.threadClearance);
  const rn = p.neckDiameter / 2;
  const capWall = 1.6;
  const rc = rn + THREAD.depth + c + capWall;
  const capTop = 1.6;
  const capH = p.neckHeight + capTop;
  const capColumns = Math.round((2 * Math.PI * rc) / Math.min(edge, 0.3));
  const outer = lathe(ctx.wasm, resample([[0, 0], [rc, 0], [rc, capH], [0, capH]], () => 0.25), capColumns, (row, _i, th) => {
    if (row.nr < 0.9 || row.z < 0.4 || row.z > capH - 0.4) return 0;
    if (p.capStyle === 'fluted') return -0.7 * Math.max(0, Math.cos(th * 18)) ** 4;
    if (p.capStyle === 'star') {
      const f = ((th * 8) / (2 * Math.PI)) % 1;
      return 1.2 * (1 - 2 * Math.abs(f - 0.5)) - 0.3;
    }
    return 0;
  });
  const bore = lathe(ctx.wasm, resample([[0, -1], [rn + c, -1], [rn + c, p.neckHeight + c], [0, p.neckHeight + c]], () => 0.12), capColumns, (row, _i, th) => {
    if (row.nr < 0.9 || row.z < 0) return 0;
    // The same thread as a groove: the neck's starts 0.6 mm up the neck.
    return THREAD.depth * grooveWave(row.z - 0.6 - (th / (2 * Math.PI)) * THREAD.pitch, c);
  });
  let cap = outer.subtract(bore);
  const hole = Math.max(1.5, p.loopHole);
  let tab2d: CrossSection;
  if (p.lightHole === 'top') {
    const d = lightHoleSize(p);
    cap = cap.subtract(ctx.Manifold.cylinder(capH + 2, d / 2, d / 2, 48).translate([0, 0, -1]));
    // An arch over the hole: two legs, a pointed opening (prints without support), the loop above.
    const A = d + 7;
    const hb = d + 2.6 + hole / 2;
    const o = d + 1;
    const opening = ctx.cs([[-o / 2, -1, o / 2, -1, o / 2, d * 0.5, 0, d * 0.5 + o / 2, -o / 2, d * 0.5]]);
    tab2d = ctx
      .cs([rect(A, hb)])
      .translate([0, hb / 2])
      .add(ctx.cs([circle(A / 2, 64)]).translate([0, hb]))
      .subtract(opening)
      .subtract(ctx.cs([teardrop(hole / 2, hole * 0.85, 32)]).translate([0, hb]));
  } else {
    const tabW = hole + 5;
    const tabH = hole + 5;
    tab2d = ctx
      .cs([rect(tabW, tabH - tabW / 2)])
      .translate([0, (tabH - tabW / 2) / 2])
      .add(ctx.cs([circle(tabW / 2, 48)]).translate([0, tabH - tabW / 2]))
      .subtract(ctx.cs([teardrop(hole / 2, hole * 0.85, 32)]).translate([0, tabH - tabW / 2]));
  }
  const tab = ctx.extrude(tab2d, 3).translate([0, 0, -1.5]).rotate([90, 0, 0]).translate([0, 0, capH - 0.4]);
  return { cap: cap.add(tab), capTop, rc };
}

/** The light hole's diameter, no wider than the neck allows. */
export function lightHoleSize(p: Params): number {
  return Math.max(3, Math.min(p.lightHoleDiameter, p.neckDiameter - 2.4));
}

/** A teardrop-shaped hole through the back wall at height z, pointing `up` (+1) or down (−1). */
function sideHole(ctx: Ctx, d: number, z: number, R: number, up: 1 | -1): Manifold {
  const td = ctx.cs([teardrop(d / 2, d * 0.62, 48)]);
  return ctx
    .extrude(up > 0 ? td : td.mirror([0, 1]), R + 6, -(R + 6))
    .rotate([90, 0, 0])
    .translate([0, 0, z]);
}

/* ------------------------------------------------------------------ the bauble */

const BACK = Math.PI / 2;

export async function buildBauble(ctx: Ctx, notes: Diagnostic[]): Promise<{ parts: Part[]; summary: string }> {
  const p = ctx.params;
  const id = patternFor(p);
  const t = id ? tile(id) : null;
  const art = await artMasks(ctx, notes);
  const edge = EDGE[p.resolution] ?? 0.5;
  const { cap, capTop, rc } = makeCap(ctx, edge);
  if (p.shape === 'halves') return buildHalves(ctx, t, art, cap, capTop, rc, edge, notes);

  const custom = { bulge: p.customBulge, top: p.customTop, bottom: p.customBottom, aspect: 1.1 };
  const lace = p.mode === 'lace';
  // Relief on a vase wall leans out of it: cones a little under the limit leave it room.
  const relief = !lace && (!!t || !!art);
  const slope = relief ? p.overhang - Math.max(0, p.coneMargin) : p.overhang;
  const o = outline(p.shape, p.diameter, p.elongation, slope, p.foot, p.neckDiameter, p.neckHeight, custom);
  const depth = Math.max(0, p.depth);
  const T = Math.max(0.8, p.wall);
  const lift = lace ? T + 0.6 : 0;
  const neckZ = o.neckZ + lift;
  const thread = threadAt(p, neckZ);
  const light = lightHoleSize(p);
  const holeZ = o.zMax * 0.75 + lift;

  let body: Manifold;
  if (!lace) {
    const pts: Pt[] = resample(o.pts, (_r, z) => (z > neckZ - 0.5 ? 0.12 : edge));
    const tr = new Track(o.pts, 0.3);
    const look = looker(p, tr, t, art, tr.sAtZ(neckZ), p.foot / 2, { fade: [2.5, 4] });
    const sign = p.engrave ? -1 : 1;
    const artSign = p.artStyle === 'engrave' ? -1 : 1;
    const columns = Math.round((2 * Math.PI * o.rMax) / edge);
    const sHole = tr.sAtZ(holeZ);
    body = lathe(ctx.wasm, pts, columns, (row, _i, th) => {
      if (row.z > neckZ + 0.2) return row.nr > 0.9 ? thread(row.z, th) : 0;
      if (p.lightHole === 'side') {
        // Vase mode can't print through a hole: a dimple marks where to drill.
        let a = th - BACK;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.hypot(a * row.r, row.s - sHole) < light / 2) return -0.6;
      }
      const l = look(row.s, th);
      return sign * depth * l.pat * (1 - l.keep) * l.room + artSign * depth * l.ink;
    });
    if (p.lightHole === 'side') notes.push({ level: 'info', message: `Vase mode can't print through a hole, so the side light hole is a dimple on the back: drill it out to ${light} mm.` });
  } else {
    body = laceBody(ctx, o, lift, T, t, art, thread, notes);
    if (p.lightHole === 'side') body = body.subtract(sideHole(ctx, light, holeZ, o.rMax, 1));
  }

  const parts: Part[] = [];
  const add = (m: Manifold, name: string, color: RGB, group: string, role?: 'preview') => {
    const part = ctx.part(m, name, color, role ? { group, role } : { group });
    if (part) parts.push(part);
  };
  add(body, 'Bauble', p.baubleColor, 'bauble');
  add(cap.translate([o.rMax + rc + 8, 0, 0]), 'Cap', p.capColor, 'cap');
  if (p.showCap) add(cap.translate([0, 0, neckZ - 0.01]), 'Cap (on the bauble)', p.capColor, 'preview', 'preview');

  const grams = lace ? (body.volume() * 1.24) / 1000 : (body.surfaceArea() * Math.max(0.3, p.lineWidth) * 1.24) / 1000;
  const capGrams = (cap.volume() * 1.24) / 1000;
  if (!t && p.theme !== 'plain') notes.push({ level: 'info', message: 'This theme has no pattern.' });
  notes.push({
    level: 'info',
    message: lace
      ? `Slicer, bauble: normal mode, ${T} mm walls (3 lines of ${(T / 3).toFixed(2)}), no supports, a 4–5 mm brim; it stands on a ring ${p.foot} mm across. Cap: 3 walls, no supports, open end down.`
      : `Slicer, bauble: vase (spiral) mode, no supports, ${p.lineWidth} mm line width, 3 bottom layers, a 4–5 mm brim (the foot is only ${p.foot} mm). Cap: normal mode, 3 walls, no supports, open end down.`,
  });
  return {
    parts,
    summary: `Ø${(o.rMax * 2).toFixed(0)} × ${(o.height + lift + capTop).toFixed(0)} mm · bauble ≈ ${grams.toFixed(1)} g · cap ≈ ${capGrams.toFixed(1)} g`,
  };
}

/** The neck's thread, mm out from the neck at height z, angle th; the neck starts at neckZ. */
function threadAt(p: Params, neckZ: number) {
  return (z: number, th: number) => {
    const z0 = neckZ + 0.6;
    const z1 = neckZ + p.neckHeight - 0.4;
    if (z < z0 || z > z1) return 0;
    const fade = Math.min(1, (z - z0) / 1.2, (z1 - z) / 1.2);
    return THREAD.depth * fade * threadWave(z - z0 - (th / (2 * Math.PI)) * THREAD.pitch);
  };
}

/* ------------------------------------------------------------------ two halves */

/** The ring that joins the halves: its height, and its wall. */
export const RING = { h: 6, wall: 1.6 };

/**
 * A round bauble in two halves, each printed rim down in normal mode. The outside is the
 * true shape, relief all over it (on a rim-down half every outside surface faces up). The
 * inside follows it until it would lean past the overhang limit, then goes on as a cone, so
 * the wall thickens towards the poles. A ring glued or pressed inside the rims joins them; a
 * chamfer on each rim makes a groove at the seam.
 */
async function buildHalves(ctx: Ctx, t: Tile | null, art: Art | null, cap: Manifold, capTop: number, rc: number, edge: number, notes: Diagnostic[]): Promise<{ parts: Part[]; summary: string }> {
  const p = ctx.params;
  const R = p.diameter / 2;
  const Re = R * Math.max(0.6, p.elongation);
  const Zeq = Re;
  const W = Math.max(0.8, p.wall);
  const rn = p.neckDiameter / 2;
  const k = Math.tan((Math.min(70, Math.max(20, p.overhang)) * Math.PI) / 180);
  const ch = 0.6;
  const phiN = Math.acos(Math.min(0.99, rn / R));
  const zN = Zeq + Re * Math.sin(phiN);
  const zTop = zN + p.neckHeight;
  const ell = (phi: number): Pt => [R * Math.cos(phi), Zeq + Re * Math.sin(phi)];

  // The whole outside, pole to neck, for the pattern's coordinates.
  const full: Pt[] = [[0, 0]];
  for (let i = 1; i <= 240; i++) full.push(ell(-Math.PI / 2 + ((phiN + Math.PI / 2) * i) / 240));
  full.push([rn, zTop], [0, zTop]);
  const tr = new Track(full, 0.3);
  const sNeck = tr.sAtZ(zN);
  const look = looker(p, tr, t, art, sNeck, 0, { fade: [2.5, 4] });
  const sign = p.engrave ? -1 : 1;
  const artSign = p.artStyle === 'engrave' ? -1 : 1;
  const depth = Math.max(0, p.depth);
  const thread = threadAt(p, zN);
  const decor = (z: number, th: number, upper: boolean) => {
    const seam = Math.max(0, Math.min(1, (Math.abs(z - Zeq) - ch - 0.6) / 1.5));
    if (seam <= 0) return 0;
    const l = look(tr.sOfZ(z, upper), th);
    return (sign * depth * l.pat * (1 - l.keep) * l.room + artSign * depth * l.ink) * seam;
  };
  const columns = Math.round((2 * Math.PI * R) / edge);
  const step = (_r: number, z: number) => (z > zN - 0.5 ? 0.12 : edge);

  // Outsides.
  const topOut: Pt[] = [[0, Zeq], [R - ch, Zeq]];
  for (let i = 0; i <= 160; i++) {
    const q = ell(Math.asin(ch / Re) + ((phiN - Math.asin(ch / Re)) * i) / 160);
    topOut.push(q);
  }
  topOut.push([rn, zTop], [0, zTop]);
  const top = lathe(ctx.wasm, resample(topOut, step), columns, (row, _i, th) => {
    if (row.z > zN + 0.2) return row.nr > 0.9 ? thread(row.z, th) : 0;
    if (row.z < Zeq + ch + 0.05 || row.r < 0.5) return 0;
    return decor(row.z, th, true);
  });
  const botOut: Pt[] = [[0, 0]];
  for (let i = 1; i <= 160; i++) botOut.push(ell(-Math.PI / 2 + ((Math.PI / 2 - Math.asin(ch / Re)) * i) / 160));
  botOut.push([R - ch, Zeq], [0, Zeq]);
  const bottom = lathe(ctx.wasm, resample(botOut, step), columns, (row, _i, th) => {
    if (row.z > Zeq - ch - 0.05 || row.r < 0.5) return 0;
    return decor(row.z, th, false);
  });

  // Insides: the shape W in, a cylinder where the ring goes, coned to the overhang limit as
  // each half prints (rim down: going away from the rim the inside may shrink k per mm).
  const Ri = R - W;
  const inner = (z: number) => {
    const u = (z - Zeq) / (Re - W);
    return Math.abs(u) >= 1 ? 0 : Ri * Math.sqrt(1 - u * u);
  };
  const ringZone = RING.h / 2 + 0.5;
  const dz = 0.2;
  const rni = rn - 1.2;
  // Top half, from its rim up.
  const zs: number[] = [];
  for (let z = Zeq; z < zN; z += dz) zs.push(z);
  const ri = zs.map((z) => (z - Zeq < ringZone ? Ri : inner(z)));
  let next = rni;
  for (let i = zs.length - 1; i >= 0; i--) {
    if (zs[i]! - Zeq >= ringZone) ri[i] = Math.min(ri[i]!, next + k * dz);
    ri[i] = Math.max(ri[i]!, rni);
    next = ri[i]!;
  }
  const topIn: Pt[] = [[0, Zeq - 1], [Ri, Zeq - 1], ...zs.map((z, i) => [ri[i]!, z] as Pt), [rni, zN], [rni, zTop + 1], [0, zTop + 1]];
  // Bottom half: its inside ends in a flat ceiling `rB` across (a short bridge as it prints),
  // and widens from there no faster than the overhang slope towards the rim.
  const rB = Math.min(5, Ri * 0.5);
  const zc = Zeq - (Re - W) * Math.sqrt(1 - (rB / Ri) ** 2);
  const zb: number[] = [];
  for (let z = Zeq; z > zc; z -= dz) zb.push(z);
  const rb = zb.map((z) => (Zeq - z < ringZone ? Ri : inner(z)));
  next = rB;
  for (let i = zb.length - 1; i >= 0; i--) {
    const gap = zb[i]! - (i === zb.length - 1 ? zc : zb[i + 1]!);
    if (Zeq - zb[i]! >= ringZone) rb[i] = Math.max(rB, Math.min(rb[i]!, next + k * gap));
    next = rb[i]!;
  }
  const botIn: Pt[] = [];
  for (let i = zb.length - 1; i >= 0; i--) botIn.push([rb[i]!, zb[i]!]);
  const botProfile: Pt[] = [[0, zc], [rB, zc], ...botIn, [Ri, Zeq + 1], [0, Zeq + 1]];
  const smallCols = Math.round((2 * Math.PI * R) / Math.max(edge, 0.5));
  let topHalf = top.subtract(lathe(ctx.wasm, topIn, smallCols));
  let botHalf = bottom.subtract(lathe(ctx.wasm, botProfile, smallCols));

  const light = lightHoleSize(p);
  if (p.lightHole === 'side') botHalf = botHalf.subtract(sideHole(ctx, light, Zeq - Re * 0.45, R, -1));

  const ringR = Ri - Math.max(0, p.threadClearance);
  const ring = ctx.Manifold.cylinder(RING.h, ringR, ringR, 180).subtract(ctx.Manifold.cylinder(RING.h + 2, ringR - RING.wall, ringR - RING.wall, 180).translate([0, 0, -1]));

  const parts: Part[] = [];
  const add = (m: Manifold, name: string, color: RGB, group: string, role?: 'preview') => {
    const part = ctx.part(m, name, color, role ? { group, role } : { group });
    if (part) parts.push(part);
  };
  // Printed rim down: the top half as it is, the bottom half turned over.
  add(topHalf.translate([0, 0, -Zeq]), 'Top half', p.baubleColor, 'top');
  add(botHalf.rotate([180, 0, 0]).translate([2 * R + 8, 0, Zeq]), 'Bottom half', p.baubleColor, 'bottom');
  add(ring.translate([-(R + ringR + 8), 0, 0]), 'Ring', p.baubleColor, 'ring');
  add(cap.translate([2 * R + 8, -(R + rc + 8), 0]), 'Cap', p.capColor, 'cap');
  // Assembled, behind the plate.
  const back = 2 * R + 24;
  add(topHalf.add(botHalf).translate([0, back, 0]), 'Bauble (assembled)', p.baubleColor, 'preview', 'preview');
  if (p.showCap) add(cap.translate([0, back, zN - 0.01]), 'Cap (assembled)', p.capColor, 'preview', 'preview');

  if (p.mode === 'lace') notes.push({ level: 'info', message: 'Two halves are relief only; Lace applies to the one-piece shapes.' });
  notes.push({ level: 'info', message: `Slicer: normal mode for every part, no supports. Both halves rim down, ${W} mm walls, 15 % infill where the wall thickens at the ends; the bottom half's inside closes with a short bridge. Glue the ring into one rim (or press it in) and push the other half on. Cap: open end down.` });
  // Walls (two lines each side) solid, the thick ends at 15 % infill.
  const printed = (m: Manifold) => {
    const v = m.volume();
    const shell = Math.min(v, m.surfaceArea() * 0.8);
    return shell + 0.15 * (v - shell);
  };
  const grams = ((printed(topHalf) + printed(botHalf) + ring.volume()) * 1.24) / 1000;
  const capGrams = (cap.volume() * 1.24) / 1000;
  return { parts, summary: `Ø${(2 * R).toFixed(0)} × ${(zTop + capTop).toFixed(0)} mm · halves and ring ≈ ${grams.toFixed(1)} g · cap ≈ ${capGrams.toFixed(1)} g` };
}

/* ------------------------------------------------------------------ lace */

/**
 * The openwork body: the wall unrolled flat (x round the widest circle, y up the profile),
 * the pattern's gaps cut out of it in 2D, then wrapped back round, `T` thick inwards.
 *
 * Patterns whose lines form a net keep the lines. Lines that join up only one way get ribs
 * along the tile edges the other way. Separate motifs (snowflakes, hearts) are cut out of the
 * wall instead. Towards the ends, where the tiles get too small, the holes shrink and stop.
 */
function laceBody(
  ctx: Ctx,
  o: ReturnType<typeof outline>,
  lift: number,
  T: number,
  t: Tile | null,
  art: Art | null,
  thread: (z: number, th: number) => number,
  notes: Diagnostic[],
): Manifold {
  const p = ctx.params;
  const rf = o.pts[1]![0];
  // Stand on a short upright ring, so the wall's bottom face is flat on the bed.
  const pts: Pt[] = [[rf, 0], ...o.pts.slice(1, -1).map(([r, z]) => [r, z + lift] as Pt)];
  const tr = new Track(pts, T);
  const neckZ = o.neckZ + lift;
  const sNeck = tr.sAtZ(neckZ);
  const R = o.rMax;

  let cut = p.engrave;
  let ribs: { u: boolean; v: boolean } | undefined;
  if (t && !cut) {
    const scale = ((2 * Math.PI * R) / Math.max(1, Math.round(p.repeats))) * Math.sqrt(Math.max(0.2, p.verticalScale));
    const lines = connectivity(t, p.line, scale);
    if (!lines.u && !lines.v) {
      const gaps = connectivity(t, p.line, scale, true);
      if (gaps.u && gaps.v) cut = true;
      else ribs = { u: true, v: true };
    } else ribs = { u: !lines.u, v: !lines.v };
  }
  const look = looker(p, tr, t, art, sNeck - 1, lift + 1, { fade: [3, 4.5], ribs });
  const [g, meshEdge] = LACE[p.resolution] ?? LACE.standard;
  const X = 2 * Math.PI * R;
  const S = tr.S;

  // Sample how solid every spot is: > 0 wall, < 0 gap.
  const nx = Math.ceil(X / g);
  const gx = X / nx;
  const ny = Math.ceil(S / g) + 1;
  const gy = S / (ny - 1);
  const e = Math.ceil(nx / 8);
  const w = nx + 2 * e + 2;
  const h = ny + 2;
  const f = new Float32Array(w * h).fill(0.5);
  const row = new Float32Array(nx);
  for (let j = 0; j < ny; j++) {
    const s = j * gy;
    for (let i = 0; i < nx; i++) {
      const l = look(s, (i * gx) / R);
      let solid = 1;
      if (l.room > 0) {
        const pat = t ? (cut ? 1 - l.pat : l.pat) : 1;
        solid = 1 - l.room * (1 - pat);
      }
      row[i] = Math.max(solid, l.keep) - 0.5;
    }
    for (let c = 1; c < w - 1; c++) f[(j + 1) * w + c] = row[(((c - 1 - e) % nx) + nx) % nx]!;
  }
  const loops = isolines(f, w, h, -(e + 1) * gx, -gy, gx, gy);
  let wall = ctx.cs([rect(X, S)]).translate([X / 2, S / 2]);
  if (loops.length) {
    // Holes too narrow to print clean are left closed.
    const holes = ctx.cs(loops, 'EvenOdd').offset(-0.35, 'Round', 2, 12).offset(0.35, 'Round', 2, 12);
    wall = wall.subtract(holes);
  }
  wall = wall.simplify(g / 10);
  // Keep the piece that holds together; loose bits would print in mid-air.
  const pieces = wall.decompose();
  if (pieces.length > 1) {
    pieces.sort((a, b) => b.area() - a.area());
    const total = pieces.reduce((a, q) => a + q.area(), 0);
    wall = pieces[0]!;
    // Specks where the pattern runs together are dropped quietly; say so when it's more.
    const loose = pieces.length - 1;
    if (total - wall.area() > total * 0.02) notes.push({ level: 'warning', message: `${loose} loose piece${loose > 1 ? 's' : ''} of the pattern left out, as nothing holds ${loose > 1 ? 'them' : 'it'} up. Try thicker lines, or toggle "Engrave instead of emboss".` });
  }
  if (ribs && (ribs.u || ribs.v)) notes.push({ level: 'info', message: `This pattern's lines don't join up ${ribs.u && ribs.v ? 'either way' : ribs.u ? 'round the bauble' : 'up the bauble'}, so lace adds thin ribs along the tile edges to hold it together.` });
  if (cut && !p.engrave && t) notes.push({ level: 'info', message: 'This pattern is separate shapes, so lace cuts them out of the wall.' });

  const sign = p.artStyle === 'engrave' ? -1 : 1;
  const wrap = (m: Manifold) =>
    m.warpBatch((v, n) => {
      for (let k = 0; k < n; k++) {
        const x = v[3 * k]!;
        const y = v[3 * k + 1]!;
        const z = v[3 * k + 2]!;
        const th = x / R;
        const q = tr.at(y);
        let d = 0;
        if (q.z > neckZ + 0.2) d = q.nr > 0.9 ? thread(q.z, th) : 0;
        else if (art) {
          const l = look(y, th);
          if (l.ink > 0) d = sign * Math.min(p.depth, sign < 0 ? T - 0.4 : p.depth) * l.ink;
        }
        const off = z - T + (z / T) * d;
        const r = q.r + off * q.nr;
        v[3 * k] = r * Math.cos(th);
        v[3 * k + 1] = r * Math.sin(th);
        v[3 * k + 2] = q.z + off * q.nz;
      }
    });
  // Four pieces, overlapping a little so they fuse: two halves round, the neck finer for its
  // thread. (Pieces that only touched face to face would stay separate shells.)
  const sCut = Math.max(0, sNeck - 1.5);
  const ov = 0.5;
  const box = (x0: number, x1: number, y0: number, y1: number): CrossSection => ctx.cs([rect(x1 - x0, y1 - y0)]).translate([(x0 + x1) / 2, (y0 + y1) / 2]);
  const round = ctx.CrossSection.union([wall.translate([-X, 0]), wall, wall.translate([X, 0])]);
  const out: Manifold[] = [];
  for (const [x0, x1] of [[-ov, X / 2 + ov], [X / 2 - ov, X + ov]] as const)
    for (const [y0, y1, edge] of [[0, sCut + ov, meshEdge], [sCut - ov, S, 0.15]] as const) {
      const part = round.intersect(box(x0, x1, y0, y1));
      if (part.isEmpty()) continue;
      // Refined as it will be round the bauble: x shrinks to the neck's girth on the neck.
      const k = y0 > 0 ? Math.max(0.05, tr.at(y0).r / R) : 1;
      out.push(wrap(ctx.extrude(part, T).scale([k, 1, 1]).refineToLength(edge).scale([1 / k, 1, 1])));
    }
  return ctx.union(out);
}
