// Every design's faces, checked flat: the lettering inside the card and off the colour fields,
// and no two pieces on top of each other.
import { defaults } from '@pf/core';
import type { ParamSchema } from '@pf/core';
import { createContext, loadManifold } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { TEMPLATES } from '../src/build';
import { Card } from '../src/layout';
import type { Face } from '../src/types';

const base = defaults(params as ParamSchema) as unknown as Params;

async function check(over: Partial<Params>, label: string) {
  const wasm = await loadManifold();
  for (const t of TEMPLATES) {
    const p = { ...base, ...over, template: t.id } as Params;
    const ctx = createContext(wasm, p, {});
    const card = new Card(ctx, [], !!t.portrait);
    const plan = await t.build(card);
    const inside = ctx.CrossSection.square([plan.w - 2, plan.h - 2], true);
    const faces: [string, Face | null][] = [['front', plan.front], ['back', plan.back]];
    for (const [side, f] of faces) {
      if (!f) continue;
      const what = `${label} ${t.id} ${side}`;
      // The carved monogram and the fields run off the edge on purpose; the lettering does not.
      for (const pc of f.ink) expect(pc.cs.subtract(inside).area(), `${what} ${pc.role} inside`).toBeLessThan(0.05);
      if (f.fields)
        for (const pc of f.ink.filter((x) => !x.onField && x.role !== 'tap')) expect(pc.cs.intersect(f.fields).area(), `${what} ${pc.role} off the fields`).toBeLessThan(0.3);
      if (f.pattern)
        for (const pc of f.ink.filter((x) => !x.onField)) expect(pc.cs.intersect(f.pattern.area).area(), `${what} ${pc.role} off the pattern`).toBeLessThan(0.3);
      const solo = f.ink.filter((x) => x.role !== 'logo' && x.role !== 'qr');
      for (let i = 0; i < solo.length; i++)
        for (let j = i + 1; j < solo.length; j++) expect(solo[i]!.cs.intersect(solo[j]!.cs).area(), `${what} ${solo[i]!.role}/${solo[j]!.role} overlap`).toBeLessThan(0.3);
      if (plan.cutouts) for (const pc of f.ink) expect(pc.cs.intersect(plan.cutouts).area(), `${what} over the window`).toBeLessThan(0.01);
    }
  }
}

describe('layouts', () => {
  it('keeps every design tidy at the default size', () => check({}, '85x55'), 120000);
  it('and on a short US card with the logo and code on the front', () => check({ size: '89x51', twoSided: false }, 'us one-sided'), 120000);
});
