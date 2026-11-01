/**
 * Keychains and charms: a charm for a zip pull, your own SVG as a keychain, letter tiles,
 * the matching pairs (two tags that share a heart, two bars that share a cut heart, two bars
 * that lock with hearts), a month calendar with its date marked, a now-playing screen, a bar
 * that stands your phone up, and the split monogram.
 */
import type { Contour, Diagnostic } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { circle, clipPolylines, heart, poleOf, rect, rotate, roundedRect, translate } from '@pf/shapes';
import type { DesignOut, P, PieceOut } from './kit';
import { centred, disc, fitInside, leftAt, lines, union, marginWarning, marksFor, one, tagBlank, writable } from './kit';
import type { Ctx, Lettering, Marks } from './lib';
import { bridge, fit, hug, lettering, noMarks, qrRegion, region, ring, symbolRegion } from './lib';

const at = (cs: Contour[], x: number, y: number) => translate(cs, x, y);
const markOp = (p: P) => (p.op === 'cut' ? 'engrave' : p.op);

/* ---------------------------------------------------------------- bag charm */

async function bagCharm(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const r = ring(ctx, tagBlank(ctx, p), p.ring, p.ringSide, p.holeDiameter, p.ringWall);
  const area = writable(ctx, r.body, r.hole, p.margin);
  let content: Lettering | null = null;
  if (p.charmStyle === 'symbol') {
    const s = await symbolRegion(ctx, p.symbol, Math.max(p.tagWidth, p.tagHeight));
    content = s ? region(ctx, s) : null;
  } else if (p.charmStyle === 'initial') {
    // One letter drawn to the frame: typed large, then fitted down to fill it.
    const first = [...p.text.trim()][0] ?? '';
    content = await lettering(ctx, p.font, first, Math.max(p.tagWidth, p.tagHeight));
  } else content = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  if (!content) return { pieces: [one('Charm', r.body)], notes };
  const placed = fitInside(ctx, content, area, p.charmStyle === 'name' ? 0.86 : 0.92);
  return { pieces: [one('Charm', r.body, marksFor(ctx, placed.cs, markOp(p)))], notes };
}

/* ---------------------------------------------------------------- SVG keychain */

async function svgKeychain(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const art = await symbolRegion(ctx, p.symbol, p.symbolSize);
  if (!art) return (marginWarning(notes, 'artwork (choose a symbol or use your own SVG)'), { pieces: [], notes });
  // The artwork and an optional name under it, as one block.
  const ab = region(ctx, art).b;
  let block = art.translate([-ab.cx, -ab.cy]);
  const name = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  if (name) block = block.add(centred(name, 0, -ab.height / 2 - p.size * 0.6 - name.b.height / 2));
  if (p.mount === 'outline') {
    const r = ring(ctx, hug(ctx, block, p.margin, p.smooth), p.ring, p.ringSide, p.holeDiameter, p.ringWall);
    return { pieces: [one('Keychain', r.body, marksFor(ctx, block, markOp(p)))], notes };
  }
  const r = ring(ctx, tagBlank(ctx, p), p.ring, p.ringSide, p.holeDiameter, p.ringWall);
  const placed = fitInside(ctx, region(ctx, block), writable(ctx, r.body, r.hole, p.margin), 0.9);
  if (placed.b.height < region(ctx, block).b.height * 0.98) notes.push({ level: 'info', message: 'The artwork was made smaller to fit the shape.' });
  return { pieces: [one('Keychain', r.body, marksFor(ctx, placed.cs, markOp(p)))], notes };
}

/* ---------------------------------------------------------------- letter tiles */

/** Letter values in the usual English word-game scoring. */
const LETTER_VALUES: Record<string, number> = { A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10 };

/** A row of letter tiles, welded edge to edge, the seams scored. */
export async function tileRow(ctx: Ctx, p: P, word: string, s: number): Promise<{ body: CrossSection; marks: Marks; count: number }> {
  const letters = [...word.toUpperCase()].filter((c) => c.trim());
  const marks: Marks = noMarks();
  const tiles: CrossSection[] = [];
  const ink: CrossSection[] = [];
  const x0 = -((letters.length - 1) * s) / 2;
  for (let i = 0; i < letters.length; i++) {
    const x = x0 + i * s;
    tiles.push(ctx.cs(at([roundedRect(s + 0.02, s, s * 0.12)], x, 0)));
    const l = await lettering(ctx, p.font, letters[i]!, s * 0.55);
    if (l) ink.push(centred(fit(ctx, l, s * 0.7, s * 0.6), x, s * 0.04));
    const v = LETTER_VALUES[letters[i]!];
    if (p.tileValues && v) {
      const n = await lettering(ctx, p.font, String(v), s * 0.17);
      if (n) ink.push(n.cs.translate([x + s / 2 - s * 0.1 - n.b.maxX, -s / 2 + s * 0.1 - n.b.minY]));
    }
    if (i > 0) marks.score.push([x - s / 2, -s / 2 + s * 0.12, x - s / 2, s / 2 - s * 0.12]);
  }
  const body = ctx.CrossSection.union(tiles);
  const engr = union(ctx, ink);
  const m = marksFor(ctx, engr, markOp(p));
  marks.engrave = m.engrave;
  marks.score.push(...m.score);
  return { body, marks, count: letters.length };
}

async function tileKeychain(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const word = p.text.split(/\s+/)[0] ?? '';
  if (!word) return (marginWarning(notes, 'a word'), { pieces: [], notes });
  if (word.length > 10) notes.push({ level: 'warning', message: 'More than ten tiles makes a long keychain. Try a shorter word.' });
  const t = await tileRow(ctx, p, word.slice(0, 12), p.tileSize);
  const r = ring(ctx, t.body, p.ring, p.ringSide, p.holeDiameter, p.ringWall);
  return { pieces: [one('Tiles', r.body, t.marks)], notes };
}

/* ---------------------------------------------------------------- pairs */

const PAIR_GAP = 4;

/** Two initials (or names) from the text, one per line. */
function pairOf(text: string, fallback: [string, string]): [string, string] {
  const ls = lines(text);
  return [ls[0] ?? fallback[0], ls[1] ?? ls[0] ?? fallback[1]];
}

async function coupleKeychains(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const [a, b] = pairOf(p.text, ['A', 'B']);
  const W = p.tagWidth;
  const H = p.tagHeight;
  const g = PAIR_GAP / 2;
  // One heart on the seam, upper half of the pair; each tag keeps the half on its side as a notch.
  const hs = Math.min(p.heartSize, W * 1.4, H * 0.6);
  const hy = H / 2 - hs * 0.62;
  const theHeart = ctx.cs(at([heart(hs)], 0, hy));
  const pieces: PieceOut[] = [];
  for (const side of [-1, 1] as const) {
    const cx = side * (g + W / 2);
    const tag0 = ctx.cs(at([roundedRect(W, H, Math.min(6, W / 5))], cx, 0));
    const r = ring(ctx, tag0, p.ring, side < 0 ? 'left' : 'right', p.holeDiameter, p.ringWall);
    const body = r.body.subtract(theHeart);
    const ink: CrossSection[] = [];
    const initial = await lettering(ctx, p.font, side < 0 ? a : b, p.size);
    if (initial) {
      // Between the tag's outer end (less the hole, when there is one) and the notch.
      const outer = g + W - p.margin - (p.ring === 'hole' ? p.holeDiameter + 2 * p.ringWall : 0);
      const inner = g + hs / 2 + 1;
      const f = fit(ctx, initial, Math.max(4, (outer - inner) * 0.85), hs * 0.9);
      ink.push(centred(f, (side * (outer + inner)) / 2, hy));
    }
    const date = await lettering(ctx, p.font2, p.text2, p.size2);
    if (date) ink.push(centred(fit(ctx, date, W - 2 * p.margin, H * 0.25), cx, -H / 2 + p.margin + Math.min(date.b.height, H * 0.25) / 2));
    const marks = marksFor(ctx, union(ctx, ink), markOp(p));
    pieces.push({ ...one(side < 0 ? 'Left tag' : 'Right tag', body, marks) });
  }
  notes.push({ level: 'info', message: 'Hold the two tags side by side and the notches make one heart.' });
  return { pieces, notes };
}

async function heartCutoutKeychains(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const [a, b] = pairOf(p.text, ['A', 'B']);
  const W = p.tagWidth;
  const H = p.tagHeight;
  const g = PAIR_GAP / 2;
  // The heart lies on its side across the seam, point to the right, near the right end.
  const hs = Math.min(p.heartSize, H * 1.6);
  const hx = W / 2 - p.margin - hs * 0.45 - Math.max(p.size, hs * 0.3) * 1.2;
  const lying = ctx.cs(rotate([heart(hs)], -90)).translate([hx, 0]);
  const pieces: PieceOut[] = [];
  for (const side of [1, -1] as const) {
    const cy = side * (g + H / 2);
    const bar0 = ctx.cs(at([roundedRect(W, H, Math.min(5, H / 3))], 0, cy));
    const r = ring(ctx, bar0, p.ring, 'left', p.holeDiameter, p.ringWall);
    const body = r.body.subtract(lying);
    const ink: CrossSection[] = [];
    // The initial at the right end, a small symbol above it.
    const col = W / 2 - p.margin - p.size * 0.6;
    const initial = await lettering(ctx, p.font, side > 0 ? a : b, p.size);
    if (initial) ink.push(centred(fit(ctx, initial, p.size * 1.4, H * 0.5), col, cy - H * 0.14));
    const mark = await symbolRegion(ctx, p.symbol, Math.min(H * 0.28, p.size * 0.7));
    if (mark) ink.push(centred(region(ctx, mark), col, cy + H * 0.27));
    // The date along the bar, between the ring and the heart.
    const date = await lettering(ctx, p.font2, p.text2, p.size2);
    if (date) {
      const left = -W / 2 + p.margin + (p.ring === 'none' ? 0 : p.holeDiameter + 2 * p.ringWall);
      const right = hx - hs * 0.5 - 1.5;
      const f = fit(ctx, date, Math.max(4, right - left), H * 0.45);
      ink.push(centred(f, (left + right) / 2, cy + side * -H * 0.05));
    }
    pieces.push(one(side > 0 ? 'Top bar' : 'Bottom bar', body, marksFor(ctx, union(ctx, ink), markOp(p))));
  }
  return { pieces, notes };
}

async function heartPuzzleKeychains(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const [a, b] = pairOf(p.text, ['Alex', 'Sam']);
  const W = p.tagWidth;
  const H = p.tagHeight;
  const hs = Math.min(p.heartSize, H * 1.1);
  const fitGap = Math.max(0.1, p.kerf / 2 + 0.08);
  // The two bars meet on y = 0. The left heart stands on the bottom bar and locks into the
  // top one by its lobes; the right heart hangs from the top bar and keys into the bottom one
  // by its point.
  const x1 = W / 2 - p.margin - hs * 1.6;
  const x2 = W / 2 - p.margin - hs * 0.5;
  const upLine = at([heart(hs)], x1, hs * 0.3)[0]!;
  const downLine = at(rotate([heart(hs)], 180), x2, -hs * 0.3)[0]!;
  const up = ctx.cs([upLine]);
  const down = ctx.cs([downLine]);
  const neck1 = ctx.cs(at([rect(hs * 0.35, hs * 0.4)], x1, 0));
  const neck2 = ctx.cs(at([rect(hs * 0.35, hs * 0.4)], x2, 0));
  const top0 = ctx.cs(at([roundedRect(W, H, Math.min(5, H / 3))], 0, H / 2));
  const bottom0 = ctx.cs(at([roundedRect(W, H, Math.min(5, H / 3))], 0, -H / 2));
  const knobUp = up.add(neck1).intersect(top0);
  const knobDown = down.add(neck2).intersect(bottom0);
  let top = top0.subtract(knobUp.offset(fitGap, 'Round', 2, 32)).add(knobDown);
  let bottom = bottom0.subtract(knobDown.offset(fitGap, 'Round', 2, 32)).add(knobUp);
  top = ring(ctx, top, p.ring, 'left', p.holeDiameter, p.ringWall).body;
  bottom = ring(ctx, bottom, p.ring, 'left', p.holeDiameter, p.ringWall).body;
  const pieces: PieceOut[] = [];
  // Each bar shows the whole of the heart it holds: the curve on its own face is scored.
  const closed = (c: Contour) => [...c, c[0]!, c[1]!];
  for (const [name, body, text, cy, own, bar0] of [
    ['Top bar', top, a, H / 2, downLine, top0],
    ['Bottom bar', bottom, b, -H / 2, upLine, bottom0],
  ] as const) {
    const ink: CrossSection[] = [];
    const l = await lettering(ctx, p.font, text, p.size, { spacing: p.spacing });
    if (l) {
      const left = -W / 2 + p.margin + (p.ring === 'none' ? 0 : p.holeDiameter + 2 * p.ringWall);
      const right = x1 - hs * 0.6;
      ink.push(centred(fit(ctx, l, Math.max(4, right - left), H * 0.6), (left + right) / 2, cy));
    }
    const marks = marksFor(ctx, union(ctx, ink), markOp(p));
    marks.score.push(...clipPolylines([closed(own)], ctx.contours(bar0.offset(-0.05))));
    pieces.push(one(name, body, marks));
  }
  notes.push({ level: 'info', message: 'The bars are cut apart and press together at the hearts. Set the kerf so they hold without forcing.' });
  return { pieces, notes };
}

/* ---------------------------------------------------------------- date calendar */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function parseDate(s: string): { y: number; m: number; d: number } | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
  if (!iso) return null;
  const y = Number(iso[1]);
  const m = Number(iso[2]) - 1;
  const d = Number(iso[3]);
  if (m < 0 || m > 11 || d < 1 || d > new Date(Date.UTC(y, m + 1, 0)).getUTCDate()) return null;
  return { y, m, d };
}

/** Rows of a month: each a week of day numbers (0 for a blank cell). */
export function monthGrid(y: number, m: number, weekStart: 'sun' | 'mon'): number[][] {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const lead = weekStart === 'mon' ? (first + 6) % 7 : first;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells = [...Array<number>(lead).fill(0), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(0);
  return Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
}

async function dateKeychain(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const date = parseDate(p.calDate);
  if (!date) return { pieces: [], notes: [{ level: 'error', message: 'Type the date as year-month-day, for example 2025-06-14.' }] };
  const W = p.tagWidth;
  const m = Math.max(2.5, W * 0.07);
  const cell = (W - 2 * m) / 7;
  const grid = monthGrid(date.y, date.m, p.weekStart === 'mon' ? 'mon' : 'sun');
  const head = cell * 0.62;
  const digit = cell * 0.42;
  // A hole for the ring goes above the title, in room of its own.
  const holeRoom = p.ring === 'hole' ? p.holeDiameter + p.ringWall : 0;
  const H = m + holeRoom + head * 1.6 + cell * 0.8 + grid.length * cell + m * 0.6;
  const top = H / 2 - holeRoom;
  const ink: CrossSection[] = [];
  const title = await lettering(ctx, p.font, `${MONTHS[date.m]} ${date.y}`, head);
  if (title) ink.push(centred(fit(ctx, title, W - 2 * m, head * 1.3), 0, top - m - head * 0.6));
  const names = p.weekStart === 'mon' ? 'MTWTFSS' : 'SMTWTFS';
  const rowY = (r: number) => top - m - head * 1.6 - cell * 0.8 - (r + 0.5) * cell;
  const colX = (c: number) => -W / 2 + m + (c + 0.5) * cell;
  for (let c = 0; c < 7; c++) {
    const l = await lettering(ctx, p.font2, names[c]!, digit * 0.85);
    if (l) ink.push(centred(l, colX(c), top - m - head * 1.6 - cell * 0.4));
  }
  let marked: CrossSection | null = null;
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < 7; c++) {
      const d = grid[r]![c]!;
      if (!d) continue;
      const l = await lettering(ctx, p.font2, String(d), digit);
      if (!l) continue;
      const n = centred(l, colX(c), rowY(r));
      if (d === date.d) {
        // The day in a heart, the number left bare inside it.
        const h = ctx.cs(at([heart(cell * 1.05)], colX(c), rowY(r) + cell * 0.04));
        marked = h.subtract(n.offset(0.25, 'Round', 2, 16));
      } else ink.push(n);
    }
  const tag0 = ctx.cs([roundedRect(W, H, Math.min(4, W / 10))]);
  const r = ring(ctx, tag0, p.ring, 'top', p.holeDiameter, p.ringWall);
  const marks = marksFor(ctx, union(ctx, [...ink, marked]), markOp(p));
  const pieces: PieceOut[] = [one('Calendar', r.body, marks)];
  // A heart charm with the initials, beside the tag.
  const initials = lines(p.text).join(' ').trim();
  if (initials) {
    const cs = p.charmSize;
    // The hole goes in the left lobe, the initials below the lobes.
    let charm = ctx.cs([heart(cs)]);
    const lobe = poleOf(ctx.contours(charm.intersect(ctx.cs([rect(cs / 2, cs / 2)]).translate([-cs / 4, cs / 4]))), 0.1);
    const hd = Math.min(p.holeDiameter, lobe.radius * 2 - 2.4);
    const hole = ctx.cs([circle(hd / 2, 48)]).translate([lobe.x, lobe.y]);
    charm = charm.subtract(hole);
    const l = await lettering(ctx, p.font, initials, cs * 0.3);
    const area = writable(ctx, charm, hole, 1.5).intersect(ctx.cs([rect(cs * 2, cs)]).translate([0, lobe.y - hd / 2 - 1 - cs / 2]));
    const cm = l ? marksFor(ctx, fitInside(ctx, l, area, 0.85).cs, markOp(p)) : noMarks();
    const cr = { body: charm };
    pieces.push({ ...one('Charm', cr.body, cm), at: [W / 2 + cs / 2 + 6, H / 2 - cs / 2, 0] });
  }
  return { pieces, notes };
}

/* ---------------------------------------------------------------- song */

/** A play control drawn from triangles and bars, `s` mm tall, centred at (x, y). */
function control(ctx: Ctx, kind: 'prev' | 'play' | 'next' | 'shuffle' | 'repeat', s: number, x: number, y: number, w: number): CrossSection {
  const tri = (x0: number, dir: 1 | -1, h: number): Contour => (dir > 0 ? [x0, -h / 2, x0 + h * 0.85, 0, x0, h / 2] : [x0, -h / 2, x0, h / 2, x0 - h * 0.85, 0]);
  let out: Contour[] = [];
  switch (kind) {
    case 'play':
      // A disc with the triangle cut out of it.
      return ctx.cs(translate([circle(s / 2, 48)], x, y)).subtract(ctx.cs(translate([tri(-s * 0.16, 1, s * 0.42)], x, y)));
    case 'next':
      out = [tri(-s * 0.32, 1, s * 0.5), rect(w, s * 0.5).map((v, i) => (i % 2 ? v : v + s * 0.18))];
      break;
    case 'prev':
      out = [tri(s * 0.32, -1, s * 0.5), rect(w, s * 0.5).map((v, i) => (i % 2 ? v : v - s * 0.18))];
      break;
    case 'shuffle': {
      const t = w;
      out = [
        [-s * 0.4, -s * 0.2 - t / 2, s * 0.2, s * 0.2 - t / 2, s * 0.2, s * 0.2 + t / 2, -s * 0.4, -s * 0.2 + t / 2],
        [-s * 0.4, s * 0.2 - t / 2, s * 0.2, -s * 0.2 - t / 2, s * 0.2, -s * 0.2 + t / 2, -s * 0.4, s * 0.2 + t / 2],
        tri(s * 0.18, 1, s * 0.22).map((v, i) => (i % 2 ? v + s * 0.2 : v)),
        tri(s * 0.18, 1, s * 0.22).map((v, i) => (i % 2 ? v - s * 0.2 : v)),
      ];
      break;
    }
    case 'repeat': {
      const t = w;
      out = [
        [-s * 0.4, s * 0.15 - t / 2, s * 0.25, s * 0.15 - t / 2, s * 0.25, s * 0.15 + t / 2, -s * 0.4, s * 0.15 + t / 2],
        [-s * 0.25, -s * 0.15 - t / 2, s * 0.4, -s * 0.15 - t / 2, s * 0.4, -s * 0.15 + t / 2, -s * 0.25, -s * 0.15 + t / 2],
        tri(s * 0.22, 1, s * 0.22).map((v, i) => (i % 2 ? v + s * 0.15 : v)),
        tri(-s * 0.22, -1, s * 0.22).map((v, i) => (i % 2 ? v - s * 0.15 : v)),
      ];
      break;
    }
  }
  return ctx.cs(translate(out, x, y), 'NonZero');
}

function seconds(s: string): number {
  const m = /^(\d+):(\d{1,2})$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;

async function songKeychain(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const W = p.tagWidth;
  const m = Math.max(2.5, W * 0.08);
  const inner = W - 2 * m;
  const stroke = Math.max(0.4, W * 0.012);
  const ink: CrossSection[] = [];
  let y = 0;
  const hole = p.ring === 'none' ? 0 : p.holeDiameter + 2 * p.ringWall;
  y -= m + hole;
  // Title and the heart beside it, then the artist.
  const cap = Math.max(3, W * 0.075);
  const title = await lettering(ctx, p.font, p.text || 'Song', cap, { align: 'left' });
  if (title) {
    const f = fit(ctx, title, inner - cap * 1.4, cap * 1.6);
    ink.push(f.cs.translate([-W / 2 + m - f.b.minX, y - f.b.maxY]));
    ink.push(ctx.cs(at([heart(cap * 1.05)], W / 2 - m - cap * 0.55, y - cap * 0.5)));
    y -= Math.max(f.b.height, cap) + cap * 0.55;
  }
  const artist = await lettering(ctx, p.font2, p.text2, cap * 0.8, { align: 'left' });
  if (artist) {
    const f = fit(ctx, artist, inner, cap * 1.2);
    ink.push(f.cs.translate([-W / 2 + m - f.b.minX, y - f.b.maxY]));
    y -= f.b.height + cap * 0.8;
  }
  // The progress bar: a thin line, the played part thicker, a knob where it stands.
  const frac = Math.max(0, Math.min(1, p.progress / 100));
  const bx = -W / 2 + m + inner * frac;
  ink.push(ctx.cs(at([rect(inner, stroke)], 0, y)));
  ink.push(ctx.cs(at([rect(inner * frac, stroke * 2.2)], -W / 2 + m + (inner * frac) / 2, y)));
  ink.push(ctx.cs(at([circle(stroke * 2.4, 32)], bx, y)));
  y -= stroke * 3 + cap * 0.3;
  const total = seconds(p.songLength);
  const tsz = Math.max(2.2, cap * 0.7);
  if (total > 0) {
    const el = await lettering(ctx, p.font2, clock(total * frac), tsz);
    const re = await lettering(ctx, p.font2, `-${clock(total * (1 - frac))}`, tsz);
    if (el) ink.push(el.cs.translate([-W / 2 + m - el.b.minX, y - el.b.maxY]));
    if (re) ink.push(re.cs.translate([W / 2 - m - re.b.maxX, y - re.b.maxY]));
    y -= tsz + cap * 0.9;
  }
  // The five controls.
  const cs = Math.min(inner / 5.5, cap * 2.6);
  const cy = y - cs / 2;
  const kinds = ['shuffle', 'prev', 'play', 'next', 'repeat'] as const;
  kinds.forEach((k, i) => ink.push(control(ctx, k, k === 'play' ? cs : cs * 0.62, -inner / 2 + (inner / 5) * (i + 0.5), cy, stroke * 1.4)));
  y -= cs + cap * 0.9;
  // The code: a QR of the link, a bare area for a sticker, or nothing.
  if (p.codeMode === 'qr') {
    const q = qrRegion(ctx, p.qrData, inner * 0.82, p.ecc);
    if (q) {
      const side = inner * 0.82;
      ink.push(q.cs.translate([0, y - side / 2]));
      const cell = side / q.modules;
      if (cell < 0.8) notes.push({ level: 'warning', message: `Each square of the code is ${cell.toFixed(2)} mm: too small to scan reliably. Make the plate wider.` });
      y -= side + m;
    } else notes.push({ level: 'warning', message: 'Type the song link for the code.' });
  } else if (p.codeMode === 'blank') {
    const h = inner / 4;
    y -= h / 2;
    const area = ctx.cs(at([roundedRect(inner, h, 2)], 0, y));
    ink.push(area.subtract(area.offset(-stroke, 'Round', 2, 16)));
    y -= h / 2 + m;
    notes.push({ level: 'info', message: 'The bare panel takes a sticker or your music app’s own code.' });
  } else y -= m * 0.4;
  const H = -y;
  const plate = ctx.cs(at([roundedRect(W, H, Math.min(5, W / 8))], 0, -H / 2));
  const r = ring(ctx, plate, p.ring, 'top', p.holeDiameter, p.ringWall);
  // With a hole, keep it in the space left for it at the top.
  return { pieces: [one('Plate', r.body, marksFor(ctx, union(ctx, ink), markOp(p)))], notes };
}

/* ---------------------------------------------------------------- pocket phone stand */

async function keychainPhoneStand(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const L = p.tagWidth;
  const H = p.tagHeight;
  const sw = p.slotWidth + Math.max(0, p.kerf);
  const sd = Math.min(p.slotDepth, H - 4);
  // The slot rises from the bottom edge, a front leg's length in from the left end.
  const sx = -L / 2 + p.legLength + sw / 2;
  let body = ctx.cs([roundedRect(L, H, Math.min(4, H / 4))]).subtract(ctx.cs(at([roundedRect(sw, sd * 2, Math.min(sw / 2, 1.5))], sx, -H / 2)));
  const r = ring(ctx, body, p.ring, 'right', p.holeDiameter, p.ringWall);
  body = r.body;
  const left = sx + sw / 2 + p.margin;
  const right = L / 2 - p.margin - (r.hole ? p.holeDiameter + p.ringWall * 2 : 0);
  const l = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  const marks = l ? marksFor(ctx, centred(fit(ctx, l, Math.max(4, right - left), H - 2 * p.margin - 2), (left + right) / 2, 1), markOp(p)) : noMarks();
  if (p.legLength < 6) notes.push({ level: 'warning', message: 'A front leg under 6 mm may snap. Make it longer.' });
  notes.push({ level: 'info', message: 'Stand the bar on its long edge and drop the phone into the slot, screen leaning back.' });
  // Shown standing on its edge, as it is used.
  return { pieces: [{ ...one('Stand', body, marks), pose: { rx: 90 } }], notes };
}

/* ---------------------------------------------------------------- split monogram */

/** A laurel: leaves along two arcs from the bottom, open at the top. */
function laurel(ctx: Ctx, R: number, leaf: number, pairs: number, open: number): CrossSection {
  const out: Contour[] = [];
  const span = 180 - open / 2;
  const rib = Math.max(1.2, leaf * 0.16);
  for (const side of [-1, 1]) {
    // The rib: an arc of short bars.
    const steps = 48;
    for (let i = 0; i < steps; i++) {
      const a0 = (-90 + (side * span * i) / steps) * (Math.PI / 180);
      const a1 = (-90 + (side * span * (i + 1)) / steps) * (Math.PI / 180);
      const p0 = [R * Math.cos(a0), R * Math.sin(a0)];
      const p1 = [R * Math.cos(a1), R * Math.sin(a1)];
      const dx = p1[0]! - p0[0]!;
      const dy = p1[1]! - p0[1]!;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * (rib / 2);
      const ny = (dx / len) * (rib / 2);
      out.push([p0[0]! + nx, p0[1]! + ny, p0[0]! - nx, p0[1]! - ny, p1[0]! - nx + dx * 0.05, p1[1]! - ny + dy * 0.05, p1[0]! + nx + dx * 0.05, p1[1]! + ny + dy * 0.05]);
    }
    for (let k = 0; k < pairs; k++) {
      const t = (k + 0.7) / (pairs + 0.4);
      const a = -90 + side * span * t;
      const len = leaf * (0.5 + 0.5 * (1 - t));
      for (const out2 of [1, -1]) {
        // A leaf: a pointed ellipse, splayed out from the rib.
        const pts: number[] = [];
        for (let i = 0; i <= 16; i++) {
          const u = (i / 16) * Math.PI;
          pts.push(len * (0.5 - 0.5 * Math.cos(u)), len * 0.22 * Math.sin(u));
        }
        for (let i = 15; i > 0; i--) {
          const u = (i / 16) * Math.PI;
          pts.push(len * (0.5 - 0.5 * Math.cos(u)), -len * 0.22 * Math.sin(u));
        }
        // Along the rib towards the top, splayed 35° out or in.
        const dir = a + side * (out2 > 0 ? 55 : 125);
        const base = [R * Math.cos((a * Math.PI) / 180), R * Math.sin((a * Math.PI) / 180)] as const;
        out.push(translate(rotate([pts], dir), base[0], base[1])[0]!);
      }
    }
  }
  return ctx.cs(out, 'NonZero');
}

async function splitMonogram(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const S = p.diameter;
  const initial = await lettering(ctx, p.font2, [...p.monogram.trim()][0] ?? 'M', S * 0.62);
  if (!initial) return (marginWarning(notes, 'an initial'), { pieces: [], notes });
  const letter = fit(ctx, initial, S * 0.72, S * 0.72);
  const L = centred(letter, 0, 0).offset(Math.max(0, p.weight), 'Round', 2, 24);
  const lb = region(ctx, L).b;
  const name = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  const nameH = name ? Math.min(name.b.height, lb.height * 0.32) : lb.height * 0.12;
  const band = nameH * 1.5;
  const rule = Math.max(1.2, p.thickness * 0.5);
  const reach = p.frame === 'none' || p.frame === 'disc' || p.frame === 'scallop' ? lb.width * 1.1 : S;
  // The letter with a band taken out of its middle, rules above and below the band, the name
  // along it: welded into one piece.
  const piece = L.subtract(ctx.cs([rect(reach * 2, band)]));
  const rules = ctx.cs([...at([rect(reach, rule)], 0, band / 2 - rule / 2), ...at([rect(reach, rule)], 0, -band / 2 + rule / 2)], 'NonZero');
  let nameCs: CrossSection | null = null;
  if (name) {
    const f = fit(ctx, name, reach * 0.95, nameH);
    nameCs = centred(f, 0, 0).offset(Math.max(0.3, p.weight * 0.6), 'Round', 2, 24);
  }
  const R = S / 2;
  const marks: Marks = noMarks();
  let body: CrossSection;
  if (p.frame === 'disc' || p.frame === 'scallop') {
    // A solid plate, the monogram engraved on it.
    body = disc(ctx, p, p.frame === 'scallop');
    marks.engrave = union(ctx, [piece, rules.intersect(ctx.cs([rect(lb.width * 1.1, S)])), nameCs]);
  } else {
    const parts: (CrossSection | null)[] = [piece, nameCs];
    if (p.frame === 'ring') {
      const w = Math.max(2.5, p.border);
      parts.push(ctx.cs([circle(R, 128)]).subtract(ctx.cs([circle(R - w, 128)])), rules.intersect(ctx.cs([circle(R - w / 2, 128)])));
    } else if (p.frame === 'laurel') {
      parts.push(laurel(ctx, R * 0.9, R * 0.32, 7, 60), rules.intersect(ctx.cs([circle(R * 0.9, 128)])));
    } else parts.push(rules.intersect(ctx.cs([rect(lb.width + rule * 2, S)])));
    body = bridge(ctx, union(ctx, parts)!, Math.max(1.5, p.thickness));
    if (body.decompose().length > 1) notes.push({ level: 'warning', message: 'Part of the monogram stands apart. Make the letters bolder or the rules wider.' });
  }
  const r = ring(ctx, body, p.ring, 'top', p.holeDiameter, p.ringWall);
  return { pieces: [one('Monogram', r.body, marks)], notes };
}

export const KEYCHAIN_DESIGNS: Record<string, (ctx: Ctx, p: P) => Promise<DesignOut>> = {
  'bag-charm': bagCharm,
  'svg-keychain': svgKeychain,
  'tile-keychain': tileKeychain,
  'couple-keychains': coupleKeychains,
  'heart-cutout-keychains': heartCutoutKeychains,
  'heart-puzzle-keychains': heartPuzzleKeychains,
  'date-keychain': dateKeychain,
  'song-keychain': songKeychain,
  'keychain-phone-stand': keychainPhoneStand,
  'split-monogram': splitMonogram,
};
