import { defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { MagnetImage, Params } from '../src/build';
import { autoPlace, build, pocketOf, POCKET_WALL, sliderGrid } from '../src/build';

const base = defaults(params as ParamSchema) as unknown as Params;
const square = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
/** A 100 × 60 picture: red left, blue right, a small yellow dot. */
const image: MagnetImage = {
  width: 100,
  height: 60,
  silhouette: [square(0, 0, 100, 60)],
  regions: [
    { index: 0, color: [200, 30, 40], contours: [square(0, 0, 50, 60)] },
    { index: 1, color: [30, 80, 220], contours: [square(50, 0, 100, 60), [70, 20, 70, 30, 80, 30, 80, 20]] },
    { index: 2, color: [250, 200, 0], contours: [square(70, 20, 80, 30)] },
  ],
};

async function run(over: Partial<Params> = {}, inputs: Record<string, unknown> = { image }): Promise<BuildResult> {
  return runBuild(await loadManifold(), build, { ...base, ...over }, inputs);
}

const box = (p: Part) => partBounds([p]);
async function volume(p: Part): Promise<number> {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  const m = wasm.Manifold.ofMesh(mesh);
  expect(m.status(), `${p.name} is watertight`).toBe('NoError');
  return m.volume();
}
const has = (r: BuildResult, re: RegExp) => (r.diagnostics ?? []).some((d) => re.test(d.message));

describe('pockets', () => {
  it('adds the clearance to the diameter; hex takes 0.2 mm less', () => {
    expect(pocketOf({ ...base, magnet: 'd6x3', pocketFit: 0.2 }).across).toBeCloseTo(6.2, 6);
    expect(pocketOf({ ...base, magnet: 'd6x3', pocketFit: 0.5 }).across).toBeCloseTo(6.5, 6);
    const hex = pocketOf({ ...base, magnet: 'd6x3', pocketFit: 0.2, pocketProfile: 'hex' });
    expect(hex.across).toBeCloseTo(6.0, 6);
    expect(hex.corners).toBeCloseTo(6 / Math.cos(Math.PI / 6), 6);
    expect(pocketOf({ ...base, magnet: 'd6x3', pocketFit: 0.5, pocketProfile: 'hex' }).across).toBeCloseTo(6.3, 6);
    const block = pocketOf({ ...base, magnet: 'b20x10x2', pocketFit: 0.2 });
    expect([block.w, block.l, block.depth]).toEqual([20.2, 10.2, 2]);
  });

  it('spreads magnets over the shape with walls between them', () => {
    const legal = [square(-20, -10, 20, 10)];
    const at = autoPlace(legal, 4, 12);
    expect(at).toHaveLength(4);
    for (let i = 0; i < at.length; i++) for (let j = 0; j < i; j++) expect(Math.hypot(at[i]![0] - at[j]![0], at[i]![1] - at[j]![1])).toBeGreaterThanOrEqual(12 - 1e-6);
    const one = autoPlace(legal, 1, 12);
    expect(Math.hypot(one[0]![0], one[0]![1])).toBeLessThan(1);
    expect(autoPlace([square(-5, -5, 5, 5)], 3, 12)).toHaveLength(1);
  });

  it('glue-in pockets open at the back; embedded pockets are sealed', async () => {
    const plain = await run({ magnetMode: 'none', thickness: 5 });
    const glue = await run({ magnetMode: 'glue-on', thickness: 5 });
    const sealed = await run({ magnetMode: 'embedded', thickness: 5 });
    const vPlain = await volume(plain.parts[0]!);
    const pocket = Math.PI * 5.1 ** 2 * 3;
    for (const r of [glue, sealed]) {
      const removed = vPlain - (await volume(r.parts[0]!));
      expect(removed).toBeGreaterThan(pocket * 2 * 0.97);
      expect(removed).toBeLessThan(pocket * 2 * 1.03);
    }
    expect(has(sealed, /pause at 3\.6 mm/)).toBe(true);
    const thin = await run({ magnetMode: 'embedded', thickness: 4 });
    expect(box(thin.parts[0]!).max[2]).toBeCloseTo(4.4, 5);
    expect(has(thin, /Thickened to 4\.4 mm/)).toBe(true);
  });

  it('reduces the count when the shape is too small', async () => {
    const r = await run({ size: 24, count: 4, magnet: 'd10x3', shape: 'circle' });
    expect(has(r, /Room for 1 of 4/)).toBe(true);
  });
});

describe('design', () => {
  it('inlays each colour flush, smallest first, with their own parts', async () => {
    const r = await run({ shape: 'roundedRect', bevel: 0 });
    expect(r.parts.map((p) => p.name)).toEqual(['Body', 'Colour 1', 'Colour 2', 'Colour 3']);
    expect(r.parts[1]!.color).toEqual([250, 200, 0]);
    const T = box(r.parts[0]!).max[2];
    for (const p of r.parts.slice(1)) {
      expect(box(p).max[2]).toBeCloseTo(T, 5);
      expect(box(p).min[2]).toBeCloseTo(T - base.inlayDepth, 5);
    }
    const s = box(r.parts[0]!);
    expect(Math.max(s.max[0] - s.min[0], s.max[1] - s.min[1])).toBeCloseTo(70, 1);
  });

  it('recolours and raises colours from the panel', async () => {
    const r = await run({}, { image, colours: { '1': { color: [0, 0, 0], level: 2 } } });
    const blue = r.parts.find((p) => p.color.join() === '0,0,0')!;
    const T = box(r.parts[0]!).max[2];
    expect(box(blue).max[2]).toBeCloseTo(T + 2 * base.raiseStep, 5);
  });

  it('follows the outline, or fits the design in a preset shape', async () => {
    for (const shape of ['outline', 'circle', 'roundedRect', 'rectangle', 'square', 'hexagon'] as const) {
      const r = await run({ shape });
      expect(r.parts.length, shape).toBe(4);
      const body = box(r.parts[0]!);
      for (const p of r.parts.slice(1)) {
        const b = box(p);
        expect(b.min[0]).toBeGreaterThanOrEqual(body.min[0] + base.margin - 0.5);
        expect(b.max[0]).toBeLessThanOrEqual(body.max[0] - base.margin + 0.5);
      }
    }
  });

  it('makes text magnets and a plain body without a picture', async () => {
    const t = await run({ source: 'text', text: 'Hi', count: 1 }, {});
    expect(t.parts.map((p) => p.name)).toEqual(['Body', 'Text']);
    const none = await run({}, {});
    expect(none.parts).toHaveLength(1);
    expect(has(none, /Choose a picture/)).toBe(true);
  });
});

describe('slider', () => {
  it('derives the pitch from the pocket, wall and gap', () => {
    const g = sliderGrid({ ...base, magnet: 'd6x3', pocketFit: 0.2, sliderGap: 3, sliderLayout: '8' });
    expect(g.rows).toBe(4);
    expect(g.pitch).toBeCloseTo(6.2 + POCKET_WALL + 3 + 0.05, 6);
    expect(g.clicks).toBe(3);
    expect(g.travel).toBeCloseTo(3 * g.pitch, 6);
  });

  it('builds two halves with the same pockets and grows to fit', async () => {
    const r = await run({ product: 'slider', shape: 'roundedRect', size: 30, magnet: 'd6x3', sliderLayout: '8' });
    expect(has(r, /Grew to/)).toBe(true);
    expect(has(r, /8 magnets per half/)).toBe(true);
    const a = r.parts.filter((p) => p.group === 'Half A');
    const b = r.parts.filter((p) => p.group === 'Half B');
    expect(a).toHaveLength(4);
    expect(b).toHaveLength(4);
    expect(box(b[0]!).min[0]).toBeGreaterThan(box(a[0]!).max[0]);
    expect(await volume(a[0]!)).toBeCloseTo(await volume(b[0]!), 3);
  });

  it('mirrors half B of an outline slider; plain half B has no design', async () => {
    const tri: MagnetImage = { width: 100, height: 100, silhouette: [[0, 0, 100, 0, 0, 100]], regions: [{ index: 0, color: [0, 0, 0], contours: [[0, 0, 100, 0, 0, 100]] }] };
    const r = await run({ product: 'slider', shape: 'outline', size: 90, magnet: 'd5x3', sliderLayout: '4', margin: 2 }, { image: tri });
    expect(has(r, /mirrored/)).toBe(true);
    const blank = await run({ product: 'slider', sliderBlank: true, shape: 'roundedRect', magnet: 'd6x3' });
    expect(blank.parts.filter((p) => p.group === 'Half B')).toHaveLength(1);
  });
});
