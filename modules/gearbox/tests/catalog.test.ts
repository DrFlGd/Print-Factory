/**
 * Every catalog part in every size it is made in, checked against the size GearBox's own
 * catalog renders recorded (within 0.6 mm, as tools/render-catalog.mjs checks). Slow:
 * runs only with GEARBOX_CATALOG=1 (or =M2 for one size).
 */
import { defaults } from '@pf/core';
import type { ParamSchema } from '@pf/core';
import { runScad } from '@pf/engine-openscad/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import { catalog, partInSize, SIZES } from '../src/parts';
import { program, type Params } from '../src/program';
import { fieldFor } from '../src/schema';

const base = defaults(params as ParamSchema) as unknown as Params;
const only = process.env.GEARBOX_CATALOG;

export function formValues(p: { params: Record<string, string | number> }): Params {
  const { part, ...rest } = p.params;
  const v: Params = { ...base, mode: 'part', part: String(part) };
  for (const [k, x] of Object.entries(rest)) v[fieldFor(String(part), k)] = x;
  return v;
}

describe.skipIf(!only)('the catalog', () => {
  for (const size of SIZES.filter((s) => only === '1' || only === s)) {
    it(`renders every ${size} part at its recorded size`, async () => {
      const bad: string[] = [];
      for (const p of catalog.parts.filter((q) => partInSize(q, size) && q.params.part !== 'assembly')) {
        const r = await runScad(program, { ...formValues(p), size });
        const errs = (r.diagnostics ?? []).filter((d) => d.level === 'error');
        if (errs.length || !r.parts.length) {
          bad.push(`${p.name}: ${errs.map((e) => e.message).join('; ')}`);
          continue;
        }
        const q = r.parts[0]!.positions;
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < q.length; i += 3) for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k]!, q[i + k]!)), (max[k] = Math.max(max[k]!, q[i + k]!));
        const got = max.map((m, k) => Math.round((m - min[k]!) * 100) / 100);
        const want = p.expect?.[size];
        if (want && want.some((e, i) => Math.abs(got[i]! - e) > 0.6)) bad.push(`${p.name}: ${got.join('x')}, expected ${want.join('x')}`);
      }
      expect(bad).toEqual([]);
    }, 3_600_000);
  }
});
