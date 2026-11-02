/** The designs built round a shape of colour: Swoosh, Orbit, Sash, Dots and Split name. */
import type { CrossSection } from '@pf/engine-manifold';
import type { Box } from './kit';
import { box, boxOf, boxW, disc, GUTTER, ringAt, setIn } from './kit';
import type { Card } from './layout';
import { outlineOf, plan } from './templates-clean';
import type { Template } from './tpl';
import { behind, face, freeBox, poly, unionOf } from './tpl';
import type { Face, Piece } from './types';

const boxesOf = (pieces: Piece[]): Box[] => pieces.map((p) => boxOf(p.cs));

/** The biggest square (to `max`) that stands inside a circle (centre, radius) with its right/top edge at most at (xR, yT). */
function squareInCircle(cx: number, cy: number, r: number, xR: number, yT: number, max: number, ySide: 'mid' | 'low' = 'low'): { x: number; y: number; s: number } | null {
  for (let s = max; s >= 5; s -= 0.5) {
    const x = Math.min(cx, xR - s / 2);
    const y = ySide === 'mid' ? cy : Math.min(cy, yT - s / 2);
    let far = 0;
    for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) far = Math.max(far, Math.hypot(x + (dx * s) / 2 - cx, y + (dy * s) / 2 - cy));
    if (far <= r) return { x, y, s };
  }
  return null;
}

export const swoosh: Template = {
  id: 'swoosh',
  name: 'Swoosh',
  group: 'shapes',
  async build(c) {
    const { ctx } = c;
    const out = outlineOf(c);
    // The curve: a circle through its deepest point on the middle line and the two edge points.
    const x0 = c.w / 2 - 0.3 * c.w;
    const x1 = c.w / 2 - 0.17 * c.w;
    const cx = (x0 * x0 - x1 * x1 - (c.h * c.h) / 4) / (2 * (x0 - x1));
    const r = cx - x0;
    const echoR = r - 2.4;
    const fieldOf = (sx: number) => disc(ctx, sx * cx, 0, r).intersect(out).subtract(ringAt(ctx, sx * cx, 0, echoR, 0.7));
    const f = face();
    f.fields = fieldOf(1);
    const col = box(c.L + 1, c.B, x0 - GUTTER, c.T);
    f.ink.push(...c.stack(await c.name({ company: true }), await c.contacts(), col).pieces);
    // On the front, the code (or the logo) stands in the curve, inside its echo line.
    const inside = echoR - 0.35 - 1.5;
    const onCurve = c.readsOn('accent', ['ink', 'card']);
    if (c.qrOn === 'front') {
      const sq = squareInCircle(cx, 0, inside, c.R, c.T, Math.min(c.qrSide, 30), 'mid');
      const s = sq?.s ?? 5;
      f.ink.push(...(await c.qrAt(sq?.x ?? c.R - s / 2, 0, s, 'accent', 'the curve on the front')).pieces);
      if (c.logoOn === 'front') c.noRoom('logo');
    } else if (c.logoOn === 'front') {
      const sq = squareInCircle(cx, 0, inside, c.R, c.T, 16, 'mid');
      if (sq) f.ink.push(...(await c.markAt(sq.x, 0, sq.s, onCurve, true)));
    }
    let b: Face | null = null;
    if (c.p.twoSided) {
      b = face();
      // From behind the curve comes in from the left and holds the mark.
      b.fields = fieldOf(-1);
      if (c.logoOn === 'back') {
        const sq = squareInCircle(cx, 0, inside, c.R, c.T, 16, 'mid');
        if (sq) b.ink.push(...(await c.markAt(-sq.x, 0, sq.s, onCurve, true)));
      }
      await c.standardBack(b, box(-x0 + GUTTER, c.B, c.R, c.T), 'card', { noMark: true });
    }
    return plan(c, f, b);
  },
};

export const orbit: Template = {
  id: 'orbit',
  name: 'Orbit',
  group: 'shapes',
  async build(c) {
    const { ctx } = c;
    const f = face();
    const r = c.h * 0.33;
    const st = 0.9;
    const cx = c.w / 2 - 0.22 * r;
    const cy = c.h / 2 - 0.22 * r;
    const a = (215 * Math.PI) / 180;
    f.fields = ringAt(ctx, cx, cy, r, st).add(disc(ctx, cx + r * Math.cos(a), cy + r * Math.sin(a), 2.3)).intersect(outlineOf(c));
    const contacts = await c.contacts();
    const qrS = c.qrOn === 'front' ? c.qrSide : 0;
    const lowest = cy - r - st / 2;
    const foot = box(c.L, c.B, c.R - (qrS ? qrS + GUTTER : 0), Math.min(lowest - GUTTER, c.B + contacts.size(1).h));
    const fc = setIn(ctx, contacts, foot, 'left', 'bottom', c.notes, 'longest contact line');
    f.ink.push(...fc.pieces);
    const nameBox = box(c.L, fc.used.y1 + GUTTER, cx - r - st / 2 - 2.3 - GUTTER, c.T);
    f.ink.push(...setIn(ctx, await c.name({ company: true }), nameBox, 'left', 'middle', c.notes, 'name or title').pieces);
    if (qrS) {
      const S = Math.min(qrS, lowest - GUTTER - c.B);
      f.ink.push(...(await c.qrAt(c.R - S / 2, c.B + S / 2, S, 'card', 'the front')).pieces);
    }
    if (c.logoOn === 'front') {
      // The logo sits inside the ring, on the card.
      const sq = squareInCircle(cx, cy, r - st / 2 - 1.5, c.R, c.T, 15);
      if (sq) f.ink.push(...(await c.markAt(sq.x, sq.y, sq.s, 'accent')));
      else c.noRoom('logo');
    }
    let b: Face | null = null;
    if (c.p.twoSided) {
      b = face();
      let area = c.inner;
      if (c.logoOn === 'back') {
        // The ring comes round whole, centred on the mark.
        const r2 = Math.min(c.h * 0.3, (c.T - c.B) / 2);
        const bx = c.L + r2 + 0.5;
        const a2 = (35 * Math.PI) / 180;
        b.fields = ringAt(ctx, bx, 0, r2, st).add(disc(ctx, bx + r2 * Math.cos(a2), r2 * Math.sin(a2), 2.3));
        const s = (r2 - st / 2 - 1.2) * Math.SQRT2 * 0.92;
        b.ink.push(...(await c.markAt(bx, 0, s, 'accent')));
        area = box(bx + r2 + 2.3 + GUTTER, c.B, c.R, c.T);
      }
      await c.standardBack(b, area, 'card', { noMark: true });
    }
    return plan(c, f, b);
  },
};

/** A band along the line through the origin with direction `u`, from `s0` to `s1` along its normal. */
function bandAlong(c: Card, u: [number, number], n: [number, number], s0: number, s1: number, at: [number, number] = [0, 0]): CrossSection {
  const L = Math.hypot(c.w, c.h);
  const pt = (t: number, s: number): [number, number] => [at[0] + u[0] * t + n[0] * s, at[1] + u[1] * t + n[1] * s];
  return c.ctx.cs([poly([pt(-L, s0), pt(L, s0), pt(L, s1), pt(-L, s1)])]);
}

export const sash: Template = {
  id: 'sash',
  name: 'Sash',
  group: 'shapes',
  async build(c) {
    const { ctx } = c;
    const f = face();
    const out = outlineOf(c);
    const contacts = await c.contacts();
    // The longest contact line at the foot, where the bottom-left triangle is widest.
    contacts.lines.sort((a, b) => a.w + (a.icon?.w ?? 0) - (b.w + (b.icon?.w ?? 0)));
    const name = await c.name({ company: true });
    const half = box(c.L, c.B, c.R - (c.R - c.L) * 0.25, c.T);
    const nt = setIn(ctx, name, box(c.L + (c.R - c.L) * 0.3, (c.B + c.T) / 2 - 2, c.R, c.T), 'right', 'top', c.notes, 'name or title');
    const fc = setIn(ctx, contacts, box(half.x0, half.y0, half.x1, (c.B + c.T) / 2 + 2), 'left', 'bottom', c.notes, 'longest contact line');
    f.ink.push(...nt.pieces, ...fc.pieces);
    const D = Math.hypot(c.w, c.h);
    const u: [number, number] = [c.w / D, -c.h / D];
    const n: [number, number] = [c.h / D, c.w / D];
    const d = (x: number, y: number) => x * n[0] + y * n[1];
    let dTop = Infinity;
    let dFoot = -Infinity;
    for (const b of boxesOf(nt.pieces)) dTop = Math.min(dTop, d(b.x0, b.y0), d(b.x0, b.y1), d(b.x1, b.y0));
    for (const b of boxesOf(fc.pieces)) dFoot = Math.max(dFoot, d(b.x1, b.y1), d(b.x0, b.y1), d(b.x1, b.y0));
    const room = dTop - dFoot - 2 * GUTTER;
    if (room < 4) c.notes.push({ level: 'warning', message: 'The lettering leaves the sash too little room on this card: shorten a line or make the text smaller.' });
    const total = Math.max(4, Math.min(13, room));
    const mid = (dTop + dFoot) / 2;
    const bandW = total * 0.68;
    const s0 = mid - total / 2;
    f.fields = bandAlong(c, u, n, s0, s0 + bandW)
      .add(bandAlong(c, u, n, s0 + bandW + 0.8, mid + total / 2))
      .intersect(out);
    if (c.qrOn === 'front') c.noRoom('QR code');
    if (c.logoOn === 'front') c.noRoom('logo');
    let b: Face | null = null;
    if (c.p.twoSided) {
      b = face();
      // The same band crosses the top-left corner.
      const v: [number, number] = [c.h / D, c.w / D];
      const m: [number, number] = [c.w / D, -c.h / D];
      const P: [number, number] = [-c.w / 2 + 0.2 * c.w, c.h / 2 - 0.2 * c.h];
      b.fields = bandAlong(c, v, m, -3.5, 3.5, P).add(bandAlong(c, v, m, 4.3, 5.6, P)).intersect(out);
      await c.standardBack(b, freeBox(ctx, b.fields, c.inner, GUTTER, 1.3));
    }
    return plan(c, f, b);
  },
};

export const dots: Template = {
  id: 'dots',
  name: 'Dots',
  group: 'shapes',
  async build(c) {
    const { ctx } = c;
    const f = face();
    const out = outlineOf(c);
    const s = c.stack(await c.name({ company: true }), await c.contacts(), box(c.L, c.B, c.R - 8, c.T), 'left', GUTTER + 1, 'top');
    f.ink.push(...s.pieces);
    const bs = boxesOf(s.pieces);
    const near = (x: number, y: number) => Math.min(...bs.map((b) => Math.hypot(x - Math.max(b.x0, Math.min(x, b.x1)), y - Math.max(b.y0, Math.min(y, b.y1)))));
    const cx = c.w / 2;
    const cy = -c.h / 2;
    const Rb = Math.max(12, Math.min(0.62 * c.h, near(cx, cy) - GUTTER));
    const discs: CrossSection[] = [disc(ctx, cx, cy, Rb)];
    let rm = 0.36 * Rb;
    let mx = cx + 0.25 * rm;
    let my = cy + Rb + 2.5 + rm;
    while (rm >= 3 && (near(mx, my) < rm + GUTTER || my + rm > c.h / 2 - 1)) {
      rm -= 0.5;
      mx = cx + 0.25 * rm;
      my = cy + Rb + 2.5 + rm;
    }
    if (rm >= 3) discs.push(disc(ctx, mx, my, rm));
    const rs = 0.22 * Rb;
    const sy = c.h / 2 + 0.25 * rs;
    for (let sx = c.w / 2 - 0.3 * c.w; sx <= c.w / 2 - rs - 1; sx += 0.5) {
      const clearMed = rm < 3 || Math.hypot(sx - mx, sy - my) > rm + rs + 2;
      if (near(sx, sy) >= rs + GUTTER && clearMed) {
        discs.push(disc(ctx, sx, sy, rs));
        break;
      }
    }
    const fields = unionOf(ctx, discs)!.intersect(out);
    f.fields = fields;
    if (c.p.logoMode !== 'none') {
      // The mark stands in the big disc: part of the design on the front.
      let ms = Rb * 0.48;
      let mx2 = cx - Rb * 0.42;
      let my2 = cy + Rb * 0.42;
      mx2 = Math.min(mx2, c.R - ms / 2);
      my2 = Math.max(my2, c.B + ms / 2);
      if (Math.hypot(mx2 - ms / 2 - cx, my2 + ms / 2 - cy) > Rb - 1.5) ms *= 0.85;
      f.ink.push(...(await c.markAt(mx2, my2, ms, c.readsOn('accent', ['ink', 'card']), true)));
    }
    if (c.qrOn === 'front') c.noRoom('QR code');
    let b: Face | null = null;
    if (c.p.twoSided) {
      b = face();
      // From behind, the discs climb the other side; the code and the company take the rest.
      b.fields = behind(fields);
      await c.standardBack(b, freeBox(ctx, b.fields, c.inner, GUTTER, 1.3), 'card', { noMark: c.qrOn === 'back' });
    }
    return plan(c, f, b);
  },
};

export const splitName: Template = {
  id: 'split-name',
  name: 'Split name',
  group: 'shapes',
  async build(c) {
    const { ctx } = c;
    const f = face();
    const out = outlineOf(c);
    const contacts = await c.contacts();
    contacts.lines.sort((a, b) => a.w + (a.icon?.w ?? 0) - (b.w + (b.icon?.w ?? 0)));
    const name = await c.name({ company: true });
    const fc = setIn(ctx, contacts, box(c.L, c.B, c.R - 14, c.B + contacts.size(1).h), 'left', 'bottom', c.notes, 'longest contact line');
    const nt = setIn(ctx, name, box(c.L, fc.used.y1 + GUTTER, c.R - 6, c.T), 'left', 'top', c.notes, 'name or title');
    const namePiece = nt.pieces.find((p) => p.role === 'name');
    const nb = namePiece ? boxOf(namePiece.cs) : nt.used;
    const x1 = nb.x0 + 0.55 * (nb.x1 - nb.x0);
    const y1 = (nb.y0 + nb.y1) / 2;
    // The edge: through the name's middle, slanting as little as clears every contact line.
    const corners = boxesOf(fc.pieces).map((b) => [b.x1, b.y1] as const);
    let k = 0.12;
    const clear = (kk: number) => corners.every(([x, y]) => x1 + kk * (y1 - y) - x >= GUTTER * Math.hypot(1, kk));
    while (k < 1.6 && !clear(k)) k += 0.01;
    if (!clear(k)) c.notes.push({ level: 'warning', message: 'The contact lines run under the name’s colour change; shorten them or make the text smaller.' });
    const xe = (y: number) => x1 + k * (y1 - y);
    const Y = c.h / 2 + 1;
    const field = ctx.cs([poly([[xe(Y), Y], [xe(-Y), -Y], [c.w / 2 + 50, -Y], [c.w / 2 + 50, Y]])]).intersect(out);
    f.fields = field;
    // The name's group changes colour where it crosses onto the field.
    const onField = c.readsOn('accent', ['card', 'ink']);
    for (const pc of nt.pieces) {
      const inF = pc.cs.intersect(field);
      const outF = pc.cs.subtract(field);
      if (!outF.isEmpty()) f.ink.push({ ...pc, cs: outF });
      if (!inF.isEmpty()) f.ink.push({ ...pc, cs: inF, colour: onField, onField: true });
    }
    f.ink.push(...fc.pieces);
    if (c.logoOn === 'front') {
      const s = 12;
      if (xe(c.T - s) + 2 < c.R - s) f.ink.push(...(await c.markAt(c.R - s / 2, c.T - s / 2, s, onField, true)));
      else c.noRoom('logo');
    }
    if (c.qrOn === 'front') c.noRoom('QR code');
    let b: Face | null = null;
    if (c.p.twoSided) {
      b = face();
      b.fields = behind(field);
      if (c.logoOn === 'back') {
        let s = 16;
        while (s > 6 && -xe(c.T - s) - 2 < c.L + s) s -= 0.5;
        if (s > 6) b.ink.push(...(await c.markAt(c.L + s / 2, c.T - s / 2, s, onField, true)));
      }
      await c.standardBack(b, freeBox(ctx, b.fields, c.inner, GUTTER, 1.3), 'card', { noMark: true });
    }
    void boxW;
    return plan(c, f, b);
  },
};
