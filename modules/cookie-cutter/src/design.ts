/**
 * Inputs are converted into two 2D regions:
 *   cut   – the filled cookie silhouette, used for the outside cutting blade
 *   ink   – the detail pressed into dough (never used for the cutting edge)
 * All outlines are centred, transformed together, and sized to the requested mm.
 */
import type { Diagnostic } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { bounds, circle, ellipse, heart, orient, parseSvg, rect, rectSize, regularPolygon, signedArea, star } from '@pf/shapes';
import { symbolShapes } from '@pf/symbols';
import { text as layoutText } from '@pf/text';
import { cookieShape } from './catalog';
import { connectRegions } from './bridges';
import type { Ctx, CookieImage, Params } from './types';

export interface Design { cut: CrossSection; ink: CrossSection; shapes: CrossSection[] }
const pos = (v: number) => Math.max(0, v);
const sq = (ctx: Ctx, w: number, h: number, x = 0, y = 0) => ctx.cs([rect(w, h)]).translate([x, y]);
const disc = (ctx: Ctx, x: number, y: number, r: number) => ctx.cs([circle(r, 64)]).translate([x, y]);
const oval = (ctx: Ctx, x: number, y: number, rx: number, ry: number) => ctx.cs([ellipse(rx, ry, 80)]).translate([x, y]);
const polygon = (ctx: Ctx, points: readonly [number, number][]) => ctx.cs([orient(points.flat(), true)]);
const sum = (ctx: Ctx, shapes: CrossSection[]) => ctx.CrossSection.union(shapes);
const line = (ctx: Ctx, a: [number, number], b: [number, number], w: number) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const m = Math.hypot(dx, dy);
  if (m < 0.01) return disc(ctx, a[0], a[1], w / 2);
  return sq(ctx, m, w).rotate(Math.atan2(dy, dx) * 180 / Math.PI).translate([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
    .add(disc(ctx, a[0], a[1], w / 2)).add(disc(ctx, b[0], b[1], w / 2));
};
const path = (ctx: Ctx, ps: [number, number][], w: number) => sum(ctx, ps.slice(1).map((pt, i) => line(ctx, ps[i]!, pt, w)));
const empty = (ctx: Ctx) => ctx.cs([]);

export function filled(ctx: Ctx, section: CrossSection): CrossSection {
  return ctx.cs(ctx.contours(section).filter(c => signedArea(c) > 0));
}

/** A few reference silhouettes whose details are not present in the bundled icon library. */
function handmade(ctx: Ctx, key: string): { body: CrossSection; detail: CrossSection } {
  const e = empty(ctx);
  switch (key) {
    case 'gingerbread-man': {
      // Rounded arms, head, trunk and legs overlap generously to stay one cookie.
      // The face and buttons are *imprints*, never interior cut-outs.
      const body = sum(ctx, [
        disc(ctx, 0, 35, 20), oval(ctx, 0, -3, 25, 33),
        line(ctx, [-17, 10], [-43, -6], 20),
        line(ctx, [17, 10], [43, -6], 20),
        line(ctx, [-12, -25], [-24, -53], 21),
        line(ctx, [12, -25], [24, -53], 21),
      ]);
      const smile = path(ctx, [[-8, 27], [-4, 24], [1, 23], [6, 26], [9, 29]], 2.8);
      const bow = sum(ctx, [
        polygon(ctx, [[0, 10], [-13, 16], [-13, 4]]),
        polygon(ctx, [[0, 10], [13, 16], [13, 4]]),
        disc(ctx, 0, 10, 3.5),
      ]);
      return { body, detail: sum(ctx, [
        disc(ctx, -8, 39, 2.8), disc(ctx, 8, 39, 2.8), smile, bow,
        disc(ctx, 0, -7, 4), disc(ctx, 0, -21, 4),
        line(ctx, [-35, -6], [-39, -2], 2.5), line(ctx, [35, -6], [39, -2], 2.5),
      ]) };
    }
    case 'christmas-tree': {
      // A single filled branch silhouette, with a solid trunk: no internal holes.
      const body = polygon(ctx, [
        [0, 55], [22, 28], [13, 28], [33, 3], [23, 3],
        [43, -30], [10, -30], [10, -47], [-10, -47],
        [-10, -30], [-43, -30], [-23, 3], [-33, 3],
        [-13, 28], [-22, 28],
      ]);
      return { body, detail: sum(ctx, [
        path(ctx, [[-15, 19], [11, 13], [-18, -2], [22, -13]], 3.4),
        disc(ctx, 0, 34, 4), disc(ctx, -15, -19, 4),
        disc(ctx, 15, -20, 4), disc(ctx, 0, -42, 3),
      ]) };
    }
    case 'bell': {
      // A flared bell shell with sloping shoulders, a rounded crown, a bottom
      // rim and a solid clapper bump. Nothing is hollowed out as a second blade.
      const body = polygon(ctx, [
        [-40, -39], [40, -39], [37, -31], [31, -25], [30, -13],
        [29, 7], [26, 20], [21, 29], [13, 35], [-13, 35],
        [-21, 29], [-26, 20], [-29, 7], [-30, -13],
        [-31, -25], [-37, -31],
      ]).add(disc(ctx, 0, 37, 9)).add(disc(ctx, 0, -39, 8));
      return { body, detail: sum(ctx, [
        line(ctx, [-31, -32], [31, -32], 3.8),
        disc(ctx, 0, -28, 6),
        path(ctx, [[-17, 24], [0, 29], [17, 24]], 2.8),
      ]) };
    }
    case 'snowflake': {
      const arms = [];
      const marks = [];
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        const u: [number, number] = [Math.cos(a), Math.sin(a)];
        arms.push(line(ctx, [0, 0], [43 * u[0], 43 * u[1]], 9));
        for (const f of [0.58, 0.8]) for (const sign of [-1, 1]) {
          const t = a + sign * Math.PI / 3;
          marks.push(line(ctx, [f * 43 * u[0], f * 43 * u[1]], [f * 43 * u[0] - 13 * Math.cos(t), f * 43 * u[1] - 13 * Math.sin(t)], 3));
        }
      }
      return { body: sum(ctx, arms).add(disc(ctx, 0, 0, 8)), detail: sum(ctx, marks) };
    }
    case 'candy-cane': {
      const pts: [number, number][] = [[-18, -46], [-18, 23], [-16, 34], [-7, 42], [7, 42], [19, 36], [25, 23], [24, 11]];
      return { body: path(ctx, pts, 19), detail: sum(ctx, [-22, -6, 9, 24].map((y) => line(ctx, [-28, y], [-9, y + 7], 3))) };
    }
    case 'reindeer': {
      const antler = (sgn: number) => sum(ctx, [
        line(ctx, [sgn * 18, 12], [sgn * 23, 43], 9),
        line(ctx, [sgn * 23, 31], [sgn * 42, 46], 7),
        line(ctx, [sgn * 24, 30], [sgn * 10, 47], 6),
      ]);
      return { body: sum(ctx, [oval(ctx, 0, -10, 33, 34), oval(ctx, -30, 7, 18, 12), oval(ctx, 30, 7, 18, 12), antler(-1), antler(1)]), detail: sum(ctx, [disc(ctx, -13, -13, 3.8), disc(ctx, 13, -13, 3.8), disc(ctx, 0, -30, 6)]) };
    }
    case 'santa-hat': {
      const hat = polygon(ctx, [[-45, -23], [45, -23], [24, 5], [-10, 44], [-28, 47], [-34, 21]]);
      return { body: hat.add(sq(ctx, 94, 19, 0, -28)).add(disc(ctx, -35, 22, 11)), detail: line(ctx, [-40, -23], [40, -23], 3) };
    }
    case 'mitten': {
      const body = oval(ctx, 4, 10, 32, 37).add(oval(ctx, -30, -7, 16, 23)).add(sq(ctx, 46, 22, 6, -33));
      return { body, detail: line(ctx, [-12, -29], [27, -29], 3) };
    }
    case 'stocking': {
      // A recognisable hanging boot: straight tall shaft on the right, cuff at the
      // top and a big rounded toe reaching to the left. The cuff/toe are embossing.
      const body = sum(ctx, [
        sq(ctx, 38, 66, 14, 2),
        oval(ctx, -14, -29, 34, 20),
        sq(ctx, 49, 15, 14, 40),
      ]);
      return { body, detail: sum(ctx, [
        sq(ctx, 41, 6, 14, 35),
        path(ctx, [[-34, -20], [-39, -27], [-37, -36], [-29, -40]], 3.2),
        path(ctx, [[24, -14], [22, -25], [14, -31]], 3),
      ]) };
    }
    case 'snowman': {
      const body = disc(ctx, 0, -24, 32).add(disc(ctx, 0, 13, 24)).add(sq(ctx, 37, 23, 0, 43)).add(sq(ctx, 54, 7, 0, 32));
      return { body, detail: sum(ctx, [disc(ctx, -9, 16, 3), disc(ctx, 9, 16, 3), disc(ctx, 0, -10, 3), disc(ctx, 0, -25, 3), disc(ctx, 0, -40, 3)]) };
    }
    case 'bauble-star': {
      const body = disc(ctx, 0, -8, 39).add(sq(ctx, 26, 12, 0, 34)).add(disc(ctx, 0, 48, 8));
      return { body, detail: ctx.cs([star(5, 21, 9)]).translate([0, -8]) };
    }
    case 'wreath': {
      const body = disc(ctx, 0, 0, 47);
      const detail = sum(ctx, [ctx.cs([circle(30, 96)]).subtract(ctx.cs([circle(23, 96)])), sq(ctx, 14, 8, 0, -34), disc(ctx, -8, -34, 6), disc(ctx, 8, -34, 6)]);
      return { body, detail };
    }
    case 'cinnamon-sticks': {
      const parts = [];
      for (const dx of [-17, 0, 17]) parts.push(line(ctx, [dx - 14, -37], [dx + 14, 37], 15));
      return { body: sum(ctx, parts), detail: sum(ctx, [-17, 0, 17].map(x => line(ctx, [x - 13, -36], [x + 12, 32], 2))) };
    }
    case 'angel': {
      const body = disc(ctx, 0, 32, 15).add(polygon(ctx, [[-21, 21], [21, 21], [35, -47], [-35, -47]]))
        .add(oval(ctx, -29, 6, 19, 27)).add(oval(ctx, 29, 6, 19, 27));
      return { body, detail: line(ctx, [-24, -20], [24, -20], 3) };
    }
    case 'santa-claus': {
      // A full Santa silhouette instead of the previous generic round face with a
      // roof-shaped hat. Mitten arms, boots, beard and hat all overlap as one body.
      const body = sum(ctx, [
        oval(ctx, 0, -14, 30, 32),
        line(ctx, [-20, -3], [-42, -15], 19),
        line(ctx, [20, -3], [42, -15], 19),
        line(ctx, [-12, -36], [-16, -53], 19),
        line(ctx, [12, -36], [16, -53], 19),
        disc(ctx, 0, 34, 17),
        oval(ctx, 0, 23, 19, 22),
        polygon(ctx, [[-18, 42], [17, 42], [9, 64], [-12, 62], [-24, 53]]),
        sq(ctx, 39, 9, 0, 43),
        disc(ctx, -23, 58, 7),
      ]);
      const buckle = sq(ctx, 11, 11, 0, -17).subtract(sq(ctx, 5, 5, 0, -17));
      return { body, detail: sum(ctx, [
        disc(ctx, -7, 36, 2.6), disc(ctx, 7, 36, 2.6),
        disc(ctx, 0, 27, 3.5),
        oval(ctx, -8, 20, 10, 4.5), oval(ctx, 8, 20, 10, 4.5),
        line(ctx, [-24, -17], [24, -17], 3.7), buckle,
        disc(ctx, 0, -2, 3), disc(ctx, 0, -32, 3),
        line(ctx, [-12, -48], [-21, -48], 3),
        line(ctx, [12, -48], [21, -48], 3),
      ]) };
    }
    case 'gingerbread-house': {
      const body = sq(ctx, 80, 59, 0, -17).add(polygon(ctx, [[-46, 8], [0, 47], [46, 8]]))
        .add(sq(ctx, 13, 31, 24, 32));
      return { body, detail: sum(ctx, [sq(ctx, 21, 30, 0, -31), sq(ctx, 13, 16, -25, -6), sq(ctx, 13, 16, 25, -6)]) };
    }
    case 'classic-tree': {
      const body = sum(ctx, [
        polygon(ctx, [[-22, 17], [0, 51], [22, 17]]),
        polygon(ctx, [[-33, -9], [0, 32], [33, -9]]),
        polygon(ctx, [[-44, -36], [0, 10], [44, -36]]),
        sq(ctx, 16, 18, 0, -43),
      ]);
      return { body, detail: sum(ctx, [disc(ctx, -12, 5, 4), disc(ctx, 11, -19, 4), disc(ctx, 0, 30, 3)]) };
    }
    default: return { body: disc(ctx, 0, 0, 40), detail: e };
  }
}

async function ready(ctx: Ctx, p: Params, notes: Diagnostic[]): Promise<{ body: CrossSection; detail: CrossSection }> {
  const shape = cookieShape(p.shapeId);
  // Filled icon glyphs can contain counters and open line-art sections. The
  // Christmas favourites have dedicated, continuous cutter silhouettes instead.
  if (!shape.symbol || ['gingerbread-man', 'christmas-tree', 'bell'].includes(shape.id)) return handmade(ctx, shape.id);
  const sh = await symbolShapes(shape.symbol, 100, ctx.inputs);
  if (!sh.length) {
    notes.push({ level: 'warning', message: 'Ready-made symbol missing, using a round cutter.' });
    return { body: disc(ctx, 0, 0, 40), detail: empty(ctx) };
  }
  const original = sum(ctx, sh.map(x => ctx.cs(x.contours, x.fillRule)));
  // A cutter follows the outside silhouette, not holes through an icon.
  const body = filled(ctx, original);
  if (shape.id === 'gingerbread-man') {
    const b = body.bounds();
    const h = b.max[1] - b.min[1], w = b.max[0] - b.min[0];
    const cy = (b.max[1] + b.min[1]) / 2;
    return { body, detail: sum(ctx, [
      disc(ctx, -w * .12, cy + h * .13, w * .027), disc(ctx, w * .12, cy + h * .13, w * .027),
      disc(ctx, 0, cy - h * .04, w * .04), disc(ctx, 0, cy - h * .16, w * .04),
      disc(ctx, 0, cy - h * .27, w * .04),
    ]) };
  }
  // If the icon contains voids, these can become impressed areas.
  const voids = body.subtract(original);
  return { body, detail: voids };
}

function moveToSize(ctx: Ctx, section: CrossSection, p: Params, dx: number, dy: number, scaleBy: number): CrossSection {
  let q = section.translate([dx, dy]).scale([scaleBy * p.aspect, scaleBy]);
  if (p.mirror) q = q.scale([-1, 1]);
  return q.rotate(p.rotation);
}

export async function makeDesign(ctx: Ctx, p: Params, notes: Diagnostic[]): Promise<Design> {
  let body: CrossSection = empty(ctx);
  let ink: CrossSection = empty(ctx);
  if (p.source === 'ready') {
    const data = await ready(ctx, p, notes);
    body = data.body;
    ink = data.detail;
  } else if (p.source === 'text') {
    const text = p.shapeText.trim() || 'COOKIE';
    const laid = await layoutText(p.shapeFont, text, { capHeight: 80, align: 'center', tolerance: .08 }, ctx.inputs);
    if (laid.missing.length) notes.push({ level: 'warning', message: 'Some characters have no outlines in the selected font.' });
    body = ctx.cs(laid.contours, 'NonZero');
    ink = empty(ctx);
    // Keep the original glyph outlines here. A stencil needs intact counters in
    // O/A/B, while individual letters in a cutter are joined locally after sizing.
    // A full-width strip here made every text-shaped object look struck through.
  } else if (p.source === 'svg') {
    const svg = ctx.inputs.cookieSvg;
    if (typeof svg === 'string' && svg.trim()) {
      const doc = parseSvg(svg, 0.18);
      body = sum(ctx, doc.shapes.map(sh => ctx.cs(sh.contours, sh.fillRule === 'evenodd' ? 'EvenOdd' : 'NonZero')));
      ink = filled(ctx, body).subtract(body);
    } else notes.push({ level: 'warning', message: 'Choose an SVG graphic in the SVG graphic panel to make this shape.' });
  } else {
    const pic = ctx.inputs.image as CookieImage | undefined;
    if (pic?.silhouette?.length || pic?.regions?.length) {
      const silhouette = pic.silhouette?.length ? pic.silhouette : pic.regions.flatMap(x => x.contours);
      body = ctx.cs(silhouette, 'NonZero');
      ink = sum(ctx, pic.regions.map(r => ctx.cs(r.contours, 'EvenOdd')));
    } else notes.push({ level: 'warning', message: 'Choose a picture in the Picture panel to make the cutter.' });
  }
  if (body.isEmpty()) {
    body = disc(ctx, 0, 0, 40);
    ink = empty(ctx);
  }
  // The stencil must retain enclosed counters (O, B, A...), so they can become
  // islands that receive local support bridges. Cutters still need solid outlines.
  const stencil = p.product === 'stencil';
  body = stencil ? body : filled(ctx, body);
  const box = body.bounds(), w = box.max[0] - box.min[0], h = box.max[1] - box.min[1];
  // Transform at native size first, then exactly fit the requested longest dimension.
  const dx = -(box.min[0] + box.max[0]) / 2, dy = -(box.min[1] + box.max[1]) / 2;
  const transformed = moveToSize(ctx, body, p, dx, dy, 1);
  const b = transformed.bounds();
  const factor = p.size / Math.max(.01, b.max[0] - b.min[0], b.max[1] - b.min[1]);
  body = transformed.scale([factor, factor]);
  ink = moveToSize(ctx, ink, p, dx, dy, factor);
  if (p.corner > .02) {
    const r = Math.min(p.corner, Math.min(w, h) * factor * .1);
    const smoothed = body.offset(-r, 'Round', 2, 32).offset(r, 'Round', 2, 32);
    if (!smoothed.isEmpty()) body = smoothed;
  }
  const b2 = body.bounds();
  const k = p.size / Math.max(.01, b2.max[0] - b2.min[0], b2.max[1] - b2.min[1]);
  body = body.scale([k, k]);
  ink = ink.scale([k, k]);
  // Cutters use the outside silhouette; stencils retain every text counter and
  // do not need to join neighbouring glyphs (the frame already holds them).
  const components = (stencil ? body : filled(ctx, body)).decompose().filter(s => s.area() > .8);
  let cut = sum(ctx, components);
  if (p.product === 'cutter' && components.length > 1 && !(p.source === 'svg' && p.separateParts)) {
    const joined = connectRegions(ctx, components, 2.8);
    cut = joined.section;
    if (joined.connections) notes.push({
      level: 'info',
      message: 'Joined separate outlines with ' + joined.connections +
        ' short local bridge(s), not a line across the word.',
    });
  }
  if (ink.isEmpty()) {
    const inset = Math.min(p.size * .11, 7);
    ink = cut.offset(-inset, 'Round', 2, 24).subtract(cut.offset(-inset - 1.6, 'Round', 2, 24));
  }
  ink = ink.intersect(cut.offset(-1.5, 'Round', 2, 16));
  return { cut, ink, shapes: components };
}

/** A separate text mark is automatically fitted inside the cookie. */
export async function makeTextMark(ctx: Ctx, p: Params, shape: CrossSection, notes: Diagnostic[]): Promise<CrossSection> {
  const value = p.stampText.trim().slice(0, 90);
  if (!value) return empty(ctx);
  const lay = await layoutText(p.stampFont, value, { capHeight: 11, align: 'center', lineHeight: 1.1, tolerance: .08 }, ctx.inputs);
  if (lay.missing.length) notes.push({ level: 'warning', message: 'Some imprint text characters were unavailable in that font.' });
  if (!lay.contours.length) return empty(ctx);
  let mark = ctx.cs(lay.contours, 'NonZero');
  const b = mark.bounds(), dest = shape.bounds();
  const maxW = Math.max(5, (dest.max[0] - dest.min[0]) * .72);
  const maxH = Math.max(5, (dest.max[1] - dest.min[1]) * .23);
  const k = Math.min(maxW / Math.max(.1, b.max[0] - b.min[0]), maxH / Math.max(.1, b.max[1] - b.min[1]));
  mark = mark.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]).scale([k, k]);
  return mark.translate([(dest.max[0] + dest.min[0]) / 2, (dest.max[1] + dest.min[1]) / 2 - (dest.max[1] - dest.min[1]) * .13])
    .intersect(shape.offset(-2, 'Round', 2, 16));
}
