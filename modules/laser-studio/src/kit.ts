/**
 * What every design shares: the settings, what a design returns, and the small steps most
 * designs take (marks from lettering, fitting lettering inside a region, blanks, stakes).
 */
import type { Contour, Diagnostic } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { circle, poleOf, roundedRect, translate } from '@pf/shapes';
import type { Ctx, Lettering, Marks } from './lib';
import { blank, blankHeight, noMarks, outlineOf, region, solid } from './lib';
import type { RingKind, RingSide } from './lib';

export type DesignId = string;

export interface Params {
  design: DesignId;
  text: string;
  text2: string;
  monogram: string;
  font: string;
  font2: string;
  size: number;
  size2: number;
  spacing: number;
  weight: number;
  op: 'engrave' | 'score' | 'cut';
  shape: string;
  tagWidth: number;
  tagHeight: number;
  diameter: number;
  border: number;
  cardWidth: number;
  cardHeight: number;
  bothSides: boolean;
  margin: number;
  smooth: number;
  symbol: string;
  symbolSize: number;
  pattern: string;
  patternOp: 'cut' | 'engrave' | 'score';
  patternSize: number;
  patternAngle: number;
  web: number;
  qrData: string;
  ecc: 'L' | 'M' | 'Q' | 'H';
  puzzleWidth: number;
  puzzleHeight: number;
  cols: number;
  rows: number;
  tabSize: number;
  seed: number;
  stakeLength: number;
  stakes: number;
  ring: RingKind;
  ringSide: RingSide;
  holeDiameter: number;
  ringWall: number;
  charmStyle: 'initial' | 'name' | 'symbol';
  mount: 'outline' | 'shape';
  tileSize: number;
  tileValues: boolean;
  heartSize: number;
  calDate: string;
  weekStart: 'sun' | 'mon';
  charmSize: number;
  songLength: string;
  progress: number;
  codeMode: 'qr' | 'blank' | 'none';
  slotWidth: number;
  slotDepth: number;
  legLength: number;
  frame: 'none' | 'ring' | 'disc' | 'scallop' | 'laurel';
  thickness: number;
  kerf: number;
  sheet: string;
  sheetWidth: number;
  sheetHeight: number;
  spacingSheet: number;
  color: [number, number, number];
  color2: [number, number, number];
}

export interface PieceOut {
  name: string;
  cut: CrossSection;
  marks: Marks;
  /** Open cut lines inside the piece (a jigsaw's). */
  cutLines?: Contour[];
  /** Where it sits in the assembled design: x, y and its layer (0 is the bottom sheet). */
  at: [number, number, number];
  /** Which sheet colour: the first or the second. */
  sheet: 0 | 1;
  /** How it is shown in 3D: turned about X, then Z, in degrees, and set back on the bed. */
  pose?: { rx?: number; rz?: number };
}

export interface DesignOut {
  pieces: PieceOut[];
  notes: Diagnostic[];
}

export type P = Params;

export const lines = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

export function marksFor(ctx: Ctx, l: CrossSection | null, op: P['op']): Marks {
  if (!l || l.isEmpty()) return noMarks();
  if (op === 'score') return { cut: null, engrave: null, score: outlineOf(ctx, l) };
  if (op === 'cut') return { cut: l, engrave: null, score: [] };
  return { cut: null, engrave: l, score: [] };
}

export function one(name: string, cut: CrossSection, marks: Marks = noMarks()): PieceOut {
  return { name, cut, marks, at: [0, 0, 0], sheet: 0 };
}

/**
 * Lettering as large as it will go (never larger than it was typed) wholly inside `area`:
 * centred on the area's middle, or on its widest point when the middle is outside it.
 */
export function fitInside(ctx: Ctx, l: Lettering, area: CrossSection, fill = 0.8): Lettering {
  if (area.isEmpty()) return region(ctx, l.cs.scale([0.01, 0.01]));
  const b = area.bounds();
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  const at = (x: number, y: number, k: number) => l.cs.scale([k, k]).translate([x - l.b.cx * k, y - l.b.cy * k]);
  const inside = (x: number, y: number, k: number) => at(x, y, k).subtract(area).area() < 1e-3;
  const top = Math.min(1, ((b.max[0] - b.min[0]) * fill) / l.b.width, ((b.max[1] - b.min[1]) * fill) / l.b.height);
  const largest = (x: number, y: number) => {
    if (inside(x, y, top)) return top;
    let lo = 0;
    let hi = top;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (inside(x, y, mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  // Candidates: the middle, points down the middle line, and the widest point.
  const cands: [number, number][] = [[cx, cy]];
  for (const f of [0.3, 0.4, 0.5, 0.6, 0.7]) cands.push([cx, b.min[1] + (b.max[1] - b.min[1]) * f]);
  const pole = poleOf(ctx.contours(area), 0.25);
  cands.push([pole.x, pole.y]);
  let best = { x: cx, y: cy, k: 0 };
  for (const [x, y] of cands) {
    const k = largest(x, y);
    // The middle wins unless somewhere else fits clearly larger lettering.
    if (k > best.k * 1.08) best = { x, y, k };
  }
  return region(ctx, at(best.x, best.y, best.k * 0.97));
}

export function marginWarning(notes: Diagnostic[], what: string) {
  notes.push({ level: 'warning', message: `Type some ${what} to see the design.` });
}

export function tagBlank(ctx: Ctx, p: P): CrossSection {
  const tall = ['rectangle', 'oval', 'pill', 'rounded-square', 'squircle'].includes(p.shape);
  return blank(ctx, p.shape, p.tagWidth, tall ? p.tagHeight : blankHeight(p.shape, p.tagWidth));
}

/** Where marks may go on a blank: in from its edge and clear of the ring's hole. */
export function writable(ctx: Ctx, body: CrossSection, hole: CrossSection | null, margin: number): CrossSection {
  let a = body.offset(-margin, 'Round', 2, 32);
  if (hole) a = a.subtract(hole.offset(margin + 0.5, 'Round', 2, 32));
  return a;
}

export function holesInText(ctx: Ctx, s: CrossSection): boolean {
  return solid(ctx, s).area() - s.area() > 0.5;
}

export function disc(ctx: Ctx, p: P, scallop: boolean): CrossSection {
  const R = p.diameter / 2;
  if (!scallop) return ctx.cs([circle(R, 128)]);
  const n = Math.max(12, Math.round((Math.PI * p.diameter) / 12));
  const bump = (Math.PI * R) / n;
  const bumps = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return translate([circle(bump, 32)], (R - bump) * Math.cos(a), (R - bump) * Math.sin(a))[0]!;
  });
  return ctx.cs([circle(R - bump, 128), ...bumps], 'NonZero');
}

export function stake(ctx: Ctx, x: number, top: number, w: number, len: number): CrossSection {
  const tip = w * 1.2;
  return ctx.cs([[x - w / 2, top, x - w / 2, top - len + tip, x, top - len, x + w / 2, top - len + tip, x + w / 2, top]]);
}

