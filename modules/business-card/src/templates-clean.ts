/** The clean designs: Minimal, Split, Window and Monogram. */
import { roundedRect } from '@pf/shapes';
import { text as layoutText } from '@pf/text';
import type { Box } from './kit';
import { box, boxH, boxW, disc, GUTTER, initials, ringAt, setIn } from './kit';
import type { Card } from './layout';
import type { Template } from './tpl';
import { face, freeBox, fromBehind, poly } from './tpl';
import type { Face, Plan } from './types';

export const outlineOf = (c: Card) => c.ctx.cs([roundedRect(c.w, c.h, Math.max(0.01, Math.min(c.p.corner, c.h / 2 - 1)))]);

/** The front's logo and code in a corner column on the right, when they are on the front. */
export async function frontExtras(c: Card, f: Face, col: Box, ground: 'card' | 'accent' = 'card'): Promise<void> {
  const qrS = c.qrOn === 'front' ? Math.min(c.qrSide * (c.p.qrSize === 'large' ? 1.35 : 1), boxH(col), boxW(col)) : 0;
  if (qrS) {
    const q = await c.qrAt(col.x1 - qrS / 2, col.y0 + qrS / 2, qrS, ground, 'the front');
    f.ink.push(...q.pieces);
  }
  if (c.logoOn === 'front') {
    const room = boxH(col) - (qrS ? qrS + GUTTER : 0);
    const s = Math.min(14, room, boxW(col));
    if (s >= 6) f.ink.push(...(await c.markAt(col.x1 - s / 2, col.y1 - s / 2, s, ground === 'card' ? 'accent' : c.readsOn(ground), ground === 'accent')));
    else c.noRoom('logo');
  }
}

/** How wide the front's corner column is for what it holds. */
export function extrasWidth(c: Card): number {
  const q = c.qrOn === 'front' ? c.qrSide * (c.p.qrSize === 'large' ? 1.35 : 1) : 0;
  const m = c.logoOn === 'front' ? 14 : 0;
  return Math.max(q, m);
}

export function plan(c: Card, front: Face, back: Face | null, o: Partial<Plan> = {}): Plan {
  return { w: c.w, h: c.h, front, back: back ? fromBehind(back) : null, cutouts: null, reveal: false, pocket: null, ...o };
}

export const minimal: Template = {
  id: 'minimal',
  name: 'Minimal',
  group: 'clean',
  async build(c) {
    const f = face();
    const ew = extrasWidth(c);
    const col = box(c.L + 1, c.B, c.R - (ew ? ew + GUTTER : 0), c.T);
    const s = c.stack(await c.name({ rule: true, company: true }), await c.contacts(), col);
    f.ink.push(...s.pieces);
    if (ew) await frontExtras(c, f, box(c.R - ew, c.B, c.R, c.T));
    const b = c.p.twoSided ? await c.standardBack(face()) : null;
    return plan(c, f, b);
  },
};

export const split: Template = {
  id: 'split',
  name: 'Split',
  group: 'clean',
  async build(c) {
    const { ctx } = c;
    const f = face();
    const contacts = await c.contacts();
    const amp = 1.1;
    const hc = contacts.size(1).h;
    // The band takes the top; on a short card it gives up depth before the contact lines do.
    const yb = Math.max(c.h / 2 - c.h * 0.44, c.B + Math.min(hc, (c.T - c.B) * 0.5) + GUTTER + amp);
    const lam = c.w / 2.6;
    const pts: [number, number][] = [];
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const x = -c.w / 2 - 1 + ((c.w + 2) * i) / N;
      pts.push([x, yb + amp * Math.sin((2 * Math.PI * x) / lam)]);
    }
    pts.push([c.w / 2 + 1, c.h / 2 + 1], [-c.w / 2 - 1, c.h / 2 + 1]);
    f.fields = ctx.cs([poly(pts)]);
    const onBand = c.readsOn('accent', ['ink', 'card']);
    const ew = extrasWidth(c);
    const bandBox = box(c.L, yb + amp + GUTTER, c.R, c.T);
    let name = await c.name({ company: true, colour: onBand });
    if (name.fit(boxW(bandBox), boxH(bandBox)).k < 0.8) name = await c.name({ company: true, colour: onBand, oneLine: true });
    for (const l of name.lines) l.onField = true;
    // A logo with no code takes the foot corner beside the contacts; with the code there, it stands on the band.
    const logoOnBand = c.logoOn === 'front' && c.qrOn === 'front';
    const nameBox = logoOnBand ? box(bandBox.x0, bandBox.y0, bandBox.x1 - Math.min(14, boxH(bandBox)) - GUTTER, bandBox.y1) : bandBox;
    f.ink.push(...setIn(ctx, name, nameBox, 'left', 'middle', c.notes, 'name or title').pieces);
    const foot = box(c.L, c.B, c.R - (ew ? ew + GUTTER : 0), yb - amp - GUTTER);
    f.ink.push(...setIn(ctx, contacts, foot, 'left', 'middle', c.notes, 'longest contact line').pieces);
    if (c.qrOn === 'front') {
      const S = Math.min(c.qrSide, boxH(foot) + 1);
      f.ink.push(...(await c.qrAt(c.R - S / 2, c.B + S / 2, S, 'card', 'the front')).pieces);
    }
    if (c.logoOn === 'front') {
      if (logoOnBand) {
        const s = Math.min(14, boxH(bandBox));
        f.ink.push(...(await c.markAt(c.R - s / 2, (bandBox.y0 + bandBox.y1) / 2, s, onBand, true)));
      } else {
        const s = Math.min(14, boxH(foot));
        f.ink.push(...(await c.markAt(c.R - s / 2, (foot.y0 + foot.y1) / 2, s, 'accent')));
      }
    }
    let b: Face | null = null;
    if (c.p.twoSided) {
      b = face();
      b.fields = outlineOf(c).offset(1, 'Miter', 2, 0);
      await c.standardBack(b, c.inner, 'accent');
    }
    return plan(c, f, b);
  },
};

export const windowCard: Template = {
  id: 'window',
  name: 'Window',
  group: 'clean',
  async build(c) {
    const { ctx } = c;
    const f = face();
    const rw = c.h >= 54 ? 8.5 : 7.5;
    const ringR = rw + 1.3 + 0.6;
    const outer = ringR + 0.6;
    const cx = c.L + outer;
    const cy = c.T - outer;
    const hole = disc(ctx, cx, cy, rw);
    f.fields = ringAt(ctx, cx, cy, ringR, 1.2);
    const contacts = await c.contacts();
    const qrS = c.qrOn === 'front' ? c.qrSide : 0;
    const logoTop = c.logoOn === 'front' && !!qrS;
    const nameBox = box(cx + outer + GUTTER, cy - outer, c.R - (logoTop ? 12 + GUTTER : 0), c.T);
    let name = await c.name({ company: true });
    if (name.fit(boxW(nameBox), boxH(nameBox)).k < 0.85) name = await c.name({ company: true, oneLine: true });
    f.ink.push(...setIn(ctx, name, nameBox, 'left', 'middle', c.notes, 'name or title').pieces);
    const footR = c.R - (qrS ? qrS + GUTTER : c.logoOn === 'front' ? 12 + GUTTER : 0);
    const foot = box(c.L, c.B, footR, cy - outer - GUTTER);
    f.ink.push(...setIn(ctx, contacts, foot, 'left', 'middle', c.notes, 'longest contact line').pieces);
    if (qrS) {
      const S = Math.min(qrS, cy - outer - c.B + outer);
      f.ink.push(...(await c.qrAt(c.R - S / 2, c.B + S / 2, S, 'card', 'the front')).pieces);
    }
    if (c.logoOn === 'front') f.ink.push(...(await c.markAt(c.R - 6, logoTop ? c.T - 6 : c.B + 6, 12, 'accent')));
    let b: Face | null = null;
    if (c.p.twoSided) {
      b = face();
      // From behind, the window is on the right.
      b.fields = ringAt(ctx, -cx, cy, ringR, 1.2);
      const area = freeBox(ctx, disc(ctx, -cx, cy, outer), c.inner, GUTTER, 1.4);
      await c.standardBack(b, area);
    }
    return plan(c, f, b, { cutouts: hole });
  },
};

export const monogram: Template = {
  id: 'monogram',
  name: 'Monogram',
  group: 'clean',
  async build(c) {
    const { ctx, p } = c;
    const f = face();
    const contacts = await c.contacts();
    const name = await c.name({ company: true });
    const hc = contacts.size(1).h;
    const foot = box(c.L, c.B, c.R, c.B + hc);
    const fc = setIn(ctx, contacts, foot, 'left', 'bottom', c.notes, 'longest contact line');
    f.ink.push(...fc.pieces);
    const top = box(c.L, fc.used.y1 + GUTTER, c.L + Math.min(name.size(1).w, (c.R - c.L) * 0.62), c.T);
    const nt = setIn(ctx, name, top, 'left', 'top', c.notes, 'name or title');
    f.ink.push(...nt.pieces);
    // The initials, huge, in the corner the lettering leaves, cropped by the top and right edges.
    const ini = initials(p.name);
    if (ini) {
      const t = await layoutText(p.font, ini, { capHeight: 10, align: 'left', tolerance: 0.01 }, ctx.inputs);
      if (t.contours.length) {
        const w10 = t.bounds.maxX - t.bounds.minX;
        const last = w10 / ini.length;
        const x0 = nt.used.x1 + GUTTER + 1;
        const y0 = fc.used.y1 + GUTTER;
        const W = c.w / 2 - x0;
        const H = c.h / 2 - y0;
        const cap = Math.max(8, Math.min(40, H / 0.9, (W * 10) / Math.max(1, w10 - 0.14 * last)));
        const k = cap / 10;
        const cs = ctx.cs(t.contours, 'NonZero').scale([k, k]);
        const bb = cs.bounds();
        // Off the right edge by 14 % of the last letter, off the top by 10 % of the letters.
        const dx = c.w / 2 + 0.14 * last * k - bb.max[0];
        const dy = c.h / 2 - 0.9 * cap;
        f.carved = cs.translate([dx, dy]).intersect(outlineOf(c));
      }
    }
    if (c.logoOn === 'front' && c.p.twoSided) c.logoOn = 'back';
    if (c.qrOn === 'front') c.noRoom('QR code');
    let b: Face | null = null;
    if (c.p.twoSided) b = await c.standardBack(face(), c.inner, 'accent');
    return plan(c, f, b, { reveal: true });
  },
};
