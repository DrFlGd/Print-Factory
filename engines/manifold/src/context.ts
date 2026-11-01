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
