import { defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params, PopImage } from '../src/build';
import { build, pitchOf, POP, SOCKET_WALL, travel } from '../src/build';
import { SHAPE_IDS } from '../src/shapes';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}, inputs: Record<string, unknown> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over }, inputs);
const box = (p: Part) => partBounds([p]);
const has = (r: BuildResult, re: RegExp) => (r.diagnostics ?? []).some((d) => re.test(d.message));
async function solidOf(p: Part) {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  const m = wasm.Manifold.ofMesh(mesh);
  expect(m.status(), `${p.name} is watertight`).toBe('NoError');
  return m;
}
const centre = (p: Part): [number, number] => {
  const b = box(p);
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
};
const square = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];

describe('the pop', () => {
  it('prints the button free of the body, in its bore', async () => {
    const r = await run({ buttonCount: 1 });
    const body = await solidOf(r.parts[0]!);
    const btn = await solidOf(r.parts.find((p) => p.name === 'Button 1')!);
    expect(body.intersect(btn).volume()).toBeLessThan(1e-6);
    const b = box(r.parts.find((p) => p.name === 'Button 1')!);
    expect(b.min[2]).toBeCloseTo(0, 5);
    expect(b.max[2]).toBeCloseTo(POP.button.height, 5);
  });

  it('the bead has to push the beams aside, and the button stops at both ends', async () => {
    const r = await run({ buttonCount: 1 });
    const body = await solidOf(r.parts[0]!);
    const btn = await solidOf(r.parts.find((p) => p.name === 'Button 1')!);
    const hit = (dz: number) => body.intersect(btn.translate([0, 0, dz])).volume();
    const t = travel();
    expect(t).toBeGreaterThan(3.4);
    // Half way the bead is level with the beams: they overlap and must flex.
    expect(hit(-(POP.button.beadZ - (POP.beam.z0 + POP.beam.z1) / 2))).toBeGreaterThan(0.5);
    // Pressed all the way, the bead is past the beams and nothing overlaps.
    expect(hit(-t + 0.05)).toBeLessThan(1e-6);
    // Any further and the cap lands on the beams; at rest it can lift only until the skirt meets them.
    expect(hit(-t - 0.3)).toBeGreaterThan(0);
    expect(hit(POP.beam.z0 - POP.button.skirtTop - 0.05)).toBeLessThan(1e-6);
    expect(hit(POP.beam.z0 - POP.button.skirtTop + 0.3)).toBeGreaterThan(0);
  });

  it('widens only the bore with the clearance', async () => {
    const vol = async (clearance: number) => (await solidOf((await run({ buttonCount: 1, includeButtons: false, clearance })).parts[0]!)).volume();
    const removed = (await vol(0)) - (await vol(0.2));
    const r0 = POP.bore / 2;
    const ring = Math.PI * ((r0 + 0.1) ** 2 - r0 ** 2);
    expect(removed).toBeGreaterThan(ring * (POP.height - 2 * POP.chamfer - (POP.pocket.z1 - POP.pocket.z0)) * 0.7);
    expect(removed).toBeLessThan(ring * POP.height * 1.1);
  });
});

describe('layout', () => {
  it('keeps every socket a wall from the edge and from each other', async () => {
    const r = await run({ shape: 'roundedSquare', size: 150, buttonCount: 40, layout: 'grid', buttonSpacing: 0.5 });
    const buttons = r.parts.filter((p) => p.name.startsWith('Button'));
    expect(buttons.length).toBe(36);
    expect(has(r, /Room for 36 of 40/)).toBe(true);
    const pts = buttons.map(centre);
    const pitch = pitchOf({ ...base, buttonSpacing: 0.5 });
    for (let i = 0; i < pts.length; i++) {
      for (let j = 0; j < i; j++) expect(Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1])).toBeGreaterThanOrEqual(pitch - 1e-6);
      expect(Math.max(Math.abs(pts[i]![0]), Math.abs(pts[i]![1]))).toBeLessThanOrEqual(75 - POP.keepout / 2 - SOCKET_WALL + 1e-6);
    }
  });

  it('spreads buttons and says when fewer fit', async () => {
    const r = await run();
    expect(r.parts.filter((p) => p.name.startsWith('Button'))).toHaveLength(5);
    const tiny = await run({ size: 22 });
    expect(tiny.parts).toHaveLength(1);
    expect(has(tiny, /No room for a pop button/)).toBe(true);
    const empty = await run({ includeButtons: false });
    expect(empty.parts.map((p) => p.name)).toEqual(['Body']);
  });

  it('builds every shape as one piece', async () => {
    for (const shape of SHAPE_IDS) {
      const r = await run({ shape, size: 120 });
      expect((await solidOf(r.parts[0]!)).decompose().length, shape).toBe(1);
      expect(r.parts.length, shape).toBeGreaterThan(1);
      const b = box(r.parts[0]!);
      expect(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]), shape).toBeCloseTo(120, 0);
      expect(b.max[2]).toBeCloseTo(POP.height, 5);
    }
  });
});

describe('picture', () => {
  const image: PopImage = {
    width: 100,
    height: 60,
    silhouette: [square(0, 0, 100, 60)],
    regions: [
      { index: 0, color: [200, 30, 40], contours: [square(0, 0, 50, 60)] },
      { index: 1, color: [30, 80, 220], contours: [square(50, 0, 100, 60)] },
    ],
  };

  it('inlays the colours flush in the bottom face, clear of the bores', async () => {
    const r = await run({ bleed: 0 }, { image, colours: { '1': { color: [0, 0, 0] } } });
    const inlays = r.parts.filter((p) => p.name.startsWith('Colour'));
    expect(inlays).toHaveLength(2);
    expect(inlays.some((p) => p.color.join() === '0,0,0')).toBe(true);
    for (const p of inlays) {
      expect(box(p).min[2]).toBeCloseTo(0, 5);
      expect(box(p).max[2]).toBeCloseTo(base.imageDepth, 5);
      const btns = r.parts.filter((q) => q.name.startsWith('Button'));
      const m = await solidOf(p);
      for (const b of btns) expect(m.intersect(await solidOf(b)).volume()).toBeLessThan(1e-6);
    }
    expect(has(r, /swaps filament/)).toBe(true);
  });

  it('cuts the body round the picture', async () => {
    const r = await run({ shape: 'outline', size: 120, imageMargin: 3 }, { image });
    const b = box(r.parts[0]!);
    expect(b.max[0] - b.min[0]).toBeCloseTo(120, 0);
    expect(b.max[1] - b.min[1]).toBeCloseTo((114 * 60) / 100 + 6, 0);
    expect(has(await run({ shape: 'outline' }), /needs a picture/)).toBe(true);
  });
});
