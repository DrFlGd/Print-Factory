/** Helpers the templates share: turning a back over, finding free room, the NFC pocket's spot. */
import type { Contour } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { pointInside } from '@pf/shapes';
import type { Box } from './kit';
import { box, boxH, boxW, disc, GUTTER } from './kit';
import type { Card } from './layout';
import type { Ctx, Face, Piece, Plan } from './types';
import { emptyFace } from './types';

export interface Template {
  id: string;
  name: string;
  group: 'clean' | 'shapes' | 'patterns' | 'qr';
  portrait?: boolean;
  /** The NFC pocket is part of the design. */
  nfc?: boolean;
  /** The pattern's repeat at 100 % zoom on this design, mm (designs with a pattern area). */
  patternSize?: number;
  build(c: Card): Promise<Plan>;
}

const flip = (cs: CrossSection) => cs.mirror([1, 0]);

/** A face drawn as seen from behind, turned into the front's frame. */
export function fromBehind(f: Face): Face {
  return {
    fields: f.fields ? flip(f.fields) : null,
    carved: f.carved ? flip(f.carved) : null,
    pattern: f.pattern ? { ...f.pattern, cs: flip(f.pattern.cs), area: flip(f.pattern.area) } : null,
    ink: f.ink.map((p) => ({ ...p, cs: flip(p.cs) })),
  };
}

/** Front-frame geometry seen from behind (a window or a cut that runs through). */
export const behind = flip;

export const face = emptyFace;

export function unionOf(ctx: Ctx, items: (CrossSection | null | undefined)[]): CrossSection | null {
  const xs = items.filter((x): x is CrossSection => !!x && !x.isEmpty());
  return xs.length ? ctx.CrossSection.union(xs) : null;
}

export const inkOf = (ctx: Ctx, pieces: Piece[]) => unionOf(ctx, pieces.map((p) => p.cs));

/**
 * The largest box inside `inner` that keeps `gap` off `occupied`, on a 1 mm grid. `minW` and
 * `minH` reject slivers; `weight` > 1 prefers wide boxes.
 */
export function freeBox(ctx: Ctx, occupied: CrossSection | null, inner: Box, gap = GUTTER, weight = 1): Box {
  if (!occupied || occupied.isEmpty()) return inner;
  const step = 1;
  const grown = ctx.contours(occupied.offset(gap + step * 0.75, 'Square', 2, 0));
  const nx = Math.max(1, Math.floor(boxW(inner) / step));
  const ny = Math.max(1, Math.floor(boxH(inner) / step));
  const free: boolean[][] = [];
  for (let j = 0; j < ny; j++) {
    const row: boolean[] = [];
    for (let i = 0; i < nx; i++) row.push(!pointInside(grown, inner.x0 + (i + 0.5) * step, inner.y0 + (j + 0.5) * step));
    free.push(row);
  }
  // Largest rectangle of free cells (histogram per row).
  const hgt = new Array<number>(nx).fill(0);
  let best = { s: -1, i0: 0, i1: 0, j0: 0, j1: 0 };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) hgt[i] = free[j]![i] ? hgt[i]! + 1 : 0;
    for (let i = 0; i < nx; i++) {
      let hmin = Infinity;
      for (let k = i; k < nx && hgt[k]! > 0; k++) {
        hmin = Math.min(hmin, hgt[k]!);
        const wC = k - i + 1;
        const s = wC ** weight * hmin;
        if (s > best.s) best = { s, i0: i, i1: k + 1, j0: j - hmin + 1, j1: j + 1 };
      }
    }
  }
  if (best.s <= 0) return inner;
  return box(inner.x0 + best.i0 * step, inner.y0 + best.j0 * step, inner.x0 + best.i1 * step, inner.y0 + best.j1 * step);
}

/** A ring of card `t` wide round the card's edge, to keep keylines off it. */
export function edgeBand(ctx: Ctx, outline: CrossSection, t: number): CrossSection {
  return outline.subtract(outline.offset(-t, 'Miter', 2, 0));
}

/** Where the NFC tag goes: `want` if it is clear of every hole, else the nearest spot that is. */
export function pocketSpot(ctx: Ctx, c: Card, r: number, want: [number, number], holes: CrossSection | null, avoid: CrossSection | null): [number, number] | null {
  const mx = c.w / 2 - r - 2.5;
  const my = c.h / 2 - r - 2.5;
  if (mx < 0 || my < 0) return null;
  const spots: [number, number][] = [want];
  for (let x = -mx; x <= mx + 1e-6; x += 2.5) for (let y = -my; y <= my + 1e-6; y += 2.5) spots.push([x, y]);
  spots.sort((a, b) => Math.hypot(a[0] - want[0], a[1] - want[1]) - Math.hypot(b[0] - want[0], b[1] - want[1]));
  const ok = (x: number, y: number, what: CrossSection | null, g: number) => !what || disc(ctx, x, y, r + g).intersect(what).area() < 1e-3;
  for (const [x, y] of spots) if (Math.abs(x) <= mx + 1e-6 && Math.abs(y) <= my + 1e-6 && ok(x, y, holes, 2) && ok(x, y, avoid, 0)) return [x, y];
  for (const [x, y] of spots) if (Math.abs(x) <= mx + 1e-6 && Math.abs(y) <= my + 1e-6 && ok(x, y, holes, 2)) return [x, y];
  return null;
}

/** Contours as plain points, for a polygon field. */
export const poly = (pts: [number, number][]): Contour => pts.flat();
