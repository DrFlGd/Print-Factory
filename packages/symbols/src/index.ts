/**
 * Symbols: small filled pictures to put on a part (a heart on a pen topper, a logo on a
 * keycap). The bundled set is Tabler's filled icons (MIT, ~1,000), loaded on first use as a
 * separate chunk. Users can add their own SVGs, which are kept by content hash so a project
 * that uses one can register it again on load.
 */
import type { Contour } from '@pf/core';
import { bounds, parseSvg, scale, translate } from '@pf/shapes';

export interface SymbolInfo {
  id: string;
  name: string;
  category: string;
  tags: string[];
}

interface Entry extends SymbolInfo {
  /** Inner SVG markup in a 0..viewBox square (bundled) or a whole document (custom). */
  svg: string;
}

export interface SymbolShape {
  contours: Contour[];
  fillRule: 'NonZero' | 'EvenOdd';
}

let bundled: Promise<{ viewBox: number; symbols: Entry[] }> | null = null;
const custom = new Map<string, Entry>();

function load() {
  if (!bundled) bundled = import('../data/tabler-filled.json').then((m) => (m.default ?? m) as { viewBox: number; symbols: Entry[] });
  return bundled;
}

export async function symbolIndex(): Promise<SymbolInfo[]> {
  const { symbols } = await load();
  return [...custom.values(), ...symbols].map(({ id, name, category, tags }) => ({ id, name, category, tags }));
}

/** Input key under which the shell passes a custom symbol's SVG to the build. */
export const symbolInputKey = (id: string) => `symbol:${id}`;

/**
 * A whole SVG document for previews (fill="currentColor"). In a build, pass `ctx.inputs`:
 * custom symbols travel there, since the worker never saw them registered.
 */
export async function symbolSvg(id: string, inputs?: Record<string, unknown>): Promise<string | null> {
  const fromInputs = inputs?.[symbolInputKey(id)];
  if (typeof fromInputs === 'string') return fromInputs;
  const own = custom.get(id);
  if (own) return own.svg;
  const { symbols, viewBox } = await load();
  const s = symbols.find((x) => x.id === id);
  return s ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}" fill="currentColor">${s.svg}</svg>` : null;
}

/**
 * The symbol's outlines in mm, centred on the origin, its longer side `size` long, Y up.
 * Each SVG shape keeps its own fill rule; union them in that rule.
 */
export async function symbolShapes(id: string, size: number, inputs?: Record<string, unknown>): Promise<SymbolShape[]> {
  if (!id) return [];
  const svg = await symbolSvg(id, inputs);
  if (!svg) return [];
  const doc = parseSvg(svg, 0.01);
  const all = doc.shapes.flatMap((s) => s.contours);
  if (!all.length) return [];
  const b = bounds(all);
  const k = size / Math.max(b.maxX - b.minX, b.maxY - b.minY, 1e-9);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return doc.shapes.map((s) => ({ contours: scale(translate(s.contours, -cx, -cy), k), fillRule: s.fillRule === 'evenodd' ? 'EvenOdd' : 'NonZero' }));
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Adds an SVG the user supplied. Returns its id; throws if it has no filled shapes. */
export function registerSymbol(svgText: string, name = 'My symbol'): SymbolInfo {
  const doc = parseSvg(svgText, 0.05);
  if (!doc.shapes.some((s) => s.contours.length)) throw new Error('That SVG has no filled shapes to use. Outlines (strokes) must be converted to paths first.');
  const id = `custom:${hash(svgText)}`;
  const entry: Entry = { id, name, category: 'Yours', tags: [], svg: svgText };
  custom.set(id, entry);
  return entry;
}

export function customSymbolSvg(id: string): string | undefined {
  return custom.get(id)?.svg;
}
