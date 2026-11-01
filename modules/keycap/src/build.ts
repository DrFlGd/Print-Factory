/**
 * Keycap geometry, written parametrically for Print Factory.
 *
 * A cap is the hull of its bottom and top outlines (a tapered, rounded block), with the dish
 * cut out of the top as a cylinder whose axis runs along the key, and a cavity hulled the
 * same way, leaving walls and a roof. The switch stems hang from the cavity ceiling: Cherry MX
 * style cross sockets for the Standard, Thocky and Low profiles, two male legs for Kailh Choc
 * v1.
 *
 * The legend is carved from the top surface: an inlay (a second colour, flush), an engraving
 * (one colour, recessed) or shine-through (cut clean through the roof and printed with the
 * stem in clear filament so a switch LED lights it).
 *
 * Frame: X along the key's width, Y front to back (front is −Y), Z up, the skirt on z = 0.
 * Face-down printing turns the finished solids over at the very end.
 */
import type { BuildResult, Contour, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold, ManifoldContext } from '@pf/engine-manifold';
import { bounds, mirrorX, pill, rect, rotate, roundedRect, translate } from '@pf/shapes';
import { symbolShapes } from '@pf/symbols';
import { text as layoutText } from '@pf/text';

export type ProfileId = 'standard' | 'thocky' | 'low' | 'choc';
export type Corner = 'top-left' | 'top' | 'top-right' | 'bottom-left' | 'bottom' | 'bottom-right';

export interface Params {
  product: 'keycap' | 'fit-test';
  profile: ProfileId;
  size: string;
  chocSize: string;
  legend: 'symbol' | 'text' | 'none';
  symbol: string;
  text: string;
  font: string;
  legendSize: number;
  letterSpacing: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  mirror: boolean;
  text2: string;
  text2Size: number;
  text2Corner: Corner;
  style: 'inlay' | 'engraved' | 'shine';
  depth: number;
  homingBump: boolean;
  tolerance: number;
  fitStep: number;
  orientation: 'auto' | 'upright' | 'face-down';
  capColor: RGB;
  legendColor: RGB;
}

export interface Profile {
  label: string;
  /** Key pitch (one unit) across and front to back. */
  pitch: [number, number];
  /** Pitch minus the cap's footprint: the gap between neighbouring caps. */
  gap: number;
  height: number;
  /** How far the top outline sits inside the bottom one, per side. */
  topInset: number;
  /** Depth of the cylindrical dish; 0 is a flat top. */
  dish: number;
  /** Height of the cavity ceiling, where the stems meet the roof. */
  ceiling: number;
  wall: number;
  bottomRadius: number;
  topRadius: number;
  stem: 'mx' | 'choc';
}

/** Heights and footprints after the caps the Vostok generator shipped (measured from its catalogue). */
export const PROFILES: Record<ProfileId, Profile> = {
  standard: { label: 'Standard', pitch: [19.05, 19.05], gap: 0.91, height: 11.8, topInset: 1.47, dish: 0.8, ceiling: 9.2, wall: 1.5, bottomRadius: 1, topRadius: 2, stem: 'mx' },
  thocky: { label: 'Thocky', pitch: [19.05, 19.05], gap: 0.85, height: 9.0, topInset: 1.4, dish: 0, ceiling: 4.3, wall: 1.6, bottomRadius: 1, topRadius: 1.8, stem: 'mx' },
  low: { label: 'Low profile', pitch: [19.05, 19.05], gap: 0.91, height: 5.2, topInset: 0.6, dish: 0, ceiling: 3.2, wall: 1.2, bottomRadius: 1, topRadius: 1.4, stem: 'mx' },
  choc: { label: 'Choc v1', pitch: [18, 17], gap: 0.5, height: 3.5, topInset: 0.8, dish: 0, ceiling: 2, wall: 1, bottomRadius: 1, topRadius: 1.2, stem: 'choc' },
};

/** Width in units and the stabiliser stems' distance from the centre stem (0 = none). */
export const SIZES: Record<string, { u: number; stab: number; label: string }> = {
  '1u': { u: 1, stab: 0, label: '1u' },
  '1.25u': { u: 1.25, stab: 0, label: '1.25u' },
  '1.5u': { u: 1.5, stab: 0, label: '1.5u' },
  '1.75u': { u: 1.75, stab: 0, label: '1.75u' },
  '2u': { u: 2, stab: 0, label: '2u' },
  '2u-stab': { u: 2, stab: 11.9, label: '2u (stabilised)' },
  '2.25u': { u: 2.25, stab: 11.9, label: '2.25u' },
  '2.75u': { u: 2.75, stab: 11.9, label: '2.75u' },
  '6u': { u: 6, stab: 49, label: '6u spacebar' },
  '6.25u': { u: 6.25, stab: 50, label: '6.25u spacebar' },
  '6.5u': { u: 6.5, stab: 52.5, label: '6.5u spacebar' },
};
export const CHOC_SIZES = ['1u', '1.5u', '2u'];

/** Cherry MX cross socket at zero clearance, and the stem round it. */
export const MX = { stemDia: 5.5, crossLength: 4.05, crossWidth: 1.29 };
/** Kailh Choc v1 legs: two posts, centre to centre 5.7 mm. */
export const CHOC = { legX: 2.85, legWidth: 1.2, legLength: 3.0, below: 1.8 };
export const TOLERANCE_RANGE: [number, number] = [-0.4, 0.4];
export const FIT_RUNGS = 5;
const FIT_TAB = 2;
const FIT_MARGIN = 2;
const FIT_LABEL_BAND = 7;
const FIT_LABEL_DEPTH = 0.6;
const FIT_GAP = 3;
const FIT_FONT = 'space-mono-700';
const LEGEND_EDGE = 0.5;
const SHINE_EDGE = 0.8;
const MIN_ROOF = 0.6;
const BUMP = { length: 5, width: 1, height: 0.5, at: 0.28 };

export interface Cap {
  profile: Profile;
  width: number;
  depth: number;
  topWidth: number;
  topDepth: number;
  /** Dish radius (0 for a flat top). */
  radius: number;
  stems: number[];
}

export function capOf(p: Params): Cap {
  const profile = PROFILES[p.profile] ?? PROFILES.standard;
  const choc = profile.stem === 'choc';
  const sizeId = choc ? (CHOC_SIZES.includes(p.chocSize) ? p.chocSize : '1u') : SIZES[p.size] ? p.size : '1u';
  const size = SIZES[sizeId]!;
  const width = profile.pitch[0] * size.u - profile.gap;
  const depth = profile.pitch[1] - profile.gap;
  const topWidth = width - 2 * profile.topInset;
  const topDepth = depth - 2 * profile.topInset;
  const s = profile.dish;
  const radius = s > 0 ? (topDepth * topDepth) / 4 / (2 * s) + s / 2 : 0;
  const stems = choc || !size.stab ? [0] : [-size.stab, 0, size.stab];
  return { profile, width, depth, topWidth, topDepth, radius, stems };
}

/** Height of the top surface at front-to-back position y. */
export function topAt(cap: Cap, y: number): number {
  const { height, dish } = cap.profile;
  if (!dish) return height;
  const R = cap.radius;
  return height - dish + R - Math.sqrt(Math.max(0, R * R - y * y));
}

/** The stem clearances a fit test prints: centred on the current one, clamped, no repeats. */
export function fitLadder(center: number, step: number, count = FIT_RUNGS): number[] {
  const [lo, hi] = TOLERANCE_RANGE;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const v = Math.round(Math.min(hi, Math.max(lo, center + (i - (count - 1) / 2) * step)) * 100) / 100;
    if (!out.some((o) => Math.abs(o - v) < 1e-9)) out.push(v);
  }
  return out;
}

export const formatClearance = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : `${v > 0 ? '+' : '-'}${Math.abs(v).toFixed(2)}`);

type Ctx = ManifoldContext<Params>;

/** A hull of outlines placed at heights: each entry is [contour, z]. */
function loft(ctx: Ctx, layers: [Contour, number][]): Manifold {
  const pts: [number, number, number][] = [];
  for (const [c, z] of layers) for (let i = 0; i < c.length; i += 2) pts.push([c[i]!, c[i + 1]!, z]);
  return ctx.Manifold.hull(pts);
}

/** A cylinder along X through (0, 0, zc). */
function xCylinder(ctx: Ctx, r: number, length: number, zc: number): Manifold {
  const segs = Math.min(1440, Math.max(96, Math.ceil((2 * Math.PI * r) / 0.4)));
  return ctx.Manifold.cylinder(length, r, r, segs, true).rotate([0, 90, 0]).translate([0, 0, zc]);
}

/** Outline at height z of a cap that tapers from `bottom` to `top`. */
function outlineAt(cap: Cap, z: number, grow = 0): Contour {
  const { height, topInset, bottomRadius, topRadius } = cap.profile;
  const t = Math.min(1, Math.max(0, z / height));
  const w = cap.width - 2 * topInset * t + 2 * grow;
  const d = cap.depth - 2 * topInset * t + 2 * grow;
  const r = bottomRadius + (topRadius - bottomRadius) * t + grow;
  return roundedRect(w, d, Math.max(0.2, r), 6);
}

/** The cap's outside, dish cut, no cavity. */
function outerSolid(ctx: Ctx, cap: Cap): Manifold {
  const { height, dish } = cap.profile;
  let outer = loft(ctx, [
    [outlineAt(cap, 0), 0],
    [outlineAt(cap, height), height],
  ]);
  if (dish > 0) outer = outer.subtract(xCylinder(ctx, cap.radius, cap.width + 4, height - dish + cap.radius));
  return outer;
}

function cavity(ctx: Ctx, cap: Cap): Manifold {
  const { ceiling, wall } = cap.profile;
  return loft(ctx, [
    [outlineAt(cap, -0.5, -wall), -0.5],
    [outlineAt(cap, ceiling, -wall), ceiling],
  ]);
}

/** The cavity's ceiling outline, for shine-through holes. */
function ceilingSection(ctx: Ctx, cap: Cap, inset: number): CrossSection {
  return ctx.cs([outlineAt(cap, cap.profile.ceiling, -cap.profile.wall - inset)]);
}

/** One switch stem at x, from z0 to z1, with its socket (MX) or as legs (Choc). */
function stem(ctx: Ctx, kind: Profile['stem'], tol: number, x: number, z0: number, z1: number, hole: [number, number] = [z0 - 1, z1]): Manifold {
  if (kind === 'choc') {
    const w = Math.max(0.5, CHOC.legWidth - tol);
    const l = Math.max(1.5, CHOC.legLength - tol);
    return ctx.union([-CHOC.legX, CHOC.legX].map((lx) => ctx.extrude([rect(w, l)], z1 - z0, z0).translate([x + lx, 0, 0])));
  }
  const body = ctx.Manifold.cylinder(z1 - z0, MX.stemDia / 2, MX.stemDia / 2, 64).translate([x, 0, z0]);
  const L = MX.crossLength + tol;
  const W = MX.crossWidth + tol;
  const cross = ctx.cs([rect(L, W), rect(W, L)], 'NonZero');
  return body.subtract(ctx.extrude(cross, hole[1] - hole[0], hole[0]).translate([x, 0, 0]));
}

interface Legend {
  section: CrossSection | null;
  warnings: Diagnostic[];
}

async function textSection(ctx: Ctx, value: string, capHeight: number, letterSpacing: number): Promise<{ contours: Contour[]; missing: string[] }> {
  const l = await layoutText(ctx.params.font, value, { capHeight, letterSpacing, align: 'center' }, ctx.inputs);
  if (!l.contours.length) return { contours: [], missing: l.missing };
  const b = l.bounds;
  return { contours: translate(l.contours, -(b.minX + b.maxX) / 2, -(b.minY + b.maxY) / 2), missing: l.missing };
}

async function legendOf(ctx: Ctx, cap: Cap): Promise<Legend> {
  const p = ctx.params;
  const warnings: Diagnostic[] = [];
  const sections: CrossSection[] = [];
  let main: CrossSection | null = null;
  if (p.legend === 'symbol' && p.symbol) {
    const shapes = await symbolShapes(p.symbol, p.legendSize, ctx.inputs);
    const parts = shapes.map((s) => {
      let c = s.contours;
      if (p.mirror) c = mirrorX(c);
      return ctx.cs(translate(rotate(c, p.rotation), p.offsetX, p.offsetY), s.fillRule);
    });
    if (parts.length) main = ctx.CrossSection.union(parts);
  } else if (p.legend === 'text' && p.text.trim()) {
    const t = await textSection(ctx, p.text, p.legendSize, p.letterSpacing);
    if (t.missing.length) warnings.push({ level: 'warning', message: `This font has no ${t.missing.join(' ')}.` });
    let c = t.contours;
    if (p.mirror) c = mirrorX(c);
    if (c.length) main = ctx.cs(translate(rotate(c, p.rotation), p.offsetX, p.offsetY), 'NonZero');
  }
  if (main && !main.isEmpty()) sections.push(main);
  if (p.text2.trim()) {
    const t = await textSection(ctx, p.text2, p.text2Size, 0);
    if (t.contours.length) {
      const b = bounds(t.contours);
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      const m = 1.4;
      const corner = p.text2Corner;
      const x = corner.endsWith('left') ? -cap.topWidth / 2 + m + w / 2 : corner.endsWith('right') ? cap.topWidth / 2 - m - w / 2 : 0;
      const y = corner.startsWith('top') ? cap.topDepth / 2 - m - h / 2 : -cap.topDepth / 2 + m + h / 2;
      sections.push(ctx.cs(translate(t.contours, x, y), 'NonZero'));
    }
  }
  if (!sections.length) return { section: null, warnings };
  const all = ctx.CrossSection.union(sections);
  const face = ctx.cs([outlineAt(cap, cap.profile.height, -LEGEND_EDGE)]);
  let clipped = all.intersect(face);
  if (p.style === 'shine') clipped = clipped.intersect(ceilingSection(ctx, cap, SHINE_EDGE));
  const before = all.area();
  if (before > 0 && clipped.area() < before * 0.98) {
    warnings.push({
      level: 'warning',
      message: p.style === 'shine' ? 'The legend runs past the inside of the walls and was trimmed. Make it smaller or move it in.' : 'The legend runs off the top of the key and was trimmed. Make it smaller or move it in.',
    });
  }
  return { section: clipped.isEmpty() ? null : clipped, warnings };
}

function homingBump(ctx: Ctx, cap: Cap): Manifold {
  const { height, dish } = cap.profile;
  const y = -cap.topDepth * BUMP.at;
  const bar = ctx.cs([pill(BUMP.length, BUMP.width)]).translate([0, y]);
  if (!dish) return ctx.extrude(bar, BUMP.height + 0.01, height - 0.01);
  const zc = height - dish + cap.radius;
  const column = ctx.extrude(bar, dish + BUMP.height + 2, height - dish - 1);
  const len = cap.width + 4;
  const shell = xCylinder(ctx, cap.radius + 0.01, len, zc).subtract(xCylinder(ctx, cap.radius - BUMP.height, len, zc));
  return column.intersect(shell);
}

async function buildKeycap(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  const cap = capOf(p);
  const { profile } = cap;
  const { height, dish, ceiling } = profile;
  const diagnostics: Diagnostic[] = [];
  const tol = Math.min(TOLERANCE_RANGE[1], Math.max(TOLERANCE_RANGE[0], p.tolerance));
  const faceDown = p.orientation === 'face-down' || (p.orientation === 'auto' && dish === 0);
  if (faceDown && dish > 0) diagnostics.push({ level: 'warning', message: 'A dished top does not sit flat on the bed. Print the Standard profile upright.' });

  const outer = outerSolid(ctx, cap);
  const roof = height - dish - ceiling;
  let depth = p.depth;
  if (p.style !== 'shine' && depth > roof - MIN_ROOF) {
    depth = Math.max(0.2, roof - MIN_ROOF);
    diagnostics.push({ level: 'warning', message: `Legend depth limited to ${depth.toFixed(1)} mm so the roof stays ${MIN_ROOF} mm thick.` });
  }

  let body = outer.subtract(cavity(ctx, cap));
  const choc = profile.stem === 'choc';
  const z0 = choc ? -CHOC.below : 0;
  const stems = ctx.union(cap.stems.map((x) => stem(ctx, profile.stem, tol, x, z0, ceiling + 0.01)));

  const legend = await legendOf(ctx, cap);
  diagnostics.push(...legend.warnings);
  let legendSolid: Manifold | null = null;
  if (legend.section) {
    // The cutter runs on above the top, so the body keeps no faces flush with the legend's top
    // (flush faces leave zero-thickness slivers behind).
    const cutter = p.style === 'shine' ? ctx.extrude(legend.section, height + 2 - ceiling, ceiling - 0.01) : ctx.extrude(legend.section, height + 2, 0).subtract(outer.translate([0, 0, -depth]));
    legendSolid = cutter.intersect(outer);
    body = body.subtract(cutter);
  }

  if (p.homingBump) {
    if (faceDown) diagnostics.push({ level: 'info', message: 'The homing bump is left off: the top faces the bed. Print upright to have one.' });
    else body = body.add(homingBump(ctx, cap));
  }

  let legendPart: Manifold | null = null;
  if (p.style === 'shine') {
    // The stems print in the clear legend filament so light reaches the legend.
    body = body.subtract(stems);
    legendPart = legendSolid ? legendSolid.add(stems) : stems;
  } else {
    body = body.add(stems);
    if (p.style === 'inlay') legendPart = legendSolid;
  }

  const place = (m: Manifold) => (faceDown ? m.rotate([180, 0, 0]).translate([0, 0, height]) : m);
  const parts: Part[] = [];
  const bodyPart = ctx.part(place(body), 'Keycap', p.capColor);
  if (bodyPart) parts.push(bodyPart);
  if (legendPart && !legendPart.isEmpty()) {
    const lp = ctx.part(place(legendPart), p.style === 'shine' ? (legendSolid ? 'Legend and stem' : 'Stem') : 'Legend', p.legendColor);
    if (lp) parts.push(lp);
  }

  if (!legend.section && p.legend !== 'none') diagnostics.push({ level: 'info', message: p.legend === 'symbol' ? 'Pick a symbol, or set Legend to None for a blank cap.' : 'Type a legend, or set Legend to None for a blank cap.' });
  const sizeLabel = SIZES[choc ? p.chocSize : p.size]?.label ?? '1u';
  const how = faceDown ? 'Prints face down' : 'Prints upright, skirt on the bed';
  const fit = `stem clearance ${formatClearance(tol)} mm`;
  let note = '';
  if (legend.section) {
    if (p.style === 'inlay') note = faceDown ? `; the legend is the first ${depth.toFixed(1)} mm, a second filament` : `; the legend is a ${depth.toFixed(1)} mm inlay in the top layers, a second filament`;
    else if (p.style === 'shine') note = '; print the legend and stem in clear or translucent filament';
  }
  if (p.style === 'inlay' && legend.section) diagnostics.push({ level: 'info', message: 'Two colours in the same layers: this needs a printer that swaps filament (AMS, MMU).' });
  return {
    parts,
    diagnostics,
    summary: `${profile.label} ${sizeLabel} keycap, ${cap.width.toFixed(1)} × ${cap.depth.toFixed(1)} × ${height.toFixed(1)} mm, ${fit}. ${how}${note}.`,
  };
}

async function buildFitTest(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  const profile = PROFILES[p.profile] ?? PROFILES.standard;
  const choc = profile.stem === 'choc';
  const values = fitLadder(p.tolerance, p.fitStep || 0.1);
  const region = (choc ? 2 * CHOC.legX + CHOC.legWidth : MX.stemDia) + 2 * FIT_MARGIN;
  const tabD = region + FIT_LABEL_BAND;
  const stemH = choc ? CHOC.legLength + CHOC.below - 1 : 5;
  const pieces: { value: number; label: Contour[]; width: number }[] = [];
  for (const v of values) {
    const l = await layoutText(FIT_FONT, formatClearance(v), { capHeight: 3.2, align: 'center' }, ctx.inputs);
    const b = l.bounds;
    const label = translate(l.contours, -(b.minX + b.maxX) / 2, -(b.minY + b.maxY) / 2);
    pieces.push({ value: v, label, width: Math.max(region, b.maxX - b.minX + 3) });
  }
  const total = pieces.reduce((s, q) => s + q.width, 0) + FIT_GAP * (pieces.length - 1);
  let x = -total / 2;
  const parts: Part[] = [];
  for (const q of pieces) {
    const cx = x + q.width / 2;
    x += q.width + FIT_GAP;
    const sy = tabD / 2 - region / 2;
    const ly = -tabD / 2 + FIT_LABEL_BAND / 2;
    let tab = ctx.extrude([roundedRect(q.width, tabD, 1.5)], FIT_TAB);
    tab = tab.subtract(ctx.extrude(ctx.cs(translate(q.label, 0, ly), 'NonZero'), FIT_LABEL_DEPTH + 1, FIT_TAB - FIT_LABEL_DEPTH));
    // Stems stand up out of the tab, socket open at the top, so nothing overhangs.
    const s = stem(ctx, profile.stem, q.value, 0, FIT_TAB - 0.2, FIT_TAB + stemH, [FIT_TAB + 0.5, FIT_TAB + stemH + 1]).translate([0, sy, 0]);
    const part = ctx.part(tab.add(s).translate([cx, 0, 0]), `Fit ${formatClearance(q.value)}`, p.capColor, { group: 'Fit test' });
    if (part) parts.push(part);
  }
  const lo = formatClearance(values[0]!);
  const hi = formatClearance(values[values.length - 1]!);
  return {
    parts,
    diagnostics: [{ level: 'info', message: `Press each ${choc ? 'Choc' : 'MX'} stem onto a real switch, then set Stem clearance to the number on the one that fits best.` }],
    summary: `${values.length} ${profile.label} stems from ${lo} to ${hi} mm, ${formatClearance(p.fitStep || 0.1).replace('+', '')} mm apart.`,
  };
}

export async function build(ctx: Ctx): Promise<BuildResult> {
  return ctx.params.product === 'fit-test' ? buildFitTest(ctx) : buildKeycap(ctx);
}
