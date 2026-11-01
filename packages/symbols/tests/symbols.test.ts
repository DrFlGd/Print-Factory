import { area, bounds } from '@pf/shapes';
import { describe, expect, it } from 'vitest';
import { registerSymbol, symbolIndex, symbolInputKey, symbolShapes } from '../src/index';

describe('symbols', () => {
  it('lists the bundled library', async () => {
    const idx = await symbolIndex();
    expect(idx.length).toBeGreaterThan(900);
    expect(idx.find((s) => s.id === 'tabler:heart')).toBeTruthy();
  });

  it('sizes a symbol to its longer side, centred', async () => {
    const shapes = await symbolShapes('tabler:heart', 20);
    const all = shapes.flatMap((s) => s.contours);
    const b = bounds(all);
    expect(Math.max(b.maxX - b.minX, b.maxY - b.minY)).toBeCloseTo(20, 3);
    expect(Math.abs(b.minX + b.maxX)).toBeLessThan(0.01);
    expect(area(all)).toBeGreaterThan(100);
  });

  it('every bundled symbol has outlines', async () => {
    const idx = await symbolIndex();
    const empty: string[] = [];
    for (const s of idx) if (!(await symbolShapes(s.id, 10)).some((x) => x.contours.length)) empty.push(s.id);
    expect(empty).toEqual([]);
  });

  it('takes user SVGs, and custom ones through build inputs', async () => {
    const svg = '<svg viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="4"/></svg>';
    const s = registerSymbol(svg);
    expect((await symbolShapes(s.id, 10)).length).toBe(1);
    expect((await symbolShapes('custom:elsewhere', 10, { [symbolInputKey('custom:elsewhere')]: svg })).length).toBe(1);
    expect(() => registerSymbol('<svg><path d="M0 0L5 5" fill="none" stroke="black"/></svg>')).toThrow(/no filled shapes/);
  });
});
