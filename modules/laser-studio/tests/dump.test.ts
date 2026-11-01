// Writes every preset's cut file to $LS_OUT for a look (LS_OUT=/some/dir npx vitest run modules/laser-studio/tests/dump.test.ts); skipped otherwise.
import { defaults } from '@pf/core';
import type { ParamSchema } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { buildSVG, splitSheets } from '@pf/export';
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import params from '../params.json';
import presets from '../presets.json';
import type { Params } from '../src/build';
import { build } from '../src/build';

const base = defaults(params as ParamSchema) as unknown as Params;
it.skipIf(!process.env.LS_OUT)('dump', async () => {
  for (const pr of presets) {
    const t0 = Date.now();
    const r = await runBuild(await loadManifold(), build, { ...base, ...(pr.values as Partial<Params>) });
    console.log(pr.id, Date.now() - t0, 'ms |', r.summary, '|', (r.diagnostics ?? []).map((d) => d.level[0] + ': ' + d.message).join(' | '));
    const d = splitSheets(r.drawing!)[0]!.drawing;
    writeFileSync(`${process.env.LS_OUT}/svg-${pr.id}.svg`, buildSVG({ layers: d.layers }, { hairline: 0.25 }));
  }
});
