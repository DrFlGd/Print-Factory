import { boundsSize, defaults, partBounds } from '@pf/core';
import type { ParamSchema } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build } from '../src/build';

const base = defaults(params as ParamSchema) as unknown as Params;

describe('__ID__', () => {
  it('builds a plate of the requested size', async () => {
    const r = await runBuild(await loadManifold(), build, base);
    expect(boundsSize(partBounds(r.parts)).map((n) => Math.round(n * 100) / 100)).toEqual([base.width, base.height, base.thickness]);
  });
});
