/**
 * Business cards: five layouts of one card, each giving part of it to a pattern and the rest to
 * the lettering. A solid border runs round every card so every strut of a lattice lands on wood.
 *
 *   band        the pattern down one side, the lettering in the column beside it
 *   half        a burst opening from one edge (a dahlia by default), the lettering in the rest
 *   framed      the pattern all round a solid centre panel that carries the lettering
 *   tall        portrait: the pattern round a name band and a details panel
 *   logo tile   the pattern down one side with a solid tile let into it, carrying the logo
 *
 * The lettering is one block: the name, the title (the details' first line, a little larger)
 * and the details under it, fitted to its slot by one factor so the hierarchy holds. One card is
 * cut per name.
 */
import type { Diagnostic } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { circle, rect, roundedRect } from '@pf/shapes';
import type { DesignOut, P, PieceOut } from './kit';
import { centred, lines, marksFor, union } from './kit';
import type { Ctx, Lettering, Marks } from './lib';
import { fit, lettering, patternIn, region, symbolRegion } from './lib';
import type { Box } from './stands';
import { boxH, boxW } from './stands';

const BORDER = 4;
const GUTTER = 3;
/** The smallest capital a detail line keeps. */
const FLOOR = 2.5;

export const CARD_SIZES: Record<string, [number, number]> = { us: [88.9, 50.8], eu: [85, 55] };

function cardSize(p: P): [number, number] {
  return p.cardSize === 'custom' ? [Math.max(40, p.cardWidth), Math.max(25, p.cardHeight)] : (CARD_SIZES[p.cardSize] ?? CARD_SIZES.us!);
}

export function mergeMarks(...ms: Marks[]): Marks {
  const cut = ms.map((m) => m.cut).filter((c): c is CrossSection => !!c && !c.isEmpty());
  const engrave = ms.map((m) => m.engrave).filter((c): c is CrossSection => !!c && !c.isEmpty());
  return {
    cut: cut.length ? cut.reduce((a, b) => a.add(b)) : null,
    engrave: engrave.length ? engrave.reduce((a, b) => a.add(b)) : null,
    score: ms.flatMap((m) => m.score),
  };
}

interface Block {
  /** The name, and the title under it. */
  head: Lettering | null;
  /** The detail lines. */
  details: Lettering | null;
}

async function blockOf(ctx: Ctx, p: P, name: string, align: 'left' | 'center'): Promise<Block> {
  const ls = lines(p.text2);
  const nameL = await lettering(ctx, p.font, name, p.size, { spacing: p.spacing, align });
  const title = ls[0] ? await lettering(ctx, p.font2, ls[0], Math.max(FLOOR, p.size2 * 1.2), { align }) : null;
  const details = ls.length > 1 ? await lettering(ctx, p.font2, ls.slice(1).join('\n'), p.size2, { align, lineHeight: 1.35 }) : null;
  // Name over title, with a small gap.
  const parts: CrossSection[] = [];
  let head: Lettering | null = null;
  if (nameL || title) {
    const gap = p.size * 0.35;
    const x = (l: Lettering) => (align === 'left' ? -l.b.minX : -l.b.cx);
    if (nameL) parts.push(nameL.cs.translate([x(nameL), -nameL.b.maxY]));
    if (title) parts.push(title.cs.translate([x(title), -(nameL ? nameL.b.height + gap : 0) - title.b.maxY]));
    head = region(ctx, ctx.CrossSection.union(parts));
  }
  return { head, details };
}

/** The block laid out in `box` (or in two boxes: the head in one, the details in another), by one factor. */
function placeBlock(ctx: Ctx, p: P, b: Block, box: Box, align: 'left' | 'center', notes: Diagnostic[], detailBox?: Box): CrossSection | null {
  const gap = 2.5;
  const out: CrossSection[] = [];
  const put = (l: Lettering, k: number, bx: Box, top: number) => {
    const x = align === 'left' ? bx.x0 - l.b.minX * k : (bx.x0 + bx.x1) / 2 - l.b.cx * k;
    out.push(l.cs.scale([k, k]).translate([x, top - l.b.maxY * k]));
  };
  const scaleFor = (ls: Lettering[], bx: Box, gaps: number) => {
    const h = ls.reduce((s, l) => s + l.b.height, 0);
    const w = Math.max(...ls.map((l) => l.b.width));
    return Math.min(1, boxW(bx) / w, (boxH(bx) - gaps) / Math.max(h, 1e-6));
  };
  const ls = [b.head, b.details].filter((l): l is Lettering => !!l);
  if (!ls.length) return null;
  let k: number;
  if (detailBox) {
    // Two slots: each part fits its own, the name never larger than typed.
    const kh = b.head ? scaleFor([b.head], box, 0) : 1;
    k = b.details ? scaleFor([b.details], detailBox, 0) : 1;
    if (b.head) put(b.head, kh, box, (box.y0 + box.y1) / 2 + (b.head.b.height * kh) / 2);
    if (b.details) put(b.details, k, detailBox, (detailBox.y0 + detailBox.y1) / 2 + (b.details.b.height * k) / 2);
  } else {
    k = scaleFor(ls, box, ls.length > 1 ? gap : 0);
    const total = ls.reduce((s, l) => s + l.b.height * k, 0) + (ls.length > 1 ? gap : 0);
    let top = (box.y0 + box.y1) / 2 + total / 2;
    for (const l of ls) {
      put(l, k, box, top);
      top -= l.b.height * k + gap;
    }
  }
  const tiny = b.details && p.size2 * k < FLOOR * 0.8;
  if (tiny) notes.push({ level: 'warning', message: `The details come out ${(p.size2 * k).toFixed(1)} mm tall to fit the card. Shorten them or give the lettering more room.` });
  else if (k < 0.97) notes.push({ level: 'info', message: 'The lettering was made smaller to fit the card.' });
  return union(ctx, out);
}

const card = (ctx: Ctx, W: number, H: number) => ctx.cs([roundedRect(W, H, 3)]);
const inner = (ctx: Ctx, W: number, H: number) => card(ctx, W, H).offset(-BORDER, 'Round', 2, 24);
const rectAt = (ctx: Ctx, x0: number, x1: number, y0: number, y1: number) => ctx.cs([rect(x1 - x0, y1 - y0)]).translate([(x0 + x1) / 2, (y0 + y1) / 2]);
const pat = (ctx: Ctx, p: P, area: CrossSection, origin?: [number, number]) => patternIn(ctx, area, p.pattern, p.patternSize, p.patternAngle, p.patternOp, p.web, origin);

async function logoOf(ctx: Ctx, p: P, size: number): Promise<Lettering | null> {
  if (!p.logo) return null;
  const s = await symbolRegion(ctx, p.symbol, size);
  return s ? region(ctx, s) : null;
}

type Layout = (ctx: Ctx, p: P, name: string, notes: Diagnostic[]) => Promise<{ W: number; H: number; body: CrossSection; marks: Marks }>;

/** A run of cards, one per name. */
function cards(layout: Layout) {
  return async (ctx: Ctx, p: P): Promise<DesignOut> => {
    const notes: Diagnostic[] = [];
    const names = lines(p.text);
    const run = names.length ? names : [''];
    const pieces: PieceOut[] = [];
    let i = 0;
    for (const name of run) {
      const c = await layout(ctx, p, name, i ? [] : notes);
      pieces.push({ name: run.length > 1 ? `Card: ${name}` : 'Card', cut: c.body, marks: c.marks, at: [i * (c.W + 6), 0, 0], sheet: 0 });
      i++;
    }
    return { pieces, notes };
  };
}

const textOp = (p: P) => (p.op === 'cut' ? 'engrave' : p.op);

/** The lettering with a logo before it, when there is one. */
async function withLogo(ctx: Ctx, p: P, b: Block, box: Box, align: 'left' | 'center', notes: Diagnostic[]): Promise<CrossSection | null> {
  const logo = await logoOf(ctx, p, Math.min(boxH(box) * 0.6, boxW(box) * 0.3));
  if (!logo) return placeBlock(ctx, p, b, box, align, notes);
  const lw = Math.min(logo.b.width, boxW(box) * 0.3);
  const lf = fit(ctx, logo, lw, boxH(box) * 0.7);
  const rest: Box = { ...box, x0: box.x0 + lf.b.width + GUTTER };
  return union(ctx, [centred(lf, box.x0 + lf.b.width / 2, (box.y0 + box.y1) / 2), placeBlock(ctx, p, b, rest, 'left', notes)]);
}

const band: Layout = async (ctx, p, name, notes) => {
  const [W, H] = cardSize(p);
  const left = p.patternSide !== 'right';
  const bw = (W * Math.max(15, Math.min(60, p.patternShare))) / 100;
  const edge = left ? -W / 2 : W / 2;
  const xV = edge + (left ? bw : -bw);
  const area = inner(ctx, W, H).intersect(left ? rectAt(ctx, -W, xV, -H, H) : rectAt(ctx, xV, W, -H, H));
  const box: Box = left ? { x0: xV + GUTTER, x1: W / 2 - BORDER - 1, y0: -H / 2 + BORDER + 1, y1: H / 2 - BORDER - 1 } : { x0: -W / 2 + BORDER + 1, x1: xV - GUTTER, y0: -H / 2 + BORDER + 1, y1: H / 2 - BORDER - 1 };
  const ink = await withLogo(ctx, p, await blockOf(ctx, p, name, 'left'), box, 'left', notes);
  return { W, H, body: card(ctx, W, H), marks: mergeMarks(pat(ctx, p, area), marksFor(ctx, ink, textOp(p))) };
};

const half: Layout = async (ctx, p, name, notes) => {
  const [W, H] = cardSize(p);
  const right = p.patternSide !== 'left';
  const edgeX = right ? W / 2 : -W / 2;
  const r = (W * Math.max(20, Math.min(70, p.patternShare))) / 100;
  const disc = ctx.cs([circle(r, 160)]).translate([edgeX, 0]);
  const area = inner(ctx, W, H).intersect(disc);
  const box: Box = right ? { x0: -W / 2 + BORDER + 1, x1: edgeX - r - GUTTER, y0: -H / 2 + BORDER + 1, y1: H / 2 - BORDER - 1 } : { x0: edgeX + r + GUTTER, x1: W / 2 - BORDER - 1, y0: -H / 2 + BORDER + 1, y1: H / 2 - BORDER - 1 };
  const ink = await withLogo(ctx, p, await blockOf(ctx, p, name, 'left'), box, 'left', notes);
  return { W, H, body: card(ctx, W, H), marks: mergeMarks(pat(ctx, p, area, [edgeX, 0]), marksFor(ctx, ink, textOp(p))) };
};

const framed: Layout = async (ctx, p, name, notes) => {
  const [W, H] = cardSize(p);
  const s = Math.max(15, Math.min(60, p.patternShare)) / 100;
  const pw = W - 2 * Math.max(BORDER + 5, (s * W) / 2);
  const ph = H - 2 * Math.max(BORDER + 5, (s * H) / 2);
  const panel = ctx.cs([roundedRect(pw, ph, 3)]);
  const area = inner(ctx, W, H).subtract(panel);
  const box: Box = { x0: -pw / 2 + GUTTER, x1: pw / 2 - GUTTER, y0: -ph / 2 + GUTTER, y1: ph / 2 - GUTTER };
  const ink = await withLogo(ctx, p, await blockOf(ctx, p, name, p.logo ? 'left' : 'center'), box, p.logo ? 'left' : 'center', notes);
  return { W, H, body: card(ctx, W, H), marks: mergeMarks(pat(ctx, p, area), marksFor(ctx, ink, textOp(p))) };
};

const tall: Layout = async (ctx, p, name, notes) => {
  const [w0, h0] = cardSize(p);
  const W = Math.min(w0, h0);
  const H = Math.max(w0, h0);
  const top = H / 2 - BORDER;
  const strip = H * 0.13;
  const bandH = H * 0.25;
  const by1 = top - strip;
  const by0 = by1 - bandH;
  const band = rectAt(ctx, -W, W, by0, by1);
  const dw = W - 2 * (BORDER + 4);
  const dh = H * 0.27;
  const dy = -H / 2 + BORDER + 5 + dh / 2;
  const panel = ctx.cs([roundedRect(dw, dh, 3)]).translate([0, dy]);
  const area = inner(ctx, W, H).subtract(band).subtract(panel);
  const headBox: Box = { x0: -W / 2 + BORDER + 2, x1: W / 2 - BORDER - 2, y0: by0 + 2, y1: by1 - 2 };
  const detailBox: Box = { x0: -dw / 2 + GUTTER, x1: dw / 2 - GUTTER, y0: dy - dh / 2 + GUTTER, y1: dy + dh / 2 - GUTTER };
  const b = await blockOf(ctx, p, name, 'center');
  let ink: CrossSection | null;
  const logo = await logoOf(ctx, p, bandH * 0.7);
  if (logo) {
    const lf = fit(ctx, logo, W * 0.25, bandH * 0.7);
    const rest: Box = { ...headBox, x0: headBox.x0 + lf.b.width + GUTTER };
    ink = union(ctx, [centred(lf, headBox.x0 + lf.b.width / 2, (by0 + by1) / 2), placeBlock(ctx, p, b, rest, 'center', notes, detailBox)]);
  } else ink = placeBlock(ctx, p, b, headBox, 'center', notes, detailBox);
  return { W, H, body: card(ctx, W, H), marks: mergeMarks(pat(ctx, p, area), marksFor(ctx, ink, textOp(p))) };
};

const logoTile: Layout = async (ctx, p, name, notes) => {
  const [W, H] = cardSize(p);
  const left = p.patternSide !== 'right';
  const bw = (W * Math.max(20, Math.min(60, p.patternShare))) / 100;
  const edge = left ? -W / 2 : W / 2;
  const xV = edge + (left ? bw : -bw);
  const ts = Math.min((bw - BORDER) * 0.8, H * 0.55);
  const tx = xV + (left ? -ts / 2 : ts / 2);
  const tile = ctx.cs([roundedRect(ts, ts, 2.5)]).translate([tx, 0]);
  const area = inner(ctx, W, H)
    .intersect(left ? rectAt(ctx, -W, xV, -H, H) : rectAt(ctx, xV, W, -H, H))
    .subtract(tile);
  // The tile carries the logo, or the name's initials.
  let mark: Lettering | null = null;
  const sym = p.logo ? await symbolRegion(ctx, p.symbol, ts * 0.7) : null;
  if (sym) mark = region(ctx, sym);
  else {
    const initials = name
      .split(/\s+/)
      .map((w) => [...w][0] ?? '')
      .join('')
      .slice(0, 3)
      .toUpperCase();
    mark = initials ? await lettering(ctx, p.font, initials, ts * 0.5) : null;
  }
  const tileInk = mark ? centred(fit(ctx, mark, ts * 0.72, ts * 0.72), tx, 0) : null;
  const box: Box = left ? { x0: xV + GUTTER, x1: W / 2 - BORDER - 1, y0: -H / 2 + BORDER + 1, y1: H / 2 - BORDER - 1 } : { x0: -W / 2 + BORDER + 1, x1: xV - GUTTER, y0: -H / 2 + BORDER + 1, y1: H / 2 - BORDER - 1 };
  const ink = placeBlock(ctx, p, await blockOf(ctx, p, name, 'left'), box, 'left', notes);
  return { W, H, body: card(ctx, W, H), marks: mergeMarks(pat(ctx, p, area, [tx, 0]), marksFor(ctx, union(ctx, [ink, tileInk]), textOp(p))) };
};

export const CARD_DESIGNS: Record<string, (ctx: Ctx, p: P) => Promise<DesignOut>> = {
  'business-card': cards(band),
  'business-card-half': cards(half),
  'business-card-framed': cards(framed),
  'business-card-tall': cards(tall),
  'business-card-logo-tile': cards(logoTile),
};

