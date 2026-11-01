/**
 * The outlines a hook, a link or a charm can take. Each is upright (the way it hangs),
 * centred on the origin, counter-clockwise, with its longest side 1; the builder scales it.
 */
import type { Contour } from '@pf/core';
import { bounds, circle, heart, orient, rectSize, regularPolygon, roundedRect, shield, star, superellipse, teardrop } from '@pf/shapes';

function polar(r: (t: number) => number, n = 180): Contour {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k = r(t);
    out.push(Math.cos(t) * k, Math.sin(t) * k);
  }
  return out;
}

function sampled(f: (t: number) => [number, number], n = 160): Contour {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = f((i / n) * Math.PI * 2);
    out.push(x, y);
  }
  return out;
}

/** Convex hull (monotone chain) of a point list, counter-clockwise. */
function hull(points: number[]): Contour {
  const pts: [number, number][] = [];
  for (let i = 0; i < points.length; i += 2) pts.push([points[i]!, points[i + 1]!]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].flat();
}

const RAW: Record<string, { name: string; group: 'basic' | 'fun'; make: () => Contour }> = {
  oval: { name: 'Oval', group: 'basic', make: () => sampled((t) => [0.33 * Math.cos(t), 0.5 * Math.sin(t)]) },
  dring: {
    name: 'Carabiner',
    group: 'basic',
    make: () => {
      const out: number[] = [];
      for (let i = 0; i <= 60; i++) {
        const t = -Math.PI / 2 + (i / 60) * Math.PI;
        out.push(-0.06 + 0.36 * Math.cos(t), 0.5 * Math.sin(t));
      }
      out.push(-0.2, 0.47, -0.27, 0.36, -0.27, -0.36, -0.2, -0.47);
      return out;
    },
  },
  circle: { name: 'Circle', group: 'basic', make: () => circle(0.5, 128) },
  pear: { name: 'Pear', group: 'basic', make: () => hull([...circle(0.3, 96).map((v, i) => (i % 2 ? v - 0.2 : v)), ...circle(0.19, 96).map((v, i) => (i % 2 ? v + 0.31 : v))]) },
  teardrop: { name: 'Teardrop', group: 'basic', make: () => teardrop(0.32, 0.68) },
  rect: { name: 'Rectangle', group: 'basic', make: () => roundedRect(0.62, 1, 0.1) },
  squircle: { name: 'Rounded square', group: 'basic', make: () => superellipse(1, 1, 4) },
  hexagon: { name: 'Hexagon', group: 'basic', make: () => regularPolygon(6, 0.5, 90) },
  octagon: { name: 'Octagon', group: 'basic', make: () => regularPolygon(8, 0.5, 22.5) },
  triangle: { name: 'Triangle', group: 'basic', make: () => regularPolygon(3, 0.5, 90) },
  diamond: { name: 'Diamond', group: 'basic', make: () => [0, -0.5, 0.33, 0, 0, 0.5, -0.33, 0] },
  heart: { name: 'Heart', group: 'fun', make: () => heart(1) },
  star: { name: 'Star', group: 'fun', make: () => star(5, 0.5, 0.24) },
  flower: { name: 'Flower', group: 'fun', make: () => polar((t) => 0.37 + 0.13 * Math.cos(5 * (t - Math.PI / 2))) },
  egg: { name: 'Egg', group: 'fun', make: () => sampled((t) => [0.36 * Math.cos(t) * (1 - 0.13 * Math.sin(t)), 0.5 * Math.sin(t)]) },
  shield: { name: 'Shield', group: 'fun', make: () => shield(0.8, 1) },
  tag: { name: 'Tag', group: 'fun', make: () => [-0.3, -0.5, 0.3, -0.5, 0.3, 0.25, 0, 0.5, -0.3, 0.25] },
  arch: {
    name: 'Arch',
    group: 'fun',
    make: () => {
      const out: number[] = [-0.32, -0.5, 0.32, -0.5];
      for (let i = 0; i <= 48; i++) {
        const t = (i / 48) * Math.PI;
        out.push(0.32 * Math.cos(t), 0.18 + 0.32 * Math.sin(t));
      }
      return out;
    },
  },
  cross: { name: 'Cross', group: 'fun', make: () => [-0.15, -0.5, 0.15, -0.5, 0.15, 0.05, 0.38, 0.05, 0.38, 0.33, 0.15, 0.33, 0.15, 0.5, -0.15, 0.5, -0.15, 0.33, -0.38, 0.33, -0.38, 0.05, -0.15, 0.05] },
};

export const SHAPE_IDS = Object.keys(RAW);
export const SHAPE_NAMES: Record<string, string> = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, v.name]));

const cache = new Map<string, Contour>();

/** The outline, longest side 1, centred, counter-clockwise. Unknown ids fall back to the oval. */
export function shapeOutline(id: string): Contour {
  const key = RAW[id] ? id : 'oval';
  const hit = cache.get(key);
  if (hit) return hit;
  const c = RAW[key]!.make();
  const r = rectSize(bounds(c));
  const k = 1 / Math.max(r.width, r.height);
  const out: number[] = [];
  for (let i = 0; i < c.length; i += 2) out.push((c[i]! - r.cx) * k, (c[i + 1]! - r.cy) * k);
  const done = orient(out, true);
  cache.set(key, done);
  return done;
}
