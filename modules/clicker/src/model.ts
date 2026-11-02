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
import type { Diagnostic, Handle, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold } from '@pf/engine-manifold';
import type { StoredMesh } from '@pf/mesh';
import { isStoredMesh, meshSolid } from '@pf/mesh';
import { bounds, circle, poleOf, rect, rectSize, roundedRect } from '@pf/shapes';
import type { Ctx, Params } from './types';
import { CAP_WALL, FLOOR, MX, heights, stemPost, switchDummy } from './switch';
import { sampleModel } from './samples';

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
  let m = isStoredMesh(stored) ? meshSolid(ctx, stored as StoredMesh) : sampleModel(ctx, p.sample);
  if (!isStoredMesh(stored)) notes.push({ level: 'info', message: `Showing the sample ${p.sample}: choose your own STL, 3MF or OBJ in the 3D model panel.` });
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

const keepAbove = (m: Manifold, z: number) => m.trimByPlane([0, 0, 1], z);
const keepBelow = (m: Manifold, z: number) => m.trimByPlane([0, 0, -1], -z);
/** A square of `side` round (x, y), turned by `turn` degrees, from z0 to z1. */
const box = (ctx: Ctx, side: number, x: number, y: number, z0: number, z1: number, turn = 0) => ctx.extrude([rect(side, side)], z1 - z0, z0).rotate([0, 0, turn]).translate([x, y, 0]);

/** The switch's static half in model coordinates: room for the housing, the plate cutout, the clips' pocket. */
function socket(ctx: Ctx, x: number, y: number, plate: number, top: number, turn = 0): Manifold {
  const fit = ctx.params.socketFit;
  return box(ctx, ROOM, x, y, plate, top, turn)
    .add(box(ctx, MX.cutout + fit, x, y, plate - MX.plate - 0.01, plate + 0.01, turn))
    .add(box(ctx, MX.pocket, x, y, plate - MX.pinsBelow - 0.4, plate - MX.plate, turn));
}

/** The moving half's switch room: a pocket from its bottom `z`, the post in it. */
function pocketAndPost(ctx: Ctx, piece: Manifold, x: number, y: number, z: number, turn = 0): Manifold {
  const h = heights(ctx.params);
  return piece.subtract(box(ctx, ROOM, x, y, z - 1, z + h.cavity, turn)).add(stemPost(ctx, ctx.params.stemFit, h.cavity + 0.01).rotate([0, 0, turn]).translate([x, y, z]));
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

/** Does the section hold a square of `side` centred at `xy`, turned by `turn`? (A sliver outside is curvature.) */
function contains(ctx: Ctx, s: CrossSection, side: number, xy: [number, number], turn = 0): boolean {
  return ctx.cs([rect(side, side)]).rotate(turn).translate(xy).subtract(s).area() < 0.5;
}

/** Where a square of `side` turned by `turn` fits inside a section, nearest its deepest point, or null. */
function seat(ctx: Ctx, s: CrossSection, side: number, turn = 0): [number, number] | null {
  if (s.isEmpty()) return null;
  const t = (turn * Math.PI) / 180;
  // Square on, the half side; turned, the half of the square's width that way, which is more.
  for (const half of new Set([side / 2, (side * (Math.abs(Math.cos(t)) + Math.abs(Math.sin(t)))) / 2])) {
    const inner = s.offset(-half, 'Miter', 2);
    if (inner.isEmpty()) continue;
    const pole = poleOf(ctx.contours(inner), 0.2);
    if (contains(ctx, s, side, [pole.x, pole.y], turn)) return [pole.x, pole.y];
  }
  return null;
}

/* ------------------------------------------------------------------ the three cutters */

export interface ModelBuild {
  parts: Part[];
  summary: string;
  handles?: Handle[];
  /** Which way it was cut and what the moving piece weighs, for the cards. */
  meta: { cutter: Params['cutter']; ok: boolean; movingGrams?: number; cutAt?: number };
}

/** Body builder from the picture clicker, for Stand: wells and sockets (x, y, turn). */
export type BodyMaker = (wells: CrossSection, sockets: [number, number, number][]) => { body: Manifold; outline: CrossSection };

export async function buildModel(ctx: Ctx, notes: Diagnostic[], body: BodyMaker): Promise<ModelBuild> {
  const p = ctx.params;
  const { m, H } = placedModel(ctx, notes);
  if (p.cutter === 'stand') return stand(ctx, notes, m, H, body);
  if (p.cutter === 'button') return button(ctx, notes, m, H);
  return slice(ctx, notes, m, H);
}

const failed = (cutter: Params['cutter']): ModelBuild => ({ parts: [], summary: '', meta: { cutter, ok: false } });

/** The PLA a slicer would lay down for a piece: a 1 mm skin, 15% infill inside it, g. */
export function grams(m: Manifold): number {
  const v = m.volume();
  const skin = Math.min(v, m.surfaceArea() * 1);
  return ((skin + (v - skin) * 0.15) / 1000) * 1.24;
}

interface Piece {
  m: Manifold;
  name: string;
  color: RGB;
  /** Where it goes in the assembled clicker, at rest. */
  at: [number, number, number];
}
/** The switch in the assembled clicker: its plate top's centre, and its turn. */
interface SwitchAt {
  x: number;
  y: number;
  z: number;
  turn: number;
}
/** A grip on the still piece (the first): its z in model coordinates. */
interface GripAt extends Omit<Handle, 'at' | 'size'> {
  z: number;
}

/**
 * The pieces in a row as they print, and beside them the clicker put together or pulled
 * apart: the still piece, the switch over it, the moving piece over that.
 */
function out(ctx: Ctx, pieces: Piece[], sw: SwitchAt, grip?: GripAt): { parts: Part[]; handles: Handle[] } {
  const p = ctx.params;
  const parts: Part[] = [];
  const handles: Handle[] = [];
  const first = pieces[0]!.m.boundingBox();
  const size: [number, number] = [first.max[0] - first.min[0] + 8, first.max[1] - first.min[1] + 8];
  let x = 0;
  pieces.forEach((piece, i) => {
    const b = piece.m.boundingBox();
    const shift: [number, number, number] = [x - b.min[0], -(b.min[1] + b.max[1]) / 2, -b.min[2]];
    const placed = piece.m.translate(shift);
    x += b.max[0] - b.min[0] + 8;
    const part = ctx.part(placed, piece.name, piece.color, { group: piece.name });
    if (part) parts.push(part);
    if (i === 0 && grip && p.preview === 'none') handles.push({ ...grip, at: [shift[0] + (b.min[0] + b.max[0]) / 2, shift[1] + (b.min[1] + b.max[1]) / 2, grip.z + shift[2]], size });
  });
  if (p.preview === 'none') return { parts, handles };
  const ox = x + 20;
  const add = (m: Manifold, name: string, color: RGB) => {
    const part = ctx.part(m, name, color, { group: 'preview', role: 'preview' });
    if (part) parts.push(part);
  };
  if (p.preview === 'assembled') for (const piece of pieces) add(piece.m.translate([ox + piece.at[0], piece.at[1], piece.at[2]]), `${piece.name} (assembled)`, piece.color);
  else {
    // Pulled apart along Z: the switch clear of the still piece, the moving piece clear of the switch.
    const GAP = 5;
    const still = pieces[0]!;
    const stillTop = still.m.boundingBox().max[2] + still.at[2];
    const swZ = Math.max(sw.z, stillTop + MX.pinsBelow + GAP);
    add(still.m.translate([ox + still.at[0], still.at[1], still.at[2]]), `${still.name} (exploded)`, still.color);
    add(switchDummy(ctx).rotate([0, 0, sw.turn]).translate([ox + sw.x, sw.y, swZ]), 'Switch (exploded)', [150, 152, 158]);
    let floor = swZ + MX.stemTop + GAP;
    for (const piece of pieces.slice(1)) {
      const low = piece.m.boundingBox().min[2] + piece.at[2];
      const dz = Math.max(0, floor - low);
      add(piece.m.translate([ox + piece.at[0], piece.at[1], piece.at[2] + dz]), `${piece.name} (exploded)`, piece.color);
      floor = piece.m.boundingBox().max[2] + piece.at[2] + dz + GAP;
    }
  }
  if (grip) handles.push({ ...grip, at: [ox + (first.min[0] + first.max[0]) / 2 + pieces[0]!.at[0], (first.min[1] + first.max[1]) / 2 + pieces[0]!.at[1], grip.z + pieces[0]!.at[2]], size });
  return { parts, handles };
}

/** The switch as asked: moved from where it goes by itself, and turned. */
const nudge = (p: Params) => ({ dx: p.switchX || 0, dy: p.switchY || 0, turn: ((p.switchTurn || 0) % 360 + 360) % 360 });

function slice(ctx: Ctx, notes: Diagnostic[], m: Manifold, H: number): ModelBuild {
  const p = ctx.params;
  const h = heights(p);
  const L = lift();
  const { dx, dy, turn } = nudge(p);
  const moved = dx !== 0 || dy !== 0 || turn !== 0;
  // Bottom of the switch's room for a cut at z, and the top of the moving half's.
  const low = (z: number) => z + L - postDrop - BELOW;
  const high = (z: number) => z + h.cavity + SKIN;
  // Room for the housing (and the moving half's pocket) above the plate, the clips' pocket under it.
  const fitAt = (z: number): [number, number] | null => {
    if (low(z) < 0 || high(z) > H) return null;
    const plate = z + L - postDrop;
    const above = common(ctx, m, plate - MX.plate, high(z));
    const auto = seat(ctx, above, WALLED, turn);
    if (!auto) return null;
    const xy: [number, number] = [auto[0] + dx, auto[1] + dy];
    if ((dx || dy) && !contains(ctx, above, WALLED, xy, turn)) return null;
    const under = common(ctx, m, low(z), plate - MX.plate);
    return contains(ctx, under, UNDER, xy, turn) ? xy : null;
  };
  // Can the seam be hidden at a cut z with the switch at xy: a collar of skin, a pillar in it
  // that still holds the moving half's pocket.
  const collarAt = (z: number, xy: [number, number]): CrossSection | null => {
    if (!p.hideGap || z + COLLAR > H - 2) return null;
    const band = common(ctx, m, z, z + COLLAR);
    return contains(ctx, band.offset(-(SKIN + p.tolerance), 'Round', 2, 32), WALLED, xy, turn) ? band : null;
  };
  const zMin = Math.max(0, -(L - postDrop - BELOW));
  const zMax = H - h.cavity - SKIN;
  const where = moved ? ' with the switch moved or turned like this' : '';
  const range = { param: 'cutHeight', label: 'Cut', axis: 'z' as const, min: Math.max(0.5, Math.ceil(zMin * 2) / 2), max: Math.max(0.5, Math.floor(zMax * 2) / 2), step: 0.5 };
  let zc = p.cutHeight;
  let at: [number, number] | null = null;
  if (zc > 0) {
    at = fitAt(zc);
    if (!at) {
      notes.push({ level: 'error', message: `The switch does not fit at a ${zc} mm cut${where}: it needs a ${WALLED.toFixed(0)} mm square of solid model from ${Math.max(0, low(zc)).toFixed(0)} to ${high(zc).toFixed(0)} mm. Drag the cut elsewhere, set it to 0 to find one${moved ? ', move the switch back' : ''}, make the model bigger, or use Stand.` });
      // The model uncut, with the cut's handle on it, so the cut can be dragged back.
      const bb = m.boundingBox();
      const shown = ctx.part(m, 'Model (no room for the switch at this cut)', p.capColor, { group: 'preview', role: 'preview' });
      return {
        ...failed('slice'),
        parts: shown ? [shown] : [],
        handles: [{ ...range, at: [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, zc], value: zc, size: [bb.max[0] - bb.min[0] + 8, bb.max[1] - bb.min[1] + 8] }],
      };
    }
  } else {
    // The cut nearest the middle that the switch fits at; one that can hide the gap first.
    const cands: number[] = [];
    for (let z = zMin; z <= zMax; z += 0.5) cands.push(z);
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
      notes.push({ level: 'error', message: `There is nowhere to cut this model${where} with room for the switch (a ${WALLED.toFixed(0)} mm square about ${(BELOW + h.cavity + SKIN + L).toFixed(0)} mm tall). ${moved ? 'Move the switch back toward 0, make' : 'Make'} it bigger, or use Stand, which works with any model.` });
      return failed('slice');
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
    // A hair into the bottom, so the two join into one solid rather than touch.
    const collar = keepBelow(keepAbove(m, zc - 0.02), zc + COLLAR).subtract(ctx.extrude(inner, COLLAR + 2, zc - 1));
    bottom = keepBelow(m, zc).add(collar);
    top = keepAbove(m, zc + COLLAR).add(ctx.extrude(pillar, COLLAR + 0.02, zc));
  } else if (p.hideGap) notes.push({ level: 'info', message: 'No room for the collar that hides the gap at this cut, so it is a plain gap.' });
  if (!hidden) {
    bottom = keepBelow(m, zc);
    top = keepAbove(m, zc);
  }
  bottom = bottom!.subtract(socket(ctx, x, y, plate, zc + COLLAR + 2, turn));
  top = pocketAndPost(ctx, top!, x, y, zc, turn);
  if (bottom.decompose().length > 1) notes.push({ level: 'warning', message: 'The bottom comes apart in pieces at this cut; move the cut or turn the model.' });
  if (top.decompose().length > 1) notes.push({ level: 'warning', message: 'The top is in more than one piece; only the piece on the switch moves. Move the cut.' });
  notes.push({ level: 'info', message: `Push a Cherry MX style switch into the bottom from above until it clicks, then press the top onto its stem. At rest the top floats ${L.toFixed(1)} mm up; a press closes it to ${PRESSED_GAP} mm. Drag the orange plane to move the cut.` });
  const moving = grams(top);
  const laid = out(
    ctx,
    [
      { m: bottom, name: 'Bottom', color: p.bodyColor, at: [0, 0, 0] },
      { m: top, name: 'Top', color: p.capColor, at: [0, 0, L] },
    ],
    { x, y, z: plate, turn },
    { ...range, z: zc, value: zc },
  );
  return {
    ...laid,
    summary: `Cut at ${zc.toFixed(1)} mm of ${H.toFixed(0)}${hidden ? ', gap hidden' : ''} · the top weighs about ${moving.toFixed(0)} g, the bottom ${grams(bottom).toFixed(0)} g. Both print upright.`,
    meta: { cutter: 'slice', ok: true, movingGrams: moving, cutAt: zc },
  };
}

function stand(ctx: Ctx, notes: Diagnostic[], m: Manifold, H: number, makeBody: BodyMaker): ModelBuild {
  const p = ctx.params;
  const h = heights(p);
  const { dx, dy, turn } = nudge(p);
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
  // The switch under the middle of the foot, or where it was moved to; always room for it under the plate.
  const [x, y] = [fb.cx + dx, fb.cy + dy];
  const need = ctx.cs([roundedRect(WALLED, WALLED, 2)]).rotate(turn).translate([x, y]);
  if (!need.subtract(plate).isEmpty()) {
    plate = plate.add(need);
    if (plate.decompose().length > 1) plate = plate.hull();
    if (dx || dy) notes.push({ level: 'info', message: 'The plate is made bigger to reach the switch where you moved it.' });
  }
  const pb = rectSize(bounds(ctx.contours(plate)));
  // The plate: solid from the post's bottom to its top, the switch's pocket and post in it.
  let cap = ctx.extrude(plate, h.capH);
  cap = pocketAndPost(ctx, cap, x, y, 0, turn);
  const model = m.translate([0, 0, h.capH - 0.05]);
  cap = cap.add(model);
  const b = makeBody(plate, [[x, y, turn]]);
  notes.push({ level: 'info', message: `Push a Cherry MX style switch into the base from above until it clicks, then press the plate onto its stem. It stands ${h.proud.toFixed(1)} mm proud.` });
  const moving = grams(cap);
  const laid = out(
    ctx,
    [
      { m: b.body, name: 'Base', color: p.bodyColor, at: [0, 0, 0] },
      { m: cap, name: 'Model on its plate', color: p.capColor, at: [0, 0, h.capBottom] },
    ],
    { x, y, z: h.plateTop, turn },
  );
  return {
    ...laid,
    summary: `Plate ${pb.width.toFixed(0)} × ${pb.height.toFixed(0)} mm · model ${H.toFixed(0)} mm tall · the moving piece weighs about ${moving.toFixed(0)} g. Both print upright.`,
    meta: { cutter: 'stand', ok: true, movingGrams: moving },
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
    return failed('button');
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
    return failed('button');
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
  notes.push({ level: 'info', message: `Drop a Cherry MX style switch in through the bore until it clicks into the plate, then press the button onto its stem. It sits ${raise ? `${raise.toFixed(1)} mm proud` : 'flush'} at rest.` });
  const moving = grams(btn);
  const laid = out(
    ctx,
    [
      { m: bodyM, name: 'Body', color: p.bodyColor, at: [0, 0, 0] },
      { m: btn, name: 'Button', color: p.capColor, at: [0, 0, raise] },
    ],
    { x, y, z: plate, turn: 0 },
  );
  return {
    ...laid,
    summary: `${shape === 'round' ? 'Ø' : ''}${size.toFixed(0)} mm button at ${x.toFixed(0)}, ${y.toFixed(0)} · model ${H.toFixed(0)} mm tall · the button weighs about ${moving.toFixed(0)} g. Both print upright.`,
    meta: { cutter: 'button', ok: true, movingGrams: moving },
  };
}

export { CAP_WALL };
