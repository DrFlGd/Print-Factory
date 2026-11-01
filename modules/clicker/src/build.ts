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
import type { CrossSection, Manifold, ManifoldContext } from '@pf/engine-manifold';
import { bounds, circle, namedShape, poleOf, rect, rectSize, scale, signedArea, translate } from '@pf/shapes';
import { text as layoutText } from '@pf/text';

export interface Params {
  source: 'picture' | 'text' | 'none';
  legends: string;
  font: string;
  textColor: RGB;
  keys: number;
  layout: 'row' | 'column' | 'grid';
  columns: number;
  shape: string;
  size: number;
  imageMargin: number;
  imageDepth: number;
  bleed: number;
  capProud: number;
  tolerance: number;
  border: number;
  keySpacing: number;
  stemFit: number;
  socketFit: number;
  keychain: 'none' | 'loop' | 'hole';
  keychainSide: 'left' | 'right' | 'top' | 'bottom';
  capColor: RGB;
  bodyColor: RGB;
  showAssembled: boolean;
}

export interface ClickerImage {
  width: number;
  height: number;
  silhouette: Contour[];
  regions: { index: number; color: RGB; contours: Contour[] }[];
}
export type ColourOverrides = Record<string, { color?: RGB }>;

/** Cherry MX, mm, from the plate's top face. */
export const MX = {
  cutout: 14,
  plate: 1.5,
  housing: 15.6,
  housingTop: 6.6,
  stemTop: 11.6,
  travel: 4,
  pinsBelow: 8.3,
  /** Under the plate the clips need room to spring out. */
  pocket: 15.2,
  stemDia: 5.5,
  crossLength: 4.05,
  crossWidth: 1.29,
  /** How far the cross goes into the cap's post. */
  insert: 4,
} as const;

export const FLOOR = 1.6;
export const CAP_WALL = 1.6;
/** Room round the housing inside the cap. */
const HOUSING_CLEAR = 0.5;
/** Cap roof thickness (picture face included). */
export const ROOF = 2.2;
const NAMED = ['circle', 'rounded-square', 'square', 'hexagon', 'octagon', 'heart', 'star', 'squircle', 'shield', 'pill', 'oval', 'teardrop'];

/** Heights in the body frame (floor on the bed). */
export function heights(p: Pick<Params, 'capProud'>) {
  const plateTop = FLOOR + (MX.pinsBelow + 0.4 - MX.plate) + MX.plate;
  const capBottom = plateTop + MX.stemTop - MX.insert;
  // The cavity must take the housing top at full travel, with room to spare.
  const cavity = MX.housingTop - (MX.stemTop - MX.insert - MX.travel) + 0.8;
  const capH = cavity + ROOF;
  const proud = Math.max(0.5, Math.min(p.capProud, MX.travel));
  const bodyTop = capBottom + capH - proud;
  return { plateTop, capBottom, cavity, capH, proud, bodyTop };
}

/** The square inside a cap that the switch needs: housing, clearance and a wall. */
export const NEEDS = MX.housing + 2 * HOUSING_CLEAR + 2 * CAP_WALL;

type Ctx = ManifoldContext<Params>;

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

async function capDesigns(ctx: Ctx, notes: Diagnostic[]): Promise<CapDesign[]> {
  const p = ctx.params;
  const keys = Math.max(1, Math.min(24, Math.round(p.keys)));
  const img = ctx.inputs.image as ClickerImage | undefined;
  const overrides = (ctx.inputs.colours as ColourOverrides | undefined) ?? {};
  const picture = p.source === 'picture' && img?.regions?.length ? img : null;
  if (p.source === 'picture' && !picture) notes.push({ level: 'info', message: 'Choose a picture for the cap, or switch the design to Text or None.' });
  let shape = p.shape;
  if (shape === 'outline' && !picture) shape = 'rounded-square';
  const m = Math.max(0, p.imageMargin);
  const legends = p.legends.split(',').map((s) => s.trim());

  const designFor = async (i: number, size: number): Promise<CapDesign> => {
    let outline: CrossSection;
    let inlays: CapDesign['inlays'] = [];
    let art: { contours: Contour[]; key: string; color: RGB; fill: 'EvenOdd' | 'NonZero' }[] = [];
    let box = { width: 1, height: 1, cx: 0, cy: 0 };
    if (picture) {
      box = rectSize(bounds(picture.silhouette.length ? picture.silhouette : picture.regions.flatMap((r) => r.contours)));
      art = picture.regions.map((r) => ({ contours: r.contours, key: String(r.index), color: overrides[String(r.index)]?.color ?? r.color, fill: 'EvenOdd' as const }));
    } else if (p.source === 'text') {
      const value = keys > 1 ? (legends[i] ?? '') : p.legends;
      if (value) {
        const l = await layoutText(p.font, value, { capHeight: 10, align: 'center' }, ctx.inputs);
        if (l.missing.length) notes.push({ level: 'warning', message: `No bundled font has ${l.missing.join(' ')}; left out.` });
        if (l.contours.length) {
          box = rectSize(l.bounds);
          art = [{ contours: l.contours, key: 'text', color: p.textColor, fill: 'NonZero' }];
        }
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
  let d0 = await designFor(0, size);
  if (!fitsSwitch(ctx, d0.outline, d0.centre)) {
    for (let i = 0; i < 40 && !fitsSwitch(ctx, d0.outline, d0.centre); i++) {
      size *= 1.06;
      d0 = await designFor(0, size);
    }
    notes.push({ level: 'info', message: `Grew the cap to ${size.toFixed(0)} mm so the switch fits under it.` });
  }
  const out = [d0];
  for (let i = 1; i < keys; i++) out.push(await designFor(i, size));
  return out;
}

function stemPost(ctx: Ctx, fit: number, height: number): Manifold {
  const body = ctx.Manifold.cylinder(height, MX.stemDia / 2, MX.stemDia / 2, 48);
  const L = MX.crossLength + fit;
  const W = MX.crossWidth + fit;
  return body.subtract(ctx.extrude(ctx.cs([rect(L, W), rect(W, L)], 'NonZero'), MX.insert + 1, -1));
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

/** Key centres for the layout, spaced so wells keep a wall between them. */
function keyCentres(p: Params, w: number, h: number): [number, number][] {
  const n = Math.max(1, Math.min(24, Math.round(p.keys)));
  const gap = 2 * p.tolerance + Math.max(1.6, p.keySpacing);
  const cols = p.layout === 'row' ? n : p.layout === 'column' ? 1 : Math.max(1, Math.min(n, Math.round(p.columns)));
  const rows = Math.ceil(n / cols);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push([(c - (cols - 1) / 2) * (w + gap), ((rows - 1) / 2 - r) * (h + gap)]);
  }
  return out;
}

export async function build(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  const notes: Diagnostic[] = [];
  const h = heights(p);
  const designs = await capDesigns(ctx, notes);
  const b0 = rectSize(bounds(ctx.contours(designs[0]!.outline)));
  const centres = keyCentres(p, b0.width, b0.height);
  const depth = Math.max(0.2, Math.min(p.imageDepth, ROOF - 0.6));

  // Body: one outline round every well, a well per cap, a plate and a pocket per switch.
  const wells = ctx.CrossSection.union(designs.map((d, i) => d.outline.offset(p.tolerance, 'Round', 2, 32).translate(centres[i]!)));
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
  for (let i = 0; i < designs.length; i++) {
    const [cx, cy] = centres[i]!;
    const [sx, sy] = designs[i]!.centre;
    const x = cx + sx;
    const y = cy + sy;
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
