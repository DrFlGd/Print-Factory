// Ported from Jerred's Image LED Lightbox (DrFlGd/Generator-Standalone), MIT.
/** Equal arc-length hole placement along one or more closed 2D paths. Units are mm. */
export type Point = [number, number];
export type Path = Point[];

function lengthOf(path: Path): number {
  let length = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!, b = path[(i + 1) % path.length]!;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

function atDistance(path: Path, distance: number): Point {
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!, b = path[(i + 1) % path.length]!;
    const edge = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (distance <= edge || i === path.length - 1) {
      const t = edge > 0 ? Math.min(1, distance / edge) : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    distance -= edge;
  }
  return path[0]!;
}

/** Distance from a point to a closed polygon edge (including concave corners). */
function edgeDistance(p: Point, ring: Path): number {
  let nearest = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const size2 = dx * dx + dy * dy;
    const t = size2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / size2)) : 0;
    nearest = Math.min(nearest, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return nearest;
}

function inside(p: Point, ring: Path): boolean {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

/**
 * A specified TOTAL hole count, distributed by loop perimeter. Every retained
 * ring gets one hole before proportional extra holes are assigned. The explicit
 * collision check stops overlapping LED bores on neighbouring colour outlines.
 */
export function sampleMarqueeHoles(
  paths: Path[], count: number, diameter: number, outside: Path, edgeClearance: number,
  shiftMm = 0,
): Point[] {
  if (!Number.isInteger(count) || count < 1 || count > 240 || !(diameter > 0)) {
    throw new Error('Marquee hole count or diameter is invalid.');
  }
  if (!Number.isFinite(shiftMm)) throw new Error('Marquee pattern shift must be a finite distance.');
  const loops = paths.map((path) => ({ path, length: lengthOf(path) }))
    .filter(({ path, length }) => path.length >= 3 && length > diameter * 2.5);
  if (!loops.length) throw new Error('No printable guide paths remain; decrease marquee inset.');
  if (count < loops.length) {
    throw new Error('Marquee hole count is smaller than the number of colour paths; increase count or simplify the artwork.');
  }
  const totalLength = loops.reduce((n, loop) => n + loop.length, 0);
  const quotas = loops.map((loop) => (count - loops.length) * loop.length / totalLength);
  const counts = quotas.map((q) => 1 + Math.floor(q));
  const left = count - counts.reduce((n, c) => n + c, 0);
  const order = quotas.map((q, i) => ({ i, rest: q - Math.floor(q) }))
    .sort((a, b) => b.rest - a.rest);
  for (let i = 0; i < left; i++) {
    const index = order[i]!.i;
    counts[index] = counts[index]! + 1;
  }

  const holes: Point[] = [];
  for (let i = 0; i < loops.length; i++) {
    const { path, length } = loops[i]!;
    const n = counts[i]!;
    for (let j = 0; j < n; j++) {
      // Shift each equally spaced centre by an arc length; closed contours wrap.
      const arc = length * (j + 0.5) / n + shiftMm;
      const at = atDistance(path, ((arc % length) + length) % length);
      if (!inside(at, outside) || edgeDistance(at, outside) < edgeClearance + diameter / 2 - 1e-5) {
        throw new Error('Marquee holes are too close to the lightbox edge. Increase inset or decrease diameter.');
      }
      holes.push(at);
    }
  }
  const separation = diameter + 0.4;
  for (let i = 0; i < holes.length; i++) for (let j = 0; j < i; j++) {
    const a = holes[i]!, b = holes[j]!;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < separation - 1e-5) {
      throw new Error('Marquee holes overlap or are too closely spaced. Reduce count/diameter or adjust inset.');
    }
  }
  return holes;
}

/** Counter-clockwise circular cutter contours for a single planar 3MF cut. */
export function marqueeCircles(points: Point[], diameter: number): Path[] {
  const radius = diameter / 2;
  return points.map(([x, y]) => Array.from({ length: 32 }, (_, i) => {
    const t = 2 * Math.PI * i / 32;
    return [x + radius * Math.cos(t), y + radius * Math.sin(t)] as Point;
  }));
}
