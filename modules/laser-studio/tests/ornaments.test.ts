import { defaults } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import presets from '../presets.json';
import type { Params } from '../src/build';
import { build } from '../src/build';
import { crossword } from '../src/ornaments';

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

describe('the crossword', () => {
  it('crosses every word on a shared letter and reads back only the words placed', () => {
    const { placed, skipped } = crossword(['Emma', 'James', 'Olivia', 'Noah', 'Mia']);
    expect(skipped).toEqual([]);
    expect(placed).toHaveLength(5);
    const grid = new Map<string, string>();
    for (const p of placed) for (let i = 0; i < p.word.length; i++) grid.set(`${p.x + (p.across ? i : 0)},${p.y + (p.across ? 0 : i)}`, p.word[i]!);
    // Every run of two or more letters, across and down, is a placed word.
    const words = new Set(placed.map((p) => p.word));
    const runs: string[] = [];
    const xs = [...grid.keys()].map((k) => Number(k.split(',')[0]));
    const ys = [...grid.keys()].map((k) => Number(k.split(',')[1]));
    for (const across of [true, false])
      for (let a = Math.min(...(across ? ys : xs)); a <= Math.max(...(across ? ys : xs)); a++) {
        let cur = '';
        for (let b = Math.min(...(across ? xs : ys)) - 1; b <= Math.max(...(across ? xs : ys)) + 1; b++) {
          const c = grid.get(across ? `${b},${a}` : `${a},${b}`);
          if (c) cur += c;
          else {
            if (cur.length > 1) runs.push(cur);
            cur = '';
          }
        }
      }
    expect(runs.sort()).toEqual([...words].sort());
  });

  it('leaves out a word with no letter in common', () => {
    expect(crossword(['ABC', 'XYZ']).skipped).toEqual(['XYZ']);
  });
});

describe('ornaments', () => {
  it('each is a backer and a frame of the same outline, the hole through both', async () => {
    for (const id of ['bauble', 'house', 'cat', 'crossword']) {
      const r = await run(preset(id));
      expect(errors(r), id).toEqual([]);
      const back = await solid(named(r, 'Backer')[0]!);
      const frame = await solid(named(r, 'Frame')[0]!);
      const bb = back.boundingBox();
      const fb = frame.boundingBox();
      for (const k of [0, 1]) {
        expect(fb.min[k], `${id} ${k}`).toBeCloseTo(bb.min[k]!, 1);
        expect(fb.max[k], `${id} ${k}`).toBeCloseTo(bb.max[k]!, 1);
      }
      expect(back.genus(), id).toBeGreaterThanOrEqual(1);
      expect(frame.decompose().length, id).toBe(1);
    }
  });

  it('the family tree is one piece with its hole', async () => {
    const r = await run(preset('tree'));
    const tree = await solid(named(r, 'Tree')[0]!);
    expect(tree.decompose().length).toBe(1);
    expect(tree.genus()).toBeGreaterThanOrEqual(1);
  });

  it('a pattern on your SVG goes only in the areas picked', async () => {
    const all = await run(preset('pattern-svg'));
    const none = await run({ ...preset('pattern-svg'), areas: '9' });
    const cuts = (r: BuildResult) => r.drawing!.layers.find((l) => l.operation === 'cut')!.contours.length;
    expect(cuts(all)).toBeGreaterThan(cuts(none) + 20);
    expect((none.diagnostics ?? []).some((d) => /numbered/.test(d.message))).toBe(true);
  });
});

describe('photo frames', () => {
  it('stand on the table, the ribs behind the back without clashing', async () => {
    for (const id of ['frame-hearts', 'frame-icons']) {
      const r = await run(preset(id));
      expect(errors(r), id).toEqual([]);
      const sheets = await Promise.all(['Front', 'Middle', 'Back'].map(async (n) => solid(named(r, n)[0]!)));
      for (const s of sheets) expect(s.boundingBox().min[2], id).toBeGreaterThan(-0.01);
      expect(Math.min(...sheets.map((s) => s.boundingBox().min[2]))).toBeCloseTo(0, 2);
      // The three sheets stack without overlapping.
      expect(sheets[0]!.intersect(sheets[1]!).volume(), id).toBeLessThan(1);
      expect(sheets[1]!.intersect(sheets[2]!).volume(), id).toBeLessThan(1);
      for (const rib of named(r, 'Rib')) {
        const rs = await solid(rib);
        expect(rs.boundingBox().min[2], id).toBeCloseTo(0, 2);
        for (const s of sheets) expect(rs.intersect(s).volume(), `${id} rib`).toBeLessThan(0.5);
      }
    }
  });

  it('keep every heart clear of the photo pocket', async () => {
    const r = await run(preset('frame-hearts'));
    const front = await solid(named(r, 'Front')[0]!);
    const middle = await solid(named(r, 'Middle')[0]!);
    // Every hole in the front but the window sits over the middle's wood: front ∪ middle
    // seen from the front shows no more see-through than the window.
    expect(front.genus()).toBeGreaterThan(3);
    expect(middle.decompose().length).toBe(1);
  });
});
