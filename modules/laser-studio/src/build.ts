/**
 * Laser Studio: pick a design, type your text, download the cut file. The design gives pieces;
 * this lays them out on the sheet (packed, turned when that helps), allows for the kerf on cut
 * outlines, and draws them in 3D as they go together.
 */
import type { BuildResult, Contour, Drawing, DrawingSheet, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold, ManifoldContext } from '@pf/engine-manifold';
import { bounds, packRects, rectSize, rotate, translate } from '@pf/shapes';
import type { Params, PieceOut } from './kit';
import { DESIGNS } from './registry';
import type { Ctx } from './lib';

export type { Params };

export const SHEETS: Record<string, [number, number]> = {
  '300x300': [300, 300],
  '12x12in': [304.8, 304.8],
  '300x200': [300, 200],
  '400x400': [400, 400],
  a3: [420, 297],
  a4: [297, 210],
  '12x20in': [304.8, 508],
};

const CUT: RGB = [230, 0, 0];
const SCORE: RGB = [0, 80, 255];
const ENGRAVE: RGB = [20, 20, 20];

/** Thin strips along lines, for showing score marks and cut lines in 3D. */
function strips(ctx: Ctx, lines: Contour[], width: number): CrossSection | null {
  const rects: Contour[] = [];
  for (const l of lines)
    for (let i = 0; i + 3 < l.length; i += 2) {
      const [x0, y0, x1, y1] = [l[i]!, l[i + 1]!, l[i + 2]!, l[i + 3]!];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 1e-6) continue;
      const nx = (-(y1 - y0) / len) * (width / 2);
      const ny = ((x1 - x0) / len) * (width / 2);
      rects.push([x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 - nx, y1 - ny, x1 + nx, y1 + ny]);
    }
  return rects.length ? ctx.cs(rects, 'NonZero') : null;
}

/**
 * A piece's solids turned to its pose and moved to where it sits. A posed piece is set on the
 * bed by its body, and its engraving moves with it.
 */
function poser(body: Manifold, q: PieceOut, x: number, y: number): (m: Manifold) => Manifold {
  if (!q.pose) return (m) => m.translate([x, y, 0]);
  const turn = [q.pose.rx ?? 0, 0, q.pose.rz ?? 0] as [number, number, number];
  const lift = q.pose.z ?? -body.rotate(turn).boundingBox().min[2]!;
  return (m) => m.rotate(turn).translate([x, y, lift]);
}

export async function build(mctx: ManifoldContext<Params>): Promise<BuildResult> {
  const ctx = mctx as unknown as Ctx;
  const p = mctx.params;
  const make = DESIGNS[p.design] ?? DESIGNS['name-keychain']!;
  const out = await make(ctx, p);
  const notes = [...out.notes];
  const pieces = out.pieces.filter((q) => !q.cut.isEmpty());
  const t = Math.max(0.5, p.thickness);

  /* ---- the cut file */
  const kerf = Math.max(0, p.kerf);
  const shaped = pieces.map((q) => {
    const section = q.marks.cut ? q.cut.subtract(q.marks.cut) : q.cut;
    const outline = ctx.contours(kerf > 0 ? section.offset(kerf / 2, 'Miter', 2, 0) : section);
    return { q, section, outline, engrave: q.marks.engrave && !q.marks.engrave.isEmpty() ? ctx.contours(q.marks.engrave) : [] };
  });
  const custom = p.sheet === 'custom';
  const [SW, SH] = custom ? [Math.max(30, p.sheetWidth), Math.max(30, p.sheetHeight)] : (SHEETS[p.sheet] ?? SHEETS['300x300']!);
  const gap = Math.max(0.5, p.spacingSheet);
  const boxes = shaped.map((s) => bounds([...s.outline, ...(s.q.cutLines ?? [])]));
  const pack = packRects(
    shaped.map((s, i) => {
      const b = rectSize(boxes[i]!);
      return { id: String(i), w: b.width, h: b.height, rotate: true };
    }),
    SW,
    SH,
    gap,
    gap,
  );
  for (const id of pack.unplaced) {
    const b = rectSize(boxes[Number(id)]!);
    notes.push({ level: 'error', message: `${shaped[Number(id)]!.q.name} (${b.width.toFixed(0)} × ${b.height.toFixed(0)} mm) is larger than the sheet. Choose a bigger sheet or make it smaller.` });
  }
  const sheets: DrawingSheet[] = Array.from({ length: pack.sheets }, (_, k) => ({ name: `Sheet ${k + 1}`, x: k * (SW + 20), y: 0, width: SW, height: SH }));
  const cut: Contour[] = [];
  const cutLines: Contour[] = [];
  const score: Contour[] = [];
  const engrave: Contour[] = [];
  for (const pl of pack.placements) {
    const i = Number(pl.id);
    const s = shaped[i]!;
    const b = boxes[i]!;
    const place = (cs: Contour[]) => {
      let o = translate(cs, -b.minX, -b.minY);
      if (pl.rotated) o = translate(rotate(o, 90), b.maxY - b.minY, 0);
      return translate(o, sheets[pl.sheet]!.x + pl.x, pl.y);
    };
    cut.push(...place(s.outline));
    cutLines.push(...place(s.q.cutLines ?? []));
    score.push(...place(s.q.marks.score));
    engrave.push(...place(s.engrave));
  }
  const layers: Drawing['layers'] = [];
  if (engrave.length) layers.push({ name: 'Engrave', operation: 'engrave', color: ENGRAVE, contours: engrave });
  if (score.length) layers.push({ name: 'Score', operation: 'score', color: SCORE, contours: [], polylines: score });
  layers.push({ name: 'Cut', operation: 'cut', color: CUT, contours: cut, polylines: cutLines });
  const drawing: Drawing = pack.sheets > 1 ? { sheets, layers } : { width: SW, height: SH, layers };

  /* ---- 3D, as it goes together */
  const parts: Part[] = [];
  const ink: Manifold[] = [];
  const colours: RGB[] = [p.color, p.color2];
  for (const s of shaped) {
    const [x, y, layer] = s.q.at;
    let section = s.section;
    const lines = strips(ctx, s.q.cutLines ?? [], 0.4);
    if (lines) section = section.subtract(lines);
    const z = layer * t;
    const solidOf = mctx.extrude(section, t, z);
    const pose = poser(solidOf, s.q, x, y);
    const part = mctx.part(pose(solidOf), s.q.name, colours[s.q.sheet]!, { group: 'design' });
    if (part) parts.push(part);
    const marks: CrossSection[] = [];
    if (s.q.marks.engrave && !s.q.marks.engrave.isEmpty()) marks.push(s.q.marks.engrave);
    const sc = strips(ctx, s.q.marks.score, 0.35);
    if (sc) marks.push(sc);
    if (marks.length) {
      const m = ctx.CrossSection.union(marks).intersect(section);
      if (!m.isEmpty()) ink.push(pose(mctx.extrude(m, 0.06, z + t - 0.02)));
    }
  }
  if (ink.length) {
    const part = mctx.part(mctx.union(ink), 'Engraving', colours[0]!.map((v) => Math.round(v * 0.4)) as RGB, { group: 'design' });
    if (part) parts.push(part);
  }

  const size = pieces.length ? rectSize(bounds(pieces.flatMap((q) => ctx.contours(q.cut).map((c) => c.map((v, k) => v + (k % 2 ? q.at[1] : q.at[0])))))) : null;
  const what = pieces.length === 1 ? (size ? `${size.width.toFixed(0)} × ${size.height.toFixed(0)} mm` : '') : `${pieces.length} pieces`;
  return {
    parts,
    drawing,
    diagnostics: notes,
    summary: pieces.length ? `${what} on ${pack.sheets} sheet${pack.sheets === 1 ? '' : 's'} of ${SW} × ${SH} mm.` : 'Nothing to cut yet.',
  };
}

export type { PieceOut };
