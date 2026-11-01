/**
 * Bauble outlines (radius against height), and how they are made printable upright: no wall
 * leans further than the overhang limit, a flat foot to stand on, a neck for the cap.
 */
import type { Pt } from './lathe';

export const SHAPES = ['sphere', 'egg', 'teardrop', 'onion', 'lantern', 'spinning-top', 'icicle', 'tree', 'bell', 'jingle-bell'] as const;
export type Shape = (typeof SHAPES)[number] | 'custom';

/** A custom outline: where the widest point is (0–1 up) and how full each end is (2 round, under 1 pointed). */
export interface Custom {
  bulge: number;
  top: number;
  bottom: number;
  aspect: number;
}

/** Height for width, before the elongation. */
const ASPECT: Record<Exclude<Shape, 'custom'>, number> = {
  sphere: 1,
  egg: 1.28,
  teardrop: 1.45,
  onion: 1.3,
  lantern: 1.3,
  'spinning-top': 0.95,
  icicle: 2.8,
  tree: 1.35,
  bell: 1.05,
  'jingle-bell': 1,
};

/** The radius at fraction u of the height (0 bottom, 1 top), for a shape 1 wide at its widest. */
function radius(shape: Shape, u: number, c?: Custom): number {
  const s = Math.sin(Math.PI * u);
  const w = 2 * u - 1;
  switch (shape) {
    case 'sphere':
      return s;
    case 'egg':
      return s * (1 - 0.14 * w);
    case 'teardrop':
      return s * Math.sin((Math.PI * (1 - u)) / 2) ** 1.3;
    case 'onion':
      return u < 0.55 ? Math.sin((Math.PI * u) / 1.1) : Math.cos(((u - 0.55) / 0.45) * (Math.PI / 2)) ** 1.6;
    case 'lantern':
      return (1 - Math.abs(w) ** 5) ** 0.3;
    case 'spinning-top':
      return u < 0.62 ? (u / 0.62) ** 0.85 : ((1 - u) / 0.38) ** 0.55;
    case 'icicle':
      return s * Math.sin((Math.PI * u) / 2) ** 2.4;
    case 'tree': {
      // Three tiers, each a cone, smaller going up.
      const tiers = 3;
      const k = Math.min(tiers - 1, Math.floor(u * tiers));
      const f = u * tiers - k;
      const tier = 1 - k * 0.24;
      return Math.max(0, tier * (1 - f * 0.55) * (u > 0.96 ? (1 - u) / 0.04 : 1));
    }
    case 'bell': {
      // A flared mouth, a waist, a domed crown.
      if (u < 0.12) return 0.86 + 0.14 * (u / 0.12);
      if (u < 0.75) return 1 - 0.45 * ((u - 0.12) / 0.63) ** 0.8;
      return 0.55 * Math.cos(((u - 0.75) / 0.25) * (Math.PI / 2)) ** 0.6;
    }
    case 'custom': {
      const b = Math.min(0.85, Math.max(0.15, c?.bulge ?? 0.5));
      const t = u < b ? (b - u) / b : (u - b) / (1 - b);
      const n = Math.max(0.4, u < b ? (c?.bottom ?? 2) : (c?.top ?? 2));
      return Math.max(0, 1 - Math.min(1, t) ** n) ** (1 / n);
    }
    case 'jingle-bell': {
      // A sphere with a raised band round its middle.
      const band = Math.abs(u - 0.47) < 0.035 ? 0.045 : 0;
      return s * 0.955 + band * s;
    }
  }
}

export interface Outline {
  /** From the axis at the foot, up the outside, to the axis at the top of the neck. */
  pts: Pt[];
  /** Where the body ends and the neck begins. */
  neckZ: number;
  height: number;
  /** The widest radius and its height. */
  rMax: number;
  zMax: number;
}

/**
 * The outline of a shape `D` wide, made printable upright: the smallest outline that contains
 * the shape and never leans more than `overhang` from the vertical, cut off at a flat foot of
 * `foot` diameter and at the neck.
 */
export function outline(shape: Shape, D: number, elongation: number, overhang: number, foot: number, neckD: number, neckH: number, custom?: Custom): Outline {
  const R = D / 2;
  const H = D * (shape === 'custom' ? (custom?.aspect ?? 1) : ASPECT[shape]) * Math.max(0.4, elongation);
  const k = Math.tan((Math.min(70, Math.max(20, overhang)) * Math.PI) / 180);
  const dz = 0.2;
  // Sample the shape, with room below and above for the cones that make it printable.
  const pad = R / k + 1;
  const z0 = -pad;
  const n = Math.ceil((H + 2 * pad) / dz);
  const raw: number[] = [];
  for (let i = 0; i <= n; i++) {
    const z = z0 + i * dz;
    raw.push(z < 0 || z > H ? 0 : radius(shape, z / H, custom));
  }
  const peak = Math.max(...raw) || 1;
  for (let i = 0; i <= n; i++) raw[i] = (raw[i]! / peak) * R;
  // The upper envelope of slope k: two sweeps.
  const env = raw.slice();
  for (let i = 1; i <= n; i++) env[i] = Math.max(env[i]!, env[i - 1]! - k * dz);
  for (let i = n - 1; i >= 0; i--) env[i] = Math.max(env[i]!, env[i + 1]! - k * dz);
  // The foot: the lowest height at which the outline is the foot's radius wide.
  const rf = Math.max(1, foot / 2);
  const rn = neckD / 2;
  let lo = 0;
  while (lo < n && env[lo]! < rf) lo++;
  let hi = n;
  while (hi > 0 && env[hi]! < rn) hi--;
  // Where exactly the outline is the foot's and the neck's width, between samples.
  const cross = (i: number, j: number, r: number) => {
    const a = env[i]!;
    const b = env[j]!;
    return Math.abs(b - a) < 1e-12 ? 0 : Math.max(0, Math.min(1, (r - a) / (b - a)));
  };
  const zFoot = lo > 0 ? z0 + (lo - 1 + cross(lo - 1, lo, rf)) * dz : z0;
  const zNeck = hi < n ? z0 + (hi + cross(hi, hi + 1, rn)) * dz : z0 + n * dz;
  const pts: Pt[] = [[0, 0], [rf, 0]];
  let rMax = 0;
  let zMax = 0;
  for (let i = lo; i <= hi; i++) {
    const r = env[i]!;
    const z = z0 + i * dz - zFoot;
    if (z < 0.01 || z > zNeck - zFoot - 0.01) continue;
    pts.push([r, z]);
    if (r > rMax) [rMax, zMax] = [r, z];
  }
  const neckZ = zNeck - zFoot;
  pts.push([rn, neckZ], [rn, neckZ + neckH], [0, neckZ + neckH]);
  return { pts: simplify(pts), neckZ, height: neckZ + neckH, rMax, zMax };
}

/** Drops points on straight runs (the cones) so the mesh is no denser than it needs to be there. */
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cross) > 1e-4 || Math.hypot(b[0] - a[0], b[1] - a[1]) > 4) out.push(b);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}
