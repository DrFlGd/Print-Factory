import { defaults } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import presets from '../presets.json';
import type { Params } from '../src/build';
import { build } from '../src/build';
import { clipSlab } from '../src/stands';

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

/** How much of two parts occupies the same space, mm³. */
async function clash(a: Part, b: Part) {
  return (await solid(a)).intersect(await solid(b)).volume();
}

const named = (r: BuildResult, name: string) => r.parts.filter((p) => p.name === name);

describe('clipping a board to a slab', () => {
  it('keeps the part between the two levels', () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const out = clipSlab(square, (p) => p[1], 2, 5);
    expect(Math.min(...out.map((p) => p[1]))).toBeCloseTo(2);
    expect(Math.max(...out.map((p) => p[1]))).toBeCloseTo(5);
    expect(Math.max(...out.map((p) => p[0]))).toBeCloseTo(10);
  });
});

describe('things that stand', () => {
  it('a tent: the panels meet at the top, stand on the table, and the braces pass through them without clashing', async () => {
    for (const id of ['table-sign', 'qr-tent']) {
      const r = await run(preset(id));
      expect(errors(r), id).toEqual([]);
      const front = named(r, 'Front panel')[0]!;
      const back = named(r, 'Back panel')[0]!;
      const fb = (await solid(front)).boundingBox();
      const bb = (await solid(back)).boundingBox();
      expect(fb.min[2], id).toBeCloseTo(0, 3);
      expect(bb.min[2], id).toBeCloseTo(0, 3);
      expect(fb.max[2], id).toBeCloseTo(bb.max[2], 3);
      expect(fb.min[1], id).toBeCloseTo(-bb.max[1], 2);
      for (const brace of named(r, 'Brace')) {
        expect(await clash(brace, front), `${id} brace and front`).toBeLessThan(0.5);
        expect(await clash(brace, back), `${id} brace and back`).toBeLessThan(0.5);
        // At its own height it reaches out past both panels.
        const b = (await solid(brace)).boundingBox();
        const wasm = await loadManifold();
        const slab = wasm.Manifold.cube([1000, 1000, 0.5], true).translate([0, 0, b.min[2] + 1]);
        expect(b.min[1]).toBeLessThan((await solid(front)).intersect(slab).boundingBox().min[1]);
        expect(b.max[1]).toBeGreaterThan((await solid(back)).intersect(slab).boundingBox().max[1]);
      }
    }
  });

  it('a foot stand: the feet cross the plate without clashing, all on the table', async () => {
    const r = await run(preset('qr-stand'));
    const plate = named(r, 'Plate')[0]!;
    for (const foot of named(r, 'Foot')) {
      expect(await clash(foot, plate)).toBeLessThan(0.5);
      expect((await solid(foot)).boundingBox().min[2]).toBeCloseTo(0, 3);
    }
    expect((await solid(plate)).boundingBox().min[2]).toBeCloseTo(0, 3);
  });

  it('a slot stand: the tongue goes through the base without clashing, and the base is under its weight', async () => {
    for (const over of [preset('qr-slot'), { ...preset('qr-slot'), codeMount: 'engrave' as const }, preset('qr-display')]) {
      const r = await run(over);
      const up = named(r, 'Upright')[0]!;
      const baseP = named(r, 'Base')[0]!;
      expect(await clash(up, baseP)).toBeLessThan(0.5);
      const ub = (await solid(up)).boundingBox();
      const bb = (await solid(baseP)).boundingBox();
      expect(ub.min[2]).toBeCloseTo(0, 2);
      // The upright's middle, leaned back, is over the base.
      const mid = (ub.min[1] + ub.max[1]) / 2;
      expect(mid).toBeGreaterThan(bb.min[1]);
      expect(mid).toBeLessThan(bb.max[1]);
      const plate = named(r, 'Code plate')[0];
      if (plate) expect(await clash(plate, up)).toBeLessThan(0.5);
    }
  });
});

describe('cards', () => {
  it('cut one card per name', async () => {
    const r = await run({ ...preset('card-band'), text: 'Jordan Lee\nSam Ortiz\nAlex Kim' });
    expect(r.parts.filter((p) => p.name.startsWith('Card'))).toHaveLength(3);
  });

  it('keep the pattern inside the border', async () => {
    for (const id of ['card-band', 'card-half', 'card-framed', 'card-tall', 'card-tile']) {
      const r = await run(preset(id));
      expect(errors(r), id).toEqual([]);
      const cut = r.drawing!.layers.find((l) => l.operation === 'cut')!.contours;
      // The card's outline and the pattern's holes: at least a dozen cuts.
      expect(cut.length, id).toBeGreaterThan(12);
      const card = (await solid(named(r, 'Card')[0]!));
      // One piece: the border holds it all together.
      expect(card.decompose().length, id).toBe(1);
    }
  });

  it('a Wi-Fi card is bank-card size', async () => {
    const r = await run(preset('wifi-card'));
    const b = (await solid(named(r, 'Card')[0]!)).boundingBox();
    expect(b.max[0] - b.min[0]).toBeCloseTo(85.6, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(54, 1);
  });
});

describe('tags', () => {
  it('a snowflake tag is one piece, the flake hanging below it', async () => {
    for (const flake of [1, 2, 3, 4]) {
      const r = await run({ ...preset('snowflake'), flake });
      const tag = await solid(named(r, 'Tag')[0]!);
      expect(tag.decompose().length, `flake ${flake}`).toBe(1);
      expect(tag.boundingBox().min[1], `flake ${flake}`).toBeLessThan(-40 - 5);
    }
  });

  it('a sports tag is a ball and a frame over it', async () => {
    for (const id of ['basketball', 'baseball', 'soccer', 'football']) {
      const r = await run(preset(id));
      expect(errors(r), id).toEqual([]);
      const frame = await solid(named(r, 'Frame')[0]!);
      expect(frame.decompose().length, id).toBe(1);
      expect(frame.boundingBox().min[2], id).toBeGreaterThan(1);
    }
  });

  it('a pet sign has its screw holes', async () => {
    const two = await run(preset('pet-sign'));
    const four = await run({ ...preset('pet-sign'), mounting: 'four' });
    const none = await run({ ...preset('pet-sign'), mounting: 'none' });
    const genus = async (r: BuildResult) => (await solid(named(r, 'Sign')[0]!)).genus();
    expect(await genus(two)).toBe(2);
    expect(await genus(four)).toBe(4);
    expect(await genus(none)).toBe(0);
  });
});
