import { defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { ClickerImage, Params } from '../src/build';
import { build, heights, MX, NEEDS } from '../src/build';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}, inputs: Record<string, unknown> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over }, inputs);
const has = (r: BuildResult, re: RegExp) => (r.diagnostics ?? []).some((d) => re.test(d.message));
const box = (p: Part) => partBounds([p]);
const named = (r: BuildResult, n: string) => r.parts.find((p) => p.name === n)!;
async function solid(p: Part) {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  const m = wasm.Manifold.ofMesh(mesh);
  expect(m.status(), p.name).toBe('NoError');
  return m;
}
const square = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];

describe('switch fit', () => {
  it('clears the housing at full travel and stands proud by the setting', () => {
    const h = heights(base);
    expect(h.capBottom - MX.travel + h.cavity).toBeGreaterThan(h.plateTop + MX.housingTop + 0.5);
    expect(h.capBottom + h.capH - h.bodyTop).toBeCloseTo(base.capProud, 6);
    expect(h.plateTop - MX.plate - 1.6).toBeGreaterThan(MX.pinsBelow - MX.plate);
  });

  it('leaves the cap free in its well from rest to full travel', async () => {
    const r = await run({ source: 'none' });
    const body = await solid(named(r, 'Body (assembled)'));
    const cap = await solid(named(r, 'Cap 1 (assembled)'));
    expect(body.intersect(cap).volume()).toBeLessThan(1e-6);
    expect(body.intersect(cap.translate([0, 0, -MX.travel])).volume()).toBeLessThan(1e-6);
  });

  it('cuts the 14 mm plate opening plus the fit, over a wider pocket', async () => {
    const r = await run({ source: 'none', socketFit: 0.1 });
    const body = await solid(named(r, 'Body'));
    const b = box(named(r, 'Body'));
    const h = heights(base);
    const wasm = await loadManifold();
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    const probe = (w: number, z0: number, z1: number) => body.intersect(wasm.Manifold.cube([w, w, z1 - z0], true).translate([cx, cy, (z0 + z1) / 2])).volume();
    expect(probe(14.05, h.plateTop - MX.plate, h.plateTop)).toBeLessThan(1e-6);
    expect(probe(14.4, h.plateTop - MX.plate, h.plateTop)).toBeGreaterThan(0);
    expect(probe(MX.pocket - 0.05, 1.6, h.plateTop - MX.plate)).toBeLessThan(1e-6);
    expect(probe(10, 0, 1.6)).toBeGreaterThan(10 * 10 * 1.6 * 0.99);
  });
});

describe('design', () => {
  const image: ClickerImage = {
    width: 100,
    height: 60,
    silhouette: [square(0, 0, 100, 60)],
    regions: [
      { index: 0, color: [200, 30, 40], contours: [square(0, 0, 50, 60)] },
      { index: 1, color: [30, 80, 220], contours: [square(50, 0, 100, 60)] },
    ],
  };

  it('inlays the picture in the cap face, which prints face down', async () => {
    const r = await run({}, { image, colours: { '0': { color: [0, 0, 0] } } });
    const inlays = r.parts.filter((p) => /^Colour/.test(p.name));
    expect(inlays).toHaveLength(2);
    expect(inlays.some((p) => p.color.join() === '0,0,0')).toBe(true);
    for (const p of inlays) {
      expect(box(p).min[2]).toBeCloseTo(0, 5);
      expect(box(p).max[2]).toBeCloseTo(base.imageDepth, 5);
    }
    expect((await solid(named(r, 'Cap'))).decompose()).toHaveLength(1);
    expect((await solid(named(r, 'Body'))).decompose()).toHaveLength(1);
  });

  it('grows a cap that is too small for the switch', async () => {
    const r = await run({ shape: 'outline', size: 20 }, { image });
    expect(has(r, /Grew the cap/)).toBe(true);
    const c = box(named(r, 'Cap'));
    expect(Math.min(c.max[0] - c.min[0], c.max[1] - c.min[1])).toBeGreaterThanOrEqual(NEEDS - 1e-3);
  });

  it('gives each key its own text, switch and cap', async () => {
    const r = await run({ source: 'text', legends: 'A,B,C', keys: 3, size: 24 });
    expect(r.parts.filter((p) => /^Cap \d$/.test(p.name))).toHaveLength(3);
    expect(r.parts.filter((p) => / Text$/.test(p.name))).toHaveLength(3);
    const body = box(named(r, 'Body'));
    expect(body.max[0] - body.min[0]).toBeGreaterThan(3 * 24);
    const grid = await run({ source: 'none', keys: 4, layout: 'grid', columns: 2, size: 24 });
    const g = box(named(grid, 'Body'));
    expect(g.max[0] - g.min[0]).toBeCloseTo(g.max[1] - g.min[1], 0);
  });

  it('adds a keyring loop or hole', async () => {
    const plain = box(named(await run({ source: 'none' }), 'Body'));
    const loop = box(named(await run({ source: 'none', keychain: 'loop', keychainSide: 'top' }), 'Body'));
    expect(loop.max[1] - plain.max[1]).toBeGreaterThan(5);
    expect(has(await run({ source: 'none', keychain: 'hole' }), /border of 6 mm/)).toBe(true);
    // Volumes straight away: the next build frees this build's WebAssembly objects.
    const holed = (await solid(named(await run({ source: 'none', keychain: 'hole', border: 8 }), 'Body'))).volume();
    const solidBody = (await solid(named(await run({ source: 'none', border: 8 }), 'Body'))).volume();
    expect(solidBody - holed).toBeGreaterThan(20);
  });
});

describe('older settings', () => {
  it('turns "show it assembled" into the preview choice', async () => {
    const def = (await import('../src/index')).default;
    expect(def.migrate!({ showAssembled: false }, '1.1.0')).toEqual({ preview: 'none' });
    expect(def.migrate!({ showAssembled: true }, '1.1.0')).toEqual({ preview: 'assembled' });
  });
});

describe('exploded view', () => {
  it('puts a switch over each socket and the caps over those', async () => {
    const r = await run({ source: 'text', legends: 'A,B', keys: 2, preview: 'exploded' });
    const names = r.parts.filter((q) => q.role === 'preview').map((q) => q.name);
    expect(names.filter((n) => n.startsWith('Switch')).length).toBe(2);
    const body = box(r.parts.find((q) => q.name === 'Body (exploded)')!);
    const sw = box(r.parts.find((q) => q.name === 'Switch 1 (exploded)')!);
    const cap = box(r.parts.find((q) => q.name === 'Cap 1 (exploded)')!);
    expect(sw.min[2]).toBeGreaterThan(body.max[2]);
    expect(cap.min[2]).toBeGreaterThan(sw.max[2]);
  });
});
