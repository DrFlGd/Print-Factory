// Writes each preset's flat mask to $BM_OUT as SVG for a look; skipped otherwise.
import { defaults } from '@pf/core';
import type { ParamSchema } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { buildSVG } from '@pf/export';
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import params from '../params.json';
import presets from '../presets.json';
import type { Params } from '../src/build';
import { build } from '../src/build';

const base = defaults(params as ParamSchema) as unknown as Params;
it.skipIf(!process.env.BM_OUT)('dump', async () => {
  for (const pr of presets) {
    const r = await runBuild(await loadManifold(), build, { ...base, ...(pr.values as Partial<Params>) });
    writeFileSync(`${process.env.BM_OUT}/svg-${pr.id}.svg`, buildSVG({ layers: r.drawing!.layers }, { hairline: 0.25 }));
  }
});
