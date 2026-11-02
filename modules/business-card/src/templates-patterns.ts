/** The designs with a pattern area: Band, Half, Framed, Tall, Logo tile and Texture. */
import type { CrossSection } from '@pf/engine-manifold';
import { box, boxH, boxOf, boxW, disc, GUTTER, MARGIN, patternIn, rectAt, ringAt, roundAt, setIn, tapMark } from './kit';
import type { Card } from './layout';
import { outlineOf, plan } from './templates-clean';
import type { Template } from './tpl';
import { behind, edgeBand, face, freeBox } from './tpl';
import type { Face, PatternArea, Plan } from './types';

/** A keyline: a line of accent along the inner edges of an area, where the pattern stops on card. */
function keyline(c: Card, area: CrossSection, t = 0.7): CrossSection {
  const out = outlineOf(c);
  return area.subtract(area.offset(-t, 'Miter', 2, 0)).subtract(edgeBand(c.ctx, out, 0.9)).intersect(out);
}

/** The pattern on a face: a cut one runs through the card, so a back keeps to the front's. */
function patternFor(c: Card, area: CrossSection, size: number, origin?: [number, number]): PatternArea | null {
  return patternIn(c.ctx, area.intersect(outlineOf(c)), size, { origin });
}

/** A back's pattern: the front's, turned over, painted again (a cut one is already through). */
function backPattern(front: PatternArea | null): PatternArea | null {
  if (!front || front.mode === 'cut') return null;
  return { ...front, cs: behind(front.cs), area: behind(front.area) };
}

export const band: Template = {
  id: 'band',
  name: 'Band',
  group: 'patterns',
  patternSize: 9,
  async build(c) {
    const { ctx } = c;
    const f = face();
    const bx1 = -c.w / 2 + 0.3 * c.w;
    const one = !c.p.twoSided;
    // A one-sided card's code (or else its logo) is a tile at the foot of the band.
    const tileFor = c.qrOn === 'front' ? 'qr' : c.logoOn === 'front' ? 'logo' : null;
    const colW = bx1 - c.L;
    const tileS = tileFor === 'qr' ? Math.min(c.qrSide, colW) : tileFor === 'logo' ? Math.min(14, colW) : 0;
    const bandBox = box(c.L, c.B + (tileS ? tileS + GUTTER : 0), bx1, c.T);
    const area = roundAt(ctx, bandBox, 1.5);
    f.pattern = patternFor(c, area, this.patternSize!);
    f.fields = area.subtract(area.offset(-0.8, 'Miter', 2, 0));
    if (tileFor === 'qr') f.ink.push(...(await c.qrAt((c.L + bx1) / 2, c.B + tileS / 2, tileS, 'card', 'the band’s foot')).pieces);
    else if (tileFor === 'logo') f.ink.push(...(await c.markAt((c.L + bx1) / 2, c.B + tileS / 2, tileS, 'accent')));
    if (tileFor === 'qr' && c.logoOn === 'front') c.noRoom('logo');
    f.ink.push(...c.stack(await c.name({ company: true, rule: true }), await c.contacts(), box(bx1 + GUTTER + 1, c.B, c.R, c.T)).pieces);
    let b: Face | null = null;
    if (!one) {
      b = face();
      // From behind, the band runs down the right.
      const ba = behind(area);
      b.pattern = backPattern(f.pattern);
      b.fields = ba.subtract(ba.offset(-0.8, 'Miter', 2, 0));
      await c.standardBack(b, box(c.L, c.B, -bx1 - GUTTER, c.T));
    }
    return plan(c, f, b);
  },
};

export const half: Template = {
  id: 'half',
  name: 'Half',
  group: 'patterns',
  patternSize: 14,
  async build(c) {
    const { ctx } = c;
    const f = face();
    const name = await c.name({ company: true });
    const contacts = await c.contacts();
    const qrS = c.qrOn === 'front' ? c.qrSide : 0;
    const fc = setIn(ctx, contacts, box(c.L, c.B, c.R - (qrS ? qrS + GUTTER : c.logoOn === 'front' ? 12 + GUTTER : 0), c.B + contacts.size(1).h), 'left', 'bottom', c.notes, 'longest contact line');
    const nt = setIn(ctx, name, box(c.L, fc.used.y1 + GUTTER, c.R - 18, c.T), 'left', 'top', c.notes, 'name or title');
    f.ink.push(...fc.pieces, ...nt.pieces);
    // A quarter of a flower from the top-right corner, as big as the lettering leaves it.
    const C: [number, number] = [c.w / 2, c.h / 2];
    const near = (b: { x0: number; y0: number; x1: number; y1: number }) => Math.hypot(C[0] - Math.max(b.x0, Math.min(C[0], b.x1)), C[1] - Math.max(b.y0, Math.min(C[1], b.y1)));
    let reach = 0.55 * c.w;
    for (const pc of [...fc.pieces, ...nt.pieces]) reach = Math.min(reach, near(boxOf(pc.cs)) - GUTTER - 0.6);
    if (qrS) reach = Math.min(reach, near(box(c.R - qrS, c.B, c.R, c.B + qrS)) - GUTTER);
    reach = Math.max(14, reach);
    const area = disc(ctx, C[0], C[1], reach);
    f.pattern = patternFor(c, area, this.patternSize!, C);
    f.fields = ringAt(ctx, C[0], C[1], reach - 0.4, 0.8).intersect(outlineOf(c));
    if (qrS) f.ink.push(...(await c.qrAt(c.R - qrS / 2, c.B + qrS / 2, qrS, 'card', 'the front')).pieces);
    if (c.logoOn === 'front') {
      if (qrS) c.noRoom('logo');
      else f.ink.push(...(await c.markAt(c.R - 6, c.B + 6, 12, 'accent')));
    }
    let b: Face | null = null;
    if (c.p.twoSided) {
      b = face();
      b.pattern = backPattern(f.pattern);
      b.fields = behind(f.fields);
      await c.standardBack(b, freeBox(ctx, behind(area).intersect(outlineOf(c)), c.inner, GUTTER, 1.2));
    }
    return plan(c, f, b);
  },
};

export const framed: Template = {
  id: 'framed',
  name: 'Framed',
  group: 'patterns',
  patternSize: 7,
  async build(c) {
    const { ctx } = c;
    const f = face();
    const out = outlineOf(c);
    const fs = 7;
    const ft = 4.8;
    const panelBox = box(-c.w / 2 + fs, -c.h / 2 + ft, c.w / 2 - fs, c.h / 2 - ft);
    const panel = roundAt(ctx, panelBox, 2);
    const area = out.subtract(panel);
    f.pattern = patternFor(c, area, this.patternSize!);
    f.fields = panel.offset(0.7, 'Miter', 2, 0).subtract(panel);
    const pad = 2.2;
    const inner = box(panelBox.x0 + pad, panelBox.y0 + pad, panelBox.x1 - pad, panelBox.y1 - pad);
    const ew = c.qrOn === 'front' ? Math.min(c.qrSide, boxH(inner)) : c.logoOn === 'front' ? 11 : 0;
    const col = box(inner.x0, inner.y0, inner.x1 - (ew ? ew + GUTTER : 0), inner.y1);
    f.ink.push(...c.stack(await c.name({ company: true, rule: true }), await c.contacts(), col).pieces);
    if (c.qrOn === 'front') f.ink.push(...(await c.qrAt(inner.x1 - ew / 2, inner.y0 + ew / 2, ew, 'card', 'the panel')).pieces);
    if (c.logoOn === 'front') {
      const s = Math.min(11, boxH(inner) - (c.qrOn === 'front' ? ew + GUTTER : 0));
      if (s >= 6) f.ink.push(...(await c.markAt(inner.x1 - s / 2, inner.y1 - s / 2, s, 'accent')));
      else c.noRoom('logo');
    }
    let b: Face | null = null;
    if (c.p.twoSided) {
      b = face();
      b.pattern = backPattern(f.pattern);
      b.fields = behind(f.fields);
      await c.standardBack(b, inner);
    }
    return plan(c, f, b);
  },
};

export const tall: Template = {
  id: 'tall',
  name: 'Tall',
  group: 'patterns',
  portrait: true,
  patternSize: 8,
  async build(c) {
    const { ctx } = c;
    const f = face();
    const out = outlineOf(c);
    const contacts = await c.contacts({ icons: c.p.iconStyle !== 'none' });
    const hc = contacts.size(1).h;
    // A strip of pattern, the name's band, pattern, the contacts' panel, pattern to the foot.
    const bandTop = c.h / 2 - 12;
    const name = await c.name({ rule: true, company: false });
    const bandH = Math.min(26, Math.max(17, name.size(1).h + 2 * GUTTER));
    const band = rectAt(ctx, box(-c.w / 2 - 1, bandTop - bandH, c.w / 2 + 1, bandTop));
    const wall = 3.2;
    const panelB = box(-c.w / 2 + wall, -c.h / 2 + 5, c.w / 2 - wall, -c.h / 2 + 5 + hc + 2 * 2.4);
    const panel = roundAt(ctx, panelB, 1.5);
    const area = out.subtract(band).subtract(panel);
    f.pattern = patternFor(c, area, this.patternSize!);
    f.fields = keyline(c, area);
    f.ink.push(...setIn(ctx, name, box(c.L, bandTop - bandH + GUTTER, c.R, bandTop - GUTTER), 'center', 'middle', c.notes, 'name or title').pieces);
    f.ink.push(...setIn(ctx, contacts, box(panelB.x0 + 2.4, panelB.y0 + 2.4, panelB.x1 - 2.4, panelB.y1 - 2.4), 'left', 'middle', c.notes, 'longest contact line').pieces);
    // A logo on the front stands in a tile joining the band to the panel.
    const midTop = bandTop - bandH;
    const midBot = panelB.y1;
    let tileB: { x0: number; y0: number; x1: number; y1: number } | null = null;
    if (c.logoOn === 'front' || (c.p.nfc && c.p.nfcMark)) {
      const s = Math.min(18, midTop - midBot - 2 * GUTTER);
      if (s >= 8) {
        const cy = (midTop + midBot) / 2;
        tileB = box(-s / 2 - 2, cy - s / 2 - 2, s / 2 + 2, cy + s / 2 + 2);
        const tile = roundAt(ctx, tileB, 1.5);
        f.pattern = patternFor(c, area.subtract(tile), this.patternSize!);
        f.fields = keyline(c, area.subtract(tile));
        if (c.logoOn === 'front') f.ink.push(...(await c.markAt(0, cy, s, 'accent')));
      } else if (c.logoOn === 'front') c.noRoom('logo');
    }
    if (c.qrOn === 'front') c.noRoom('QR code');
    let b: Face | null = null;
    const res: Partial<Plan> = {};
    if (c.p.nfc && c.p.nfcMark && tileB && c.logoOn !== 'front') res.pocket = { x: 0, y: (tileB.y0 + tileB.y1) / 2, r: 0 };
    if (c.p.twoSided) {
      b = face();
      if (f.pattern?.mode === 'cut') {
        // Cut through, the back keeps to the front's band: the mark, its line and the code there.
        const bb = box(c.L, bandTop - bandH + 1.5, c.R, bandTop - 1.5);
        b.fields = keyline(c, area);
        await c.standardBack(b, bb);
      } else {
        // The back: the pattern where it lies on the front; the code and the mark in one panel.
        const pb = box(-c.w / 2 + wall, -c.h / 2 + 5, c.w / 2 - wall, bandTop);
        const bp = roundAt(ctx, pb, 1.5);
        const barea = out.subtract(bp);
        b.pattern = patternFor(c, barea, this.patternSize!);
        b.fields = keyline(c, barea);
        await c.standardBack(b, box(pb.x0 + GUTTER, pb.y0 + GUTTER, pb.x1 - GUTTER, pb.y1 - GUTTER), 'card', { vertical: true });
      }
    }
    return plan(c, f, b, res);
  },
};

export const logoTile: Template = {
  id: 'logo-tile',
  name: 'Logo tile',
  group: 'patterns',
  patternSize: 9,
  async build(c) {
    const { ctx } = c;
    const f = face();
    const out = outlineOf(c);
    const contacts = await c.contacts();
    const fc = setIn(ctx, contacts, box(c.L, c.B, c.R, c.B + contacts.size(1).h), 'left', 'bottom', c.notes, 'longest contact line');
    f.ink.push(...fc.pieces);
    // A block of pattern in the top-left, bleeding off the card, with a tile let into its inner edge.
    const wb = 0.42 * c.w;
    const yb = fc.used.y1 + GUTTER;
    const xb = -c.w / 2 + wb;
    const ts = Math.min(17, c.h / 2 - yb - 2 * MARGIN);
    const tcy = (yb + c.h / 2) / 2 - 1;
    const tile = box(xb - ts, tcy - ts / 2, xb + 0.01, tcy + ts / 2);
    const block = rectAt(ctx, box(-c.w / 2 - 1, yb, xb, c.h / 2 + 1)).subtract(roundAt(ctx, box(tile.x0, tile.y0, tile.x1 + 2, tile.y1), 1.5));
    const area = block.intersect(out);
    f.pattern = patternFor(c, area, this.patternSize!, [(tile.x0 + tile.x1) / 2, tcy]);
    f.fields = keyline(c, area);
    if (c.p.logoMode !== 'none') f.ink.push(...(await c.markAt((tile.x0 + tile.x1) / 2, tcy, ts * 0.62, 'accent')));
    f.ink.push(...setIn(ctx, await c.name({ company: true }), box(xb + GUTTER + 1, yb, c.R, c.T), 'left', 'middle', c.notes, 'name or title').pieces);
    if (c.qrOn === 'front') c.noRoom('QR code');
    let b: Face | null = null;
    if (c.p.twoSided) {
      b = face();
      b.pattern = backPattern(f.pattern);
      b.fields = behind(f.fields);
      if (c.p.logoMode !== 'none') b.ink.push(...(await c.markAt(-(tile.x0 + tile.x1) / 2, tcy, ts * 0.62, 'accent')));
      await c.standardBack(b, freeBox(ctx, behind(area), c.inner, GUTTER, 1.2), 'card', { noMark: true });
    }
    void boxW;
    return plan(c, f, b);
  },
};

export const texture: Template = {
  id: 'texture',
  name: 'Texture',
  group: 'patterns',
  patternSize: 4,
  async build(c) {
    const { ctx, p } = c;
    const f = face();
    const tx0 = c.w / 2 - c.w / 3;
    const region = roundAt(ctx, box(tx0, c.B, c.R, c.T), 2);
    let area = region;
    const res: Partial<Plan> = {};
    if (p.nfc && p.nfcMark) {
      // The tap mark in the middle of the texture, the one open place on the face.
      const mx = (tx0 + c.R) / 2;
      area = region.subtract(disc(ctx, mx, 0, 6));
      f.ink.push({ cs: tapMark(ctx, 9).translate([mx, 0]), colour: 'ink', role: 'tap' });
      res.pocket = { x: mx, y: 0, r: 0 };
    }
    f.pattern = patternFor(c, area, this.patternSize!);
    f.ink.push(...c.stack(await c.name({ company: true }), await c.contacts(), box(c.L + 1, c.B, tx0 - GUTTER, c.T)).pieces);
    if (c.qrOn === 'front') c.noRoom('QR code');
    if (c.logoOn === 'front') c.noRoom('logo');
    let b: Face | null = null;
    if (c.p.twoSided) {
      b = face();
      const cut = f.pattern?.mode === 'cut';
      await c.standardBack(b, cut ? box(-tx0 + GUTTER, c.B, c.R, c.T) : c.inner);
    }
    return plan(c, f, b, res);
  },
};
