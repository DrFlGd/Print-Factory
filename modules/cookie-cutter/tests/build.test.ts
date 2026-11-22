import { boundsSize, defaults, partBounds } from '@pf/core';
import type { ParamSchema } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import { build } from '../src/build';
import { COOKIE_SHAPES } from '../src/catalog';
import { outlinePdf } from '../src/pdf';
import type { CookieImage, Params } from '../src/types';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}, inputs: Record<string, unknown> = {}) =>
  runBuild(await loadManifold(), build, { ...base, ...over }, inputs);
const print = (r: Awaited<ReturnType<typeof run>>) => r.parts.filter(x => x.role !== 'reference' && x.role !== 'preview');

describe('Cookie Cutter Studio', () => {
  it('offers 104 distinct ready-to-print shapes including the screenshot favourites', () => {
    expect(COOKIE_SHAPES).toHaveLength(104);
    expect(new Set(COOKIE_SHAPES.map(x => x.id)).size).toBe(104);
    for (const name of ['Gingerbread man', 'Christmas tree', 'Star', 'Snowflake', 'Bell', 'Candy cane', 'Reindeer', 'Santa hat', 'Mitten', 'Stocking', 'Snowman', 'Gift box', 'Heart'])
      expect(COOKIE_SHAPES.some(s => s.label === name), name).toBe(true);
  });

  it('builds a cutter with a printable thin lip, protective rim and optional imprint', async () => {
    const r = await run();
    expect(print(r)).toHaveLength(1);
    expect(r.parts[0]?.name).toContain('Cookie cutter');
    const b = partBounds(print(r));
    expect(b.min[2]).toBeCloseTo(0, 2);
    expect(b.max[2]).toBeCloseTo(15, 2);
    expect(boundsSize(b)[0]).toBeGreaterThan(70);
    expect(r.drawing?.layers[0]?.contours.length).toBeGreaterThan(0);
    expect(r.diagnostics?.some(x => x.level === 'error')).toBe(false);
  });

  it('builds cutter-only and a grid with separate printable parts', async () => {
    const clean = await run({ cutterType: 'only', shapeId: 'star' });
    expect(print(clean)).toHaveLength(1);
    const grid = await run({ cutterType: 'only', shapeId: 'star', layout: 'grid', gridCols: 2, gridRows: 2 });
    expect(print(grid)).toHaveLength(4);
  });

  it('makes SVG and raster silhouettes without requiring browser-only dependencies', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10 L90 10 L90 90 L10 90 Z"/></svg>';
    const fromSvg = await run({ source: 'svg', cutterType: 'only' }, { cookieSvg: svg });
    expect(print(fromSvg).length).toBeGreaterThan(0);
    const pic: CookieImage = {
      width: 100, height: 100, silhouette: [[10, 10, 90, 10, 90, 90, 10, 90]],
      regions: [{ index: 0, color: [255, 255, 255], contours: [[10, 10, 90, 10, 90, 90, 10, 90]] }],
    };
    const fromPic = await run({ source: 'picture', cutterType: 'only' }, { image: pic });
    expect(print(fromPic).length).toBeGreaterThan(0);
  });

  it('makes a printable decorating stencil', async () => {
    const r = await run({ product: 'stencil', shapeId: 'heart' });
    expect(print(r)).toHaveLength(1);
    expect(boundsSize(partBounds(print(r)))[2]).toBeCloseTo(base.stencilThickness, 2);
  });

  it('makes an embossed cylindrical roller with an axle', async () => {
    const r = await run({ product: 'roller', shapeId: 'star', rollerRepeat: 3, rollerRows: 1, rollerLength: 75 });
    expect(print(r)).toHaveLength(1);
    expect(boundsSize(partBounds(print(r)))[2]).toBeGreaterThan(75);
  }, 60000);

  it('exports a true-size PDF with a calibration ruler', async () => {
    const r = await run({ cutterType: 'only', shapeId: 'star' });
    const pdf = outlinePdf(r.drawing!);
    expect(new TextDecoder().decode(pdf.subarray(0, 8))).toBe('%PDF-1.4');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('makes separate letter cutters laid out by plate', async () => {
    const r = await run({ alphabetChars: 'ABC', letterHeight: 40, printerBed: 160 });
    expect(print(r)).toHaveLength(3);
    expect(r.meta?.alphabet).toBe(true);
    expect(print(r).every(part => part.group?.startsWith('plate-'))).toBe(true);
  });
});
