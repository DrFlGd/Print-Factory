import { defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import type { Manifold, ManifoldToplevel } from '@pf/engine-manifold';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build, outline } from '../src/build';
import { grooveWave, threadWave } from '../src/lathe';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}, inputs: Record<string, unknown> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, detail: 'draft', ...over }, inputs);
const named = (r: BuildResult, n: string) => r.parts.find((p) => p.name === n);
const errors = (r: BuildResult) => (r.diagnostics ?? []).filter((d) => d.level === 'error');
const size = (part: Part) => {
  const b = partBounds([part]);
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
};
function solid(wasm: ManifoldToplevel, part: Part): Manifold {
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: part.positions, triVerts: part.indices });
  mesh.merge();
  return wasm.Manifold.ofMesh(mesh);
}
/** The volume two assembled parts share, mm³: about none when the threads clear. */
async function overlap(r: BuildResult, a: string, b: string): Promise<number> {
  const wasm = await loadManifold();
  const x = solid(wasm, named(r, a)!);
  const y = solid(wasm, named(r, b)!);
  const i = x.intersect(y);
  const v = i.volume();
  // Left for the next build to free: the engine tracks what the wasm makes.
  return v;
}

describe('thread form', () => {
  it('has a groove that covers the thread with room to spare', () => {
    for (let x = -3; x <= 6; x += 0.01) {
      expect(grooveWave(x, 3, 0.3)).toBeGreaterThanOrEqual(threadWave(x, 3) - 1e-9);
      // Clearance along the flanks: the groove still clears the thread moved by 0.25 mm.
      expect(grooveWave(x, 3, 0.3)).toBeGreaterThanOrEqual(threadWave(x + 0.25, 3) - 1e-9);
    }
  });

  it('measures polygons across the flats', () => {
    for (const shape of ['hexagon', 'octagon', 'square'] as const) {
      const c = outline(shape, 60, 4);
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < c.length; i += 2) {
        minX = Math.min(minX, c[i]!);
        maxX = Math.max(maxX, c[i]!);
      }
      expect(maxX - minX).toBeCloseTo(60, 1);
    }
  });
});

describe('screw-top container', () => {
  it('makes a jar and a lid of the requested size', async () => {
    const r = await run();
    expect(errors(r)).toEqual([]);
    const jar = size(named(r, 'Jar')!);
    expect(jar[0]).toBeCloseTo(base.diameter, 0);
    expect(jar[2]).toBeCloseTo(base.height, 1);
    expect(named(r, 'Lid')).toBeTruthy();
    expect(r.summary).toMatch(/holds \d+ mL/);
  });

  it('screws the lid on without the parts touching', async () => {
    for (const over of [{}, { shape: 'hexagon' as const }, { mouth: 'narrow' as const }, { starts: '3' as const, pitch: 'coarse' as const, threadHeight: 12 }]) {
      const r = await run(over, { assembled: true });
      expect(errors(r)).toEqual([]);
      expect(await overlap(r, 'Jar', 'Lid')).toBeLessThan(0.5);
      // And the thread does hold: without clearance, the parts would overlap.
      const lid = partBounds([named(r, 'Lid')!]);
      expect(lid.min[2]).toBeCloseTo(base.height - (over.threadHeight ?? base.threadHeight), 1);
    }
  });

  it('stacks tiers that thread into each other', async () => {
    const r = await run({ product: 'stack', tiers: 3, height: 40, diameter: 60 }, { assembled: true });
    expect(errors(r)).toEqual([]);
    expect(r.parts.map((p) => p.name)).toEqual(['Tier 1', 'Tier 2', 'Tier 3', 'Lid']);
    expect(await overlap(r, 'Tier 1', 'Tier 2')).toBeLessThan(0.5);
    expect(await overlap(r, 'Tier 3', 'Lid')).toBeLessThan(0.5);
    // Laid out to print, every part stands on the bed.
    const flat = await run({ product: 'stack', tiers: 3, height: 40, diameter: 60 });
    for (const p of flat.parts) expect(partBounds([p]).min[2]).toBeCloseTo(0, 3);
  });

  it('makes every part one piece, dividers and all', async () => {
    const wasm = await loadManifold();
    for (const over of [{ dividers: '4' as const, shape: 'square' as const }, { product: 'stack' as const, tiers: 2, shape: 'octagon' as const, dividers: '3' as const, height: 45 }]) {
      const r = await run(over);
      for (const part of r.parts) expect(solid(wasm, part).decompose().length, part.name).toBe(1);
    }
  });

  it('engraves a label and adds dividers', async () => {
    const plain = await run({ dividers: '0' });
    const more = await run({ dividers: '4', label: 'Screws' });
    const wasm = await loadManifold();
    const v = (r: BuildResult, n: string) => solid(wasm, named(r, n)!).volume();
    expect(v(more, 'Jar')).toBeGreaterThan(v(plain, 'Jar') + 1000);
    expect(v(more, 'Lid')).toBeLessThan(v(plain, 'Lid') - 50);
  });

  it('says when the jar is too short for its thread', async () => {
    const r = await run({ height: 15, threadHeight: 14 });
    expect(errors(r).length).toBe(1);
  });
});
