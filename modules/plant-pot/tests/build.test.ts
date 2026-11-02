import { defaults } from '@pf/core';
import type { ParamSchema, Part } from '@pf/core';
import type { Manifold, ManifoldToplevel } from '@pf/engine-manifold';
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

const run = (over: Partial<Params>, inputs: Record<string, unknown> = {}) => runBuild(wasm, build, { ...base, ...over }, inputs);
const solid = (p: Part): Manifold => new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices }));
const named = (parts: Part[], name: string) => parts.find((p) => p.name === name)!;

describe('plant-pot', () => {
  it('makes a pot and a tray, each in one piece, on the bed side by side', async () => {
    const r = await run({});
    expect(r.parts.map((p) => p.name)).toEqual(['Pot', 'Tray']);
    const [pot, tray] = r.parts.map(solid) as [Manifold, Manifold];
    expect(pot.decompose().length).toBe(1);
    expect(tray.decompose().length).toBe(1);
    expect(pot.boundingBox().min[2]).toBeCloseTo(0, 3);
    expect(pot.intersect(tray).volume()).toBe(0);
  });

  it('sizes the pot as asked', async () => {
    for (const shape of ['round', 'polygon', 'fluted', 'scalloped'] as const) {
      const r = await run({ shape, parts: 'pot', rim: 'plain' });
      const b = solid(r.parts[0]!).boundingBox();
      expect(b.max[2] - b.min[2]).toBeCloseTo(base.height, 2);
      // Widest at the top: the top width (polygons: across the flats, so no smaller).
      expect(b.max[1] - b.min[1]).toBeGreaterThan(base.topDiameter - 1);
      expect(b.max[1] - b.min[1]).toBeLessThan(base.topDiameter * 1.2);
    }
  });

  it('keeps the wall even when twisted', async () => {
    const flat = await run({ parts: 'pot', shape: 'fluted', twist: 0, drain: 'none' });
    const turned = await run({ parts: 'pot', shape: 'fluted', twist: 120, drain: 'none' });
    const v0 = solid(flat.parts[0]!).volume();
    const v1 = solid(turned.parts[0]!).volume();
    expect(Math.abs(v1 - v0) / v0).toBeLessThan(0.03);
  });

  it('seats the pot on the ribs inside the tray without touching the wall', async () => {
    for (const over of [{}, { twist: 90, topDiameter: 90 }, { shape: 'polygon' as const, sides: 5 }, { shape: 'round' as const, rim: 'band' as const }]) {
      const r = await run(over, { assembled: true });
      const pot = solid(named(r.parts, 'Pot'));
      const tray = solid(named(r.parts, 'Tray'));
      expect(pot.intersect(tray).volume()).toBeLessThan(0.01);
      // It rests on the ribs: lifted a little, it is clear; lowered, it is not.
      expect(pot.translate([0, 0, -0.2]).intersect(tray).volume()).toBeGreaterThan(1);
    }
  });

  it('drains through the floor', async () => {
    const none = solid((await run({ parts: 'pot', drain: 'none' })).parts[0]!).volume();
    const one = solid((await run({ parts: 'pot', drain: 'one' })).parts[0]!).volume();
    const several = solid((await run({ parts: 'pot', drain: 'several' })).parts[0]!).volume();
    expect(none).toBeGreaterThan(one);
    expect(one).toBeGreaterThan(several);
  });

  it('reports the volume and refuses a pot with no room inside', async () => {
    const r = await run({});
    expect(r.summary).toMatch(/holds about \d/);
    const bad = await run({ topDiameter: 30, bottomDiameter: 30, wall: 6 });
    expect(bad.parts).toHaveLength(0);
    expect((bad.diagnostics ?? []).some((d) => d.level === 'error')).toBe(true);
  });
});
