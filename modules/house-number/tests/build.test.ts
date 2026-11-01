import { boundsSize, defaults, isVisible, partBounds } from '@pf/core';
import type { ParamSchema, ParamValues } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build } from '../src/build';

const schema = params as ParamSchema;
const base = defaults(schema) as unknown as Params;
const run = async (over: Partial<Params> = {}) => runBuild(await loadManifold(), build, { ...base, ...over });
const names = (r: { parts: { name: string }[] }) => r.parts.map((p) => p.name);

describe('house number', () => {
  it('builds a plate with raised text, sized to the text plus the margin', async () => {
    const r = await run();
    expect(names(r)).toEqual(['Plate', 'Text']);
    const [w, h, d] = boundsSize(partBounds(r.parts));
    expect(h).toBeGreaterThan(83);
    expect(h).toBeLessThan(87); // round figures overshoot the cap height slightly
    expect(w).toBeGreaterThan(60);
    expect(d).toBeCloseTo(base.plateThickness + base.textThickness, 2);
  });

  it('cuts keyholes into the back only', async () => {
    const r = await run({ plateThickness: 8 });
    expect(r.diagnostics?.some((d) => /Keyholes:/.test(d.message))).toBe(true);
    const thin = await run({ plateThickness: 3 });
    expect(thin.diagnostics?.some((d) => d.level === 'warning' && /Keyholes need/.test(d.message))).toBe(true);
  });

  it('second line below, beside, in a band; scale grows the face only', async () => {
    const two = await run({ text2: 'MAIN ST' });
    const one = await run();
    expect(boundsSize(partBounds(two.parts))[1]).toBeGreaterThan(boundsSize(partBounds(one.parts))[1] + 15);
    const beside = await run({ text2: 'ROOM', linePlacement: 'right' });
    expect(boundsSize(partBounds(beside.parts))[0]).toBeGreaterThan(boundsSize(partBounds(one.parts))[0] + 20);
    const band = await run({ text2: 'MAIN ST', divider: 'band' });
    expect(names(band)).toEqual(['Plate', 'Text']);
    const big = await run({ scale: 2 });
    const [w1, , d1] = boundsSize(partBounds(one.parts));
    const [w2, , d2] = boundsSize(partBounds(big.parts));
    expect(w2 / w1).toBeCloseTo(2, 1);
    expect(d2).toBeCloseTo(d1, 3);
  });

  it('inlay is flush; plate details are their own parts', async () => {
    const inlay = await run({ relief: 'inlay' });
    expect(boundsSize(partBounds(inlay.parts))[2]).toBeCloseTo(base.plateThickness, 2);
    const all = await run({ band: 'left', panel: true, frame: true });
    expect(names(all)).toEqual(['Plate', 'Strip', 'Panel', 'Frame', 'Text']);
  });

  it('every plate shape and mount builds; plateless joins the figures', async () => {
    for (const shape of ['rounded', 'rect', 'pill', 'plaque', 'none'] as const)
      for (const mount of ['keyhole', 'screws', 'tape'] as const) {
        const r = await run({ shape, mount, plateThickness: 6, text: '108' });
        expect(r.parts.length, `${shape}/${mount}`).toBeGreaterThan(0);
      }
    const floating = await run({ shape: 'none', text: '221' });
    expect(floating.diagnostics?.some((d) => /not joined/.test(d.message))).toBe(false);
    const vertical = await run({ shape: 'none', text: '47', orientation: 'vertical' });
    expect(boundsSize(partBounds(vertical.parts))[1]).toBeGreaterThan(100);
  });

  it('shows second-line controls only with a second line', () => {
    const p = schema.parameters.find((x) => x.name === 'linePlacement')!;
    expect(isVisible(p, { ...(base as unknown as ParamValues), text2: '' })).toBe(false);
    expect(isVisible(p, { ...(base as unknown as ParamValues), text2: 'x' })).toBe(true);
  });
});
