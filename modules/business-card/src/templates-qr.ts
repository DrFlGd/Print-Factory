/** The designs built round a code or a tag: Corner QR, NFC and Scan back. */
import type { ContactKind } from './kit';
import { box, boxH, boxW, DETAIL_FLOOR, GUTTER, Group, line, setIn, tapMark } from './kit';
import { moduleSize, QUIET } from './qr';
import { plan } from './templates-clean';
import type { Template } from './tpl';
import { face } from './tpl';
import type { Face } from './types';

/** The NFC tags a pocket is made for: diameter and thickness, mm. */
export const NFC_TAGS = {
  '25': { dia: 25, depth: 0.4, label: '25 mm sticker' },
  '30': { dia: 30, depth: 0.4, label: '30 mm sticker' },
  '25c': { dia: 25, depth: 1.0, label: '25 mm coin' },
} as const;
export const TAG_CLEARANCE = 0.3;

export const cornerQr: Template = {
  id: 'corner-qr',
  name: 'Corner QR',
  group: 'qr',
  async build(c) {
    const { ctx } = c;
    const f = face();
    if (c.qrData) c.qrOn = 'front';
    const m = moduleSize(c.p);
    const edge = Math.max(1.2, 4 - QUIET * m);
    const want = c.qrOn ? c.qrSide * (c.p.qrSize === 'large' ? 1.35 : 1) : 16;
    const S = Math.min(want, c.h - 2 * edge - 6);
    const qx = c.w / 2 - edge - S / 2;
    const qy = -c.h / 2 + edge + S / 2;
    const contacts = await c.contacts();
    const hc = contacts.size(1).h;
    // The contact lines across the top, beside the code where they cannot pass over it.
    const over = c.T - hc - GUTTER >= qy + S / 2;
    const fc = setIn(ctx, contacts, box(c.L, c.T - hc, over ? c.R : qx - S / 2 - GUTTER, c.T), 'left', 'top', c.notes, 'longest contact line');
    f.ink.push(...fc.pieces);
    const name = await c.name({ company: false });
    const nb = box(c.L, -c.h / 2 + edge + (c.qrOn ? QUIET * m : 0), qx - S / 2 - GUTTER, fc.used.y0 - GUTTER);
    f.ink.push(...setIn(ctx, name, nb, 'left', 'bottom', c.notes, 'name or title').pieces);
    if (c.qrOn) {
      f.ink.push(...(await c.qrAt(qx, qy, S, 'card', 'the corner')).pieces);
      if (c.logoOn === 'front' && !c.p.twoSided) {
        const room = fc.used.y0 - GUTTER - (qy + S / 2) - 1;
        const s = Math.min(12, room);
        if (s >= 6) f.ink.push(...(await c.markAt(qx, qy + S / 2 + 1 + s / 2, s, 'accent')));
      }
    } else if (c.p.logoMode !== 'none') f.ink.push(...(await c.markAt(qx, qy, S * 0.8, 'accent')));
    let b: Face | null = null;
    if (c.p.twoSided) b = await c.standardBack(face(), c.inner, 'card', { noMark: false });
    return plan(c, f, b);
  },
};

export const tap: Template = {
  id: 'tap',
  name: 'NFC',
  group: 'qr',
  nfc: true,
  async build(c) {
    const { ctx, p } = c;
    const f = face();
    const tag = NFC_TAGS[p.nfcTag] ?? NFC_TAGS['25'];
    const r = tag.dia / 2 + TAG_CLEARANCE;
    const ts = 15;
    const mx = Math.min(c.R - ts / 2, c.w / 2 - r - 2.5);
    const my = 0;
    f.ink.push({ cs: tapMark(ctx, ts).translate([mx, my]), colour: 'accent', role: 'tap' });
    const col = box(c.L, c.B, mx - ts / 2 - GUTTER - 1, c.T);
    f.ink.push(...c.spread(await c.name({ company: true }), await c.contacts(), col).pieces);
    if (c.logoOn === 'front') {
      const s = Math.min(10, c.T - (my + ts / 2) - 1.5);
      if (s >= 6) f.ink.push(...(await c.markAt(mx, my + ts / 2 + 1.5 + s / 2, s, 'ink')));
      else c.noRoom('logo');
    }
    if (c.qrOn === 'front') c.noRoom('QR code');
    let b: Face | null = null;
    if (p.twoSided) b = await c.standardBack(face());
    return plan(c, f, b, { pocket: { x: mx, y: my, r } });
  },
};

/** What the back's label says beside the big code. */
function scanWords(kind: 'website' | 'contact' | 'link'): string[] {
  return kind === 'website' ? ['Scan to visit', 'my website'] : kind === 'contact' ? ['Scan to save', 'my contact'] : ['Scan me'];
}

export const scanBack: Template = {
  id: 'scan-back',
  name: 'Scan back',
  group: 'qr',
  async build(c) {
    const { ctx, p } = c;
    const f = face();
    const big = p.twoSided && !!c.qrData;
    if (big) c.qrOn = 'back';
    // The front: the name large, the title and the company, and one contact line at the foot
    // (the one the code does not already carry); with no code on the back, every line.
    let only: ContactKind[] | undefined;
    if (big) {
      const has = (k: ContactKind) => (k === 'phone' ? p.phone : k === 'email' ? p.email : p.website).trim().length > 0;
      const pick = (['email', 'phone', 'website'] as ContactKind[]).filter((k) => has(k) && !(k === 'website' && p.qrKind === 'website'));
      only = pick.length ? [pick[0]!] : [];
    }
    const contacts = await c.contacts({ only });
    const qrS = c.qrOn === 'front' ? c.qrSide : 0;
    const right = c.R - (qrS ? qrS + GUTTER : 0);
    const fc = setIn(ctx, contacts, box(c.L, c.B, right, c.B + contacts.size(1).h), 'left', 'bottom', c.notes, 'longest contact line');
    f.ink.push(...fc.pieces);
    let name = await c.name({ company: true, scale: Math.min(1.35, 9 / p.nameSize), oneLine: true });
    const nb = box(c.L, fc.used.y1 + GUTTER, right, c.T);
    if (name.fit(boxW(nb), boxH(nb)).k < 0.8) name = await c.name({ company: true, scale: Math.min(1.35, 9 / p.nameSize) });
    f.ink.push(...setIn(ctx, name, nb, 'left', 'middle', c.notes, 'name or title').pieces);
    if (qrS) {
      f.ink.push(...(await c.qrAt(c.R - qrS / 2, c.B + qrS / 2, qrS, 'card', 'the front')).pieces);
      if (c.logoOn === 'front') {
        const s = Math.min(12, c.T - (c.B + qrS) - GUTTER);
        if (s >= 6) f.ink.push(...(await c.markAt(c.R - qrS / 2, c.T - s / 2, s, 'accent')));
      }
    } else if (c.logoOn === 'front' && !big) {
      f.ink.push(...(await c.markAt(c.R - 7, c.B + 7, 14, 'accent')));
    }
    let b: Face | null = null;
    if (p.twoSided) {
      b = face();
      if (big) {
        // The code as tall as the card, a label beside it, the mark over the label.
        const S = Math.min(c.h - 6, c.w * 0.62);
        const qx = -c.w / 2 + 3 + S / 2;
        b.ink.push(...(await c.qrAt(qx, 0, S, 'card', 'the back', true)).pieces);
        const col = box(qx + S / 2 + GUTTER, c.B, c.R, c.T);
        const words = new Group(await Promise.all(scanWords(p.qrKind).map((w, i) => line(ctx, p.detailFont, w, p.detailSize * 1.1, { floor: DETAIL_FLOOR, colour: 'ink', role: 'label', gap: i ? p.detailSize * 0.6 : 0, notes: c.notes }))));
        const wl = setIn(ctx, words, box(col.x0, col.y0, col.x1, col.y0 + words.size(1).h), 'left', 'bottom', c.notes, 'label');
        b.ink.push(...wl.pieces);
        if (c.logoOn === 'back') {
          const s2 = Math.min(16, boxW(col), c.T - wl.used.y1 - GUTTER);
          if (s2 >= 6) b.ink.push(...(await c.markAt(col.x0 + s2 / 2, c.T - s2 / 2, s2, 'accent')));
        }
      } else await c.standardBack(b);
    }
    return plan(c, f, b);
  },
};
