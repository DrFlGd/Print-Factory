/**
 * Adapters between hoses, pipes and ports of different sizes: vacuum and dust-extraction
 * reducers, garden and aquarium hose joiners, pipe couplers.
 *
 * Each end is one of three fits, sized from what you can measure:
 *
 *   socket  slides over a pipe or a port; you give the pipe's outside diameter
 *   spigot  pushes into a hose cuff or a port; you give its inside diameter
 *   barb    a flexible hose pushes over it; you give the hose's inside diameter
 *
 * The profile is drawn in (r, z) with end A at the bottom and revolved. Between the ends a
 * cone takes the inside and the outside from one size to the other at no more than 45°, so
 * it prints upright without supports.
 */
import type { BuildResult, Diagnostic, Part, RGB } from '@pf/core';
import type { ManifoldContext } from '@pf/engine-manifold';

export type EndType = 'socket' | 'spigot' | 'barb';

export interface Params {
  aType: EndType;
  aDia: number;
  aLength: number;
  bType: EndType;
  bDia: number;
  bLength: number;
  wall: number;
  fit: 'snug' | 'standard' | 'loose';
  taper: number;
  transition: number;
  detail: 'draft' | 'standard' | 'fine';
  color: RGB;
}

type Ctx = ManifoldContext<Params>;

/** Clearance on the radius, mm, between a printed fit and what it fits. */
export const CLEARANCE = { snug: 0.05, standard: 0.15, loose: 0.3 } as const;
const LEAD_IN = 0.8;
const SEGMENTS = { draft: 64, standard: 128, fine: 256 } as const;
/** A barb's ramp, from the axis: shallow enough to push a hose over. */
const BARB_RAMP = (15 * Math.PI) / 180;

/** Points (s, r): s from the end's mouth inwards, r the radius there. */
type Path = [number, number][];

export interface EndProfile {
  outer: Path;
  inner: Path;
  /** What it fits, in words, for the summary. */
  label: string;
}

/** The outer and inner profile of one end, `L` long, from its mouth. */
export function endProfile(type: EndType, d: number, L: number, wall: number, fit: Params['fit'], taperDeg: number): EndProfile {
  const c = CLEARANCE[fit];
  const t = Math.tan((Math.max(0, taperDeg) * Math.PI) / 180);
  const lead = Math.min(LEAD_IN, L / 4);
  switch (type) {
    case 'socket': {
      // The bore is the pipe plus the clearance at mid-length, wider at the mouth.
      const r = (s: number) => d / 2 + c - (s - L / 2) * t;
      const R = r(0) + wall;
      const stop = Math.min(1.5, wall * 0.6, L / 4);
      return {
        outer: [
          [0, R],
          [L, R],
        ],
        // A 45° ledge at the far end that the pipe stops against.
        inner: [
          [0, r(0) + lead],
          [lead, r(lead)],
          [L - stop, r(L - stop)],
          [L, r(L - stop) - stop],
        ],
        label: `socket over Ø${fmt(d)}`,
      };
    }
    case 'spigot': {
      // The outside is the hole less the clearance at mid-length, narrower at the tip.
      const r = (s: number) => d / 2 - c + (s - L / 2) * t;
      const ri = Math.max(1, r(0) - wall);
      return {
        outer: [
          [0, r(0) - lead],
          [lead, r(lead)],
          [L, r(L)],
        ],
        inner: [
          [0, ri],
          [L, ri],
        ],
        label: `spigot into Ø${fmt(d)}`,
      };
    }
    default: {
      // Ridges that ramp out at 15° from the tip and drop back at 45° (so they print).
      const rb = d / 2;
      const h = Math.max(0.6, Math.min(2.5, d * 0.1));
      const ramp = h / Math.tan(BARB_RAMP);
      const pitch = ramp + h;
      const n = Math.max(1, Math.floor((L - 1) / pitch));
      const outer: Path = [[0, rb - h * 0.4]];
      let s = 0;
      for (let i = 0; i < n; i++) {
        outer.push([s + ramp, rb + h]);
        s += pitch;
        outer.push([s, rb]);
      }
      outer.push([L, rb]);
      const ri = Math.max(0.75, rb - h * 0.4 - wall);
      return {
        outer,
        inner: [
          [0, ri],
          [L, ri],
        ],
        label: `barb for Ø${fmt(d)} hose`,
      };
    }
  }
}

const fmt = (x: number) => (Math.round(x * 10) / 10).toString();
const last = (p: Path) => p[p.length - 1]!;
const first = (p: Path) => p[0]!;

export async function build(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  const notes: Diagnostic[] = [];
  const wall = Math.max(0.8, p.wall);
  const A = endProfile(p.aType, p.aDia, p.aLength, wall, p.fit, p.taper);
  const B = endProfile(p.bType, p.bDia, p.bLength, wall, p.fit, p.taper);
  // Between the ends: as long as asked, and long enough for 45°.
  const dOut = Math.abs(last(A.outer)[1] - last(B.outer)[1]);
  const dIn = Math.abs(last(A.inner)[1] - last(B.inner)[1]);
  const T = Math.max(p.transition, dOut, dIn, 1);
  const zB = p.aLength + T;
  const H = zB + p.bLength;

  // Outer up, inner down: counter-clockwise in (r, z).
  const outer: [number, number][] = [
    ...A.outer.map(([s, r]): [number, number] => [r, s]),
    ...[...B.outer].reverse().map(([s, r]): [number, number] => [r, H - s]),
  ];
  const inner: [number, number][] = [
    ...B.inner.map(([s, r]): [number, number] => [r, H - s]),
    ...[...A.inner].reverse().map(([s, r]): [number, number] => [r, s]),
  ];
  const pts = [...outer, ...inner];
  const minWall = Math.min(first(A.outer)[1] - first(A.inner)[1], first(B.outer)[1] - first(B.inner)[1]);
  if (minWall < 0.8) {
    notes.push({ level: 'error', message: 'The wall is too thin at an end: make the wall thicker or that end bigger.' });
    return { parts: [], diagnostics: notes, summary: '' };
  }
  const flat: number[] = [];
  for (const [r, z] of pts) flat.push(r, z);
  const m = ctx.Manifold.revolve(ctx.cs([flat]), SEGMENTS[p.detail]);
  const parts: Part[] = [];
  const q = ctx.part(m, 'Adapter', p.color);
  if (q) parts.push(q);
  if (p.aType === 'barb' || p.bType === 'barb') notes.push({ level: 'info', message: 'A hose clip over the barb stops it pulling off under pressure.' });
  if (p.transition > 0 && T > p.transition + 0.01) notes.push({ level: 'info', message: `The middle is ${fmt(T)} mm long so it changes size at 45° or less and prints without supports.` });
  return { parts, diagnostics: notes, summary: `${A.label} → ${B.label} · ${fmt(H)} mm long` };
}
