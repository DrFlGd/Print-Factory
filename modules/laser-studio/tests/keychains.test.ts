import { defaults } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import presets from '../presets.json';
import type { Params } from '../src/build';
import { build } from '../src/build';
import { monthGrid, parseDate } from '../src/keychains';

const base = defaults(params as ParamSchema) as unknown as Params;
const preset = (id: string) => presets.find((p) => p.id === id)!.values as Partial<Params>;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });
const errors = (r: BuildResult) => (r.diagnostics ?? []).filter((d) => d.level === 'error').map((d) => d.message);

function box(p: Part) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p.positions[i + k]!);
      max[k] = Math.max(max[k]!, p.positions[i + k]!);
    }
  return { min, max };
}

describe('the date calendar', () => {
  it('reads year-month-day and refuses dates that do not exist', () => {
    expect(parseDate('2025-06-14')).toEqual({ y: 2025, m: 5, d: 14 });
    expect(parseDate('2024-02-29')).toEqual({ y: 2024, m: 1, d: 29 });
    expect(parseDate('2025-02-29')).toBeNull();
    expect(parseDate('14/06/2025')).toBeNull();
  });

  it('lays a month out in weeks from Sunday or Monday', () => {
    // June 2025 starts on a Sunday and has 30 days.
    const sun = monthGrid(2025, 5, 'sun');
    expect(sun[0]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(sun).toHaveLength(5);
    const mon = monthGrid(2025, 5, 'mon');
    expect(mon[0]).toEqual([0, 0, 0, 0, 0, 0, 1]);
    expect(mon).toHaveLength(6);
    expect(mon.flat().filter(Boolean)).toHaveLength(30);
  });

  it('says how to type a date it cannot read', async () => {
    const r = await run({ ...preset('calendar'), calDate: 'June 14' });
    expect(errors(r)[0]).toMatch(/year-month-day/);
  });

  it('cuts the calendar and the initials charm', async () => {
    const r = await run(preset('calendar'));
    expect(r.parts.map((p) => p.name)).toEqual(expect.arrayContaining(['Calendar', 'Charm']));
  });
});

describe('pairs', () => {
  it('cut two pieces each', async () => {
    for (const id of ['couple', 'heart-cutout', 'heart-puzzle']) {
      const r = await run(preset(id));
      expect(r.parts.filter((p) => p.name !== 'Engraving'), id).toHaveLength(2);
      expect(errors(r), id).toEqual([]);
    }
  });
});

describe('letter tiles', () => {
  it('make one tile a letter and score the seams', async () => {
    const r = await run(preset('tiles'));
    const score = r.drawing!.layers.find((l) => l.operation === 'score')!;
    expect(score.polylines!.length).toBeGreaterThanOrEqual(3);
    const b = box(r.parts.find((p) => p.name === 'Tiles')!);
    expect(b.max[0]! - b.min[0]!).toBeGreaterThan(4 * 16);
  });
});

describe('the pocket phone stand', () => {
  it('is shown standing on its long edge, on the bed', async () => {
    const r = await run(preset('pocket-stand'));
    const b = box(r.parts.find((p) => p.name === 'Stand')!);
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]! - b.min[2]!).toBeCloseTo(22, 0);
  });
});

describe('the song plate', () => {
  it('draws a code, a bare panel, or neither', async () => {
    const heights: number[] = [];
    for (const codeMode of ['qr', 'blank', 'none'] as const) {
      const r = await run({ ...preset('song'), codeMode });
      expect(errors(r)).toEqual([]);
      const b = box(r.parts.find((p) => p.name === 'Plate')!);
      heights.push(b.max[1]! - b.min[1]!);
    }
    expect(heights[0]).toBeGreaterThan(heights[1]!);
    expect(heights[1]).toBeGreaterThan(heights[2]!);
  });
});

describe('the split monogram', () => {
  it('stays in one piece in each cut-out frame', async () => {
    const wasm = await loadManifold();
    for (const frame of ['none', 'ring', 'laurel'] as const) {
      const r = await run({ ...preset('monogram'), frame });
      const part = r.parts.find((p) => p.name === 'Monogram')!;
      const mesh = new wasm.Mesh({ numProp: 3, vertProperties: part.positions, triVerts: part.indices });
      mesh.merge();
      expect(wasm.Manifold.ofMesh(mesh).decompose().length, frame).toBe(1);
    }
  });
});
