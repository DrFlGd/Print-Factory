/**
 * Editable, rotationally symmetric bauble profile. Coordinates are [height, radius], both
 * normalized to 0..1, from the bottom pole to the top pole. The two poles stay on the axis.
 * Stored as a hidden string parameter so projects, presets, share links and undo keep the curve.
 */
export type ProfileNode = [number, number];
export const MAX_PROFILE_NODES = 18;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Untrusted project/share-link values must not produce NaNs, self-crossings or enormous meshes. */
export function parseProfile(value: unknown): ProfileNode[] | null {
  if (typeof value !== 'string' || !value || value.length > 2048) return null;
  let data: unknown;
  try { data = JSON.parse(value); } catch { return null; }
  if (!Array.isArray(data) || data.length < 3 || data.length > MAX_PROFILE_NODES) return null;
  const nodes: ProfileNode[] = [];
  for (const item of data) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [u, r] = item as unknown[];
    if (typeof u !== 'number' || typeof r !== 'number' || !Number.isFinite(u) || !Number.isFinite(r) || u < 0 || u > 1 || r < 0 || r > 1) return null;
    if (nodes.length && u - nodes[nodes.length - 1]![0] < 0.015) return null;
    nodes.push([u, r]);
  }
  if (nodes[0]![0] !== 0 || nodes[0]![1] !== 0 || nodes[nodes.length - 1]![0] !== 1 || nodes[nodes.length - 1]![1] !== 0) return null;
  return nodes;
}

export function encodeProfile(nodes: readonly ProfileNode[]): string {
  return JSON.stringify(nodes.map(([u, r], i) => [
    i === 0 ? 0 : i === nodes.length - 1 ? 1 : Number(u.toFixed(3)),
    i === 0 || i === nodes.length - 1 ? 0 : Number(r.toFixed(3)),
  ]));
}

/** An editable approximation of the old three-slider custom profile. */
export function legacyProfile(bulge: number, top: number, bottom: number): ProfileNode[] {
  const b = clamp(bulge, 0.15, 0.85);
  return Array.from({ length: 11 }, (_, i): ProfileNode => {
    const u = i / 10;
    const d = u < b ? (b - u) / b : (u - b) / (1 - b);
    const n = Math.max(0.4, u < b ? bottom : top);
    return [u, Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, d), n)), 1 / n)];
  });
}

/** Shape-preserving cubic Hermite curve: smooth without overshooting a narrow neck or bulge. */
export function profileRadius(nodes: readonly ProfileNode[], u: number): number {
  if (u <= 0 || u >= 1) return 0;
  let i = 0;
  while (i < nodes.length - 2 && nodes[i + 1]![0] < u) i++;
  const a = nodes[i]!, b = nodes[i + 1]!;
  const h = b[0] - a[0];
  if (h <= 0) return 0;
  const slope = (j: number) => (nodes[j + 1]![1] - nodes[j]![1]) / (nodes[j + 1]![0] - nodes[j]![0]);
  // Harmonic mean of adjacent secants (PCHIP). Extrema receive a horizontal tangent.
  const tangent = (j: number): number => {
    if (j === 0) return slope(0);
    if (j === nodes.length - 1) return slope(j - 1);
    const d0 = slope(j - 1), d1 = slope(j);
    if (d0 * d1 <= 0) return 0;
    const h0 = nodes[j]![0] - nodes[j - 1]![0];
    const h1 = nodes[j + 1]![0] - nodes[j]![0];
    const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / d0 + w1 / d1);
  };
  const t = (u - a[0]) / h;
  const t2 = t * t, t3 = t2 * t;
  return clamp((2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * h * tangent(i) +
    (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * h * tangent(i + 1), 0, 1);
}
