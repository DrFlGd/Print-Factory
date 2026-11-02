/**
 * The prints a frame or holder takes, and the magnets it can hang on. A stock paper size is
 * made for its larger variant (4 × 6 in is 101.6 × 152.4, 10 × 15 cm is 100 × 150), so either
 * print fits.
 */
import type { Params, PhotoId } from './types';

/** An instant print's picture inside its white border, mm, standing as it comes. */
export interface Film {
  iw: number;
  ih: number;
  side: number;
  top: number;
  bottom: number;
}

export interface PhotoSize {
  id: PhotoId;
  name: string;
  /** As it comes: width across, height up, mm. */
  size: [number, number] | null;
  film: Film | null;
}

export const PHOTOS: PhotoSize[] = [
  { id: 'mini', name: 'Instant mini', size: [54, 86], film: { iw: 46, ih: 62, side: 4, top: 7, bottom: 17 } },
  { id: 'isq', name: 'Instant square', size: [72, 86], film: { iw: 62, ih: 62, side: 5, top: 7, bottom: 17 } },
  { id: 'iwide', name: 'Instant wide', size: [108, 86], film: { iw: 99, ih: 62, side: 4.5, top: 7, bottom: 17 } },
  { id: '2x3', name: '2 × 3 in', size: [50.8, 76.2], film: null },
  { id: '3.5x5', name: '3.5 × 5 in', size: [90, 130], film: null },
  { id: '4x6', name: '4 × 6 in', size: [101.6, 152.4], film: null },
  { id: 'a6', name: 'A6', size: [105, 148], film: null },
  { id: '5x7', name: '5 × 7 in', size: [130, 180], film: null },
  { id: 'a5', name: 'A5', size: [148, 210], film: null },
  { id: 'custom', name: 'Custom', size: null, film: null },
];

export const photoById = (id: string) => PHOTOS.find((p) => p.id === id) ?? PHOTOS[0]!;

/** The print as it stands: width, height, and where the picture is on film (offsets from the print's left and bottom). */
export interface Print {
  pw: number;
  ph: number;
  name: string;
  film: { x0: number; y0: number; iw: number; ih: number } | null;
}

export function printOf(p: Params): Print {
  const s = photoById(p.photo);
  if (!s.size) return { pw: Math.max(30, p.customWidth), ph: Math.max(30, p.customHeight), name: 'custom print', film: null };
  const [a, b] = s.size;
  const natural = a > b ? 'landscape' : 'portrait';
  const turned = !s.film && p.orientation !== natural;
  if (s.film) {
    const f = s.film;
    return { pw: a, ph: b, name: `${s.name} print`, film: { x0: f.side, y0: f.bottom, iw: f.iw, ih: f.ih } };
  }
  return turned ? { pw: b, ph: a, name: `${s.name} print`, film: null } : { pw: a, ph: b, name: `${s.name} print`, film: null };
}

export interface Magnet {
  id: string;
  d: number;
  h: number;
  /** What one holds on a fridge door before it slides, g (about 15 % of its rated pull). */
  holds: number;
}

/** Round N35 neodymium discs, across × thick, and their usual pull in kg. */
const M: [number, number, number][] = [
  [6, 2, 0.75],
  [6, 3, 1.0],
  [8, 2, 1.15],
  [8, 3, 1.6],
  [10, 2, 1.6],
  [10, 3, 2.3],
  [12, 2, 2.1],
  [12, 3, 3.0],
  [15, 3, 4.3],
  [20, 3, 6.4],
];
export const MAGNETS: Magnet[] = M.map(([d, h, kg]) => ({ id: `${d}x${h}`, d, h, holds: Math.round(150 * kg) }));
export const magnetById = (id: string) => MAGNETS.find((m) => m.id === id) ?? MAGNETS.find((m) => m.id === '10x3')!;

/** Magnets hold a frame up to a 4 × 6 in or A6 print; a key ring one whose long side is at most 90 mm. */
export const MAGNET_CAP: [number, number] = [105, 152.4];
export const KEYCHAIN_LONG = 90;
