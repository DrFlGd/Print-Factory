import { defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build, capOf, fitLadder, formatClearance, MX, PROFILES, topAt } from '../src/build';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });
const box = (p: Part) => partBounds([p]);
const has = (r: BuildResult, re: RegExp) => (r.diagnostics ?? []).some((d) => re.test(d.message));
async function solid(p: Part) {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  const m = wasm.Manifold.ofMesh(mesh);
  expect(m.status(), `${p.name} is watertight`).toBe('NoError');
  return { volume: m.volume(), pieces: m.decompose().length };
}
const named = (r: BuildResult, name: string) => r.parts.find((p) => p.name === name)!;

describe('sizes and profiles', () => {
  it('sizes caps on the key pitch and adds stabiliser stems', () => {
    const one = capOf(base);
    expect(one.width).toBeCloseTo(18.14, 2);
    expect(one.depth).toBeCloseTo(18.14, 2);
    expect(one.stems).toEqual([0]);
    expect(capOf({ ...base, size: '2u' }).stems).toEqual([0]);
    expect(capOf({ ...base, size: '2.25u' }).stems).toEqual([-11.9, 0, 11.9]);
    const space = capOf({ ...base, size: '6.25u' });
    expect(space.width).toBeCloseTo(19.05 * 6.25 - 0.91, 6);
    expect(space.stems).toEqual([-50, 0, 50]);
    const choc = capOf({ ...base, profile: 'choc', chocSize: '2u' });
    expect([choc.width, choc.depth]).toEqual([35.5, 16.5]);
    expect(choc.stems).toEqual([0]);
  });

  it('dishes the Standard top as a cylinder through the top edges', () => {
    const cap = capOf(base);
    const { height, dish } = PROFILES.standard;
    expect(topAt(cap, 0)).toBeCloseTo(height - dish, 6);
    expect(topAt(cap, cap.topDepth / 2)).toBeCloseTo(height, 6);
    expect(topAt(capOf({ ...base, profile: 'low' }), 3)).toBe(PROFILES.low.height);
  });

  it('builds every profile and size as one watertight cap', async () => {
    for (const profile of ['standard', 'thocky', 'low'] as const) {
      for (const size of ['1u', '1.75u', '2u-stab', '6.5u']) {
        const r = await run({ profile, size, legend: 'none' });
        expect(r.parts, `${profile} ${size}`).toHaveLength(1);
        expect((await solid(r.parts[0]!)).pieces, `${profile} ${size}`).toBe(1);
      }
    }
    for (const chocSize of ['1u', '1.5u', '2u']) {
      const r = await run({ profile: 'choc', chocSize, legend: 'none' });
      expect((await solid(r.parts[0]!)).pieces).toBe(1);
    }
  });
});

describe('legends', () => {
  it('inlays the legend flush, as its own part, without changing the total', async () => {
    const blank = await solid((await run({ legend: 'none' })).parts[0]!);
    const r = await run();
    expect(r.parts.map((p) => p.name)).toEqual(['Keycap', 'Legend']);
    const cap = await solid(named(r, 'Keycap'));
    const legend = await solid(named(r, 'Legend'));
    expect(cap.pieces).toBe(1);
    expect(cap.volume + legend.volume).toBeCloseTo(blank.volume, 0);
    const b = box(named(r, 'Legend'));
    const { height, dish } = PROFILES.standard;
    expect(b.min[2]).toBeCloseTo(height - dish - base.depth, 2);
    expect(b.max[2]).toBeLessThanOrEqual(height);
  });

  it('engraves in one colour', async () => {
    const blank = await solid((await run({ legend: 'none' })).parts[0]!);
    const inlay = await solid(named(await run(), 'Legend'));
    const r = await run({ style: 'engraved' });
    expect(r.parts).toHaveLength(1);
    expect((await solid(r.parts[0]!)).volume).toBeCloseTo(blank.volume - inlay.volume, 0);
  });

  it('shine-through cuts the roof and prints the stem with the legend', async () => {
    const r = await run({ style: 'shine', legend: 'symbol', symbol: 'tabler:bolt' });
    expect(r.parts.map((p) => p.name)).toEqual(['Keycap', 'Legend and stem']);
    const lb = box(r.parts[1]!);
    expect(lb.min[2]).toBeCloseTo(0, 5);
    expect(lb.max[2]).toBeGreaterThan(PROFILES.standard.height - PROFILES.standard.dish);
    expect((await solid(r.parts[0]!)).pieces).toBe(1);
    const big = await run({ style: 'shine', legend: 'text', text: 'W', legendSize: 16 });
    expect(has(big, /inside of the walls/)).toBe(true);
  });

  it('places the second legend in its corner and trims oversize legends', async () => {
    const r = await run({ legend: 'none', text2: '!', text2Corner: 'top-left' });
    const b = box(named(r, 'Legend'));
    expect(b.max[0]).toBeLessThan(0);
    expect(b.min[1]).toBeGreaterThan(0);
    const front = box(named(await run({ legend: 'none', text2: '!', text2Corner: 'bottom-right' }), 'Legend'));
    expect(front.min[0]).toBeGreaterThan(0);
    expect(front.max[1]).toBeLessThan(0);
    expect(has(await run({ text: 'WW', legendSize: 14 }), /runs off the top/)).toBe(true);
  });

  it('mirrors and rotates the legend', async () => {
    const plain = box(named(await run({ text: 'L', offsetX: 0 }), 'Legend'));
    const mirrored = box(named(await run({ text: 'L', mirror: true }), 'Legend'));
    expect(mirrored.min[0]).toBeCloseTo(-plain.max[0], 1);
    const turned = box(named(await run({ text: 'I', legendSize: 8, rotation: 90 }), 'Legend'));
    expect(turned.max[0] - turned.min[0]).toBeGreaterThan(turned.max[1] - turned.min[1]);
  });

  it('keeps a roof under a deep legend', async () => {
    const r = await run({ profile: 'low', depth: 3 });
    expect(has(r, /Legend depth limited to 1\.4 mm/)).toBe(true);
  });
});

describe('fit', () => {
  it('grows the MX socket by the clearance', async () => {
    const at = async (tolerance: number) => (await solid((await run({ legend: 'none', tolerance })).parts[0]!)).volume;
    const cross = (t: number) => 2 * (MX.crossLength + t) * (MX.crossWidth + t) - (MX.crossWidth + t) ** 2;
    const removed = (await at(0)) - (await at(0.2));
    const expected = (cross(0.2) - cross(0)) * PROFILES.standard.ceiling;
    expect(removed).toBeGreaterThan(expected * 0.97);
    expect(removed).toBeLessThan(expected * 1.03);
  });

  it('slims the Choc legs for a looser fit', async () => {
    const at = async (tolerance: number) => (await solid((await run({ profile: 'choc', legend: 'none', tolerance })).parts[0]!)).volume;
    expect((await at(0)) - (await at(0.2))).toBeCloseTo(2 * (1.2 * 3 - 1.0 * 2.8) * (1.8 + 2.01), 1);
  });

  it('ladders the fit test round the current clearance', () => {
    expect(fitLadder(0, 0.1)).toEqual([-0.2, -0.1, 0, 0.1, 0.2]);
    expect(fitLadder(0.04, 0.05)).toEqual([-0.06, -0.01, 0.04, 0.09, 0.14]);
    expect(fitLadder(0.35, 0.1)).toEqual([0.15, 0.25, 0.35, 0.4]);
    expect([formatClearance(0.1), formatClearance(-0.05), formatClearance(0)]).toEqual(['+0.10', '-0.05', '0.00']);
  });

  it('prints a row of labelled stems, socket up', async () => {
    const r = await run({ product: 'fit-test', tolerance: 0.1, fitStep: 0.05 });
    expect(r.parts.map((p) => p.name)).toEqual(['Fit +0.00', 'Fit +0.05', 'Fit +0.10', 'Fit +0.15', 'Fit +0.20'].map((n) => n.replace('+0.00', '0.00')));
    for (const p of r.parts) {
      expect((await solid(p)).pieces).toBe(1);
      expect(box(p).min[2]).toBeCloseTo(0, 5);
      expect(box(p).max[2]).toBeCloseTo(7, 5);
    }
    const choc = await run({ product: 'fit-test', profile: 'choc' });
    expect(choc.parts).toHaveLength(5);
  });
});

describe('printing', () => {
  it('prints flat tops face down and the dished top upright', async () => {
    const low = await run({ profile: 'low' });
    expect(box(named(low, 'Legend')).min[2]).toBeCloseTo(0, 5);
    expect(box(named(low, 'Keycap')).max[2]).toBeCloseTo(PROFILES.low.height, 5);
    const choc = await run({ profile: 'choc' });
    expect(box(named(choc, 'Keycap')).max[2]).toBeCloseTo(PROFILES.choc.height + 1.8, 5);
    const up = await run({ profile: 'low', orientation: 'upright' });
    expect(box(named(up, 'Legend')).max[2]).toBeCloseTo(PROFILES.low.height, 5);
    expect(has(await run({ orientation: 'face-down' }), /dished top/)).toBe(true);
  });

  it('adds a homing bump on top, only when upright', async () => {
    const plain = await solid((await run({ legend: 'none' })).parts[0]!);
    const r = await run({ legend: 'none', homingBump: true });
    const bumped = await solid(r.parts[0]!);
    expect(bumped.pieces).toBe(1);
    expect(bumped.volume - plain.volume).toBeGreaterThan(1.5);
    expect(bumped.volume - plain.volume).toBeLessThan(3);
    expect(has(await run({ profile: 'low', homingBump: true }), /homing bump is left off/)).toBe(true);
  });
});
