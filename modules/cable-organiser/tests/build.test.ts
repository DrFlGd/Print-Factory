import { boundsSize, defaults, partBounds } from '@pf/core';
import type { ParamSchema } from '@pf/core';
import type { ManifoldToplevel } from '@pf/engine-manifold';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { beforeAll, describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build } from '../src/build';

const base = defaults(params as ParamSchema) as unknown as Params;
let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await loadManifold();
});

const run = (over: Partial<Params>) => runBuild(wasm, build, { ...base, ...over });
const size = (r: Awaited<ReturnType<typeof run>>) => boundsSize(partBounds(r.parts));

/** Pieces a part's mesh falls into. */
function pieces(part: { positions: Float32Array; indices: Uint32Array }): number {
  const m = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: part.positions, triVerts: part.indices }));
  return m.decompose().length;
}

describe('cable-organiser', () => {
  it('builds every product in one piece, on the bed', async () => {
    for (const product of ['holder', 'desk', 'winder', 'tag'] as const) {
      const r = await run({ product });
      expect(r.parts.length).toBeGreaterThan(0);
      for (const p of r.parts) {
        if (p.name !== 'Text') expect(pieces(p), `${product} ${p.name}`).toBe(1);
      }
      expect(partBounds(r.parts).min[2]).toBeCloseTo(0, 3);
    }
  });

  it('grows the holder with the number of cables', async () => {
    const one = size(await run({ cables: 1 }));
    const four = size(await run({ cables: 4 }));
    // Each extra ring adds its bore and a wall, less the share neighbours have in common.
    expect(four[0] - one[0]).toBeCloseTo(3 * (base.cableDia + 0.3 + 4 + base.spacing - 1.2), 1);
    expect(four[2]).toBeCloseTo(base.width, 3);
  });

  it('widens a screw-on holder to take the heads', async () => {
    const r = await run({ mount: 'screw', width: 6 });
    expect(size(r)[2]).toBeGreaterThanOrEqual(11.4 - 1e-6);
    expect((r.diagnostics ?? []).some((d) => /screw heads/.test(d.message))).toBe(true);
  });

  it('opens the desk clip to the desk thickness', async () => {
    const r = await run({ product: 'desk', deskThickness: 20 });
    // Two 3 mm jaws round a 19.8 mm gap, rings below.
    expect(size(r)[1]).toBeGreaterThan(20 + 6);
  });

  it('puts the label on the tag as a second part', async () => {
    const r = await run({ product: 'tag', label: 'HDMI' });
    expect(r.parts.map((p) => p.name)).toEqual(['Tag', 'Text']);
    const blank = await run({ product: 'tag', label: '' });
    expect(blank.parts.map((p) => p.name)).toEqual(['Tag']);
  });
});
