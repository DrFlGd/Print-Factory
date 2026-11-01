/**
 * Fridge magnet and two-piece magnetic fidget slider.
 *
 * Frame: Z = 0 is the flat back (the side that meets the fridge); the design faces up at
 * Z = thickness. Colours are inlays carved into the top face: flush, or raised by a number
 * of steps per colour. Magnet pockets are cut from the back, open (glue-on) or sealed
 * over a thin floor (embedded, with a pause to drop the magnets in).
 *
 * The slider builds the body twice. Each half carries two columns of magnets on one fixed
 * pitch; with alternating polarity the halves snap from repel to attract every pitch, so
 * the pitch is the click and rows − 1 is the number of clicks.
 *
 * Feature set after the Vostok Labs Image to Fridge Magnet Generator; written for Print
 * Factory.
 */
import type { BuildResult, Contour, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold, ManifoldContext } from '@pf/engine-manifold';
import { bounds, circle, pointInside, poleOf, rect, rectSize, regularPolygon, rotate, roundedRect, scale, signedArea, translate } from '@pf/shapes';
import { text as layoutText } from '@pf/text';

export type Shape = 'outline' | 'circle' | 'roundedRect' | 'rectangle' | 'square' | 'hexagon';
export type MagnetMode = 'none' | 'glue-on' | 'embedded';

export interface Params {
  product: 'magnet' | 'slider';
  source: 'image' | 'text';
  text: string;
  font: string;
  letterSpacing: number;
  textColor: RGB;
  shape: Shape;
  size: number;
  margin: number;
  cornerRadius: number;
  thickness: number;
  bevel: number;
  bodyColor: RGB;
  inlayDepth: number;
  raiseStep: number;
  bleed: number;
  magnetMode: MagnetMode;
  magnet: string;
  magnetShape: 'disc' | 'block';
  magnetDiameter: number;
  magnetX: number;
  magnetY: number;
  magnetHeight: number;
  count: number;
  pocketFit: number;
  pocketProfile: 'round' | 'hex';
  blockRotation: 0 | 90 | '0' | '90';
  backWall: number;
  shiftX: number;
  shiftY: number;
  sliderLayout: '4' | '6' | '8';
  sliderGap: number;
  sliderBlank: boolean;
}

/** The traced picture (the shell's PreparedImage). */
export interface MagnetImage {
  width: number;
  height: number;
  silhouette: Contour[];
  regions: { index: number; color: RGB; contours: Contour[] }[];
}

/** Per-colour choices from the Colours panel, keyed by the picture's palette index. */
export type ColourOverrides = Record<string, { color?: RGB; level?: number }>;

export interface MagnetSize {
  label: string;
  shape: 'disc' | 'block';
  d?: number;
  x?: number;
  y?: number;
  h: number;
}

/** Stock sizes, as magnet shops list them. ⌀6 × 3 is the usual fidget slider magnet. */
export const MAGNETS: Record<string, MagnetSize> = {
  d5x3: { label: '⌀5 × 3 mm', shape: 'disc', d: 5, h: 3 },
  d6x3: { label: '⌀6 × 3 mm', shape: 'disc', d: 6, h: 3 },
  d6x2: { label: '⌀6 × 2 mm', shape: 'disc', d: 6, h: 2 },
  d8x3: { label: '⌀8 × 3 mm', shape: 'disc', d: 8, h: 3 },
  d10x2: { label: '⌀10 × 2 mm', shape: 'disc', d: 10, h: 2 },
  d10x3: { label: '⌀10 × 3 mm', shape: 'disc', d: 10, h: 3 },
  d12x2: { label: '⌀12 × 2 mm', shape: 'disc', d: 12, h: 2 },
  d15x2: { label: '⌀15 × 2 mm', shape: 'disc', d: 15, h: 2 },
  d20x2: { label: '⌀20 × 2 mm', shape: 'disc', d: 20, h: 2 },
  b10x10x2: { label: '10 × 10 × 2 mm block', shape: 'block', x: 10, y: 10, h: 2 },
  b20x10x2: { label: '20 × 10 × 2 mm block', shape: 'block', x: 20, y: 10, h: 2 },
  b20x5x2: { label: '20 × 5 × 2 mm block', shape: 'block', x: 20, y: 5, h: 2 },
  b25x10x3: { label: '25 × 10 × 3 mm block', shape: 'block', x: 25, y: 10, h: 3 },
};

/** Solid wall kept round every pocket, to the edge and to its neighbours. */
export const POCKET_WALL = 2;
/** Plastic always left between a magnet and the front face. */
export const COVER = 0.8;
/**
 * How much of the fit clearance only makes up for round holes printing small. A round
 * pocket is sliced as a polygon inside the circle and shrinks; a hex pocket's flat walls
 * print true, so a hex pocket takes only the clearance above this.
 */
export const ROUND_ALLOWANCE = 0.2;
const PIECE_GAP = 8;
const COS30 = Math.cos(Math.PI / 6);

export function magnetOf(p: Params): Required<Pick<MagnetSize, 'shape' | 'h'>> & { d: number; x: number; y: number } {
  const m = MAGNETS[p.magnet];
  if (m) return { shape: m.shape, d: m.d ?? 0, x: m.x ?? 0, y: m.y ?? 0, h: m.h };
  return { shape: p.magnetShape, d: p.magnetDiameter, x: p.magnetX, y: p.magnetY, h: p.magnetHeight };
}

export interface Pocket {
  shape: 'disc' | 'block';
  profile: 'round' | 'hex' | 'rect';
  /** Clearance actually added to the magnet's size. */
  fit: number;
  /** Round: diameter. Hex: across flats. Block: unused. */
  across: number;
  /** Hex: across corners. */
  corners: number;
  /** Block pocket size. */
  w: number;
  l: number;
  /** Worst-case width: what spacing and wall checks use. */
  span: number;
  depth: number;
  rotation: number;
}

export function pocketOf(p: Params): Pocket {
  const m = magnetOf(p);
  const fit = Math.max(0, p.pocketFit);
  if (m.shape === 'block') {
    const rotation = Number(p.blockRotation) || 0;
    return { shape: 'block', profile: 'rect', fit, across: 0, corners: 0, w: m.x + fit, l: m.y + fit, span: Math.hypot(m.x, m.y) + fit, depth: m.h, rotation };
  }
  if (p.pocketProfile === 'hex') {
    const f = Math.max(0, fit - ROUND_ALLOWANCE);
    const across = m.d + f;
    return { shape: 'disc', profile: 'hex', fit: f, across, corners: across / COS30, w: 0, l: 0, span: across / COS30, depth: m.h, rotation: 0 };
  }
  return { shape: 'disc', profile: 'round', fit, across: m.d + fit, corners: m.d + fit, w: 0, l: 0, span: m.d + fit, depth: m.h, rotation: 0 };
}

function pocketSection(pk: Pocket, x: number, y: number): Contour {
  if (pk.profile === 'round') return translate([circle(pk.across / 2, 64)], x, y)[0]!;
  if (pk.profile === 'hex') return translate([regularPolygon(6, pk.corners / 2, 90)], x, y)[0]!;
  return translate(rotate([rect(pk.w, pk.l)], pk.rotation), x, y)[0]!;
}

export interface SliderGrid {
  cols: number;
  rows: number;
  pitch: number;
  travel: number;
  clicks: number;
}

/** The slider's magnet array; the pitch is measured from the pocket, wall and gap. */
export function sliderGrid(p: Params, pk = pocketOf(p)): SliderGrid {
  const rows = Number(p.sliderLayout) / 2;
  const pitch = pk.span + POCKET_WALL + Math.max(0, p.sliderGap) + 0.05;
  return { cols: 2, rows, pitch, travel: (rows - 1) * pitch, clicks: rows - 1 };
}

/** A solid with its top edge bevelled (stepped in 0.1 mm layers, as it prints). */
function bevelled(ctx: ManifoldContext<Params>, outline: CrossSection, h: number, chamfer: number): Manifold {
  const c = Math.min(chamfer, h / 2);
  if (c < 0.05) return ctx.extrude(outline, h);
  const steps = Math.max(2, Math.round(c / 0.1));
  const parts = [ctx.extrude(outline, h - c)];
  for (let i = 1; i <= steps; i++) {
    const s = outline.offset(-(c * i) / steps, 'Round', 2, 32);
    if (!s.isEmpty()) parts.push(ctx.extrude(s, c / steps, h - c + (c * (i - 1)) / steps));
  }
  return ctx.union(parts);
}

/** Keeps only outer boundaries (fills every hole). */
function filled(ctx: ManifoldContext<Params>, s: CrossSection): CrossSection {
  return ctx.cs(ctx.contours(s).filter((c) => signedArea(c) > 0));
}

interface Design {
  regions: { key: string; color: RGB; contours: Contour[]; area: number }[];
  silhouette: Contour[];
  width: number;
  height: number;
  cx: number;
  cy: number;
}

async function designOf(ctx: ManifoldContext<Params>): Promise<{ design: Design | null; notes: Diagnostic[] }> {
  const p = ctx.params;
  const notes: Diagnostic[] = [];
  let regions: Design['regions'] = [];
  let silhouette: Contour[] = [];
  if (p.source === 'text') {
    const value = p.text.split('\n').slice(0, 3).join('\n');
    if (!value.trim()) return { design: null, notes: [{ level: 'info', message: 'Type some text, or switch Design to Picture.' }] };
    const t = await layoutText(p.font, value, { capHeight: 10, letterSpacing: p.letterSpacing, tolerance: 0.02 }, ctx.inputs);
    if (t.missing.length) notes.push({ level: 'warning', message: `No bundled font has ${t.missing.map((c) => `“${c}”`).join(' ')}; left out.` });
    if (!t.contours.length) return { design: null, notes };
    regions = [{ key: 'text', color: p.textColor, contours: t.contours, area: 0 }];
    silhouette = ctx.contours(ctx.cs(t.contours, 'NonZero'));
  } else {
    const img = ctx.inputs.image as MagnetImage | undefined;
    if (!img?.regions?.length) return { design: null, notes: [{ level: 'info', message: 'Choose a picture (or switch Design to Text). Until then this is a plain body.' }] };
    regions = img.regions.map((r) => ({ key: String(r.index), color: r.color, contours: r.contours, area: 0 }));
    silhouette = img.silhouette;
  }
  const b = rectSize(bounds(silhouette.length ? silhouette : regions.flatMap((r) => r.contours)));
  if (!(b.width > 0 && b.height > 0)) return { design: null, notes };
  return { design: { regions, silhouette, width: b.width, height: b.height, cx: b.cx, cy: b.cy }, notes };
}

interface Layout {
  plate: CrossSection;
  /** Region outlines in mm, centred on the plate. */
  regions: { key: string; color: RGB; section: CrossSection }[];
  /** The area inlays are clipped to. */
  clip: CrossSection;
}

/** The body and the design at a given overall size (longest side, mm). */
function layoutAt(ctx: ManifoldContext<Params>, design: Design | null, size: number): Layout {
  const p = ctx.params;
  const m = Math.max(0, p.margin);
  const aspect = design ? design.width / design.height : 1.5;
  let shape = p.shape;
  if (shape === 'outline' && !design) shape = 'circle';

  const place = (k: number) =>
    design
      ? design.regions.map((r) => ({ key: r.key, color: r.color, section: ctx.cs(scale(translate(r.contours, -design.cx, -design.cy), k), 'EvenOdd') }))
      : [];

  if (shape === 'outline' && design) {
    const k = Math.max(1e-6, size - 2 * m) / Math.max(design.width, design.height);
    const sil = ctx.cs(scale(translate(design.silhouette, -design.cx, -design.cy), k), 'NonZero');
    // Close the gaps between nearby pieces (letters, specks), then drop the holes.
    const r = Math.max(1, Math.min(4, size * 0.03));
    const plate = filled(ctx, sil.offset(m + r, 'Round', 2, 32).offset(-r, 'Round', 2, 32));
    return { plate, regions: place(k), clip: plate };
  }

  let w = size;
  let h = size;
  if (shape === 'rectangle' || shape === 'roundedRect') {
    if (aspect >= 1) h = size / aspect;
    else w = size * aspect;
    // Room for the frame even on a very long design.
    h = Math.max(h, Math.min(size, 2 * m + 6));
    w = Math.max(w, Math.min(size, 2 * m + 6));
  }
  let outline: Contour;
  switch (shape) {
    case 'circle':
      outline = circle(size / 2, 160);
      break;
    case 'hexagon':
      outline = regularPolygon(6, size / 2, 90);
      break;
    case 'roundedRect':
      outline = roundedRect(w, h, Math.min(p.cornerRadius, Math.min(w, h) / 2 - 0.01));
      break;
    case 'square':
      outline = roundedRect(size, size, 0.4);
      break;
    default:
      outline = rect(w, h);
  }
  const plate = ctx.cs([outline]);
  const inner = m > 0 ? plate.offset(-m, 'Round', 2, 32) : plate;
  if (!design) return { plate, regions: [], clip: inner };
  // The largest scale at which the design's box fits inside the frame.
  const fits = (k: number) => ctx.cs([rect(design.width * k, design.height * k)]).subtract(inner).area() < 1e-3;
  let lo = 0;
  let hi = (size / Math.max(design.width, design.height)) * 1.01;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return { plate, regions: place(lo), clip: inner };
}

/** Where a pocket centre may sit: the plate eroded by half the pocket and the wall. */
function legalArea(plate: CrossSection, pk: Pocket): CrossSection {
  return plate.offset(-(pk.span / 2 + POCKET_WALL), 'Round', 2, 32);
}

/** Moves points by as much of (dx, dy) as keeps them all legal. */
function shifted(pts: [number, number][], legal: Contour[], dx: number, dy: number): [number, number][] {
  const at = (t: number) => pts.map(([x, y]) => [x + dx * t, y + dy * t] as [number, number]);
  const ok = (t: number) => at(t).every(([x, y]) => pointInside(legal, x, y));
  if (!dx && !dy) return pts;
  if (ok(1)) return at(1);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return at(lo);
}

/** Spreads up to `count` pockets over the legal area: centre first, then farthest point. */
export function autoPlace(legal: Contour[], count: number, spacing: number): [number, number][] {
  if (!legal.length || count < 1) return [];
  const b = bounds(legal);
  const size = rectSize(b);
  const step = Math.max(0.4, Math.max(size.width, size.height) / 60);
  const cand: [number, number][] = [];
  for (let x = b.minX; x <= b.maxX + 1e-9; x += step) for (let y = b.minY; y <= b.maxY + 1e-9; y += step) if (pointInside(legal, x, y)) cand.push([x, y]);
  for (const c of legal) for (let i = 0; i < c.length; i += 2) if (pointInside(legal, c[i]!, c[i + 1]!)) cand.push([c[i]!, c[i + 1]!]);
  if (!cand.length) {
    // A sliver: its own vertices are the only places a pocket can go.
    for (const c of legal) for (let i = 0; i < c.length; i += 2) cand.push([c[i]!, c[i + 1]!]);
  }
  if (!cand.length) return [];
  const d2 = (a: [number, number], q: [number, number]) => (a[0] - q[0]) ** 2 + (a[1] - q[1]) ** 2;
  const centre: [number, number] = [size.cx, size.cy];
  let seed = cand[0]!;
  for (const c of cand) if (d2(c, centre) < d2(seed, centre)) seed = c;
  const chosen: [number, number][] = [seed];
  const near = cand.map((c) => d2(c, seed));
  while (chosen.length < count) {
    let k = -1;
    let best = -1;
    near.forEach((v, i) => {
      if (v > best) {
        best = v;
        k = i;
      }
    });
    if (k < 0 || Math.sqrt(best) < spacing - 1e-6) break;
    const pick = cand[k]!;
    chosen.push(pick);
    cand.forEach((c, i) => (near[i] = Math.min(near[i]!, d2(c, pick))));
  }
  if (chosen.length === 2) {
    // A pair reads better balanced about the middle than pushed to one side.
    const mx = (chosen[0]![0] + chosen[1]![0]) / 2;
    const my = (chosen[0]![1] + chosen[1]![1]) / 2;
    return shifted(chosen, legal, size.cx - mx, size.cy - my);
  }
  return chosen;
}

function sliderPositions(grid: SliderGrid, rows: number): [number, number][] {
  const out: [number, number][] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < grid.cols; i++) out.push([(i - (grid.cols - 1) / 2) * grid.pitch, (j - (rows - 1) / 2) * grid.pitch]);
  return out;
}

const fmt = (v: number) => v.toFixed(2).replace(/\.?0+$/, '');

export async function build(ctx: ManifoldContext<Params>): Promise<BuildResult> {
  const p = ctx.params;
  const diagnostics: Diagnostic[] = [];
  const note = (message: string, level: Diagnostic['level'] = 'info') => diagnostics.push({ level, message });
  const slider = p.product === 'slider';
  const { design, notes } = await designOf(ctx);
  diagnostics.push(...notes);
  const overrides = (ctx.inputs.colours as ColourOverrides | undefined) ?? {};

  let mode = p.magnetMode;
  if (slider && mode === 'none') {
    mode = 'glue-on';
    note('A slider needs magnet pockets; using glue-in pockets.', 'warning');
  }
  const pk = pocketOf(p);
  const grid = sliderGrid(p, pk);

  // Size: a slider grows until its array fits.
  let size = p.size;
  let layout = layoutAt(ctx, design, size);
  /** The array centred where the body has the most room (the middle, for a preset shape). */
  const arrayAt = (l: Layout, rows: number): [number, number][] | null => {
    const legal = ctx.contours(legalArea(l.plate, pk));
    if (!legal.length) return null;
    const pole = poleOf(legal, 0.2);
    const pts = sliderPositions(grid, rows).map(([x, y]) => [x + pole.x, y + pole.y] as [number, number]);
    return pts.every(([x, y]) => pointInside(legal, x, y)) ? pts : null;
  };
  const arrayFits = (l: Layout, rows: number) => arrayAt(l, rows) !== null;
  let rows = grid.rows;
  if (slider && !arrayFits(layout, rows)) {
    let hi = size;
    let ok = false;
    for (let i = 0; i < 5 && !ok; i++) {
      hi *= 1.5;
      ok = arrayFits(layoutAt(ctx, design, hi), rows);
    }
    if (ok) {
      let lo = size;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (arrayFits(layoutAt(ctx, design, mid), rows)) hi = mid;
        else lo = mid;
      }
      size = Math.ceil(hi * 2) / 2;
      layout = layoutAt(ctx, design, size);
      note(`Grew to ${fmt(size)} mm so the ${grid.cols} × ${rows} magnet array fits with ${POCKET_WALL} mm walls.`);
    }
    while (rows > 2 && !arrayFits(layout, rows)) rows--;
    if (!arrayFits(layout, rows)) throw new Error('This outline has no room for the slider’s magnet array. Choose a rounded rectangle or circle, or smaller magnets.');
    if (rows < grid.rows) note(`Only ${rows} rows of magnets fit this outline (${grid.cols * rows} per half).`, 'warning');
  }
  const { plate, clip } = layout;
  if (plate.isEmpty()) throw new Error('The design has no area to print.');
  const pieces = plate.decompose().length;
  if (pieces > 1) note('The outline is in separate pieces; widen the frame margin or pick a shape to join them.', 'warning');

  // Thickness: never thinner than the magnet needs.
  const floor = mode === 'embedded' ? Math.max(0.2, p.backWall) : 0;
  const needed = mode === 'none' ? 1.2 : floor + pk.depth + COVER;
  const T = Math.max(p.thickness, needed);
  if (T > p.thickness + 1e-6) note(`Thickened to ${fmt(T)} mm: ${fmt(pk.depth)} mm magnet${floor ? ` over a ${fmt(floor)} mm floor` : ''}, with ${COVER} mm above it.`);
  const depth = Math.min(p.inlayDepth, T - (mode === 'none' ? 0.6 : floor + pk.depth + 0.2));

  // Inlays: smallest colour first, so details win where colours meet.
  const bevel = Math.max(0, Math.min(p.bevel, T / 2));
  const inlayClip = bevel > 0 ? clip.intersect(plate.offset(-bevel, 'Round', 2, 32)) : clip;
  const inlays: { section: CrossSection; color: RGB; level: number; name: string }[] = [];
  let taken: CrossSection | null = null;
  const ordered = layout.regions.map((r) => ({ ...r, area: r.section.area() })).sort((a, b) => a.area - b.area);
  for (const r of ordered) {
    let s = (p.bleed > 0 ? r.section.offset(p.bleed, 'Round', 2, 16) : r.section).intersect(inlayClip);
    if (taken) s = s.subtract(taken);
    if (s.isEmpty() || s.area() < 0.2) continue;
    taken = taken ? taken.add(s) : s;
    const o = overrides[r.key] ?? {};
    inlays.push({ section: s, color: o.color ?? r.color, level: Math.max(0, Math.round(o.level ?? 0)), name: p.source === 'text' ? 'Text' : `Colour ${inlays.length + 1}` });
  }
  const step = Math.max(0.1, p.raiseStep);

  // Pockets.
  let positions: [number, number][] = [];
  if (mode !== 'none') {
    const legalCs = legalArea(plate, pk);
    const legal = ctx.contours(legalCs);
    if (slider) positions = shifted(arrayAt(layout, rows) ?? [], legal, p.shiftX, p.shiftY);
    else {
      positions = shifted(autoPlace(legal, Math.round(p.count), pk.span + POCKET_WALL), legal, p.shiftX, p.shiftY);
      if (!positions.length) note('There is no room for this magnet with a 2 mm wall. Make the magnet bigger, use smaller magnets, or use magnetic sheet.', 'warning');
      else if (positions.length < p.count) note(`Room for ${positions.length} of ${p.count} magnets with ${POCKET_WALL} mm walls.`, 'warning');
    }
  }
  const cutter = positions.length
    ? ctx.extrude(
        ctx.cs(positions.map(([x, y]) => pocketSection(pk, x, y))),
        mode === 'embedded' ? pk.depth : pk.depth + 1,
        mode === 'embedded' ? floor : -1,
      )
    : null;

  const body = (withInlays: boolean) => {
    let m = bevelled(ctx, plate, T, bevel);
    if (withInlays && taken) m = m.subtract(ctx.extrude(taken, depth + 1, T - depth));
    if (cutter) m = m.subtract(cutter);
    return m;
  };
  const inlaySolids = inlays.map((i) => ({ ...i, solid: ctx.extrude(i.section, depth + i.level * step, T - depth) }));

  const parts: Part[] = [];
  const add = (m: Manifold, name: string, color: RGB, group: string) => {
    const part = ctx.part(m, name, color, { group });
    if (part) parts.push(part);
  };
  const groupA = slider ? 'Half A' : 'Magnet';
  add(body(true), slider ? 'Body A' : 'Body', p.bodyColor, groupA);
  for (const i of inlaySolids) add(i.solid, i.name, i.color, groupA);

  if (slider) {
    // The halves meet face to face, so one is turned over to assemble. Turning over
    // mirrors a footprint: an asymmetric outline has to be built mirrored to stack flush.
    // Every preset shape is symmetric, so those keep un-mirrored artwork.
    const mirror = p.shape === 'outline' && !!design;
    const b = plate.bounds();
    const dx = b.max[0] - b.min[0] + PIECE_GAP;
    const place = (m: Manifold) => (mirror ? m.mirror([1, 0, 0]).translate([b.max[0] + b.min[0], 0, 0]) : m).translate([dx, 0, 0]);
    if (p.sliderBlank) add(place(body(false)), 'Body B', p.bodyColor, 'Half B');
    else {
      add(place(body(true)), 'Body B', p.bodyColor, 'Half B');
      for (const i of inlaySolids) add(place(i.solid), `${i.name} B`, i.color, 'Half B');
    }
    if (mirror && !p.sliderBlank) note('Half B is mirrored so the outlines stack flush when it is turned over; its artwork is mirrored too.');
    note(`${grid.cols * rows} magnets per half, ${fmt(grid.pitch)} mm apart: ${rows - 1} click${rows - 1 === 1 ? '' : 's'} over ${fmt((rows - 1) * grid.pitch)} mm of travel.`);
    note('Alternate the poles up each column (N, S, N…) in both halves, and check the click before gluing.');
  }

  // Pocket report.
  if (positions.length) {
    const what =
      pk.profile === 'round'
        ? `⌀${fmt(pk.across)} mm round`
        : pk.profile === 'hex'
          ? `hex, ${fmt(pk.across)} mm across flats (${fmt(pk.corners)} across corners)`
          : `${fmt(pk.w)} × ${fmt(pk.l)} mm`;
    note(`Pockets: ${what}, ${fmt(pk.depth)} mm deep.`);
    if (mode === 'embedded') note(`Embedded: add a pause at ${fmt(floor + pk.depth)} mm (the first layer over the pockets), drop the magnets in, and resume.`);
    else note('Glue the magnets into the open pockets on the back.');
  } else if (mode === 'none') note('No pockets: stick the flat back onto adhesive magnetic sheet and trim round it.');

  const colours = new Set([p.bodyColor, ...inlays.map((i) => i.color)].map((c) => c.join(',')));
  if (colours.size > 4) note(`${colours.size} filaments: more than a 4-slot AMS holds. Merge colours in the Colours panel or the picture.`, 'warning');
  return { parts, diagnostics };
}
