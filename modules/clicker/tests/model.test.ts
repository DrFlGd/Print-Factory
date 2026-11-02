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

  it('moves and turns the switch inside a sliced model', async () => {
    const r = await run({ cutter: 'slice', switchX: 2, switchY: -1.5, switchTurn: 45 });
    expect(errors(r)).toEqual([]);
    const [rest, pressed] = await clash(r, 'Bottom', 'Top');
    expect(rest + pressed).toBeLessThan(0.5);
    // Too far out of the model: said plainly, nothing built.
    const far = await run({ cutter: 'slice', switchX: 30 });
    expect(errors(far)[0]).toMatch(/moved or turned/);
    expect(far.parts).toEqual([]);
  });

  it('moves and turns the switch under a stand, growing the plate to reach it', async () => {
    const r = await run({ cutter: 'stand', switchX: 12, switchTurn: 30 });
    expect(errors(r)).toEqual([]);
    const [rest, pressed] = await clash(r, 'Base', 'Model on its plate');
    expect(rest + pressed).toBeLessThan(0.5);
    expect((r.diagnostics ?? []).some((d) => /plate is made bigger/.test(d.message))).toBe(true);
  });

  it('pulls the pieces apart round a switch in the exploded view', async () => {
    for (const cutter of ['slice', 'button', 'stand'] as const) {
      const r = await run({ cutter, preview: 'exploded' });
      expect(errors(r)).toEqual([]);
      const names = r.parts.filter((q) => q.role === 'preview').map((q) => q.name);
      expect(names.length, cutter).toBe(3);
      const [still, sw, moving] = names.map((n) => partBounds([named(r, n)]));
      expect(names[1]).toBe('Switch (exploded)');
      // Each clear of the one below.
      expect(sw!.min[2]).toBeGreaterThan(still!.max[2]);
      expect(moving!.min[2]).toBeGreaterThan(sw!.max[2]);
    }
    const none = await run({ cutter: 'slice', preview: 'none' });
    expect(none.parts.every((q) => q.role !== 'preview')).toBe(true);
  });

  it('gives the cut a handle to drag, and says what the moving piece weighs', async () => {
    const r = await run({ cutter: 'slice' });
    const meta = r.meta as { cutter: string; ok: boolean; movingGrams: number; cutAt: number };
    expect(meta.ok).toBe(true);
    expect(r.handles?.length).toBe(1);
    const g = r.handles![0]!;
    expect(g.param).toBe('cutHeight');
    expect(g.value).toBeCloseTo(meta.cutAt, 5);
    expect(g.value).toBeGreaterThanOrEqual(g.min);
    expect(g.value).toBeLessThanOrEqual(g.max);
    // On the assembled copy, at the cut.
    const b = partBounds([named(r, 'Bottom (assembled)')]);
    expect(g.at[2]).toBeCloseTo(meta.cutAt, 3);
    expect(g.at[0]).toBeGreaterThan(b.min[0]);
    expect(g.at[0]).toBeLessThan(b.max[0]);
    // A 1 mm skin and sparse infill weigh less than the solid piece would.
    const solidGrams = ((await solid(named(r, 'Top'))).volume() / 1000) * 1.24;
    expect(meta.movingGrams).toBeGreaterThan(0.2 * solidGrams);
    expect(meta.movingGrams).toBeLessThan(solidGrams);
    for (const cutter of ['stand', 'button'] as const) expect((await run({ cutter })).handles ?? []).toEqual([]);
  });

  it('keeps the model and the cut handle on show when a dragged cut does not fit', async () => {
    const r = await run({ cutter: 'slice', cutHeight: 30 });
    expect(errors(r).length).toBe(1);
    expect(r.parts.map((q) => q.role)).toEqual(['preview']);
    expect(r.handles?.[0]?.value).toBe(30);
  });

  it('has sample models that each make a clicker', async () => {
    for (const sample of ['toadstool', 'acorn', 'owl', 'snowman', 'cactus'] as const) {
      const r = await run({ cutter: 'stand', sample });
      expect(errors(r), sample).toEqual([]);
      expect(warnings(r), sample).toEqual([]);
    }
    for (const sample of ['acorn', 'owl'] as const) {
      const r = await run({ cutter: 'slice', sample });
      expect(errors(r), sample).toEqual([]);
      expect(warnings(r), sample).toEqual([]);
    }
  });
});
