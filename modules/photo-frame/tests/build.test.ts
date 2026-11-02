import { defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { createContext, loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build } from '../src/build';
import { buildFrame, FIT } from '../src/frame';
import { buildHolder } from '../src/holder';
import { printOf } from '../src/sizes';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });
const printed = (r: BuildResult) => r.parts.filter((p) => p.role !== 'preview');
const named = (r: BuildResult, n: string) => r.parts.find((p) => p.name === n);
const size = (ps: Part[]) => {
  const b = partBounds(ps);
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
};
const errors = (r: BuildResult) => (r.diagnostics ?? []).filter((d) => d.level === 'error');

describe('photo frame', () => {
  it('prints the default frame face down with a back plate beside it, all on the bed', async () => {
    const r = await run();
    expect(errors(r)).toEqual([]);
    expect(printed(r).map((p) => p.name)).toEqual(['Frame', 'Words and pattern', 'Back plate']);
    for (const p of printed(r)) expect(partBounds([p]).min[2]).toBeCloseTo(0, 3);
    // The words lie in the face's first three layers.
    expect(partBounds([named(r, 'Words and pattern')!]).max[2]).toBeCloseTo(FIT.inlay, 3);
    expect(r.parts.some((p) => p.role === 'preview' && p.name === 'Your photo')).toBe(true);
  });

  it('holds the print: the pocket is bigger than it, the window smaller, the plate fits its slot', async () => {
    const wasm = await loadManifold();
    for (const photo of ['mini', '4x6', 'a5'] as const) {
      const ctx = createContext(wasm, { ...base, photo }, {});
      const notes: never[] = [];
      const { info } = await buildFrame(ctx, notes);
      const pr = printOf({ ...base, photo });
      expect(info.pocket.x1 - info.pocket.x0).toBeGreaterThan(pr.pw);
      expect(info.pocket.y1 - info.pocket.y0).toBeGreaterThan(pr.ph);
      expect(info.window.x1 - info.window.x0).toBeLessThan(pr.pw);
      expect(info.window.y1 - info.window.y0).toBeLessThan(pr.ph);
      // Plate 1 mm in a slot 0.2 mm deeper, a ceiling over it.
      expect(info.zCeil - info.zPlate0).toBeCloseTo(FIT.plate + FIT.plateClear, 6);
      expect(info.T - info.zCeil).toBeCloseTo(FIT.ceiling, 6);
    }
  });

  it('the back plate slides in: it never meets the frame', async () => {
    const wasm = await loadManifold();
    const ctx = createContext(wasm, base, {});
    const r = await buildFrame(ctx, []);
    const frame = r.parts.find((p) => p.name === 'Frame (standing)')!;
    const plate = r.parts.find((p) => p.name === 'Back plate (in place)')!;
    const toM = (p: Part) => {
      const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
      mesh.merge();
      return wasm.Manifold.ofMesh(mesh);
    };
    expect(toM(frame).intersect(toM(plate)).volume()).toBeLessThan(0.01);
  });

  it('builds every product, shape, profile and stand', async () => {
    const cases: Partial<Params>[] = [
      ...(['rect', 'arch', 'scallop', 'ricrac', 'squiggle'] as const).map((outline) => ({ outline })),
      ...(['flat', 'bevel', 'deep'] as const).map((profile) => ({ profile })),
      ...(['foot', 'kickstand', 'base', 'block', 'magnets', 'keychain', 'none'] as const).map((stand) => ({ stand, photo: 'mini' as const })),
      ...(['dots', 'checks', 'stripes', 'swirls', 'blobs', 'stars', 'hearts', 'deco'] as const).map((pattern) => ({ pattern, wordsAt: 'none' as const })),
      { product: 'song' },
      { product: 'post' },
      { crest: true, wordsAt: 'top' },
      { photo: 'custom', customWidth: 80, customHeight: 80 },
      { photo: '5x7', orientation: 'landscape' },
    ];
    for (const c of cases) {
      const r = await run(c);
      expect(errors(r), JSON.stringify(c)).toEqual([]);
      expect(named(r, 'Frame'), JSON.stringify(c)).toBeTruthy();
      expect(named(r, 'Back plate'), JSON.stringify(c)).toBeTruthy();
    }
  }, 120_000);

  it('a base or block is a separate part with a slot the frame stands in', async () => {
    for (const stand of ['base', 'block'] as const) {
      const r = await run({ stand });
      expect(named(r, stand === 'base' ? 'Base' : 'Block')).toBeTruthy();
    }
  });

  it('warns when magnets are asked to hold a big frame', async () => {
    const r = await run({ stand: 'magnets', photo: 'a5', magnet: '6x2' });
    expect((r.diagnostics ?? []).some((d) => d.level === 'warning' && /magnet/i.test(d.message))).toBe(true);
  });
});

describe('photo holder', () => {
  it('stands each holder on the bed with a slot a little wider than the print', async () => {
    const wasm = await loadManifold();
    for (const holder of ['ledge', 'pebble', 'heart'] as const) {
      for (const photo of ['mini', '4x6'] as const) {
        const p = { ...base, product: 'holder' as const, holder, photo };
        const ctx = createContext(wasm, p, {});
        const r = await buildHolder(ctx, []);
        const pr = printOf(p);
        expect(r.info.s).toBeGreaterThan(pr.film ? 0.9 : 0.35);
        const solid = r.parts.filter((q) => q.role !== 'preview');
        expect(solid.length).toBeGreaterThan(0);
        expect(partBounds(solid).min[2]).toBeCloseTo(0, 3);
        const [, , h] = size(solid);
        expect(h).toBeGreaterThan(7);
      }
    }
  });

  it('a ledge carries its words in the front', async () => {
    const r = await run({ product: 'holder', holder: 'ledge', front: 'Family' });
    const w = named(r, 'Words');
    expect(w).toBeTruthy();
    const ledge = partBounds([named(r, 'Ledge')!]);
    expect(partBounds([w!]).min[1]).toBeCloseTo(ledge.min[1], 3);
  });
});
