/**
 * Minimal structural joins between separate 2D regions.
 *
 * A text-shaped cutter needs a few short links between neighbouring glyphs; a stencil
 * needs short links *through glyph strokes* to hold enclosed counters (O, A, B, etc.).
 * Neither should ever get a horizontal bar across the whole word.
 */
import type { CrossSection } from '@pf/engine-manifold';
import { circle, rect, signedArea } from '@pf/shapes';
import type { Ctx } from './types';

type Point = [number, number];
type Ring = { points: Point[]; box: [number, number, number, number] };

function boundary(ctx: Ctx, section: CrossSection, holes: boolean): Ring[] {
  const cs = ctx.contours(section);
  const accepted = holes ? cs : cs.filter(c => signedArea(c) > 0);
  return (accepted.length ? accepted : cs).filter(c => c.length >= 6).map(c => {
    // Sample every polygon uniformly, including its corners. Contours can contain many
    // thousands of glyph curves; bounding-box pruning keeps the search bounded.
    const total = c.length / 2, n = Math.min(total, 96);
    const pts: Point[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < c.length; i += 2) {
      minX = Math.min(minX, c[i]!); maxX = Math.max(maxX, c[i]!);
      minY = Math.min(minY, c[i + 1]!); maxY = Math.max(maxY, c[i + 1]!);
    }
    for (let i = 0; i < n; i++) {
      const index = Math.floor((i * total) / n) * 2;
      pts.push([c[index]!, c[index + 1]!]);
    }
    return { points: pts, box: [minX, minY, maxX, maxY] };
  });
}

function boxDistanceSquared(a: Ring['box'], b: Ring['box']): number {
  const dx = Math.max(0, a[0] - b[2], b[0] - a[2]);
  const dy = Math.max(0, a[1] - b[3], b[1] - a[3]);
  return dx * dx + dy * dy;
}

function nearest(a: Ring[], b: Ring[]): { distance: number; from: Point; to: Point } | null {
  let best = Infinity;
  let from: Point | undefined, to: Point | undefined;
  // Look at all contours, including the holes bounding stencil letter cut-outs.
  // Outer-only matching would link a letter counter to the *frame*, creating a long bar.
  const pairs = a.flatMap(x => b.map(y => ({ x, y, lowerBound: boxDistanceSquared(x.box, y.box) })));
  pairs.sort((x, y) => x.lowerBound - y.lowerBound);
  for (const { x, y, lowerBound } of pairs) {
    if (lowerBound > best) break;
    for (const u of x.points) for (const v of y.points) {
      const dx = u[0] - v[0], dy = u[1] - v[1];
      const dist = dx * dx + dy * dy;
      if (dist < best) { best = dist; from = u; to = v; }
    }
  }
  return from && to ? { distance: best, from, to } : null;
}

function roundedBridge(ctx: Ctx, a: Point, b: Point, width: number): CrossSection {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  const disk = (p: Point) => ctx.cs([circle(width / 2, 24)]).translate(p);
  if (length < 1e-6) return disk(a);
  const bar = ctx.cs([rect(length, width)])
    .rotate(Math.atan2(dy, dx) * 180 / Math.PI)
    .translate([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  // The semicircular ends overlap their regions, producing a connected, printable solid.
  return bar.add(disk(a)).add(disk(b));
}

export interface JoinResult {
  section: CrossSection;
  connections: number;
  /** Longest connection measured between section boundaries, in mm. */
  longest: number;
}

/**
 * Join an arbitrary arrangement of distinct regions by a minimum-length spanning
 * tree. For cutters this connects adjacent letters without a strike-through. For
 * stencils, start from the biggest region (the frame) and connect every loose counter
 * to the nearest already-connected boundary, not across the entire word.
 */
export function connectRegions(ctx: Ctx, regions: readonly CrossSection[], width: number, includeHoles = false): JoinResult {
  const parts = regions.filter(p => !p.isEmpty());
  if (!parts.length) return { section: ctx.cs([]), connections: 0, longest: 0 };
  if (parts.length === 1) return { section: parts[0]!, connections: 0, longest: 0 };
  const contours = parts.map(part => boundary(ctx, part, includeHoles));
  const linked = new Set<number>([parts.reduce((largest, p, i) => p.area() > parts[largest]!.area() ? i : largest, 0)]);
  const bridges: CrossSection[] = [];
  let longest = 0;
  while (linked.size < parts.length) {
    let candidate = -1, best = Infinity, pair: ReturnType<typeof nearest> = null;
    for (const i of linked) for (let j = 0; j < parts.length; j++) {
      if (linked.has(j)) continue;
      const found = nearest(contours[i]!, contours[j]!);
      if (found && found.distance < best) {
        candidate = j; best = found.distance; pair = found;
      }
    }
    if (candidate < 0 || !pair) break;
    linked.add(candidate);
    longest = Math.max(longest, Math.sqrt(pair.distance));
    bridges.push(roundedBridge(ctx, pair.from, pair.to, width));
  }
  return { section: ctx.CrossSection.union([...parts, ...bridges]), connections: bridges.length, longest };
}
