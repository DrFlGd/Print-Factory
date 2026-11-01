/**
 * Ornaments in two colours: a light frame over a dark backer of the same outline, one hanging
 * hole through both. The Christmas bauble (the name its own welded piece in the window, the year
 * on the cap), the house (a nameplate across the wall, the door and windows on the backer, the
 * year up the chimney), the cat (the name welded into the frame), the family tree (the names
 * stacked into one welded piece, no plate at all), the family crossword (the names interlocked as
 * letter tiles in a round or square frame), and your own SVG with a pattern in the areas you pick.
 */
import type { Contour, Diagnostic } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { circle, rect, rotate, roundedRect, translate } from '@pf/shapes';
import type { DesignOut, P, PieceOut } from './kit';
import { centred, lines, marginWarning, marksFor, one, union } from './kit';
import type { Ctx, Lettering, Marks } from './lib';
import { bridge, fit, lettering, noMarks, outlineOf, patternIn, region, ring, solid, symbolRegion } from './lib';

const markOp = (p: P) => (p.op === 'cut' ? 'engrave' : p.op);
const rimFor = (D: number) => Math.max(5, Math.min(14, D * 0.07));

/** Lettering welded into one piece: thickened by the boldness, any letter still apart bridged. */
export function welded(ctx: Ctx, l: Lettering, p: P): CrossSection {
  return bridge(ctx, l.cs.offset(Math.max(0.2, p.weight), 'Round', 2, 24), Math.max(1.5, p.thickness * 0.6));
}

/** A frame over a backer, with whatever lettering pieces sit in the window, and the guides for them. */
function layered(backer: CrossSection, backerMarks: Marks, frame: CrossSection, frameMarks: Marks, loose: { name: string; cs: CrossSection; marks?: Marks }[]): PieceOut[] {
  return [
    { ...one('Backer', backer, backerMarks), sheet: 0 },
    { ...one('Frame', frame, frameMarks), at: [0, 0, 1], sheet: 1 },
    ...loose.map((l) => ({ ...one(l.name, l.cs, l.marks ?? noMarks()), at: [0, 0, 1] as [number, number, number], sheet: 1 as const })),
  ];
}

/** A glue guide: the outline of a piece, a little inside it, scored on what it is glued to. */
const guide = (ctx: Ctx, cs: CrossSection) => outlineOf(ctx, cs.offset(-0.6, 'Round', 2, 16));

/* ---------------------------------------------------------------- Christmas bauble */

async function christmasOrnament(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const D = p.diameter;
  const R = D / 2;
  const rim = rimFor(D);
  const capW = D * 0.3;
  const capH = D * 0.11;
  const ball = ctx.cs([circle(R, 160)]);
  const cap = ctx.cs([roundedRect(capW, capH + 2, 1.5)]).translate([0, R + capH / 2 - 1]);
  // The loop on top of the cap, with the ribbon hole.
  const hd = Math.max(3, p.holeDiameter);
  const loopR = hd / 2 + Math.max(2.5, p.ringWall);
  const loopY = R + capH + loopR * 0.55;
  const outline = ball.add(cap).add(ctx.cs([circle(loopR, 48)]).translate([0, loopY]));
  const hole = ctx.cs([circle(hd / 2, 48)]).translate([0, loopY]);
  const window = ctx.cs([circle(R - rim, 160)]);
  const frame = outline.subtract(window).subtract(hole);
  const backer = outline.subtract(hole);
  // The year on the cap.
  const year = await lettering(ctx, p.font2, p.text2, p.size2);
  const frameMarks = year ? marksFor(ctx, centred(fit(ctx, year, capW - 4, capH - 3), 0, R + capH / 2 - 0.5), 'engrave') : noMarks();
  const backerMarks = noMarks();
  const loose: { name: string; cs: CrossSection }[] = [];
  const name = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  if (name) {
    const f = fit(ctx, name, (R - rim) * 2 * 0.86, (R - rim) * 0.9);
    // Grown to fill the window: a short name is scaled up to its width.
    const k = Math.min(((R - rim) * 2 * 0.84) / f.b.width, ((R - rim) * 0.9) / f.b.height);
    const big = region(ctx, f.cs.translate([-f.b.cx, -f.b.cy]).scale([k, k]));
    let piece = welded(ctx, big, p).intersect(window.offset(-1.2, 'Round', 2, 32));
    piece = bridge(ctx, piece, 1.5);
    loose.push({ name: 'Name', cs: piece });
    backerMarks.score.push(...guide(ctx, piece));
  } else marginWarning(notes, 'a name');
  return { pieces: layered(backer, backerMarks, frame, frameMarks, loose), notes };
}

/* ---------------------------------------------------------------- house */

async function houseOrnament(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const W = p.tagWidth;
  const wallH = W * 0.6;
  const roofH = W * 0.42;
  const eave = W * 0.06;
  const rim = Math.max(5, Math.min(12, W * 0.08));
  const wall = ctx.cs([rect(W, wallH)]).translate([0, wallH / 2]);
  const roof = ctx.cs([[-W / 2 - eave, wallH, W / 2 + eave, wallH, 0, wallH + roofH]]);
  const cw = W * 0.14;
  const cx = W * 0.24;
  const roofAt = (x: number) => wallH + roofH * (1 - Math.abs(x) / (W / 2 + eave));
  const chimney = ctx.cs([rect(cw, roofH * 0.62)]).translate([cx, roofAt(cx + cw / 2) + roofH * 0.31 - roofH * 0.1]);
  // A round boss at the peak for the hole.
  const hd = Math.max(3, p.holeDiameter);
  const bossR = hd / 2 + Math.max(2.5, p.ringWall);
  const peak = wallH + roofH;
  const boss = ctx.cs([circle(bossR, 48)]).translate([0, peak - bossR * 0.2]);
  const hole = ctx.cs([circle(hd / 2, 48)]).translate([0, peak - bossR * 0.2]);
  const house = wall.add(roof).add(chimney).add(boss);
  // The window: the gable set in by the rim, rounded; the chimney and the boss stay solid over it.
  const gable = wall.add(roof);
  const window = gable.offset(-rim, 'Round', 2, 32).offset(-2, 'Round', 2, 16).offset(2, 'Round', 2, 16).subtract(chimney.offset(1.5)).subtract(boss.offset(1.5));
  const frame = house.subtract(window).subtract(hole);
  const backer = house.subtract(hole);
  // The backer: a door and two windows, the address under the nameplate.
  const marks = noMarks();
  const dw = W * 0.2;
  const dh = wallH * 0.42;
  const doorY = rim * 0.4 + dh / 2;
  const details: Contour[] = [roundedRect(dw, dh, dw * 0.12).map((v, i) => (i % 2 ? v + doorY : v))];
  const ww = W * 0.17;
  for (const x of [-W * 0.27, W * 0.27]) details.push(translate([roundedRect(ww, ww, 1)], x, wallH * 0.38)[0]!);
  const detail = ctx.cs(details, 'NonZero');
  const panes = ctx.cs([...[-W * 0.27, W * 0.27].flatMap((x) => [translate([rect(ww, 0.8)], x, wallH * 0.38)[0]!, translate([rect(0.8, ww)], x, wallH * 0.38)[0]!]), translate([circle(0.9, 16)], dw * 0.3, doorY)[0]!], 'NonZero');
  marks.engrave = detail.subtract(panes);
  const ls = lines(p.text2);
  const year = ls[0] ? await lettering(ctx, p.font2, ls[0], p.size2) : null;
  const address = ls[1] ? await lettering(ctx, p.font2, ls[1], p.size2 * 0.8) : null;
  const frameMarks = noMarks();
  if (year) {
    // Up the chimney: turned a quarter, fitted to its height.
    const cb = chimney.bounds();
    const up = region(ctx, ctx.cs(rotate(ctx.contours(year.cs), 90), 'NonZero'));
    const f = fit(ctx, up, cw - 3, cb.max[1] - roofAt(cx - cw / 2) - 3);
    frameMarks.engrave = centred(f, cx, (cb.max[1] + roofAt(cx - cw / 2)) / 2);
  }
  // The nameplate across the wall, above the door.
  const loose: { name: string; cs: CrossSection; marks?: Marks }[] = [];
  const name = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  const plateW = W - 2 * rim + 6;
  const plateH = Math.min(wallH * 0.24, W * 0.16);
  const plateY = wallH * 0.38 + ww / 2 + plateH / 2 + 2;
  if (name) {
    const plate = ctx.cs([roundedRect(plateW, plateH, Math.min(3, plateH / 3))]).translate([0, plateY]);
    const nf = centred(fit(ctx, name, plateW - 6, plateH - 3), 0, plateY);
    loose.push({ name: 'Nameplate', cs: plate, marks: marksFor(ctx, nf, markOp(p)) });
    marks.score.push(...guide(ctx, plate));
    if (marks.engrave) marks.engrave = marks.engrave.subtract(plate.offset(1));
  }
  if (address) marks.engrave = union(ctx, [marks.engrave, centred(fit(ctx, address, plateW - 8, wallH * 0.1), 0, doorY + dh / 2 + 3 + Math.min(address.b.height, wallH * 0.1) / 2)]);
  return { pieces: layered(backer, marks, frame, frameMarks, loose), notes };
}

/* ---------------------------------------------------------------- cat */

function catHead(ctx: Ctx, W: number): { head: CrossSection; face: CrossSection; ears: CrossSection } {
  const face = ctx.cs([[...ellipsePts(W / 2, W * 0.42)]]);
  const ear = (side: number): Contour => [side * W * 0.12, W * 0.3, side * W * 0.44, W * 0.08, side * W * 0.38, W * 0.56];
  const ears = ctx.cs([ear(-1), ear(1)], 'NonZero').offset(-1.5, 'Round', 2, 16).offset(1.5 + 0.01, 'Round', 2, 16);
  return { head: face.add(ears), face, ears };
}

function ellipsePts(rx: number, ry: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    out.push(rx * Math.cos(a), ry * Math.sin(a));
  }
  return out;
}

async function catOrnament(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const W = p.tagWidth;
  const rim = Math.max(4.5, Math.min(10, W * 0.075));
  const { head, face } = catHead(ctx, W);
  const hd = Math.max(3, p.holeDiameter);
  const bossR = hd / 2 + Math.max(2.5, p.ringWall);
  const top = face.bounds().max[1];
  const boss = ctx.cs([circle(bossR, 48)]).translate([0, top + bossR * 0.3]);
  const hole = ctx.cs([circle(hd / 2, 48)]).translate([0, top + bossR * 0.3]);
  const outline = head.add(boss);
  const window = face.offset(-rim, 'Round', 2, 48);
  const ring0 = outline.subtract(window);
  // The name across the window, welded into the rim at both ends.
  const wb = window.bounds();
  const winW = wb.max[0] - wb.min[0];
  const winH = wb.max[1] - wb.min[1];
  const name = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  const loose: { name: string; cs: CrossSection }[] = [];
  let frame = ring0;
  const backerMarks = noMarks();
  const frameMarks = noMarks();
  // The nose and whiskers sit above the name.
  let noseY = -winH * 0.12;
  if (name) {
    // As high across the face as the name reaches the rim at both ends: the face narrows lower down.
    const chord = (y: number) => {
      const c = window.intersect(ctx.cs([rect(W * 2, 0.2)]).translate([0, y]));
      if (c.isEmpty()) return 0;
      const q = c.bounds();
      return q.max[0] - q.min[0];
    };
    const bite = rim * 0.45;
    const maxH = winH * 0.42;
    let ny = -winH * 0.1;
    for (let f = 0.1; f <= 0.36; f += 0.02) {
      ny = -winH * f;
      if ((name.b.width / name.b.height) * maxH >= chord(ny) + bite) break;
    }
    const reach = chord(ny) + 2 * bite;
    const k = Math.min(reach / name.b.width, maxH / name.b.height);
    const placed = region(ctx, name.cs.translate([-name.b.cx, -name.b.cy]).scale([k, k]).translate([0, ny]));
    noseY = Math.min(winH * 0.1, placed.b.maxY + W * 0.08);
    const w = welded(ctx, placed, p).intersect(outline);
    const all = ring0.add(w).subtract(hole).decompose().sort((a, b) => b.area() - a.area());
    frame = all[0]!;
    const rest = all.slice(1).filter((q) => q.area() > 1);
    frameMarks.score.push(...outlineOf(ctx, w.intersect(ring0.offset(-0.3, 'Round', 2, 16))));
    if (rest.length) {
      const piece = ctx.CrossSection.union(rest);
      loose.push({ name: 'Lettering', cs: piece });
      backerMarks.score.push(...guide(ctx, piece));
      notes.push({ level: 'info', message: 'Part of the name does not reach the frame: it is cut as its own piece, to glue inside the scored line.' });
    }
  } else marginWarning(notes, 'a name');
  frame = frame.subtract(hole);
  // On the backer: a nose, whiskers each side, and the year low in the window.
  const nose = ctx.cs([[-W * 0.04, noseY + W * 0.03, W * 0.04, noseY + W * 0.03, 0, noseY]]);
  const wh: Contour[] = [];
  for (const s of [-1, 1]) for (const dy of [-0.03, 0, 0.03]) wh.push([s * W * 0.1, noseY, s * W * 0.32, noseY + dy * W * 2.2]);
  const whiskers = ctx.cs(
    wh.map((l) => {
      const [x0, y0, x1, y1] = l as [number, number, number, number];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const nx = (-(y1 - y0) / len) * 0.5;
      const ny = ((x1 - x0) / len) * 0.5;
      return [x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 - nx, y1 - ny, x1 + nx, y1 + ny];
    }),
    'NonZero',
  );
  const year = await lettering(ctx, p.font2, p.text2, p.size2);
  backerMarks.engrave = union(ctx, [nose, whiskers, year ? centred(fit(ctx, year, winW * 0.4, winH * 0.12), 0, wb.min[1] + winH * 0.1) : null])!.intersect(window);
  return { pieces: layered(outline.subtract(hole), backerMarks, frame, frameMarks, loose), notes };
}

/* ---------------------------------------------------------------- family tree */

async function familyTree(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const names = lines(p.text).slice(0, 12);
  if (!names.length) return (marginWarning(notes, 'the family names, one per line'), { pieces: [], notes });
  // Narrowest first, each row set a little bigger than the one above.
  const measured: { l: Lettering; name: string }[] = [];
  for (const n of names) {
    const l = await lettering(ctx, p.font, n, p.size, { spacing: p.spacing });
    if (l) measured.push({ l, name: n });
  }
  measured.sort((a, b) => a.l.b.width - b.l.b.width);
  const overlap = Math.max(0.8, p.size * 0.12);
  const rows: CrossSection[] = [];
  let y = 0;
  const taper = 0.12;
  const widest = measured[measured.length - 1]!.l.b.width * (1 + (measured.length - 1) * taper);
  for (let i = 0; i < measured.length; i++) {
    const { l } = measured[i]!;
    // Rows widen evenly down the tree, whatever the names' own lengths.
    const target = (widest * (0.45 + (0.55 * (i + 1)) / measured.length));
    const k = Math.min(target / l.b.width, 1 + i * taper);
    const cs = welded(ctx, region(ctx, l.cs.translate([-l.b.cx, -l.b.maxY]).scale([k, k])), p);
    const b = cs.bounds();
    rows.push(cs.translate([0, y - b.max[1] + (i ? overlap : 0)]));
    y = y - (b.max[1] - b.min[1]) + (i ? overlap : 0);
  }
  const year = await lettering(ctx, p.font2, p.text2, p.size2);
  if (year) {
    const cs = welded(ctx, year, p);
    const b = cs.bounds();
    rows.push(cs.translate([-(b.min[0] + b.max[0]) / 2, y - b.max[1] + overlap * 0.5]));
  }
  // The topper: the symbol sunk into the top row, with the hole.
  const sym = await symbolRegion(ctx, p.symbol, Math.max(12, p.size * 2.2));
  const hd = Math.max(3, p.holeDiameter);
  let hole: CrossSection | null = null;
  if (sym) {
    const s = solid(ctx, sym);
    const sb = s.bounds();
    const top = rows[0]!.bounds().max[1];
    const placed = s.translate([-(sb.min[0] + sb.max[0]) / 2, top - overlap * 1.5 - sb.min[1]]);
    rows.push(placed);
    const pb = placed.bounds();
    hole = ctx.cs([circle(hd / 2, 48)]).translate([0, (pb.min[1] + pb.max[1]) / 2 + (pb.max[1] - pb.min[1]) * 0.12]);
    if (!placed.subtract(hole.offset(1.5)).decompose().every((q) => q.area() > 0)) notes.push({ level: 'warning', message: 'The hole is large for the topper.' });
  }
  let body = bridge(ctx, ctx.CrossSection.union(rows), Math.max(1.5, p.thickness * 0.6));
  if (hole) body = body.subtract(hole);
  else body = ring(ctx, body, 'loop', 'top', hd, Math.max(2.5, p.ringWall)).body;
  return { pieces: [one('Tree', body)], notes };
}

/* ---------------------------------------------------------------- family crossword */

export interface Placed {
  word: string;
  x: number;
  y: number;
  across: boolean;
}

/**
 * Words laid out as a crossword: each new word crosses one already placed on a shared letter,
 * no two words run side by side, and nothing reads on from the end of a word. The longest goes
 * first; each next word takes the crossing that keeps the grid most compact.
 */
export function crossword(words: string[]): { placed: Placed[]; skipped: string[] } {
  const ws = [...new Set(words.map((w) => w.toUpperCase().replace(/[^A-Z]/g, '')).filter((w) => w.length > 1))].sort((a, b) => b.length - a.length);
  const grid = new Map<string, string>();
  const key = (x: number, y: number) => `${x},${y}`;
  const placed: Placed[] = [];
  const skipped: string[] = [];
  const put = (pl: Placed) => {
    for (let i = 0; i < pl.word.length; i++) grid.set(key(pl.x + (pl.across ? i : 0), pl.y + (pl.across ? 0 : i)), pl.word[i]!);
    placed.push(pl);
  };
  const fits = (pl: Placed): number => {
    let crossings = 0;
    const [dx, dy] = pl.across ? [1, 0] : [0, 1];
    if (grid.has(key(pl.x - dx, pl.y - dy)) || grid.has(key(pl.x + dx * pl.word.length, pl.y + dy * pl.word.length))) return -1;
    for (let i = 0; i < pl.word.length; i++) {
      const x = pl.x + dx * i;
      const y = pl.y + dy * i;
      const c = grid.get(key(x, y));
      if (c) {
        if (c !== pl.word[i]) return -1;
        crossings++;
      } else if (grid.has(key(x + dy, y + dx)) || grid.has(key(x - dy, y - dx))) return -1;
    }
    return crossings;
  };
  const extent = (extra: Placed) => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const pl of [...placed, extra]) {
      x0 = Math.min(x0, pl.x);
      y0 = Math.min(y0, pl.y);
      x1 = Math.max(x1, pl.x + (pl.across ? pl.word.length - 1 : 0));
      y1 = Math.max(y1, pl.y + (pl.across ? 0 : pl.word.length - 1));
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    return Math.max(w, h) * 10 + w * h * 0.1;
  };
  for (const w of ws) {
    if (!placed.length) {
      put({ word: w, x: 0, y: 0, across: true });
      continue;
    }
    let best: { pl: Placed; score: number } | null = null;
    for (const pl0 of placed)
      for (let i = 0; i < pl0.word.length; i++)
        for (let j = 0; j < w.length; j++) {
          if (pl0.word[i] !== w[j]) continue;
          const across = !pl0.across;
          const cx = pl0.x + (pl0.across ? i : 0);
          const cy = pl0.y + (pl0.across ? 0 : i);
          const pl: Placed = { word: w, across, x: across ? cx - j : cx, y: across ? cy : cy - j };
          if (fits(pl) < 1) continue;
          const score = extent(pl);
          if (!best || score < best.score) best = { pl, score };
        }
    if (best) put(best.pl);
    else skipped.push(w);
  }
  return { placed, skipped };
}

async function familyCrossword(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const D = p.diameter;
  const rim = rimFor(D);
  const round = p.ornamentShape !== 'square';
  const outline0 = round ? ctx.cs([circle(D / 2, 160)]) : ctx.cs([roundedRect(D, D, D * 0.08)]);
  const inner = outline0.offset(-rim, 'Round', 2, 64);
  const band = D * 0.14;
  const ib = inner.bounds();
  const bandTop = ib.min[1] + band + (round ? D * 0.04 : 0);
  const window = inner.intersect(ctx.cs([rect(D * 2, D)]).translate([0, bandTop + D / 2]));
  const hd = Math.max(3, p.holeDiameter);
  const r = ring(ctx, outline0, 'loop', 'top', hd, Math.max(2.5, p.ringWall));
  const frame = r.body.subtract(window);
  const backer = r.body;
  // The crossword, sized to the window.
  const { placed, skipped } = crossword(lines(p.text));
  if (skipped.length) notes.push({ level: 'warning', message: `${skipped.join(', ')} share${skipped.length === 1 ? 's' : ''} no letter with the others and was left out.` });
  const pieces: PieceOut[] = [];
  const backerMarks = noMarks();
  if (placed.length) {
    const cells = new Map<string, { x: number; y: number; c: string }>();
    for (const pl of placed) for (let i = 0; i < pl.word.length; i++) {
      const x = pl.x + (pl.across ? i : 0);
      const y = pl.y + (pl.across ? 0 : i);
      cells.set(`${x},${y}`, { x, y, c: pl.word[i]! });
    }
    const xs = [...cells.values()].map((c) => c.x);
    const ys = [...cells.values()].map((c) => c.y);
    const cols = Math.max(...xs) - Math.min(...xs) + 1;
    const rowsN = Math.max(...ys) - Math.min(...ys) + 1;
    const wb = window.bounds();
    const wW = wb.max[0] - wb.min[0];
    const wH = wb.max[1] - wb.min[1];
    // The largest tile size at which the whole grid sits inside the window.
    let s = Math.min((wW * 0.92) / cols, (wH * 0.92) / rowsN, 14);
    const gx = (wb.min[0] + wb.max[0]) / 2;
    const gy = (wb.min[1] + wb.max[1]) / 2;
    const at = (c: { x: number; y: number }, s: number): [number, number] => [gx + (c.x - Math.min(...xs) - (cols - 1) / 2) * s, gy - (c.y - Math.min(...ys) - (rowsN - 1) / 2) * s];
    const tilesAt = (s: number) => ctx.CrossSection.union([...cells.values()].map((c) => ctx.cs([roundedRect(s + 0.02, s + 0.02, s * 0.1)]).translate(at(c, s))));
    for (let i = 0; i < 20 && !tilesAt(s).subtract(window.offset(-1)).isEmpty(); i++) s *= 0.95;
    const tiles = tilesAt(s);
    const ink: CrossSection[] = [];
    const seams: Contour[] = [];
    for (const c of cells.values()) {
      const l = await lettering(ctx, p.font, c.c, s * 0.55);
      const [x, y] = at(c, s);
      if (l) ink.push(centred(fit(ctx, l, s * 0.7, s * 0.62), x, y));
      if (cells.has(`${c.x + 1},${c.y}`)) seams.push([x + s / 2, y - s * 0.38, x + s / 2, y + s * 0.38]);
      if (cells.has(`${c.x},${c.y + 1}`)) seams.push([x - s * 0.38, y - s / 2, x + s * 0.38, y - s / 2]);
    }
    const m = marksFor(ctx, union(ctx, ink), markOp(p));
    m.score.push(...seams);
    pieces.push({ ...one('Tiles', tiles, m), at: [0, 0, 1], sheet: 1 });
    backerMarks.score.push(...guide(ctx, tiles));
    if (s < 6) notes.push({ level: 'warning', message: `The tiles come out ${s.toFixed(1)} mm: small to read. Make the ornament bigger or use fewer names.` });
  } else marginWarning(notes, 'the family names, one per line');
  // The band: the family name over the year.
  const ls = lines(p.text2);
  const bandBox = inner.intersect(ctx.cs([rect(D * 2, bandTop - ib.min[1])]).translate([0, (bandTop + ib.min[1]) / 2]));
  const bb = bandBox.bounds();
  const bw = (bb.max[0] - bb.min[0]) * (round ? 0.6 : 0.85);
  const bh = bb.max[1] - bb.min[1];
  const fam = ls[0] ? await lettering(ctx, p.font2, ls[0], p.size2) : null;
  const yr = ls[1] ? await lettering(ctx, p.font2, ls[1], p.size2 * 0.7) : null;
  const ink: CrossSection[] = [];
  if (fam) ink.push(centred(fit(ctx, fam, bw, bh * (yr ? 0.55 : 0.8)), 0, bb.max[1] - bh * (yr ? 0.32 : 0.5)));
  if (yr) ink.push(centred(fit(ctx, yr, bw * 0.6, bh * 0.3), 0, bb.min[1] + bh * 0.22));
  const frameMarks = marksFor(ctx, union(ctx, ink), markOp(p));
  return { pieces: [{ ...one('Backer', backer, backerMarks), sheet: 0 }, { ...one('Frame', frame, frameMarks), at: [0, 0, 1], sheet: 1 }, ...pieces], notes };
}

/* ---------------------------------------------------------------- pattern on your SVG */

async function patternSvg(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const art = await symbolRegion(ctx, p.symbol, p.symbolSize);
  if (!art) return (marginWarning(notes, 'artwork (choose a symbol or use your own SVG)'), { pieces: [], notes });
  // The faces of the drawing, numbered left to right, top to bottom.
  const faces = art
    .decompose()
    .map((f) => ({ f, b: f.bounds() }))
    .sort((a, b) => (Math.abs(b.b.max[1] - a.b.max[1]) > 1 ? b.b.max[1] - a.b.max[1] : a.b.min[0] - b.b.min[0]));
  const want = p.areas.trim().toLowerCase();
  const picked = want === '' || want === 'all' ? faces.map((_, i) => i) : want.split(/[\s,]+/).map((s) => Number(s) - 1).filter((i) => Number.isInteger(i) && i >= 0 && i < faces.length);
  if (want !== 'all' && want !== '' && picked.length === 0) notes.push({ level: 'warning', message: `Areas are numbered 1 to ${faces.length}, left to right from the top.` });
  const blankCs = solid(ctx, art);
  const r = ring(ctx, blankCs, p.ring, p.ringSide, p.holeDiameter, p.ringWall);
  const marksList: Marks[] = [];
  for (const i of picked) {
    const area = faces[i]!.f.offset(-Math.max(0.8, p.border), 'Round', 2, 24);
    if (r.hole) marksList.push(patternIn(ctx, area.subtract(r.hole.offset(p.border + 1)), p.pattern, p.patternSize, p.patternAngle, p.patternOp, p.web));
    else marksList.push(patternIn(ctx, area, p.pattern, p.patternSize, p.patternAngle, p.patternOp, p.web));
  }
  const cut = marksList.map((m) => m.cut).filter((c): c is CrossSection => !!c);
  const engrave = marksList.map((m) => m.engrave).filter((c): c is CrossSection => !!c);
  const marks: Marks = { cut: cut.length ? ctx.CrossSection.union(cut) : null, engrave: engrave.length ? ctx.CrossSection.union(engrave) : null, score: marksList.flatMap((m) => m.score) };
  // The drawing's own lines between faces stay as wood; score them so the drawing reads.
  marks.score.push(...outlineOf(ctx, blankCs.subtract(art)));
  notes.push({ level: 'info', message: `The artwork has ${faces.length} area${faces.length === 1 ? '' : 's'}; ${picked.length} patterned.` });
  return { pieces: [one('Piece', r.body, marks)], notes };
}

export const ORNAMENT_DESIGNS: Record<string, (ctx: Ctx, p: P) => Promise<DesignOut>> = {
  'christmas-ornament': christmasOrnament,
  'house-ornament': houseOrnament,
  'cat-ornament': catOrnament,
  'family-tree-names': familyTree,
  'family-crossword': familyCrossword,
  'pattern-svg': patternSvg,
};

