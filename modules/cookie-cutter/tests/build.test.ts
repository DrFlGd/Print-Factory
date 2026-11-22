import { boundsSize, defaults, partBounds } from '@pf/core';
import type { ParamSchema } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import { build } from '../src/build';
import { connectRegions } from '../src/bridges';
import { rect, circle } from '@pf/shapes';
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
    expect(Math.max(...boundsSize(b).slice(0, 2))).toBeGreaterThan(70);
    expect(r.drawing?.layers[0]?.contours.length).toBeGreaterThan(0);
    expect(r.diagnostics?.some(x => x.level === 'error')).toBe(false);
  });

  it('builds cutter-only and a grid with separate printable parts', async () => {
    const clean = await run({ cutterType: 'only', shapeId: 'star' });
    expect(print(clean)).toHaveLength(1);
    const grid = await run({ cutterType: 'only', shapeId: 'star', layout: 'grid', gridCols: 2, gridRows: 2 });
    expect(print(grid)).toHaveLength(4);
  });

  it('joins neighbouring text regions without inserting a full-width strikethrough', async () => {
    const r = await runBuild(await loadManifold(), async ctx => {
      const shapes = [-25, 0, 25].map(x => ctx.cs([rect(10, 20)]).translate([x, 0]));
      const originalArea = shapes.reduce((total, sh) => total + sh.area(), 0);
      const joined = connectRegions(ctx, shapes, 2.8);
      return { parts: [], meta: {
        connections: joined.connections, pieces: joined.section.decompose().length,
        longest: joined.longest, extraArea: joined.section.area() - originalArea,
      } };
    }, base);
    expect(r.meta?.connections).toBe(2);
    expect(r.meta?.pieces).toBe(1);
    expect(Number(r.meta?.longest)).toBeLessThan(16);
    // Small tabs bridge two 15 mm gaps; a horizontal 4 mm bar across all three
    // rectangles would add much more area and look like a strike-through.
    expect(Number(r.meta?.extraArea)).toBeLessThan(110);
  });

  it('retains a stencil counter with one short, local support bridge', async () => {
    const r = await runBuild(await loadManifold(), async ctx => {
      const frame = ctx.cs([rect(90, 65)]);
      const glyph = ctx.cs([circle(18, 128)]).subtract(ctx.cs([circle(9, 128)]));
      const cut = frame.subtract(glyph);
      const islands = cut.decompose();
      const joined = connectRegions(ctx, islands, 1.4, true);
      return { parts: [], meta: {
        before: islands.length, after: joined.section.decompose().length,
        bridges: joined.connections, longest: joined.longest,
      } };
    }, base);
    expect(r.meta?.before).toBe(2);
    expect(r.meta?.after).toBe(1);
    expect(r.meta?.bridges).toBe(1);
    expect(Number(r.meta?.longest)).toBeLessThan(11);
  });

  it('keeps COOKIE stencil letters separate and joins cutter letters only locally', async () => {
    const stencil = await run({ product: 'stencil', source: 'text', shapeText: 'COOKIE' });
    expect(print(stencil)).toHaveLength(1);
    expect(stencil.diagnostics?.some(d => /short local stencil bridge/.test(d.message))).toBe(true);
    expect(stencil.diagnostics?.some(d => /across the stencil|across the word/.test(d.message))).toBe(false);

    const cutter = await run({ product: 'cutter', source: 'text', shapeText: 'COOKIE', cutterType: 'only' });
    expect(print(cutter)).toHaveLength(1);
    expect(cutter.diagnostics?.some(d => /short local bridge/.test(d.message))).toBe(true);
    expect(cutter.drawing?.layers[0]?.contours).toHaveLength(1);
  }, 60000);

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

  it('adds a separate push-fit embossing stamp plate and handle', async () => {
    const r = await run({ embossingStamp: true, shapeId: 'gingerbread-man', cutterType: 'only' });
    expect(print(r).map(x => x.name)).toContain('Embossing stamp plate');
    expect(print(r).map(x => x.name)).toContain('Embossing stamp handle');
    expect(r.diagnostics?.some(d => /push/.test(d.message))).toBe(true);
  });

  it('builds solid, single-contour stocking, Santa, gingerbread, tree and bell cutters', async () => {
    for (const id of ['stocking', 'santa-claus', 'gingerbread-man', 'christmas-tree', 'bell']) {
      const r = await run({ cutterType: 'only', shapeId: id });
      const outline = r.drawing?.layers[0]?.contours ?? [];
      expect(outline.length, id).toBe(1);
      expect(r.diagnostics?.some(x => x.level === 'error'), id).toBe(false);
      expect(print(r).length, id).toBe(1);
    }
  }, 60000);

  it('makes exactly two printable matched pieces with a locating ring and solid stamp cap', async () => {
    const height = 15;
    const r = await run({
      shapeId: 'gingerbread-man', cutterType: 'two-piece',
      height, imprintInset: 4.5, stampClearance: .5,
      embossingStamp: true, // the legacy separate-handle option must not add extra parts
    });
    const parts = print(r);
    expect(parts.map(x => x.name)).toEqual(['Cookie cutter 1', 'Nesting stamp 1']);
    expect(parts[0]!.group).toBe('cutter-0-0');
    expect(parts[1]!.group).toBe('nesting-stamp-0-0');
    const cutterB = partBounds([parts[0]!]);
    const stampB = partBounds([parts[1]!]);
    expect(cutterB.max[2] - cutterB.min[2]).toBeCloseTo(height, 1);
    expect(stampB.max[2] - stampB.min[2]).toBeGreaterThan(height - 4.5);
    expect(stampB.min[0]).toBeGreaterThan(cutterB.max[0]);
    expect(r.diagnostics?.some(x => /locating ring|radial clearance/.test(x.message))).toBe(true);
  }, 60000);

  it('gives an integrated imprint a full-area rear support rather than one skinny rib', async () => {
    const open = await run({ shapeId: 'gingerbread-man', cutterType: 'only', rimWidth: 0 });
    const stamped = await run({ shapeId: 'gingerbread-man', cutterType: 'imprint', rimWidth: 0 });
    expect(print(stamped)).toHaveLength(1);
    // The continuous base plus raised marks add substantial connected material.
    const openMesh = print(open)[0]!, stampedMesh = print(stamped)[0]!;
    expect(stampedMesh.positions.length).toBeGreaterThan(openMesh.positions.length);
    expect(stamped.diagnostics?.some(x => /continuous rear support/.test(x.message))).toBe(true);
  }, 60000);

  it('allows a nesting stamp with a transformed and mirrored shape', async () => {
    const r = await run({ shapeId: 'bell', cutterType: 'two-piece', mirror: true, aspect: 1.25, rotation: 20 });
    expect(print(r).map(x => x.name)).toEqual(['Cookie cutter 1', 'Nesting stamp 1']);
  }, 60000);

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
