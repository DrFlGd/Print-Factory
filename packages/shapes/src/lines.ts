/**
 * Open polylines against regions: clipping score lines to a window, and joining loose
 * segments into longer runs so a laser does not lift between every one.
 */
import type { Contour } from '@pf/core';
import { pointInside } from './contour';

/** Where segment p→q crosses segment a→b, as the fraction along p→q, or null. */
function crossing(px: number, py: number, qx: number, qy: number, ax: number, ay: number, bx: number, by: number): number | null {
  const rx = qx - px;
  const ry = qy - py;
  const sx = bx - ax;
  const sy = by - ay;
  const d = rx * sy - ry * sx;
  if (Math.abs(d) < 1e-12) return null;
  const t = ((ax - px) * sy - (ay - py) * sx) / d;
  const u = ((ax - px) * ry - (ay - py) * rx) / d;
  return t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1 ? t : null;
}

/**
 * The parts of each polyline inside `region` (even-odd over its contours, so islands with
 * holes work). A polyline that leaves and re-enters comes back as several.
 */
export function clipPolylines(lines: Contour[], region: Contour[]): Contour[] {
  const edges: number[] = [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of region) {
    const n = c.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      edges.push(c[i * 2]!, c[i * 2 + 1]!, c[j * 2]!, c[j * 2 + 1]!);
      x0 = Math.min(x0, c[i * 2]!);
      x1 = Math.max(x1, c[i * 2]!);
      y0 = Math.min(y0, c[i * 2 + 1]!);
      y1 = Math.max(y1, c[i * 2 + 1]!);
    }
  }
  const out: Contour[] = [];
  for (const line of lines) {
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 4) out.push(run);
      run = [];
    };
    for (let i = 0; i + 3 < line.length; i += 2) {
      const px = line[i]!;
      const py = line[i + 1]!;
      const qx = line[i + 2]!;
      const qy = line[i + 3]!;
      if (Math.max(px, qx) < x0 || Math.min(px, qx) > x1 || Math.max(py, qy) < y0 || Math.min(py, qy) > y1) {
        flush();
        continue;
      }
      const ts = [0, 1];
      for (let e = 0; e < edges.length; e += 4) {
        const t = crossing(px, py, qx, qy, edges[e]!, edges[e + 1]!, edges[e + 2]!, edges[e + 3]!);
        if (t !== null) ts.push(t);
      }
      ts.sort((a, b) => a - b);
      for (let k = 0; k + 1 < ts.length; k++) {
        const a = ts[k]!;
        const b = ts[k + 1]!;
        if (b - a < 1e-9) continue;
        const m = (a + b) / 2;
        const inside = pointInside(region, px + (qx - px) * m, py + (qy - py) * m);
        if (!inside) {
          flush();
          continue;
        }
        const ax = px + (qx - px) * a;
        const ay = py + (qy - py) * a;
        if (!run.length) run.push(ax, ay);
        else if (Math.hypot(run[run.length - 2]! - ax, run[run.length - 1]! - ay) > 1e-7) {
          flush();
          run.push(ax, ay);
        }
        run.push(px + (qx - px) * b, py + (qy - py) * b);
      }
    }
    flush();
  }
  return out;
}

/**
 * Every edge of `contours` once (an edge two cells share is drawn once), chained into
 * polylines. Points closer than `eps` are one point.
 */
export function uniqueEdges(contours: Contour[], eps = 1e-3): Contour[] {
  const key = (x: number, y: number) => `${Math.round(x / eps)},${Math.round(y / eps)}`;
  const pts = new Map<string, [number, number]>();
  const seen = new Set<string>();
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
  };
  for (const c of contours) {
    const n = c.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = key(c[i * 2]!, c[i * 2 + 1]!);
      const b = key(c[j * 2]!, c[j * 2 + 1]!);
      if (a === b) continue;
      pts.set(a, [c[i * 2]!, c[i * 2 + 1]!]);
      pts.set(b, [c[j * 2]!, c[j * 2 + 1]!]);
      const e = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(e)) continue;
      seen.add(e);
      link(a, b);
      link(b, a);
    }
  }
  const used = new Set<string>();
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const out: Contour[] = [];
  // Start at odd-degree points first, so open chains come out whole.
  const starts = [...adj.keys()].sort((a, b) => (adj.get(a)!.length % 2) - (adj.get(b)!.length % 2)).reverse();
  for (const s of starts) {
    for (;;) {
      const next = adj.get(s)!.find((b) => !used.has(edgeKey(s, b)));
      if (!next) break;
      const run = [...pts.get(s)!];
      let at = s;
      let to: string | undefined = next;
      while (to) {
        used.add(edgeKey(at, to));
        run.push(...pts.get(to)!);
        at = to;
        to = adj.get(at)!.find((b) => !used.has(edgeKey(at, b)));
      }
      out.push(run);
    }
  }
  return out;
}

/** A closed outline as an open polyline that ends where it starts. */
export function closeLoop(c: Contour): Contour {
  return c.length >= 4 ? [...c, c[0]!, c[1]!] : c;
}
