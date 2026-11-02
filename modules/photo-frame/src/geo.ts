/** Shared geometry: side profiles run along x, the lean, and the groove block a print or frame stands in. */
import type { CrossSection, Manifold } from '@pf/engine-manifold';
import type { Ctx } from './types';

export const LEAN = 15;
const RAD = Math.PI / 180;
export const SIN = Math.sin(LEAN * RAD);
export const COS = Math.cos(LEAN * RAD);
export const TAN = Math.tan(LEAN * RAD);

/**
 * A side profile drawn in (u, v) run along x from x0 to x1: the solid has y = u and z = v.
 * (A cyclic swap of the axes, so nothing is mirrored.)
 */
export function prism(ctx: Ctx, profile: CrossSection | [number, number][], x0: number, x1: number): Manifold {
  const cs = Array.isArray(profile) ? ctx.cs([profile.flat()]) : profile;
  const m = ctx.extrude(cs, x1 - x0);
  return m.warp((v) => {
    const [a, b, c] = [v[0], v[1], v[2]];
    v[0] = c + x0;
    v[1] = a;
    v[2] = b;
  });
}

/** A section in the (x, v) plane, `depth` deep in y from y0: a front face's inlay or a shape seen from the front. */
export function face(ctx: Ctx, cs: CrossSection, y0: number, depth: number): Manifold {
  const m = ctx.extrude(cs, depth);
  // (x, v, w) → (x, y0 + depth − w, v): a quarter turn about x, so the front reads right.
  return m.warp((v) => {
    const [a, b, c] = [v[0], v[1], v[2]];
    v[0] = a;
    v[1] = y0 + depth - c;
    v[2] = b;
  });
}

export interface Groove {
  /** Depth front to back, height of the block, length along x. */
  D: number;
  hb: number;
  L: number;
  /** The slot: its width across the lean, its floor's centre (u, v), its length. */
  s: number;
  u0: number;
  v0: number;
  slotLength: number;
  /** Where something standing in it touches: the front wall's foot. */
  rest: [number, number];
}

/**
 * The block something `H` tall and `width` wide stands in, leaning back 15°: low with a heel
 * behind (a base or a ledge), or tall (a block the frame stands deep in). `s` is the slot's width.
 */
export function groove(H: number, width: number, s: number, o: { block?: boolean; tall?: boolean; flush?: boolean } = {}): Groove {
  const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
  const block = !!o.block;
  const hb = block ? clamp(Math.round(10 + H / 18), 13, 22) : o.tall ? clamp(Math.round(9 + H / 22), 12, 17) : clamp(Math.round(6 + H / 30), 8, 14);
  const dk = block ? Math.max(8, H / 11) : Math.max(6, H / 15);
  // The slot's floor, square to the lean, its middle `dk` down the slot from the top.
  const v0 = Math.max(1.6, hb - dk * COS);
  // The front wall keeps 4 mm at the slot's foot, so it is thicker at the top.
  const toe = 4 + TAN * (hb - v0);
  // The front wall's top edge is `toe` back from the front.
  const u0 = toe - TAN * (hb - v0 - SIN * (s / 2)) + COS * (s / 2);
  const heel = block ? Math.max(6, 0.15 * H) : Math.max(8, 0.18 * H);
  const D = toe + s / COS + heel;
  const flush = !!o.flush;
  const slotLength = flush ? width + 20 : width + 0.6;
  const L = flush ? width : width + 0.6 + 10;
  const rest: [number, number] = [u0 - (s / 2) * COS, v0 + (s / 2) * SIN];
  return { D, hb, L, s, u0, v0, slotLength, rest };
}

/** The slot's cutter in (u, v): a rectangle `s` wide leaning back 15°, from its floor up past the top. */
export function slotProfile(g: Groove): [number, number][] {
  const n: [number, number] = [COS, -SIN];
  const d: [number, number] = [SIN, COS];
  const up = 80;
  const P = (a: number, b: number): [number, number] => [g.u0 + n[0] * a + d[0] * b, g.v0 + n[1] * a + d[1] * b];
  return [P(-g.s / 2, 0), P(g.s / 2, 0), P(g.s / 2, up), P(-g.s / 2, up)];
}
