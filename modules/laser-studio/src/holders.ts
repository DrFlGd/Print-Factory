/**
 * Things that hold things, and games: the phone stand (two identical planks that cross at a
 * right angle, the phone leaning in the V), the name puzzle (letters lifted out of a board on a
 * backer), tic-tac-toe (a base, a grid glued on it, five X and five O), the bracelet set and its
 * display card (with words or a symbol on the bars), the hair-tie holder and the hair-tie card,
 * and the tie holder (a necktie-shaped board on a hook).
 */
import type { Contour, Diagnostic } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { circle, rect, rotate, roundedRect, translate } from '@pf/shapes';
import type { DesignOut, P, PieceOut } from './kit';
import { centred, lines, marginWarning, marksFor, one } from './kit';
import type { Ctx, Lettering, Marks } from './lib';
import { bridge, fit, lettering, noMarks, outlineOf, patternIn, region, solid, symbolRegion } from './lib';

const D = Math.PI / 180;
const markOp = (p: P) => (p.op === 'cut' ? 'engrave' : p.op);
const at = (cs: Contour[], x: number, y: number) => translate(cs, x, y);

/** A dashed line from (x0, y) to (x1, y): a perforation scored on card. */
function dashes(x0: number, x1: number, y: number, dash: number, gap: number): Contour[] {
  const out: Contour[] = [];
  for (let x = x0; x < x1; x += dash + gap) out.push([x, y, Math.min(x + dash, x1), y]);
  return out;
}

/** A closed contour cut into dashes `dash` long with `gap` between, walked along its length. */
function dashed(c: Contour, dash: number, gap: number): Contour[] {
  const out: Contour[] = [];
  const n = c.length / 2;
  let on = true;
  let left = dash;
  let cur: number[] = [c[0]!, c[1]!];
  for (let i = 0; i < n; i++) {
    let [x0, y0] = [c[2 * i]!, c[2 * i + 1]!];
    const [x1, y1] = [c[(2 * i + 2) % c.length]!, c[(2 * i + 3) % c.length]!];
    let seg = Math.hypot(x1 - x0, y1 - y0);
    while (seg > 1e-9) {
      const step = Math.min(seg, left);
      const k = step / seg;
      [x0, y0] = [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
      seg -= step;
      left -= step;
      if (on) cur.push(x0, y0);
      if (left <= 1e-9) {
        if (on && cur.length >= 4) out.push(cur);
        on = !on;
        left = on ? dash : gap;
        cur = [x0, y0];
      }
    }
  }
  if (on && cur.length >= 4) out.push(cur);
  return out;
}

/* ---------------------------------------------------------------- phone stand */

/**
 * Two identical planks `W` wide and `L` long, each with a slot from one side edge to the middle,
 * cross at a right angle. The back one leans at `angle` from the table and the phone leans on
 * it; the front one is the same plank turned over, its short end the lip the phone stands on.
 * A laser cuts square ends, so each foot stands on its lower edge: the slot sits where both
 * planks' lower edges reach the table.
 */
async function phoneStand(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const W = p.standWidth;
  const L = p.standHeight;
  const t = Math.max(1, p.thickness);
  const th = Math.max(50, Math.min(80, 90 - p.lean)) * D;
  const [s, c] = [Math.sin(th), Math.cos(th)];
  // The slot's place along the plank, from the back plank's foot (and the front plank's lip end),
  // and the height of the crossing's mid-planes.
  const d = (L * c + (t / 2) * (s - c)) / (s + c);
  const zc = d * s + (t / 2) * c;
  const clear = 0.15;
  const plank = ctx.cs([roundedRect(W, L, Math.min(6, W / 8))]).translate([0, L / 2]);
  const slot = ctx.cs([rect(W / 2 + 1, t + 2 * clear)]).translate([W / 4 + 0.5, d]);
  const back = plank.subtract(slot);
  // The front plank is the same one turned over: its slot comes from the other edge.
  const front = back.mirror([1, 0]);
  // The name on the lip, the front plank's short end, below the crossing in the drawing, clear of
  // the phone's bottom edge (about 12 mm next to the crossing).
  const m = Math.max(4, p.margin);
  const lipY1 = d - t / 2 - 12;
  let marks: Marks = noMarks();
  const name = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  if (name && lipY1 - m > 4) marks = marksFor(ctx, centred(fit(ctx, name, W - 2 * m, lipY1 - m), 0, (m + lipY1) / 2), markOp(p));
  if (d - t / 2 < 20) notes.push({ level: 'warning', message: 'The lip is short for a phone. Make the planks longer or lean the phone less.' });
  // In 3D the back plank runs up along (cos, sin) from its foot; the front one runs from its lip
  // end along (sin, −cos) down to its foot, its engraved face up. Both mid-planes cross at (0, zc).
  const tb = [-(d * c) + (t / 2) * s, zc - d * s - (t / 2) * c];
  const tf = [-(d * s) - (t / 2) * c, zc + d * c - (t / 2) * s];
  notes.push({ level: 'info', message: 'Slot the two planks into each other: the one with the name is the front, its name up.' });
  return {
    pieces: [
      { ...one('Back plank', back), at: [0, tb[0]!, 0], pose: { rx: th / D, z: tb[1]! } },
      { ...one('Front plank', front, marks), at: [0, tf[0]!, 0], pose: { rx: th / D - 90, z: tf[1]! } },
    ],
    notes,
  };
}

/* ---------------------------------------------------------------- name puzzle */

async function namePuzzle(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const word = p.text.trim().split(/\s+/)[0] ?? '';
  if (!word) return (marginWarning(notes, 'a name'), { pieces: [], notes });
  const clear = Math.max(0.1, p.clearance);
  const glyphs: Lettering[] = [];
  for (const ch of [...word]) {
    const l = await lettering(ctx, p.font, ch, p.size);
    if (l) glyphs.push(l);
  }
  // Letters side by side, a gap between, each made solid enough to lift: thickened by the boldness.
  const gap = Math.max(6, p.size * 0.12);
  let x = 0;
  const placed: CrossSection[] = [];
  for (const g of glyphs) {
    const cs = g.cs.translate([x - g.b.minX, -g.b.cy]).offset(Math.max(0, p.weight), 'Round', 2, 24);
    placed.push(bridge(ctx, cs, 2));
    x += g.b.width + gap;
  }
  const total = x - gap;
  const pieces0 = placed.map((q) => q.translate([-total / 2, 0]));
  const all = ctx.CrossSection.union(pieces0);
  const ab = all.bounds();
  const m = Math.max(10, p.margin * 3);
  const W = ab.max[0] - ab.min[0] + 2 * m;
  const H = ab.max[1] - ab.min[1] + 2 * m + 8;
  const board0 = ctx.cs([roundedRect(W, H, Math.min(12, H / 5))]).translate([0, (ab.max[1] + ab.min[1]) / 2 + 4]);
  let board = board0;
  const loose: CrossSection[] = [];
  for (const q of pieces0) {
    // The pocket: the letter opened by the clearance, a fingertip notch over its top edge.
    const qb = q.bounds();
    const top = q.intersect(ctx.cs([rect(qb.max[0] - qb.min[0], 3)]).translate([(qb.min[0] + qb.max[0]) / 2, qb.max[1] - 1.5]));
    const tx = top.isEmpty() ? (qb.min[0] + qb.max[0]) / 2 : (top.bounds().min[0] + top.bounds().max[0]) / 2;
    const notch = ctx.cs([circle(6, 48)]).translate([tx, qb.max[1] + 6 - 1 - clear]);
    const pocket = solid(ctx, q).offset(clear, 'Round', 2, 24).add(notch);
    board = board.subtract(pocket);
    // A letter's middle stays as a loose island of the board, glued to the backer.
    const middles = solid(ctx, q).subtract(q).offset(-clear, 'Round', 2, 24);
    if (!middles.isEmpty()) loose.push(middles);
  }
  if (loose.length) {
    board = board.add(ctx.CrossSection.union(loose));
    notes.push({ level: 'info', message: 'Glue the middles of the letters (an A’s, an O’s) to the backer where they fall, then the board round them.' });
  }
  const pieces: PieceOut[] = [
    { ...one('Backer', board0), sheet: 0 },
    { ...one('Board', board), at: [0, 0, 1], sheet: 0 },
    ...pieces0.map((q, i) => ({ ...one(`Letter ${[...word][i] ?? i + 1}`, q), at: [0, 0, 1] as [number, number, number], sheet: 1 as const })),
  ];
  if (p.size < 30) notes.push({ level: 'info', message: 'Letters under 30 mm are small for little fingers.' });
  return { pieces, notes };
}

/* ---------------------------------------------------------------- tic-tac-toe */

async function ticTacToe(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const S = p.boardSize;
  const rim = Math.max(4, S * 0.06);
  const div = Math.max(3, S * 0.035);
  const cell = (S - 2 * rim - 2 * div) / 3;
  const base = ctx.cs([roundedRect(S, S, Math.max(3, S * 0.05))]);
  const centre = (i: number) => -S / 2 + rim + cell / 2 + i * (cell + div);
  const windows = ctx.cs(
    [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => translate([roundedRect(cell, cell, Math.max(1.5, cell * 0.08))], centre(i), centre(j))[0]!)),
    'NonZero',
  );
  const grid = base.subtract(windows);
  const baseMarks = noMarks();
  baseMarks.score.push(...outlineOf(ctx, windows.offset(-0.6, 'Round', 2, 16)));
  const s = cell * 0.76;
  const bar = Math.max(3, s * 0.2);
  const xPiece = ctx.cs([...rotate([roundedRect(s * 1.05, bar, bar / 2)], 45), ...rotate([roundedRect(s * 1.05, bar, bar / 2)], -45)], 'NonZero').intersect(ctx.cs([circle(s * 0.56, 64)]));
  const oPiece = ctx.cs([circle(s / 2, 96)]).subtract(ctx.cs([circle(s / 2 - Math.max(3, s * 0.17), 96)]));
  // A game under way: three X and two O on the board, the rest beside it.
  const inPlay: [string, number, number][] = [
    ['X', 0, 2],
    ['O', 1, 1],
    ['X', 2, 0],
    ['O', 0, 0],
    ['X', 2, 2],
  ];
  const pieces: PieceOut[] = [
    { ...one('Base', base, baseMarks), sheet: 0 },
    { ...one('Grid', grid), at: [0, 0, 1], sheet: 0 },
  ];
  let xs = 0;
  let os = 0;
  for (const [k, i, j] of inPlay) {
    pieces.push({ ...one(k, k === 'X' ? xPiece : oPiece), at: [centre(i), centre(j), 1], sheet: 1 });
    if (k === 'X') xs++;
    else os++;
  }
  for (let n = 0; n < 5 - xs; n++) pieces.push({ ...one('X', xPiece), at: [S / 2 + s * 0.7 + n * (s + 4), S / 2 - s / 2, 0], sheet: 1 });
  for (let n = 0; n < 5 - os; n++) pieces.push({ ...one('O', oPiece), at: [S / 2 + s * 0.7 + n * (s + 4), S / 2 - s * 1.6 - 4, 0], sheet: 1 });
  notes.push({ level: 'info', message: 'Glue the grid on the base inside the scored squares. Five X and five O.' });
  return { pieces, notes };
}

/* ---------------------------------------------------------------- bracelets and card */

function braceletSet(withSymbol: boolean) {
  return async (ctx: Ctx, p: P): Promise<DesignOut> => {
    const notes: Diagnostic[] = [];
    const words = lines(p.text).slice(0, 6);
    const n = Math.max(1, words.length);
    const bl = p.tagWidth;
    const bh = p.tagHeight;
    const hd = Math.max(1, Math.min(p.holeDiameter, bh - 3));
    const pieces: PieceOut[] = [];
    // The card: a row per bracelet, a caption over each bar, the cord through notches in its edges.
    const rowH = Math.max(24, bh * 2.8);
    const cw = bl + 36;
    const capH = Math.max(22, (p.size2 || 4) * 4);
    const ch = n * rowH + capH + 18;
    const top = ch / 2;
    let card = ctx.cs([roundedRect(cw, ch, 4)]);
    // A hang slot at the top for a display hook.
    card = card.subtract(ctx.cs([roundedRect(14, 4.5, 2.25)]).translate([0, top - 7]));
    const cardMarks = noMarks();
    const rowY = (i: number) => top - 14 - (i + 0.5) * rowH;
    const sym = withSymbol ? await symbolRegion(ctx, p.symbol, bh * 0.8) : null;
    for (let i = 0; i < n; i++) {
      const y = rowY(i) - rowH * 0.12;
      for (const side of [-1, 1]) card = card.subtract(ctx.cs([[side * (cw / 2 + 0.01), y + 1.6, side * (cw / 2 - 6), y + 0.6, side * (cw / 2 - 6), y - 0.6, side * (cw / 2 + 0.01), y - 1.6]]));
      // The bar.
      let barCs = ctx.cs([roundedRect(bl, bh, bh / 2)]);
      for (const sx of [-1, 1]) barCs = barCs.subtract(ctx.cs([circle(hd / 2, 32)]).translate([sx * (bl / 2 - bh / 2), 0]));
      const room = bl - 2 * bh - 2;
      let ink: CrossSection | null = null;
      if (sym) ink = centred(fit(ctx, region(ctx, sym), room, bh * 0.7), 0, 0);
      else if (words[i]) {
        const l = await lettering(ctx, p.font, words[i]!, p.size, { spacing: p.spacing });
        if (l) ink = centred(fit(ctx, l, room, bh * 0.66), 0, 0);
      }
      pieces.push({ ...one(`Bracelet ${i + 1}`, barCs, marksFor(ctx, ink, markOp(p))), at: [0, y, 1], sheet: 0 });
      // The cord's path across the card, and the caption over it.
      cardMarks.score.push([-cw / 2 + 6, y, -bl / 2, y], [bl / 2, y, cw / 2 - 6, y]);
      const cap = words[i] ? await lettering(ctx, p.font2, words[i]!, Math.max(2.5, (p.size2 || 4) * 0.9)) : null;
      if (cap) cardMarks.score.push(...outlineOf(ctx, centred(fit(ctx, cap, cw - 20, rowH * 0.22), 0, y + bh / 2 + rowH * 0.2)));
      // The tear-off line under the row.
      if (i < n - 1) cardMarks.score.push(...dashes(-cw / 2 + 2, cw / 2 - 2, rowY(i) - rowH / 2, 3, 2));
    }
    cardMarks.score.push(...dashes(-cw / 2 + 2, cw / 2 - 2, rowY(n - 1) - rowH / 2, 3, 2));
    const caption = await lettering(ctx, p.font2, p.text2, p.size2 || 4, { align: 'center' });
    if (caption) cardMarks.score.push(...outlineOf(ctx, centred(fit(ctx, caption, cw - 16, capH - 6), 0, -top + capH / 2 + 2)));
    notes.push({ level: 'info', message: 'The card is scored, never engraved: cut it from card stock at low power.' });
    if (!words.length && !withSymbol) marginWarning(notes, 'a word for each bracelet, one per line');
    return { pieces: [{ ...one('Card', card, cardMarks), sheet: 1 }, ...pieces], notes };
  };
}

/* ---------------------------------------------------------------- hair ties */

async function hairTieHolder(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const W = Math.max(50, p.tagWidth);
  const H = Math.max(40, p.tagHeight);
  const web = 4;
  const sw = Math.min(W * 0.56, W - 2 * (web + 8 + 2));
  const sh = Math.min(12, H * 0.2);
  const sy = H * 0.12;
  let card = ctx.cs([roundedRect(W, H, Math.min(8, H / 6))]);
  card = card.subtract(ctx.cs([roundedRect(sw, sh, sh / 2)]).translate([0, sy]));
  // A notch in each side edge, for a tie stretched round the card.
  for (const s of [-1, 1]) card = card.subtract(ctx.cs([roundedRect(16, 6, 3)]).translate([s * W / 2, 0]));
  const hd = Math.max(3, p.holeDiameter);
  const hole = ctx.cs([circle(hd / 2, 48)]).translate([0, H / 2 - 3 - hd / 2]);
  card = card.subtract(hole);
  const marks = noMarks();
  // A dotted line round the card, 3 mm in.
  for (const c of outlineOf(ctx, ctx.cs([roundedRect(W - 6, H - 6, Math.min(6, H / 7))]))) marks.score.push(...dashed(c, 1.2, 1.8));
  const pieces: PieceOut[] = [{ ...one('Card', card, marks), sheet: 0 }];
  const name = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  if (name) {
    const room = sy - sh / 2 - web - (-H / 2 + web + 3);
    const f = fit(ctx, name, W - 2 * (web + 6), room);
    const piece = bridge(ctx, f.cs.offset(Math.max(0.2, p.weight), 'Round', 2, 24), 1.5);
    const y = (sy - sh / 2 - web + (-H / 2 + web + 3)) / 2;
    pieces.push({ ...one('Name', piece.translate([-f.b.cx, y - f.b.cy])), at: [0, 0, 1], sheet: 1 });
  }
  return { pieces, notes };
}

async function hairTieCard(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const W = Math.max(40, p.tagWidth);
  const H = Math.max(W * 1.3, p.tagHeight);
  const gapW = W * 0.4;
  const postW = (W - gapW) / 2;
  const notch = W * 0.2;
  const barH = Math.max(8, W * 0.16);
  // Two stadium posts, joined by a crossbar near each end; the slot is the air between the bars.
  const post = (x: number) => ctx.cs([roundedRect(postW, H, postW / 2 - 0.01)]).translate([x, 0]);
  const yb = H / 2 - postW / 2 - notch - barH / 2;
  let plate = post(-(gapW + postW) / 2)
    .add(post((gapW + postW) / 2))
    .add(ctx.cs([rect(gapW + 2, barH)]).translate([0, yb]))
    .add(ctx.cs([rect(gapW + 2, barH)]).translate([0, -yb]));
  const hd = Math.max(3, Math.min(p.holeDiameter, postW - 6));
  const hole = ctx.cs([circle(hd / 2, 48)]).translate([-(gapW + postW) / 2, H / 2 - postW / 2]);
  plate = plate.subtract(hole);
  const area = plate.subtract(hole.offset(2.5, 'Round', 2, 24));
  const marks = patternIn(ctx, area, p.pattern, p.patternSize, p.patternAngle, p.patternOp, p.web);
  if (postW < 12) notes.push({ level: 'warning', message: 'The posts are narrow. Make the card wider.' });
  return { pieces: [one('Card', plate, marks)], notes };
}

/* ---------------------------------------------------------------- tie holder */

async function tieHolder(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const H = Math.max(160, p.standHeight);
  const rod = Math.max(15, p.rod);
  const ringW = 12;
  const kw = Math.max(H * 0.19, 2 * (rod / 2 + 1 + ringW) - 4);
  const cap = 12;
  const kh = cap + 12;
  const bw = H * 0.3;
  const point = bw * 0.36;
  // The hook: a half ring over the knot, its right side running down into the knot, its left end
  // a round cap at nine o'clock, high enough over the knot's shoulder for the rail to pass.
  const ri = rod / 2 + 1;
  const ro = ri + ringW;
  const rm = (ri + ro) / 2;
  const knotTop = 0;
  const cy = knotTop + rod + 2 + ringW / 2;
  const half = ctx.cs([circle(ro, 128)]).subtract(ctx.cs([circle(ri, 128)])).intersect(ctx.cs([rect(ro * 2 + 2, ro + 1)]).translate([0, (ro + 1) / 2]));
  const hook = half
    .translate([0, cy])
    .add(ctx.cs([circle(ringW / 2, 48)]).translate([-rm, cy]))
    .add(ctx.cs([rect(ringW, cy - knotTop + 2)]).translate([rm, (cy + knotTop) / 2 - 1]));
  // The knot and the blade: a taper down to the point.
  const blade = H - (cy + ro) - kh;
  const yBottom = knotTop - kh - blade + point;
  const outline: Contour = [-kw / 2, knotTop - kh, -bw / 2, yBottom, 0, yBottom - point, bw / 2, yBottom, kw / 2, knotTop - kh, kw / 2, knotTop, -kw / 2 + kh * 0.55, knotTop, -kw / 2, knotTop - kh * 0.55];
  let board = ctx.cs([outline]).add(hook);
  board = board.offset(-2, 'Round', 2, 24).offset(2, 'Round', 2, 24);
  // Slots open on the left, the rungs hanging off a spine down the right.
  const n = Math.max(1, Math.round(p.slots));
  const sh = 7;
  const y0 = knotTop - kh - 6;
  const y1 = yBottom + 10;
  const rung = Math.max(6, Math.min(12, (y0 - y1 - n * sh) / (n + 1)));
  const widthAt = (y: number) => kw + ((bw - kw) * (knotTop - kh - y)) / (knotTop - kh - yBottom);
  let used = 0;
  for (let i = 0; i < n; i++) {
    const yt = y0 - rung - i * (sh + rung);
    const yc = yt - sh / 2;
    if (yc - sh / 2 < y1) break;
    const w = widthAt(yc);
    const spine = Math.max(12, 0.22 * w);
    const right = w / 2 - spine;
    const x0 = -w / 2 - 10;
    board = board.subtract(ctx.cs([roundedRect(right - x0, sh, sh / 2)]).translate([(right + x0) / 2, yc]));
    used++;
  }
  if (used < n) notes.push({ level: 'info', message: `${used} slots fit on a board this long.` });
  const mono = await lettering(ctx, p.font, p.monogram, cap);
  const marks = mono ? marksFor(ctx, centred(fit(ctx, mono, kw - 12, kh - 8), 0, knotTop - kh / 2), markOp(p)) : noMarks();
  return { pieces: [one('Tie holder', board, marks)], notes };
}

export const HOLDER_DESIGNS: Record<string, (ctx: Ctx, p: P) => Promise<DesignOut>> = {
  'phone-stand': phoneStand,
  'name-puzzle': namePuzzle,
  'tic-tac-toe': ticTacToe,
  'bracelet-set': braceletSet(false),
  'bracelet-set-symbol': braceletSet(true),
  'hair-tie-holder': hairTieHolder,
  'hair-tie-card': hairTieCard,
  'tie-holder': tieHolder,
};

