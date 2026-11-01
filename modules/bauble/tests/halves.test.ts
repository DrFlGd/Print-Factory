import { boundsSize, defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import { grooveWave, isolines, lightHoleSize, RING } from '../src/bauble';
import type { Params } from '../src/build';
import { build, FLAT_SHAPES, SHAPES, THEMES, threadWave, TOPPERS } from '../src/build';
import { connectivity, mask, tile } from '../src/patterns';
import { outline } from '../src/shapes';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });
const named = (r: BuildResult, name: string) => r.parts.find((p) => p.name === name)!;
async function solid(p: Part) {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  return wasm.Manifold.ofMesh(mesh);
}

describe('two halves', () => {
  it('prints both halves rim down, with a ring that fits inside the rims', async () => {
    const r = await run({ shape: 'halves', resolution: 'draft' });
    for (const name of ['Top half', 'Bottom half', 'Ring', 'Cap']) expect(partBounds([named(r, name)]).min[2], name).toBeCloseTo(0, 3);
    const top = await solid(named(r, 'Top half'));
    expect(top.decompose().length).toBe(1);
    // A true sphere: as wide as it is tall, below the neck.
    const b = boundsSize(partBounds([named(r, 'Bottom half')]));
    // The relief stands out of the bottom half too.
    expect(b[0]).toBeGreaterThan(70.5);
    expect(b[2]).toBeCloseTo(35, 0);
    const ring = boundsSize(partBounds([named(r, 'Ring')]));
    expect(ring[2]).toBeCloseTo(RING.h, 3);
    expect(ring[0] / 2).toBeCloseTo(35 - base.wall - base.threadClearance, 1);
    expect(r.parts.filter((p) => p.role === 'preview').map((p) => p.name)).toEqual(['Bauble (assembled)', 'Cap (assembled)']);
  });

  it('never lets the inside of a half overhang as it prints', async () => {
    const r = await run({ shape: 'halves', theme: 'plain', resolution: 'draft' });
    // Rim down, each half's inside narrows going up by at most the overhang slope: no
    // downward-facing inside surface leans past the limit.
    for (const name of ['Top half', 'Bottom half']) {
      const part = named(r, name);
      const P = part.positions;
      const I = part.indices;
      const k = Math.tan((base.overhang * Math.PI) / 180) + 0.05;
      const neck = 35 * Math.sin(Math.acos(base.neckDiameter / 2 / 35)) - 0.5;
      let worst = 0;
      for (let t = 0; t < I.length; t += 3) {
        const [a, b, c] = [I[t]!, I[t + 1]!, I[t + 2]!].map((i) => [P[3 * i]!, P[3 * i + 1]!, P[3 * i + 2]!]) as [number, number, number][];
        const ux = b![0] - a![0], uy = b![1] - a![1], uz = b![2] - a![2];
        const vx = c![0] - a![0], vy = c![1] - a![1], vz = c![2] - a![2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz);
        const z = (a![2] + b![2] + c![2]) / 3;
        // Faces pointing down, above the bed and below the neck's thread.
        if (l < 1e-9 || nz >= 0 || z < 0.5 || z > neck) continue;
        // The bottom half's inside closes with a short flat bridge.
        if (Math.abs(nz / l) > 0.999 && name === 'Bottom half') continue;
        const horiz = Math.hypot(nx, ny);
        if (horiz < 1e-9) worst = Infinity;
        else worst = Math.max(worst, -nz / horiz);
      }
      // tan of the angle from vertical of the steepest downward face.
      expect(worst, name).toBeLessThanOrEqual(k);
    }
  });
});

describe('light hole', () => {
  it('goes through the cap under an arched loop', async () => {
    const plain = await run({ resolution: 'draft' });
    const lit = await run({ lightHole: 'top', resolution: 'draft' });
    const cap = await solid(named(lit, 'Cap'));
    expect(cap.decompose().length).toBe(1);
    const capVolume = cap.volume();
    expect(capVolume).toBeLessThan((await solid(named(plain, 'Cap'))).volume() + 400);
    expect(lightHoleSize({ ...base, lightHoleDiameter: 30 })).toBeCloseTo(base.neckDiameter - 2.4, 6);
  });

  it('cuts through the side in lace, and marks it to drill in vase mode', async () => {
    const vase = await run({ lightHole: 'side', resolution: 'draft' });
    expect(vase.diagnostics?.some((d) => /drill it out/.test(d.message))).toBe(true);
    const halves = await run({ shape: 'halves', lightHole: 'side', theme: 'plain', resolution: 'draft' });
    const closed = await run({ shape: 'halves', theme: 'plain', resolution: 'draft' });
    const v1 = (await solid(named(halves, 'Bottom half'))).volume();
    const v0 = (await solid(named(closed, 'Bottom half'))).volume();
    expect(v1).toBeLessThan(v0 - 20);
  });
});
