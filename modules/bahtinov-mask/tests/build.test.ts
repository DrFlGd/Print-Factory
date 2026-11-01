import { boundsSize, defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import presets from '../presets.json';
import type { Params } from '../src/build';
import { build, grating } from '../src/build';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });

describe('bahtinov mask', () => {
  it('spaces the slits at the focal length over the factor', () => {
    const g = grating({ ...base, focalLength: 900, factor: 180, slitShare: 0.5 });
    expect(g.pitch).toBeCloseTo(5);
    expect(g.slit).toBeCloseTo(2.5);
  });

  it('fits over the tube with the clearance, the collar on top of the mask', async () => {
    const r = await run({ tab: false });
    const [w, h, z] = boundsSize(partBounds(r.parts));
    const outer = base.tubeDiameter + 2 * base.clearance + 2 * base.collarWall;
    expect(w).toBeCloseTo(outer, 0);
    expect(h).toBeCloseTo(outer, 0);
    expect(z).toBeCloseTo(base.maskThickness + base.collarDepth, 3);
  });

  it('opens about half the aperture, less the bars and the obstruction', async () => {
    const r = await run({ collarDepth: 0, tab: false });
    const wasm = await loadManifold();
    const p = r.parts[0]!;
    const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
    mesh.merge();
    const solid = wasm.Manifold.ofMesh(mesh);
    const Rout = base.tubeDiameter / 2 + base.clearance + base.collarWall;
    const open = Math.PI * Rout * Rout - solid.volume() / base.maskThickness;
    const aperture = Math.PI * (base.aperture / 2) ** 2;
    expect(open / aperture).toBeGreaterThan(0.38);
    expect(open / aperture).toBeLessThan(0.5);
  });

  it('gives a flat cut file, and warns when the grating is too fine to print', async () => {
    const r = await run({ focalLength: 300, factor: 200 });
    expect(r.drawing?.layers[0]?.contours.length).toBeGreaterThan(20);
    expect(r.diagnostics?.some((d) => d.level === 'warning')).toBe(true);
  });

  it('builds every preset', async () => {
    for (const pr of presets) expect((await run(pr.values as Partial<Params>)).parts, pr.id).toHaveLength(1);
  });
});
