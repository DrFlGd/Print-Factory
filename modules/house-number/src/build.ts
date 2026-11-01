/**
 * House number geometry.
 *
 * Layout (two lines at their own sizes, stacked or side by side, or one line stacked
 * character by character) → divider → plate outline → plate details (colour strip, raised
 * panel, frame, bevel) → text relief → mounting. The back is flat and on the bed; the face
 * is up. Keyhole slots are cut into the back, so nothing shows on the front.
 */
import type { BuildResult, Contour, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold, ManifoldContext } from '@pf/engine-manifold';
import { bounds, circle, pill, rect, roundedRect, translate } from '@pf/shapes';
import { text as layoutText } from '@pf/text';
import type { TextLayout } from '@pf/text';

export interface Params {
  text: string;
  font: string;
  textSize: number;
  letterSpacing: number;
  orientation: 'horizontal' | 'vertical';
  stackSpacing: number;
  scale: number;
  text2: string;
  line2Size: number;
  linePlacement: 'below' | 'above' | 'left' | 'right';
  align: 'left' | 'center' | 'right';
  vAlign: 'bottom' | 'middle' | 'top';
  lineGap: number;
  divider: 'none' | 'line' | 'band';
  lineThickness: number;
  lineOverhang: number;
  lineOffset: number;
  bandPadding: number;
  shape: 'rounded' | 'rect' | 'pill' | 'plaque' | 'none';
  padding: number;
  cornerRadius: number;
  plateWidth: number;
  plateHeight: number;
  plateThickness: number;
  relief: 'raised' | 'inlay' | 'recessed';
  textThickness: number;
  chamfer: number;
  bridgeWidth: number;
  band: 'none' | 'top' | 'bottom' | 'left' | 'right';
  bandWidth: number;
  panel: boolean;
  panelInset: number;
  panelHeight: number;
  frame: boolean;
  frameWidth: number;
  frameHeight: number;
  mount: 'keyhole' | 'screws' | 'tape';
  screwDiameter: number;
  headDiameter: number;
  fourHoles: boolean;
  countersink: boolean;
  mountInset: number;
  mountOffsetY: number;
  plateColor: RGB;
  textColor: RGB;
  bandColor: RGB;
  panelColor: RGB;
  frameColor: RGB;
}

export const MAX_PLATE = 240;

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const boxOf = (cs: Contour[]): Box => (cs.length ? bounds(cs) : { minX: 0, minY: 0, maxX: 0, maxY: 0 });
const width = (b: Box) => b.maxX - b.minX;
const height = (b: Box) => b.maxY - b.minY;

/** A rectangle with its corners cut at 45°. */
export function plaque(w: number, h: number, cut: number): Contour {
  const c = Math.max(0, Math.min(cut, w / 2 - 0.01, h / 2 - 0.01));
  const x = w / 2;
  const y = h / 2;
  return [-x + c, -y, x - c, -y, x, -y + c, x, y - c, x - c, y, -x + c, y, -x, y - c, -x, -y + c];
}

/** One character per row, centred on x = 0, first character on top. */
function stackChars(l: TextLayout, pitch: number): Contour[] {
  const out: Contour[] = [];
  let row = 0;
  for (const g of l.glyphs) {
    if (!g.contours.length) {
      if (g.char.trim() === '') row++;
      continue;
    }
    const b = boxOf(g.contours);
    out.push(...translate(g.contours, -(b.minX + b.maxX) / 2, -row * pitch - b.minY));
    row++;
  }
  return out;
}

interface Layout {
  line1: Contour[];
  line2: Contour[];
  /** Divider bar contours, if any, and the band (with line 2 knocked out of it). */
  divider: Contour[];
  band: Contour[];
  /** Which lines exist, for bridging plateless signs. */
  rows: { contours: Contour[]; size: number }[];
  warnings: Diagnostic[];
}

async function layout(p: Params, inputs: Record<string, unknown>): Promise<Layout> {
  const warnings: Diagnostic[] = [];
  const s1 = p.textSize;
  const s2 = p.line2Size;
  const vertical = p.orientation === 'vertical';
  const t1 = await layoutText(p.font, p.text.replace(/\n/g, ' '), { capHeight: s1, letterSpacing: p.letterSpacing, align: 'left' }, inputs);
  const missing = new Set(t1.missing);
  let line1 = vertical ? stackChars(t1, s1 * p.stackSpacing) : t1.contours;
  let line2: Contour[] = [];
  const hasTwo = p.text2.trim().length > 0;
  if (hasTwo) {
    const t2 = await layoutText(p.font, p.text2.replace(/\n/g, ' '), { capHeight: s2, letterSpacing: p.letterSpacing * (s2 / s1), align: 'left' }, inputs);
    t2.missing.forEach((c) => missing.add(c));
    line2 = t2.contours;
  }
  if (missing.size) warnings.push({ level: 'warning', message: `No bundled font has ${[...missing].map((c) => `“${c}”`).join(' ')}; left out.` });

  const b1 = boxOf(line1);
  // Line 1 centred on x = 0, baseline (or top character's baseline) at y = 0.
  line1 = translate(line1, -(b1.minX + b1.maxX) / 2, 0);
  const B1 = boxOf(line1);
  let divider: Contour[] = [];
  let band: Contour[] = [];
  const rows = [{ contours: line1, size: s1 }];

  if (line2.length) {
    const b2 = boxOf(line2);
    const w2 = width(b2);
    const h2 = height(b2);
    const placement = vertical ? 'below' : p.linePlacement;
    const pad = p.divider === 'band' ? p.bandPadding : 0;
    const divGap = p.divider === 'line' ? p.lineThickness + p.lineGap : p.divider === 'band' ? pad : 0;
    let dx = 0;
    let dy = 0;
    if (placement === 'below' || placement === 'above') {
      dx = p.align === 'left' ? B1.minX - b2.minX : p.align === 'right' ? B1.maxX - b2.maxX : -(b2.minX + b2.maxX) / 2;
      dy = placement === 'below' ? B1.minY - p.lineGap - divGap - b2.maxY : B1.maxY + p.lineGap + divGap - b2.minY;
    } else {
      const gap = Math.max(p.lineGap, s1 * 0.15) + divGap;
      dx = placement === 'right' ? B1.maxX + gap - b2.minX : B1.minX - gap - b2.maxX;
      dy = p.vAlign === 'bottom' ? 0 : p.vAlign === 'top' ? B1.maxY - b2.maxY : (B1.minY + B1.maxY) / 2 - (b2.minY + b2.maxY) / 2;
    }
    line2 = translate(line2, dx, dy);
    const L2 = boxOf(line2);
    rows.push({ contours: line2, size: s2 });

    if (p.divider === 'line') {
      const t = p.lineThickness;
      if (placement === 'below' || placement === 'above') {
        const len = Math.max(width(B1), width(L2)) + 2 * p.lineOverhang;
        const xMid = (Math.min(B1.minX, L2.minX) + Math.max(B1.maxX, L2.maxX)) / 2;
        const yMid = (placement === 'below' ? (B1.minY + L2.maxY) / 2 : (B1.maxY + L2.minY) / 2) + (placement === 'below' ? p.lineOffset : -p.lineOffset);
        divider = [translate([rect(Math.max(1, len), t)], xMid, yMid)[0]!];
      } else {
        const len = Math.max(height(B1), height(L2)) + 2 * p.lineOverhang;
        const yMid = (Math.min(B1.minY, L2.minY) + Math.max(B1.maxY, L2.maxY)) / 2;
        const xMid = (placement === 'right' ? (B1.maxX + L2.minX) / 2 : (B1.minX + L2.maxX) / 2) + (placement === 'right' ? -p.lineOffset : p.lineOffset);
        divider = [translate([rect(t, Math.max(1, len))], xMid, yMid)[0]!];
      }
    } else if (p.divider === 'band') {
      const fullWidth = placement === 'below' || placement === 'above';
      const bw = fullWidth ? Math.max(width(B1), w2) + 2 * pad : w2 + 2 * pad;
      const bh = h2 + 2 * pad;
      const cx = fullWidth ? (Math.min(B1.minX, L2.minX) + Math.max(B1.maxX, L2.maxX)) / 2 : (L2.minX + L2.maxX) / 2;
      band = translate([rect(bw, bh)], cx, (L2.minY + L2.maxY) / 2);
    }
  }
  return { line1, line2, divider, band, rows, warnings };
}

function plateOutline(ctx: ManifoldContext<Params>, content: Box, p: Params): CrossSection {
  let w = width(content) + p.padding * 2;
  let h = height(content) + p.padding * 2;
  if (p.shape === 'pill') w += h * 0.35;
  w = Math.max(w, p.plateWidth);
  h = Math.max(h, p.plateHeight);
  const cx = (content.minX + content.maxX) / 2;
  const cy = (content.minY + content.maxY) / 2;
  let c: Contour;
  switch (p.shape) {
    case 'rect':
      c = rect(w, h);
      break;
    case 'pill':
      c = pill(w, h);
      break;
    case 'plaque':
      c = plaque(w, h, Math.max(2, p.cornerRadius));
      break;
    default:
      c = roundedRect(w, h, p.cornerRadius);
  }
  return ctx.cs(translate([c], cx, cy));
}

/** A solid with its top edge bevelled by `chamfer`. */
function bevelled(ctx: ManifoldContext<Params>, outline: CrossSection, h: number, chamfer: number): Manifold {
  return ctx.edged(outline, h, { top: Math.min(chamfer, h / 2) });
}

function mounts(ctx: ManifoldContext<Params>, plate: CrossSection, p: Params, warnings: Diagnostic[]): { cut: Manifold | null } {
  if (p.mount === 'tape') {
    warnings.push({ level: 'info', message: 'Mount with outdoor double-sided tape or construction adhesive on the flat back.' });
    return { cut: null };
  }
  const b = plate.bounds();
  const cy = (b.min[1] + b.max[1]) / 2 + p.mountOffsetY;
  const xs = [b.min[0] + p.mountInset, b.max[0] - p.mountInset];
  if (xs[1]! - xs[0]! < p.headDiameter) {
    warnings.push({ level: 'warning', message: 'The plate is too narrow for two mounting points; using one in the middle.' });
    xs.splice(0, 2, (b.min[0] + b.max[0]) / 2);
  }
  const T = p.plateThickness;
  const r = p.screwDiameter / 2 + 0.15;
  const cuts: Manifold[] = [];
  if (p.mount === 'screws') {
    const ys = p.fourHoles ? [b.min[1] + p.mountInset, b.max[1] - p.mountInset] : [cy];
    for (const x of xs)
      for (const y of ys) {
        cuts.push(ctx.extrude([circle(r)], T + 20, -10).translate([x, y, 0]));
        if (p.countersink) {
          const headR = r * 2;
          cuts.push(ctx.Manifold.cylinder(headR - r + 0.01, r, headR, 48).translate([x, y, T - (headR - r)]));
          cuts.push(ctx.extrude([circle(headR)], 20, T).translate([x, y, 0]));
        }
      }
    return { cut: ctx.union(cuts) };
  }
  // Keyhole: from the back, a narrow slot for the shank and, above it, a wider channel the
  // screw head slides along. The head enters through the round opening at the slot's foot.
  const shankDepth = 1.6;
  const headDepth = Math.max(2, p.headDiameter * 0.3);
  const need = shankDepth + headDepth + 1.2;
  if (T < need) {
    warnings.push({ level: 'warning', message: `Keyholes need a plate at least ${need.toFixed(1)} mm thick; this one is ${T} mm. Use screw holes, or a thicker plate.` });
    return { cut: null };
  }
  const R = p.headDiameter / 2 + 0.2;
  const travel = Math.max(8, R * 1.6);
  for (const x of xs) {
    const entry = ctx.extrude([circle(R)], shankDepth + headDepth + 10, -10).translate([x, cy - travel / 2, 0]);
    const slot = ctx.extrude([roundedRect(r * 2, travel, r)], shankDepth + 10, -10).translate([x, cy, 0]);
    const channel = ctx.extrude([roundedRect(R * 2, travel + R * 2, R)], headDepth, shankDepth).translate([x, cy, 0]);
    cuts.push(entry, slot, channel);
  }
  warnings.push({ level: 'info', message: `Keyholes: two screws ${(xs.length > 1 ? xs[1]! - xs[0]! : 0).toFixed(0)} mm apart, heads ${(p.headDiameter / 2 + headDepth).toFixed(0)} mm proud of the wall at most. Print face up.` });
  return { cut: ctx.union(cuts) };
}

export async function build(ctx: ManifoldContext<Params>): Promise<BuildResult> {
  const raw = ctx.params;
  // Scale every in-plane size; thicknesses and screw sizes stay as set.
  const k = raw.scale || 1;
  const p: Params = {
    ...raw,
    textSize: raw.textSize * k,
    line2Size: raw.line2Size * k,
    letterSpacing: raw.letterSpacing * k,
    lineGap: raw.lineGap * k,
    lineThickness: raw.lineThickness * k,
    lineOverhang: raw.lineOverhang * k,
    lineOffset: raw.lineOffset * k,
    bandPadding: raw.bandPadding * k,
    padding: raw.padding * k,
    cornerRadius: raw.cornerRadius * k,
    plateWidth: raw.plateWidth * k,
    plateHeight: raw.plateHeight * k,
    bandWidth: raw.bandWidth * k,
    panelInset: raw.panelInset * k,
    frameWidth: raw.frameWidth * k,
    mountInset: raw.mountInset * k,
    mountOffsetY: raw.mountOffsetY * k,
  };
  if (!p.text.trim() && !p.text2.trim()) return { parts: [], diagnostics: [{ level: 'info', message: 'Type a number or a name.' }] };
  const L = await layout(p, ctx.inputs);
  const warnings = L.warnings;
  const all = [...L.line1, ...L.line2, ...L.divider, ...L.band];
  const content = boxOf(all);
  const T = p.plateThickness;
  const group = 'sign';
  const parts: Part[] = [];
  const push = (m: Manifold | null, name: string, color: RGB) => {
    if (!m) return;
    const part = ctx.part(m, name, color, { group });
    if (part) parts.push(part);
  };

  // The text face: both lines, the divider, and the band with line 2 cut out of it.
  let face = ctx.cs([...L.line1, ...L.divider], 'NonZero');
  if (L.band.length) face = face.add(ctx.cs(L.band).subtract(ctx.cs(L.line2, 'NonZero')));
  else if (L.line2.length) face = face.add(ctx.cs(L.line2, 'NonZero'));

  if (p.shape === 'none') {
    // Plateless: the characters are the sign. A bar through each row holds them together.
    let body = face;
    for (const row of L.rows) {
      const rb = boxOf(row.contours);
      if (row.contours.length < 2) continue;
      const bar = ctx.cs([rect(Math.max(1, width(rb) - row.size * 0.3), p.bridgeWidth)]).translate([(rb.minX + rb.maxX) / 2, rb.minY + row.size * 0.3]);
      body = body.add(bar);
    }
    if (p.orientation === 'vertical') {
      const b = boxOf(L.line1);
      body = body.add(ctx.cs([rect(p.bridgeWidth, Math.max(1, height(b) - p.textSize * 0.3))]).translate([0, (b.minY + b.maxY) / 2]));
    }
    if (body.decompose().length > 1) warnings.push({ level: 'warning', message: 'Some characters are not joined to the rest; they will print as loose pieces. Widen the bridge, tighten the letter spacing, or add a divider line.' });
    push(ctx.extrude(body, T), 'Sign', p.textColor);
    if (p.mount !== 'tape') warnings.push({ level: 'info', message: 'A sign without a plate has no room for mounting holes; use tape or adhesive.' });
    return finish(parts, warnings);
  }

  const plate = plateOutline(ctx, content, p);
  const pb = plate.bounds();
  const pw = pb.max[0] - pb.min[0];
  const ph = pb.max[1] - pb.min[1];
  if (pw > MAX_PLATE || ph > MAX_PLATE) warnings.push({ level: 'warning', message: `The plate is ${pw.toFixed(0)} × ${ph.toFixed(0)} mm, bigger than most printers. Lower the size, or print it in parts.` });

  let plateSolid = bevelled(ctx, plate, T, p.chamfer);
  const mount = mounts(ctx, plate, p, warnings);
  let top = T;

  // Colour strip: a full-depth region of the plate in its own colour.
  let bandSolid: Manifold | null = null;
  if (p.band !== 'none') {
    const bw = Math.min(p.bandWidth, p.band === 'top' || p.band === 'bottom' ? ph : pw);
    const cut =
      p.band === 'top'
        ? rect(pw + 2, bw)
        : p.band === 'bottom'
          ? rect(pw + 2, bw)
          : rect(bw, ph + 2);
    const at: [number, number] =
      p.band === 'top' ? [(pb.min[0] + pb.max[0]) / 2, pb.max[1] - bw / 2] : p.band === 'bottom' ? [(pb.min[0] + pb.max[0]) / 2, pb.min[1] + bw / 2] : p.band === 'left' ? [pb.min[0] + bw / 2, (pb.min[1] + pb.max[1]) / 2] : [pb.max[0] - bw / 2, (pb.min[1] + pb.max[1]) / 2];
    const strip = ctx.extrude(ctx.cs([cut]).translate(at), T + 10, -5);
    bandSolid = plateSolid.intersect(strip);
    plateSolid = plateSolid.subtract(strip);
  }

  let panelSolid: Manifold | null = null;
  if (p.panel) {
    const inner = plate.offset(-p.panelInset, 'Round', 2, 48);
    if (!inner.isEmpty()) {
      panelSolid = bevelled(ctx, inner, p.panelHeight, Math.min(p.chamfer, p.panelHeight / 2)).translate([0, 0, T]);
      top = T + p.panelHeight;
    }
  }

  let frameSolid: Manifold | null = null;
  if (p.frame) {
    const ring = plate.subtract(plate.offset(-p.frameWidth, 'Round', 2, 48));
    frameSolid = ctx.extrude(ring, p.frameHeight, T);
  }

  // Text relief, on whatever is on top under it.
  let textSolid: Manifold | null = null;
  if (p.relief === 'raised') textSolid = ctx.extrude(face, p.textThickness, top);
  else {
    const depth = Math.min(p.textThickness, top - 0.8);
    if (depth < p.textThickness) warnings.push({ level: 'warning', message: `Text can go at most ${depth.toFixed(1)} mm deep here; using that.` });
    const cutter = ctx.extrude(face, depth + 5, top - depth);
    plateSolid = plateSolid.subtract(cutter);
    if (panelSolid) panelSolid = panelSolid.subtract(cutter);
    if (bandSolid) bandSolid = bandSolid.subtract(cutter);
    if (p.relief === 'inlay') textSolid = ctx.extrude(face, depth, top - depth);
    else warnings.push({ level: 'info', message: 'Engraved text is one part; paint the letters, or choose Inlaid for a second filament.' });
  }

  const cut = (m: Manifold | null) => (m && mount.cut ? m.subtract(mount.cut) : m);
  push(cut(plateSolid), 'Plate', p.plateColor);
  push(cut(bandSolid), 'Strip', p.bandColor);
  push(panelSolid, 'Panel', p.panelColor);
  push(frameSolid, 'Frame', p.frameColor);
  push(textSolid, 'Text', p.textColor);
  return finish(parts, warnings);
}

function finish(parts: Part[], diagnostics: Diagnostic[]): BuildResult {
  return { parts, diagnostics };
}
