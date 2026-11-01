/**
 * Fold-up box: a box net printed flat as a thin sheet, with every fold line a groove down
 * to a one-layer hinge, and an optional logo inlaid in the outside face. A folded copy can be
 * shown beside the sheet (preview only, never exported).
 *
 * Frame: z = 0 is the bed and the outside of the box. The full sheet is `sheetLayers` layers
 * thick; along each fold a groove leaves `hingeLayers` layers.
 */
import type { BuildResult, Contour, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold, ManifoldContext } from '@pf/engine-manifold';
import { bounds, mirrorX, rect, rectSize, rotate, scale, translate } from '@pf/shapes';
import { symbolShapes } from '@pf/symbols';
import { text as layoutText } from '@pf/text';
import type { NetOptions, Panel, Style } from './net';
import { allowance, buildNet } from './net';

export interface Params {
  style: Style;
  sizeBasis: 'inside' | 'outside';
  length: number;
  width: number;
  height: number;
  lidHeight: number;
  lidPlay: number;
  tuckDepth: number;
  tuckLock: 'friction' | 'slit' | 'none';
  thumbNotch: boolean;
  handHoles: boolean;
  window: boolean;
  windowScale: number;
  windowRadius: number;
  art: 'none' | 'text' | 'symbol';
  artText: string;
  font: string;
  symbol: string;
  artSize: number;
  artTurn: number;
  layerHeight: number;
  sheetLayers: number;
  hingeLayers: number;
  grooveWidth: number;
  cutGap: number;
  sheetColor: RGB;
  artColor: RGB;
  foldPreview: number;
}

type Ctx = ManifoldContext<Params>;
type Mat = number[];

const STYLE_NAMES: Record<Style, string> = { mailer: 'Mailer', 'mailer-flaps': 'Mailer with side flaps', tray: 'Tray', 'tray-lid': 'Tray and lid' };

/** Sheet thickness and the hinge left under each groove. */
export function sheetOf(p: Params): { t: number; hinge: number; groove: number } {
  const layers = Math.max(2, Math.round(p.sheetLayers));
  const hingeLayers = Math.min(layers - 1, Math.max(1, Math.round(p.hingeLayers)));
  const t = layers * p.layerHeight;
  // A 90° fold of a t-thick sheet needs at least about 2t of groove to close into.
  return { t, hinge: hingeLayers * p.layerHeight, groove: Math.max(p.grooveWidth, 2 * t) };
}

export function netOptions(p: Params): NetOptions {
  const { t } = sheetOf(p);
  const a = allowance(t);
  const out = p.sizeBasis === 'outside';
  return {
    style: p.style,
    L: Math.max(10, out ? p.length - a.L : p.length),
    W: Math.max(10, out ? p.width - a.W : p.width),
    H: Math.max(5, out ? p.height - a.H : p.height),
    t,
    gap: Math.max(0.3, p.cutGap),
    tuckDepth: p.tuckDepth,
    tuckLock: p.tuckLock,
    thumbNotch: p.thumbNotch,
    handHoles: p.handHoles,
    window: p.window,
    windowScale: p.windowScale,
    windowRadius: p.windowRadius,
    lidHeight: p.lidHeight,
    lidPlay: p.lidPlay,
  };
}

/* ---------------------------------------------------------------- matrices (column-major 4×4) */

const I = (): Mat => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a: Mat, b: Mat): Mat {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r]! * b[c * 4 + k]!;
  return o;
}
function translation(x: number, y: number, z: number): Mat {
  const m = I();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}
/** Rotation by `deg` about the axis through (px, py, 0) along (ux, uy, 0). */
export function hingeMatrix(px: number, py: number, ux: number, uy: number, deg: number): Mat {
  const l = Math.hypot(ux, uy);
  const x = ux / l;
  const y = uy / l;
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const C = 1 - c;
  // Rodrigues with z = 0.
  const R: Mat = [c + x * x * C, y * x * C, -y * s, 0, x * y * C, c + y * y * C, x * s, 0, y * s, -x * s, c, 0, 0, 0, 0, 1];
  return mul(translation(px, py, 0), mul(R, translation(-px, -py, 0)));
}

function centroidOf(c: Contour): [number, number] {
  let x = 0;
  let y = 0;
  const n = c.length / 2;
  for (let i = 0; i < c.length; i += 2) {
    x += c[i]!;
    y += c[i + 1]!;
  }
  return [x / n, y / n];
}

/** Each panel's placement at `fraction` of the full fold. */
export function foldMatrices(panels: Panel[], fraction: number): Map<string, Mat> {
  const byId = new Map(panels.map((p) => [p.id, p]));
  const out = new Map<string, Mat>();
  const of = (p: Panel): Mat => {
    const hit = out.get(p.id);
    if (hit) return hit;
    let m = I();
    if (p.parent && p.hinge) {
      const parent = byId.get(p.parent);
      const base = parent ? of(parent) : I();
      let [ax, ay, bx, by] = p.hinge;
      const [cx, cy] = centroidOf(p.outline);
      // Orient the hinge with the panel on its left: a positive turn then lifts it off the bed.
      if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0) [ax, ay, bx, by] = [bx, by, ax, ay];
      m = mul(base, hingeMatrix(ax, ay, bx - ax, by - ay, p.angle * fraction));
    }
    out.set(p.id, m);
    return m;
  };
  for (const p of panels) of(p);
  return out;
}

/**
 * Artwork from reading coordinates onto its panel: mirrored top to bottom, because the outside
 * face is the one on the bed, which is what makes it read right once the panel is folded.
 */
export function placeArt(contours: Contour[], cx: number, cy: number, turn: number): Contour[] {
  return translate(rotate(mirrorX(rotate(contours, 90), 0), -90 + turn), cx, cy);
}

function sectionOf(ctx: Ctx, p: Panel): CrossSection {
  const s = ctx.cs([p.outline]);
  return p.holes.length ? s.subtract(ctx.cs(p.holes, 'NonZero')) : s;
}

async function artwork(ctx: Ctx, size: number): Promise<{ contours: Contour[]; fill: 'NonZero' | 'EvenOdd' }[]> {
  const p = ctx.params;
  if (p.art === 'symbol' && p.symbol) return (await symbolShapes(p.symbol, size, ctx.inputs)).map((s) => ({ contours: s.contours, fill: s.fillRule }));
  if (p.art === 'text' && p.artText.trim()) {
    const l = await layoutText(p.font, p.artText, { align: 'center', capHeight: 10 }, ctx.inputs);
    if (!l.contours.length) return [];
    const b = rectSize(l.bounds);
    const k = size / Math.max(b.width, b.height);
    return [{ contours: scale(translate(l.contours, -b.cx, -b.cy), k), fill: 'NonZero' }];
  }
  return [];
}

export async function build(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  const notes: Diagnostic[] = [];
  const o = netOptions(p);
  const { t, hinge, groove } = sheetOf(p);
  const net = buildNet(o);
  const sections = new Map(net.panels.map((q) => [q.id, sectionOf(ctx, q)]));
  const blank = ctx.CrossSection.union([...sections.values()]);
  const roots = net.panels.filter((q) => !q.parent).length;
  if (blank.decompose().length !== roots) notes.push({ level: 'warning', message: 'Some panels run into each other at this size. Make the box a little larger.' });

  // Grooves along every fold.
  const grooves = ctx.CrossSection.union(
    net.panels
      .filter((q) => q.hinge)
      .map((q) => {
        const [ax, ay, bx, by] = q.hinge!;
        const len = Math.hypot(bx - ax, by - ay);
        const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
        return ctx.cs(translate(rotate([rect(len, groove)], ang), (ax + bx) / 2, (ay + by) / 2));
      }),
  );
  let sheet = ctx.extrude(blank, hinge).add(ctx.extrude(blank.subtract(grooves), t - hinge, hinge));

  // Artwork, inlaid one layer deep in the outside face of its panel.
  let artSolid: Manifold | null = null;
  const face = net.panels.find((q) => q.id === net.face);
  if (p.art !== 'none' && face) {
    const shapes = await artwork(ctx, p.artSize);
    if (shapes.length) {
      const [cx, cy] = centroidOf(face.outline);
      // Mirrored top to bottom: the outside face is the one on the bed, and it reads right once folded.
      const placed = shapes.map((s) => ctx.cs(placeArt(s.contours, cx, cy, Number(p.artTurn)), s.fill));
      const fit = sections.get(face.id)!.offset(-groove, 'Round', 2, 16);
      const art = ctx.CrossSection.union(placed).intersect(fit);
      if (art.area() < ctx.CrossSection.union(placed).area() * 0.98) notes.push({ level: 'warning', message: 'The logo runs off its panel and was trimmed. Make it smaller.' });
      if (!art.isEmpty()) {
        artSolid = ctx.extrude(art, p.layerHeight);
        sheet = sheet.subtract(ctx.extrude(art, p.layerHeight + 0.01, -0.01));
      }
    }
  }

  const parts: Part[] = [];
  const sheetPart = ctx.part(sheet, 'Sheet', p.sheetColor);
  if (sheetPart) parts.push(sheetPart);
  if (artSolid) {
    const a = ctx.part(artSolid, 'Logo', p.artColor);
    if (a) parts.push(a);
  }

  const bb = rectSize(bounds(ctx.contours(blank)));
  if (p.foldPreview > 0) {
    const f = Math.min(1, p.foldPreview / 100);
    const mats = foldMatrices(net.panels, f);
    const solids = net.panels.map((q) => ctx.extrude(sections.get(q.id)!, t).transform(mats.get(q.id)! as never));
    const folded = ctx.union(solids);
    const fb = folded.boundingBox();
    const shift = (m: Manifold) => m.translate([bb.cx + bb.width / 2 + 25 - fb.min[0], bb.cy - (fb.min[1] + fb.max[1]) / 2, -fb.min[2]]);
    const part = ctx.part(shift(folded), 'Folded box (preview)', p.sheetColor.map((v) => Math.round(v * 0.85)) as RGB, { group: 'preview', role: 'preview' });
    if (part) parts.push(part);
    if (artSolid && face) {
      // Lifted a hair off the outside face so it shows.
      const logo = ctx.part(shift(artSolid.translate([0, 0, -0.05]).transform(mats.get(face.id)! as never)), 'Logo (preview)', p.artColor, { group: 'preview', role: 'preview' });
      if (logo) parts.push(logo);
    }
  }

  const insides = `${o.L.toFixed(0)} × ${o.W.toFixed(0)} × ${o.H.toFixed(0)} mm inside`;
  notes.push({ level: 'info', message: `Print with a ${p.layerHeight} mm first layer (the hinges are ${Math.round(hinge / p.layerHeight)} layer${hinge > p.layerHeight ? 's' : ''}), outside face down. Fold every line towards its groove.` });
  if (artSolid) notes.push({ level: 'info', message: 'The logo is the first layer in a second filament: it needs a printer that swaps filament.' });
  return {
    parts,
    diagnostics: notes,
    summary: `${STYLE_NAMES[p.style]}, ${insides}. Blank ${bb.width.toFixed(0)} × ${bb.height.toFixed(0)} mm, ${t.toFixed(2)} mm sheet.`,
  };
}
