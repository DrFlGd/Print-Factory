/**
 * QR codes for a printed card: what the code opens, its modules as a region in one of four
 * styles, sized so the smallest module still prints with a 0.4 mm nozzle and scans.
 */
import type { Contour } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { circle, rect, roundedRect } from '@pf/shapes';
import qrcode from 'qrcode-generator';
import type { Ctx, Params } from './types';

/** The smallest module that prints cleanly and scans from a card, mm; a Large code is this much bigger. */
export const MODULE = 0.7;
export const LARGE = 1.3;
/** Dots need room between them, so their modules are never under this. */
const DOT_MODULE = 0.85;
/** Clear modules round the code (the quiet zone). Two is enough on a high-contrast print. */
export const QUIET = 2;

function url(s: string): string {
  const t = s.trim();
  if (!t) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
}

const esc = (s: string) => s.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');

/** What the code carries, or '' when there is nothing to put in it. */
export function payload(p: Params): string {
  if (p.qrKind === 'link') return url(p.qrLink);
  if (p.qrKind === 'website') return url(p.website);
  const parts = p.name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1]! : '';
  const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] ?? '');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(last)};${esc(first)};;;`, `FN:${esc(p.name.trim())}`];
  if (p.company.trim()) lines.push(`ORG:${esc(p.company.trim())}`);
  if (p.title.trim()) lines.push(`TITLE:${esc(p.title.trim())}`);
  if (p.phone.trim()) lines.push(`TEL;TYPE=CELL:${p.phone.trim()}`);
  if (p.email.trim()) lines.push(`EMAIL:${p.email.trim()}`);
  if (p.website.trim()) lines.push(`URL:${url(p.website)}`);
  lines.push('END:VCARD');
  return p.name.trim() || p.phone.trim() || p.email.trim() ? lines.join('\n') : '';
}

export interface Matrix {
  n: number;
  dark: (r: number, c: number) => boolean;
}

export function matrix(data: string, withLogo: boolean): Matrix {
  const qr = qrcode(0, withLogo ? 'H' : 'M');
  qr.addData(String.fromCharCode(...new TextEncoder().encode(data)), 'Byte');
  qr.make();
  return { n: qr.getModuleCount(), dark: (r, c) => qr.isDark(r, c) };
}

/** The module size for a style and size, mm. */
export function moduleSize(p: Params): number {
  const m = p.qrStyle === 'dots' ? DOT_MODULE : MODULE;
  return p.qrSize === 'large' ? m * LARGE : m;
}

/** The side of the code's square with its quiet zone, mm, at module `m`. */
export const squareOf = (n: number, m: number) => (n + 2 * QUIET) * m;

/** Whether (r, c) is inside one of the three finder patterns (7 × 7 in the corners). */
const inFinder = (n: number, r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

/** The modules left clear in the middle for a logo: an odd number across, about a fifth of the code. */
export function logoHole(n: number): number {
  let k = Math.round(n * 0.22);
  if (k % 2 === 0) k++;
  return Math.max(5, k);
}

/**
 * The code's dark modules as one region, centred on the origin, `m` mm a module. With `hole`
 * set, that many modules in the middle are left clear (for a logo, on a high-recovery code).
 */
export function qrRegion(ctx: Ctx, q: Matrix, m: number, style: Params['qrStyle'], hole = 0): CrossSection {
  const { n } = q;
  const half = (n * m) / 2;
  const h0 = Math.floor((n - hole) / 2);
  const clear = (r: number, c: number) => hole > 0 && r >= h0 && r < h0 + hole && c >= h0 && c < h0 + hole;
  const at = (r: number, c: number): [number, number] => [-half + (c + 0.5) * m, half - (r + 0.5) * m];
  const squares: Contour[] = [];
  const dots: Contour[] = [];
  const e = 1e-3;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!q.dark(r, c) || clear(r, c)) continue;
      const finder = inFinder(n, r, c);
      if ((style === 'finder' || style === 'dots') && finder) continue;
      const [x, y] = at(r, c);
      if (style === 'dots') {
        const d = circle(m * 0.46, 20);
        for (let i = 0; i < d.length; i += 2) {
          d[i]! += x;
          d[i + 1]! += y;
        }
        dots.push(d);
      } else squares.push([x - m / 2 - e, y - m / 2 - e, x + m / 2 + e, y - m / 2 - e, x + m / 2 + e, y + m / 2 + e, x - m / 2 - e, y + m / 2 + e]);
    }
  let out = squares.length ? ctx.cs(squares, 'NonZero') : ctx.CrossSection.union([]);
  if (style === 'rounded' && !out.isEmpty()) {
    // Every outside corner rounded; joined modules stay joined.
    const k = m * 0.32;
    out = out.offset(-k, 'Round', 2, 24).offset(k, 'Round', 2, 24).add(out.offset(-m * 0.49, 'Miter', 2, 0));
  }
  if (dots.length) out = out.add(ctx.cs(dots, 'NonZero'));
  if (style === 'finder' || style === 'dots') {
    // The finders as round-cornered rings with a round-cornered eye.
    const eye = (r0: number, c0: number) => {
      const cx = -half + (c0 + 3.5) * m;
      const cy = half - (r0 + 3.5) * m;
      const ring = ctx.cs([roundedRect(7 * m, 7 * m, 2.2 * m)]).subtract(ctx.cs([roundedRect(5 * m, 5 * m, 1.4 * m)]));
      const pupil = ctx.cs([roundedRect(3 * m, 3 * m, 0.9 * m)]);
      return ring.add(pupil).translate([cx, cy]);
    };
    out = out.add(eye(0, 0)).add(eye(0, n - 7)).add(eye(n - 7, 0));
  }
  return out;
}

/** The light tile behind a code printed light on dark: the code's square, its quiet zone included. */
export function tile(ctx: Ctx, side: number): CrossSection {
  return ctx.cs([roundedRect(side, side, Math.min(1.5, side * 0.06))]);
}

/** A plain square, for the tests and placeholders. */
export const square = (ctx: Ctx, side: number) => ctx.cs([rect(side, side)]);
