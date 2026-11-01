/**
 * The designs. Each turns the settings into pieces: a region cut from sheet, with what is
 * engraved, scored or cut out of it, and where it sits when the design is put together (a
 * layered design's pieces stack; a set of tags or cards stands in a row).
 */
import type { Contour, Diagnostic } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { circle, clipPolylines, poleOf, rect, roundedRect, translate } from '@pf/shapes';
import type { Ctx, Lettering, Marks, RingKind, RingSide } from './lib';
import { arcText, blank, blankHeight, bridge, fit, hug, lettering, noMarks, outlineOf, patternIn, qrRegion, region, ring, solid, symbolRegion } from './lib';

export type DesignId =
  | 'name-keychain'
  | 'layered-keychain'
  | 'connected-text'
  | 'symbol-charm'
  | 'name-tag'
  | 'pet-tag'
  | 'pattern-fill'
  | 'arc-coaster'
  | 'framed-ornament'
  | 'cake-topper'
  | 'plant-stake'
  | 'place-cards'
  | 'luggage-tag'
  | 'qr-tag'
  | 'jigsaw';

export interface Params {
  design: DesignId;
  text: string;
  text2: string;
  monogram: string;
  font: string;
  font2: string;
  size: number;
  size2: number;
  spacing: number;
  weight: number;
  op: 'engrave' | 'score' | 'cut';
  shape: string;
  tagWidth: number;
  tagHeight: number;
  diameter: number;
  border: number;
  cardWidth: number;
  cardHeight: number;
  bothSides: boolean;
  margin: number;
  smooth: number;
  symbol: string;
  symbolSize: number;
  pattern: string;
  patternOp: 'cut' | 'engrave' | 'score';
  patternSize: number;
  patternAngle: number;
  web: number;
  qrData: string;
  ecc: 'L' | 'M' | 'Q' | 'H';
  puzzleWidth: number;
  puzzleHeight: number;
  cols: number;
  rows: number;
  tabSize: number;
  seed: number;
  stakeLength: number;
  stakes: number;
  ring: RingKind;
  ringSide: RingSide;
  holeDiameter: number;
  ringWall: number;
  thickness: number;
  kerf: number;
  sheet: string;
  sheetWidth: number;
  sheetHeight: number;
  spacingSheet: number;
  color: [number, number, number];
  color2: [number, number, number];
}

export interface PieceOut {
  name: string;
  cut: CrossSection;
  marks: Marks;
  /** Open cut lines inside the piece (a jigsaw's). */
  cutLines?: Contour[];
  /** Where it sits in the assembled design: x, y and its layer (0 is the bottom sheet). */
  at: [number, number, number];
  /** Which sheet colour: the first or the second. */
  sheet: 0 | 1;
}

export interface DesignOut {
  pieces: PieceOut[];
  notes: Diagnostic[];
}

type P = Params;

const lines = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

function marksFor(ctx: Ctx, l: CrossSection | null, op: P['op']): Marks {
  if (!l || l.isEmpty()) return noMarks();
  if (op === 'score') return { cut: null, engrave: null, score: outlineOf(ctx, l) };
  if (op === 'cut') return { cut: l, engrave: null, score: [] };
  return { cut: null, engrave: l, score: [] };
}

function one(name: string, cut: CrossSection, marks: Marks = noMarks()): PieceOut {
  return { name, cut, marks, at: [0, 0, 0], sheet: 0 };
}

/**
 * Lettering as large as it will go (never larger than it was typed) wholly inside `area`:
 * centred on the area's middle, or on its widest point when the middle is outside it.
 */
function fitInside(ctx: Ctx, l: Lettering, area: CrossSection, fill = 0.8): Lettering {
  if (area.isEmpty()) return region(ctx, l.cs.scale([0.01, 0.01]));
  const b = area.bounds();
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  const at = (x: number, y: number, k: number) => l.cs.scale([k, k]).translate([x - l.b.cx * k, y - l.b.cy * k]);
  const inside = (x: number, y: number, k: number) => at(x, y, k).subtract(area).area() < 1e-3;
  const top = Math.min(1, ((b.max[0] - b.min[0]) * fill) / l.b.width, ((b.max[1] - b.min[1]) * fill) / l.b.height);
  const largest = (x: number, y: number) => {
    if (inside(x, y, top)) return top;
    let lo = 0;
    let hi = top;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (inside(x, y, mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  // Candidates: the middle, points down the middle line, and the widest point.
  const cands: [number, number][] = [[cx, cy]];
  for (const f of [0.3, 0.4, 0.5, 0.6, 0.7]) cands.push([cx, b.min[1] + (b.max[1] - b.min[1]) * f]);
  const pole = poleOf(ctx.contours(area), 0.25);
  cands.push([pole.x, pole.y]);
  let best = { x: cx, y: cy, k: 0 };
  for (const [x, y] of cands) {
    const k = largest(x, y);
    // The middle wins unless somewhere else fits clearly larger lettering.
    if (k > best.k * 1.08) best = { x, y, k };
  }
  return region(ctx, at(best.x, best.y, best.k * 0.97));
}

function marginWarning(notes: Diagnostic[], what: string) {
  notes.push({ level: 'warning', message: `Type some ${what} to see the design.` });
}

/* ---------------------------------------------------------------- keychains */

async function nameKeychain(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const l = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  if (!l) return (marginWarning(notes, 'text'), { pieces: [], notes });
  const welded = p.weight > 0 ? l.cs.offset(p.weight, 'Round', 2, 24) : l.cs;
  const r = ring(ctx, hug(ctx, welded, p.margin, p.smooth), p.ring, p.ringSide, p.holeDiameter, p.ringWall);
  return { pieces: [one('Keychain', r.body, marksFor(ctx, l.cs, p.op === 'cut' ? 'engrave' : p.op))], notes };
}

async function layeredKeychain(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const l = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  if (!l) return (marginWarning(notes, 'text'), { pieces: [], notes });
  const name = l.cs.offset(Math.max(0.2, p.weight), 'Round', 2, 24);
  const r = ring(ctx, hug(ctx, name, p.margin, p.smooth), p.ring, p.ringSide, p.holeDiameter, p.ringWall);
  const parts = name.decompose().length;
  if (parts > 1) notes.push({ level: 'info', message: `The name comes out in ${parts} pieces: glue each onto the backer, which is engraved with where they go.` });
  return {
    pieces: [
      { ...one('Backer', r.body, { cut: null, engrave: null, score: parts > 1 ? outlineOf(ctx, name) : [] }), sheet: 1 },
      { ...one('Name', name), at: [0, 0, 1] },
    ],
    notes,
  };
}

async function connectedText(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const l = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  if (!l) return (marginWarning(notes, 'text'), { pieces: [], notes });
  // Welded by the boldness, and every letter that still stands alone bridged to the next by a
  // bar as thick as the sheet, so the name lifts out in one piece.
  const welded = l.cs.offset(Math.max(0.15, p.weight), 'Round', 2, 24);
  const joined = bridge(ctx, welded, Math.max(1.5, p.thickness));
  const r = ring(ctx, joined, p.ring, p.ringSide, p.holeDiameter, p.ringWall);
  return { pieces: [one('Name', r.body)], notes };
}

async function symbolCharm(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const s = await symbolRegion(ctx, p.symbol, p.symbolSize);
  if (!s) return (marginWarning(notes, 'symbol'), { pieces: [], notes });
  const r = ring(ctx, hug(ctx, s, p.margin, p.smooth), p.ring, p.ringSide, p.holeDiameter, p.ringWall);
  return { pieces: [one('Charm', r.body, marksFor(ctx, s, p.op === 'cut' ? 'engrave' : p.op))], notes };
}

/* ---------------------------------------------------------------- tags */

function tagBlank(ctx: Ctx, p: P): CrossSection {
  const tall = ['rectangle', 'oval', 'pill', 'rounded-square', 'squircle'].includes(p.shape);
  return blank(ctx, p.shape, p.tagWidth, tall ? p.tagHeight : blankHeight(p.shape, p.tagWidth));
}

/** Where marks may go on a blank: in from its edge and clear of the ring's hole. */
function writable(ctx: Ctx, body: CrossSection, hole: CrossSection | null, margin: number): CrossSection {
  let a = body.offset(-margin, 'Round', 2, 32);
  if (hole) a = a.subtract(hole.offset(margin + 0.5, 'Round', 2, 32));
  return a;
}

async function nameTag(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const r = ring(ctx, tagBlank(ctx, p), p.ring, p.ringSide, p.holeDiameter, p.ringWall);
  const l = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  if (!l) return { pieces: [one('Tag', r.body)], notes };
  const placed = fitInside(ctx, l, writable(ctx, r.body, r.hole, p.margin));
  if (placed.b.height < l.b.height * 0.98) notes.push({ level: 'info', message: `The text was made smaller to fit the shape (${placed.b.height.toFixed(1)} mm tall).` });
  const marks = marksFor(ctx, placed.cs, p.op);
  const body = marks.cut ? r.body.subtract(marks.cut) : r.body;
  if (p.op === 'cut' && holesInText(ctx, placed.cs)) notes.push({ level: 'info', message: 'Cut through, the middles of letters like O and A fall out. Use a stencil font to keep them.' });
  return { pieces: [one('Tag', body, { ...marks, cut: null })], notes };
}

function holesInText(ctx: Ctx, s: CrossSection): boolean {
  return solid(ctx, s).area() - s.area() > 0.5;
}

async function petTag(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const r = ring(ctx, tagBlank(ctx, p), p.ring, p.ringSide, p.holeDiameter, p.ringWall);
  const area = writable(ctx, r.body, r.hole, p.margin);
  const name = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  const phone = await lettering(ctx, p.font2, p.text2, p.size2);
  if (!name && !phone) return { pieces: [one('Tag', r.body)], notes };
  // The name above the number, as one block, fitted together.
  const gap = p.size2 * 0.5;
  const parts: CrossSection[] = [];
  if (name) parts.push(name.cs.translate([0, phone ? (phone.b.height + gap) / 2 : 0]));
  if (phone) parts.push(phone.cs.translate([0, name ? -(name.b.height + gap) / 2 : 0]));
  const block = region(ctx, ctx.CrossSection.union(parts));
  const placed = fitInside(ctx, region(ctx, block.cs.translate([-block.b.cx, -block.b.cy])), area, 0.86);
  return { pieces: [one('Tag', r.body, marksFor(ctx, placed.cs, p.op === 'cut' ? 'engrave' : p.op))], notes };
}

async function patternFill(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const r = ring(ctx, tagBlank(ctx, p), p.ring, p.ringSide, p.holeDiameter, p.ringWall);
  let area = writable(ctx, r.body, r.hole, p.border);
  const marks: Marks = noMarks();
  const mono = await lettering(ctx, p.font, p.monogram, p.size);
  let tile: CrossSection | null = null;
  if (mono) {
    const placed = fitInside(ctx, mono, area.offset(-3, 'Round', 2, 24), 0.7);
    tile = solid(ctx, placed.cs.offset(3, 'Round', 2, 32));
    area = area.subtract(tile);
    marks.engrave = placed.cs;
  }
  const pat = patternIn(ctx, area, p.pattern, p.patternSize, p.patternAngle, p.patternOp, p.web);
  marks.engrave = pat.engrave && marks.engrave ? pat.engrave.add(marks.engrave) : (pat.engrave ?? marks.engrave);
  marks.score = [...pat.score, ...(tile ? outlineOf(ctx, tile) : [])];
  const body = pat.cut ? r.body.subtract(pat.cut) : r.body;
  if (pat.cut && body.decompose().length > 1) notes.push({ level: 'warning', message: 'Some of the pattern would fall out. Make the web wider or the pattern larger.' });
  return { pieces: [one('Piece', body, marks)], notes };
}

/* ---------------------------------------------------------------- round things */

function disc(ctx: Ctx, p: P, scallop: boolean): CrossSection {
  const R = p.diameter / 2;
  if (!scallop) return ctx.cs([circle(R, 128)]);
  const n = Math.max(12, Math.round((Math.PI * p.diameter) / 12));
  const bump = (Math.PI * R) / n;
  const bumps = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return translate([circle(bump, 32)], (R - bump) * Math.cos(a), (R - bump) * Math.sin(a))[0]!;
  });
  return ctx.cs([circle(R - bump, 128), ...bumps], 'NonZero');
}

async function arcCoaster(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const scallop = p.shape === 'scallop';
  const body0 = disc(ctx, p, scallop);
  const r = ring(ctx, body0, p.ring, 'top', p.holeDiameter, p.ringWall);
  const edge = p.diameter / 2 - (scallop ? (Math.PI * p.diameter) / 2 / Math.max(12, Math.round((Math.PI * p.diameter) / 12)) : 0);
  const bandOuter = edge - p.border;
  const R = bandOuter - 1.5 - p.size;
  const marks: Marks = noMarks();
  const engr: CrossSection[] = [];
  const top = await arcText(ctx, p.font, p.text, p.size, R, 'top', p.spacing);
  const bottom = await arcText(ctx, p.font, p.text2, p.size, R, 'bottom', p.spacing);
  if (top) engr.push(top);
  if (bottom) engr.push(bottom);
  if (p.border > 0) marks.score.push(...outlineOf(ctx, ctx.cs([circle(bandOuter, 128)])), ...outlineOf(ctx, ctx.cs([circle(R - 2, 128)])));
  const mono = await lettering(ctx, p.font2, p.monogram, p.size2);
  if (mono) engr.push(fitInside(ctx, mono, ctx.cs([circle(R - 4, 96)]), 0.85).cs);
  if (engr.length) {
    const all = ctx.CrossSection.union(engr);
    const m = marksFor(ctx, all, p.op === 'cut' ? 'engrave' : p.op);
    marks.engrave = m.engrave;
    marks.score.push(...m.score);
  }
  const span = (await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing }))?.b.width ?? 0;
  if (span > Math.PI * R) notes.push({ level: 'warning', message: 'The top text runs more than halfway round. Make it shorter or smaller.' });
  return { pieces: [one(scallop ? 'Coaster' : 'Disc', r.body, marks)], notes };
}

async function framedOrnament(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const R = p.diameter / 2;
  const outer = ctx.cs([circle(R, 128)]);
  const inner = ctx.cs([circle(R - p.border, 128)]);
  // The hanging hole in a cap above the rim, shared by both layers so they line up.
  const capR = p.holeDiameter / 2 + p.ringWall;
  const cap = ctx.cs(translate([circle(capR, 48)], 0, R + capR - p.ringWall));
  const hole = ctx.cs(translate([circle(p.holeDiameter / 2, 48)], 0, R + capR - p.ringWall));
  let front = outer.subtract(inner).add(cap);
  const l = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  if (l) {
    // The name across the middle, welded and stretched to reach the rim at both ends.
    const named = fit(ctx, l, p.diameter * 1.5, p.diameter * 0.45);
    const welded = named.cs.offset(Math.max(0.2, p.weight), 'Round', 2, 24);
    const k = (2 * (R - p.border * 0.5)) / Math.max(1, region(ctx, welded).b.width);
    const across = k < 1 ? welded.scale([k, k]) : welded;
    const b = region(ctx, across).b;
    const reach = across.translate([-b.cx, -b.cy]);
    front = front.add(bridge(ctx, reach.intersect(outer), Math.max(1.5, p.thickness)));
    if (front.decompose().length > 1) {
      // The name still floats inside: a bar across the frame's middle holds it.
      front = front.add(ctx.cs([rect(2 * R - p.border, Math.max(2, p.thickness))]).intersect(outer)).add(reach.intersect(outer));
    }
  }
  front = front.subtract(hole);
  const back = outer.add(cap).subtract(hole);
  const year = await lettering(ctx, p.font2, p.text2, p.size2);
  const marks: Marks = noMarks();
  if (year) marks.engrave = fitInside(ctx, year, ctx.cs(translate([rect(R * 1.2, R * 0.38)], 0, -R * 0.6)), 0.9).cs;
  notes.push({ level: 'info', message: 'Cut the frame from a light sheet and the backer from a dark one, and glue them with the holes lined up.' });
  return {
    pieces: [
      { ...one('Backer', back, marks), sheet: 1 },
      { ...one('Frame and name', front), at: [0, 0, 1] },
    ],
    notes,
  };
}

/* ---------------------------------------------------------------- standing things */

function stake(ctx: Ctx, x: number, top: number, w: number, len: number): CrossSection {
  const tip = w * 1.2;
  return ctx.cs([[x - w / 2, top, x - w / 2, top - len + tip, x, top - len, x + w / 2, top - len + tip, x + w / 2, top]]);
}

async function cakeTopper(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const rows = lines(p.text).slice(0, 3);
  if (!rows.length) return (marginWarning(notes, 'text'), { pieces: [], notes });
  if (lines(p.text).length > 3) notes.push({ level: 'info', message: 'A cake topper takes three lines; the rest were left off.' });
  const ls: Lettering[] = [];
  for (const row of rows) {
    const l = await lettering(ctx, p.font, row, p.size, { spacing: p.spacing });
    if (l) ls.push(l);
  }
  // Lines stacked so each just overlaps the next once thickened, then welded into one.
  const w = Math.max(0.6, p.weight);
  const gap = -w;
  let y = 0;
  const stacked: CrossSection[] = [];
  ls.forEach((l, i) => {
    if (i > 0) y -= ls[i - 1]!.b.height / 2 + l.b.height / 2 + gap;
    stacked.push(l.cs.offset(w, 'Round', 2, 24).translate([0, y]));
  });
  let body = bridge(ctx, ctx.CrossSection.union(stacked), Math.max(2, p.thickness));
  const b = body.bounds();
  const n = Math.max(1, Math.min(2, Math.round(p.stakes)));
  const xs = n === 1 ? [(b.min[0] + b.max[0]) / 2] : [b.min[0] + (b.max[0] - b.min[0]) * 0.28, b.min[0] + (b.max[0] - b.min[0]) * 0.72];
  const sw = Math.max(5, p.thickness * 2);
  // A rail through the feet of the bottom line, which the stakes hang from.
  const last = ls[ls.length - 1]!;
  const railH = Math.max(3, p.thickness * 1.2);
  const railY = b.min[1] + last.b.height * 0.2;
  const x0 = Math.min(...xs) - sw;
  const x1 = Math.max(...xs) + sw;
  body = body.add(ctx.cs(translate([roundedRect(x1 - x0, railH, railH / 2)], (x0 + x1) / 2, railY)));
  for (const x of xs) body = body.add(stake(ctx, x, railY, sw, railY - b.min[1] + p.stakeLength));
  if (body.decompose().length > 1) body = bridge(ctx, body, Math.max(2, p.thickness));
  return { pieces: [one('Topper', body)], notes };
}

async function plantStake(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const l = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  if (!l) return (marginWarning(notes, 'text'), { pieces: [], notes });
  const name = l.cs.offset(Math.max(0.3, p.weight), 'Round', 2, 24);
  const b = name.bounds();
  // A bar under the letters' feet, and the stake from its middle.
  const barH = Math.max(4, p.thickness * 1.5);
  const barTop = b.min[1] + p.size * 0.22;
  const bar = ctx.cs(translate([roundedRect(b.max[0] - b.min[0], barH, barH / 2)], (b.min[0] + b.max[0]) / 2, barTop - barH / 2));
  const w = Math.max(10, p.thickness * 3);
  let body = name.add(bar).add(stake(ctx, (b.min[0] + b.max[0]) / 2, barTop - barH / 2, w, p.stakeLength));
  body = bridge(ctx, body, Math.max(2, p.thickness));
  const marks: Marks = noMarks();
  const sub = await lettering(ctx, p.font2, p.text2, Math.min(p.size2, w * 0.45));
  if (sub) {
    const x = (b.min[0] + b.max[0]) / 2;
    const lane = ctx.cs(translate([rect(w - 3, p.stakeLength * 0.7)], x, barTop - barH - p.stakeLength * 0.4));
    const turned = region(ctx, sub.cs.rotate(90));
    marks.engrave = fitInside(ctx, turned, lane, 0.95).cs;
  }
  return { pieces: [one('Stake', body, marks)], notes };
}

/* ---------------------------------------------------------------- sets */

async function placeCards(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const names = lines(p.text);
  if (!names.length) return (marginWarning(notes, 'names, one per line'), { pieces: [], notes });
  const W = p.cardWidth;
  const H = p.cardHeight;
  const pieces: PieceOut[] = [];
  for (let i = 0; i < names.length; i++) {
    const card = ctx.cs(translate([roundedRect(W, 2 * H, 2)], 0, 0));
    const marks: Marks = { cut: null, engrave: null, score: [[-W / 2, 0, W / 2, 0]] };
    const l = await lettering(ctx, p.font, names[i]!, p.size, { spacing: p.spacing });
    if (l) {
      // The front is the lower half, reading upright with the fold at the top.
      const face = fit(ctx, l, W - 2 * p.margin, H * 0.6);
      const front = face.cs.translate([-face.b.cx, -H / 2 - face.b.cy]);
      const m = marksFor(ctx, p.bothSides ? front.add(front.rotate(180)) : front, p.op === 'cut' ? 'engrave' : p.op);
      marks.engrave = m.engrave;
      marks.score.push(...m.score);
    }
    pieces.push({ ...one(names[i]!, card, marks), at: [i * (W + 8), 0, 0] });
  }
  notes.push({ level: 'info', message: 'Score the fold lightly (low power) so the card bends there without breaking.' });
  return { pieces, notes };
}

async function luggageTag(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const names = lines(p.text);
  if (!names.length) names.push('');
  const W = p.tagWidth;
  const H = p.tagHeight;
  const slotW = Math.max(4, H * 0.09);
  const slotH = Math.min(H * 0.55, 26);
  const slotX = -W / 2 + Math.max(8, slotW * 2);
  const pieces: PieceOut[] = [];
  const details = await lettering(ctx, p.font2, p.text2, p.size2, { align: 'left', lineHeight: 1.25 });
  for (let i = 0; i < names.length; i++) {
    const body = ctx.cs([roundedRect(W, H, Math.min(8, H / 5))]).subtract(ctx.cs(translate([roundedRect(slotW, slotH, slotW / 2)], slotX, 0)));
    const left = slotX + slotW / 2 + p.margin;
    const room = W / 2 - p.margin - left;
    const parts: CrossSection[] = [];
    const name = names[i] ? await lettering(ctx, p.font, names[i]!, p.size, { spacing: p.spacing, align: 'left' }) : null;
    let y = H / 2 - p.margin;
    if (name) {
      const f = fit(ctx, name, room, H * 0.4);
      parts.push(f.cs.translate([left - f.b.minX, y - f.b.maxY]));
      y -= f.b.height + p.size2 * 0.8;
    }
    if (details) {
      const f = fit(ctx, details, room, Math.max(1, y - (-H / 2 + p.margin)));
      parts.push(f.cs.translate([left - f.b.minX, y - f.b.maxY]));
    }
    const marks = parts.length ? marksFor(ctx, ctx.CrossSection.union(parts), p.op === 'cut' ? 'engrave' : p.op) : noMarks();
    pieces.push({ ...one(names[i] || 'Tag', body, marks), at: [0, -i * (H + 8), 0] });
  }
  return { pieces, notes };
}

async function qrTag(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const W = p.tagWidth;
  const q = W - 2 * p.margin;
  const line1 = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  const line2 = await lettering(ctx, p.font2, p.text2, p.size2);
  const textH = (line1 ? line1.b.height + p.size * 0.6 : 0) + (line2 ? line2.b.height + p.size2 * 0.6 : 0);
  const H = W + textH;
  const body0 = ctx.cs(translate([roundedRect(W, H, Math.min(6, W / 8))], 0, -textH / 2));
  const r = ring(ctx, body0, p.ring, 'top', p.holeDiameter, p.ringWall);
  const marks: Marks = noMarks();
  const code = qrRegion(ctx, p.qrData, q - 2, p.ecc);
  const engr: CrossSection[] = [];
  if (code) {
    engr.push(code.cs.translate([0, W / 2 - p.margin - q / 2]));
    const cell = (q - 2) / code.modules;
    if (cell < 0.8) notes.push({ level: 'warning', message: `Each square of the code is ${cell.toFixed(2)} mm: too small to scan reliably. Make the tag larger or the text shorter.` });
  } else notes.push({ level: 'warning', message: 'Type a link or text for the code.' });
  let y = -W / 2;
  for (const [l, gap] of [
    [line1, p.size * 0.6],
    [line2, p.size2 * 0.6],
  ] as const) {
    if (!l) continue;
    const f = fit(ctx, l, W - 2 * p.margin, 100);
    y -= gap * 0.5;
    engr.push(f.cs.translate([-f.b.cx, y - f.b.maxY]));
    y -= f.b.height + gap * 0.5;
  }
  if (engr.length) marks.engrave = ctx.CrossSection.union(engr);
  notes.push({ level: 'info', message: 'Engrave the code dark on a light sheet, and test that it scans before cutting a batch.' });
  return { pieces: [one('Tag', r.body, marks)], notes };
}

/* ---------------------------------------------------------------- jigsaw */

/** A knob along a unit edge: x from 0 to 1, the knob rising to `h` on +y. */
function knob(h: number): number[] {
  const ctrl: [number, number][] = [
    [0, 0],
    [0.36, 0],
    [0.4, 0.12],
    [0.34, 0.5],
    [0.38, 0.85],
    [0.5, 1],
    [0.62, 0.85],
    [0.66, 0.5],
    [0.6, 0.12],
    [0.64, 0],
    [1, 0],
  ];
  // Catmull-Rom through the control points.
  const out: number[] = [];
  const P = (i: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))]!;
  for (let i = 0; i < ctrl.length - 1; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const steps = i === 0 || i === ctrl.length - 2 ? 1 : 8;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]) * h);
    }
  }
  out.push(1, 0);
  return out;
}

/** A small seeded random, so a puzzle's knobs stay put between builds. */
function rng(seed: number): () => number {
  let s = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export function jigsawLines(W: number, H: number, cols: number, rows: number, tab: number, seed: number): Contour[] {
  const rand = rng(seed);
  const cw = W / cols;
  const rh = H / rows;
  const edge = (x0: number, y0: number, x1: number, y1: number, len: number): number[] => {
    const flip = rand() < 0.5 ? 1 : -1;
    const k = knob((tab / 100) * flip);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const out: number[] = [];
    for (let i = 0; i < k.length; i += 2) {
      const u = k[i]!;
      const v = k[i + 1]! * len;
      out.push(x0 + dx * u - (dy / len) * v, y0 + dy * u + (dx / len) * v);
    }
    return out;
  };
  const out: Contour[] = [];
  for (let c = 1; c < cols; c++) {
    const x = -W / 2 + c * cw;
    const run: number[] = [];
    for (let r = 0; r < rows; r++) {
      const seg = edge(x, -H / 2 + r * rh, x, -H / 2 + (r + 1) * rh, rh);
      run.push(...(run.length ? seg.slice(2) : seg));
    }
    out.push(run);
  }
  for (let r = 1; r < rows; r++) {
    const y = -H / 2 + r * rh;
    const run: number[] = [];
    for (let c = 0; c < cols; c++) {
      const seg = edge(-W / 2 + c * cw, y, -W / 2 + (c + 1) * cw, y, cw);
      run.push(...(run.length ? seg.slice(2) : seg));
    }
    out.push(run);
  }
  return out;
}

async function jigsaw(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const W = p.puzzleWidth;
  const H = p.puzzleHeight;
  const shape = ['rectangle', 'heart', 'circle', 'oval', 'rounded-square'].includes(p.shape) ? p.shape : 'rectangle';
  const body = shape === 'rectangle' ? ctx.cs([roundedRect(W, H, 1)]) : blank(ctx, shape, W, H);
  const cols = Math.max(2, Math.round(p.cols));
  const rows = Math.max(2, Math.round(p.rows));
  const cut = clipPolylines(jigsawLines(W, H, cols, rows, p.tabSize, p.seed), ctx.contours(body));
  const marks = marksFor(ctx, (await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing }))?.cs ?? null, p.op === 'cut' ? 'engrave' : p.op);
  const minPiece = Math.min(W / cols, H / rows);
  if (minPiece < 12) notes.push({ level: 'warning', message: `Pieces are ${minPiece.toFixed(0)} mm across: small enough to be fiddly and fragile. Use fewer pieces or a bigger puzzle.` });
  return { pieces: [{ ...one('Puzzle', body, marks), cutLines: cut }], notes };
}

export const DESIGNS: Record<DesignId, (ctx: Ctx, p: P) => Promise<DesignOut>> = {
  'name-keychain': nameKeychain,
  'layered-keychain': layeredKeychain,
  'connected-text': connectedText,
  'symbol-charm': symbolCharm,
  'name-tag': nameTag,
  'pet-tag': petTag,
  'pattern-fill': patternFill,
  'arc-coaster': arcCoaster,
  'framed-ornament': framedOrnament,
  'cake-topper': cakeTopper,
  'plant-stake': plantStake,
  'place-cards': placeCards,
  'luggage-tag': luggageTag,
  'qr-tag': qrTag,
  jigsaw,
};

