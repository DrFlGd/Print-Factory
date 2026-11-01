import { defaults } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import presets from '../presets.json';
import type { Params } from '../src/build';
import { build } from '../src/build';

const base = defaults(params as ParamSchema) as unknown as Params;
const preset = (id: string) => presets.find((p) => p.id === id)!.values as Partial<Params>;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });
const errors = (r: BuildResult) => (r.diagnostics ?? []).filter((d) => d.level === 'error').map((d) => d.message);
async function solid(p: Part) {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  return wasm.Manifold.ofMesh(mesh);
}
const named = (r: BuildResult, name: string) => r.parts.filter((p) => p.name === name);
const starts = (r: BuildResult, name: string) => r.parts.filter((p) => p.name.startsWith(name));

describe('the phone stand', () => {
  it('crosses its planks without a clash and stands both feet on the table', async () => {
    for (const lean of [15, 25, 35]) {
      const r = await run({ ...preset('phone-stand'), lean });
      expect(errors(r)).toEqual([]);
      const back = await solid(named(r, 'Back plank')[0]!);
      const front = await solid(named(r, 'Front plank')[0]!);
      expect(back.intersect(front).volume(), `lean ${lean}`).toBeLessThan(1);
      for (const pl of [back, front]) expect(pl.boundingBox().min[2], `lean ${lean}`).toBeCloseTo(0, 1);
      // The planks touch at the crossing: each fills the other's slot.
      expect(back.add(front).volume()).toBeCloseTo(back.volume() + front.volume(), 0);
      expect(back.boundingBox().max[2]).toBeGreaterThan(front.boundingBox().max[2]);
    }
  });
});

describe('the name puzzle', () => {
  it('lifts each letter out of a pocket in the board', async () => {
    const r = await run(preset('name-puzzle'));
    expect(errors(r)).toEqual([]);
    const board = await solid(named(r, 'Board')[0]!);
    const letters = starts(r, 'Letter ');
    expect(letters).toHaveLength(4);
    for (const l of letters) expect(board.intersect(await solid(l)).volume(), l.name).toBeLessThan(0.01);
  });
});

describe('tic-tac-toe', () => {
  it('has five X and five O, the ones in play inside the grid’s squares', async () => {
    const r = await run(preset('tic-tac-toe'));
    expect(named(r, 'X')).toHaveLength(5);
    expect(named(r, 'O')).toHaveLength(5);
    const grid = await solid(named(r, 'Grid')[0]!);
    for (const p of [...named(r, 'X'), ...named(r, 'O')]) expect(grid.intersect(await solid(p)).volume()).toBeLessThan(0.01);
  });
});

describe('bracelets, hair ties and ties', () => {
  it('makes a bar for each word and a card for them', async () => {
    const r = await run(preset('bracelets'));
    expect(starts(r, 'Bracelet ')).toHaveLength(3);
    expect(named(r, 'Card')).toHaveLength(1);
  });

  it('says how many tie slots fit when asked for too many', async () => {
    const r = await run({ ...preset('tie-holder'), slots: 20, standHeight: 180 });
    expect(r.diagnostics?.some((d) => /slots fit/.test(d.message))).toBe(true);
  });
});
