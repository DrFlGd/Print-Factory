/**
 * Cookie Cutter Studio, millimetres, Z-up.
 * The sharp cutting lip ends at z=height; the bed-side rim and stamp supports start at z=0.
 * Reference/dough previews use role "reference", so STL/3MF/ZIP never include them.
 */
import type { BuildResult, Contour, Diagnostic, Drawing, Part } from '@pf/core';
import type { CrossSection, Manifold } from '@pf/engine-manifold';
import { circle, rect, roundedRect, signedArea } from '@pf/shapes';
import { text as layoutText } from '@pf/text';
import { filled, makeDesign, makeTextMark } from './design';
import { connectRegions } from './bridges';
import { cuttingThickness, rimThicknessAt, taperedRing } from './taper';
import type { Ctx, Params } from './types';

export type { Params } from './types';
const min = Math.min;
const max = Math.max;

function line(ctx: Ctx, ax: number, ay: number, bx: number, by: number, width: number): CrossSection {
  const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
  if (length < .001) return ctx.cs([circle(width / 2, 20)]).translate([ax, ay]);
  return ctx.cs([rect(length, width)]).rotate(Math.atan2(dy, dx) * 180 / Math.PI).translate([(ax + bx) / 2, (ay + by) / 2])
    .add(ctx.cs([circle(width / 2, 20)]).translate([ax, ay]))
    .add(ctx.cs([circle(width / 2, 20)]).translate([bx, by]));
}
function band(section: CrossSection, outer: number, inner: number): CrossSection {
  return section.offset(outer, 'Round', 2, 28).subtract(section.offset(inner, 'Round', 2, 28));
}
function size(section: CrossSection): { w: number; h: number; cx: number; cy: number } {
  const b = section.bounds();
  return { w: b.max[0] - b.min[0], h: b.max[1] - b.min[1], cx: (b.max[0] + b.min[0]) / 2, cy: (b.max[1] + b.min[1]) / 2 };
}
const red: [number, number, number] = [222, 177, 122];

/**
 * Resolve the selected embossing style once, for both combined and separate stamps.
 * These marks are always confined to the cookie interior, never used as cutting lips.
 */
function imprintArea(cut: CrossSection, mark: CrossSection, p: Params): CrossSection {
  let ink = mark.intersect(cut.offset(-2.4, 'Round', 2, 24));
  if (ink.isEmpty()) return ink;
  if (p.edgesOnly) ink = band(ink, .8, -.4);
  if (p.invert) ink = cut.offset(-3.2, 'Round', 2, 20).subtract(ink.offset(.4, 'Round', 2, 20));
  return ink;
}

function embossingSolid(ctx: Ctx, ink: CrossSection, height: number, p: Params): Manifold {
  const topRound = p.designEdge === 'flat' ? 0 : p.designEdge === 'dome' ? 1 : .55;
  return topRound
    ? ctx.edged(ink, height, { top: min(topRound, height * .3), style: p.designEdge === 'chamfer' ? 'chamfer' : 'round' })
    : ctx.extrude(ink, height);
}

/**
 * A second, printable stamp that nests on the cutter's wide *rear* rim.
 *
 * Flat flange: seats on the rim and provides one continuous sturdy backplate.
 * Small inward annular guide: locates in the open cutter without binding its blade.
 * Tall raised marks: extend down into the cutter when the plate is flipped for use.
 *
 * All geometry is printed together as ONE piece with its broad flat face on the bed.
 */
function nestingStamp(ctx: Ctx, cut: CrossSection, mark: CrossSection, p: Params, notes: Diagnostic[]): Manifold {
  const flange = cut.offset(p.wall + p.rimWidth + 1.8, 'Round', 2, 32);
  const plate = max(2, p.stampCapThickness);
  const solids: Manifold[] = [ctx.extrude(flange, plate)];
  const radialGap = max(.2, p.stampClearance);
  const alignmentRim = band(cut, -radialGap, -(radialGap + 1.5));
  if (!alignmentRim.isEmpty()) solids.push(ctx.extrude(alignmentRim, 2.0, plate - .05));

  const ink = imprintArea(cut, mark, p).intersect(cut.offset(-max(3, radialGap + 2), 'Round', 2, 24));
  if (!ink.isEmpty()) {
    const tip = max(2, p.height - p.imprintInset);
    // Low, widened roots prevent tall thin eye/button pillars from tearing off
    // the stamp plate, while leaving their rounded pressing ends unchanged.
    const foot = ink.offset(1.2, 'Round', 2, 20)
      .intersect(cut.offset(-max(2.6, radialGap + 2), 'Round', 2, 24));
    if (!foot.isEmpty()) solids.push(ctx.extrude(foot, min(2.4, tip * .3), plate - .05));
    solids.push(embossingSolid(ctx, ink, tip + .05, p).translate([0, 0, plate - .05]));
  } else notes.push({ level: 'warning', message: 'This shape has no internal embossed details. The nesting stamp has a flat face.' });

  notes.push({ level: 'info', message:
    'Two-piece cutter: print both flat sides down. To use, turn the blade down, press out the outline, then seat the separate stamp face-down on the wide rim. Its locating ring enters the cutter with ' +
    radialGap.toFixed(2) + ' mm radial clearance; the embossing tips stop ' + p.imprintInset.toFixed(1) +
    ' mm behind the blade. Wash the two pieces separately.' });
  return ctx.union(solids);
}

function cutterSolid(ctx: Ctx, cut: CrossSection, mark: CrossSection, p: Params, notes: Diagnostic[]): Manifold {
  const H = p.height, wall = p.wall;
  // The inner cookie outline is stationary. The outside wall bends continuously:
  // a rounded taper into the cutting lip and a broad, smooth transition off the
  // hand-safe rim. There are no stacked bands or abrupt 0.6 mm shoulders.
  const edgeH = p.thinEdge ? min(3, H * .25) : 0;
  const solid: Manifold[] = [taperedRing(
    ctx, cut, wall, H, z => cuttingThickness(z, H, wall, p.thinEdge),
    p.thinEdge ? Math.max(14, Math.ceil(edgeH / .16)) : 2,
  )];
  if (p.rimWidth > 0) {
    const available = Math.max(.6, H - edgeH - .35);
    const flat = Math.min(p.rimThickness, Math.max(.35, available - .5));
    const transition = Math.max(.4, Math.min(3.5, Math.max(1.5, p.rimWidth * .7), available - flat));
    const base = wall + p.rimWidth + .03;
    solid.push(taperedRing(
      ctx, cut, base, flat + transition,
      z => rimThicknessAt(z, wall + .08, p.rimWidth - .05, flat, transition),
      Math.max(14, Math.ceil((flat + transition) / .2)),
    ));
  }
  if (p.sealer) solid.push(ctx.extrude(band(cut, wall + 1.4, wall - .4), .9, max(0, H - 5)));
  const b = size(cut), top = cut.bounds();
  if (p.handles !== 'none' && p.cutterType !== 'two-piece') {
    const outer = ctx.contours(cut).filter(c => signedArea(c) > 0);
    for (const sign of [-1, 1]) {
      // Anchor each tab at a real boundary vertex, not an arbitrary bounding-box midpoint.
      // This matters for stars and other shapes whose narrow waist is offset from centre.
      let x = sign > 0 ? top.max[0] : top.min[0], edgeY = (top.max[1] + top.min[1]) / 2;
      for (const c of outer) for (let i = 0; i < c.length; i += 2)
        if (sign * c[i]! >= sign * x) { x = c[i]!; edgeY = c[i + 1]!; }
      const tabX = x + sign * max(1, p.rimWidth + 2);
      const plate = p.handles === 'round'
        ? ctx.cs([circle(8, 40)]).translate([tabX, edgeY])
        : ctx.cs([roundedRect(20, 10, 3)]).translate([tabX, edgeY]);
      const neck = line(ctx, x - sign * 3, edgeY, tabX, edgeY, 7);
      solid.push(ctx.extrude(plate.add(neck), max(1.5, p.rimThickness)));
    }
    if (b.w < 15) notes.push({ level: 'warning', message: 'Press handles are close to a very narrow cutter; check the preview for clearance.' });
  }
  // Raised bars across the back opening would block the fitted plunger's guide.
  const stiff = p.cutterType === 'two-piece' ? 0 : max(0, Math.round(p.stiffeners));
  if (p.cutterType === 'two-piece' && (p.stiffeners > 0 || p.handles !== 'none'))
    notes.push({ level: 'info', message: 'Press handles and stiffening bars are disabled for a two-piece cutter so the embossing cap can seat correctly.' });
  if (stiff > 0) {
    const ribs: CrossSection[] = [];
    const bounds = cut.bounds();
    for (let i = 1; i <= stiff; i++) {
      const y = bounds.min[1] + (b.h * i) / (stiff + 1);
      ribs.push(ctx.cs([rect(b.w + 2 * wall + .2, 1.6)]).translate([b.cx, y]));
    }
    solid.push(ctx.extrude(ctx.CrossSection.union(ribs).intersect(cut.offset(wall, 'Round', 2, 20)), max(1, p.rimThickness * .6)));
  }

  if (p.cutterType === 'imprint' && !mark.isEmpty()) {
    const ink = imprintArea(cut, mark, p);
    if (!ink.isEmpty()) {
      const tipZ = max(2, H - p.imprintInset);
      // A continuous 1.8 mm rear plate makes *every* embossing feature meet the
      // outside wall across its entire foot. Skinny one-point struts were snapping.
      // 0.35 mm overlap with the wall avoids zero-area Boolean seams.
      solid.push(ctx.extrude(cut.offset(.35, 'Round', 2, 28), 1.8));
      solid.push(embossingSolid(ctx, ink, tipZ, p));
      if (p.designBase > 0) solid.push(ctx.extrude(ink.offset(p.designBase, 'Round', 2, 20), 1.8));
      notes.push({ level: 'info', message: 'Combined embossing design uses a continuous rear support plate for strength. This uses more filament than an open cutter.' });
      if (tipZ < H - 6) notes.push({ level: 'info', message: 'The stamp is recessed deeply behind the cutting lip; use soft dough and steady pressure.' });
    }
  }
  return ctx.union(solid);
}

/** Separate 2-part embossing stamp: design on the bed face, socket on the rear face. */
function stampKit(ctx: Ctx, shape: CrossSection, ink: CrossSection): [Manifold, Manifold] {
  const plate = shape.offset(-3, 'Round', 2, 24);
  const inkIn = ink.intersect(plate.offset(-1, 'Round', 2, 20));
  const centre = size(plate);
  const slab = ctx.extrude(plate, 2.5, .8);
  const marks = ctx.extrude(inkIn, .8);
  const boss = ctx.Manifold.cylinder(5, 7, 7, 64).translate([centre.cx, centre.cy, 3.3]);
  const bore = ctx.Manifold.cylinder(5.2, 3.25, 3.25, 64).translate([centre.cx, centre.cy, 3.5]);
  const stamp = slab.add(marks).add(boss).subtract(bore);
  // Print the handle standing, with its peg at the upper end. The bore leaves 0.25 mm
  // radial play; print a test peg first if the user's material has unusual shrinkage.
  const grip = ctx.Manifold.cylinder(19, 7, 7, 64)
    .add(ctx.Manifold.cylinder(4.3, 3, 3, 64).translate([0, 0, 19]));
  return [stamp, grip];
}

function stencilSolid(ctx: Ctx, shape: CrossSection, p: Params, notes: Diagnostic[]): Manifold {
  const b = size(shape), border = max(3, p.stencilBorder);
  const frame = ctx.cs([roundedRect(b.w + border * 2, b.h + border * 2, min(7, border))]).translate([b.cx, b.cy]);
  let plate = frame.subtract(shape);
  // Letter counters (O, A, B, etc.) are isolated stencil islands. Bridge each
  // counter across its *nearest glyph stroke*, not with one long horizontal web
  // through every letter. Keep the untouched letter outlines as cut-outs.
  const islands = plate.decompose();
  if (islands.length > 1) {
    const joined = connectRegions(ctx, islands, p.stencilBridge, true);
    plate = joined.section;
    if (joined.connections) notes.push({
      level: 'info',
      message: 'Added ' + joined.connections + ' short local stencil bridge(s) to retain enclosed letter counters.',
    });
  }
  return ctx.extrude(plate, p.stencilThickness);
}

function rollerSolid(ctx: Ctx, design: CrossSection, p: Params, notes: Diagnostic[]): Manifold {
  const R = p.rollerDiameter / 2, L = p.rollerLength;
  const repeats = Math.round(p.rollerRepeat), rows = Math.round(p.rollerRows);
  const circumference = 2 * Math.PI * R, pitchX = circumference / repeats, pitchY = (L - 8) / rows;
  const d = size(design);
  const scale = min(pitchX * .77 / max(.01, d.w), pitchY * .77 / max(.01, d.h));
  const motif = design.translate([-d.cx, -d.cy]).scale([scale, scale]);
  const pieces: CrossSection[] = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < repeats; col++)
      pieces.push(motif.translate([(col + .5) * pitchX, 4 + (row + .5) * pitchY]));
  const decoration = ctx.CrossSection.union(pieces);
  const base = ctx.Manifold.cylinder(L, R, R, 128).subtract(ctx.Manifold.cylinder(L + 2, 3.5, 3.5, 64).translate([0, 0, -1]));
  // Texture starts 0.25 mm inside the cylinder and finishes p.rollerDepth outside it.
  // Refine before wrapping so triangles approximate the curved cylinder rather than chords.
  const embossed = ctx.extrude(decoration, p.rollerDepth + .25).refineToLength(2.0);
  const wrapped = embossed.warpBatch((v, n) => {
    for (let i = 0; i < n; i++) {
      const theta = v[i * 3]! / R;
      const y = v[i * 3 + 1]!;
      const rad = R - .25 + v[i * 3 + 2]!;
      v[i * 3] = rad * Math.cos(theta);
      v[i * 3 + 1] = rad * Math.sin(theta);
      v[i * 3 + 2] = y;
    }
  });
  const solids: Manifold[] = [base, wrapped];
  if (p.rollerHandle !== 'none') {
    const grip = p.rollerHandle === 'grips';
    const r = grip ? 8 : 5.5, endH = grip ? 17 : 10;
    solids.push(ctx.Manifold.cylinder(endH, r, r, 64).translate([0, 0, -endH]));
    solids.push(ctx.Manifold.cylinder(endH, r, r, 64).translate([0, 0, L]));
  }
  const offset = p.rollerHandle === 'none' ? 0 : p.rollerHandle === 'grips' ? 17 : 10;
  notes.push({ level: 'info', message: 'Print this roller upright, with a brim. Fine layers help the curved relief; normal slicer mode, three walls and no supports.' });
  return ctx.union(solids).translate([0, 0, offset]);
}

interface ResultParts { parts: Part[]; drawing: Drawing; notes: Diagnostic[]; weight: number }
function outlineDrawing(ctx: Ctx, contours: CrossSection[]): Drawing {
  return { layers: [{ name: 'Cookie outline 1:1', operation: 'cut', color: [30, 30, 30], contours: contours.flatMap(s => ctx.contours(s)), polylines: [] }] };
}

async function mainBuild(ctx: Ctx, p: Params): Promise<ResultParts> {
  const notes: Diagnostic[] = [];
  const design = await makeDesign(ctx, p, notes);
  let shapes = p.source === 'svg' && p.separateParts && p.product === 'cutter' ? design.shapes : [design.cut];
  if (!shapes.length) shapes = [design.cut];
  const pieces: Part[] = [];
  let weight = 0;
  const chosen: CrossSection[] = [];
  const push = (m: Manifold, name: string, group: string, role?: 'reference') => {
    if (m.isEmpty()) return;
    if (role === undefined) weight += m.volume() * 1.24 / 1000;
    const part = ctx.part(m, name, role ? red : p.color, { group, ...(role ? { role } : {}) });
    if (part) pieces.push(part);
  };
  if (p.product === 'roller') {
    push(rollerSolid(ctx, design.cut, p, notes), 'Texture roller', 'roller');
    return { parts: pieces, drawing: outlineDrawing(ctx, [design.cut]), notes, weight };
  }
  if (p.product === 'stencil') {
    push(stencilSolid(ctx, design.cut, p, notes), 'Decorating stencil', 'stencil');
    notes.push({ level: 'info', message: 'Slicer: flat on the bed, 0.2 mm layers, two walls, no supports. Wash by hand in warm, not hot, water.' });
    return { parts: pieces, drawing: outlineDrawing(ctx, [design.cut]), notes, weight };
  }
  const textMark = await makeTextMark(ctx, p, design.cut, notes);
  const stamp = textMark.isEmpty() ? design.ink : design.ink.add(textMark);
  const b = size(design.cut), gap = p.gridGap, edge = max(b.w, b.h) + gap + 2 * (p.rimWidth + p.wall);
  const placements: [number, number, boolean][] = [];
  if (p.layout === 'grid') {
    const cols = Math.round(p.gridCols), rows = Math.round(p.gridRows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++)
      placements.push([(i - (cols - 1) / 2) * edge, (j - (rows - 1) / 2) * edge, false]);
  } else if (p.layout === 'mirror') {
    placements.push([-edge / 2, 0, false], [edge / 2, 0, true]);
  } else placements.push([0, 0, false]);
  if (placements.length > 12) notes.push({ level: 'warning', message: 'This set is large; check it fits your printer bed before exporting.' });
  const occupiedWidth = max(...placements.map(([x]) => x)) - min(...placements.map(([x]) => x));
  const stampShiftX = occupiedWidth + edge * 1.35;
  for (let pi = 0; pi < placements.length; pi++) {
    const [x, y, mirror] = placements[pi]!;
    for (let i = 0; i < shapes.length; i++) {
      const cut = mirror ? shapes[i]!.scale([-1, 1]) : shapes[i]!;
      const art = mirror ? stamp.scale([-1, 1]) : stamp;
      const offset = cut.translate([x, y]);
      chosen.push(offset);
      const solid = cutterSolid(ctx, cut, art, p, notes).translate([x, y, 0]);
      push(solid, shapes.length > 1 ? 'Cutter ' + (pi + 1) + '.' + (i + 1) : 'Cookie cutter ' + (pi + 1), 'cutter-' + pi + '-' + i);
      if (p.cutterType === 'two-piece') {
        const cap = nestingStamp(ctx, cut, art, p, notes).translate([x + stampShiftX, y, 0]);
        push(cap, shapes.length > 1 ? 'Nesting stamp ' + (pi + 1) + '.' + (i + 1) : 'Nesting stamp ' + (pi + 1), 'nesting-stamp-' + pi + '-' + i);
      }
    }
  }
  if (p.embossingStamp && p.cutterType !== 'two-piece') {
    const stampShape = await makeTextMark(ctx, p, design.cut, notes);
    const marks = stampShape.isEmpty() ? design.ink : design.ink.add(stampShape);
    const [plate, handle] = stampKit(ctx, design.cut, marks);
    push(plate.translate([-edge * 1.5, edge * 1.1, 0]), 'Embossing stamp plate', 'stamp-plate');
    push(handle.translate([-edge * 2.5, edge * 1.1, 0]), 'Embossing stamp handle', 'stamp-handle');
    notes.push({ level: 'info', message: 'The separate embossing plate prints design-side down; print the handle vertically and push its 6 mm peg into the socket (0.25 mm radial clearance).' });
  }
  if (p.practiceCookie) {
    const x = (placements.reduce((maxX, v) => max(maxX, v[0]), 0)) + edge * 1.3 + (p.cutterType === 'two-piece' ? stampShiftX : 0);
    push(ctx.extrude(design.cut, 6).translate([x, 0, 0]), 'Practice cookie', 'practice-cookie');
  }
  if (p.nameplate) {
    const text = p.stampText.trim() || (p.source === 'text' ? p.shapeText : p.shapeId.replace(/-/g, ' '));
    const layout = await layoutText(p.stampFont, text, { capHeight: 10, align: 'center' }, ctx.inputs);
    const label = ctx.cs(layout.contours);
    const l = size(label);
    const plate = ctx.cs([roundedRect(max(35, l.w + 12), max(18, l.h + 10), 3)]);
    const model = ctx.extrude(plate, 2).add(ctx.extrude(label.translate([-l.cx, -l.cy]), .8, 2));
    push(model.translate([-edge * 1.5, -edge * 1.2, 0]), 'Nameplate', 'nameplate');
  }
  if (p.previewDough) {
    const size = design.cut.bounds(), w = size.max[0] - size.min[0], h = size.max[1] - size.min[1];
    const dough = ctx.cs([roundedRect(w + 16, h + 16, 4)]).subtract(design.cut);
    push(ctx.extrude(dough, 6).translate([(edge * 1.7 + (p.cutterType === 'two-piece' ? stampShiftX : 0)), 0, 0]), 'Dough preview (not exported)', 'preview-dough', 'reference');
    push(ctx.extrude(design.cut, 6).translate([(edge * 1.7 + (p.cutterType === 'two-piece' ? stampShiftX : 0)), 0, 0]), 'Cookie preview (not exported)', 'preview-cookie', 'reference');
  }
  notes.push({ level: 'info', message: 'Print rim down and cutting edge up, without supports. 0.2 mm layers, 2 walls; three perimeters for a 1.2 mm wall. Avoid excessive heat and dishwasher temperatures.' });
  if (p.separateParts && p.source !== 'svg') notes.push({ level: 'info', message: 'Separate parts applies when the SVG has disconnected silhouettes.' });
  return { parts: pieces, drawing: outlineDrawing(ctx, chosen), notes, weight };
}

async function alphabetBuild(ctx: Ctx, p: Params): Promise<BuildResult> {
  const notes: Diagnostic[] = [];
  const chars = [...new Set(Array.from(p.alphabetChars))].filter(x => x.trim());
  const bed = p.printerBed, pitch = p.letterHeight * 1.25 + 9;
  const cols = max(1, Math.floor((bed - 12) / pitch)), rows = cols;
  const perPlate = cols * rows, sheetStep = bed + 40;
  const parts: Part[] = [], contours: CrossSection[] = [];
  if (chars.length > 48) notes.push({ level: 'warning', message: 'Export is capped at 48 alphabet cutters.' });
  for (let i = 0; i < min(48, chars.length); i++) {
    const ch = chars[i]!;
    const params: Params = { ...p, source: 'text', shapeText: ch, size: p.letterHeight, cutterType: 'only', layout: 'one', previewDough: false, practiceCookie: false, nameplate: false, handles: 'none', alphabetChars: '' };
    const d = await makeDesign(ctx, params, notes);
    const b = size(d.cut);
    const plate = Math.floor(i / perPlate), slot = i % perPlate;
    const col = slot % cols, row = Math.floor(slot / cols);
    const x = plate * sheetStep + 8 + (col + .5) * (bed - 16) / cols;
    const y = 8 + (row + .5) * (bed - 16) / rows;
    const m = cutterSolid(ctx, d.cut, ctx.cs([]), params, notes).translate([x - b.cx, y - b.cy, 0]);
    const part = ctx.part(m, ch, p.color, { group: 'plate-' + (plate + 1) + '-' + i });
    if (part) parts.push(part);
    contours.push(d.cut.translate([x - b.cx, y - b.cy]));
  }
  return {
    parts, drawing: outlineDrawing(ctx, contours),
    summary: String(chars.length) + ' letter cutters on ' + Math.ceil(chars.length / perPlate) + ' printable plates of ' + bed + ' × ' + bed + ' mm',
    diagnostics: notes,
    meta: { alphabet: true, bed, sheetStep, perPlate, chars: chars.length },
  };
}

export async function build(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  if (p.alphabetChars) return alphabetBuild(ctx, p);
  const out = await mainBuild(ctx, p);
  return {
    parts: out.parts, drawing: out.drawing, diagnostics: out.notes,
    summary: (p.product === 'cutter' ? 'Cutter' : p.product === 'stencil' ? 'Stencil' : 'Roller') +
      ' · approx. ' + out.weight.toFixed(1) + ' g PLA',
  };
}
