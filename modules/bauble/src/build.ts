/**
 * Christmas (and other holiday) ornaments: a hollow bauble with a screw-on cap, a flat
 * ornament, or a star for the top of the tree.
 */
import type { BuildResult, Diagnostic, Part } from '@pf/core';
import type { CrossSection, Manifold } from '@pf/engine-manifold';
import { circle, pointInside, rect } from '@pf/shapes';
import { artSection } from './art';
import { buildBauble } from './bauble';
import { flatDrawing, scaled } from './flat';
import type { Pt } from './lathe';
import { lathe, resample } from './lathe';
import type { Ctx } from './types';

export type { Params } from './types';
export { FLAT_SHAPES, TOPPERS } from './types';
export { SHAPES } from './shapes';
export { THEMES } from './patterns';
export { patternFor, threadWave, THREAD } from './bauble';

export async function build(ctx: Ctx): Promise<BuildResult> {
  const notes: Diagnostic[] = [];
  const p = ctx.params;
  const r = p.product === 'flat' ? await buildFlat(ctx, notes) : p.product === 'topper' ? await buildTopper(ctx, notes) : await buildBauble(ctx, notes);
  return { parts: r.parts, summary: r.summary, diagnostics: notes };
}

/** The highest point of an outline (the middle of a flat top). */
function topOf(ctx: Ctx, cs: CrossSection): [number, number] {
  let y = -Infinity;
  for (const c of ctx.contours(cs)) for (let i = 1; i < c.length; i += 2) y = Math.max(y, c[i]!);
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const c of ctx.contours(cs))
    for (let i = 0; i < c.length; i += 2)
      if (c[i + 1]! > y - 0.4) {
        x0 = Math.min(x0, c[i]!);
        x1 = Math.max(x1, c[i]!);
      }
  return [(x0 + x1) / 2, y];
}

const disc = (ctx: Ctx, x: number, y: number, r: number) => ctx.cs([circle(r, 64)]).translate([x, y]);
const box = (ctx: Ctx, x0: number, y0: number, x1: number, y1: number) => ctx.cs([rect(x1 - x0, y1 - y0)]).translate([(x0 + x1) / 2, (y0 + y1) / 2]);

/** The body, rounded on top, and its raised decoration (with the name or logo at `spot`). */
async function slab(ctx: Ctx, body: CrossSection, deco: CrossSection | null, spot: [number, number], t: number, notes: Diagnostic[]) {
  const p = ctx.params;
  const art = await artSection(ctx, notes);
  let raised: CrossSection | null = p.decoration ? deco : null;
  if (art) raised = raised ? raised.add(art.translate(spot)) : art.translate(spot);
  if (raised) raised = raised.intersect(body.offset(-0.8, 'Round', 2, 16));
  const round = Math.max(0, Math.min(p.edgeRound, t / 2 - 0.05));
  const solid = round > 0 ? ctx.edged(body, t, { top: round, style: 'round' }) : ctx.extrude(body, t);
  // The decoration stands on the flat part of the top, clear of the rounding.
  if (raised && round > 0) raised = raised.intersect(body.offset(-round, 'Round', 2, 16));
  const top = raised && !raised.isEmpty() ? ctx.extrude(raised, Math.max(0.2, p.decoHeight), t) : null;
  return { solid, top };
}

function pushParts(ctx: Ctx, parts: Part[], solid: Manifold, top: Manifold | null, name: string, group: string, notes: Diagnostic[], t: number) {
  const p = ctx.params;
  const add = (m: Manifold, n: string, c: typeof p.ornamentColor) => {
    const part = ctx.part(m, n, c, { group });
    if (part) parts.push(part);
  };
  if (!top) add(solid, name, p.ornamentColor);
  else if (p.colorMode === 'single') add(solid.add(top), name, p.ornamentColor);
  else {
    add(solid, name, p.ornamentColor);
    add(top, 'Decoration', p.decoColor);
    if (p.colorMode === 'swap') notes.push({ level: 'info', message: `Without an AMS: add a pause at ${t.toFixed(2)} mm (the first layer of the decoration) and swap filament there.` });
  }
}

async function buildFlat(ctx: Ctx, notes: Diagnostic[]): Promise<{ parts: Part[]; summary: string }> {
  const p = ctx.params;
  const t = Math.max(1.2, p.flatThickness);
  const dr = scaled(flatDrawing(ctx, p.flatShape), p.flatHeight);
  let body = dr.body;
  if (p.loop) {
    const [x, y] = topOf(ctx, body);
    const rh = Math.max(1.5, p.loopHole) / 2;
    const ro = rh + 2.4;
    const cy = y + rh + 0.6;
    body = body.add(disc(ctx, x, cy, ro)).add(box(ctx, x - ro * 0.55, y - 3, x + ro * 0.55, cy)).subtract(disc(ctx, x, cy, rh));
  }
  const { solid, top } = await slab(ctx, body, dr.deco, dr.spot, t, notes);
  const parts: Part[] = [];
  pushParts(ctx, parts, solid, top, 'Ornament', 'ornament', notes, t);
  const b = body.bounds();
  const grams = ((solid.volume() + (top?.volume() ?? 0)) * 1.24) / 1000;
  notes.push({ level: 'info', message: 'Slicer: prints flat as it is, no supports. 2–3 walls, 15 % infill.' });
  return { parts, summary: `${(b.max[0] - b.min[0]).toFixed(0)} × ${(b.max[1] - b.min[1]).toFixed(0)} × ${(t + (top ? p.decoHeight : 0)).toFixed(1)} mm · ≈ ${grams.toFixed(1)} g` };
}

/** The tongue's length into the socket's slot. */
const SLOT = 14;

async function buildTopper(ctx: Ctx, notes: Diagnostic[]): Promise<{ parts: Part[]; summary: string }> {
  const p = ctx.params;
  const t = Math.max(3, p.topperThickness);
  const fit = Math.max(0, p.fitClearance);

  // The socket: a tapered sleeve over the tree's tip, a solid head with a slot across it.
  const rb = p.tipDiameter / 2 + 0.5; // the mouth, a loose fit over the shoot
  const rt = Math.max(3, rb * 0.6); // the bore narrows to grip
  const D = Math.max(10, p.socketDepth);
  const wallS = 2;
  const rh = Math.max(rt + wallS, t / 2 + 4);
  const floor = 3;
  const Hs = D + floor + SLOT;
  const outerPts: Pt[] = [[0, 0], [rb + wallS, 0], [rh, D], [rh, Hs], [0, Hs]];
  // The bore ends in a 45° cone, so its ceiling needs no support.
  const borePts: Pt[] = [[0, -1], [rb, -1], [rb, 0], [rt, D], [0, D + rt]];
  const cols = 160;
  const outer = lathe(ctx.wasm, resample(outerPts, () => 2), cols);
  const bore = lathe(ctx.wasm, resample(borePts, () => 2), cols);
  const slotW = t + 2 * fit;
  const slot = ctx.Manifold.cube([2 * rh + 2, slotW, SLOT + 1]).translate([-rh - 1, -slotW / 2, Hs - SLOT]);
  const socket = outer.subtract(bore).subtract(slot);

  // The star, flat on the bed, a tongue below it as wide as the socket's head, running up
  // into the star's middle.
  const dr = scaled(flatDrawing(ctx, p.topper), p.topperHeight);
  let join = 0;
  const outline = ctx.contours(dr.body);
  while (join < p.topperHeight && !pointInside(outline, 0, join)) join += 0.5;
  const body = dr.body.add(box(ctx, -rh, -SLOT, rh, join + 3));
  const { solid: starSolid, top } = await slab(ctx, body, dr.deco, dr.spot, t, notes);

  const parts: Part[] = [];
  const W = dr.body.bounds();
  pushParts(ctx, parts, starSolid, top, 'Star', 'star', notes, t);
  const sx = Math.max(W.max[0], rh) + rb + wallS + 10;
  const sock = ctx.part(socket.translate([sx, 0, 0]), 'Socket', p.ornamentColor, { group: 'socket' });
  if (sock) parts.push(sock);
  // Assembled, beside the print layout: the star standing in the socket.
  const ax = -sx - Math.max(W.max[0], rh) - 10;
  const upright = (m: Manifold) => m.translate([0, 0, -t / 2]).rotate([90, 0, 0]).translate([ax, 0, Hs]);
  const pv = (m: Manifold, n: string, c: typeof p.ornamentColor) => {
    const q = ctx.part(m, n, c, { group: 'preview', role: 'preview' });
    if (q) parts.push(q);
  };
  pv(socket.translate([ax, 0, 0]), 'Socket (assembled)', p.ornamentColor);
  pv(upright(starSolid), 'Star (assembled)', p.ornamentColor);
  if (top) pv(upright(top), 'Decoration (assembled)', p.colorMode === 'single' ? p.ornamentColor : p.decoColor);

  const grams = ((starSolid.volume() + (top?.volume() ?? 0) + socket.volume()) * 1.24) / 1000;
  notes.push({ level: 'info', message: `Slicer: the star flat, the socket upright on its mouth; no supports. The tongue is ${t} mm thick and the slot ${slotW.toFixed(2)} mm, a push fit with no glue.` });
  return { parts, summary: `Star ${(W.max[0] - W.min[0]).toFixed(0)} × ${(W.max[1] - W.min[1]).toFixed(0)} mm · socket Ø${(2 * (rb + wallS)).toFixed(0)} × ${Hs.toFixed(0)} mm · ≈ ${grams.toFixed(1)} g` };
}
