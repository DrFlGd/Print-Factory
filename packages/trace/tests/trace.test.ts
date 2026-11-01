import { area, bounds, signedArea } from '@pf/shapes';
import { describe, expect, it } from 'vitest';
import { borderColor, cleanLabels, createRaster, oklab, oklabToRgb, quantize, removeBackground, traceImage, traceMask } from '../src/index';
import type { Raster } from '../src/index';

/** White page, red disc (r 30) with a blue square (20) in its middle. */
function target(): Raster {
  const img = createRaster(100, 100, [255, 255, 255, 255]);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) {
      const d = Math.hypot(x + 0.5 - 50, y + 0.5 - 50);
      const i = (y * 100 + x) * 4;
      if (Math.abs(x - 50) < 10 && Math.abs(y - 50) < 10) img.data.set([20, 40, 220, 255], i);
      else if (d < 30) img.data.set([220, 30, 30, 255], i);
    }
  return img;
}

describe('colour', () => {
  it('round-trips OKLab', () => {
    const cases: [number, number, number][] = [
      [0, 0, 0],
      [255, 255, 255],
      [200, 30, 90],
      [12, 200, 140],
    ];
    for (const c of cases) {
      expect(oklabToRgb(...oklab(...c))).toEqual([...c]);
    }
  });
});

describe('background and palette', () => {
  it('finds and removes a flat backdrop', () => {
    const img = target();
    expect(borderColor(img)).toEqual([255, 255, 255]);
    const cut = removeBackground(img);
    expect(cut.data[3]).toBe(0);
    expect(cut.data[(50 * 100 + 50) * 4 + 3]).toBe(255);
  });

  it('quantises to the colours present, largest first', () => {
    const q = quantize(removeBackground(target()), 2);
    expect(q.palette.length).toBe(2);
    expect(q.palette[0]![0]).toBeGreaterThan(180); // red is bigger than blue
    expect(q.palette[1]![2]).toBeGreaterThan(180);
    expect(q.counts[0]).toBeGreaterThan(q.counts[1]!);
    expect(q.labels[0]).toBe(-1);
  });

  it('merges specks into their neighbours', () => {
    const img = createRaster(40, 40, [0, 0, 0, 255]);
    img.data.set([255, 255, 255, 255], (20 * 40 + 20) * 4);
    const q = cleanLabels(quantize(img, 2), { passes: 0, minPixels: 4 });
    expect(new Set(q.labels).size).toBe(1);
  });
});

describe('tracing', () => {
  it('traces a filled square to one counter-clockwise contour of the right area', () => {
    const m = new Float32Array(50 * 50);
    for (let y = 10; y < 40; y++) for (let x = 10; x < 40; x++) m[y * 50 + x] = 1;
    const c = traceMask(m, 50, 50, { smooth: 0 });
    expect(c.length).toBe(1);
    expect(signedArea(c[0]!)).toBeGreaterThan(0);
    expect(area(c)).toBeGreaterThan(850);
    expect(area(c)).toBeLessThan(950);
  });

  it('closes shapes touching the edge and flips Y up', () => {
    const m = new Float32Array(20 * 20);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 20; x++) m[y * 20 + x] = 1; // top rows
    const [c] = traceMask(m, 20, 20, { smooth: 0, minArea: 1 });
    const b = bounds(c!);
    expect(b.maxY).toBeGreaterThan(19);
    expect(b.minY).toBeGreaterThan(14);
  });

  it('gives a ring a hole, and regions per colour', () => {
    const t = traceImage(target(), { colors: 2, silhouetteHoles: false });
    expect(t.regions.length).toBe(2);
    const red = t.regions[0]!;
    expect(red.contours.length).toBe(2);
    expect(red.contours.filter((c) => signedArea(c) < 0).length).toBe(1);
    expect(t.silhouette.length).toBe(1);
    expect(area(t.silhouette)).toBeGreaterThan(Math.PI * 29 * 29);
  });
});
