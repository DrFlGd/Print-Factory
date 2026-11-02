/**
 * A frame, a song plaque or a post: drawn in FRONT VIEW (x right as you look at the face, y up,
 * z the depth from the face back). It prints face down, so z is also the print's height; that
 * view is left-handed, so the print pose mirrors x to read the right way from the front.
 *
 * Face down, from the plate up: the face (its words and pattern laid into the first three
 * layers), the window opening at 45° or steeper, the pocket the print lies in, the slot the back
 * plate slides into from the right, and the ceiling over the slot's grooves.
 */
import type { Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold } from '@pf/engine-manifold';
import { chinHeight, chinWords, crestInitials, player, playerHeight, postArt, postHeights } from './art';
import { COS, groove, prism, SIN, slotProfile, TAN } from './geo';
import type { Box } from './outline';
import { box, bh, bw, discAt, frameShape, grow, rrect } from './outline';
import { patternOver } from './pattern';
import { KEYCHAIN_LONG, MAGNET_CAP, magnetById, printOf } from './sizes';
import type { Ctx } from './types';

/** The border round the print, mm. */
export const RIM = { thin: 5, regular: 8, thick: 13 } as const;
/** Front thickness, the window's bevel, a deep box's straight run, the face's chamfer. */
export const PROFILES = {
  flat: { front: 1.2, bevel: 0.8, straight: 0, chamfer: 0 },
  bevel: { front: 2.8, bevel: 2.4, straight: 0, chamfer: 1.2 },
  deep: { front: 7.0, bevel: 2.4, straight: 4.6, chamfer: 1.2 },
} as const;
const PUFFY = { front: 3.0, bevel: 0, straight: 0, chamfer: 1.8 };
export const FIT = { pocketClear: 0.3, lip: 1.5, filmInset: 0.75, gapFilm: 1.4, gapPaper: 0.6, plate: 1.0, plateClear: 0.2, ceiling: 0.8, groove: 1.0, wingClear: 0.25, inlay: 0.6, mat: 1.0 };
const PHOTO: RGB = [196, 210, 224];

export interface FrameResult {
  parts: Part[];
  summary: string;
  /** For the tests: the frame's stack and boxes. */
  info: { T: number; zPlate0: number; zCeil: number; pocket: Box; body: Box; window: Box };
}

const extrudeZ = (ctx: Ctx, cs: CrossSection, z0: number, z1: number) => ctx.extrude(cs, z1 - z0, z0);

export async function buildFrame(ctx: Ctx, notes: Diagnostic[]): Promise<FrameResult> {
  const p = ctx.params;
  const pr = printOf(p);
  const { pw, ph } = pr;
  const rim = RIM[p.border];
  const pb = box(-pw / 2, -ph / 2, pw / 2, ph / 2);
  const wb = pr.film
    ? box(pb.x0 + pr.film.x0 + FIT.filmInset, pb.y0 + pr.film.y0 + FIT.filmInset, pb.x0 + pr.film.x0 + pr.film.iw - FIT.filmInset, pb.y0 + pr.film.y0 + pr.film.ih - FIT.filmInset)
    : grow(pb, -FIT.lip);
  let b = grow(pb, rim);
  const wordsBoxes: Box[] = [];
  const ink: CrossSection[] = [];

  // What the face carries round the window, and the room it takes.
  const product = p.product === 'holder' ? 'frame' : p.product;
  const cap = p.textAuto ? Math.max(5, Math.min(12, pw * 0.085)) : p.textSize;
  let wordsBox: Box | null = null;
  if (product === 'frame' && p.wordsAt !== 'none' && (p.caption.trim() || p.second.trim())) {
    const need = chinHeight(ctx, cap) + 2 * 2.2;
    if (p.wordsAt === 'bottom') {
      b = box(b.x0, Math.min(b.y0, wb.y0 - need - 2), b.x1, b.y1);
      wordsBox = box(b.x0 + rim * 0.6, b.y0 + 2, b.x1 - rim * 0.6, wb.y0 - 2.2);
    } else {
      b = box(b.x0, b.y0, b.x1, Math.max(b.y1, wb.y1 + need + 2));
      wordsBox = box(b.x0 + rim * 0.6, wb.y1 + 2.2, b.x1 - rim * 0.6, b.y1 - 2);
    }
  }
  let panel: Box | null = null;
  let head: Box | null = null;
  let foot: Box | null = null;
  if (product === 'song') {
    const Hp = playerHeight(ctx, bw(wb));
    panel = box(wb.x0, wb.y0 - 3 - Hp, wb.x1, wb.y0 - 3);
    b = box(b.x0, Math.min(b.y0, panel.y0 - Math.max(3, rim * 0.6)), b.x1, b.y1);
  } else if (product === 'post') {
    const hs = postHeights(ctx, bw(wb));
    head = box(wb.x0, wb.y1 + 2, wb.x1, wb.y1 + 2 + hs.head);
    foot = box(wb.x0, wb.y0 - 2 - hs.foot, wb.x1, wb.y0 - 2);
    b = box(b.x0, Math.min(b.y0, foot.y0 - Math.max(3, rim * 0.6)), b.x1, Math.max(b.y1, head.y1 + Math.max(3, rim * 0.6)));
  }

  const shape = frameShape(ctx, p, b, pb, rim);
  let outline = shape.body;
  const standing = p.stand === 'foot' || p.stand === 'kickstand' || p.stand === 'base' || p.stand === 'block';
  if (standing) outline = outline.intersect(rrect(ctx, box(b.x0 - 50, b.y0, b.x1 + 50, b.y1 + 100), 0.01));

  // A key ring's loop on the top edge.
  let keyHole: CrossSection | null = null;
  if (p.stand === 'keychain') {
    if (Math.max(pw, ph) > KEYCHAIN_LONG + 1e-6) notes.push({ level: 'warning', message: `A key ring frame is for prints up to ${KEYCHAIN_LONG} mm long; this one is ${Math.max(pw, ph).toFixed(0)} mm.` });
    const r = Math.max(1.5, p.holeDia / 2);
    const R = r + Math.max(1.6, p.holeRing);
    const xs = { left: b.x0 + R + 3, middle: 0, right: b.x1 - R - 3 }[p.loopAt];
    const top = outline.bounds().max[1];
    const cy = top + r + 0.4;
    outline = outline.add(discAt(ctx, xs, cy, R)).add(rrect(ctx, box(xs - R * 0.7, top - 4, xs + R * 0.7, cy), 0.01));
    keyHole = discAt(ctx, xs, cy, r);
    outline = outline.subtract(keyHole);
  }

  const prof = p.outline === 'squiggle' ? PUFFY : PROFILES[p.profile];
  const F = prof.front;
  const matT = p.profile === 'deep' && p.outline !== 'squiggle' ? FIT.mat : 0;
  const gap = pr.film ? FIT.gapFilm : FIT.gapPaper;
  const zP0 = F + matT + gap;
  const zP1 = zP0 + FIT.plate;
  const zC = zP1 + FIT.plateClear;
  const T = zC + FIT.ceiling;

  // The body, its face edge chamfered (face down, so the chamfer is at the bottom).
  let body: Manifold = prof.chamfer > 0 ? ctx.edged(outline, T, { bottom: prof.chamfer, style: 'chamfer' }) : ctx.extrude(outline, T);
  const W0 = shape.window ?? rrect(ctx, wb, 1);
  const open = prof.bevel > 0 ? W0.offset(prof.bevel, 'Round', 2, 16) : W0;
  const cutters: Manifold[] = [extrudeZ(ctx, W0, -0.01, F + 0.02)];
  if (prof.straight > 0) cutters.push(extrudeZ(ctx, open, -0.01, prof.straight + 0.01));
  if (prof.bevel > 0) cutters.push(ctx.edged(open, 2 * prof.bevel + 0.02, { top: prof.bevel, style: 'chamfer' }).translate([0, 0, prof.straight - prof.bevel - 0.01]));
  const pk = grow(pb, FIT.pocketClear);
  cutters.push(extrudeZ(ctx, rrect(ctx, pk, 1), F, zP0 + 0.01));
  const slot = box(pk.x0 - FIT.groove, pk.y0 - FIT.groove, b.x1 + 30, pk.y1 + FIT.groove);
  cutters.push(extrudeZ(ctx, rrect(ctx, slot, 0.01), zP0, zC));
  cutters.push(extrudeZ(ctx, rrect(ctx, box(pk.x0, pk.y0, b.x1 + 30, pk.y1), 0.01), zC - 0.01, T + 1));
  body = body.subtract(ctx.union(cutters));

  // Standing on a foot or a kickstand: the bottom edge cut along the table.
  const yb = b.y0;
  const W = bw(b) + 60;
  if (p.stand === 'foot' || p.stand === 'kickstand') {
    body = body.subtract(prism(ctx, [[yb - 50, -1], [yb - TAN, -1], [yb + (T + 60) * TAN, T + 60], [yb - 50, T + 60]], -W / 2, W / 2));
  }
  const H = bh(b);
  if (p.stand === 'foot') {
    // A slab off the back of the bottom rail, its underside along the table.
    const fd = Math.max(14, Math.min(45, 0.3 * H));
    const hf = Math.max(2.5, Math.min(10, pk.y0 - 0.6 - (yb + T * TAN)));
    const fw = Math.min(bw(b) * 0.6, 70);
    const z0 = T - 0.6;
    const z1 = T + fd;
    body = body.add(prism(ctx, [[yb + z0 * TAN, z0], [yb + z1 * TAN, z1], [yb + z1 * TAN + hf, z1], [yb + z0 * TAN + hf, z0]], -fw / 2, fw / 2));
    if (hf < 3.5) notes.push({ level: 'info', message: 'The foot is thin on this border; a regular or thick border gives it more to hold on to.' });
  }

  // The second colour, flush in the face.
  const faceArea = outline.offset(-(prof.chamfer + 0.4), 'Round', 2, 12).subtract(open.offset(0.6, 'Round', 2, 12));
  if (wordsBox) {
    ink.push(...(await chinWords(ctx, wordsBox, cap, notes)));
    wordsBoxes.push(wordsBox);
  }
  if (shape.crest && p.initials.trim()) {
    const c = await crestInitials(ctx, shape.crest.x, shape.crest.y + shape.crest.r * 0.1, shape.crest.r * 0.8, notes);
    if (c) ink.push(c);
  }
  if (panel) {
    ink.push(...(await player(ctx, panel, notes)));
    wordsBoxes.push(panel);
  }
  if (head && foot) {
    ink.push(...(await postArt(ctx, head, foot, notes)));
    wordsBoxes.push(head, foot);
  }
  if (p.pattern !== 'none') {
    const bb = outline.bounds();
    let pat = patternOver(ctx, p, box(bb.min[0], bb.min[1], bb.max[0], bb.max[1]));
    if (pat) {
      for (const wbx of wordsBoxes) pat = pat.subtract(rrect(ctx, grow(wbx, 1.5), 2));
      if (shape.crest) pat = pat.subtract(discAt(ctx, shape.crest.x, shape.crest.y, shape.crest.r * 0.85));
      ink.push(pat);
    }
  }
  if (shape.trim) ink.push(shape.trim);
  let inkCs: CrossSection | null = null;
  if (ink.length) {
    const all = ctx.CrossSection.union(ink).intersect(faceArea);
    const kept = all.decompose().filter((q) => q.area() > 0.3);
    inkCs = kept.length ? ctx.CrossSection.union(kept) : null;
  }
  let inkM: Manifold | null = null;
  if (inkCs) {
    inkM = extrudeZ(ctx, inkCs, 0, FIT.inlay);
    body = body.subtract(inkM);
  }

  // The back plate: slides in from the right in the grooves.
  const plateCs = rrect(ctx, box(slot.x0 + FIT.wingClear, slot.y0 + FIT.wingClear, b.x1 + 50, slot.y1 - FIT.wingClear), 0.5).intersect(outline.offset(-0.8, 'Round', 2, 12));
  let plate = extrudeZ(ctx, plateCs, zP0, zP1);
  const tail = plateCs.bounds().max[0];
  // Grip ridges at its tail, inside the open back.
  for (let i = 0; i < 3; i++) plate = plate.add(extrudeZ(ctx, rrect(ctx, box(tail - 3 - i * 2.2, -bh(pk) * 0.18, tail - 2.2 - i * 2.2, bh(pk) * 0.18), 0.3), zP1 - 0.01, zP1 + 0.6));
  let magnetNote = '';
  if (p.stand === 'kickstand') {
    const fd = Math.max(14, Math.min(50, 0.32 * H));
    const zTip = zP1 + fd;
    const yC = yb + zTip * TAN;
    const yHigh = Math.min(yC + fd * 0.95, pk.y1 - 3);
    const yLow = Math.max(pk.y0 + 2, yC - fd * 0.9);
    const xs = p.kickstands === '2' ? [-pw * 0.3, pw * 0.3] : [0];
    for (const x of xs) plate = plate.add(prism(ctx, [[yLow, zP1 - 0.3], [yHigh, zP1 - 0.3], [yC + 0.8, zTip - 0.8 / TAN * 0], [yC, zTip]], x - 1.6, x + 1.6));
  }
  if (p.stand === 'magnets') {
    const m = magnetById(p.magnet);
    const rp = m.d / 2 + 0.1 + 2.0;
    const zTop = T + 0.6;
    const ys = [pk.y0 + rp + 1.5, pk.y1 - rp - 1.5];
    const xs = p.magnetCount === '4' ? [-(bw(pk) / 2 - rp - 2), bw(pk) / 2 - rp - 2] : [0];
    for (const x of xs)
      for (const y of ys) {
        const puck = extrudeZ(ctx, discAt(ctx, x, y, rp), zP1 - 0.01, zTop).subtract(extrudeZ(ctx, discAt(ctx, x, y, m.d / 2 + 0.1), zTop - (m.h - 0.4), zTop + 1));
        plate = plate.add(puck);
      }
    const n = xs.length * ys.length;
    if (!(Math.min(pw, ph) <= MAGNET_CAP[0] + 1e-6 && Math.max(pw, ph) <= MAGNET_CAP[1] + 1e-6)) notes.push({ level: 'warning', message: 'Magnets hold frames up to a 4 × 6 in or A6 print; this one is heavier than they are made for.' });
    magnetNote = `${n} × ${m.d} × ${m.h} mm magnets, glued into the pucks; they hold about ${n * m.holds} g`;
  }

  // The mat inside a deep box: a passe-partout lying in front of the print.
  let mat: Manifold | null = null;
  if (matT) mat = extrudeZ(ctx, rrect(ctx, grow(pb, 0.1), 0.8).subtract(W0.offset(-2.5, 'Round', 2, 12)), F, F + matT);

  // A base or block to stand in.
  let base: Manifold | null = null;
  let g: ReturnType<typeof groove> | null = null;
  if (p.stand === 'base' || p.stand === 'block') {
    const fb = body.boundingBox();
    const fw = fb.max[0] - fb.min[0];
    g = groove(H, fw, T + 0.4, { block: p.stand === 'block', flush: p.stand === 'block' });
    const prof2: [number, number][] = [[0, 0], [g.D, 0], [g.D, g.hb - 1], [g.D - 1, g.hb], [1, g.hb], [0, g.hb - 1]];
    base = prism(ctx, prof2, -g.L / 2, g.L / 2).subtract(prism(ctx, slotProfile(g), -g.slotLength / 2, g.slotLength / 2));
  }

  // Volumes before posing.
  const vol = body.volume() + (inkM?.volume() ?? 0) + plate.volume() + (mat?.volume() ?? 0) + (base?.volume() ?? 0);
  const grams = (vol * 1.24) / 1000;
  if (p.stand === 'magnets') {
    const m = magnetById(p.magnet);
    const n = (p.magnetCount === '4' ? 2 : 1) * 2;
    if (grams + 10 > n * m.holds) notes.push({ level: 'warning', message: `The frame and a print weigh about ${(grams + 10).toFixed(0)} g and ${n} of these magnets hold about ${n * m.holds} g: pick bigger magnets or four of them.` });
  }

  // Print pose: everything face down, mirrored into the right hand, laid out side by side.
  const parts: Part[] = [];
  const add = (m: Manifold | null, name: string, color: RGB, group: string, dx: number, dy = 0, z0 = 0) => {
    if (!m) return;
    const q = ctx.part(m.mirror([1, 0, 0]).translate([dx, dy, -z0]), name, color, { group });
    if (q) parts.push(q);
  };
  const fb = body.boundingBox();
  add(body, 'Frame', p.bodyColor, 'frame', 0);
  add(inkM, 'Words and pattern', p.inkColor, 'frame', 0);
  let x = -(fb.max[0] - fb.min[0]) / 2 - 8;
  const place = (m: Manifold | null, name: string, color: RGB, z0: number) => {
    if (!m) return;
    const bb = m.boundingBox();
    const w = bb.max[0] - bb.min[0];
    // Mirrored: the piece's centre goes to x - w/2.
    add(m, name, color, name.toLowerCase(), x - w / 2 + (bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2 + (fb.min[1] + fb.max[1]) / 2 * 0, z0);
    x -= w + 8;
  };
  place(plate, 'Back plate', p.bodyColor, zP0);
  place(mat, 'Mat', p.matColor, F);
  if (base && g) {
    // The base prints on its bottom, beside the rest.
    const bb = base.boundingBox();
    const q = ctx.part(base.translate([0, fb.min[1] - bb.max[1] - 10, 0]), p.stand === 'block' ? 'Block' : 'Base', p.baseColor, { group: 'base' });
    if (q) parts.push(q);
  }

  // Standing as it is used: face to the front, leaning back on its stand.
  const stand = (m: Manifold) => {
    // Front view to the world: x stays, depth becomes y (back), up becomes z.
    let s = m.mirror([0, 1, -1]).translate([0, 0, -yb]);
    if (p.stand !== 'magnets' && p.stand !== 'keychain' && p.stand !== 'none') s = s.rotate([-15, 0, 0]);
    if (g) s = s.translate([0, g.rest[0] + 0.2 * COS, g.rest[1] - 0.2 * SIN]);
    return s;
  };
  const dyPrev = (fb.max[1] - fb.min[1]) / 2 + 30 + (g ? g.D : 30);
  const pv = (m: Manifold | null, name: string, color: RGB) => {
    if (!m) return;
    const q = ctx.part(stand(m).translate([0, dyPrev, 0]), name, color, { group: 'preview', role: 'preview' });
    if (q) parts.push(q);
  };
  pv(body, 'Frame (standing)', p.bodyColor);
  pv(inkM, 'Words (standing)', p.inkColor);
  pv(plate, 'Back plate (in place)', p.bodyColor);
  pv(mat, 'Mat (in place)', p.matColor);
  pv(extrudeZ(ctx, rrect(ctx, pb, 0.5), F + matT, F + matT + 0.3), 'Your photo', PHOTO);
  if (base && g) {
    const q = ctx.part(base.translate([0, dyPrev, 0]), 'Base (in use)', p.baseColor, { group: 'preview', role: 'preview' });
    if (q) parts.push(q);
  }

  const howTo = `Print the frame face down and the back plate flat, no supports. Slide the plate out to the right, lay the ${pr.name} face down in the pocket, slide the plate back.`;
  notes.push({ level: 'info', message: howTo });
  if (inkM) notes.push({ level: 'info', message: 'The words and pattern are laid into the face’s first three layers (0–0.6 mm): print them with an AMS or another multi-material printer.' });
  if (magnetNote) notes.push({ level: 'info', message: magnetNote + '.' });
  if (p.stand === 'kickstand') notes.push({ level: 'info', message: 'The kickstand prints standing up from the back plate.' });
  const size = `${(fb.max[0] - fb.min[0]).toFixed(0)} × ${(fb.max[1] - fb.min[1]).toFixed(0)} × ${T.toFixed(1)} mm`;
  return { parts, summary: `${size} · holds ${/^[AEIOU]|^A\d/.test(pr.name) ? 'an' : 'a'} ${pr.name} · ≈ ${grams.toFixed(0)} g`, info: { T, zPlate0: zP0, zCeil: zC, pocket: pk, body: b, window: wb } };
}
