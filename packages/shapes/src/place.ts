/**
 * Placing round features (magnet pockets, pop sockets) inside an outline: spread a number
 * of points over a legal area with a minimum spacing, and nudge a set of points as far as
 * they can go while all stay legal.
 */
import type { Contour } from '@pf/core';
import { bounds, pointInside, rectSize } from './contour';

/** Moves points by as much of (dx, dy) as keeps them all legal. */
export function shiftInside(pts: [number, number][], legal: Contour[], dx: number, dy: number): [number, number][] {
  const at = (t: number) => pts.map(([x, y]) => [x + dx * t, y + dy * t] as [number, number]);
  const ok = (t: number) => at(t).every(([x, y]) => pointInside(legal, x, y));
  if (!dx && !dy) return pts;
  if (ok(1)) return at(1);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return at(lo);
}

/** Spreads up to `count` pockets over the legal area: centre first, then farthest point. */
export function autoPlace(legal: Contour[], count: number, spacing: number): [number, number][] {
  if (!legal.length || count < 1) return [];
  const b = bounds(legal);
  const size = rectSize(b);
  const step = Math.max(0.4, Math.max(size.width, size.height) / 60);
  const cand: [number, number][] = [];
  for (let x = b.minX; x <= b.maxX + 1e-9; x += step) for (let y = b.minY; y <= b.maxY + 1e-9; y += step) if (pointInside(legal, x, y)) cand.push([x, y]);
  for (const c of legal) for (let i = 0; i < c.length; i += 2) if (pointInside(legal, c[i]!, c[i + 1]!)) cand.push([c[i]!, c[i + 1]!]);
  if (!cand.length) {
    // A sliver: its own vertices are the only places a pocket can go.
    for (const c of legal) for (let i = 0; i < c.length; i += 2) cand.push([c[i]!, c[i + 1]!]);
  }
  if (!cand.length) return [];
  const d2 = (a: [number, number], q: [number, number]) => (a[0] - q[0]) ** 2 + (a[1] - q[1]) ** 2;
  const centre: [number, number] = [size.cx, size.cy];
  let seed = cand[0]!;
  for (const c of cand) if (d2(c, centre) < d2(seed, centre)) seed = c;
  const chosen: [number, number][] = [seed];
  const near = cand.map((c) => d2(c, seed));
  while (chosen.length < count) {
    let k = -1;
    let best = -1;
    near.forEach((v, i) => {
      if (v > best) {
        best = v;
        k = i;
      }
    });
    if (k < 0 || Math.sqrt(best) < spacing - 1e-6) break;
    const pick = cand[k]!;
    chosen.push(pick);
    cand.forEach((c, i) => (near[i] = Math.min(near[i]!, d2(c, pick))));
  }
  if (chosen.length === 2) {
    // A pair reads better balanced about the middle than pushed to one side.
    const mx = (chosen[0]![0] + chosen[1]![0]) / 2;
    const my = (chosen[0]![1] + chosen[1]![1]) / 2;
    return shiftInside(chosen, legal, size.cx - mx, size.cy - my);
  }
  return chosen;
}
