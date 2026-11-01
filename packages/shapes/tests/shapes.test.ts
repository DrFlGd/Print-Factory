import { describe, expect, it } from 'vitest';
import {
  bounds,
  circle,
  clean,
  heart,
  islands,
  namedShape,
  NAMED_SHAPES,
  orient,
  parseSvg,
  pathToContours,
  pointAlong,
  pointInside,
  rectSize,
  rotate,
  roundedRect,
  signedArea,
  simplify,
  transform,
  weld,
  centroid,
  fitInto,
  polygonAcrossFlats,
} from '../src';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('primitives', () => {
  it('every named shape is a clean counter-clockwise outline inside its box', () => {
    for (const name of NAMED_SHAPES) {
      const c = namedShape(name, 40, 30);
      expect(signedArea(c), name).toBeGreaterThan(0);
      expect(weld(c).length, `${name} has duplicate points`).toBe(c.length);
      const s = rectSize(bounds(c));
      expect(s.width, name).toBeLessThanOrEqual(40.001);
      expect(s.height, name).toBeLessThanOrEqual(30.001);
      expect(Math.max(s.width, s.height), name).toBeGreaterThan(20);
    }
  });

  it('a rounded rectangle at full radius is a stadium with no zero-length edges', () => {
    const c = roundedRect(40, 20, 50);
    expect(weld(c).length).toBe(c.length);
    expect(close(Math.abs(signedArea(c)), 20 * 20 + Math.PI * 100, 2)).toBe(true);
  });

  it('a circle is close to pi r squared', () => {
    // a chord error of 0.02 mm loses about 2/3 × tolerance × perimeter of area
    expect(Math.abs(signedArea(circle(10)) - Math.PI * 100)).toBeLessThan(0.02 * 2 * Math.PI * 10);
  });

  it('across-flats hexagon measures what it says', () => {
    const s = rectSize(bounds(polygonAcrossFlats(6, 10)));
    expect(close(Math.min(s.width, s.height), 10, 1e-9)).toBe(true);
  });

  it('heart points down', () => {
    const b = bounds(heart(30));
    expect(Math.abs(b.minY)).toBeGreaterThan(Math.abs(b.maxY) * 0.8);
  });
});

describe('contours', () => {
  it('rotates about a point', () => {
    const [r] = rotate([[10, 0, 11, 0, 11, 1]], 90, 0, 0);
    expect(close(r![0]!, 0)).toBe(true);
    expect(close(r![1]!, 10)).toBe(true);
  });

  it('keeps winding when mirrored', () => {
    const c = roundedRect(10, 5, 1);
    const [m] = transform([c], [-1, 0, 0, 1, 0, 0]);
    expect(signedArea(m!)).toBeGreaterThan(0);
  });

  it('simplifies a dense circle within tolerance', () => {
    const c = circle(10, 256);
    const s = simplify(c, 0.05);
    expect(s.length).toBeLessThan(c.length);
    expect(Math.abs(signedArea(s) - signedArea(c))).toBeLessThan(0.05 * 2 * Math.PI * 10);
  });

  it('nests islands and holes', () => {
    const outer = roundedRect(40, 40, 0);
    const hole = orient(roundedRect(20, 20, 0), false);
    const dot = roundedRect(4, 4, 0);
    const other = rotate([roundedRect(5, 5, 0)], 0, 0, 0)[0]!.map((v, i) => (i % 2 === 0 ? v + 100 : v));
    const res = islands([dot, hole, outer, other]);
    expect(res).toHaveLength(3);
    const big = res.find((r) => Math.abs(signedArea(r.outer)) > 1000)!;
    expect(big.holes).toHaveLength(1);
    expect(pointInside([big.outer, ...big.holes], 15, 15)).toBe(true);
    expect(pointInside([big.outer, ...big.holes], 0, 0)).toBe(false);
  });

  it('walks along a contour with outward normals', () => {
    const sq = roundedRect(10, 10, 0); // starts at (-5,-5) going +x
    const p = pointAlong(sq, 0.125);
    expect(close(p.x, 0, 1e-9)).toBe(true);
    expect(close(p.ny, -1, 1e-9)).toBe(true);
  });

  it('centroid and fit', () => {
    const c = roundedRect(10, 4, 0).map((v, i) => (i % 2 === 0 ? v + 3 : v));
    expect(centroid(c).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([3, 0]);
    const f = fitInto([c], 5, 5);
    expect(rectSize(bounds(f.contours)).width).toBeCloseTo(5);
  });

  it('cleans slivers', () => {
    expect(clean([[0, 0, 1, 0, 2, 0], [0, 0, 1, 0, 1, 1, 0, 0]])).toHaveLength(1);
  });
});

describe('svg', () => {
  it('reads all path commands, including glued arc flags', () => {
    const cs = pathToContours('M0 0h10v10H0z m20 0 l5 0 0 5z M0 20 a5 5 0 105 5 Q0 30 0 20 C1 21 2 22 3 23 S5 25 0 20');
    expect(cs).toHaveLength(3);
    expect(cs[0]).toEqual([0, 0, 10, 0, 10, 10, 0, 10]);
    expect(cs[1]!.slice(0, 2)).toEqual([20, 0]);
  });

  it('reads shapes, groups, transforms and fills, upright', () => {
    const doc = parseSvg(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
      <defs><path id="x" d="M0 0h1v1z"/></defs>
      <g transform="translate(10 0)" fill="#f00">
        <rect x="0" y="0" width="20" height="10"/>
        <circle cx="50" cy="25" r="5" fill="none"/>
      </g>
      <polygon points="0,40 10,40 5,50" style="fill:#00f;fill-rule:evenodd"/>
      <ellipse cx="80" cy="25" rx="10" ry="5" style="display:none"/>
    </svg>`);
    expect(doc.viewBox).toEqual([0, 0, 100, 50]);
    expect(doc.shapes).toHaveLength(2);
    expect(doc.shapes[0]!.fill).toBe('#f00');
    const b = bounds(doc.shapes[0]!.contours);
    expect([b.minX, b.maxX, b.minY, b.maxY]).toEqual([10, 30, 40, 50]);
    expect(doc.shapes[1]!.fillRule).toBe('evenodd');
    // the upright triangle's apex (svg y=50) is now at the bottom
    expect(Math.min(...doc.shapes[1]!.contours[0]!.filter((_, i) => i % 2 === 1))).toBe(0);
  });
});
