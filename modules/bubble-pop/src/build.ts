/**
 * Bubble pop fidget: a 13 mm slab with snap-through pop buttons printed in place.
 *
 * Frame: z = 0 is the picture face and the bed. The picture's colours are inlaid flush in
 * that face (it prints face down, so nothing can stand proud of it). Each socket is a bore
 * through the slab with two blind pockets at mid-height; a spring beam stands in each pocket
 * with its edge 0.5 mm inside the bead's path. The button is a revolved spool: a skirt that
 * slides in the bore, a neck that clears the beams, a bead that has to push the beams aside
 * to pass, and a cap. Press it from either side and it snaps through to the other.
 *
 * Printed in place with the buttons in their bores: no assembly. The mechanism is modelled
 * here from its working dimensions; the original's pop-module mesh is not used.
 */
import type { BuildResult, Contour, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold, ManifoldContext } from '@pf/engine-manifold';
import { autoPlace, bounds, circle, orient, pointInside, poleOf, rect, rectSize, scale, shiftInside, signedArea, translate } from '@pf/shapes';
import { SHAPES } from './shapes';

export interface Params {
  shape: string;
  size: number;
  cornerRadius: number;
  holeRatio: number;
  starPoints: number;
  edge: 'flat' | 'chamfer' | 'round';
  edgeSize: number;
  imageMargin: number;
  imageDepth: number;
  bleed: number;
  buttonCount: number;
  layout: 'auto' | 'grid';
  buttonSpacing: number;
  shiftX: number;
  shiftY: number;
  clearance: number;
  includeButtons: boolean;
  bodyColor: RGB;
  buttonColor: RGB;
}

export interface PopImage {
  width: number;
  height: number;
  silhouette: Contour[];
  regions: { index: number; color: RGB; contours: Contour[] }[];
}

/** Per-colour filament choices from the Colours panel, keyed by palette index. */
export type ColourOverrides = Record<string, { color?: RGB }>;

/** The pop mechanism, mm. Socket axis at the origin; z = 0 is the picture face. */
export const POP = {
  /** Slab thickness: the mechanism needs all of it. */
  height: 13,
  /** Bore the button slides in, before the clearance setting. */
  bore: 11.46,
  /** Chamfer at each end of the bore. */
  chamfer: 0.5,
  /** Every socket's footprint: the bore, both pockets and the wall round them. */
  keepout: 19.6,
  pocket: { rOut: 7.2, half: 5.3, z0: 4.95, z1: 7.55 },
  beam: { tip: 4.6, z0: 5.6, z1: 6.9, root: 1.0, end: 0.7, endGap: 0.7 },
  button: {
    height: 16.4,
    dia: 11.08,
    neck: 8.72,
    bead: 10.22,
    beadZ: 8.23,
    /** Top of the skirt: under the beams with room to print. */
    skirtTop: 5.2,
    /** Where the cap's underside starts to flare out from the neck. */
    capFrom: 10.4,
    footChamfer: 0.4,
    topRound: 0.8,
  },
} as const;
/** Solid wall kept between sockets and to the edge, mm. */
export const SOCKET_WALL = 2;

/** How far the button travels: until the cap's underside lands on the beams. */
export function travel(): number {
  const b = POP.button;
  const capAtTip = b.capFrom + (POP.beam.tip - b.neck / 2);
  return capAtTip - POP.beam.z1;
}

/** Smallest centre-to-centre distance between sockets. */
export const pitchOf = (p: Params) => POP.keepout + SOCKET_WALL + Math.max(0, p.buttonSpacing);

type Ctx = ManifoldContext<Params>;

function filled(ctx: Ctx, s: CrossSection): CrossSection {
  return ctx.cs(ctx.contours(s).filter((c) => signedArea(c) > 0));
}

/** The body outline from the shape library, longest side `size`. */
export function shapeSection(ctx: Ctx, id: string, size: number, p: Pick<Params, 'cornerRadius' | 'holeRatio' | 'starPoints'>): CrossSection {
  const def = SHAPES[id] ?? SHAPES.circle!;
  const d = def.draw({ corner: p.cornerRadius / size, holeRatio: p.holeRatio, starPoints: p.starPoints });
  let s = ctx.cs(d.add.map((c) => orient(c, true)), 'NonZero');
  if (d.cut?.length) s = s.subtract(ctx.cs(d.cut.map((c) => orient(c, true)), 'NonZero'));
  const b = rectSize(bounds(ctx.contours(s)));
  const k = size / Math.max(b.width, b.height);
  s = s.translate([-b.cx, -b.cy]).scale([k, k]);
  if (d.join) {
    const r = Math.max(3, size * 0.04);
    s = filled(ctx, s.offset(r, 'Round', 2, 32).offset(-r, 'Round', 2, 32));
  }
  // Round off points too sharp to print cleanly, then restore the size the points lost.
  s = s.offset(-1.5, 'Round', 2, 32).offset(1.5, 'Round', 2, 32);
  const r = rectSize(bounds(ctx.contours(s)));
  const k2 = size / Math.max(r.width, r.height);
  return s.translate([-r.cx, -r.cy]).scale([k2, k2]);
}

interface Layout {
  plate: CrossSection;
  regions: { key: string; color: RGB; section: CrossSection }[];
  clip: CrossSection;
}

function layoutOf(ctx: Ctx, img: PopImage | null, notes: Diagnostic[]): Layout {
  const p = ctx.params;
  const m = Math.max(0, p.imageMargin);
  const size = p.size;
  const design = img?.regions?.length ? img : null;
  let shape = p.shape;
  if (shape === 'outline' && !design) {
    notes.push({ level: 'info', message: 'Follow the picture needs a picture; showing a circle until you choose one.' });
    shape = 'circle';
  }
  if (!design) {
    const plate = shapeSection(ctx, shape, size, p);
    return { plate, regions: [], clip: plate };
  }
  const box = rectSize(bounds(design.silhouette.length ? design.silhouette : design.regions.flatMap((r) => r.contours)));
  const place = (k: number) =>
    design.regions.map((r) => ({ key: String(r.index), color: r.color, section: ctx.cs(scale(translate(r.contours, -box.cx, -box.cy), k), 'EvenOdd') }));
  if (shape === 'outline') {
    const k = Math.max(1e-6, size - 2 * m) / Math.max(box.width, box.height);
    const sil = ctx.cs(scale(translate(design.silhouette, -box.cx, -box.cy), k), 'NonZero');
    const r = Math.max(1, Math.min(5, size * 0.03));
    const plate = filled(ctx, sil.offset(m + r, 'Round', 2, 32).offset(-r, 'Round', 2, 32));
    return { plate, regions: place(k), clip: plate };
  }
  const plate = shapeSection(ctx, shape, size, p);
  const inner = m > 0 ? plate.offset(-m, 'Round', 2, 32) : plate;
  // The largest picture that fits inside the frame, centred on the shape's widest point.
  const pole = poleOf(ctx.contours(inner), 0.5);
  const fits = (k: number) => ctx.cs([rect(box.width * k, box.height * k)]).translate([pole.x, pole.y]).subtract(inner).area() < 1e-3;
  let lo = 0;
  let hi = (size / Math.max(box.width, box.height)) * 1.01;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return { plate, regions: place(lo).map((r) => ({ ...r, section: r.section.translate([pole.x, pole.y]) })), clip: inner };
}

/** A square grid at the pitch, centred on the legal area's widest point, nearest first. */
function gridPlace(legal: Contour[], count: number, pitch: number): [number, number][] {
  if (!legal.length) return [];
  const pole = poleOf(legal, 0.5);
  const b = bounds(legal);
  const pts: [number, number][] = [];
  const nx = Math.ceil((b.maxX - b.minX) / pitch) + 1;
  const ny = Math.ceil((b.maxY - b.minY) / pitch) + 1;
  // Try both grid phases (a point on the pole, or a cell centred on it) and keep the fuller.
  let best: [number, number][] = [];
  for (const phase of [0, 0.5]) {
    pts.length = 0;
    for (let i = -nx; i <= nx; i++)
      for (let j = -ny; j <= ny; j++) {
        const x = pole.x + (i + phase) * pitch;
        const y = pole.y + (j + phase) * pitch;
        if (pointInside(legal, x, y)) pts.push([x, y]);
      }
    if (pts.length > best.length) best = pts.slice();
  }
  best.sort((a, q) => Math.hypot(a[0] - pole.x, a[1] - pole.y) - Math.hypot(q[0] - pole.x, q[1] - pole.y));
  return best.slice(0, count);
}

/** The socket's empty space: bore with chamfers, and both beam pockets. */
function socketCut(ctx: Ctx, bore: number): Manifold {
  const r = bore / 2;
  const { height, chamfer, pocket } = POP;
  const M = ctx.Manifold;
  const bodyCut = M.cylinder(height + 2, r, r, 96).translate([0, 0, -1]);
  const mouth = M.cylinder(chamfer + 0.01, r + chamfer, r, 96).translate([0, 0, -0.01]);
  const top = M.cylinder(chamfer + 0.01, r, r + chamfer, 96).translate([0, 0, height - chamfer]);
  const box = ctx.extrude([rect(pocket.rOut - (r - 0.5), 2 * pocket.half)], pocket.z1 - pocket.z0, pocket.z0).translate([(pocket.rOut + r - 0.5) / 2, 0, 0]);
  return ctx.union([bodyCut, mouth, top, box, box.rotate([0, 0, 180])]);
}

/** The two spring beams: rooted in a pocket's side wall, tapering to a free end. */
function beams(ctx: Ctx): Manifold {
  const { beam, pocket } = POP;
  const y0 = -pocket.half - 0.6;
  const y1 = pocket.half - beam.endGap;
  const one = ctx.extrude([[beam.tip, y0, beam.tip + beam.root, y0, beam.tip + beam.end, y1, beam.tip, y1]], beam.z1 - beam.z0, beam.z0);
  return one.add(one.rotate([0, 0, 180]));
}

/** The button, in place in its bore: a revolved spool. */
function button(ctx: Ctx): Manifold {
  const b = POP.button;
  const R = b.dia / 2;
  const n = b.neck / 2;
  const bead = b.bead / 2;
  const flank = bead - n;
  const capTo = b.capFrom + (R - n);
  const profile: Contour = [
    0, 0,
    R - b.footChamfer, 0,
    R, b.footChamfer,
    R, b.skirtTop,
    n, b.skirtTop,
    n, b.beadZ - flank,
    bead, b.beadZ,
    n, b.beadZ + flank,
    n, b.capFrom,
    R, capTo,
    R, b.height - b.topRound,
    R - b.topRound, b.height,
    0, b.height,
  ];
  return ctx.cs([profile]).revolve(96);
}

export async function build(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  const notes: Diagnostic[] = [];
  const img = (ctx.inputs.image as PopImage | undefined) ?? null;
  const overrides = (ctx.inputs.colours as ColourOverrides | undefined) ?? {};
  const layout = layoutOf(ctx, img, notes);
  const { plate } = layout;
  if (plate.isEmpty()) throw new Error('The shape has no area to print.');
  if (plate.decompose().length > 1) notes.push({ level: 'warning', message: 'The outline is in separate pieces; widen the frame margin or pick a shape to join them.' });

  // Sockets.
  const pitch = pitchOf(p);
  const legalCs = plate.offset(-(POP.keepout / 2 + SOCKET_WALL), 'Round', 2, 32);
  const legal = ctx.contours(legalCs);
  const count = Math.max(1, Math.round(p.buttonCount));
  const raw = p.layout === 'grid' ? gridPlace(legal, count, pitch) : autoPlace(legal, count, pitch);
  const positions = shiftInside(raw, legal, p.shiftX, p.shiftY);
  if (!positions.length) {
    notes.push({ level: 'warning', message: `No room for a pop button: each needs a ${POP.keepout + 2 * SOCKET_WALL} mm circle inside the shape. Make it bigger.` });
  } else if (positions.length < count) {
    notes.push({ level: 'warning', message: `Room for ${positions.length} of ${count} buttons at this size and spacing.` });
  }

  const bore = POP.bore + p.clearance;
  const T = POP.height;
  const edge = p.edge === 'flat' ? 0 : Math.max(0, Math.min(p.edgeSize, 4));
  let body = edge > 0 ? ctx.edged(plate, T, { top: edge, style: p.edge === 'round' ? 'round' : 'chamfer' }) : ctx.extrude(plate, T);

  // Picture: inlays in the face, smallest colour first so details win, kept off the bore mouths.
  const depth = Math.max(0.2, Math.min(p.imageDepth, POP.pocket.z0 - 1));
  let clip = layout.clip;
  if (positions.length) clip = clip.subtract(ctx.cs(positions.map(([x, y]) => translate([circle(bore / 2 + POP.chamfer + 0.6, 64)], x, y)[0]!)));
  const inlays: { solid: Manifold; color: RGB; name: string }[] = [];
  let taken: CrossSection | null = null;
  const ordered = layout.regions.map((r) => ({ ...r, area: r.section.area() })).sort((a, b) => a.area - b.area);
  for (const r of ordered) {
    let s = (p.bleed > 0 ? r.section.offset(p.bleed, 'Round', 2, 16) : r.section).intersect(clip);
    if (taken) s = s.subtract(taken);
    if (s.isEmpty() || s.area() < 0.2) continue;
    taken = taken ? taken.add(s) : s;
    inlays.push({ solid: ctx.extrude(s, depth), color: overrides[r.key]?.color ?? r.color, name: `Colour ${inlays.length + 1}` });
  }
  if (taken) body = body.subtract(ctx.extrude(taken, depth + 1, -1));

  if (positions.length) {
    const cut = socketCut(ctx, bore);
    const spring = beams(ctx);
    body = body.subtract(ctx.union(positions.map(([x, y]) => cut.translate([x, y, 0]))));
    body = body.add(ctx.union(positions.map(([x, y]) => spring.translate([x, y, 0]))));
  }

  const parts: Part[] = [];
  const add = (m: Manifold, name: string, color: RGB, group: string) => {
    const part = ctx.part(m, name, color, { group });
    if (part) parts.push(part);
  };
  add(body, 'Body', p.bodyColor, 'Body');
  for (const i of inlays) add(i.solid, i.name, i.color, 'Body');
  if (p.includeButtons && positions.length) {
    const b = button(ctx);
    positions.forEach(([x, y], i) => add(b.translate([x, y, 0]), `Button ${i + 1}`, p.buttonColor, `Button ${i + 1}`));
  }

  const sz = rectSize(bounds(ctx.contours(plate)));
  if (inlays.length) notes.push({ level: 'info', message: `The picture is the first ${depth.toFixed(1)} mm, face down: it needs a printer that swaps filament (AMS, MMU).` });
  notes.push({ level: 'info', message: `Each button travels ${travel().toFixed(1)} mm. Press it through from either side.` });
  return {
    parts,
    diagnostics: notes,
    summary: `${positions.length} pop button${positions.length === 1 ? '' : 's'}, ${sz.width.toFixed(0)} × ${sz.height.toFixed(0)} × ${T} mm. Prints picture face down with the buttons in place; no assembly.`,
  };
}
