import { describe, expect, it } from 'vitest';
import { circle, clipPolylines, closeLoop, packRects, rect, translate, uniqueEdges } from '../src';

describe('clipPolylines', () => {
  it('keeps the parts of a line inside a region, splitting where it leaves', () => {
    const region = [rect(10, 10), ...translate([rect(4, 4)], 0, 0).map((c) => [...c].reverse())];
    const out = clipPolylines([[-10, 0, 10, 0]], region);
    // In through the left edge, out at the hole, back in after it, out at the right edge.
    expect(out.length).toBe(2);
    expect(out[0]![0]).toBeCloseTo(-5, 9);
    expect(out[0]![2]).toBeCloseTo(-2, 9);
    expect(out[1]![0]).toBeCloseTo(2, 9);
    expect(out[1]![2]).toBeCloseTo(5, 9);
  });

  it('clips a closed loop', () => {
    const out = clipPolylines([closeLoop(circle(6, 64))], [rect(10, 10)]);
    expect(out.length).toBe(4);
  });
});

describe('uniqueEdges', () => {
  it('draws an edge two cells share once', () => {
    const a = translate([rect(1, 1)], 0.5, 0.5)[0]!;
    const b = translate([rect(1, 1)], 1.5, 0.5)[0]!;
    const lines = uniqueEdges([a, b]);
    const segments = lines.reduce((n, l) => n + l.length / 2 - 1, 0);
    expect(segments).toBe(7);
  });
});

describe('packRects', () => {
  it('fills a sheet before opening another, never overlapping', () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ id: String(i), w: 90, h: 90 }));
    const { placements, sheets, unplaced } = packRects(items, 300, 300, 2, 2);
    expect(unplaced).toEqual([]);
    expect(sheets).toBe(1);
    for (const a of placements)
      for (const b of placements) {
        if (a === b) continue;
        const apart = a.x + 90 <= b.x || b.x + 90 <= a.x || a.y + 90 <= b.y || b.y + 90 <= a.y;
        expect(apart).toBe(true);
      }
    expect(packRects([...items, { id: 'x', w: 90, h: 90 }], 300, 300, 2, 2).sheets).toBe(2);
  });

  it('turns an item only when allowed, and reports what cannot fit', () => {
    expect(packRects([{ id: 'a', w: 50, h: 250 }], 260, 100, 2, 2).unplaced).toEqual(['a']);
    const r = packRects([{ id: 'a', w: 50, h: 250, rotate: true }], 260, 100, 2, 2);
    expect(r.placements[0]!.rotated).toBe(true);
  });
});
