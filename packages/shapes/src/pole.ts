/**
 * Pole of inaccessibility: the point inside a shape farthest from its edges, and that
 * distance. Used to place a hole or a label where there is the most room. The search
 * splits the bounding box into cells and keeps refining the promising ones (the
 * "polylabel" method).
 */
import type { Contour } from '@pf/core';
import { bounds, pointInside, rectSize } from './contour';

/** Distance from a point to the nearest edge of any contour. */
export function edgeDistance(contours: Contour[], x: number, y: number): number {
  let best = Infinity;
  for (const c of contours) {
    const n = c.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const ax = c[j]!;
      const ay = c[j + 1]!;
      const dx = c[i]! - ax;
      const dy = c[i + 1]! - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Signed: positive inside (even-odd), negative outside. */
function signedDistance(contours: Contour[], x: number, y: number): number {
  const d = edgeDistance(contours, x, y);
  return pointInside(contours, x, y) ? d : -d;
}

interface Cell {
  x: number;
  y: number;
  h: number;
  d: number;
  max: number;
}

function cell(contours: Contour[], x: number, y: number, h: number): Cell {
  const d = signedDistance(contours, x, y);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

export function poleOf(contours: Contour[], precision = 0.2): { x: number; y: number; radius: number } {
  const b = rectSize(bounds(contours));
  if (!(b.width > 0) || !(b.height > 0)) return { x: b.cx || 0, y: b.cy || 0, radius: 0 };
  const size = Math.min(b.width, b.height);
  let h = size / 2;
  const queue: Cell[] = [];
  const x0 = b.cx - b.width / 2;
  const y0 = b.cy - b.height / 2;
  for (let x = x0; x < x0 + b.width; x += size) for (let y = y0; y < y0 + b.height; y += size) queue.push(cell(contours, x + h, y + h, h));
  let best = cell(contours, b.cx, b.cy, 0);
  for (const c of queue) if (c.d > best.d) best = c;
  let guard = 0;
  while (queue.length && guard++ < 20000) {
    // Most promising first.
    let k = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i]!.max > queue[k]!.max) k = i;
    const c = queue[k]!;
    queue[k] = queue[queue.length - 1]!;
    queue.pop();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    h = c.h / 2;
    queue.push(cell(contours, c.x - h, c.y - h, h), cell(contours, c.x + h, c.y - h, h), cell(contours, c.x - h, c.y + h, h), cell(contours, c.x + h, c.y + h, h));
  }
  return { x: best.x, y: best.y, radius: Math.max(0, best.d) };
}
