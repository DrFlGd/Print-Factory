import { defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { encodeMesh, prepareMesh } from '@pf/mesh';
import { withTracking } from '@pf/engine-manifold';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build, MX } from '../src/build';

const base = { ...(defaults(params as ParamSchema) as unknown as Params), source: 'model' as const };
const run = async (over: Partial<Params> = {}, inputs: Record<string, unknown> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over }, inputs);
const errors = (r: BuildResult) => (r.diagnostics ?? []).filter((d) => d.level === 'error').map((d) => d.message);
const warnings = (r: BuildResult) => (r.diagnostics ?? []).filter((d) => d.level === 'warning').map((d) => d.message);
const named = (r: BuildResult, n: string) => r.parts.find((p) => p.name === n)!;

async function solid(p: Part, dz = 0) {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  const m = wasm.Manifold.ofMesh(mesh);
  expect(m.status(), p.name).toBe('NoError');
  return dz ? m.translate([0, 0, dz]) : m;
}
/** Volume the moving piece shares with the still one, at rest and fully pressed. */
async function clash(r: BuildResult, still: string, moving: string): Promise<[number, number]> {
  const a = await solid(named(r, `${still} (assembled)`));
  const rest = await solid(named(r, `${moving} (assembled)`));
  const pressed = await solid(named(r, `${moving} (assembled)`), -MX.travel);
  return [a.intersect(rest).volume(), a.intersect(pressed).volume()];
}

describe('model mode', () => {
  it('slices the built-in model with room for the switch, the gap hidden', async () => {
    const r = await run({ cutter: 'slice' });
    expect(errors(r)).toEqual([]);
    expect(warnings(r)).toEqual([]);
    expect(r.summary).toMatch(/gap hidden/);
    const [rest, pressed] = await clash(r, 'Bottom', 'Top');
    expect(rest).toBeLessThan(0.5);
    expect(pressed).toBeLessThan(0.5);
    for (const n of ['Bottom', 'Top']) expect((await solid(named(r, n))).decompose().length, n).toBe(1);
  });

  it('slices with a plain gap at a chosen height', async () => {
    const r = await run({ cutter: 'slice', hideGap: false, cutHeight: 22 });
    expect(errors(r)).toEqual([]);
    expect(r.summary).toMatch(/Cut at 22\.0/);
    const [rest, pressed] = await clash(r, 'Bottom', 'Top');
    expect(rest + pressed).toBeLessThan(0.5);
  });

  it('stands the model on a plate in a base', async () => {
    const r = await run({ cutter: 'stand' });
    expect(errors(r)).toEqual([]);
    const [rest, pressed] = await clash(r, 'Base', 'Model on its plate');
    expect(rest + pressed).toBeLessThan(0.5);
    for (const shape of ['square', 'outline'] as const) expect(errors(await run({ cutter: 'stand', standShape: shape }))).toEqual([]);
  });

  it('cuts a button into the top that the switch goes in through', async () => {
    const r = await run({ cutter: 'button' });
    expect(errors(r)).toEqual([]);
    const [rest, pressed] = await clash(r, 'Body', 'Button');
    expect(rest + pressed).toBeLessThan(0.5);
    const raised = await run({ cutter: 'button', buttonShape: 'square', buttonSize: 20, buttonRaise: 2 });
    expect(errors(raised)).toEqual([]);
  });

  it('makes a clicker of an uploaded model, whatever way up it was drawn', async () => {
    const wasm = await loadManifold();
    // A ball drawn lying on its side (Y up), as if from another program.
    const stored = withTracking(wasm, () => {
      const s = wasm.Manifold.sphere(30, 96).scale([1, 0.8, 1]);
      const g = s.getMesh();
      const p = prepareMesh(wasm, { positions: new Float32Array(g.vertProperties), indices: new Uint32Array(g.triVerts) }, 'ball.stl');
      return encodeMesh(p.mesh, p.info);
    });
    const r = await run({ cutter: 'slice', modelUp: 'y', modelSize: 50 }, { model: JSON.parse(JSON.stringify(stored)) });
    expect(errors(r)).toEqual([]);
    expect((r.diagnostics ?? []).some((d) => /toadstool/.test(d.message))).toBe(false);
    const b = partBounds([named(r, 'Bottom (assembled)'), named(r, 'Top (assembled)')]);
    // 0.8 of 50 across Y once Y points up, and flattened a little to stand.
    expect(b.max[2] - b.min[2]).toBeLessThan(40 + MX.travel + 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(50, 0);
  });

  it('says when a slice has no room for the switch', async () => {
    const r = await run({ cutter: 'slice', modelSize: 22 });
    expect(errors(r).length).toBe(1);
    expect(r.parts).toEqual([]);
  });
});
