/**
 * Rectangles onto sheets: maximal-rectangles packing with the best-short-side-fit rule,
 * opening another sheet when one is full.
 */
export interface PackItem {
  id: string;
  w: number;
  h: number;
  /** May be turned a quarter turn. */
  rotate?: boolean;
}

export interface Placement {
  id: string;
  sheet: number;
  /** Lower-left corner of the item, on its sheet (inside the margin). */
  x: number;
  y: number;
  rotated: boolean;
}

interface Free {
  x: number;
  y: number;
  w: number;
  h: number;
}

function split(free: Free[], used: Free): Free[] {
  const out: Free[] = [];
  for (const f of free) {
    if (used.x >= f.x + f.w || used.x + used.w <= f.x || used.y >= f.y + f.h || used.y + used.h <= f.y) {
      out.push(f);
      continue;
    }
    if (used.x > f.x) out.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
    if (used.x + used.w < f.x + f.w) out.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - used.x - used.w, h: f.h });
    if (used.y > f.y) out.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
    if (used.y + used.h < f.y + f.h) out.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - used.y - used.h });
  }
  // Drop rectangles inside others.
  return out.filter((a, i) => !out.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
}

/**
 * Packs `items` on sheets `width × height`, `margin` from the sheet's edge and `gap` apart.
 * Items that cannot fit on an empty sheet come back in `unplaced`.
 */
export function packRects(items: PackItem[], width: number, height: number, gap = 2, margin = 0): { placements: Placement[]; sheets: number; unplaced: string[] } {
  const W = width - 2 * margin + gap;
  const H = height - 2 * margin + gap;
  const fits = (w: number, h: number) => w + gap <= W + 1e-9 && h + gap <= H + 1e-9;
  const order = [...items].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);
  const sheets: Free[][] = [];
  const placements: Placement[] = [];
  const unplaced: string[] = [];
  for (const it of order) {
    const turns = it.rotate ? [false, true] : [false];
    if (!turns.some((r) => (r ? fits(it.h, it.w) : fits(it.w, it.h)))) {
      unplaced.push(it.id);
      continue;
    }
    let best: { s: number; f: Free; r: boolean; score: number } | null = null;
    for (let s = 0; s < sheets.length && !best; s++)
      for (const f of sheets[s]!)
        for (const r of turns) {
          const w = (r ? it.h : it.w) + gap;
          const h = (r ? it.w : it.h) + gap;
          if (w > f.w + 1e-9 || h > f.h + 1e-9) continue;
          const score = Math.min(f.w - w, f.h - h) + 1e-3 * (f.y + f.x * 1e-3);
          if (!best || score < best.score) best = { s, f, r, score };
        }
    if (!best) {
      sheets.push([{ x: 0, y: 0, w: W, h: H }]);
      const s = sheets.length - 1;
      const r = !fits(it.w, it.h);
      best = { s, f: sheets[s]![0]!, r, score: 0 };
    }
    const w = (best.r ? it.h : it.w) + gap;
    const h = (best.r ? it.w : it.h) + gap;
    const used = { x: best.f.x, y: best.f.y, w, h };
    sheets[best.s] = split(sheets[best.s]!, used);
    placements.push({ id: it.id, sheet: best.s, x: margin + used.x, y: margin + used.y, rotated: best.r });
  }
  return { placements, sheets: sheets.length, unplaced };
}
