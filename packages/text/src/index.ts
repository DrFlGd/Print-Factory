/**
 * Text to outlines.
 *
 * Every generator that puts words on a part goes through here, so a name tag, a house
 * number and a keychain all agree on what "8 mm Montserrat Bold" looks like. Output is
 * contours in millimetres, Y up, outer contours counter-clockwise, ready for
 * `ctx.extrude()` or a laser layer.
 *
 * The bundled fonts are listed in catalog.json (written by tools/fetch-fonts.mjs). Each is
 * OFL-1.1 or Apache-2.0 and ships with its licence in fonts/licenses/.
 */
import type { Contour } from '@pf/core';
import { bounds, flattenCubic, flattenQuad, reverse, signedArea, weld } from '@pf/shapes';
import type { Rect2 } from '@pf/shapes';
import opentype from 'opentype.js';
import catalogJson from './catalog.json';

export type Font = opentype.Font;

export interface FontInfo {
  id: string;
  family: string;
  label: string;
  weight: number;
  category: string;
  /** Bold and simple enough to print small as raised or cut-out letters. */
  sign: boolean;
  scripts: string[];
  file: string;
  license: string;
  licenseFile: string;
  source: string;
}

export const FONTS: readonly FontInfo[] = catalogJson as FontInfo[];
export const DEFAULT_FONT = 'montserrat-700';
/** Used for characters the chosen font lacks (accents, Cyrillic, Greek). */
export const FALLBACK_FONT = 'noto-sans';

export const FONT_CATEGORIES = [...new Set(FONTS.map((f) => f.category))];

export function fontInfo(id: string): FontInfo | undefined {
  return FONTS.find((f) => f.id === id) ?? custom.get(id)?.info;
}

/** Bundled font files as URLs, resolved by Vite at build time. */
const urls = import.meta.glob('../fonts/*.ttf', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export function fontUrl(id: string): string | undefined {
  const info = FONTS.find((f) => f.id === id);
  return info ? urls[`../fonts/${info.file}`] : undefined;
}

const cache = new Map<string, Promise<Font>>();
const custom = new Map<string, { info: FontInfo; font: Font; bytes: Uint8Array }>();

type NodeFs = { readFileSync(p: URL): Uint8Array };

function nodeFs(): NodeFs | null {
  const proc = (globalThis as { process?: { getBuiltinModule?: (m: string) => unknown; versions?: { node?: string } } }).process;
  if (!proc?.versions?.node || typeof proc.getBuiltinModule !== 'function') return null;
  if (typeof (globalThis as { document?: unknown }).document !== 'undefined') return null;
  return proc.getBuiltinModule('node:fs') as NodeFs;
}

async function fetchBytes(info: FontInfo): Promise<ArrayBuffer> {
  const fs = nodeFs();
  if (fs) {
    const bytes = fs.readFileSync(new URL(`../fonts/${info.file}`, import.meta.url));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  const url = urls[`../fonts/${info.file}`];
  if (!url) throw new Error(`Font file missing from the build: ${info.file}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the font ${info.label} (${res.status}).`);
  return res.arrayBuffer();
}

/** Input key under which the shell passes a custom font's bytes to the build. */
export const fontInputKey = (id: string) => `font:${id}`;

/** A registered custom font as base64, for passing to a worker and saving in projects. */
export function customFontData(id: string): string | undefined {
  const b = custom.get(id)?.bytes;
  if (!b) return undefined;
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Loads a bundled or registered font by id. Unknown ids fall back to the default font. In a
 * build, pass `ctx.inputs`: custom fonts travel there, since the worker never saw them.
 */
export function loadFont(id: string = DEFAULT_FONT, inputs?: Record<string, unknown>): Promise<Font> {
  const fromInputs = inputs?.[fontInputKey(id)];
  if (typeof fromInputs === 'string' && !custom.has(id)) {
    try {
      registerFont(fromBase64(fromInputs), undefined, id);
    } catch {
      /* a damaged font falls back to the default below */
    }
  }
  const own = custom.get(id);
  if (own) return Promise.resolve(own.font);
  const info = FONTS.find((f) => f.id === id) ?? FONTS.find((f) => f.id === DEFAULT_FONT)!;
  let p = cache.get(info.id);
  if (!p) {
    p = fetchBytes(info).then((buf) => opentype.parse(buf));
    p.catch(() => cache.delete(info.id));
    cache.set(info.id, p);
  }
  return p;
}

/**
 * Registers a font the user supplied (a .ttf, .otf or .woff file). Returns its id, which
 * can be stored in parameters like any bundled font id. Custom fonts live only in memory:
 * a project that uses one keeps the bytes in its inputs and registers them again on load.
 */
export function registerFont(bytes: ArrayBuffer | Uint8Array, name?: string, knownId?: string): { id: string; info: FontInfo; font: Font } {
  const buf = bytes instanceof Uint8Array ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer) : bytes;
  const font = opentype.parse(buf);
  const family = name || font.names.fontFamily?.en || 'Custom font';
  const id = knownId ?? `custom:${hash(new Uint8Array(buf))}`;
  const info: FontInfo = { id, family, label: family, weight: 400, category: 'custom', sign: false, scripts: [], file: '', license: 'user-supplied', licenseFile: '', source: '' };
  custom.set(id, { info, font, bytes: new Uint8Array(buf) });
  return { id, info, font };
}

function hash(b: Uint8Array): string {
  let h = 2166136261;
  for (let i = 0; i < b.length; i += Math.max(1, b.length >> 12)) h = Math.imul(h ^ b[i]!, 16777619);
  return (h >>> 0).toString(36) + b.length.toString(36);
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextOptions {
  /** Em size in mm (roughly the distance from descender to ascender). */
  size?: number;
  /** Alternative to `size`: the height of a capital H in mm, which is what people measure. */
  capHeight?: number;
  /** Extra space between letters in mm (negative tightens). */
  letterSpacing?: number;
  /** Line pitch as a multiple of the em size. Default 1.2. */
  lineHeight?: number;
  align?: TextAlign;
  kerning?: boolean;
  /** Chord tolerance for curves in mm. Default 0.02. */
  tolerance?: number;
  /** Fonts tried, in order, for characters the main font lacks. */
  fallback?: Font[];
}

export interface TextGlyph {
  char: string;
  line: number;
  /** Outline of this glyph in mm, already placed. */
  contours: Contour[];
  /** Pen position (left of the advance box) and advance in mm. */
  x: number;
  advance: number;
}

export interface TextLayout {
  contours: Contour[];
  glyphs: TextGlyph[];
  /** Ink bounds; empty text gives a zero rectangle at the origin. */
  bounds: Rect2;
  /** Scale from font units to mm for the main font. */
  scale: number;
  /** The mm size actually used. */
  size: number;
  lines: number;
  /** Characters no font could draw. */
  missing: string[];
}

/** Cap height in font units: OS/2 sCapHeight when present, else the height of "H". */
export function capHeightUnits(font: Font): number {
  const os2 = font.tables.os2 as { sCapHeight?: number } | undefined;
  if (os2?.sCapHeight) return os2.sCapHeight;
  const bb = font.charToGlyph('H').getBoundingBox();
  return bb.y2 - bb.y1 || font.unitsPerEm * 0.7;
}

/** The em size in mm that gives the requested cap height in this font. */
export function sizeForCapHeight(font: Font, capHeight: number): number {
  return (capHeight * font.unitsPerEm) / capHeightUnits(font);
}

interface Run {
  font: Font;
  text: string;
}

function runs(text: string, font: Font, fallback: Font[], missing: Set<string>): Run[] {
  const out: Run[] = [];
  for (const ch of text) {
    let f = font;
    if (ch.trim() && font.charToGlyphIndex(ch) === 0) {
      const alt = fallback.find((x) => x.charToGlyphIndex(ch) !== 0);
      if (alt) f = alt;
      else missing.add(ch);
    }
    const last = out[out.length - 1];
    if (last && last.font === f) last.text += ch;
    else out.push({ font: f, text: ch });
  }
  return out;
}

/** A glyph's outline in font units, Y up, closed contours. */
function glyphContours(glyph: opentype.Glyph, tolUnits: number): Contour[] {
  const out: Contour[] = [];
  let cur: number[] = [];
  let x = 0;
  let y = 0;
  const close = () => {
    if (cur.length >= 6) out.push(weld(cur));
    cur = [];
  };
  for (const c of glyph.path.commands) {
    switch (c.type) {
      case 'M':
        close();
        cur.push(c.x, c.y);
        x = c.x;
        y = c.y;
        break;
      case 'L':
        cur.push(c.x, c.y);
        x = c.x;
        y = c.y;
        break;
      case 'Q':
        flattenQuad(cur, x, y, c.x1, c.y1, c.x, c.y, tolUnits);
        x = c.x;
        y = c.y;
        break;
      case 'C':
        flattenCubic(cur, x, y, c.x1, c.y1, c.x2, c.y2, c.x, c.y, tolUnits);
        x = c.x;
        y = c.y;
        break;
      case 'Z':
        close();
        break;
    }
  }
  close();
  // TrueType draws outer contours clockwise and CFF counter-clockwise. Flip the glyph as a
  // whole so its largest contour (always an outer one) runs counter-clockwise.
  let big = 0;
  for (const c of out) if (Math.abs(signedArea(c)) > Math.abs(big)) big = signedArea(c);
  return big < 0 ? out.map(reverse) : out;
}

/**
 * Lays out text (newlines start new lines) and returns its outlines. The first baseline is
 * at y = 0; `align` places lines relative to x = 0 (left starts there, center straddles it,
 * right ends there).
 */
export function layoutText(font: Font, text: string, opts: TextOptions = {}): TextLayout {
  const size = opts.capHeight != null ? sizeForCapHeight(font, opts.capHeight) : (opts.size ?? 10);
  const tol = opts.tolerance ?? 0.02;
  const lineHeight = opts.lineHeight ?? 1.2;
  const spacing = opts.letterSpacing ?? 0;
  const kerning = opts.kerning ?? true;
  const align = opts.align ?? 'center';
  const missing = new Set<string>();
  const glyphs: TextGlyph[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  lines.forEach((line, li) => {
    const lineGlyphs: TextGlyph[] = [];
    let pen = 0;
    for (const run of runs(line, font, opts.fallback ?? [], missing)) {
      const f = run.font;
      const k = size / f.unitsPerEm;
      const gs = f.stringToGlyphs(run.text);
      const chars = [...run.text];
      gs.forEach((g, gi) => {
        const drawn = g.index === 0 ? [] : glyphContours(g, tol / k);
        const contours = drawn.map((c) => {
          const o = new Array<number>(c.length);
          for (let i = 0; i < c.length; i += 2) {
            o[i] = c[i]! * k + pen;
            o[i + 1] = c[i + 1]! * k - li * size * lineHeight;
          }
          return o;
        });
        // A glyph no font has is left out (no .notdef box), but keeps its space.
        const advance = (g.advanceWidth ?? 0) * k;
        lineGlyphs.push({ char: chars[gi] ?? '', line: li, contours, x: pen, advance });
        pen += advance + spacing;
        const next = gs[gi + 1];
        if (kerning && next) pen += f.getKerningValue(g, next) * k;
      });
    }
    const width = Math.max(0, pen - (lineGlyphs.length ? spacing : 0));
    const shift = align === 'left' ? 0 : align === 'right' ? -width : -width / 2;
    if (shift)
      for (const g of lineGlyphs) {
        g.x += shift;
        for (const c of g.contours) for (let i = 0; i < c.length; i += 2) c[i]! += shift;
      }
    glyphs.push(...lineGlyphs);
  });

  const contours = glyphs.flatMap((g) => g.contours);
  const b = contours.length ? bounds(contours) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { contours, glyphs, bounds: b, scale: size / font.unitsPerEm, size, lines: lines.length, missing: [...missing] };
}

/** Shorthand for the outlines alone. */
export function textToContours(font: Font, text: string, opts: TextOptions = {}): Contour[] {
  return layoutText(font, text, opts).contours;
}

/** Loads the font and its fallback, then lays out: the usual call from a build. */
export async function text(fontId: string, value: string, opts: Omit<TextOptions, 'fallback'> = {}, inputs?: Record<string, unknown>): Promise<TextLayout> {
  const [font, fallback] = await Promise.all([loadFont(fontId, inputs), loadFont(FALLBACK_FONT)]);
  return layoutText(font, value, { ...opts, fallback: font === fallback ? [] : [fallback] });
}
