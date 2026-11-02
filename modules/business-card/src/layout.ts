/**
 * The card's content, ready for a template to place: the name's group, the contact lines,
 * the back's line, the mark and the QR code, and where the logo and the code go.
 */
import type { Diagnostic, RGB } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import type { Box, ContactKind } from './kit';
import { box, boxH, boxW, cased, contrast, DETAIL_FLOOR, GUTTER, Group, icon, lighter, line, mark, MARGIN, NAME_FLOOR, ruleLine, setIn } from './kit';
import type { Matrix } from './qr';
import { logoHole, matrix, moduleSize, payload, qrRegion, QUIET, squareOf, tile } from './qr';
import type { Colour, Ctx, Face, Params, Piece } from './types';
import { emptyFace } from './types';

export const CARD_SIZES: Record<string, [number, number]> = {
  '85x55': [85, 55],
  '89x51': [88.9, 50.8],
  '90x50': [90, 50],
  '91x55': [91, 55],
  '86x54': [85.6, 53.98],
};

export interface NameOptions {
  company?: boolean;
  rule?: boolean;
  colour?: Colour;
  ruleColour?: Colour;
  /** The name's size against the size asked. */
  scale?: number;
  /** Title and company on one line. */
  oneLine?: boolean;
}

export interface ContactOptions {
  icons?: boolean;
  colour?: Colour;
  only?: ContactKind[];
}

/** Everything a template needs, measured for this card. */
export class Card {
  readonly ctx: Ctx;
  readonly p: Params;
  readonly notes: Diagnostic[];
  w: number;
  h: number;
  /** Where the logo and the QR go: 'front', 'back', or nowhere. */
  logoOn: 'front' | 'back' | null;
  qrOn: 'front' | 'back' | null;
  qrData: string;
  private q: Matrix | null = null;

  constructor(ctx: Ctx, notes: Diagnostic[], portrait: boolean) {
    this.ctx = ctx;
    this.p = ctx.params;
    this.notes = notes;
    const p = this.p;
    let [w, h] = p.size === 'custom' ? [Math.max(50, p.cardWidth), Math.max(30, p.cardHeight)] : (CARD_SIZES[p.size] ?? CARD_SIZES['85x55']!);
    if (h > w) [w, h] = [h, w];
    [this.w, this.h] = portrait ? [h, w] : [w, h];
    const two = p.twoSided;
    this.logoOn = p.logoMode === 'none' ? null : two ? p.logoPlace : 'front';
    this.qrData = p.qr ? payload(p) : '';
    if (p.qr && !this.qrData) notes.push({ level: 'warning', message: p.qrKind === 'link' ? 'Type the link for the QR code to open.' : p.qrKind === 'website' ? 'Type a website for the QR code to open.' : 'Type a name, phone or email for the contact QR code.' });
    this.qrOn = this.qrData ? (two ? p.qrPlace : 'front') : null;
  }

  get L() {
    return -this.w / 2 + MARGIN;
  }
  get R() {
    return this.w / 2 - MARGIN;
  }
  get T() {
    return this.h / 2 - MARGIN;
  }
  get B() {
    return -this.h / 2 + MARGIN;
  }
  get inner(): Box {
    return box(this.L, this.B, this.R, this.T);
  }

  colourOf(c: Colour): RGB {
    return c === 'card' ? this.p.cardColor : c === 'ink' ? this.p.inkColor : this.p.accentColor;
  }

  /** The colour that reads best on `ground`, of `choices`. */
  readsOn(ground: Colour, choices: Colour[] = ['ink', 'card', 'accent']): Colour {
    const g = this.colourOf(ground);
    let best = choices.find((c) => c !== ground) ?? 'ink';
    for (const c of choices) if (c !== ground && contrast(this.colourOf(c), g) > contrast(this.colourOf(best), g) + 0.05) best = c;
    return best;
  }

  /** The name, the title and the company (when asked), as one group. */
  async name(o: NameOptions = {}): Promise<Group> {
    const p = this.p;
    const colour = o.colour ?? 'ink';
    const cap = p.nameSize * (o.scale ?? 1);
    const d = p.detailSize;
    const nm = await line(this.ctx, p.font, cased(p.name, p.nameCase), cap, { floor: NAME_FLOOR, colour, role: 'name', gap: 0, spacing: p.letterSpacing, notes: this.notes });
    // Under the name: room for its descenders, then the rule or the title.
    const below = cap * 0.3 + 1;
    const rule = o.rule && nm ? ruleLine(Math.min(14, cap * 2.2), 0.8, o.ruleColour ?? 'accent', below) : null;
    const gap = rule ? 1.8 : below;
    const company = o.company ? p.company : '';
    if (o.oneLine && p.title.trim() && company.trim()) {
      const both = await line(this.ctx, p.detailFont, `${p.title.trim()} · ${company.trim()}`, d * 1.05, { floor: DETAIL_FLOOR, colour, role: 'details', gap, notes: this.notes });
      return new Group([nm, rule, both]);
    }
    const title = await line(this.ctx, p.detailFont, p.title, d * 1.05, { floor: DETAIL_FLOOR, colour, role: 'details', gap, notes: this.notes });
    const comp = await line(this.ctx, p.detailFont, company, d, { floor: DETAIL_FLOOR, colour, role: 'details', gap: title ? d * 0.6 : gap, notes: this.notes });
    return new Group([nm, rule, title, comp]);
  }

  /** The contact lines, each with its icon. */
  async contacts(o: ContactOptions = {}): Promise<Group> {
    const p = this.p;
    const colour = o.colour ?? 'ink';
    const d = p.detailSize;
    const kinds: ContactKind[] = o.only ?? ['phone', 'email', 'website'];
    const lines = [];
    for (const k of kinds) {
      const value = k === 'phone' ? p.phone : k === 'email' ? p.email : p.website;
      const l = await line(this.ctx, p.detailFont, value, d, { floor: DETAIL_FLOOR, colour, role: 'details', gap: d * 0.85, notes: this.notes });
      if (!l) continue;
      if (o.icons !== false) {
        const ic = await icon(this.ctx, k, d, p.iconStyle);
        if (ic) l.icon = { ...ic, colour: p.iconStyle === 'circle' || p.iconStyle === 'square' ? 'accent' : colour };
      }
      lines.push(l);
    }
    return new Group(lines);
  }

  /** The back's line under the mark: the company, the name, or nothing. */
  async backLine(colour: Colour = 'ink'): Promise<Group> {
    const p = this.p;
    const v = p.backText === 'company' ? p.company : p.backText === 'name' ? cased(p.name, p.nameCase) : '';
    const l = await line(this.ctx, p.backText === 'name' ? p.font : p.detailFont, v, p.detailSize * 1.25, { floor: DETAIL_FLOOR, colour, role: 'label', gap: 0, spacing: p.letterSpacing, notes: this.notes });
    return new Group([l]);
  }

  /** The mark, `size` square, centred on (x, y). */
  async markAt(x: number, y: number, size: number, colour: Colour, onField = false): Promise<Piece[]> {
    const m = await mark(this.ctx, size);
    return m ? [{ cs: m.translate([x, y]), colour, role: 'mark', onField }] : [];
  }

  /** The code's matrix, made once. */
  get matrix(): Matrix | null {
    if (!this.qrData) return null;
    if (!this.q) this.q = matrix(this.qrData, this.p.qrLogo && this.p.logoMode !== 'none');
    return this.q;
  }

  /** The side of the code's square (quiet zone included) at the size asked, mm. */
  get qrSide(): number {
    const q = this.matrix;
    return q ? squareOf(q.n, moduleSize(this.p)) : 0;
  }

  /**
   * The code centred on (x, y), its square `side` across at most (it is never made smaller than
   * its module allows: too big for the room, it says so). Modules dark on light: on a dark ground
   * a light tile is printed with the modules left open.
   */
  async qrAt(x: number, y: number, side: number, ground: Colour, where: string, fill = false): Promise<{ pieces: Piece[]; side: number }> {
    const q = this.matrix;
    if (!q) return { pieces: [], side: 0 };
    const p = this.p;
    const m0 = moduleSize(p);
    const need = squareOf(q.n, m0);
    let m = m0;
    if (side < need - 0.05) this.notes.push({ level: 'warning', message: `The QR code needs ${need.toFixed(0)} mm and ${where} leaves ${side.toFixed(0)} mm: put it on the ${where.includes('back') ? 'front' : 'back'}, choose a shorter link, or a website code instead of a contact.` });
    else if (fill) m = side / (q.n + 2 * QUIET);
    else if (p.qrSize === 'large') m = Math.min(side / (q.n + 2 * QUIET), m0 * 1.6);
    const S = squareOf(q.n, m);
    const withLogo = p.qrLogo && p.logoMode !== 'none';
    const hole = withLogo ? logoHole(q.n) : 0;
    let modules = qrRegion(this.ctx, q, m, p.qrStyle, hole);
    const choices: Colour[] = ['ink', 'card', 'accent'];
    const ink = this.readsOn(ground, choices);
    const pieces: Piece[] = [];
    const light = lighter(this.colourOf(ink), this.colourOf(ground));
    if (contrast(this.colourOf(ink), this.colourOf(ground)) < 3) this.notes.push({ level: 'warning', message: 'The QR code’s colours are too close for a phone to read it reliably; pick colours further apart.' });
    if (light) {
      // A light tile with the modules left open: phones read dark modules on a light ground.
      modules = tile(this.ctx, S).subtract(modules);
    }
    pieces.push({ cs: modules.translate([x, y]), colour: ink, role: 'qr', onField: ground === 'accent' });
    if (hole) {
      const ms = await mark(this.ctx, hole * m * 0.78);
      if (ms) {
        // Light tile: the hole is in the tile's colour and the mark in the ground's.
        const c: Colour = light ? ground : ink;
        if (light || ground !== 'card') pieces.push({ cs: ms.translate([x, y]), colour: c, role: 'logo', onField: ground === 'accent' });
        else pieces.push({ cs: ms.translate([x, y]), colour: ink, role: 'logo' });
      }
    }
    return { pieces, side: S };
  }

  /** A note for a design that has no room for the code (or the logo) on the front. */
  noRoom(what: 'QR code' | 'logo') {
    this.notes.push({ level: 'warning', message: `This design has no room for the ${what} on the front: tick Print the back too, or turn the ${what} off.` });
  }

  /** The name group at the top of `b` and the contacts at its foot, both fitted. */
  spread(top: Group, foot: Group, b: Box, align: 'left' | 'center' | 'right' = 'left', gap = GUTTER): { pieces: Piece[]; top: Box; foot: Box } {
    const hT = top.size(1).h;
    const hF = foot.size(1).h;
    const room = boxH(b) - (top.empty || foot.empty ? 0 : gap);
    const k = Math.min(1, room / Math.max(hT + hF, 1e-6));
    const tB = box(b.x0, b.y1 - hT * k, b.x1, b.y1);
    const fB = box(b.x0, b.y0, b.x1, b.y0 + hF * k);
    const a = setIn(this.ctx, top, tB, align, 'top', this.notes, 'name or title');
    const f = setIn(this.ctx, foot, fB, align, 'bottom', this.notes, 'longest contact line');
    return { pieces: [...a.pieces, ...f.pieces], top: a.used, foot: f.used };
  }

  /** The name group over the contacts, as one block in the middle of `b`. */
  stack(top: Group, foot: Group, b: Box, align: 'left' | 'center' | 'right' = 'left', gap = GUTTER + 1, v: 'top' | 'middle' | 'bottom' = 'middle'): { pieces: Piece[]; top: Box; foot: Box } {
    const hT = top.size(1).h;
    const hF = foot.size(1).h;
    const g = top.empty || foot.empty ? 0 : gap;
    const total = hT + hF + g;
    const k = Math.min(1, (boxH(b) - g) / Math.max(hT + hF, 1e-6));
    const H = (hT + hF) * Math.min(1, k) + g;
    const y1 = v === 'top' ? b.y1 : v === 'bottom' ? b.y0 + H : (b.y0 + b.y1) / 2 + H / 2 + Math.min(1.5, (boxH(b) - H) * 0.1);
    void total;
    const tB = box(b.x0, y1 - hT * k, b.x1, Math.min(b.y1, y1));
    const fB = box(b.x0, Math.max(b.y0, y1 - H), b.x1, y1 - hT * k - g);
    const a = setIn(this.ctx, top, tB, align, 'top', this.notes, 'name or title');
    const f = setIn(this.ctx, foot, fB, align, 'top', this.notes, 'longest contact line');
    return { pieces: [...a.pieces, ...f.pieces], top: a.used, foot: f.used };
  }

  /**
   * The usual back: the mark over the back's line, and the code beside them when it is on the
   * back. `area` is what the back leaves free, `ground` the colour under it.
   */
  async standardBack(face: Face, area: Box = this.inner, ground: Colour = 'card', o: { markColour?: Colour; qrLeft?: boolean; noMark?: boolean; vertical?: boolean } = {}): Promise<Face> {
    const onField = ground === 'accent';
    const ink = o.markColour ?? (ground === 'card' ? 'accent' : this.readsOn(ground));
    const text = ground === 'card' ? 'ink' : this.readsOn(ground);
    const label = await this.backLine(text);
    for (const pc of label.lines) pc.onField = onField;
    let a = area;
    if (this.qrOn === 'back') {
      const want = this.qrSide * (this.p.qrSize === 'large' ? 1.35 : 1);
      // Beside the code the line needs its width at the smallest size that prints, and the mark some room.
      const besideW = boxW(area) - Math.min(want, boxH(area)) - GUTTER;
      const needW = Math.max(label.empty ? 0 : label.size(label.kMin).w, this.logoOn === 'back' && !o.noMark ? 10 : 0);
      const lhMin = label.empty ? 0 : label.size(label.kMin).h;
      const vertical = o.vertical || (besideW < needW && boxH(area) >= Math.min(want, boxW(area)) + GUTTER + lhMin);
      if (vertical) {
        const S = Math.min(want, boxW(a), boxH(a));
        const qr = await this.qrAt((a.x0 + a.x1) / 2, a.y0 + S / 2, S, ground, 'the back');
        face.ink.push(...qr.pieces);
        a = box(a.x0, a.y0 + qr.side + GUTTER, a.x1, a.y1);
      } else {
        const S = Math.min(want, boxH(a), boxW(a));
        const cx = o.qrLeft ? a.x0 + S / 2 : a.x1 - S / 2;
        const qr = await this.qrAt(cx, (a.y0 + a.y1) / 2, S, ground, 'the back');
        face.ink.push(...qr.pieces);
        a = o.qrLeft ? box(a.x0 + qr.side + GUTTER, a.y0, a.x1, a.y1) : box(a.x0, a.y0, a.x1 - qr.side - GUTTER, a.y1);
      }
    }
    const hasMark = this.logoOn === 'back' && !o.noMark;
    const lh = label.empty || boxW(a) < 10 ? 0 : Math.min(label.size(1).h, boxH(a) * 0.4);
    const mSize = Math.min(boxW(a) * 0.7, (boxH(a) - (lh ? lh + GUTTER : 0)) * 0.85, 22);
    const total = (hasMark && mSize > 4 ? mSize + (lh ? GUTTER : 0) : 0) + lh;
    let y = (a.y0 + a.y1) / 2 + total / 2;
    const cx = (a.x0 + a.x1) / 2;
    if (hasMark && mSize > 4) {
      face.ink.push(...(await this.markAt(cx, y - mSize / 2, mSize, ink, onField)));
      y -= mSize + GUTTER;
    }
    if (lh) face.ink.push(...setIn(this.ctx, label, box(a.x0, Math.max(a.y0, y - lh - 0.01), a.x1, y), 'center', 'top', this.notes, 'back’s line').pieces);
    return face;
  }
}

export const newFace = emptyFace;
export type { CrossSection };
