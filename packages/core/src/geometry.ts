/**
 * The shapes everything downstream agrees on.
 *
 * A generator's whole geometric output is a list of `Part`s (3D) and, for laser and CNC
 * work, a `Drawing` (2D). The viewer, the build plate, the colour slots and every exporter
 * take exactly these and nothing else, which is what lets them be shared.
 *
 * Units are millimetres. 3D is Z up with the bed at Z = 0; 2D is Y up.
 */

/** A colour as 0..255 channels. */
export type RGB = [number, number, number];

/** What a part is for. Reference parts are drawn but never exported. */
export type PartRole = 'print' | 'preview' | 'reference';

export interface Part {
  /** Shown in the viewer and written as the object or volume name in the slicer. */
  name: string;
  /** xyz triples in millimetres. */
  positions: Float32Array;
  /** Three vertex indices per triangle, counter-clockwise seen from outside. */
  indices: Uint32Array;
  /** Filament colour. Parts with the same colour share a filament slot. */
  color: RGB;
  /**
   * Parts that share a group are one object in the slicer (one body, several filaments).
   * Parts in different groups stay separately movable (two halves of a hinge).
   * Defaults to one group for the whole build.
   */
  group?: string;
  role?: PartRole;
}

/** One closed outline: [x0, y0, x1, y1, …], implicitly closed. */
export type Contour = number[];

/** What a laser does along a path. */
export type LaserOperation = 'cut' | 'score' | 'engrave';

export interface DrawingLayer {
  name: string;
  operation: LaserOperation;
  /** Display and export colour (laser software maps colours to settings). */
  color: RGB;
  /** Closed outlines. Engrave layers are filled with the even-odd rule. */
  contours: Contour[];
  /** Open polylines (score lines that do not close). */
  polylines?: Contour[];
}

export interface Drawing {
  /** Sheet size in millimetres, when the design sits on a sheet. */
  width?: number;
  height?: number;
  layers: DrawingLayer[];
}

export type DiagnosticLevel = 'info' | 'warning' | 'error';

export interface Diagnostic {
  level: DiagnosticLevel;
  message: string;
}

/** What one build returns. */
export interface BuildResult {
  parts: Part[];
  drawing?: Drawing;
  /** Shown under the status line; an `error` blocks export. */
  diagnostics?: Diagnostic[];
  /** Free-form figures for the status line ("62 × 30 × 3.8 mm"). */
  summary?: string;
}

export interface Bounds3 {
  min: [number, number, number];
  max: [number, number, number];
}

export function emptyBounds(): Bounds3 {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

export function partBounds(parts: readonly Pick<Part, 'positions'>[], into: Bounds3 = emptyBounds()): Bounds3 {
  for (const p of parts) {
    const v = p.positions;
    for (let i = 0; i < v.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const c = v[i + k]!;
        if (c < into.min[k]!) into.min[k] = c;
        if (c > into.max[k]!) into.max[k] = c;
      }
    }
  }
  return into;
}

export function boundsSize(b: Bounds3): [number, number, number] {
  if (!isFinite(b.min[0])) return [0, 0, 0];
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
}

export function triangleCount(parts: readonly Pick<Part, 'indices'>[]): number {
  return parts.reduce((n, p) => n + p.indices.length / 3, 0);
}

/** Moves parts in place. */
export function translateParts(parts: readonly Part[], dx: number, dy: number, dz: number): void {
  for (const p of parts) {
    const v = p.positions;
    for (let i = 0; i < v.length; i += 3) {
      v[i]! += dx;
      v[i + 1]! += dy;
      v[i + 2]! += dz;
    }
  }
}

/** The parts that get exported. */
export function printable(parts: readonly Part[]): Part[] {
  return parts.filter((p) => (p.role ?? 'print') === 'print');
}

/** "62 × 30 × 3.8 mm" */
export function formatSize(size: readonly number[]): string {
  return `${size.map((n) => fmt(n)).join(' × ')} mm`;
}

function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function sameColor(a: RGB, b: RGB): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
