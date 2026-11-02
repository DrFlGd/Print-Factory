/**
 * Model mode: a clicker made from your own 3D model, in one of three ways.
 *
 *  - Slice: one level cut. Everything above it is the button, lifted by the travel so the
 *    model is whole again when it is pressed. "Hide the gap" runs the cut through a collar:
 *    the bottom keeps the model's skin for 8 mm above the cut and the top slides inside it
 *    on a pillar, so at rest you see a groove instead of the switch, and the top cannot wobble.
 *  - Stand: the model is not cut. It stands on a plate that presses the switch, in a base like
 *    the picture clicker's. Works with any model.
 *  - Button: a round or square button is cut down into the model's top; the switch goes in
 *    through its bore, and the rest of the model stays whole.
 *
 * Every moving piece is solid down to the switch post's bottom, so it prints upright with the
 * post on the bed; the static piece holds the socket. Behaviour after the Vostok Labs
 * Clicker Generator's model mode; the geometry is written for Print Factory.
 */
import type { Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold } from '@pf/engine-manifold';
import type { StoredMesh } from '@pf/mesh';
import { isStoredMesh, meshSolid } from '@pf/mesh';
import { bounds, circle, poleOf, rect, rectSize, roundedRect } from '@pf/shapes';
import type { Ctx, Params } from './types';
import { CAP_WALL, FLOOR, MX, heights, stemPost } from './switch';

/** The gap a full press leaves between the halves, mm. */
const PRESSED_GAP = 0.35;
/** How far a hidden seam's collar rises above the cut, mm. */
const COLLAR = 8;
/** The collar's wall, mm. */
const SKIN = 1.6;
/** The thinnest wall round the switch the build accepts, mm. */
const WALL = 1.2;
/** Room round the switch housing, per side. */
const CLEAR = 0.5;
/** The square the switch needs above the plate, and with its walls. */
const ROOM = MX.housing + 2 * CLEAR;
const WALLED = ROOM + 2 * WALL;
/** The clips' pocket under the plate with its walls. */
const UNDER = MX.pocket + 2 * WALL;
/** Under the plate: the clips' pocket and the pins, then a floor. */
const BELOW = MX.pinsBelow + 0.4 + FLOOR;
/** Smallest button that lets the switch's housing through its bore, by shape. */
export const BUTTON_MIN = { round: Math.ceil(Math.SQRT2 * ROOM * 10) / 10, square: Math.ceil(ROOM * 10) / 10 } as const;

const lift = () => MX.travel + PRESSED_GAP;
/** From the moving piece's lowest plane (the post's bottom) down to the plate, at rest. */
const postDrop = MX.stemTop - MX.insert;

/* ------------------------------------------------------------------ the model */

/** The model, turned, scaled to its longest side, its bottom flattened, centred on the bed. */
function placedModel(ctx: Ctx, notes: Diagnostic[]): { m: Manifold; H: number } {
  const p = ctx.params;
  const stored = ctx.inputs.model;
  let m = isStoredMesh(stored) ? meshSolid(ctx, stored as StoredMesh) : sample(ctx);
  if (!isStoredMesh(stored)) notes.push({ level: 'info', message: 'Showing the built-in toadstool: choose your own STL, 3MF or OBJ in the 3D model panel.' });
  const up: Record<Params['modelUp'], [number, number, number]> = { z: [0, 0, 0], '-z': [180, 0, 0], y: [90, 0, 0], '-y': [-90, 0, 0], x: [0, -90, 0], '-x': [0, 90, 0] };
  m = m.rotate(up[p.modelUp] ?? [0, 0, 0]).rotate([0, 0, p.modelSpin]);
  let bb = m.boundingBox();
  const longest = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
  m = m.scale(Math.max(5, p.modelSize) / longest);
  bb = m.boundingBox();
  m = m.translate([-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2]]);
  // Flatten: shave the bottom until it stands on a fair footprint (auto), or by what was asked.
  let cut = p.flatten;
  if (!(cut > 0)) {
    const w = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]);
    const want = Math.PI * (0.15 * w) ** 2;
    cut = 0;
    for (let z = 0.2; z < (bb.max[2] - bb.min[2]) * 0.25; z += 0.2) {
      if (m.slice(z).area() >= want) break;
      cut = z;
    }
  }
  if (cut > 0) {
    m = m.trimByPlane([0, 0, 1], cut).translate([0, 0, -cut]);
    if (p.flatten > 0 || cut > 0.3) notes.push({ level: 'info', message: `${cut.toFixed(1)} mm shaved off the bottom so it stands flat.` });
  }
  bb = m.boundingBox();
  return { m, H: bb.max[2] - bb.min[2] };
}

/** A toadstool drawn here, so model mode shows a clicker before a file is chosen. */
function sample(ctx: Ctx): Manifold {
  const M = ctx.Manifold;
  const stem = M.cylinder(26, 19, 17, 96);
  const capDome = M.sphere(27, 128).scale([1, 1, 0.65]).trimByPlane([0, 0, 1], 0).translate([0, 0, 22]);
  const rim = M.cylinder(3, 27, 27, 128).translate([0, 0, 20]);
  let cap = capDome.add(rim);
  for (const [x, y, r] of [[10, 6, 4], [-8, 11, 3.2], [-12, -6, 3.6], [6, -12, 3], [0, 0, 3.8]] as const) {
    const z = 22 + 0.65 * Math.sqrt(Math.max(0, 27 * 27 - x * x - y * y));
    cap = cap.subtract(M.sphere(r, 32).scale([1, 1, 0.5]).translate([x, y, z + 0.4]));
  }
  return stem.add(cap);
}

const keepAbove = (m: Manifold, z: number) => m.trimByPlane([0, 0, 1], z);
const keepBelow = (m: Manifold, z: number) => m.trimByPlane([0, 0, -1], -z);
const box = (ctx: Ctx, side: number, x: number, y: number, z0: number, z1: number) => ctx.extrude([rect(side, side)], z1 - z0, z0).translate([x, y, 0]);

/** The switch's static half in model coordinates: room for the housing, the plate cutout, the clips' pocket. */
function socket(ctx: Ctx, x: number, y: number, plate: number, top: number): Manifold {
  const fit = ctx.params.socketFit;
  return box(ctx, ROOM, x, y, plate, top)
    .add(box(ctx, MX.cutout + fit, x, y, plate - MX.plate - 0.01, plate + 0.01))
    .add(box(ctx, MX.pocket, x, y, plate - MX.pinsBelow - 0.4, plate - MX.plate));
}

/** The moving half's switch room: a pocket from its bottom `z`, the post in it. */
function pocketAndPost(ctx: Ctx, piece: Manifold, x: number, y: number, z: number): Manifold {
  const h = heights(ctx.params);
  return piece.subtract(box(ctx, ROOM, x, y, z - 1, z + h.cavity)).add(stemPost(ctx, ctx.params.stemFit, h.cavity + 0.01).translate([x, y, z]));
}

/** The part of the plane inside every section from z0 to z1. */
function common(ctx: Ctx, m: Manifold, z0: number, z1: number): CrossSection {
  let s: CrossSection | null = null;
  const n = Math.max(2, Math.ceil((z1 - z0) / 0.75) + 1);
  for (let i = 0; i < n; i++) {
    const c = m.slice(z0 + ((z1 - z0) * i) / (n - 1)).simplify(0.05);
    s = s ? s.intersect(c) : c;
    if (s.isEmpty()) break;
  }
  return s ?? ctx.CrossSection.square([0, 0]);
}

/** Does the section hold a square of `side` centred at `xy`? (A sliver outside is curvature.) */
function contains(ctx: Ctx, s: CrossSection, side: number, xy: [number, number]): boolean {
  return ctx.cs([rect(side, side)]).translate(xy).subtract(s).area() < 0.5;
}

/** Where a square of `side` fits inside a section, nearest its deepest point, or null. */
function seat(ctx: Ctx, s: CrossSection, side: number): [number, number] | null {
  if (s.isEmpty()) return null;
  const inner = s.offset(-side / 2, 'Miter', 2);
  if (inner.isEmpty()) return null;
  const pole = poleOf(ctx.contours(inner), 0.2);
  return contains(ctx, s, side, [pole.x, pole.y]) ? [pole.x, pole.y] : null;
}

/* ------------------------------------------------------------------ the three cutters */

export interface ModelBuild {
  parts: Part[];
  summary: string;
}

export async function buildModel(ctx: Ctx, notes: Diagnostic[], body: (wells: CrossSection, sockets: [number, number][]) => { body: Manifold; outline: CrossSection }): Promise<ModelBuild> {
  const p = ctx.params;
  const { m, H } = placedModel(ctx, notes);
  if (p.cutter === 'stand') return stand(ctx, notes, m, H, body);
  if (p.cutter === 'button') return button(ctx, notes, m, H);
  return slice(ctx, notes, m, H);
}

function out(ctx: Ctx, pieces: { m: Manifold; name: string; color: RGB; at: [number, number, number] }[]): Part[] {
  const p = ctx.params;
  const parts: Part[] = [];
  let x = 0;
  for (const piece of pieces) {
    const b = piece.m.boundingBox();
    const placed = piece.m.translate([x - b.min[0], -(b.min[1] + b.max[1]) / 2, -b.min[2]]);
    x += b.max[0] - b.min[0] + 8;
    const part = ctx.part(placed, piece.name, piece.color, { group: piece.name });
    if (part) parts.push(part);
  }
  if (p.showAssembled) {
    const ox = x + 20;
    for (const piece of pieces) {
      const part = ctx.part(piece.m.translate([ox + piece.at[0], piece.at[1], piece.at[2]]), `${piece.name} (assembled)`, piece.color, { group: 'preview', role: 'preview' });
      if (part) parts.push(part);
    }
  }
  return parts;
}

const grams = (m: Manifold) => (m.volume() / 1000) * 1.24;

function slice(ctx: Ctx, notes: Diagnostic[], m: Manifold, H: number): ModelBuild {
  const p = ctx.params;
  const h = heights(p);
  const L = lift();
  // Bottom of the switch's room for a cut at z, and the top of the moving half's.
  const low = (z: number) => z + L - postDrop - BELOW;
  const high = (z: number) => z + h.cavity + SKIN;
  // Room for the housing (and the moving half's pocket) above the plate, the clips' pocket under it.
  const fitAt = (z: number): [number, number] | null => {
    if (low(z) < 0 || high(z) > H) return null;
    const plate = z + L - postDrop;
    const above = common(ctx, m, plate - MX.plate, high(z));
    const xy = seat(ctx, above, WALLED);
    if (!xy) return null;
    const under = common(ctx, m, low(z), plate - MX.plate);
    return contains(ctx, under, UNDER, xy) ? xy : null;
  };
  // Can the seam be hidden at a cut z with the switch at xy: a collar of skin, a pillar in it
  // that still holds the moving half's pocket.
  const collarAt = (z: number, xy: [number, number]): CrossSection | null => {
    if (!p.hideGap || z + COLLAR > H - 2) return null;
    const band = common(ctx, m, z, z + COLLAR);
    return contains(ctx, band.offset(-(SKIN + p.tolerance), 'Round', 2, 32), WALLED, xy) ? band : null;
  };
  let zc = p.cutHeight;
  let at: [number, number] | null = null;
  if (zc > 0) {
    at = fitAt(zc);
    if (!at) {
      notes.push({ level: 'error', message: `The switch does not fit at a ${zc} mm cut: it needs a ${WALLED.toFixed(0)} mm square of solid model from ${Math.max(0, low(zc)).toFixed(0)} to ${high(zc).toFixed(0)} mm. Set the cut to 0 to find one, make the model bigger, or use Stand.` });
      return { parts: [], summary: '' };
    }
  } else {
    // The cut nearest the middle that the switch fits at; one that can hide the gap first.
    const z0 = Math.max(0, -(L - postDrop - BELOW));
    const cands: number[] = [];
    for (let z = z0; z <= H - h.cavity - SKIN; z += 0.5) cands.push(z);
    cands.sort((a, b) => Math.abs(a - H * 0.5) - Math.abs(b - H * 0.5));
    let plain: { z: number; xy: [number, number] } | null = null;
    for (const z of cands) {
      const xy = fitAt(z);
      if (!xy) continue;
      plain ??= { z, xy };
      if (!p.hideGap || collarAt(z, xy)) {
        zc = z;
        at = xy;
        break;
      }
      // Hiding the gap is worth moving the cut a little, not a lot.
      if (Math.abs(z - plain.z) > H * 0.25) break;
    }
    if (!at && plain) {
      zc = plain.z;
      at = plain.xy;
    }
    if (!at) {
      notes.push({ level: 'error', message: `There is nowhere to cut this model with room for the switch (a ${WALLED.toFixed(0)} mm square about ${(BELOW + h.cavity + SKIN + L).toFixed(0)} mm tall). Make it bigger, or use Stand, which works with any model.` });
      return { parts: [], summary: '' };
    }
  }
  const [x, y] = at;
  const plate = zc + L - postDrop;

  // Hide the gap: a collar of the model's skin above the cut, a pillar in it.
  let hidden = false;
  let top: Manifold;
  let bottom: Manifold;
  const band = collarAt(zc, [x, y]);
  if (band) {
    hidden = true;
    const inner = band.offset(-SKIN, 'Round', 2, 32);
    const pillar = band.offset(-(SKIN + p.tolerance), 'Round', 2, 32);
    const collar = keepBelow(keepAbove(m, zc), zc + COLLAR).subtract(ctx.extrude(inner, COLLAR + 2, zc - 1));
    bottom = keepBelow(m, zc).add(collar);
    top = keepAbove(m, zc + COLLAR).add(ctx.extrude(pillar, COLLAR + 0.02, zc));
  } else if (p.hideGap) notes.push({ level: 'info', message: 'No room for the collar that hides the gap at this cut, so it is a plain gap.' });
  if (!hidden) {
    bottom = keepBelow(m, zc);
    top = keepAbove(m, zc);
  }
  bottom = bottom!.subtract(socket(ctx, x, y, plate, zc + COLLAR + 2));
  top = pocketAndPost(ctx, top!, x, y, zc);
  if (bottom.decompose().length > 1) notes.push({ level: 'warning', message: 'The bottom comes apart in pieces at this cut; move the cut or turn the model.' });
  if (top.decompose().length > 1) notes.push({ level: 'warning', message: 'The top is in more than one piece; only the piece on the switch moves. Move the cut.' });
  notes.push({ level: 'info', message: `Push a Cherry MX style switch into the bottom from above until it clicks, then press the top onto its stem. At rest the top floats ${L.toFixed(1)} mm up; a press closes it to ${PRESSED_GAP} mm.` });
  return {
    parts: out(ctx, [
      { m: bottom, name: 'Bottom', color: p.bodyColor, at: [0, 0, 0] },
      { m: top, name: 'Top', color: p.capColor, at: [0, 0, L] },
    ]),
    summary: `Cut at ${zc.toFixed(1)} mm of ${H.toFixed(0)}${hidden ? ', gap hidden' : ''} · top ${grams(top).toFixed(0)} g, bottom ${grams(bottom).toFixed(0)} g. Both print upright.`,
  };
}

function stand(ctx: Ctx, notes: Diagnostic[], m: Manifold, H: number, makeBody: (wells: CrossSection, sockets: [number, number][]) => { body: Manifold; outline: CrossSection }): ModelBuild {
  const p = ctx.params;
  const h = heights(p);
  const foot = m.slice(Math.min(0.3, H / 2)).add(m.slice(Math.min(1, H / 2)));
  const fb = rectSize(bounds(ctx.contours(foot)));
  const margin = Math.max(0, p.standMargin);
  let plate: CrossSection;
  if (p.standShape === 'square') plate = ctx.cs([roundedRect(fb.width + 2 * margin, fb.height + 2 * margin, 3)]).translate([fb.cx, fb.cy]);
  else if (p.standShape === 'outline') {
    const grown = foot.offset(margin + 3, 'Round', 2, 32).offset(-3, 'Round', 2, 32);
    plate = ctx.cs(ctx.contours(grown).filter((c) => signed(c) > 0));
  } else {
    let r = 0;
    for (const c of ctx.contours(foot)) for (let i = 0; i < c.length; i += 2) r = Math.max(r, Math.hypot(c[i]! - fb.cx, c[i + 1]! - fb.cy));
    plate = ctx.cs([circle(r + margin, 128)]).translate([fb.cx, fb.cy]);
  }
  // Always room for the switch under the plate.
  const need = ctx.cs([roundedRect(WALLED, WALLED, 2)]).translate([fb.cx, fb.cy]);
  if (!need.subtract(plate).isEmpty()) plate = plate.add(need);
  const pb = rectSize(bounds(ctx.contours(plate)));
  const [x, y] = [fb.cx, fb.cy];
  // The plate: solid from the post's bottom to its top, the switch's pocket and post in it.
  let cap = ctx.extrude(plate, h.capH);
  cap = pocketAndPost(ctx, cap, x, y, 0);
  const model = m.translate([0, 0, h.capH - 0.05]);
  cap = cap.add(model);
  const b = makeBody(plate, [[x, y]]);
  notes.push({ level: 'info', message: `Push a Cherry MX style switch into the base from above until it clicks, then press the plate onto its stem. It stands ${h.proud.toFixed(1)} mm proud.` });
  return {
    parts: out(ctx, [
      { m: b.body, name: 'Base', color: p.bodyColor, at: [0, 0, 0] },
      { m: cap, name: 'Model on its plate', color: p.capColor, at: [0, 0, h.capBottom] },
    ]),
    summary: `Plate ${pb.width.toFixed(0)} × ${pb.height.toFixed(0)} mm · model ${H.toFixed(0)} mm tall · ${grams(cap).toFixed(0)} g moving. Both print upright.`,
  };
}

function signed(c: number[]): number {
  let a = 0;
  for (let i = 0; i < c.length; i += 2) {
    const j = (i + 2) % c.length;
    a += c[i]! * c[j + 1]! - c[j]! * c[i + 1]!;
  }
  return a / 2;
}

function button(ctx: Ctx, notes: Diagnostic[], m: Manifold, H: number): ModelBuild {
  const p = ctx.params;
  const h = heights(p);
  const shape = p.buttonShape;
  const size = Math.max(BUTTON_MIN[shape], p.buttonSize);
  if (p.buttonSize < BUTTON_MIN[shape]) notes.push({ level: 'info', message: `A ${shape} button must be at least ${BUTTON_MIN[shape]} mm for the switch to go in through it; it is made ${size} mm.` });
  const outline = (grow: number) => ctx.cs([shape === 'round' ? circle(size / 2 + grow, 96) : roundedRect(size + 2 * grow, size + 2 * grow, 2 + grow)]);
  // Where: as asked, else under the highest part of the top that is wide enough for it.
  let x = p.buttonX;
  let y = p.buttonY;
  if (x === 0 && y === 0) {
    const need = shape === 'round' ? size / 2 + SKIN : (Math.SQRT2 * size) / 2 + SKIN;
    for (let z = H - 1; z > H * 0.3; z -= 0.5) {
      const s = m.slice(z);
      if (s.isEmpty()) continue;
      // The middle when it has room there, else the section's deepest point.
      if (ctx.cs([circle(need, 64)]).subtract(s).area() < 0.5) {
        x = 0;
        y = 0;
        break;
      }
      const pole = poleOf(ctx.contours(s), 0.3);
      if (pole.radius >= need) {
        x = pole.x;
        y = pole.y;
        break;
      }
    }
  }
  const B = outline(0).translate([x, y]);
  // The model's lowest top point under the button: the column of model inside the outline,
  // its top seen from above at the centre and round two rings.
  const column = m.intersect(ctx.extrude(B, H + 2, -1));
  if (column.isEmpty()) {
    notes.push({ level: 'error', message: 'The button is off the model: set its position to 0, 0 to place it automatically.' });
    return { parts: [], summary: '' };
  }
  const topAt = (px: number, py: number): number | null => {
    const ray = column.intersect(ctx.Manifold.cylinder(H + 2, 0.15, 0.15, 6).translate([px, py, -1]));
    return ray.isEmpty() ? null : ray.boundingBox().max[2];
  };
  const pts: [number, number][] = [[x, y]];
  for (const rr of [0.3, 0.45]) for (let k = 0; k < 8; k++) pts.push([x + Math.cos((k * Math.PI) / 4) * size * rr, y + Math.sin((k * Math.PI) / 4) * size * rr]);
  const tops = pts.map(([a, b]) => topAt(a, b)).filter((v): v is number => v !== null);
  const roof = Math.min(...tops);
  const zr = roof - 1.6; // solid under the lowest point of the top
  const zb = zr - h.cavity - 1.2; // the button's lowest plane: the post's bottom
  const raise = Math.max(0, Math.min(p.buttonRaise, MX.travel));
  const plate = zb + raise - postDrop;
  if (plate - BELOW < 0) {
    notes.push({ level: 'error', message: `The model is too short under the button for the switch: it needs about ${(H - plate + BELOW).toFixed(0)} mm below the top. Make it bigger or use Slice or Stand.` });
    return { parts: [], summary: '' };
  }
  // The button: the model inside the outline from the roof's underside up (only the piece on
  // it; anything above that does not touch it is left to the bore), solid down to the post.
  const cap = column.intersect(ctx.extrude(B.offset(-p.tolerance, 'Round', 2, 32), H + 2, -1));
  const pieces = keepAbove(cap, zr).decompose().filter((q) => q.boundingBox().min[2] <= zr + 0.05);
  let btn = ctx.union(pieces).add(ctx.extrude(B.offset(-p.tolerance, 'Round', 2, 32), zr - zb + 0.05, zb));
  btn = pocketAndPost(ctx, btn, x, y, zb);
  // The body: the model less the bore (down to the plate) and the switch's socket.
  let bodyM = m.subtract(ctx.extrude(B, H + 2 - plate, plate)).subtract(socket(ctx, x, y, plate, plate + 1));
  const wall = common(ctx, m, plate, Math.min(H - 0.5, zr));
  if (!B.offset(1.2, 'Round', 2, 32).subtract(wall).isEmpty() && B.offset(1.2, 'Round', 2, 32).subtract(wall).area() > 1) notes.push({ level: 'warning', message: 'The bore breaks through the side of the model somewhere: move the button, make it smaller or the model bigger.' });
  if (bodyM.decompose().length > 1) notes.push({ level: 'warning', message: 'Cutting the button leaves the body in more than one piece.' });
  bodyM = bodyM.translate([0, 0, 0]);
  notes.push({ level: 'info', message: `Drop a Cherry MX style switch in through the bore until it clicks into the plate, then press the button onto its stem. It sits ${raise ? `${raise.toFixed(1)} mm proud` : 'flush'} at rest.` });
  return {
    parts: out(ctx, [
      { m: bodyM, name: 'Body', color: p.bodyColor, at: [0, 0, 0] },
      { m: btn, name: 'Button', color: p.capColor, at: [0, 0, raise] },
    ]),
    summary: `${shape === 'round' ? 'Ø' : ''}${size.toFixed(0)} mm button at ${x.toFixed(0)}, ${y.toFixed(0)} · model ${H.toFixed(0)} mm tall. Both print upright.`,
  };
}

export { CAP_WALL };
