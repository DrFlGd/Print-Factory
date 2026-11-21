/**
 * Upright, turned tree toppers. Unlike the flat stars, these print as a single piece:
 * a decorative lathed finial with a tapered socket up its centre to fit the tree tip.
 */
import type { Diagnostic, Part } from '@pf/core';
import { star } from '@pf/shapes';
import type { Pt } from './lathe';
import { lathe, resample } from './lathe';
import type { Ctx, FinialStyle } from './types';

const PROFILES: Record<FinialStyle, readonly [number, number][]> = {
  'classic-finial': [[0, .8], [.04, .82], [.09, .68], [.12, .84], [.18, 1], [.25, .78], [.32, .45], [.40, .55], [.46, .3], [.57, .42], [.64, .22], [.74, .34], [.8, .2], [1, .18]],
  'palace-finial': [[0, .8], [.06, .9], [.1, .6], [.16, .77], [.24, 1], [.31, .9], [.36, .55], [.44, .6], [.5, .32], [.58, .5], [.66, .27], [.75, .4], [.85, .24], [1, .18]],
  'retro-finial': [[0, .8], [.06, .78], [.10, .9], [.14, .65], [.18, .65], [.26, 1], [.31, .67], [.38, .32], [.45, .43], [.5, .3], [.64, .29], [.76, .26], [1, .17]],
  'onion-finial': [[0, .8], [.05, .9], [.1, .72], [.16, .8], [.24, 1], [.34, .75], [.4, .37], [.48, .25], [.54, .31], [.62, .19], [.70, .25], [.82, .2], [1, .15]],
  'double-ball-finial': [[0, .8], [.05, .84], [.08, .75], [.12, .85], [.2, 1], [.28, .75], [.32, .34], [.37, .55], [.43, .65], [.49, .55], [.54, .25], [.61, .36], [.68, .45], [.74, .32], [.84, .22], [1, .17]],
  'beaded-finial': [[0, .8], [.06, .8], [.09, .9], [.13, .68], [.18, 1], [.25, .75], [.3, .4], [.33, .46], [.37, .31], [.42, .49], [.47, .3], [.52, .46], [.57, .27], [.63, .4], [.68, .22], [.76, .34], [.81, .18], [1, .15]],
};

export function isFinial(value: string): value is FinialStyle {
  return Object.prototype.hasOwnProperty.call(PROFILES, value);
}

export function buildFinial(ctx: Ctx, style: FinialStyle, notes: Diagnostic[]): { parts: Part[]; summary: string } {
  const p = ctx.params;
  const H = Math.max(60, p.topperHeight);
  const tipR = Math.max(3, p.tipRadius);
  const shaftH = H - Math.max(4, 1.3 * tipR);
  const mouthR = p.tipDiameter / 2 + .5;
  // The opening always has at least 2.5 mm material around it, even for a thick tree shoot.
  const R = Math.max(p.finialDiameter / 2, (mouthR + 2.5) / .8);
  const pts: Pt[] = [[0, 0]];
  for (const [u, r] of PROFILES[style]) pts.push([R * r, u * shaftH]);
  pts.push([0, shaftH]);
  const outer = lathe(ctx.wasm, resample(pts, () => .55), 192);
  const boreH = Math.min(p.socketDepth, shaftH * .27);
  const topR = Math.max(3, mouthR * .55);
  const bore: Pt[] = [[0, -1], [mouthR, -1], [mouthR, 0], [topR, boreH], [0, boreH + topR]];
  const socket = lathe(ctx.wasm, resample(bore, () => .5), 160);
  let body = outer.subtract(socket);

  if (p.tipOrnament === 'ball') {
    // A round cap overlaps the shaft so the export is one connected solid.
    body = body.add(ctx.Manifold.sphere(tipR, 40).translate([0, 0, H - tipR]));
  } else if (p.tipOrnament === 'drop') {
    const drop: Pt[] = [
      [0, shaftH - tipR], [tipR * .38, shaftH - tipR], [tipR * .75, shaftH + tipR * .1],
      [tipR, shaftH + tipR * .65], [tipR * .68, shaftH + tipR * 1.25], [0, H],
    ];
    body = body.add(lathe(ctx.wasm, resample(drop, () => .25), 96));
  } else {
    // Thin upright star; the bottom point overlaps the shaft by several millimetres.
    const outline = ctx.cs([star(5, tipR * 2.7, tipR * 1.15, 90)]);
    const flat = ctx.extrude(outline, 2.5).rotate([90, 0, 0]).translate([0, 1.25, H - tipR * 1.1]);
    body = body.add(flat);
  }
  const part = ctx.part(body, 'Tree finial', p.ornamentColor, { group: 'finial' });
  const grams = (body.volume() * 1.24) / 1000;
  if (R * 2 > p.finialDiameter + .01) notes.push({ level: 'warning', message: 'The base diameter was widened to leave enough wall around the tree-tip socket.' });
  notes.push({ level: 'info', message: `Slicer: stand the finial upright as shown, normal mode, 3 walls and a brim. Tapered socket Ø${(2 * mouthR).toFixed(1)} mm at the mouth, ${boreH.toFixed(0)} mm deep; test the fit on your tree before a full print.` });
  return { parts: part ? [part] : [], summary: `Ø${(R * 2).toFixed(0)} × ${H.toFixed(0)} mm · ≈ ${grams.toFixed(1)} g` };
}
