/**
 * Laser Box: a finger-jointed box cut from sheet, laid out on stock sheets as an SVG or DXF
 * with cut, score and engrave layers, and shown assembled in 3D.
 *
 * Kerf is applied once, here, to the cut outlines (outsides grow and holes shrink by half the
 * kerf); nothing upstream of that is kerf-compensated. Flex tab slits are single lines.
 */
import type { BuildResult, Contour, Diagnostic, Drawing, DrawingSheet, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold, ManifoldContext } from '@pf/engine-manifold';
import { bounds, clipPolylines, closeLoop, namedShape, packRects, rectSize, rotate, translate } from '@pf/shapes';
import { patternGeometry } from './patterns';
import type { Bottom, Spec, Style } from './styles';
import { buildWorld, outsideOf } from './styles';
import type { FaceId, Motion, Resolved, V3 } from './world';
import { poseOf, resolve, thicknessOf } from './world';

export interface Params {
  style: Style;
  measure: 'outside' | 'inside';
  length: number;
  width: number;
  height: number;
  bottom: Bottom;
  dividersX: number;
  dividersY: number;
  drawers: number;
  fingerHole: boolean;
  material: string;
  thickness: number;
  kerfAuto: boolean;
  kerf: number;
  fit: 'looser' | 'loose' | 'standard' | 'tight' | 'tighter';
  joint: 'flex' | 'fingers';
  finger: number;
  patternOn: 'none' | 'lid' | 'front' | 'walls' | 'lid-walls';
  pattern: string;
  patternOp: 'cut' | 'score' | 'engrave';
  patternSize: number;
  patternAngle: number;
  web: number;
  margin: number;
  window: string;
  windowSize: number;
  windowX: number;
  windowY: number;
  frame: boolean;
  sheet: string;
  sheetWidth: number;
  sheetHeight: number;
  spacing: number;
  preview: 'closed' | 'open';
}

type Ctx = ManifoldContext<Params>;

export interface Material {
  name: string;
  t: number;
  kerf: number;
  color: RGB;
  /** Plywood's face grain: pieces are laid out the same way round. */
  grain: boolean;
  /** Takes flex tabs (acrylic would crack, greyboard delaminate). */
  flex: boolean;
  /** How much the fit shifts for this material, mm. */
  fitShift: number;
}

export const MATERIALS: Record<string, Material> = {
  ply3: { name: '3 mm plywood', t: 3, kerf: 0.15, color: [222, 190, 145], grain: true, flex: true, fitShift: 0 },
  ply4: { name: '4 mm plywood', t: 4, kerf: 0.16, color: [222, 190, 145], grain: true, flex: true, fitShift: 0 },
  ply6: { name: '6 mm plywood', t: 6, kerf: 0.2, color: [222, 190, 145], grain: true, flex: true, fitShift: 0.02 },
  mdf3: { name: '3 mm MDF', t: 3, kerf: 0.15, color: [176, 136, 98], grain: false, flex: true, fitShift: 0.03 },
  mdf6: { name: '6 mm MDF', t: 6, kerf: 0.2, color: [176, 136, 98], grain: false, flex: true, fitShift: 0.03 },
  acrylic3: { name: '3 mm acrylic', t: 3, kerf: 0.12, color: [196, 222, 232], grain: false, flex: false, fitShift: -0.1 },
  card2: { name: '2 mm greyboard', t: 2, kerf: 0.1, color: [150, 148, 140], grain: false, flex: false, fitShift: 0.05 },
  custom: { name: 'Sheet', t: 3, kerf: 0.15, color: [222, 190, 145], grain: false, flex: true, fitShift: 0 },
};

/** Interference across a finger for each fit stop, mm: + grips, − slides. */
export const FIT_STOPS: Record<Params['fit'], number> = { looser: -0.15, loose: -0.05, standard: 0.05, tight: 0.1, tighter: 0.18 };

export const SHEETS: Record<string, [number, number]> = {
  '300x300': [300, 300],
  '12x12in': [304.8, 304.8],
  '300x200': [300, 200],
  '400x400': [400, 400],
  a3: [420, 297],
  '12x20in': [304.8, 508],
  '600x400': [600, 400],
};

const STYLE_NAMES: Record<Style, string> = { open: 'Open box', lid: 'Lift-off lid box', hinge: 'Hinged lid box', drawer: 'Chest of drawers' };

const FACES: Record<Params['patternOn'], FaceId[]> = {
  none: [],
  lid: ['lid'],
  front: ['front'],
  walls: ['front', 'back', 'left', 'right'],
  'lid-walls': ['lid', 'front', 'back', 'left', 'right'],
};

const CUT: RGB = [230, 0, 0];
const SCORE: RGB = [0, 80, 255];
const ENGRAVE: RGB = [20, 20, 20];

export function stockOf(p: Params): { m: Material; t: number; kerf: number; fit: number } {
  const m = MATERIALS[p.material] ?? MATERIALS.ply3!;
  const t = p.thickness > 0 ? p.thickness : m.t;
  const kerf = p.kerfAuto ? m.kerf : Math.max(0, p.kerf);
  return { m, t, kerf, fit: (FIT_STOPS[p.fit] ?? FIT_STOPS.standard) + m.fitShift };
}

export function specOf(p: Params): Spec {
  const { m, t, fit } = stockOf(p);
  let [L, W, H] = [p.length, p.width, p.height];
  if (p.measure === 'inside') [L, W, H] = outsideOf(p.style, p.bottom, t, L, W, H, p.drawers);
  const min = 4 * t + 20;
  return {
    style: p.style,
    L: Math.max(min, L),
    W: Math.max(min, W),
    H: Math.max(3 * t + 15, H),
    t,
    fit,
    flex: p.joint === 'flex' && m.flex,
    finger: p.finger,
    bottom: p.bottom,
    dividersX: p.style === 'drawer' ? 0 : p.dividersX,
    dividersY: p.style === 'drawer' ? 0 : p.dividersY,
    drawers: p.drawers,
    fingerHole: p.fingerHole,
  };
}

/* ---------------------------------------------------------------- patterns */

interface Marks {
  cut: CrossSection | null;
  score: Contour[];
  engrave: CrossSection | null;
}

function windowOf(ctx: Ctx, safe: CrossSection): CrossSection | null {
  const p = ctx.params;
  if (p.window === 'face') return safe;
  const b = rectSize(bounds(ctx.contours(safe)));
  const size = (Math.min(b.width, b.height) * Math.min(100, Math.max(10, p.windowSize))) / 100;
  const shape = namedShape(p.window, size, size);
  const at = translate([shape], b.cx + (b.width * p.windowX) / 100, b.cy + (b.height * p.windowY) / 100);
  const w = ctx.cs(at).intersect(safe);
  return w.isEmpty() ? null : w;
}

function marksOn(ctx: Ctx, region: CrossSection): Marks {
  const p = ctx.params;
  const b = rectSize(bounds(ctx.contours(region)));
  const R = Math.hypot(b.width, b.height) / 2 + p.patternSize;
  const geo = patternGeometry(p.pattern, R, p.patternSize);
  const place = (cs: Contour[]) => translate(rotate(cs, p.patternAngle), b.cx, b.cy);
  const frame = p.frame ? ctx.contours(region).map(closeLoop) : [];
  if (p.patternOp === 'score') return { cut: null, engrave: null, score: [...clipPolylines(place(geo.lines), ctx.contours(region)), ...frame] };

  const web = p.patternOp === 'cut' ? Math.max(0.4, p.web) : Math.max(0, p.web);
  const inner = p.patternOp === 'cut' ? region.offset(-web, 'Miter', 2, 0) : region;
  if (inner.isEmpty()) return { cut: null, engrave: null, score: frame };
  const ib = bounds(ctx.contours(inner));
  const pieces: CrossSection[] = [];
  for (const cell of geo.cells) {
    const [add] = place([cell.add]);
    const cb = bounds(add!);
    if (cb.maxX < ib.minX || cb.minX > ib.maxX || cb.maxY < ib.minY || cb.minY > ib.maxY) continue;
    let c = ctx.cs([add!]);
    if (cell.minus?.length) c = c.subtract(ctx.cs(place(cell.minus), 'NonZero'));
    if (web > 0) c = c.offset(-web / 2, 'Miter', 2, 0);
    if (!c.isEmpty()) pieces.push(c);
  }
  let all = ctx.CrossSection.union(pieces).intersect(inner);
  // Slivers where a cell meets the window edge burn rather than cut.
  const minArea = Math.max(0.8, web * web);
  const kept = all.decompose().filter((q) => q.area() >= minArea);
  all = kept.length ? ctx.CrossSection.union(kept) : ctx.CrossSection.union([]);
  return p.patternOp === 'cut' ? { cut: all, engrave: null, score: frame } : { cut: null, engrave: all, score: frame };
}

/* ---------------------------------------------------------------- 3D */

type Mat = number[];
function mul(a: Mat, b: Mat): Mat {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r]! * b[c * 4 + k]!;
  return o;
}
const translation = (x: number, y: number, z: number): Mat => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

/** Rotation by `deg` about the line through `at` along `axis`. */
export function axisRotation(at: V3, axis: V3, deg: number): Mat {
  const l = Math.hypot(...axis);
  const [x, y, z] = axis.map((v) => v / l) as V3;
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const C = 1 - c;
  const R: Mat = [c + x * x * C, y * x * C + z * s, z * x * C - y * s, 0, x * y * C - z * s, c + y * y * C, z * y * C + x * s, 0, x * z * C + y * s, y * z * C - x * s, c + z * z * C, 0, 0, 0, 0, 1];
  return mul(translation(...at), mul(R, translation(-at[0], -at[1], -at[2])));
}

function motionMatrix(m: Motion): Mat {
  if (m.kind === 'hinge') return axisRotation(m.at, m.axis, m.degrees);
  if (m.kind === 'slide') return translation(m.dir[0] * m.distance, m.dir[1] * m.distance, m.dir[2] * m.distance);
  return translation(0, 0, m.distance);
}

/** Lines as thin strips, for showing scoring in 3D. */
function strips(ctx: Ctx, lines: Contour[], width: number): CrossSection | null {
  const rects: Contour[] = [];
  for (const l of lines)
    for (let i = 0; i + 3 < l.length; i += 2) {
      const x0 = l[i]!;
      const y0 = l[i + 1]!;
      const x1 = l[i + 2]!;
      const y1 = l[i + 3]!;
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 1e-6) continue;
      const nx = (-(y1 - y0) / len) * (width / 2);
      const ny = ((x1 - x0) / len) * (width / 2);
      rects.push([x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 - nx, y1 - ny, x1 + nx, y1 + ny]);
      if (rects.length > 20000) break;
    }
  return rects.length ? ctx.cs(rects, 'NonZero') : null;
}

/* ---------------------------------------------------------------- build */

interface Piece extends Resolved {
  marks: Marks;
  /** The cut outline, kerf applied, in the piece's frame. */
  kerfed: Contour[];
}

export async function build(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  const notes: Diagnostic[] = [];
  const { m, t, kerf } = stockOf(p);
  const spec = specOf(p);
  const world = buildWorld(spec);
  for (const w of world.warnings) notes.push({ level: 'warning', message: w });
  if (p.joint === 'flex' && !m.flex) notes.push({ level: 'info', message: `${m.name} does not take flex tabs, so every joint is a plain finger.` });

  const faces = new Set(FACES[p.patternOn] ?? []);
  const resolved = resolve(ctx as never, world, Math.max(1, p.margin), t);
  const pieces: Piece[] = resolved.map((r) => {
    let marks: Marks = { cut: null, score: [], engrave: null };
    const safe = p.patternOp === 'cut' ? r.safeCut : r.safe;
    if (r.slab.face && faces.has(r.slab.face) && safe) {
      const win = windowOf(ctx, safe);
      if (win) marks = marksOn(ctx, win);
    }
    let section = r.section;
    if (marks.cut && !marks.cut.isEmpty()) section = section.subtract(marks.cut);
    const kerfed = ctx.contours(kerf > 0 ? section.offset(kerf / 2, 'Miter', 2, 0) : section);
    return { ...r, section, marks, kerfed };
  });

  /* ---- sheets */
  const custom = p.sheet === 'custom';
  const [SW, SH] = custom ? [Math.max(50, p.sheetWidth), Math.max(50, p.sheetHeight)] : (SHEETS[p.sheet] ?? SHEETS['300x300']!);
  const gap = Math.max(0.5, p.spacing);
  const boxes = pieces.map((q) => bounds([...q.kerfed, ...q.slits]));
  const items = pieces.map((q, i) => {
    const b = rectSize(boxes[i]!);
    // Plywood pieces keep their grain one way, unless a piece only fits turned.
    const fitsStraight = b.width + 2 * gap <= SW && b.height + 2 * gap <= SH;
    return { id: String(i), w: b.width, h: b.height, rotate: !m.grain || !fitsStraight, label: q.slab.label };
  });
  const pack = packRects(items, SW, SH, gap, gap);
  for (const id of pack.unplaced) {
    const it = items[Number(id)]!;
    notes.push({ level: 'error', message: `The ${it.label.toLowerCase()} (${it.w.toFixed(0)} × ${it.h.toFixed(0)} mm) is larger than the sheet. Choose a bigger sheet or a smaller box.` });
  }
  const SHEET_GAP = 20;
  const sheets: DrawingSheet[] = Array.from({ length: pack.sheets }, (_, k) => ({ name: `Sheet ${k + 1}`, x: k * (SW + SHEET_GAP), y: 0, width: SW, height: SH }));
  const cutC: Contour[] = [];
  const slitL: Contour[] = [];
  const scoreL: Contour[] = [];
  const engraveC: Contour[] = [];
  for (const pl of pack.placements) {
    const i = Number(pl.id);
    const q = pieces[i]!;
    const b = boxes[i]!;
    const place = (cs: Contour[]) => {
      let out = translate(cs, -b.minX, -b.minY);
      if (pl.rotated) out = translate(rotate(out, 90), b.maxY - b.minY, 0);
      return translate(out, sheets[pl.sheet]!.x + pl.x, pl.y);
    };
    cutC.push(...place(q.kerfed));
    slitL.push(...place(q.slits));
    scoreL.push(...place(q.marks.score));
    if (q.marks.engrave && !q.marks.engrave.isEmpty()) engraveC.push(...place(ctx.contours(q.marks.engrave)));
  }
  const layers: Drawing['layers'] = [];
  if (engraveC.length) layers.push({ name: 'Engrave', operation: 'engrave', color: ENGRAVE, contours: engraveC });
  if (scoreL.length) layers.push({ name: 'Score', operation: 'score', color: SCORE, contours: [], polylines: scoreL });
  layers.push({ name: 'Cut', operation: 'cut', color: CUT, contours: cutC, polylines: slitL });
  const drawing: Drawing = pack.sheets > 1 ? { sheets, layers } : { width: SW, height: SH, layers };

  /* ---- 3D */
  const parts: Part[] = [];
  const open = p.preview === 'open';
  const ink: Manifold[] = [];
  for (const q of pieces) {
    const th = thicknessOf(q.slab);
    let M = poseOf(q.slab);
    const motion = q.slab.group ? world.motions.get(q.slab.group) : undefined;
    if (open && motion) M = mul(motionMatrix(motion), M);
    const solid = ctx.extrude(q.section, th).transform(M as never);
    const part = ctx.part(solid, q.slab.label, m.color, { group: q.slab.group ?? 'box' });
    if (part) parts.push(part);
    const marks: CrossSection[] = [];
    if (q.marks.engrave && !q.marks.engrave.isEmpty()) marks.push(q.marks.engrave);
    const sc = strips(ctx, q.marks.score, 0.35);
    if (sc) marks.push(sc);
    if (marks.length) ink.push(ctx.extrude(ctx.CrossSection.union(marks).intersect(q.section), 0.06, th - 0.02).transform(M as never));
  }
  if (ink.length) {
    const part = ctx.part(ctx.union(ink), p.patternOp === 'engrave' ? 'Engraving' : 'Scoring', m.color.map((v) => Math.round(v * 0.45)) as RGB, { group: 'marks' });
    if (part) parts.push(part);
  }

  /* ---- notes */
  const [L, W, H] = world.outside;
  const [iL, iW, iH] = world.inside;
  if (p.style === 'lid') notes.push({ level: 'info', message: 'Glue the lip centred under the lid; it drops inside the walls.' });
  if (p.style === 'hinge') notes.push({ level: 'info', message: 'Build it with one side off: put one of the lid’s pins in the fitted side’s hole, then slide the last side on over the other pin.' });
  const count = pieces.length;
  return {
    parts,
    drawing,
    diagnostics: notes,
    summary: `${STYLE_NAMES[p.style]}, ${L.toFixed(0)} × ${W.toFixed(0)} × ${H.toFixed(0)} mm outside, ${iL.toFixed(0)} × ${iW.toFixed(0)} × ${iH.toFixed(0)} inside${p.style === 'drawer' ? ' each drawer' : ''}. ${count} pieces on ${pack.sheets} sheet${pack.sheets === 1 ? '' : 's'}, ${m.name === 'Sheet' ? `${t} mm sheet` : m.name}${p.thickness > 0 && m.name !== 'Sheet' ? ` (${t} mm measured)` : ''}, ${kerf} mm kerf.`,
  };
}

