/**
 * Printer beds and laser sheets, and laying parts out on them.
 *
 * Generators place parts wherever is natural for their geometry; `arrange` then lays the
 * separately movable groups out in rows on the chosen bed, and `checkFit` reports parts
 * that will not fit, so every module gives the same "too big for your printer" message.
 */
import type { Bounds3, Diagnostic, Part } from '@pf/core';
import { boundsSize, emptyBounds, formatSize, partBounds, printable, translateParts } from '@pf/core';

export interface Bed {
  id: string;
  name: string;
  /** Usable X × Y in mm. */
  size: [number, number];
  /** Build height in mm (0 for laser sheets). */
  height: number;
  kind: 'printer' | 'laser';
  maker?: string;
}

export const BEDS: readonly Bed[] = [
  { id: 'bambu-a1', name: 'Bambu Lab A1', maker: 'Bambu Lab', size: [256, 256], height: 256, kind: 'printer' },
  { id: 'bambu-a1-mini', name: 'Bambu Lab A1 mini', maker: 'Bambu Lab', size: [180, 180], height: 180, kind: 'printer' },
  { id: 'bambu-p1s', name: 'Bambu Lab P1S / P1P / X1', maker: 'Bambu Lab', size: [256, 256], height: 256, kind: 'printer' },
  { id: 'bambu-h2d', name: 'Bambu Lab H2D (one nozzle)', maker: 'Bambu Lab', size: [325, 320], height: 325, kind: 'printer' },
  { id: 'prusa-mk4', name: 'Prusa MK4 / MK4S', maker: 'Prusa', size: [250, 210], height: 220, kind: 'printer' },
  { id: 'prusa-core-one', name: 'Prusa Core One', maker: 'Prusa', size: [250, 220], height: 270, kind: 'printer' },
  { id: 'prusa-mini', name: 'Prusa MINI+', maker: 'Prusa', size: [180, 180], height: 180, kind: 'printer' },
  { id: 'prusa-xl', name: 'Prusa XL', maker: 'Prusa', size: [360, 360], height: 360, kind: 'printer' },
  { id: 'creality-k1', name: 'Creality K1 / K1C', maker: 'Creality', size: [220, 220], height: 250, kind: 'printer' },
  { id: 'creality-k1-max', name: 'Creality K1 Max', maker: 'Creality', size: [300, 300], height: 300, kind: 'printer' },
  { id: 'ender-3', name: 'Creality Ender-3 (V2, V3, S1)', maker: 'Creality', size: [220, 220], height: 250, kind: 'printer' },
  { id: 'voron-350', name: 'Voron 2.4 350', maker: 'Voron', size: [350, 350], height: 340, kind: 'printer' },
  { id: 'generic-200', name: 'Any 200 × 200 printer', size: [200, 200], height: 200, kind: 'printer' },
  { id: 'sheet-300x200', name: 'Laser sheet 300 × 200', size: [300, 200], height: 0, kind: 'laser' },
  { id: 'sheet-400x400', name: 'Laser sheet 400 × 400', size: [400, 400], height: 0, kind: 'laser' },
  { id: 'sheet-600x400', name: 'Laser sheet 600 × 400', size: [600, 400], height: 0, kind: 'laser' },
  { id: 'sheet-12x12', name: 'Laser sheet 12 × 12 in', size: [304.8, 304.8], height: 0, kind: 'laser' },
  { id: 'sheet-12x20', name: 'Laser sheet 12 × 20 in', size: [304.8, 508], height: 0, kind: 'laser' },
];

export const DEFAULT_BED = 'bambu-a1';

export function bed(id: string | undefined): Bed {
  return BEDS.find((b) => b.id === id) ?? BEDS.find((b) => b.id === DEFAULT_BED)!;
}

export function customBed(w: number, h: number, height = 250, kind: Bed['kind'] = 'printer'): Bed {
  return { id: `custom-${w}x${h}`, name: `Custom ${w} × ${h}`, size: [w, h], height, kind };
}

function groupsOf(parts: readonly Part[]): Part[][] {
  const m = new Map<string, Part[]>();
  for (const p of parts) {
    const k = p.group ?? '';
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(p);
  }
  return [...m.values()];
}

/**
 * Lays printable groups out in rows (tallest first, a shelf packer), centred on the bed,
 * `gap` mm apart, each resting on z = 0. Parts with role preview or reference are moved
 * with the group they share, or left alone. Mutates the parts; returns whether all fit.
 */
export function arrange(parts: Part[], plate: Bed, gap = 5): { fits: boolean; rows: number } {
  const groups = groupsOf(printable(parts)).map((g) => ({ g, b: partBounds(g) }));
  groups.sort((a, b) => boundsSize(b.b)[1] - boundsSize(a.b)[1]);
  const [W, H] = plate.size;
  let x = 0;
  let y = 0;
  let rowH = 0;
  let rows = 1;
  const placed: { g: Part[]; b: Bounds3; x: number; y: number }[] = [];
  for (const it of groups) {
    const [w, h] = boundsSize(it.b);
    if (x > 0 && x + w > W) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
      rows++;
    }
    placed.push({ ...it, x, y });
    x += w + gap;
    rowH = Math.max(rowH, h);
  }
  const total = emptyBounds();
  for (const p of placed) {
    const [w, h] = boundsSize(p.b);
    total.min[0] = Math.min(total.min[0], p.x);
    total.min[1] = Math.min(total.min[1], p.y);
    total.max[0] = Math.max(total.max[0], p.x + w);
    total.max[1] = Math.max(total.max[1], p.y + h);
  }
  const [tw, th] = placed.length ? boundsSize(total) : [0, 0];
  const ox = (W - tw) / 2;
  const oy = (H - th) / 2;
  for (const p of placed) translateParts(p.g, ox + p.x - p.b.min[0], oy + p.y - p.b.min[1], -p.b.min[2]);
  return { fits: tw <= W + 1e-6 && th <= H + 1e-6, rows };
}

/** One diagnostic per separately printed group that is larger than the bed. */
export function checkFit(parts: readonly Part[], plate: Bed): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const g of groupsOf(printable(parts))) {
    const [w, h, d] = boundsSize(partBounds(g));
    const flat = (w <= plate.size[0] && h <= plate.size[1]) || (h <= plate.size[0] && w <= plate.size[1]);
    const tall = plate.height > 0 && d > plate.height;
    if (!flat || tall) {
      const name = g[0]!.group ?? g[0]!.name;
      out.push({
        level: 'warning',
        message: `${name} is ${formatSize([w, h, d]).replace(' mm', '')} mm, larger than the ${plate.name} (${plate.size[0]} × ${plate.size[1]}${plate.height ? ` × ${plate.height}` : ''} mm).`,
      });
    }
  }
  return out;
}
