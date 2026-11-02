import { defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build } from '../src/build';
import { decodePhoto, framer, photoFromRgba, toner } from '../src/image';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}, inputs: Record<string, unknown> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, detail: 'draft', ...over }, inputs);
const named = (r: BuildResult, n: string) => r.parts.find((p) => p.name === n);
const errors = (r: BuildResult) => (r.diagnostics ?? []).filter((d) => d.level === 'error');
const size = (r: BuildResult, n: string) => {
  const b = partBounds([named(r, n)!]);
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
};
/** A plain picture, `v` grey (0 black … 255 white). */
const plain = (v: number, w = 40, h = 30) => photoFromRgba('plain', w, h, new Uint8Array(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : v)));

describe('lithophane tone and picture', () => {
  it('maps white to the thinnest wall and black to the thickest', () => {
    for (const mapping of ['natural', 'linear'] as const) {
      const t = toner({ ...base, mapping });
      expect(t(1)).toBeCloseTo(base.minThickness, 6);
      expect(t(0)).toBeCloseTo(base.maxThickness, 6);
      expect(t(0.5)).toBeGreaterThan(base.minThickness);
      expect(t(0.5)).toBeLessThan(base.maxThickness);
    }
    const neg = toner({ ...base, negative: true });
    expect(neg(1)).toBeCloseTo(base.maxThickness, 6);
  });

  it('keeps a photo as greyscale through a project file', () => {
    const p = plain(128, 3, 2);
    const g = decodePhoto(JSON.parse(JSON.stringify(p)));
    expect([g.width, g.height]).toEqual([3, 2]);
    expect(Array.from(g.data)).toEqual([128, 128, 128, 128, 128, 128]);
  });

  it('frames the picture: fill crops, fit leaves margins', () => {
    const g = decodePhoto(plain(0, 40, 20));
    const fill = framer(g, { ...base, fit: 'fill' }, 50, 50);
    const fit = framer(g, { ...base, fit: 'fit' }, 50, 50);
    expect(fill(0.5, 0.95)).toBe(0);
    expect(fit(0.5, 0.95)).toBeNull();
    expect(fit(0.5, 0.5)).toBe(0);
  });
});

describe('lithophane', () => {
  it('stands a flat panel upright on the bed, its height from the picture', async () => {
    const r = await run({ stand: 'none' });
    expect(errors(r)).toEqual([]);
    const [w, d, h] = size(r, 'Lithophane');
    expect(w).toBeCloseTo(100, 3);
    // The sample picture is 3:2 inside a 4 mm border.
    expect(h).toBeCloseTo(Math.round(92 * (400 / 600) + 8), 3);
    expect(d).toBeCloseTo(Math.max(base.frameThickness, base.maxThickness), 3);
    expect(partBounds([named(r, 'Lithophane')!]).min[2]).toBeCloseTo(0, 4);
  });

  it('a white photo is all thinnest wall inside the border, a black one all thickest', async () => {
    const vol = async (v: number) => {
      const r = await run({ stand: 'none', frame: 0, height: 50, width: 50 }, { photo: plain(v) });
      const p = named(r, 'Lithophane')!;
      const b = partBounds([p]);
      return b.max[1] - b.min[1];
    };
    expect(await vol(255)).toBeCloseTo(base.minThickness, 2);
    expect(await vol(0)).toBeCloseTo(base.maxThickness, 2);
  });

  it('builds every form, outline and stand', async () => {
    const cases: Partial<Params>[] = [
      ...(['rect', 'rounded', 'oval', 'heart', 'arch', 'hexagon'] as const).map((outline) => ({ outline, stand: 'hole' as const })),
      { stand: 'feet' },
      { stand: 'base', baseLight: 'strip' },
      { stand: 'base', baseLight: 'tealight' },
      { stand: 'none', printLying: true },
      { form: 'arc', stand: 'none' },
      { form: 'cylinder', height: 80, lampBase: 'tealight' },
      { form: 'cylinder', height: 80, relief: 'front', fitting: 'e14', lampBase: 'none' },
      { form: 'cone', height: 90, diameter: 110, topDiameter: 70, fitting: 'e27', lampBase: 'none' },
      { form: 'globe', diameter: 80, opening: 56, lampBase: 'puck', puckDia: 40 },
      { form: 'cube', side: 60, height: 70, lampBase: 'tealight' },
    ];
    for (const c of cases) {
      const r = await run(c);
      expect(errors(r), JSON.stringify(c)).toEqual([]);
      expect(named(r, 'Lithophane'), JSON.stringify(c)).toBeTruthy();
      const want = (c.stand === 'base' && c.form === undefined) || (c.lampBase !== undefined && c.lampBase !== 'none');
      expect(!!named(r, 'Base'), JSON.stringify(c)).toBe(want);
      for (const p of r.parts) expect(partBounds([p]).min[2], `${p.name} ${JSON.stringify(c)}`).toBeCloseTo(0, 3);
    }
  }, 120_000);

  it('a cylinder lamp is the diameter asked, its base lip inside it', async () => {
    // The smooth face is the diameter; the relief and rims stand inside or outside it.
    const inside = await run({ form: 'cylinder', diameter: 90, height: 80, relief: 'back' });
    expect(size(inside, 'Lithophane')[0]).toBeCloseTo(90, 0);
    expect(size(inside, 'Lithophane')[2]).toBeCloseTo(80, 3);
    expect(named(inside, 'Base')).toBeTruthy();
    const outside = await run({ form: 'cylinder', diameter: 90, height: 80, relief: 'front' });
    expect(size(outside, 'Lithophane')[0]).toBeCloseTo(90 + 2 * base.frameThickness, 0);
  });

  it('a shade with a fitting prints upside down with a ring the bulb holder passes', async () => {
    const r = await run({ form: 'cone', diameter: 120, topDiameter: 80, height: 100, fitting: 'e27', lampBase: 'none' });
    expect((r.diagnostics ?? []).some((d) => /upside down/.test(d.message))).toBe(true);
  });
});
