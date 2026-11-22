import { defaults, partBounds } from '@pf/core';
import type { ParamSchema } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { expect, it } from 'vitest';
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
