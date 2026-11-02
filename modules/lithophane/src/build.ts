/**
 * Lithophanes: a photo as a wall whose thickness follows its tones, so it shows when lit
 * from behind. Flat in six outlines, curved, a cylinder lamp, a cone shade, a globe or a
 * cube lamp; feet, a base with a light, a hanging hole, lamp bases and bulb fittings.
 */
import type { BuildResult, Contour, Diagnostic, Part } from '@pf/core';
import type { Manifold } from '@pf/engine-manifold';
import { circle, rect } from '@pf/shapes';
import type { Built } from './forms';
import { arc, cone, cube, cylinder, discXZ, flat, globe, outlineOf, tools, ySlab } from './forms';
import type { PhotoInput } from './image';
import { decodePhoto } from './image';
import type { Ctx } from './types';

export type { Params } from './types';

/** Bulb fittings: the hole a shade ring sits on, mm. */
export const FITTINGS = { e14: 29, e27: 40.5 } as const;
export const TEALIGHT = 39.5;
const CLEAR = 0.4;

export async function build(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  const notes: Diagnostic[] = [];
  const photo = ctx.inputs.photo as PhotoInput | undefined;
  const g = decodePhoto(photo);
  if (!photo) notes.push({ level: 'info', message: 'Showing the built-in picture: choose a photo in the Photo panel.' });
  const t = tools(ctx, g, notes);
  const T = t.T;

  // The picture's shape, for heights left at 0 ("from the picture").
  const turned = p.turn === '90' || p.turn === '270';
  const aspect = (turned ? g.width : g.height) / (turned ? g.height : g.width);
  const auto = (across: number, band: number) => Math.round(across * aspect + 2 * band);

  let b: Built;
  let W = 0;
  let H = p.height;
  switch (p.form) {
    case 'arc':
      W = p.width;
      H = H > 0 ? H : auto(W - 2 * p.frame, p.frame);
      b = arc(t, W, H);
      break;
    case 'cylinder':
      H = H > 0 ? H : auto(Math.PI * p.diameter, p.rim);
      b = cylinder(t, H);
      break;
    case 'cone':
      H = H > 0 ? H : auto((Math.PI * (p.diameter + p.topDiameter)) / 2, p.rim);
      b = cone(t, H);
      break;
    case 'globe':
      b = globe(t);
      break;
    case 'cube':
      H = H > 0 ? H : auto(4 * p.side, p.rim);
      b = cube(t, H);
      break;
    default:
      W = p.width;
      H = H > 0 ? H : auto(W - 2 * p.frame, p.frame);
      b = flat(t, W, H);
  }
  if (p.maxThickness - p.minThickness < 1.2) notes.push({ level: 'info', message: 'Less than 1.2 mm between the thinnest and thickest wall gives a faint picture; 0.8 to 3 mm is usual.' });

  let body = b.body;
  let base: Manifold | null = null;
  let flipped = false;
  const flatLike = p.form === 'flat' || p.form === 'arc';

  // Hanging hole: a tab over the top edge's middle.
  if (flatLike && p.stand === 'hole') {
    const top = p.form === 'flat' ? topAt(outlineOf(p, W, H), 0) : H;
    const r = Math.max(1.5, p.holeDia / 2);
    const R = r + 3;
    const cz = top + r + 1;
    const y0 = p.relief === 'front' ? -T : 0;
    const y1 = y0 + T;
    const tab = discXZ(ctx, 0, cz, R).add(ctx.cs([rect(R * 1.2, cz - top + 3)]).translate([0, (cz + top - 3) / 2]));
    body = body.add(ySlab(ctx, tab, y0, y1)).subtract(ySlab(ctx, discXZ(ctx, 0, cz, r), y0 - 1, y1 + 1));
  }

  // Feet, or a base when the bottom is not flat.
  let stand = flatLike ? p.stand : 'none';
  if (p.form === 'arc' && (stand === 'feet' || stand === 'base')) stand = 'none';
  if (stand === 'feet' && b.panel && !b.panel.flatBottom) {
    notes.push({ level: 'info', message: 'Feet need a flat bottom edge; this outline stands in a base instead.' });
    stand = 'base';
  }
  if (stand === 'feet' && b.panel) {
    const fd = Math.max(16, Math.min(40, H * 0.2));
    const fh = Math.min(3, Math.max(1.5, p.frame));
    const cy = (b.panel.y0 + b.panel.y1) / 2;
    const xs = [-(W / 2 - 8), W / 2 - 8];
    for (const x of xs) body = body.add(ctx.edged(ctx.cs([rect(12, fd)]).translate([x, cy]), fh, { top: 0.8, style: 'chamfer' }));
  }
  if (stand === 'base' && b.panel) base = panelBase(ctx, W, b.panel.y1 - b.panel.y0, notes);

  // Lamps: a bulb fitting at the top, a base underneath.
  if (b.lamp && (p.form === 'cylinder' || p.form === 'cone') && p.fitting !== 'none') {
    const hole = p.fitting === 'custom' ? Math.max(10, p.fittingHole) : FITTINGS[p.fitting];
    const ro = hole / 2 + 6;
    const reach = b.lamp.topIn + 1;
    if (ro + 3 > b.lamp.topIn) notes.push({ level: 'warning', message: `The top is too narrow for a ${hole} mm fitting ring; make the top wider.` });
    else {
      if (p.rim < 3) notes.push({ level: 'info', message: 'The fitting spokes are 3 mm deep: a top rim of 3 mm or more keeps them off the picture.' });
      let spider = ctx.cs([circle(ro, 96)]).subtract(ctx.cs([circle(hole / 2, 96)]));
      for (let k = 0; k < 3; k++) {
        const a = (k * 120 + 90) * (Math.PI / 180);
        const L = reach - hole / 2;
        spider = spider.add(ctx.cs([rect(L, 6)]).translate([hole / 2 + L / 2, 0]).rotate((a * 180) / Math.PI));
      }
      spider = spider.subtract(ctx.cs([circle(hole / 2, 96)]));
      body = body.add(ctx.extrude(spider, 3, b.lamp.H - 3));
      // Spokes print best on the bed: the lamp prints upside down.
      flipped = true;
    }
  }
  if (b.lamp && p.lampBase !== 'none') base = lampBase(ctx, b.lamp, notes);

  // Print pose.
  if (flipped) {
    const H2 = body.boundingBox().max[2];
    body = body.rotate([180, 0, 0]).translate([0, 0, H2]);
  }
  if (p.form === 'flat' && p.printLying && stand !== 'feet') body = body.rotate([p.relief === 'front' ? -90 : 90, 0, 0]);
  const bb = body.boundingBox();
  body = body.translate([0, 0, -bb.min[2]]);

  const parts: Part[] = [];
  const lp = ctx.part(body, 'Lithophane', p.lithoColor, { group: 'lithophane' });
  if (lp) parts.push(lp);
  if (base) {
    const qb = base.boundingBox();
    const placed = flatLike ? base.translate([0, body.boundingBox().min[1] - qb.max[1] - 10, -qb.min[2]]) : base.translate([body.boundingBox().max[0] - qb.min[0] + 10, 0, -qb.min[2]]);
    const q = ctx.part(placed, 'Base', p.baseColor, { group: 'base' });
    if (q) parts.push(q);
  }

  // Notes.
  notes.push({ level: 'info', message: 'Print it in white or natural PLA at 100 % infill, 0.12 mm layers or finer. The wall thickness is the picture, so slicers must not thin it: no ironing, no variable layer height.' });
  if (p.form === 'flat' && !p.printLying) notes.push({ level: 'info', message: 'It prints standing up, the way the detail comes out sharpest: add a brim and print slowly near the top.' });
  if (flipped) notes.push({ level: 'info', message: 'It prints upside down, the fitting ring and spokes on the bed.' });
  if (b.lamp && p.lampBase !== 'none') notes.push({ level: 'info', message: 'Use an LED tealight or LED puck light only, never a flame.' });
  if (b.lamp) notes.push({ level: 'info', message: 'Light it from inside; the picture faces outward.' });
  const s = body.boundingBox();
  const vol = body.volume() + (base?.volume() ?? 0);
  const size = `${(s.max[0] - s.min[0]).toFixed(0)} × ${(s.max[1] - s.min[1]).toFixed(0)} × ${(s.max[2] - s.min[2]).toFixed(0)} mm`;
  return { parts, summary: `${size} · ${p.minThickness}–${p.maxThickness} mm walls · ≈ ${((vol * 1.24) / 1000).toFixed(0)} g`, diagnostics: notes };
}

/** The highest point of a contour's edge on the vertical line through x. */
function topAt(c: Contour, x: number): number {
  let top = -Infinity;
  const n = c.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = c[i * 2]!;
    const ay = c[i * 2 + 1]!;
    const bx = c[((i + 1) % n) * 2]!;
    const by = c[((i + 1) % n) * 2 + 1]!;
    if ((ax <= x && bx >= x) || (bx <= x && ax >= x)) {
      const k = bx === ax ? 0 : (x - ax) / (bx - ax);
      top = Math.max(top, ay + (by - ay) * k);
    }
  }
  return top;
}

/**
 * A base a flat panel stands in: a slot for its bottom edge, and behind it a channel for
 * an LED strip or a pocket for an LED tealight, so the light comes from behind.
 */
function panelBase(ctx: Ctx, W: number, T: number, notes: Diagnostic[]): Manifold {
  const p = ctx.params;
  const L = W + 14;
  const sw = T + CLEAR;
  const sd = 8;
  const front = 6;
  const hb = p.baseLight === 'tealight' ? 18 : 14;
  let behind = 6;
  if (p.baseLight === 'strip') behind = 3 + 11 + 5;
  if (p.baseLight === 'tealight') behind = 3 + TEALIGHT + 5;
  const D = front + sw + behind;
  // Built with its front at y = 0, the slot's middle on y = front + sw / 2.
  let m = ctx.edged(ctx.cs([rect(L, D)]).translate([0, D / 2]), hb, { top: 1.2, style: 'chamfer' });
  const ys = front + sw / 2;
  m = m.subtract(ctx.extrude(ctx.cs([rect(W + 0.6, sw)]).translate([0, ys]), sd + 1, hb - sd));
  const yb = front + sw + 3;
  if (p.baseLight === 'strip') {
    // An open channel along the base and a cable hole out of one end.
    m = m.subtract(ctx.extrude(ctx.cs([rect(W, 11)]).translate([0, yb + 5.5]), 5, hb - 4));
    const len = (L - W) / 2 + 1;
    m = m.subtract(ctx.extrude(ctx.cs([circle(2.75, 32)]), len + 1).rotate([0, 90, 0]).translate([-L / 2 - 1, yb + 5.5, hb - 2.5]));
    notes.push({ level: 'info', message: 'The channel takes a 10 mm LED strip; its cable leaves through the hole in the left end.' });
  } else if (p.baseLight === 'tealight') {
    m = m.subtract(ctx.extrude(ctx.cs([circle(TEALIGHT / 2, 96)]).translate([0, yb + TEALIGHT / 2]), 13, hb - 12));
  }
  return m;
}

/**
 * A base a lamp stands on: a lip that fits inside its bottom rim, and a pocket for an LED
 * tealight or an LED puck (with a groove for its cable).
 */
function lampBase(ctx: Ctx, lamp: NonNullable<Built['lamp']>, notes: Diagnostic[]): Manifold {
  const p = ctx.params;
  const th = 5;
  const lipH = 3;
  const square = lamp.shape === 'square';
  const shape = (r: number) => (square ? ctx.cs([rect(2 * r, 2 * r)]) : ctx.cs([circle(r, 128)]));
  const outer = lamp.rOut + 4;
  let m = ctx.edged(shape(outer), th, { top: 1, style: 'chamfer' });
  const lo = lamp.rIn - 0.3;
  const li = lo - 2.5;
  if (li > 3) m = m.add(ctx.extrude(shape(lo).subtract(shape(li)), lipH, th - 0.01));
  const d = p.lampBase === 'puck' ? p.puckDia + 0.5 : TEALIGHT;
  if (d / 2 > li) notes.push({ level: 'warning', message: `The ${p.lampBase === 'puck' ? 'puck' : 'tealight'} (${d.toFixed(0)} mm) is wider than the lamp's opening; make the lamp wider.` });
  m = m.subtract(ctx.extrude(ctx.cs([circle(d / 2, 96)]), 3, th - 3 + 0.01));
  if (p.lampBase === 'puck') m = m.subtract(ctx.extrude(ctx.cs([rect(outer + 2, 4)]).translate([(outer + 2) / 2, 0]), 3, th - 3 + 0.01));
  return m;
}
