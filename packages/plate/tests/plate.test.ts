import type { Part } from '@pf/core';
import { boundsSize, partBounds } from '@pf/core';
import { describe, expect, it } from 'vitest';
import { arrange, bed, checkFit, customBed } from '../src/index';

function box(name: string, w: number, h: number, d = 5, group?: string): Part {
  const positions = new Float32Array([0, 0, 10, w, 0, 10, w, h, 10, 0, h, 10 + d]);
  const p: Part = { name, positions, indices: new Uint32Array([0, 1, 2, 0, 2, 3]), color: [1, 1, 1] };
  if (group) p.group = group;
  return p;
}

describe('plate', () => {
  it('falls back to the default bed', () => {
    expect(bed('nope').id).toBe('bambu-a1');
  });

  it('arranges groups apart, on the bed, resting on z = 0', () => {
    const parts = [box('a', 50, 40, 5, 'a'), box('b', 50, 40, 5, 'b'), box('c1', 20, 20, 5, 'c'), box('c2', 20, 20, 5, 'c')];
    const r = arrange(parts, customBed(200, 200), 5);
    expect(r.fits).toBe(true);
    const all = partBounds(parts);
    expect(all.min[2]).toBeCloseTo(0);
    expect(all.min[0]).toBeGreaterThanOrEqual(0);
    expect(all.max[0]).toBeLessThanOrEqual(200);
    const a = partBounds([parts[0]!]);
    const b = partBounds([parts[1]!]);
    expect(Math.abs(a.min[0] - b.min[0])).toBeCloseTo(55);
    // grouped parts move together
    expect(partBounds([parts[2]!]).min).toEqual(partBounds([parts[3]!]).min);
  });

  it('wraps to a new row and reports oversize parts', () => {
    const parts = [box('a', 120, 30, 5, 'a'), box('b', 120, 30, 5, 'b')];
    expect(arrange(parts, customBed(200, 200)).rows).toBe(2);
    expect(boundsSize(partBounds(parts))[1]).toBeCloseTo(65);
    expect(checkFit([box('big', 300, 10)], customBed(200, 200))).toHaveLength(1);
    expect(checkFit([box('rotated', 190, 230)], customBed(240, 200))).toHaveLength(0);
  });
});
