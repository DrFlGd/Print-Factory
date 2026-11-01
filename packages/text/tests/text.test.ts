import { area, bounds, pointInside, signedArea } from '@pf/shapes';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FONT, FONTS, layoutText, loadFont, registerFont, sizeForCapHeight, text } from '../src/index';
import { readFileSync } from 'node:fs';

describe('catalogue', () => {
  it('lists fonts with licences and a default', () => {
    expect(FONTS.length).toBeGreaterThan(40);
    expect(FONTS.find((f) => f.id === DEFAULT_FONT)).toBeTruthy();
    for (const f of FONTS) {
      expect(['OFL-1.1', 'Apache-2.0']).toContain(f.license);
      expect(readFileSync(new URL(`../fonts/${f.licenseFile}`, import.meta.url), 'utf8').length).toBeGreaterThan(1000);
    }
    expect(new Set(FONTS.map((f) => f.id)).size).toBe(FONTS.length);
  });
});

describe('layout', () => {
  it('sizes by cap height', async () => {
    const font = await loadFont(DEFAULT_FONT);
    const l = layoutText(font, 'H', { capHeight: 10 });
    expect(l.bounds.maxY - l.bounds.minY).toBeCloseTo(10, 1);
    expect(l.size).toBeCloseTo(sizeForCapHeight(font, 10));
  });

  it('keeps the counter of an O as a hole, outer counter-clockwise', async () => {
    const font = await loadFont(DEFAULT_FONT);
    const l = layoutText(font, 'O', { capHeight: 10 });
    expect(l.contours.length).toBe(2);
    const [a, b] = l.contours.map(signedArea);
    expect(Math.max(a!, b!)).toBeGreaterThan(0);
    expect(Math.min(a!, b!)).toBeLessThan(0);
    const r = l.bounds;
    expect(pointInside(l.contours, (r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2)).toBe(false);
  });

  it('aligns lines and stacks them downwards', async () => {
    const font = await loadFont('inter');
    const c = layoutText(font, 'AB\nAB', { size: 10, align: 'center' });
    expect(c.lines).toBe(2);
    expect(Math.abs(c.bounds.minX + c.bounds.maxX)).toBeLessThan(1);
    expect(c.bounds.minY).toBeLessThan(-10);
    const left = layoutText(font, 'AB', { size: 10, align: 'left' });
    expect(left.bounds.minX).toBeGreaterThanOrEqual(-0.5);
    const right = layoutText(font, 'AB', { size: 10, align: 'right' });
    expect(right.bounds.maxX).toBeLessThanOrEqual(0.5);
  });

  it('letter spacing widens the line', async () => {
    const font = await loadFont(DEFAULT_FONT);
    const a = layoutText(font, 'ABC', { size: 10 });
    const b = layoutText(font, 'ABC', { size: 10, letterSpacing: 2 });
    expect(b.bounds.maxX - b.bounds.minX).toBeCloseTo(a.bounds.maxX - a.bounds.minX + 4, 1);
  });

  it('falls back for characters the font lacks and reports the rest', async () => {
    const l = await text('bebas-neue', 'Ωж\u{1F600}', { size: 10 });
    expect(l.glyphs.filter((g) => g.contours.length).length).toBe(2);
    expect(l.missing).toEqual(['\u{1F600}']);
  });

  it('empty text is empty', async () => {
    const l = await text(DEFAULT_FONT, '', { size: 10 });
    expect(l.contours).toEqual([]);
    expect(area(l.contours)).toBe(0);
  });

  it('every bundled font loads and draws an outer-first glyph', async () => {
    for (const f of FONTS) {
      const font = await loadFont(f.id);
      const l = layoutText(font, f.category === 'pixel' ? 'A' : 'Ag', { size: 10 });
      expect(l.contours.length, f.id).toBeGreaterThan(0);
      const b = bounds(l.contours);
      expect(b.maxX - b.minX, f.id).toBeGreaterThan(2);
      expect(area(l.contours), f.id).toBeGreaterThan(0);
    }
  });

  it('registers a user font', () => {
    const bytes = readFileSync(new URL('../fonts/anton.ttf', import.meta.url));
    const { id, font } = registerFont(bytes);
    expect(id.startsWith('custom:')).toBe(true);
    expect(layoutText(font, 'X', { size: 5 }).contours.length).toBeGreaterThan(0);
  });
});
