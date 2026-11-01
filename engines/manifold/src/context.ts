/**
 * The build context a Manifold module's `build()` receives.
 *
 * It wraps manifold-3d with the handful of conversions every generator needs (contours to a
 * CrossSection, an extrusion that starts on the bed, a Manifold to a `Part`), and tracks
 * every WebAssembly object created during the build so they can all be freed afterwards.
 * Leaking them is not cosmetic: the WebAssembly heap only grows, and a slider dragged for a
 * minute can exhaust it.
 */
import type { BuildResult, Contour, Part, PartRole, ParamValues, RGB } from '@pf/core';
import { clean } from '@pf/shapes';
import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { cleanup, garbageCollectFunction, garbageCollectManifold } from 'manifold-3d/lib/garbage-collector.js';

export type { CrossSection, Manifold, ManifoldToplevel };

export type FillRule = 'EvenOdd' | 'NonZero' | 'Positive' | 'Negative';
export type JoinType = 'Square' | 'Round' | 'Miter';

export interface EdgeOptions {
  /** Size of the top edge treatment, mm (0 = square). */
  top?: number;
  /** Size of the bottom edge treatment, mm (0 = square). */
  bottom?: number;
  style?: 'chamfer' | 'round';
  /** Height of the bottom face (default 0). */
  z0?: number;
  /** Slab height (default 0.1 mm). */
  step?: number;
}

export interface ManifoldContext<P = ParamValues> {
  params: P;
  inputs: Record<string, unknown>;
  wasm: ManifoldToplevel;
  Manifold: ManifoldToplevel['Manifold'];
  CrossSection: ManifoldToplevel['CrossSection'];
  /** Contours (flat [x, y, …]) to a CrossSection. Overlaps are unioned per the fill rule. */
  cs(contours: Contour[], fillRule?: FillRule): CrossSection;
  /** Extrudes a section straight up from `z0` (default the bed). */
  extrude(section: CrossSection | Contour[], height: number, z0?: number): Manifold;
  /**
   * Extrudes with the top and/or bottom edge chamfered or rounded. Built from thin slabs
   * (0.1 mm by default, finer than any layer) that overlap a hair so they fuse into one solid.
   */
  edged(section: CrossSection, height: number, opts: EdgeOptions): Manifold;
  /** Offsets a section outwards (positive) or inwards (negative). */
  offset(section: CrossSection | Contour[], delta: number, join?: JoinType): CrossSection;
  /** A section back to contours. */
  contours(section: CrossSection): Contour[];
  /** Union of many, skipping empties; an empty Manifold for none. */
  union(items: Manifold[]): Manifold;
  /** A finished solid as a `Part`. Empty solids give `null`. */
  part(m: Manifold, name: string, color: RGB, opts?: { group?: string; role?: PartRole }): Part | null;
  /** Ignore the WebAssembly memory of objects you will free yourself (rarely needed). */
  log(text: string): void;
}

let collecting = false;

/** Turns on tracking for the methods manifold-3d's own collector misses. */
function track(wasm: ManifoldToplevel): void {
  if (collecting) return;
  garbageCollectManifold(wasm);
  const proto = wasm.CrossSection.prototype as unknown as Record<string, unknown>;
  for (const name of ['extrude', 'revolve']) {
    if (typeof proto[name] === 'function') proto[name] = garbageCollectFunction(proto[name]);
  }
  collecting = true;
}

export function meshToPart(m: Manifold, name: string, color: RGB, opts: { group?: string; role?: PartRole } = {}): Part | null {
  if (m.isEmpty()) return null;
  const mesh = m.getMesh();
  const stride = mesh.numProp;
  const src = mesh.vertProperties;
  const count = src.length / stride;
  const positions = new Float32Array(count * 3);
  if (stride === 3) positions.set(src);
  else
    for (let i = 0; i < count; i++) {
      positions[i * 3] = src[i * stride]!;
      positions[i * 3 + 1] = src[i * stride + 1]!;
      positions[i * 3 + 2] = src[i * stride + 2]!;
    }
  const indices = new Uint32Array(mesh.triVerts);
  const part: Part = { name, positions, indices, color };
  if (opts.group) part.group = opts.group;
  if (opts.role) part.role = opts.role;
  return part;
}

export function createContext<P>(wasm: ManifoldToplevel, params: P, inputs: Record<string, unknown>, log: (t: string) => void = () => {}): ManifoldContext<P> {
  track(wasm);
  const { Manifold, CrossSection } = wasm;
  const toSection = (s: CrossSection | Contour[], rule: FillRule = 'NonZero'): CrossSection => {
    if (!Array.isArray(s)) return s;
    const cs = clean(s).map((c) => {
      const pts: [number, number][] = [];
      for (let i = 0; i < c.length; i += 2) pts.push([c[i]!, c[i + 1]!]);
      return pts;
    });
    if (!cs.length) return CrossSection.union([]);
    return CrossSection.ofPolygons(cs, rule);
  };
  return {
    params,
    inputs,
    wasm,
    Manifold,
    CrossSection,
    cs: toSection,
    extrude(section, height, z0 = 0) {
      const s = toSection(section);
      if (height <= 0 || s.isEmpty()) return Manifold.union([]);
      const m = Manifold.extrude(s, height);
      return z0 ? m.translate([0, 0, z0]) : m;
    },
    edged(section, height, opts) {
      const style = opts.style ?? 'chamfer';
      const z0 = opts.z0 ?? 0;
      const top = Math.max(0, Math.min(opts.top ?? 0, height / 2 - 0.01));
      const bottom = Math.max(0, Math.min(opts.bottom ?? 0, height / 2 - 0.01));
      if (height <= 0 || section.isEmpty()) return Manifold.union([]);
      const b = bottom >= 0.05 ? bottom : 0;
      const t = top >= 0.05 ? top : 0;
      if (!b && !t) return this.extrude(section, height, z0);
      const warped = warpEdges(Manifold, section, height, b, t, style, opts.step ?? 0.1);
      if (warped && warped.status() === 'NoError' && !warped.isEmpty()) return z0 ? warped.translate([0, 0, z0]) : warped;
      return slabEdges(Manifold, this, section, height, b, t, style, z0, opts.step ?? 0.1);
    },
    offset(section, delta, join = 'Round') {
      const s = toSection(section);
      if (delta === 0) return s;
      return s.offset(delta, join, 2, 48);
    },
    contours(section) {
      return section.toPolygons().map((poly) => {
        const out: number[] = [];
        for (const [x, y] of poly as unknown as [number, number][]) out.push(x, y);
        return out;
      });
    },
    union(items) {
      const live = items.filter((m) => !m.isEmpty());
      if (!live.length) return Manifold.union([]);
      if (live.length === 1) return live[0]!;
      return Manifold.union(live);
    },
    part: meshToPart,
    log,
  };
}

/** How far in the outline is at depth k (0 at the face) into an edge band of size c. */
function edgeInset(style: 'chamfer' | 'round', c: number, k: number): number {
  if (c <= 0) return 0;
  return style === 'round' ? c - Math.sqrt(Math.max(0, c * c - (c - k) ** 2)) : Math.max(0, c - k);
}

/**
 * The edge as a warped extrusion: rings at the band heights, every vertex moved inward
 * along its corner bisector by the profile, never more than 45 % of the material in front
 * of it (so a thin stroke rounds a little instead of folding through itself).
 */
function warpEdges(M: ManifoldToplevel['Manifold'], section: CrossSection, height: number, bottom: number, top: number, style: 'chamfer' | 'round', step: number): Manifold | null {
  const polys = section.toPolygons() as unknown as [number, number][][];
  const edges: [number, number, number, number][] = [];
  for (const poly of polys) for (let i = 0; i < poly.length; i++) edges.push([poly[i]![0], poly[i]![1], poly[(i + 1) % poly.length]![0], poly[(i + 1) % poly.length]![1]]);
  const key = (x: number, y: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
  const moves = new Map<string, { dx: number; dy: number; max: number }>();
  for (const poly of polys) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[(i + n - 1) % n]!;
      const c = poly[i]!;
      const d = poly[(i + 1) % n]!;
      let e1x = c[0] - a[0];
      let e1y = c[1] - a[1];
      let e2x = d[0] - c[0];
      let e2y = d[1] - c[1];
      const l1 = Math.hypot(e1x, e1y) || 1;
      const l2 = Math.hypot(e2x, e2y) || 1;
      e1x /= l1;
      e1y /= l1;
      e2x /= l2;
      e2y /= l2;
      // Left normals point into the material for outer loops and holes alike.
      const n1x = -e1y;
      const n1y = e1x;
      let bx = n1x - e2y;
      let by = n1y + e2x;
      const bl = Math.hypot(bx, by);
      if (bl < 1e-9) {
        bx = n1x;
        by = n1y;
      } else {
        bx /= bl;
        by /= bl;
      }
      const miter = 1 / Math.max(0.5, bx * n1x + by * n1y);
      // Material in front of the vertex along the bisector.
      let room = Infinity;
      for (const [x0, y0, x1, y1] of edges) {
        const ex = x1 - x0;
        const ey = y1 - y0;
        const cross = bx * ey - by * ex;
        if (Math.abs(cross) < 1e-12) continue;
        const ox = x0 - c[0];
        const oy = y0 - c[1];
        const tt = (ox * ey - oy * ex) / cross;
        const u = (ox * by - oy * bx) / cross;
        if (tt > 1e-6 && u >= 0 && u <= 1 && tt < room) room = tt;
      }
      moves.set(key(c[0], c[1]), { dx: bx * miter, dy: by * miter, max: (0.45 * room) / miter });
    }
  }
  const nb = bottom ? (style === 'round' ? Math.max(2, Math.round(bottom / step)) : 1) : 0;
  const nt = top ? (style === 'round' ? Math.max(2, Math.round(top / step)) : 1) : 0;
  const N = nb + 1 + nt;
  let missed = 0;
  const m = M.extrude(section, height, N - 1).warp((v) => {
    const i = Math.round((v[2] / height) * N);
    let z: number;
    let inset: number;
    if (i <= nb && nb) {
      z = (bottom * i) / nb;
      inset = edgeInset(style, bottom, z);
    } else if (i >= N - nt && nt) {
      const j = N - i;
      const k = (top * j) / nt;
      z = height - k;
      inset = edgeInset(style, top, k);
    } else {
      z = i <= nb ? bottom : height - top;
      inset = 0;
    }
    if (!nb && i === 0) z = 0;
    if (!nt && i === N) z = height;
    const mv = moves.get(key(v[0], v[1]));
    if (!mv) missed++;
    else if (inset > 0) {
      const d = Math.min(inset, mv.max);
      v[0] += mv.dx * d;
      v[1] += mv.dy * d;
    }
    v[2] = z;
  });
  return missed ? null : m;
}

/** Fallback: thin slabs that overlap a hair so they fuse. */
function slabEdges(M: ManifoldToplevel['Manifold'], ctx: { extrude(s: CrossSection, h: number, z0?: number): Manifold }, section: CrossSection, height: number, b: number, t: number, style: 'chamfer' | 'round', z0: number, step: number): Manifold {
  const e = 0.002;
  const slabs: Manifold[] = [ctx.extrude(section, height - b - t + (b ? e : 0) + (t ? e : 0), z0 + b - (b ? e : 0))];
  const band = (c: number, fromTop: boolean) => {
    const n = Math.max(2, Math.round(c / step));
    for (let i = 0; i < n; i++) {
      const s = section.offset(-edgeInset(style, c, ((i + 0.5) * c) / n), 'Round', 2, 24);
      if (s.isEmpty()) continue;
      const z = fromTop ? z0 + height - ((i + 1) * c) / n : z0 + (i * c) / n;
      const lo = fromTop || i > 0 ? z - e : z;
      const hi = !fromTop || i > 0 ? z + c / n + e : z + c / n;
      slabs.push(ctx.extrude(s, hi - lo, lo));
    }
  };
  if (b) band(b, false);
  if (t) band(t, true);
  return M.union(slabs);
}

export type BuildFn<P = ParamValues> = (ctx: ManifoldContext<P>) => BuildResult | Promise<BuildResult>;

/** Runs one build and frees everything it created, whether it succeeded or threw. */
export async function runBuild<P>(wasm: ManifoldToplevel, build: BuildFn<P>, params: P, inputs: Record<string, unknown> = {}, log?: (t: string) => void): Promise<BuildResult> {
  const ctx = createContext(wasm, params, inputs, log);
  try {
    const result = await build(ctx);
    // Parts own plain typed arrays already; nothing in the result points into the heap.
    return result;
  } finally {
    cleanup();
  }
}
