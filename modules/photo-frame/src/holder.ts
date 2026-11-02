/**
 * A holder a bare print stands in, leaning back 15°: a long ledge, an upright pebble or an
 * upright heart, each with a slot across its top. Built where it prints: z up, bed at z = 0,
 * the front facing −y.
 */
import type { Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold } from '@pf/engine-manifold';
import { placeLine } from './art';
import { COS, groove, prism, SIN, slotProfile } from './geo';
import { box, heartOf, rrect } from './outline';
import { printOf } from './sizes';
import type { Ctx } from './types';

const PHOTO: RGB = [196, 210, 224];
/** How deep the front words go, mm. */
export const FRONT_INLAY = 0.9;

export interface HolderResult {
  parts: Part[];
  summary: string;
  info: { s: number; D: number; hb: number; L: number };
}

/** A front-view section stood up `depth` deep from y = 0, its front and back edges rounded by `r`. */
function upright(ctx: Ctx, cs: CrossSection, depth: number, r: number): Manifold {
  const m = r > 0 ? ctx.edged(cs, depth, { top: r, bottom: r, style: 'round' }) : ctx.extrude(cs, depth);
  return m.warp((v) => {
    const [a, b, c] = [v[0], v[1], v[2]];
    v[0] = a;
    v[1] = depth - c;
    v[2] = b;
  });
}

export async function buildHolder(ctx: Ctx, notes: Diagnostic[]): Promise<HolderResult> {
  const p = ctx.params;
  const pr = printOf(p);
  const { pw, ph } = pr;
  const film = !!pr.film;
  const tp = film ? 0.9 : 0.35;
  const s = film ? 1.7 : 1.1;
  const kind = p.holder;
  const g = groove(ph, pw, s, { tall: kind !== 'ledge' });
  const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

  let body: Manifold;
  let front: CrossSection | null = null;
  let L: number;
  let hb: number;
  // The flat part of the front the words may use, front view.
  let wordsBox = box(0, 0, 0, 0);
  if (kind === 'ledge') {
    L = g.L;
    // Words on the front want a taller ledge.
    hb = p.front.trim() ? Math.max(g.hb, 14) : g.hb;
    if (hb > g.hb) {
      g.v0 += hb - g.hb;
      g.hb = hb;
    }
    const prof: [number, number][] = [[0, 0], [g.D, 0], [g.D, hb - 1], [g.D - 1, hb], [1, hb], [0, hb - 1]];
    body = prism(ctx, prof, -L / 2, L / 2).subtract(prism(ctx, slotProfile(g), -g.slotLength / 2, g.slotLength / 2));
    wordsBox = box(-L / 2 + 4, 1.4, L / 2 - 4, hb - 1.8);
  } else {
    // Upright: the slot runs right through, so a print wider than the holder still stands.
    const W = clamp(pw * 0.55, 42, 90);
    const r = Math.min(3, g.D * 0.12);
    let cs: CrossSection;
    if (kind === 'heart') {
      // A heart with its point cut flat to stand on; the slot's top is the dip between the lobes.
      const h = heartOf(ctx, W);
      const bb = h.bounds();
      const Hh = bb.max[1] - bb.min[1];
      const cut = bb.min[1] + Hh * 0.22;
      cs = h.intersect(rrect(ctx, box(-W, cut - 3, W, bb.max[1] + 1), 0.01)).translate([0, -cut]);
      hb = cs.bounds().max[1];
    } else {
      const Hp = clamp(W * 0.62, 26, 50);
      const pts: number[] = [];
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        // A squarish ellipse, a little fuller at the bottom.
        const k = 1 + 0.06 * Math.sin(a + 0.6);
        pts.push(((W / 2) * Math.sign(c) * Math.abs(c) ** 0.7) * k, (Hp / 2) * Math.sign(sn) * Math.abs(sn) ** 0.8);
      }
      const cut = -Hp * 0.42;
      cs = ctx.cs([pts]).intersect(rrect(ctx, box(-W, cut - 3, W, Hp), 0.01)).translate([0, -cut]);
      hb = cs.bounds().max[1];
    }
    L = W;
    const D = g.D;
    body = upright(ctx, cs, D, r);
    // Flat on the bed.
    body = body.intersect(ctx.extrude(rrect(ctx, box(-W, -1, W, D + 1), 0.01), hb + 5));
    // The slot, its floor the groove's depth below the shape's lowest top point over the print.
    const dk = Math.max(6, ph / 15);
    // Over the middle: a heart's dip, a pebble's crown.
    const top = lowestTop(cs, W * 0.22);
    const gg = { ...g, v0: Math.max(3, top - dk * COS) };
    body = body.subtract(prism(ctx, slotProfile(gg), -W, W));
    g.v0 = gg.v0;
    g.rest = [g.u0 - (s / 2) * COS, g.v0 + (s / 2) * SIN];
    wordsBox = box(-W / 2 + r + 6, 2, W / 2 - r - 6, Math.min(g.v0 - 2, hb * 0.55));
    front = cs.offset(-(r + 0.8), 'Round', 2, 12);
  }

  // The words in the second colour, laid into the front.
  let ink: Manifold | null = null;
  if (p.front.trim()) {
    const room = wordsBox.y1 - wordsBox.y0;
    const cap0 = p.textAuto ? clamp(room * 0.62, 3, 14) : p.textSize;
    const cap = Math.min(cap0, room * 0.8);
    const l = cap > 2 ? await placeLine(ctx, p.font, p.front, cap, wordsBox.x1 - wordsBox.x0, (wordsBox.x0 + wordsBox.x1) / 2, (wordsBox.y0 + wordsBox.y1) / 2 - cap / 2, 'center', notes, 'front words') : null;
    if (l) {
      let cs = l.cs;
      if (front) cs = cs.intersect(front);
      if (!cs.isEmpty()) {
        ink = upright(ctx, cs, FRONT_INLAY, 0);
        // upright() fills y = 0 … depth from the front: exactly the inlay.
        body = body.subtract(ink);
      }
    } else if (cap <= 2) notes.push({ level: 'warning', message: 'This holder has no room on its front for words; try the ledge.' });
  }

  const parts: Part[] = [];
  // Centred on the bed, front to −y.
  const dy = -g.D / 2;
  const add = (m: Manifold | null, name: string, color: RGB, group: string, role?: 'preview') => {
    if (!m) return;
    const q = ctx.part(m.translate([0, dy, 0]), name, color, role ? { group, role } : { group });
    if (q) parts.push(q);
  };
  const names = { ledge: 'Ledge', pebble: 'Pebble', heart: 'Heart' } as const;
  add(body, names[kind], p.bodyColor, 'holder');
  add(ink, 'Words', p.inkColor, 'holder');
  // The print standing in it, against the slot's front wall.
  const n: [number, number] = [COS, -SIN];
  const d: [number, number] = [SIN, COS];
  const P = (a: number, b: number): [number, number] => [g.u0 + n[0] * a + d[0] * b, g.v0 + n[1] * a + d[1] * b];
  const a0 = -s / 2 + 0.02;
  const photo = prism(ctx, [P(a0, 0.02), P(a0 + tp, 0.02), P(a0 + tp, ph), P(a0, ph)], -pw / 2, pw / 2);
  add(photo, 'Your photo', PHOTO, 'preview', 'preview');

  const vol = body.volume() + (ink?.volume() ?? 0);
  const grams = (vol * 1.24) / 1000;
  notes.push({ level: 'info', message: `Print it standing as shown, no supports. The ${pr.name} stands in the slot and leans back 15°.` });
  if (ink) notes.push({ level: 'info', message: `The words go ${FRONT_INLAY} mm into the front: print them in a second colour with an AMS or another multi-material printer.` });
  if (kind !== 'ledge' && pw > L + 1) notes.push({ level: 'info', message: `The slot runs right through, so the ${pr.name} stands wider than the ${kind}.` });
  const size = `${L.toFixed(0)} × ${g.D.toFixed(0)} × ${hb.toFixed(0)} mm`;
  return { parts, summary: `${size} · holds ${/^[AEIOU]|^A\d/.test(pr.name) ? 'an' : 'a'} ${pr.name} · ≈ ${grams.toFixed(0)} g`, info: { s, D: g.D, hb, L } };
}

/** The lowest top edge of a front-view section between x = −half and x = half. */
function lowestTop(cs: CrossSection, half: number): number {
  let low = Infinity;
  const polys = cs.toPolygons() as unknown as [number, number][][];
  for (let k = 0; k <= 20; k++) {
    const x = -half + (2 * half * k) / 20;
    let top = -Infinity;
    for (const poly of polys)
      for (let i = 0; i < poly.length; i++) {
        const [ax, ay] = poly[i]!;
        const [bx, by] = poly[(i + 1) % poly.length]!;
        if ((ax <= x && bx >= x) || (bx <= x && ax >= x)) {
          const t = bx === ax ? 0 : (x - ax) / (bx - ax);
          top = Math.max(top, ay + (by - ay) * t);
        }
      }
    if (top > -Infinity) low = Math.min(low, top);
  }
  return low;
}
