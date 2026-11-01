import { boundsSize, defaults, partBounds } from '@pf/core';
import type { ParamSchema } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build } from '../src/build';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}) => runBuild(await loadManifold(), build, { ...base, ...over });

describe('name keychain', () => {
  it('builds a two-colour keychain with a tab, plate under the letters', async () => {
    const r = await run();
    expect(r.parts.map((p) => p.name)).toEqual(['Plate', 'Letters']);
    const [w, h, d] = boundsSize(partBounds(r.parts));
    expect(w).toBeGreaterThan(60);
    expect(h).toBeGreaterThan(12);
    expect(d).toBeCloseTo(base.baseThickness + base.textHeight, 2);
    expect(new Set(r.parts.map((p) => p.group))).toEqual(new Set(['keychain']));
  });

  it('three colours adds a border; inlay keeps the top flat', async () => {
    const three = await run({ layers: 3 });
    expect(three.parts.map((p) => p.name)).toEqual(['Plate', 'Letters', 'Border']);
    const inlay = await run({ textStyle: 'inlay' });
    expect(boundsSize(partBounds(inlay.parts))[2]).toBeCloseTo(base.baseThickness, 2);
    const letters = inlay.parts.find((p) => p.name === 'Letters')!;
    expect(partBounds([letters]).min[2]).toBeCloseTo(base.baseThickness - base.depth, 1);
  });

  it('one colour is one part; every shape and ring builds', async () => {
    expect((await run({ layers: 1 })).parts).toHaveLength(1);
    for (const shape of ['outline', 'rounded', 'pill', 'none'] as const)
      for (const ring of ['tab', 'hole', 'none'] as const)
        for (const ringSide of ['left', 'top', 'right'] as const) {
          const r = await run({ shape, ring, ringSide, text: 'Ab' });
          expect(r.parts.length, `${shape}/${ring}/${ringSide}`).toBeGreaterThan(0);
        }
  });

  it('without an AMS says where to swap filament, and warns about inlays', async () => {
    const r = await run({ ams: false });
    expect(r.diagnostics?.some((d) => /pause at 2\.40 mm/.test(d.message))).toBe(true);
    const inlay = await run({ ams: false, textStyle: 'inlay' });
    expect(inlay.diagnostics?.some((d) => d.level === 'warning')).toBe(true);
  });

  it('handles empty text, missing glyphs and other scripts', async () => {
    expect((await run({ text: '   ' })).parts).toHaveLength(0);
    const greek = await run({ text: 'Ωmega Жук' });
    expect(greek.parts.length).toBe(2);
    expect(greek.diagnostics?.some((d) => d.level === 'warning')).toBeFalsy();
  });
});
