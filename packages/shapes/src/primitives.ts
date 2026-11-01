/**
 * Basic outlines, centred on the origin, counter-clockwise, in millimetres.
 *
 * Every primitive is built point by point rather than from curve helpers, so the extremes
 * (a corner radius of half the short side, a star with inner radius equal to outer) stay
 * clean and never produce zero-length edges.
 */
import type { Contour } from './contour';
import { orient, weld } from './contour';

/** Segments for a full circle of radius r at a chord error of `tol` mm, clamped 12..256. */
export function segmentsFor(r: number, tol = 0.02): number {
  if (r <= 0) return 12;
  const n = Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tol / r)));
  return Math.max(12, Math.min(256, n));
}

export function circle(r: number, segments = segmentsFor(r)): Contour {
  const out: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return out;
}

export function ellipse(rx: number, ry: number, segments = segmentsFor(Math.max(rx, ry))): Contour {
  const out: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push(Math.cos(a) * rx, Math.sin(a) * ry);
  }
  return out;
}

export function rect(w: number, h: number): Contour {
  const x = w / 2;
  const y = h / 2;
  return [-x, -y, x, -y, x, y, -x, y];
}

/** A rectangle with circular corners. A radius of zero is a plain rectangle. */
export function roundedRect(w: number, h: number, radius: number, cornerSegments?: number): Contour {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r < 1e-6) return rect(w, h);
  const per = cornerSegments ?? Math.max(3, Math.ceil(segmentsFor(r) / 4));
  const hx = w / 2 - r;
  const hy = h / 2 - r;
  const corners: [number, number, number][] = [
    [hx, -hy, -Math.PI / 2],
    [hx, hy, 0],
    [-hx, hy, Math.PI / 2],
    [-hx, -hy, Math.PI],
  ];
  const out: number[] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= per; i++) {
      const a = start + (i / per) * (Math.PI / 2);
      out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  }
  return weld(out);
}

/** A stadium: a rectangle whose short ends are full semicircles. */
export function pill(w: number, h: number): Contour {
  return roundedRect(w, h, Math.min(w, h) / 2);
}

/** A regular polygon with a vertex at `rotationDeg` (0 = pointing along +X). */
export function regularPolygon(sides: number, r: number, rotationDeg = 90): Contour {
  const out: number[] = [];
  const rot = (rotationDeg * Math.PI) / 180;
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    out.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return out;
}

/** A regular polygon sized by the distance across its flats (how hex sockets are specified). */
export function polygonAcrossFlats(sides: number, acrossFlats: number, rotationDeg = 0): Contour {
  const r = acrossFlats / 2 / Math.cos(Math.PI / sides);
  return regularPolygon(sides, r, rotationDeg + 180 / sides);
}

export function star(points: number, outer: number, inner: number, rotationDeg = 90): Contour {
  const out: number[] = [];
  const rot = (rotationDeg * Math.PI) / 180;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i / (points * 2)) * Math.PI * 2;
    out.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return out;
}

/**
 * A superellipse |x/a|^n + |y/b|^n = 1. n = 2 is an ellipse; about 4 is the "squircle"
 * of app icons; large n approaches a rectangle.
 */
export function superellipse(w: number, h: number, n = 4, segments = 128): Contour {
  const out: number[] = [];
  const a = w / 2;
  const b = h / 2;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    out.push(a * Math.sign(c) * Math.abs(c) ** (2 / n), b * Math.sign(s) * Math.abs(s) ** (2 / n));
  }
  return weld(out);
}

/** A heart about `size` wide, point down. */
export function heart(size: number, segments = 160): Contour {
  const pts: number[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push(x, y);
  }
  // The parametric heart is about 32 wide and 29 tall, centred near (0, -1.5).
  const k = size / 32;
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) out.push(pts[i]! * k, (pts[i + 1]! + 2.5) * k);
  return orient(weld(out), true);
}

/** A teardrop: a circle of radius r with a point `length` above its centre. */
export function teardrop(r: number, length: number, segments = 96): Contour {
  const tip = Math.max(length, r * 1.05);
  const spread = Math.acos(r / tip);
  const a0 = Math.PI / 2 + spread;
  const a1 = Math.PI / 2 - spread + Math.PI * 2;
  const out: number[] = [0, tip];
  for (let i = 0; i <= segments; i++) {
    const a = a0 + ((a1 - a0) * i) / segments;
    out.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return weld(out);
}

/** A heater shield: flat top, straight sides, curved to a point at the bottom. */
export function shield(w: number, h: number, segments = 48): Contour {
  const hw = w / 2;
  const top = h / 2;
  const shoulder = top - h * 0.35;
  const out: number[] = [];
  out.push(-hw, top, -hw, shoulder);
  // left curve down to the point
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const x = -hw * (1 - t) ** 1.6;
    const y = shoulder - (shoulder + top) * Math.sin((t * Math.PI) / 2);
    out.push(x, y);
  }
  for (let i = segments - 1; i >= 1; i--) {
    const t = i / segments;
    const x = hw * (1 - t) ** 1.6;
    const y = shoulder - (shoulder + top) * Math.sin((t * Math.PI) / 2);
    out.push(x, y);
  }
  out.push(hw, shoulder, hw, top);
  return orient(weld(out), true);
}

/** An annulus as two contours (outer counter-clockwise, inner clockwise). */
export function ring(outerR: number, innerR: number): Contour[] {
  const o = circle(outerR);
  const i = circle(innerR, o.length / 2);
  const hole: number[] = [];
  for (let k = i.length - 2; k >= 0; k -= 2) hole.push(i[k]!, i[k + 1]!);
  return [o, hole];
}

/**
 * Named outlines sized to fit a w × h box, for "pick a shape" controls. Every generator
 * that offers a base shape draws from this list, so the names mean the same thing everywhere.
 */
export const NAMED_SHAPES = ['circle', 'rounded-square', 'square', 'rectangle', 'pill', 'hexagon', 'octagon', 'heart', 'star', 'squircle', 'shield', 'teardrop', 'oval'] as const;
export type NamedShape = (typeof NAMED_SHAPES)[number];

export function namedShape(name: NamedShape | string, w: number, h: number, cornerRadius = Math.min(w, h) * 0.15): Contour {
  const m = Math.min(w, h);
  switch (name) {
    case 'circle':
      return circle(m / 2);
    case 'oval':
      return ellipse(w / 2, h / 2);
    case 'square':
      return rect(m, m);
    case 'rounded-square':
      return roundedRect(m, m, cornerRadius);
    case 'rectangle':
      return roundedRect(w, h, cornerRadius);
    case 'pill':
      return pill(w, h);
    case 'hexagon':
      return regularPolygon(6, m / 2, 90);
    case 'octagon':
      return regularPolygon(8, m / 2, 22.5);
    case 'heart':
      return heart(m);
    case 'star':
      return star(5, m / 2, m / 4.2);
    case 'squircle':
      return superellipse(w, h, 4.5);
    case 'shield':
      return shield(w, h);
    case 'teardrop':
      return teardrop(m * 0.38, h * 0.62);
    default:
      return roundedRect(w, h, cornerRadius);
  }
}
