import { boundsSize, defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import { grooveWave, isolines, lightHoleSize, RING } from '../src/bauble';
import type { Params } from '../src/build';
import { build, FLAT_SHAPES, SHAPES, THEMES, threadWave, TOPPERS } from '../src/build';
import { connectivity, mask, tile } from '../src/patterns';
import { outline } from '../src/shapes';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });
const named = (r: BuildResult, name: string) => r.parts.find((p) => p.name === name)!;
async function solid(p: Part) {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  return wasm.Manifold.ofMesh(mesh);
}

describe('lace', () => {
  it('knows nets from separate motifs', () => {
    expect(connectivity(tile('asanoha')!, 1.5, 18)).toEqual({ u: true, v: true });
    expect(connectivity(tile('snowflakes')!, 1.5, 18)).toEqual({ u: false, v: false });
    // Around separate motifs, the gaps join up: lace cuts the motifs out.
    expect(connectivity(tile('snowflakes')!, 1.5, 18, true)).toEqual({ u: true, v: true });
  });

  it('cuts snowflakes out of the wall instead of losing it', async () => {
    const r = await run({ mode: 'lace', theme: 'traditional', traditionalPattern: 'snowflakes', repeats: 8, resolution: 'draft' });
    expect(r.diagnostics?.some((d) => /cuts them out/.test(d.message))).toBe(true);
    const m = await solid(named(r, 'Bauble'));
    const volume = m.volume();
    const shell = await run({ mode: 'lace', theme: 'plain', resolution: 'draft' });
    const full = (await solid(named(shell, 'Bauble'))).volume();
    // Most of the wall stays.
    expect(volume).toBeGreaterThan(full * 0.6);
    expect(volume).toBeLessThan(full * 0.97);
  }, 60000);
});
