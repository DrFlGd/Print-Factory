/**
 * Clicker: a picture (or a letter, or a plain shape) on a cap that presses a real Cherry MX
 * style switch. The body holds the switch in a plate cutout and guides the cap in a well; the
 * cap fits the switch stem like a keycap and stands proud of the body by its travel, so a
 * full press takes it flush.
 *
 * Switch numbers are the published MX ones: 14 mm plate cutout in a 1.5 mm plate, housing
 * 15.6 mm square at the plate, top of housing 6.6 mm and top of stem 11.6 mm above the plate,
 * 4 mm travel, pins 8.3 mm below the plate top. The geometry is written for Print Factory; the
 * original's switch meshes are not used.
 *
 * Print frame: the body stands on its floor; each cap prints face down so the picture is the
 * first layers. The assembled preview (never exported) shows the caps in place at rest.
 */
import type { BuildResult, Contour, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold } from '@pf/engine-manifold';
import type { KeyCell, Legend } from './keys';
import { blockCells, centresOf, countCells, MAX_KEYS, tokens } from './keys';
import { buildModel } from './model';
import { CAP_WALL, FLOOR, HOUSING_CLEAR, MX, NAMED, NEEDS, ROOF, heights, stemPost } from './switch';
import type { Ctx, Params } from './types';

export type { Params } from './types';
export { MX, FLOOR, CAP_WALL, ROOF, NEEDS, heights } from './switch';
import { bounds, circle, namedShape, poleOf, rect, rectSize, scale, signedArea, translate } from '@pf/shapes';
import { symbolShapes } from '@pf/symbols';
import { text as layoutText } from '@pf/text';


export interface ClickerImage {
  width: number;
  height: number;
  silhouette: Contour[];
  regions: { index: number; color: RGB; contours: Contour[] }[];
}
export type ColourOverrides = Record<string, { color?: RGB }>;


function filled(ctx: Ctx, s: CrossSection): CrossSection {
  return ctx.cs(ctx.contours(s).filter((c) => signedArea(c) > 0));
}

interface CapDesign {
  outline: CrossSection;
  /** Where the switch sits under the cap. */
  centre: [number, number];
  inlays: { key: string; color: RGB; section: CrossSection }[];
}

function fitsSwitch(ctx: Ctx, outline: CrossSection, c: [number, number]): boolean {
  return ctx.cs([rect(NEEDS, NEEDS)]).translate(c).subtract(outline).area() < 1e-3;
}

async function capDesigns(ctx: Ctx, notes: Diagnostic[]): Promise<{ designs: CapDesign[]; cells: KeyCell[] }> {
  const p = ctx.params;
  const keys = Math.max(1, Math.min(MAX_KEYS, Math.round(p.keys)));
  const img = ctx.inputs.image as ClickerImage | undefined;
  const overrides = (ctx.inputs.colours as ColourOverrides | undefined) ?? {};
  const picture = p.source === 'picture' && img?.regions?.length ? img : null;
  if (p.source === 'picture' && !picture) notes.push({ level: 'info', message: 'Choose a picture for the cap, or switch the design to Text or None.' });
  let shape = p.shape;
  if (shape === 'outline' && !picture) shape = 'rounded-square';
  const m = Math.max(0, p.imageMargin);
  const legends = p.legends.split(',').map((s) => s.trim());
  const textLegend = (v: string): Legend => {
    const t = tokens(v);
    return t.length === 1 && t[0]!.kind === 'symbol' ? t[0]! : v ? { kind: 'text', value: v } : { kind: 'blank' };
  };
  const cells =
    p.source === 'blocks'
      ? blockCells(p)
      : countCells(p, (i) => (p.source === 'text' ? textLegend(keys > 1 || p.layout === 'wasd' || p.layout === 'arrows' ? (legends[i] ?? '') : p.legends) : p.source === 'icon' ? { kind: 'symbol', id: p.icon } : { kind: 'blank' }));

  const designFor = async (legend: Legend, size: number): Promise<CapDesign> => {
    let outline: CrossSection;
    let inlays: CapDesign['inlays'] = [];
    let art: { contours: Contour[]; key: string; color: RGB; fill: 'EvenOdd' | 'NonZero' }[] = [];
    let box = { width: 1, height: 1, cx: 0, cy: 0 };
    if (picture) {
      box = rectSize(bounds(picture.silhouette.length ? picture.silhouette : picture.regions.flatMap((r) => r.contours)));
      art = picture.regions.map((r) => ({ contours: r.contours, key: String(r.index), color: overrides[String(r.index)]?.color ?? r.color, fill: 'EvenOdd' as const }));
    } else if (legend.kind === 'text' && legend.value) {
      const l = await layoutText(p.font, legend.value, { capHeight: 10, align: 'center' }, ctx.inputs);
      if (l.missing.length) notes.push({ level: 'warning', message: `No bundled font has ${l.missing.join(' ')}; left out.` });
      if (l.contours.length) {
        box = rectSize(l.bounds);
        art = [{ contours: l.contours, key: 'text', color: p.textColor, fill: 'NonZero' }];
      }
    } else if (legend.kind === 'symbol') {
      const shapes = await symbolShapes(legend.id, 10, ctx.inputs);
      if (!shapes.length) notes.push({ level: 'warning', message: `There is no symbol called "${legend.id.replace(/^tabler:/, '')}".` });
      else {
        const sec = ctx.CrossSection.union(shapes.map((sh) => ctx.cs(sh.contours, sh.fillRule)));
        const contours = ctx.contours(sec);
        box = rectSize(bounds(contours));
        art = [{ contours, key: 'text', color: p.textColor, fill: 'NonZero' }];
      }
    }
    const place = (k: number, dx = 0, dy = 0) => art.map((a) => ({ key: a.key, color: a.color, section: ctx.cs(translate(scale(translate(a.contours, -box.cx, -box.cy), k), dx, dy), a.fill) }));
    if (shape === 'outline' && picture) {
      const k = Math.max(1e-6, size - 2 * m) / Math.max(box.width, box.height);
      const sil = ctx.cs(scale(translate(picture.silhouette, -box.cx, -box.cy), k), 'NonZero');
      const r = Math.max(1, Math.min(4, size * 0.04));
      outline = filled(ctx, sil.offset(m + r, 'Round', 2, 32).offset(-r, 'Round', 2, 32));
      inlays = place(k);
    } else {
      const w = shape === 'pill' || shape === 'oval' ? size : size;
      const h = shape === 'pill' || shape === 'oval' ? size * 0.7 : size;
      outline = ctx.cs([namedShape(NAMED.includes(shape) ? shape : 'rounded-square', w, h, size * 0.18)]);
      const b = rectSize(bounds(ctx.contours(outline)));
      outline = outline.translate([-b.cx, -b.cy]);
      if (art.length) {
        const inner = outline.offset(-m, 'Round', 2, 32);
        const pole = poleOf(ctx.contours(inner), 0.3);
        const fits = (k: number) => ctx.cs([rect(box.width * k, box.height * k)]).translate([pole.x, pole.y]).subtract(inner).area() < 1e-3;
        let lo = 0;
        let hi = (size / Math.max(box.width, box.height)) * 1.01;
        for (let j = 0; j < 24; j++) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) lo = mid;
          else hi = mid;
        }
        inlays = place(lo, pole.x, pole.y);
      }
    }
    const pole = poleOf(ctx.contours(outline), 0.3);
    let centre: [number, number] = [pole.x, pole.y];
    if (fitsSwitch(ctx, outline, [0, 0])) centre = [0, 0];
    return { outline, centre, inlays };
  };

  // Grow until the switch fits under the cap.
  let size = Math.max(10, p.size);
  let d0 = await designFor(cells[0]!.legend, size);
  if (!fitsSwitch(ctx, d0.outline, d0.centre)) {
    for (let i = 0; i < 40 && !fitsSwitch(ctx, d0.outline, d0.centre); i++) {
      size *= 1.06;
      d0 = await designFor(cells[0]!.legend, size);
    }
    notes.push({ level: 'info', message: `Grew the cap to ${size.toFixed(0)} mm so the switch fits under it.` });
  }
  const out = [d0];
  for (let i = 1; i < cells.length; i++) out.push(await designFor(cells[i]!.legend, size));
  return { designs: out, cells };
}


/** A cap in its own frame: skirt bottom on z = 0, picture face on top. */
function capSolid(ctx: Ctx, d: CapDesign, h: ReturnType<typeof heights>, depth: number): { cap: Manifold; inlays: { solid: Manifold; color: RGB; name: string }[] } {
  const p = ctx.params;
  const outer = ctx.extrude(d.outline, h.capH);
  const hollow = d.outline.offset(-CAP_WALL, 'Round', 2, 32);
  let cap = outer.subtract(ctx.extrude(hollow, h.cavity + 1, -1));
  cap = cap.add(stemPost(ctx, p.stemFit, h.cavity + 0.01).translate([d.centre[0], d.centre[1], 0]));
  // Picture: smallest colour first, inlaid flush in the top.
  const clip = d.outline.offset(-0.6, 'Round', 2, 16);
  const inlays: { solid: Manifold; color: RGB; name: string }[] = [];
  let taken: CrossSection | null = null;
  const ordered = d.inlays.map((r) => ({ ...r, area: r.section.area() })).sort((a, b) => a.area - b.area);
  for (const r of ordered) {
    let s = (p.bleed > 0 ? r.section.offset(p.bleed, 'Round', 2, 16) : r.section).intersect(clip);
    if (taken) s = s.subtract(taken);
    if (s.isEmpty() || s.area() < 0.1) continue;
    taken = taken ? taken.add(s) : s;
    inlays.push({ solid: ctx.extrude(s, depth, h.capH - depth), color: r.color, name: r.key === 'text' ? 'Text' : `Colour ${inlays.length + 1}` });
  }
  if (taken) cap = cap.subtract(ctx.extrude(taken, depth + 1, h.capH - depth));
  return { cap, inlays };
}

/**
 * The body round one or more wells: a border, a keyring loop or hole, the wells down to the
 * plate, and a plate cutout and clips' pocket under each switch at `sockets`.
 */
function makeBody(ctx: Ctx, notes: Diagnostic[], wellsIn: CrossSection, sockets: [number, number][]): { body: Manifold; outline: CrossSection; ob: ReturnType<typeof rectSize> } {
  const p = ctx.params;
  const h = heights(p);
  const wells = wellsIn.offset(p.tolerance, 'Round', 2, 32);
  let outline = wells.offset(Math.max(1.2, p.border), 'Round', 2, 32);
  const bodyTop = h.bodyTop;
  const ob = rectSize(bounds(ctx.contours(outline)));
  let ring: CrossSection | null = null;
  if (p.keychain === 'loop') {
    const R = 5;
    const at: Record<Params['keychainSide'], [number, number]> = {
      left: [ob.cx - ob.width / 2 - R + 1.5, ob.cy],
      right: [ob.cx + ob.width / 2 + R - 1.5, ob.cy],
      top: [ob.cx, ob.cy + ob.height / 2 + R - 1.5],
      bottom: [ob.cx, ob.cy - ob.height / 2 - R + 1.5],
    };
    const [x, y] = at[p.keychainSide];
    ring = ctx.cs([translate([circle(R, 48)], x, y)[0]!]);
    outline = outline.add(ring);
  }
  let body = ctx.extrude(outline, bodyTop);
  if (ring) {
    // The loop is a low tab with a hole, not the full height.
    const [x, y] = [rectSize(bounds(ctx.contours(ring))).cx, rectSize(bounds(ctx.contours(ring))).cy];
    const above = ring.subtract(wells.offset(Math.max(1.2, p.border), 'Round', 2, 32));
    body = body.subtract(ctx.extrude(above, bodyTop, 4)).subtract(ctx.extrude([translate([circle(2.5, 32)], x, y)[0]!], 10, -1));
  }
  body = body.subtract(ctx.extrude(wells, bodyTop, h.plateTop));
  for (const [x, y] of sockets) {
    body = body.subtract(ctx.extrude([rect(MX.pocket, MX.pocket)], h.plateTop - MX.plate - FLOOR, FLOOR).translate([x, y, 0]));
    body = body.subtract(ctx.extrude([rect(MX.cutout + p.socketFit, MX.cutout + p.socketFit)], MX.plate + 1, h.plateTop - MX.plate - 0.5).translate([x, y, 0]));
  }
  if (p.keychain === 'hole') {
    // Through the border at the chosen side, clear of the wells.
    const reach = (Math.max(1.2, p.border) + p.tolerance) / 2;
    const r = Math.max(1.5, Math.min(2.5, reach - 0.6));
    const off = Math.max(1.2, p.border) / 2 + p.tolerance;
    const pos: Record<Params['keychainSide'], [number, number]> = {
      left: [ob.cx - ob.width / 2 + off, ob.cy],
      right: [ob.cx + ob.width / 2 - off, ob.cy],
      top: [ob.cx, ob.cy + ob.height / 2 - off],
      bottom: [ob.cx, ob.cy - ob.height / 2 + off],
    };
    if (p.border < 6) notes.push({ level: 'warning', message: 'A keyring hole needs a border of 6 mm or more; widen the border or use a loop.' });
    else body = body.subtract(ctx.extrude([translate([circle(r, 32)], ...pos[p.keychainSide])[0]!], bodyTop + 2, -1));
  }
  return { body, outline, ob };
}

export async function build(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  const notes: Diagnostic[] = [];
  if (p.source === 'model') {
    const r = await buildModel(ctx, notes, (wells, sockets) => makeBody(ctx, notes, wells, sockets));
    return { parts: r.parts, diagnostics: notes, summary: r.summary };
  }
  const h = heights(p);
  const { designs, cells } = await capDesigns(ctx, notes);
  const b0 = rectSize(bounds(ctx.contours(designs[0]!.outline)));
  const centres = centresOf(cells, b0.width, b0.height, 2 * p.tolerance + Math.max(1.6, p.keySpacing));
  const depth = Math.max(0.2, Math.min(p.imageDepth, ROOF - 0.6));

  // Body: one outline round every well, a well per cap, a plate and a pocket per switch.
  const wells = ctx.CrossSection.union(designs.map((d, i) => d.outline.translate(centres[i]!)));
  const { body, ob } = makeBody(
    ctx,
    notes,
    wells,
    designs.map((d, i) => [centres[i]![0] + d.centre[0], centres[i]![1] + d.centre[1]]),
  );
  const bodyTop = h.bodyTop;

  const parts: Part[] = [];
  const add = (m: Manifold, name: string, color: RGB, group: string, role?: 'preview') => {
    const part = ctx.part(m, name, color, { group, role });
    if (part) parts.push(part);
  };
  add(body, 'Body', p.bodyColor, 'Body');

  // Caps print face down, in a row in front of the body.
  const bb = body.boundingBox();
  let x = bb.min[0];
  const y = bb.min[1] - 6 - b0.height / 2;
  const built = designs.map((d) => capSolid(ctx, d, h, depth));
  built.forEach((c, i) => {
    // Turned over (a rotation, not a mirror, or the picture would print backwards).
    const flip = (m: Manifold) => m.rotate([180, 0, 0]).translate([0, 0, h.capH]);
    const cb = flip(c.cap).boundingBox();
    const dx = x - cb.min[0];
    x += cb.max[0] - cb.min[0] + 4;
    const at = (m: Manifold) => flip(m).translate([dx, y - (cb.min[1] + cb.max[1]) / 2, 0]);
    const g = `Cap ${i + 1}`;
    add(at(c.cap), designs.length > 1 ? `Cap ${i + 1}` : 'Cap', p.capColor, g);
    for (const inlay of c.inlays) add(at(inlay.solid), designs.length > 1 ? `Cap ${i + 1} ${inlay.name}` : inlay.name, inlay.color, g);
  });

  if (p.showAssembled) {
    const ox = bb.max[0] - bb.min[0] + 20;
    add(body.translate([ox, 0, 0]), 'Body (assembled)', p.bodyColor.map((v) => Math.round(v * 0.9)) as RGB, 'preview', 'preview');
    built.forEach((c, i) => {
      const [cx, cy] = centres[i]!;
      const put = (m: Manifold) => m.translate([cx + ox, cy, h.capBottom]);
      add(put(c.cap), `Cap ${i + 1} (assembled)`, p.capColor, 'preview', 'preview');
      for (const inlay of c.inlays) add(put(inlay.solid), `Cap ${i + 1} ${inlay.name} (assembled)`, inlay.color, 'preview', 'preview');
    });
  }

  const anyInlay = built.some((c) => c.inlays.length);
  if (anyInlay) notes.push({ level: 'info', message: `Caps print face down: the design is the first ${depth.toFixed(1)} mm and needs a printer that swaps filament.` });
  notes.push({ level: 'info', message: `Push a Cherry MX style switch into each socket from above until it clicks into the plate, then press the cap onto its stem. The cap stands ${h.proud.toFixed(1)} mm proud.` });
  return {
    parts,
    diagnostics: notes,
    summary: `${designs.length} key${designs.length > 1 ? 's' : ''}, body ${ob.width.toFixed(0)} × ${ob.height.toFixed(0)} × ${bodyTop.toFixed(1)} mm. Caps print face down, the body on its floor.`,
  };
}
