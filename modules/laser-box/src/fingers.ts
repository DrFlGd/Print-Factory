/**
 * How many fingers an edge gets and where. Fingers and the gaps between them are cut in an
 * odd number of equal segments, so both ends of an edge are a gap: the piece that owns the
 * corners keeps them, and two pieces walking the same edge from either end agree.
 */

/** Plain finger width for a sheet `t` thick, mm. */
export const fingerWidth = (t: number): number => Math.min(20, Math.max(6, 3 * t));
/** The narrowest plain finger worth cutting. */
export const fingerMin = (t: number): number => Math.max(3, 1.5 * t);
/**
 * A flex tab is wider: two slits, each an arm's width (a sheet) in from its sides, and room
 * between them for the arms to bend into.
 */
export const flexWidth = (t: number): number => Math.min(30, Math.max(10, 4.5 * t));
export const flexMin = (t: number): number => Math.max(6, 2.5 * t);

export type Interval = [number, number];

/** Fingers along [lo, hi] about `target` wide, never under `min`. */
export function planEdge(lo: number, hi: number, target: number, min: number): Interval[] {
  const len = hi - lo;
  if (len < 3 * min) return [];
  let k = Math.floor(len / target);
  if (k % 2 === 0) k -= 1;
  if (k < 3) k = 3;
  const s = len / k;
  const out: Interval[] = [];
  for (let i = 1; i < k; i += 2) out.push([lo + i * s, lo + (i + 1) * s]);
  return out;
}

/**
 * Fingers along [lo, hi] that keep `clear` mm away from each band in `avoid` (where a
 * third piece crosses the edge: a floor, a shelf, a divider).
 */
export function planAround(lo: number, hi: number, avoid: Interval[], target: number, min: number, clear = 0): Interval[] {
  const cuts = avoid
    .map(([a, b]) => [a - clear, b + clear] as Interval)
    .filter(([a, b]) => b > lo && a < hi)
    .sort((p, q) => p[0] - q[0]);
  const out: Interval[] = [];
  let at = lo;
  for (const [a, b] of cuts) {
    if (a > at) out.push(...planEdge(at, a, target, min));
    at = Math.max(at, b);
  }
  if (hi > at) out.push(...planEdge(at, hi, target, min));
  return out;
}
