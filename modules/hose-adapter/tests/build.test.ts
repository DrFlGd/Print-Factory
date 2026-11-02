import { defaults } from '@pf/core';
import type { ParamSchema, Part } from '@pf/core';
import type { Manifold, ManifoldToplevel } from '@pf/engine-manifold';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { beforeAll, describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build, CLEARANCE, endProfile } from '../src/build';

const base = defaults(params as ParamSchema) as unknown as Params;
let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await loadManifold();
});

const run = (over: Partial<Params>) => runBuild(wasm, build, { ...base, ...over });
const solid = (p: Part): Manifold => new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices }));

/** The radius of the bore or the outside at height z: the section's extent along +x. */
function radiusAt(m: Manifold, z: number, which: 'inner' | 'outer'): number {
  const polys = m.slice(z).toPolygons() as unknown as [number, number][][];
  const rs = polys.map((poly) => Math.max(...poly.map(([x, y]) => Math.hypot(x, y))));
  rs.sort((a, b) => a - b);
  return which === 'outer' ? rs[rs.length - 1]! : rs[0]!;
}

describe('hose-adapter', () => {
  it('makes one hollow piece, end A on the bed, as long as its parts', async () => {
    const r = await run({});
    const m = solid(r.parts[0]!);
    expect(m.decompose().length).toBe(1);
    expect(m.genus()).toBe(1);
    const b = m.boundingBox();
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]).toBeGreaterThanOrEqual(base.aLength + base.bLength + base.transition - 1e-6);
  });

  it('sizes a socket and a spigot to what they fit, at mid-length', async () => {
    const r = await run({ taper: 0 });
    const m = solid(r.parts[0]!);
    const H = m.boundingBox().max[2];
    const c = CLEARANCE[base.fit];
    // A socket's bore is the pipe plus the clearance; a spigot's outside the hole less it.
    expect(radiusAt(m, base.aLength / 2, 'inner')).toBeGreaterThan(base.aDia / 2 + c - 0.05);
    expect(radiusAt(m, base.aLength / 2, 'inner')).toBeLessThan(base.aDia / 2 + c + 0.05);
    expect(radiusAt(m, H - base.bLength / 2, 'outer')).toBeLessThan(base.bDia / 2 - c + 0.01);
    expect(radiusAt(m, H - base.bLength / 2, 'outer')).toBeGreaterThan(base.bDia / 2 - c - 0.05);
  });

  it('never changes size faster than 45° in the middle', async () => {
    const r = await run({ aDia: 100, bDia: 20, transition: 0 });
    const m = solid(r.parts[0]!);
    const z0 = base.aLength;
    const H = m.boundingBox().max[2];
    const T = H - base.aLength - base.bLength;
    for (const which of ['inner', 'outer'] as const) {
      const d = radiusAt(m, z0 + 0.01, which) - radiusAt(m, z0 + T - 0.01, which);
      expect(Math.abs(d)).toBeLessThanOrEqual(T + 0.05);
    }
  });

  it('puts ridges on a barb that rise above the hose size', () => {
    const e = endProfile('barb', 12.7, 28, 2, 'standard', 0);
    const peak = Math.max(...e.outer.map(([, r]) => r));
    expect(peak).toBeGreaterThan(12.7 / 2 + 0.6);
    expect(e.outer.filter(([, r]) => r === peak).length).toBeGreaterThanOrEqual(2);
    // Each ridge's back face drops at 45° or less.
    for (let i = 1; i < e.outer.length; i++) {
      const [s0, r0] = e.outer[i - 1]!;
      const [s1, r1] = e.outer[i]!;
      if (r1 < r0) expect(r0 - r1).toBeLessThanOrEqual(s1 - s0 + 1e-9);
    }
  });

  it('refuses an end too small for its wall', async () => {
    const r = await run({ bType: 'spigot', bDia: 4, wall: 3 });
    expect(r.parts).toHaveLength(0);
    expect((r.diagnostics ?? []).some((d) => d.level === 'error')).toBe(true);
  });
});
