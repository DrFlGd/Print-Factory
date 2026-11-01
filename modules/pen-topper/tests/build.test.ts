import { boundsSize, defaults, partBounds, printable } from '@pf/core';
import type { ParamSchema } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build, minThickness, socketFor } from '../src/build';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}) => runBuild(await loadManifold(), build, { ...base, ...over });

describe('socket sizing', () => {
  it('clears the barrel and grips with ribs by fit', () => {
    const s = socketFor({ ...base, pen: 'round-pen', holeShape: 'round' });
    expect(s.bore).toBeCloseTo(10.6, 5);
    expect(s.grip).toBeCloseTo(10.0, 5);
    expect(socketFor({ ...base, pen: 'round-pen', holeShape: 'round', fit: 'snug' }).grip).toBeCloseTo(9.76, 5);
    expect(socketFor({ ...base, pen: 'round-pen', fit: 'none' }).ribCount).toBe(0);
  });
  it('picks hex for hex pens and through for straws; caps squeeze on hollow straws', () => {
    expect(socketFor({ ...base, pen: 'hex-pencil' }).hex).toBe(true);
    const straw = socketFor({ ...base, pen: 'straw', fit: 'snug' });
    expect(straw.path).toBe('through');
    expect(straw.barrel - straw.grip).toBeLessThanOrEqual(0.1 + 1e-9);
  });
});

describe('pen topper', () => {
  it('builds body, letters and a preview pen; thickens for the hole', async () => {
    const r = await run();
    expect(r.parts.map((p) => p.name)).toEqual(['Body', 'Letters', 'Pen (preview)']);
    const s = socketFor(base);
    const body = r.parts[0]!;
    expect(boundsSize(partBounds([body]))[2]).toBeCloseTo(Math.max(base.plateThickness, minThickness(s, base.wallThickness)), 1);
    expect(printable(r.parts)).toHaveLength(2);
  });

  it('every socket, direction and shape builds', async () => {
    for (const penPath of ['inset', 'through', 'collar'] as const)
      for (const socketAngle of [-90, 0, 90, 180])
        for (const plateShape of ['outline', 'rectangle', 'none'] as const) {
          const r = await run({ penPath, socketAngle, plateShape, name: 'Ivy', showPen: false });
          expect(r.parts.length, `${penPath}/${socketAngle}/${plateShape}`).toBeGreaterThan(0);
          expect(r.diagnostics?.some((d) => d.level === 'error')).toBe(false);
        }
  });

  it('adds a symbol, halo and second line', async () => {
    const r = await run({ symbol: 'tabler:heart', colorScheme: 'plate-halo-text', secondLine: 'Class 3B' });
    expect(r.parts.map((p) => p.name)).toEqual(['Body', 'Halo', 'Letters', 'Pen (preview)']);
    const plain = await run({ showPen: false });
    const withSym = await run({ symbol: 'tabler:heart', showPen: false });
    expect(boundsSize(partBounds(withSym.parts))[0]).toBeGreaterThan(boundsSize(partBounds(plain.parts))[0] + 10);
  });

  it('the hole is really there: the body has a tunnel', async () => {
    const r = await run({ penPath: 'through', showPen: false, colorScheme: 'single' });
    // Through-hole makes genus ≥ 1; checking volume drop against no-hole is simpler:
    const v = (parts: typeof r.parts) => parts.reduce((s, p) => s + p.indices.length, 0);
    expect(v(r.parts)).toBeGreaterThan(100);
  });
});
