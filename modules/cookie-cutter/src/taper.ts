/**
 * A smooth 3D taper along a cutter perimeter. The cookie-side boundary stays fixed;
 * only the *outside* of the wall moves toward it. Unlike stacks of offset slabs,
 * this produces genuinely sloped faces with no horizontal steps.
 */
import type { CrossSection, Manifold } from '@pf/engine-manifold';
import type { Ctx } from './types';

const EPS = 1e-6;
export const smoothstep = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/**
 * The outer wall reduces smoothly over the last 3 mm. With thinEdge off it
 * stays at the selected thickness all the way to the cutting edge.
 */
export function cuttingThickness(z: number, totalHeight: number, wall: number, thinEdge: boolean): number {
  if (!thinEdge) return wall;
  const top = Math.min(wall, 0.6);
  const rise = Math.min(3, totalHeight * .25);
  return wall + (top - wall) * smoothstep((z - (totalHeight - rise)) / rise);
}

/** The wide, hand-safe rim keeps its flat grip, then blends into the main wall. */
export function rimThicknessAt(
  z: number, wall: number, rimWidth: number, flatHeight: number, transitionHeight: number,
): number {
  return wall + rimWidth * (1 - smoothstep((z - flatHeight) / transitionHeight));
}

type Edge = { ax: number; ay: number; bx: number; by: number };
function outlineEdges(ctx: Ctx, cut: CrossSection): Edge[] {
  const edges: Edge[] = [];
  for (const c of ctx.contours(cut)) {
    for (let j = 0; j < c.length; j += 2) {
      const next = (j + 2) % c.length;
      edges.push({ ax: c[j]!, ay: c[j + 1]!, bx: c[next]!, by: c[next + 1]! });
    }
  }
  return edges;
}

function closestPoint(x: number, y: number, edges: readonly Edge[]): [number, number] {
  let resultX = x, resultY = y, best = Infinity;
  for (const { ax, ay, bx, by } of edges) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 <= EPS ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const xx = ax + t * dx, yy = ay + t * dy;
    const dist2 = (xx - x) ** 2 + (yy - y) ** 2;
    if (dist2 < best) {
      best = dist2;
      resultX = xx;
      resultY = yy;
      if (dist2 < 1e-12) break;
    }
  }
  return [resultX, resultY];
}

/**
 * A ring extruded with intermediate divisions, and its outside vertices warped
 * continuously toward the original cookie outline at each Z. The nearest-point
 * mapping is cached per 2D contour vertex (all Z rings share the same XY vertices).
 * Submillimetre offsets thus remain continuous even on curved / polygonal cutters.
 */
export function taperedRing(
  ctx: Ctx,
  cut: CrossSection,
  baseWidth: number,
  height: number,
  thicknessAt: (z: number) => number,
  divisions: number,
): Manifold {
  const section = cut.offset(baseWidth, 'Round', 2, 28).subtract(cut);
  if (section.isEmpty() || height <= 0) return ctx.Manifold.union([]);
  const edges = outlineEdges(ctx, cut);
  const anchors = new Map<string, [number, number]>();
  const n = Math.max(2, Math.ceil(divisions));
  return ctx.Manifold.extrude(section, height, n).warp((v) => {
    const x = v[0]!, y = v[1]!, z = v[2]!;
    const target = Math.min(baseWidth, Math.max(0.1, thicknessAt(z)));
    if (Math.abs(target - baseWidth) < EPS) return;
    const key = Math.round(x * 1e4) + ',' + Math.round(y * 1e4);
    let anchor = anchors.get(key);
    if (!anchor) { anchor = closestPoint(x, y, edges); anchors.set(key, anchor); }
    const ratio = target / baseWidth;
    v[0] = anchor[0] + (x - anchor[0]) * ratio;
    v[1] = anchor[1] + (y - anchor[1]) * ratio;
  });
}
