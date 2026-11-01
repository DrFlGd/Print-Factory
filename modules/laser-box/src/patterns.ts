/**
 * Repeating patterns for a box's faces, drawn from their geometry: each gives CELLS (closed
 * regions, cut out or engraved with a web of wood between them) and LINES (every edge once,
 * for scoring). Everything is in pattern space, centred on the origin and covering a square of
 * half-size `R`; `size` is the repeat, mm.
 */
import type { Contour } from '@pf/core';
import { circle, closeLoop, star, uniqueEdges } from '@pf/shapes';

/** A cell is `add` less any of `minus` (a seigaiha band under the scales in front of it). */
export interface Cell {
  add: Contour;
  minus?: Contour[];
}

export interface PatternGeometry {
  cells: Cell[];
  lines: Contour[];
}

export const PATTERNS = ['hexagons', 'asanoha', 'seigaiha', 'shippo', 'stars', 'diamonds', 'dots', 'waves'] as const;
export type PatternId = (typeof PATTERNS)[number];

const plain = (cs: Contour[]): Cell[] => cs.map((add) => ({ add }));

function hexagons(R: number, s: number): PatternGeometry {
  const rc = s / Math.sqrt(3);
  const dy = 1.5 * rc;
  const cells: Contour[] = [];
  const nj = Math.ceil(R / dy) + 1;
  const ni = Math.ceil(R / s) + 1;
  for (let j = -nj; j <= nj; j++)
    for (let i = -ni; i <= ni; i++) {
      const cx = i * s + (j & 1 ? s / 2 : 0);
      const cy = j * dy;
      const c: number[] = [];
      for (let k = 0; k < 6; k++) {
        const a = ((30 + 60 * k) * Math.PI) / 180;
        c.push(cx + rc * Math.cos(a), cy + rc * Math.sin(a));
      }
      cells.push(c);
    }
  return { cells: plain(cells), lines: uniqueEdges(cells) };
}

/** Hemp leaf: a triangle grid with each triangle split from its centre to its corners. */
function asanoha(R: number, s: number): PatternGeometry {
  const h = (s * Math.sqrt(3)) / 2;
  const P = (i: number, j: number): [number, number] => [i * s + j * (s / 2), j * h];
  const cells: Contour[] = [];
  const nj = Math.ceil(R / h) + 1;
  for (let j = -nj; j <= nj; j++) {
    const shift = Math.ceil(R / s) + Math.ceil(Math.abs(j) / 2) + 1;
    for (let i = -shift; i <= shift; i++) {
      type T = [number, number];
      const tris: [T, T, T][] = [
        [P(i, j), P(i + 1, j), P(i, j + 1)],
        [P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)],
      ];
      for (const [a, b, c] of tris) {
        if (Math.abs(a[0]) > R + 2 * s) continue;
        const g: [number, number] = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
        const edges: [T, T][] = [
          [a, b],
          [b, c],
          [c, a],
        ];
        for (const [p, q] of edges)
          cells.push([p[0], p[1], q[0], q[1], g[0], g[1]]);
      }
    }
  }
  return { cells: plain(cells), lines: uniqueEdges(cells) };
}

/**
 * Waves: rows of circles `size` across, each row half a radius above the last and half a
 * repeat across, every row in front of the rows above it; each scale is drawn as four rings.
 */
function seigaiha(R: number, s: number): PatternGeometry {
  const r = s / 2;
  const dy = r / 2;
  const nj = Math.ceil(R / dy) + 3;
  const ni = Math.ceil(R / (2 * r)) + 2;
  const centres: [number, number, number][] = [];
  for (let j = -nj; j <= nj; j++) for (let i = -ni; i <= ni; i++) centres.push([i * 2 * r + (j & 1 ? r : 0), j * dy, j]);
  const rings = [1, 0.75, 0.5, 0.25];
  const segs = 72;
  const cells: Cell[] = [];
  const lines: Contour[] = [];
  for (const [cx, cy, j] of centres) {
    // Scales in front: rows below this one, near enough to overlap.
    const front = centres.filter(([x, y, k]) => k < j && k >= j - 4 && Math.hypot(x - cx, y - cy) < 2 * r - 1e-9);
    const hidden = (x: number, y: number) => front.some(([fx, fy]) => Math.hypot(x - fx, y - fy) < r - 1e-9);
    const disc = (rr: number) => circle(rr, segs).map((v, i) => v + (i % 2 ? cy : cx));
    rings.forEach((k, n) => {
      const outer = disc(r * k);
      const minus = front.map(([fx, fy]) => circle(r, segs).map((v, i) => v + (i % 2 ? fy : fx)));
      if (n + 1 < rings.length) minus.push(disc(r * rings[n + 1]!));
      cells.push({ add: outer, minus });
      // The ring's visible arcs, as lines.
      let run: number[] = [];
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const x = cx + r * k * Math.cos(a);
        const y = cy + r * k * Math.sin(a);
        if (hidden(x, y)) {
          if (run.length >= 4) lines.push(run);
          run = [];
        } else run.push(x, y);
      }
      if (run.length >= 4) lines.push(run);
    });
  }
  return { cells, lines };
}

/** Seven treasures: overlapping circles on a square grid; the cells are their petals. */
function shippo(R: number, s: number): PatternGeometry {
  const r = s / Math.SQRT2;
  const n = Math.ceil(R / s) + 1;
  const cells: Contour[] = [];
  const lines: Contour[] = [];
  const arc = (cx: number, cy: number, from: number, to: number, out: number[]) => {
    const k = 16;
    for (let i = 0; i <= k; i++) {
      const a = ((from + ((to - from) * i) / k) * Math.PI) / 180;
      out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  };
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++) {
      const x = i * s;
      const y = j * s;
      lines.push(closeLoop(circle(r, 64).map((v, k) => v + (k % 2 ? y : x))));
      // Petals towards the right and upper neighbours.
      const right: number[] = [];
      arc(x, y, -45, 45, right);
      arc(x + s, y, 135, 225, right);
      cells.push(right);
      const up: number[] = [];
      arc(x, y, 45, 135, up);
      arc(x, y + s, 225, 315, up);
      cells.push(up);
    }
  return { cells: plain(cells), lines };
}

function stars(R: number, s: number): PatternGeometry {
  const n = Math.ceil(R / s) + 1;
  const cells: Contour[] = [];
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++) cells.push(star(5, s * 0.42, s * 0.17).map((v, k) => v + (k % 2 ? j * s * 0.87 : i * s + (j & 1 ? s / 2 : 0))));
  return { cells: plain(cells), lines: cells.map(closeLoop) };
}

function diamonds(R: number, s: number): PatternGeometry {
  const h = s * 1.5;
  const n = Math.ceil(R / s) + 1;
  const nj = Math.ceil(R / (h / 2)) + 1;
  const cells: Contour[] = [];
  for (let j = -nj; j <= nj; j++)
    for (let i = -n; i <= n; i++) {
      const cx = i * s + (j & 1 ? s / 2 : 0);
      const cy = (j * h) / 2;
      cells.push([cx, cy - h / 2, cx + s / 2, cy, cx, cy + h / 2, cx - s / 2, cy]);
    }
  return { cells: plain(cells), lines: uniqueEdges(cells) };
}

function dots(R: number, s: number): PatternGeometry {
  const dy = (s * Math.sqrt(3)) / 2;
  const n = Math.ceil(R / s) + 1;
  const nj = Math.ceil(R / dy) + 1;
  const cells: Contour[] = [];
  for (let j = -nj; j <= nj; j++) for (let i = -n; i <= n; i++) cells.push(circle(s * 0.32, 32).map((v, k) => v + (k % 2 ? j * dy : i * s + (j & 1 ? s / 2 : 0))));
  return { cells: plain(cells), lines: cells.map(closeLoop) };
}

function waves(R: number, s: number): PatternGeometry {
  const dy = s * 0.5;
  const amp = s * 0.18;
  const nj = Math.ceil(R / dy) + 1;
  const wave = (y0: number, dir: 1 | -1) => {
    const out: number[] = [];
    const steps = Math.ceil((2 * R) / (s / 12));
    for (let i = 0; i <= steps; i++) {
      const x = dir > 0 ? -R + (2 * R * i) / steps : R - (2 * R * i) / steps;
      out.push(x, y0 + amp * Math.sin((2 * Math.PI * x) / s));
    }
    return out;
  };
  const lines: Contour[] = [];
  const cells: Cell[] = [];
  for (let j = -nj; j <= nj; j++) {
    lines.push(wave(j * dy, 1));
    cells.push({ add: [...wave(j * dy, 1), ...wave((j + 1) * dy, -1)] });
  }
  return { cells, lines };
}

const MAKERS: Record<PatternId, (R: number, s: number) => PatternGeometry> = { hexagons, asanoha, seigaiha, shippo, stars, diamonds, dots, waves };

export function patternGeometry(id: string, R: number, size: number): PatternGeometry {
  const make = MAKERS[id as PatternId] ?? hexagons;
  return make(R, Math.max(2, size));
}
