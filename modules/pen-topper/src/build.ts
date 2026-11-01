/**
 * Pen topper geometry.
 *
 * The name lies flat on the bed and the pen goes in sideways, through the thickness of the
 * block, so the hole prints without supports: round holes get a pointed roof (a teardrop
 * capped at 1.18 r), hex holes stand on a corner. The hole clears the barrel by a fixed
 * gap and thin ribs stand into that gap to grip; the Fit control moves only the ribs.
 *
 * Frame: everything is built with the pen arriving from −Y (below the name), then the
 * socket parts are turned to the chosen direction.
 */
import type { BuildResult, Contour, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold, ManifoldContext } from '@pf/engine-manifold';
import { bounds, circle, regularPolygon, rect, rotate, roundedRect, translate } from '@pf/shapes';
import { symbolShapes } from '@pf/symbols';
import { text as layoutText } from '@pf/text';

export interface Params {
  name: string;
  secondLine: string;
  font: string;
  size: number;
  line2Scale: number;
  lineGap: number;
  letterSpacing: number;
  boldness: number;
  layout: 'across' | 'along';
  symbol: string;
  symbolPosition: 'left' | 'right' | 'above';
  symbolScale: number;
  symbolGap: number;
  plateShape: 'outline' | 'rectangle' | 'none';
  outlineWidth: number;
  smoothing: number;
  plateThickness: number;
  style: 'raised' | 'engraved';
  textThickness: number;
  chamfer: number;
  pen: string;
  barrelDia: number;
  penPath: 'auto' | 'inset' | 'through' | 'collar';
  socketAngle: number;
  socketOffset: number;
  socketDepth: number;
  wallThickness: number;
  holeShape: 'auto' | 'round' | 'hex';
  fit: 'snug' | 'normal' | 'loose' | 'none';
  ribCount: number;
  boreClearance: number;
  colorScheme: 'single' | 'plate-text' | 'plate-halo-text';
  plateColor: RGB;
  textColor: RGB;
  haloColor: RGB;
  haloWidth: number;
  haloThickness: number;
  ams: boolean;
  showPen: boolean;
}

export interface Pen {
  barrel: number;
  hex?: boolean;
  /** Has no end to sit on: the hole must go straight through. */
  through?: boolean;
  /** A tube that squashes: cap the squeeze. */
  hollow?: boolean;
  /** Soft tip (an eraser) this deep that a socket must get past to reach the barrel. */
  softEnd?: number;
  note: string;
}

export const PENS: Record<string, Pen> = {
  drawstring: { barrel: 5.0, through: true, note: 'Drawstrings and hoodie cords run 4–5 mm; the topper slides along the cord.' },
  straw: { barrel: 6.0, through: true, hollow: true, note: 'A drinking straw is 6 mm across and squashes easily, so the grip is kept light.' },
  'hex-pencil': { barrel: 8.1, hex: true, softEnd: 15, note: 'A #2 pencil is 7 mm across the flats and 8.1 across the corners. Push the topper on from the sharpened end, or past the eraser.' },
  stylus: { barrel: 8.9, note: 'Apple Pencil (every generation) and most styluses: 8.9 mm round.' },
  'bic-cristal': { barrel: 9.6, hex: true, note: 'BIC Cristal: 8.3 mm across the flats, 9.6 across the corners.' },
  'round-pen': { barrel: 10.0, note: 'BIC Round Stic, InkJoy and most click pens: about 10 mm at the cap end.' },
  sharpie: { barrel: 11.5, note: 'Sharpie fine point: 11.5 mm round.' },
  'boba-straw': { barrel: 12.0, through: true, hollow: true, note: 'Bubble tea straws are 12 mm and squash easily, so the grip is kept light.' },
  marker: { barrel: 12.7, note: 'Broad washable markers: 12.7 mm round.' },
};

/** How far each rib stands past the clearance gap, per fit. */
export const RIB_OVERSHOOT: Record<Params['fit'], number> = { snug: 0.12, normal: 0, loose: -0.15, none: 0 };
const ROOF_CAP = 1.18;
const HEX = 1 / Math.cos(Math.PI / 6);

export interface Socket {
  barrel: number;
  hex: boolean;
  path: 'inset' | 'through' | 'collar';
  /** Hole diameter (across corners for hex). */
  bore: number;
  ribHeight: number;
  ribCount: number;
  /** Diameter the ribs leave for the barrel. */
  grip: number;
}

export function socketFor(p: Params): Socket {
  const pen = PENS[p.pen];
  const barrel = p.pen === 'custom' || !pen ? p.barrelDia : pen.barrel;
  const hex = p.holeShape === 'auto' ? Boolean(pen?.hex) : p.holeShape === 'hex';
  const path = p.penPath === 'auto' ? (pen?.through ? 'through' : 'inset') : p.penPath;
  const perSide = hex ? p.boreClearance * HEX : p.boreClearance;
  const bore = barrel + 2 * perSide;
  let ribHeight = Math.max(0.05, p.boreClearance + RIB_OVERSHOOT[p.fit]);
  if (pen?.hollow) ribHeight = Math.min(ribHeight, p.boreClearance + 0.05);
  const ribCount = p.fit === 'none' ? 0 : p.ribCount;
  const grip = ribCount ? bore - 2 * ribHeight * (hex ? HEX : 1) : bore;
  return { barrel, hex, path, bore, ribHeight, ribCount, grip };
}

/** The block thickness that leaves a wall under and over the hole. */
export function minThickness(s: Socket, wall: number): number {
  if (s.path === 'collar') return 1.5;
  const r = s.bore / 2;
  return wall + r + r * (s.hex ? 1 : ROOF_CAP) + wall;
}

/** The hole's cross-section in (x, height) with its centre at (0, 0), ribs left standing. */
function boreProfile(ctx: ManifoldContext<Params>, s: Socket): CrossSection {
  const r = s.bore / 2;
  let prof: CrossSection;
  if (s.hex) prof = ctx.cs([regularPolygon(6, r, 90)]);
  else {
    // Teardrop: tangents at 45° meet above the circle; the point is cut off at ROOF_CAP·r.
    const tip = r * Math.SQRT2;
    const t = r / Math.SQRT2;
    const roof = ctx.cs([[-t, t, 0, -r * 0.2, t, t, 0, tip]]);
    prof = ctx.cs([circle(r)]).add(roof).intersect(ctx.cs([rect(4 * r, r + r * ROOF_CAP)]).translate([0, (r * ROOF_CAP - r) / 2]));
  }
  if (!s.ribCount) return prof;
  // Ribs: thin fins from the wall inwards, evenly round, the first at the bottom.
  const fins: Contour[] = [];
  const reach = s.hex ? r * Math.cos(Math.PI / 6) : r;
  for (let i = 0; i < s.ribCount; i++) {
    const a = -90 + (360 * i) / s.ribCount;
    const fin = translate([rect(s.ribHeight + 2, 1.0)], reach - s.ribHeight + (s.ribHeight + 2) / 2, 0);
    fins.push(...rotate(fin, a));
  }
  return prof.subtract(ctx.cs(fins));
}

/** A profile (x, height) swept along −Y from y = y0 for `len`. */
function sweep(ctx: ManifoldContext<Params>, profile: CrossSection, len: number, y0: number, x: number, z: number): Manifold {
  return ctx.Manifold.extrude(profile, len).rotate([90, 0, 0]).translate([x, y0, z]);
}

interface Content {
  letters: CrossSection;
  symbol: CrossSection | null;
  warnings: Diagnostic[];
}

async function content(ctx: ManifoldContext<Params>, p: Params): Promise<Content> {
  const warnings: Diagnostic[] = [];
  const l1 = await layoutText(p.font, p.name, { capHeight: p.size, letterSpacing: p.letterSpacing, align: 'center' }, ctx.inputs);
  let contours: Contour[] = l1.contours;
  const missing = new Set(l1.missing);
  if (p.secondLine.trim()) {
    const l2 = await layoutText(p.font, p.secondLine, { capHeight: p.size * p.line2Scale, letterSpacing: p.letterSpacing * p.line2Scale, align: 'center' }, ctx.inputs);
    l2.missing.forEach((c) => missing.add(c));
    if (l2.contours.length) {
      const b1 = contours.length ? bounds(contours) : { minY: 0 };
      const b2 = bounds(l2.contours);
      contours = [...contours, ...translate(l2.contours, 0, b1.minY - p.lineGap - b2.maxY)];
    }
  }
  if (missing.size) warnings.push({ level: 'warning', message: `No bundled font has ${[...missing].map((c) => `“${c}”`).join(' ')}; left out.` });
  let letters = ctx.cs(contours, 'NonZero');
  if (p.boldness) letters = letters.offset(p.boldness, 'Round', 2, 32);

  let symbol: CrossSection | null = null;
  if (p.symbol) {
    const shapes = await symbolShapes(p.symbol, p.size * p.symbolScale, ctx.inputs);
    if (shapes.length) {
      symbol = ctx.CrossSection.union(shapes.map((s) => ctx.cs(s.contours, s.fillRule)));
      const lb = letters.isEmpty() ? { min: [0, 0], max: [0, 0] } : letters.bounds();
      const sb = symbol.bounds();
      const midY = (lb.min[1]! + lb.max[1]!) / 2;
      if (p.symbolPosition === 'above') symbol = symbol.translate([(lb.min[0]! + lb.max[0]!) / 2 - (sb.min[0] + sb.max[0]) / 2, lb.max[1]! + p.symbolGap - sb.min[1]]);
      else if (p.symbolPosition === 'right') symbol = symbol.translate([lb.max[0]! + p.symbolGap - sb.min[0], midY - (sb.min[1] + sb.max[1]) / 2]);
      else symbol = symbol.translate([lb.min[0]! - p.symbolGap - sb.max[0], midY - (sb.min[1] + sb.max[1]) / 2]);
    } else warnings.push({ level: 'warning', message: 'That symbol could not be loaded; it is left out.' });
  }
  if (p.layout === 'along') {
    letters = letters.rotate(90);
    symbol = symbol?.rotate(90) ?? null;
  }
  // Centre the design on the origin.
  const all = symbol ? letters.add(symbol) : letters;
  if (!all.isEmpty()) {
    const b = all.bounds();
    const c: [number, number] = [-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2];
    letters = letters.translate(c);
    symbol = symbol?.translate(c) ?? null;
  }
  return { letters, symbol, warnings };
}

function fillHoles(ctx: ManifoldContext<Params>, s: CrossSection): CrossSection {
  return ctx.cs(
    ctx.contours(s).filter((c) => {
      let a = 0;
      for (let i = 0; i < c.length; i += 2) {
        const j = (i + 2) % c.length;
        a += c[i]! * c[j + 1]! - c[j]! * c[i + 1]!;
      }
      return a > 0;
    }),
  );
}

function bevelled(ctx: ManifoldContext<Params>, outline: CrossSection, h: number, chamfer: number, z0 = 0): Manifold {
  const c = Math.min(chamfer, h / 3);
  if (c < 0.05) return ctx.extrude(outline, h, z0);
  const steps = Math.max(2, Math.round(c / 0.1));
  const parts = [ctx.extrude(outline, h - c, z0)];
  for (let i = 1; i <= steps; i++) {
    const s = outline.offset(-(c * i) / steps, 'Round', 2, 32);
    if (!s.isEmpty()) parts.push(ctx.extrude(s, c / steps, z0 + h - c + (c * (i - 1)) / steps));
  }
  return ctx.union(parts);
}

export async function build(ctx: ManifoldContext<Params>): Promise<BuildResult> {
  const p = ctx.params;
  if (!p.name.trim() && !p.secondLine.trim() && !p.symbol) return { parts: [], diagnostics: [{ level: 'info', message: 'Type a name or pick a symbol.' }] };
  const { letters, symbol, warnings } = await content(ctx, p);
  const face = symbol ? letters.add(symbol) : letters;
  if (face.isEmpty()) return { parts: [], diagnostics: [...warnings, { level: 'info', message: 'Nothing to draw yet.' }] };

  const s = socketFor(p);
  const pen = PENS[p.pen];
  const wall = p.wallThickness;
  const r = s.bore / 2;
  const turn = p.socketAngle + 90; // rotates "pen from below" to the chosen direction

  // The backing outline, in the socket frame (pen arriving from −Y).
  let plate: CrossSection;
  if (p.plateShape === 'rectangle') {
    const b = face.bounds();
    const w = b.max[0] - b.min[0] + p.outlineWidth * 2;
    const h = b.max[1] - b.min[1] + p.outlineWidth * 2;
    plate = ctx.cs([roundedRect(w, h, Math.min(w, h) * 0.25)]).translate([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2]);
  } else {
    const grow = p.plateShape === 'none' ? p.outlineWidth * 0.6 : p.outlineWidth;
    const sm = p.smoothing;
    plate = face.offset(grow + sm, 'Round', 2, 48);
    if (sm > 0) plate = plate.offset(-sm, 'Round', 2, 48);
    plate = fillHoles(ctx, plate);
  }
  plate = plate.rotate(-turn);

  // Where the pen meets the backing: the lowest point of a strip along the pen's line.
  const pb = plate.bounds();
  const strip = ctx.cs([rect(Math.max(1, s.bore * 0.6), pb.max[1] - pb.min[1] + 2)]).translate([p.socketOffset, (pb.min[1] + pb.max[1]) / 2]);
  const hit = plate.intersect(strip);
  if (hit.isEmpty()) return { parts: [], diagnostics: [...warnings, { level: 'error', message: 'The socket offset puts the pen beside the name, not under it. Bring the offset closer to 0.' }] };
  const hb = hit.bounds();
  const edge = hb.min[1];
  const far = hb.max[1];
  const span = far - edge;

  const minT = minThickness(s, wall);
  const T = s.path === 'collar' ? p.plateThickness : Math.max(p.plateThickness, minT);
  if (T > p.plateThickness + 1e-6) warnings.push({ level: 'info', message: `Thickened to ${T.toFixed(1)} mm so the ${s.barrel} mm pen has a ${wall} mm wall all round.` });

  const zc = s.path === 'collar' ? r + wall : wall + r;
  const depth = s.path === 'through' ? span + 2 : Math.min(p.socketDepth, span - wall);
  if (s.path === 'inset' && p.socketDepth > span - wall + 1) warnings.push({ level: 'warning', message: `The name is only ${span.toFixed(1)} mm deep along the pen, so the socket is ${depth.toFixed(1)} mm, not ${p.socketDepth}. Make the text bigger, or pick Straight through.` });
  if (pen?.softEnd && s.path === 'inset' && depth < pen.softEnd) warnings.push({ level: 'warning', message: `A pencil's eraser and ferrule are about ${pen.softEnd} mm long; a ${depth.toFixed(0)} mm socket grips only those. Push it on from the sharpened end, or deepen the socket.` });

  // The spine: a strip of backing along the pen so the hole has a wall whatever the text.
  const spineW = s.bore + 2 * wall;
  let backing = plate;
  let collar: Manifold | null = null;
  if (s.path === 'collar') {
    const R = r + wall;
    const tube = ctx.cs([circle(R, 64)]);
    collar = sweep(ctx, tube, p.socketDepth + wall, edge + wall, p.socketOffset, zc);
    // A foot so the round tube does not rock on the bed.
    collar = collar.add(ctx.extrude([rect(R * 1.2, p.socketDepth + wall)], zc * 0.5).translate([p.socketOffset, edge + wall - (p.socketDepth + wall) / 2, 0]));
  } else {
    const len = s.path === 'through' ? span : depth + wall;
    backing = backing.add(ctx.cs([roundedRect(spineW, len, Math.min(spineW / 2 - 0.01, 2))]).translate([p.socketOffset, edge + len / 2]));
  }

  // Back to the design frame.
  backing = backing.rotate(turn);
  let body = bevelled(ctx, backing, T, p.chamfer);
  const toDesign = (m: Manifold) => m.rotate([0, 0, turn]);
  if (collar) body = body.add(toDesign(collar));

  // The hole.
  const profile = boreProfile(ctx, s);
  const holeY0 = s.path === 'collar' ? edge + 0.01 : edge + depth;
  const holeLen = s.path === 'collar' ? p.socketDepth + 1 : depth + 1;
  const hole = toDesign(sweep(ctx, profile, holeLen, holeY0, p.socketOffset, zc));
  body = body.subtract(hole);

  // Letters and halo.
  const parts: Part[] = [];
  const group = 'topper';
  const add = (m: Manifold | null, name: string, color: RGB) => {
    if (!m) return;
    const part = ctx.part(m, name, color, { group });
    if (part) parts.push(part);
  };
  const scheme = p.colorScheme;
  let top = T;
  let halo: Manifold | null = null;
  let letterSolid: Manifold | null = null;
  if (p.style === 'raised') {
    if (scheme === 'plate-halo-text') {
      halo = ctx.extrude(face.offset(p.haloWidth, 'Round', 2, 32).intersect(backing), p.haloThickness, T);
      top = T + p.haloThickness;
    }
    letterSolid = ctx.extrude(face, p.textThickness, top);
  } else {
    const d = Math.min(p.textThickness, T - zc - r * (s.hex ? 1 : ROOF_CAP) - 0.6);
    if (d < p.textThickness) warnings.push({ level: 'warning', message: `Engraving deeper than ${Math.max(0, d).toFixed(1)} mm would break into the pen hole; using that.` });
    if (d > 0.1) {
      const cut = ctx.extrude(face, d + 2, T - d);
      body = body.subtract(cut);
      if (scheme !== 'single') letterSolid = ctx.extrude(face, d, T - d);
    }
  }

  if (scheme === 'single') add(letterSolid && p.style === 'raised' ? body.add(letterSolid) : body, 'Topper', p.plateColor);
  else {
    add(body, 'Body', p.plateColor);
    add(halo, 'Halo', p.haloColor);
    add(letterSolid, 'Letters', p.textColor);
  }

  if (p.showPen) {
    const penProfile = s.hex ? ctx.cs([regularPolygon(6, s.barrel / 2, 90)]) : ctx.cs([circle(s.barrel / 2, 48)]);
    const penLen = 60;
    const inside = s.path === 'through' ? span + 30 : s.path === 'collar' ? p.socketDepth : depth;
    const y0 = s.path === 'collar' ? edge - p.socketDepth + inside : edge + inside;
    const penSolid = toDesign(sweep(ctx, penProfile, inside + penLen, y0, p.socketOffset, zc));
    const part = ctx.part(penSolid, 'Pen (preview)', [150, 170, 200], { group: 'pen', role: 'preview' });
    if (part) parts.push(part);
  }

  const squeeze = s.barrel - s.grip;
  warnings.push({
    level: 'info',
    message: `Hole ${s.bore.toFixed(2)} mm${s.hex ? ' across corners' : ''}${s.ribCount ? `, ${s.ribCount} ribs gripping at ${s.grip.toFixed(2)} mm (${squeeze >= 0 ? `${squeeze.toFixed(2)} mm squeeze` : `${(-squeeze).toFixed(2)} mm play`})` : ', no ribs'}. Print flat, letters up, no supports.`,
  });
  if (pen) warnings.push({ level: 'info', message: pen.note });
  if (!p.ams && scheme !== 'single') {
    const swaps = scheme === 'plate-halo-text' && p.style === 'raised' ? [T, T + p.haloThickness] : [p.style === 'raised' ? T : T - p.textThickness];
    warnings.push({ level: 'info', message: `Without an AMS: pause and swap filament at ${swaps.map((z) => `${z.toFixed(2)} mm`).join(' and ')}.` });
  }
  return { parts, diagnostics: warnings };
}
