// Ported from the tests of Jerred's Image LED Lightbox (DrFlGd/Generator-Standalone).
import { defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { LightboxImage, Params } from '../src/build';
import { build } from '../src/build';
import { marqueeCircles, sampleMarqueeHoles } from '../src/marquee';

const base = defaults(params as ParamSchema) as unknown as Params;
const square = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
/** Two colours side by side, filling a 100 × 64 picture. */
const image: LightboxImage = {
  width: 100,
  height: 64,
  silhouette: [square(0, 0, 100, 64)],
  regions: [
    { color: [220, 40, 60], contours: [square(0, 0, 50, 64)] },
    { color: [40, 90, 220], contours: [square(50, 0, 100, 64)] },
  ],
};

async function run(over: Partial<Params> = {}, img?: LightboxImage): Promise<BuildResult> {
  return runBuild(await loadManifold(), build, { ...base, ...over }, img ? { image: img } : {});
}
const box = (p: Part) => partBounds([p]);
async function volume(p: Part): Promise<number> {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  const m = wasm.Manifold.ofMesh(mesh);
  const status = m.status();
  const v = m.volume();
  // Not deleted here: the engine's collector frees it with the next build.
  expect(status, `${p.name} is watertight`).toBe('NoError');
  return v;
}
async function watertight(r: BuildResult) {
  for (const p of r.parts) expect(await volume(p)).toBeGreaterThan(0);
}

describe('shell and diffuser', () => {
  it.each(['none', 'back', 'side', 'both'] as const)('wire exit %s: two separate parts on the bed', async (wireExit) => {
    const r = await run({ wireExit });
    expect(r.parts).toHaveLength(2);
    expect(r.parts.map((p) => p.group)).toEqual(['Lightbox shell', 'Diffuser cover']);
    const shell = box(r.parts[0]!);
    const cover = box(r.parts[1]!);
    expect(shell.min[2]).toBeCloseTo(0, 5);
    expect(shell.max[2]).toBeGreaterThanOrEqual(base.depth - 0.01);
    expect(cover.min[2]).toBeCloseTo(0, 5);
    expect(cover.max[2]).toBeCloseTo(base.diffuserThickness, 2);
    expect(cover.min[0] > shell.max[0] || cover.min[1] > shell.max[1]).toBe(true);
    expect(shell.max[0] - shell.min[0]).toBeCloseTo(120, 1);
    await watertight(r);
  });

  it.each([0.6, 1.2, 2.6])('colour inlays stay inside a %s mm diffuser', async (t) => {
    const r = await run({ wireExit: 'both', diffuserThickness: t }, image);
    expect(r.parts).toHaveLength(4);
    expect(r.parts.slice(2).map((p) => p.color)).toEqual([
      [220, 40, 60],
      [40, 90, 220],
    ]);
    for (const p of r.parts.slice(1)) {
      expect(p.group).toBe('Diffuser cover');
      expect(box(p).max[2]).toBeLessThanOrEqual(t + 0.001);
    }
    for (const p of r.parts.slice(2)) expect(box(p).min[2]).toBeGreaterThanOrEqual(t - 0.401);
    await watertight(r);
  });

  it('leaves colours out when asked', async () => {
    expect((await run({ includeColors: false }, image)).parts).toHaveLength(2);
  });

  it('rejects impossible ledges and diffusers', async () => {
    await expect(run({ ledgeWidth: 90 })).rejects.toThrow(/ledge/i);
    await expect(run({ diffuserThickness: 0.2 })).rejects.toThrow(/diffuser/i);
  });
});

describe('registration lips', () => {
  it.each(['cover', 'box'] as const)('%s: prints face down with the mating feature on top', async (lipPlacement) => {
    const r = await run({ lipPlacement, lipWidth: 1.2, lipHeight: 0.6, lipClearance: 0.2 }, image);
    expect(r.parts).toHaveLength(4);
    const shell = box(r.parts[0]!);
    const white = box(r.parts[1]!);
    expect(white.min[2]).toBeCloseTo(0, 5);
    if (lipPlacement === 'cover') {
      expect(white.max[2]).toBeGreaterThan(base.diffuserThickness + 0.5);
      expect(shell.max[2]).toBeLessThanOrEqual(base.depth + 0.01);
    } else {
      expect(shell.max[2]).toBeGreaterThan(base.depth + 0.5);
      expect(white.max[2]).toBeLessThanOrEqual(base.diffuserThickness + 0.01);
    }
    for (const p of r.parts.slice(2)) expect(box(p).max[2]).toBeLessThanOrEqual(0.401);
    await watertight(r);
  });

  it('cuts a groove for the box ridge and checks the roof over it', async () => {
    const groove = await run({ lipPlacement: 'box' });
    const flat = await run();
    expect(await volume(groove.parts[1]!)).toBeLessThan(await volume(flat.parts[1]!));
    await expect(run({ lipPlacement: 'box', lipHeight: 1.2, diffuserThickness: 1.2 })).rejects.toThrow(/thicker diffuser|solid roof/i);
    await expect(run({ lipPlacement: 'cover', lipWidth: 45 } as Partial<Params>)).rejects.toThrow(/lip/i);
  });
});

describe('borders', () => {
  it('insets the picture; a black band is its own part', async () => {
    const plain = await run({}, image);
    const white = await run({ borderColor: 'white', borderWidth: 4 }, image);
    const black = await run({ borderColor: 'black', borderWidth: 4 }, image);
    expect(white.parts).toHaveLength(4);
    expect(black.parts).toHaveLength(5);
    expect(black.parts[4]!.color).toEqual(base.bandColor);
    expect(black.parts[4]!.group).toBe('Diffuser cover');
    expect(box(white.parts[2]!).min[0]).toBeGreaterThan(box(plain.parts[2]!).min[0] + 2);
    await watertight(white);
    await watertight(black);
  });
  it.each(['none', 'cover', 'box'] as const)('black border with lip %s', async (lipPlacement) => {
    const r = await run({ borderColor: 'black', borderWidth: 3, lipPlacement, diffuserThickness: 2 }, image);
    expect(r.parts).toHaveLength(5);
    await watertight(r);
  });
});

describe('positioned wire exits', () => {
  it('single mode drills only hole 1, where hole 1 says', async () => {
    const right = await run({ wireExit: 'single', hole1Angle: 0, hole1Depth: 0, hole2Angle: 180, hole2Depth: 100 });
    const same = await run({ wireExit: 'single', hole1Angle: 0, hole1Depth: 0, hole2Angle: 75, hole2Depth: 10 });
    const top = await run({ wireExit: 'single', hole1Angle: 90, hole1Depth: 100 });
    expect(Array.from(right.parts[0]!.positions)).toEqual(Array.from(same.parts[0]!.positions));
    expect(Array.from(right.parts[0]!.positions)).not.toEqual(Array.from(top.parts[0]!.positions));
    const two = await run({ wireExit: 'dual', hole1Angle: 0, hole2Angle: 90, hole1Depth: 0, hole2Depth: 100 });
    const stacked = await run({ wireExit: 'dual', hole1Angle: 0, hole2Angle: 0, hole1Depth: 0, hole2Depth: 0 });
    expect(await volume(two.parts[0]!)).toBeLessThan(await volume(right.parts[0]!));
    expect(await volume(two.parts[0]!)).toBeLessThan(await volume(stacked.parts[0]!));
    await watertight(top);
    await expect(run({ wireExit: 'dual', depth: 10, back: 4, holeDiameter: 10 })).rejects.toThrow(/depth|diameter/i);
  });
});

describe('marquee', () => {
  const guide: [number, number][] = [
    [-20, -20],
    [20, -20],
    [20, 20],
    [-20, 20],
  ];
  const outside: [number, number][] = [
    [-30, -30],
    [30, -30],
    [30, 30],
    [-30, 30],
  ];
  it('spaces holes evenly by arc length and wraps the shift', () => {
    const at = sampleMarqueeHoles([guide], 16, 2, outside, 3);
    expect(at).toHaveLength(16);
    expect(marqueeCircles(at, 2)).toHaveLength(16);
    expect(at.slice(0, 4)).toEqual([
      [-15, -20],
      [-5, -20],
      [5, -20],
      [15, -20],
    ]);
    expect(at[4]).toEqual([20, -15]);
    const shifted = sampleMarqueeHoles([guide], 16, 2, outside, 3, 0.1);
    expect(shifted[0]![0] - at[0]![0]).toBeCloseTo(0.1, 8);
    const wrapped = sampleMarqueeHoles([guide], 16, 2, outside, 3, 160.1);
    shifted.forEach((p, i) => expect(Math.hypot(p[0] - wrapped[i]![0], p[1] - wrapped[i]![1])).toBeLessThan(1e-7));
    expect(() => sampleMarqueeHoles([guide], 240, 4, outside, 3)).toThrow(/overlap|closely spaced/i);
    expect(() => sampleMarqueeHoles([guide], 8, 4, square(-21, -21, 21, 21).reduce<[number, number][]>((a, v, i, s) => (i % 2 ? a : [...a, [v, s[i + 1]!]]), []), 3)).toThrow(/edge/i);
  });

  it('drills the diffuser and every colour part, never the box', async () => {
    const flat = await run();
    const outer = await run({ marqueeLayout: 'outer', marqueeCount: 32, marqueeDiameter: 2.5, marqueeInset: 5 });
    expect(outer.parts).toHaveLength(2);
    expect(await volume(outer.parts[1]!)).toBeLessThan((await volume(flat.parts[1]!)) - 100);
    expect(Array.from(outer.parts[0]!.positions)).toEqual(Array.from(flat.parts[0]!.positions));
    expect(outer.diagnostics?.some((d) => d.message.includes('32 marquee holes'))).toBe(true);

    const plain = await run({}, image);
    const regions = await run({ marqueeLayout: 'regions', marqueeCount: 24, marqueeDiameter: 2.5, marqueeInset: 6 }, image);
    expect(regions.parts).toHaveLength(4);
    for (let i = 1; i < 4; i++) expect(await volume(regions.parts[i]!)).toBeLessThan(await volume(plain.parts[i]!));

    const band = { borderColor: 'black', borderWidth: 9 } as const;
    const black = await run({ ...band, marqueeLayout: 'border', marqueeCount: 24, marqueeDiameter: 2.5, marqueeInset: 5 }, image);
    expect(await volume(black.parts[4]!)).toBeLessThan(await volume((await run(band, image)).parts[4]!));
    await watertight(black);
  });

  it('moves with a 0.1 mm shift and explains impossible layouts', async () => {
    const o = { marqueeLayout: 'outer', marqueeCount: 24, marqueeDiameter: 3.1, marqueeInset: 6.2 } as const;
    const a = await run({ ...o, marqueeShift: 0.1 });
    const b = await run({ ...o, marqueeShift: 0 });
    expect(Array.from(a.parts[1]!.positions)).not.toEqual(Array.from(b.parts[1]!.positions));
    await expect(run({ marqueeLayout: 'border' })).rejects.toThrow(/black artwork border/i);
    await expect(run({ marqueeLayout: 'border', borderColor: 'black', borderWidth: 4 }, image)).rejects.toThrow(/wider black border/i);
    await expect(run({ marqueeLayout: 'regions' })).rejects.toThrow(/requires printable traced/i);
  });

  it('keeps its true size at 600 mm', async () => {
    const r = await run({ size: 600, wireExit: 'single', hole1Angle: 45, hole1Depth: 45, marqueeLayout: 'outer', marqueeCount: 24, marqueeDiameter: 3.1, marqueeInset: 6.2, marqueeShift: 0.1 });
    const s = box(r.parts[0]!);
    expect(s.max[0] - s.min[0]).toBeCloseTo(600, 2);
    await watertight(r);
  });
});

describe('image outline', () => {
  it('uses the largest silhouette and drops specks', async () => {
    const withIsland: LightboxImage = { ...image, silhouette: [square(0, 0, 100, 64), square(120, 0, 122, 2)], regions: [...image.regions, { color: [0, 0, 0], contours: [square(10, 10, 10.1, 10.1)] }] };
    const r = await run({}, withIsland);
    expect(r.parts).toHaveLength(4);
    expect(r.diagnostics?.some((d) => /largest outside shape/.test(d.message))).toBe(true);
  });
});
