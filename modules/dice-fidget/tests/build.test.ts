import { defaults, partBounds } from '@pf/core';
import type { ParamSchema } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { expect, it } from 'vitest';
import { normals } from '../src/dice';
import schema from '../params.json';
import { build, type Params } from '../src/build';

const base = defaults(schema as ParamSchema) as unknown as Params;
it.each([4, 6, 8, 10, 12, 20])('exports a bedded D%i body and one separate panel per face', async (count) => {
  const result = await runBuild(await loadManifold(), build, { ...base, die: 'd' + count, legend: 'blank' });
  expect(result.parts).toHaveLength(count + 1);
  for (const part of result.parts) expect(partBounds([part]).min[2]).toBeCloseTo(0, 3);
});

async function volume(part: import('@pf/core').Part) {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: part.positions, triVerts: part.indices });
  mesh.merge();
  const solid = wasm.Manifold.ofMesh(mesh);
  expect(solid.status()).toBe('NoError');
  return solid.volume();
}

it.each([4, 6, 8, 10, 12, 20])('cuts one complete clip plate opening per D%i face', async (count) => {
  const wasm = await loadManifold();
  const params = { ...base, die: 'd' + count, legend: 'blank' };
  const a = await runBuild(wasm, build, { ...params, socketFit: 0 });
  const b = await runBuild(wasm, build, { ...params, socketFit: 0.3 });
  expect((await volume(a.parts[0]!)) - (await volume(b.parts[0]!))).toBeCloseTo(count * 1.5 * (14.3 ** 2 - 14 ** 2), 1);
});

it('engraves the corresponding panels and preserves blank lines', async () => {
  const result = await runBuild(await loadManifold(), build, {
    ...base,
    legend: 'custom',
    labels: 'GO\n\nSTOP',
    shape: 'hexagon',
    profile: 'bevel',
    preview: true,
  });
  const panels = result.parts.filter((p) => p.role !== 'preview' && p.name.startsWith('Panel'));
  const volumes = await Promise.all(panels.map(volume));
  expect(volumes[0]).toBeLessThan(volumes[1]!);
  expect(volumes[2]).toBeLessThan(volumes[1]!);
  expect(volumes[3]).toBeCloseTo(volumes[1]!, 2);
  expect(result.parts.filter((p) => p.role === 'preview')).toHaveLength(13);
});

it.each([
  [4, 3],
  [6, 4],
  [8, 3],
  [10, 4],
  [12, 5],
  [20, 3],
])('matches every D%i panel to its face', async (count, corners) => {
  const size = 19;
  const result = await runBuild(await loadManifold(), build, {
    ...base,
    die: 'd' + count,
    size,
    shape: 'face',
    legend: 'blank',
    preview: true,
  });
  for (const panel of result.parts.filter((p) => p.name.startsWith('Panel '))) {
    const top = new Map<string, number[]>();
    for (let i = 0; i < panel.positions.length; i += 3) {
      const [x, y, z] = panel.positions.slice(i, i + 3);
      if (Math.abs(z!) < 1e-5) top.set(x + ',' + y, [x!, y!]);
    }
    expect(top.size).toBe(corners);
    const points = [...top.values()];
    const diameter = Math.max(...points.flatMap(([x, y]) => points.map((q) => Math.hypot(q[0]! - x!, q[1]! - y!))));
    expect(diameter).toBeCloseTo(size, 3);
    expect(await volume(panel)).toBeGreaterThan(0);
  }
});

it.each([4, 6, 8, 10, 12, 20].flatMap((count) => [false, true].map((switchRecessed) => ({ count, switchRecessed }))))(
  'clears the body at full travel on a recessed 60 mm D$count, switch recess $switchRecessed',
  async ({ count, switchRecessed }) => {
    const wasm = await loadManifold();
    const result = await runBuild(wasm, build, {
      ...base,
      die: 'd' + count,
      size: 60,
      switchRecessed,
      switchDepth: 16,
      shape: 'face',
      recessed: true,
      recessDepth: 6,
      preview: true,
      legend: 'blank',
    });
    const solid = (name: string) => {
      const part = result.parts.find((p) => p.name === name)!;
      const mesh = new wasm.Mesh({ numProp: 3, vertProperties: part.positions, triVerts: part.indices });
      mesh.merge();
      const m = wasm.Manifold.ofMesh(mesh);
      expect(m.status()).toBe('NoError');
      return m;
    };
    const body = solid('Assembled body');
    for (const [i, n] of normals('d' + count).entries()) {
      const cap = solid('Mounted panel ' + (i + 1));
      const pressed = cap.translate([-4 * n[0], -4 * n[1], -4 * n[2]]);
      expect(pressed.intersect(body).volume()).toBeLessThan(1e-3);
    }
    const panel = result.parts.find((p) => p.name === 'Panel 1')!;
    expect(partBounds([panel]).max[2]).toBeCloseTo(9, 3); // 3 mm roof plus 6 mm rim.
  },
);

it('keeps the recess switch optional in existing projects', async () => {
  const wasm = await loadManifold();
  const params = { ...base };
  delete params.recessed;
  delete params.recessDepth;
  const old = await runBuild(wasm, build, params);
  const off = await runBuild(wasm, build, { ...base, recessed: false, recessDepth: 6 });
  expect(off.parts).toEqual(old.parts);
});

it.each([false, true])('cuts a switch well with a solid border (panel recess %s)', async (recessed) => {
  const wasm = await loadManifold();
  const result = await runBuild(wasm, build, {
    ...base,
    die: 'd6',
    shape: 'circle',
    size: 40,
    switchRecessed: true,
    switchDepth: 16,
    recessed,
    recessDepth: 6,
    preview: true,
  });
  const asSolid = (name: string) => {
    const p = result.parts.find((p) => p.name === name)!;
    const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
    mesh.merge();
    const m = wasm.Manifold.ofMesh(mesh);
    expect(m.status()).toBe('NoError');
    return m;
  };
  // The first cube face lies on the bed. Sample inside the pocket near its
  // perimeter and on each of its four edges for the full depth of the well.
  const body = asSolid('Die body');
  const r = body.boundingBox().max[2] / 2;
  for (const [x, y] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const probe = (distance: number) =>
      wasm.Manifold.cube([0.5, 0.5, 15.8], true).translate([x! * distance, y! * distance, 8]);
    expect(body.intersect(probe(19)).volume()).toBeCloseTo(0, 4);
    expect(body.intersect(probe(r - 1)).volume()).toBeCloseTo(0.5 * 0.5 * 15.8, 3);
  }
  const assembled = asSolid('Assembled body');
  for (const [i, n] of normals('d6').entries()) {
    const pressed = asSolid('Mounted panel ' + (i + 1)).translate([-4 * n[0], -4 * n[1], -4 * n[2]]);
    expect(pressed.intersect(assembled).volume()).toBeLessThan(1e-3);
  }
});
