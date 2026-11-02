// PREVIEW=dir writes every design's two faces as SVG, for looking at.
import { defaults } from '@pf/core';
import type { ParamSchema } from '@pf/core';
import { createContext, loadManifold } from '@pf/engine-manifold/node';
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { TEMPLATES } from '../src/build';
import { Card } from '../src/layout';
import type { Face } from '../src/types';

const dir = process.env.PREVIEW;
const base = defaults(params as ParamSchema) as unknown as Params;

describe.skipIf(!dir)('preview', () => {
  it('draws every design', async () => {
    const wasm = await loadManifold();
    const over = JSON.parse(process.env.PREVIEW_OVER ?? '{}');
    for (const t of TEMPLATES) {
      const p = { ...base, ...over, template: t.id } as Params;
      const ctx = createContext(wasm, p, {});
      const card = new Card(ctx, [], !!t.portrait);
      const plan = await t.build(card);
      const hex = (c: number[]) => `rgb(${c.join(',')})`;
      const col = (k: string) => hex(k === 'card' ? p.cardColor : k === 'ink' ? p.inkColor : p.accentColor);
      const path = (cs: { isEmpty(): boolean } | null) => (cs && !cs.isEmpty() ? ctx.contours(cs as never).map((c) => 'M' + c.join(' ').replace(/(\S+) (\S+)/g, '$1,$2 ') + 'Z').join(' ') : '');
      const draw = (f: Face | null, dx: number, mirror: boolean) => {
        if (!f) return '';
        const g = [`<g transform="translate(${dx},0) scale(${mirror ? -1 : 1},-1)">`];
        g.push(`<rect x="${-plan.w / 2}" y="${-plan.h / 2}" width="${plan.w}" height="${plan.h}" rx="${p.corner}" fill="${col(plan.reveal && mirror ? 'accent' : 'card')}"/>`);
        if (f.fields) g.push(`<path d="${path(f.fields)}" fill="${col('accent')}" fill-rule="evenodd"/>`);
        if (f.pattern) g.push(`<path d="${path(f.pattern.cs)}" fill="${f.pattern.mode === 'cut' ? '#fff' : f.pattern.mode === 'carved' ? '#555' : col('accent')}" fill-rule="evenodd"/>`);
        if (f.carved) g.push(`<path d="${path(f.carved)}" fill="${col('accent')}" fill-rule="evenodd"/>`);
        for (const pc of f.ink) g.push(`<path d="${path(pc.cs)}" fill="${col(pc.colour)}" fill-rule="evenodd"/>`);
        if (plan.cutouts) g.push(`<path d="${path(plan.cutouts)}" fill="#fff" fill-rule="evenodd"/>`);
        if (plan.pocket) g.push(`<circle cx="${plan.pocket.x}" cy="${plan.pocket.y}" r="${plan.pocket.r}" fill="none" stroke="#f0f" stroke-width="0.3" stroke-dasharray="1 1"/>`);
        g.push('</g>');
        return g.join('');
      };
      const W = plan.w * 2 + 10;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-plan.w / 2 - 2} ${-plan.h / 2 - 2} ${W + 4} ${plan.h + 4}" width="${(W + 4) * 6}" height="${(plan.h + 4) * 6}"><rect x="-1000" y="-1000" width="3000" height="3000" fill="#fff"/>${draw(plan.front, 0, false)}${draw(plan.back, plan.w + 10, true)}</svg>`;
      writeFileSync(`${dir}/${t.id}.svg`, svg);
    }
  }, 120000);
});
