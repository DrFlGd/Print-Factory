/**
 * Repeating patterns drawn from their geometry: each gives CELLS (closed
 * regions, cut out or engraved with a web of wood between them) and LINES (every edge once,
 * for scoring). Everything is in pattern space, centred on the origin and covering a square of
 * half-size `R`; `size` is the repeat, mm.
 */
import type { Contour } from '@pf/core';
import { closeLoop, uniqueEdges } from './lines';
import { circle, star } from './primitives';

/** A cell is `add` less any of `minus` (a seigaiha band under the scales in front of it). */
export interface PatternCell {
  add: Contour;
  minus?: Contour[];
}

export interface PatternGeometry {
  cells: PatternCell[];
  lines: Contour[];
}

export const PATTERN_IDS = ['hexagons', 'asanoha', 'seigaiha', 'shippo', 'stars', 'diamonds', 'dots', 'waves', 'blocks', 'rays', 'dahlia'] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

const plain = (cs: Contour[]): PatternCell[] => cs.map((add) => ({ add }));

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
  const cells: PatternCell[] = [];
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
  const cells: PatternCell[] = [];
  for (let j = -nj; j <= nj; j++) {
    lines.push(wave(j * dy, 1));
    cells.push({ add: [...wave(j * dy, 1), ...wave((j + 1) * dy, -1)] });
  }
  return { cells, lines };
}

/** Tumbling blocks: each hexagon split into three rhombi meeting at its centre, a cube seen corner on. */
function blocks(R: number, s: number): PatternGeometry {
  const rc = s / Math.sqrt(3);
  const dy = 1.5 * rc;
  const cells: Contour[] = [];
  const nj = Math.ceil(R / dy) + 1;
  const ni = Math.ceil(R / s) + 1;
  for (let j = -nj; j <= nj; j++)
    for (let i = -ni; i <= ni; i++) {
      const cx = i * s + (j & 1 ? s / 2 : 0);
      const cy = j * dy;
      const v = (k: number): [number, number] => {
        const a = ((30 + 60 * k) * Math.PI) / 180;
        return [cx + rc * Math.cos(a), cy + rc * Math.sin(a)];
      };
      for (const k of [0, 2, 4]) cells.push([cx, cy, ...v(k), ...v(k + 1), ...v(k + 2)]);
    }
  return { cells: plain(cells), lines: uniqueEdges(cells) };
}

/** How many spokes round a radial pattern of repeat `s`. */
const spokes = (s: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round((2 * Math.PI * 24) / s)));

/** Rays: wedges from a small hub out past the edge, a sunburst. */
function rays(R: number, s: number): PatternGeometry {
  const n = spokes(s, 6, 48);
  const r0 = s;
  const r1 = R * 1.5;
  const cells: Contour[] = [];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    const c: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = a0 + ((a1 - a0) * i) / 8;
      c.push(r1 * Math.cos(a), r1 * Math.sin(a));
    }
    for (let i = 8; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / 8;
      c.push(r0 * Math.cos(a), r0 * Math.sin(a));
    }
    cells.push(c);
  }
  return { cells: plain(cells), lines: uniqueEdges(cells) };
}

/**
 * Dahlia: rings of pointed petals round one point, each ring turned half a petal against the
 * last and a size up. A staggered grid of diamonds drawn in (ln r, angle), so every petal keeps
 * its shape and grows with its distance from the centre; the ones too small for the web stay
 * solid, a heart the petals grow out of.
 */
function dahlia(R: number, s: number): PatternGeometry {
  const n = spokes(s, 8, 40);
  const dt = (Math.PI * 2) / n;
  const du = dt * 1.15;
  const u0 = Math.log(s * 0.5);
  const uMax = Math.log(R * 1.5);
  const at = (u: number, t: number) => [Math.exp(u) * Math.cos(t), Math.exp(u) * Math.sin(t)];
  const cells: Contour[] = [];
  for (let k = 0; u0 + (k * du) / 2 - du / 2 < uMax; k++) {
    const u = u0 + (k * du) / 2;
    for (let j = 0; j < n; j++) {
      const t = (j + (k % 2) / 2) * dt;
      const corners: [number, number][] = [
        [u - du / 2, t],
        [u, t + dt / 2],
        [u + du / 2, t],
        [u, t - dt / 2],
      ];
      const c: number[] = [];
      for (let e = 0; e < 4; e++) {
        const [ua, ta] = corners[e]!;
        const [ub, tb] = corners[(e + 1) % 4]!;
        for (let i = 0; i < 6; i++) c.push(...at(ua + ((ub - ua) * i) / 6, ta + ((tb - ta) * i) / 6));
      }
      cells.push(c);
    }
  }
  return { cells: plain(cells), lines: uniqueEdges(cells) };
}

const MAKERS: Record<PatternId, (R: number, s: number) => PatternGeometry> = { hexagons, asanoha, seigaiha, shippo, stars, diamonds, dots, waves, blocks, rays, dahlia };

export function patternGeometry(id: string, R: number, size: number): PatternGeometry {
  const make = MAKERS[id as PatternId] ?? hexagons;
  return make(R, Math.max(2, size));
}
