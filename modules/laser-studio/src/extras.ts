/**
 * Tags and signs with pictures of their own: the pet feeding sign (a name over "food · water"
 * with a dish either side, and screw holes or a keyhole to hang it), the snowflake gift tag (a
 * flake on the bottom edge, cut out of the tag above it and hanging off as wood below) and the
 * sports bag tags (a ball from the dark sheet with its markings, a light frame over it with the
 * name and number welded in).
 */
import type { Contour, Diagnostic } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { circle, clipPolylines, poleOf, rect, regularPolygon, roundedRect, teardrop, translate } from '@pf/shapes';
import type { DesignOut, P, PieceOut } from './kit';
import { centred, fitInside, marginWarning, marksFor, one, tagBlank, union, writable } from './kit';
import type { Ctx, Marks } from './lib';
import { fit, lettering, noMarks, outlineOf } from './lib';

const markOp = (p: P) => (p.op === 'cut' ? 'engrave' : p.op);
const D = Math.PI / 180;

/** Thick strokes along polylines, with round ends. */
export function strokes(ctx: Ctx, lines: Contour[], w: number): CrossSection | null {
  const out: Contour[] = [];
  for (const l of lines)
    for (let i = 0; i + 3 < l.length; i += 2) {
      const [x0, y0, x1, y1] = [l[i]!, l[i + 1]!, l[i + 2]!, l[i + 3]!];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 1e-6) continue;
      const nx = (-(y1 - y0) / len) * (w / 2);
      const ny = ((x1 - x0) / len) * (w / 2);
      out.push([x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 - nx, y1 - ny, x1 + nx, y1 + ny]);
      out.push(translate([circle(w / 2, 16)], x1, y1)[0]!);
      if (i === 0) out.push(translate([circle(w / 2, 16)], x0, y0)[0]!);
    }
  return out.length ? ctx.cs(out, 'NonZero') : null;
}

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 48): Contour => {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * D;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return out;
};

/* ---------------------------------------------------------------- pet feeding sign */

/** A bowl `w` wide, its rim on y = 0. */
function bowl(w: number): Contour[] {
  const lower: number[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI + (Math.PI * i) / 24;
    lower.push((w / 2) * Math.cos(a), w * 0.36 * Math.sin(a));
  }
  return [lower, translate([roundedRect(w * 1.1, w * 0.12, w * 0.05)], 0, w * 0.02)[0]!];
}

function dish(ctx: Ctx, kind: 'food' | 'water', s: number): CrossSection {
  const parts: Contour[] = bowl(s);
  if (kind === 'food') for (const [x, y, r] of [[-0.22, 0.14, 0.11], [0.02, 0.17, 0.12], [0.24, 0.13, 0.1], [-0.08, 0.3, 0.1], [0.14, 0.31, 0.09]] as const) parts.push(translate([circle(r * s, 24)], x * s, y * s)[0]!);
  else parts.push(translate([teardrop(s * 0.17, s * 0.42)], 0, s * 0.3)[0]!);
  return ctx.cs(parts, 'NonZero');
}

async function petFeedingSign(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  let body = tagBlank(ctx, p);
  const b = body.bounds();
  const W = b.max[0] - b.min[0];
  const H = b.max[1] - b.min[1];
  const d = Math.max(3, p.holeDiameter);
  // The holes go where the outline has the most wood round them, not by the box's corners.
  const holes: CrossSection[] = [];
  const poleIn = (x0: number, x1: number, y0: number, y1: number) => poleOf(ctx.contours(body.intersect(ctx.cs([rect(x1 - x0, y1 - y0)]).translate([(x0 + x1) / 2, (y0 + y1) / 2]))), 0.2);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  if (p.mounting === 'two' || p.mounting === 'four') {
    const rows = p.mounting === 'two' ? [[cy - H, cy + H]] : [[cy, cy + H], [cy - H, cy]];
    for (const [y0, y1] of rows)
      for (const [x0, x1] of [
        [b.min[0], b.min[0] + W * 0.22],
        [b.max[0] - W * 0.22, b.max[0]],
      ]) {
        const q = poleIn(x0!, x1!, y0!, y1!);
        holes.push(ctx.cs([circle(d / 2, 48)]).translate([q.x, q.y]));
      }
  } else if (p.mounting === 'keyhole') {
    // A round head for the screw, a narrow slot up for its shank.
    const y = b.max[1] - Math.max(10, H * 0.14);
    const top = poleIn(cx - W * 0.1, cx + W * 0.1, cy, b.max[1]);
    const ky = Math.min(y, top.y);
    holes.push(ctx.cs([circle(d, 48)]).translate([cx, ky - d]).add(ctx.cs([roundedRect(d * 0.95, d * 2.2, d * 0.47)]).translate([cx, ky + 0.1 * d])));
  }
  for (const h of holes) body = body.subtract(h);
  const holeCs = holes.length ? ctx.CrossSection.union(holes) : null;
  const area = writable(ctx, body, holeCs, p.margin);
  if (area.isEmpty()) return { pieces: [one('Sign', body)], notes };
  const ab = area.bounds();
  const split = ab.min[1] + (ab.max[1] - ab.min[1]) * 0.36;
  const ink: (CrossSection | null)[] = [];
  const name = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  if (name) {
    const upper = area.intersect(ctx.cs([rect(W * 2, H)]).translate([cx, split + H / 2 + 1]));
    ink.push(fitInside(ctx, name, upper, 0.86).cs);
  } else marginWarning(notes, "your pet's name");
  const cap = await lettering(ctx, p.font2, p.text2, p.size2);
  const lower = area.intersect(ctx.cs([rect(W * 2, H)]).translate([cx, split - H / 2 - 1]));
  if (cap && !lower.isEmpty()) {
    const lb = lower.bounds();
    const lh = lb.max[1] - lb.min[1];
    const s = Math.min(lh * 0.75, W * 0.12);
    const capF = fit(ctx, cap, Math.max(10, (lb.max[0] - lb.min[0]) - 2 * s - 8), lh * 0.6);
    const y = (lb.min[1] + lb.max[1]) / 2;
    ink.push(centred(capF, cx, y));
    const off = capF.b.width / 2 + 3 + s * 0.55;
    ink.push(dish(ctx, 'food', s).translate([cx - off, y - s * 0.12]), dish(ctx, 'water', s).translate([cx + off, y - s * 0.12]));
  }
  return { pieces: [one('Sign', body, marksFor(ctx, union(ctx, ink), markOp(p)))], notes };
}

/* ---------------------------------------------------------------- snowflake gift tag */

/** One arm of a flake, along +Y from the hub out to `R`: the spine, its V branches and a tip. */
function armLines(R: number, hub: number, design: number): Contour[] {
  const designs: [number, number][][] = [
    [
      [0.6, 0.24],
      [0.8, 0.15],
    ],
    [[0.62, 0.3]],
    [
      [0.62, 0.18],
      [0.76, 0.18],
      [0.88, 0.1],
    ],
    [
      [0.66, 0.27],
      [0.84, 0.12],
    ],
  ];
  const out: Contour[] = [[0, hub * 0.9, 0, R * 0.94]];
  for (const [s, L] of designs[design % designs.length]!) {
    const y = s * R;
    for (const side of [-1, 1]) out.push([0, y, side * L * R * Math.sin(60 * D), y + L * R * Math.cos(60 * D)]);
  }
  // A diamond on the tip.
  const t = R * 0.07;
  out.push([0, R - 2 * t, t, R - t, 0, R, -t, R - t, 0, R - 2 * t]);
  return out;
}

const turn = (cs: Contour[], deg: number) => cs.map((c) => {
  const a = deg * D;
  const [co, si] = [Math.cos(a), Math.sin(a)];
  const o: number[] = [];
  for (let i = 0; i < c.length; i += 2) o.push(c[i]! * co - c[i + 1]! * si, c[i]! * si + c[i + 1]! * co);
  return o;
});

async function snowflakeGiftTag(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const W = p.tagWidth;
  const H = Math.max(p.tagHeight, W * 1.1);
  const scoop = W * 0.19;
  let tag = ctx.cs([rect(W, H)]);
  for (const x of [-W / 2, W / 2]) tag = tag.subtract(ctx.cs([circle(scoop, 64)]).translate([x, H / 2]));
  const R = (0.95 * W) / 2;
  const hubR = R * 0.24;
  const yc = -H / 2;
  const design = (Math.max(1, Math.round(p.flake)) - 1) % 4;
  // The hub: a hexagon with six windows round a small one in the middle.
  const hub = ctx.cs([regularPolygon(6, hubR, 90)]).translate([0, yc]);
  const windows: Contour[] = [translate([regularPolygon(6, hubR * 0.22, 90)], 0, yc)[0]!];
  for (let k = 0; k < 6; k++) {
    // Between the arms, which leave the hub at 30° + k·60°.
    const a = 60 * k * D;
    windows.push(translate([regularPolygon(3, hubR * 0.26, 60 * k + 180)], hubR * 0.6 * Math.cos(a), yc + hubR * 0.6 * Math.sin(a))[0]!);
  }
  const win = ctx.cs(windows, 'NonZero');
  const above: Contour[] = [];
  const below: Contour[] = [];
  for (let k = 0; k < 6; k++) {
    const deg = 60 * k; // 0 = up
    const arm = translate(turn(armLines(R, hubR, design), -deg), 0, yc);
    (k === 0 || k === 1 || k === 5 ? above : below).push(...arm);
  }
  const cutouts = strokes(ctx, above, 2.6)!.subtract(hub.offset(-1.2, 'Round', 2, 16));
  const wood = strokes(ctx, below, 1.7)!;
  let body = tag.subtract(cutouts).add(hub).add(wood).subtract(win);
  // Round every corner a little.
  body = body.offset(-0.5, 'Round', 2, 16).offset(0.5, 'Round', 2, 16);
  // The ribbon hole, on the centre line near the top.
  const d = Math.max(3, p.holeDiameter);
  const hy = H / 2 - d / 2 - 3.5;
  const hole = ctx.cs([circle(d / 2, 48)]).translate([0, hy]);
  body = body.subtract(hole);
  const pieces: PieceOut[] = [];
  const name = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  let marks: Marks = noMarks();
  if (name) {
    const flakeTop = yc + R + 2.5;
    const area = writable(ctx, tag, hole, p.margin).subtract(cutouts.offset(2.5, 'Round', 2, 16)).intersect(ctx.cs([rect(W, H)]).translate([0, flakeTop + H / 2]));
    marks = marksFor(ctx, fitInside(ctx, name, area, 0.88).cs, markOp(p));
  }
  if (body.decompose().length > 1) notes.push({ level: 'warning', message: 'Part of the flake stands apart from the tag. Make the tag wider.' });
  pieces.push(one('Tag', body, marks));
  return { pieces, notes };
}

/* ---------------------------------------------------------------- sports bag tags */

type Ball = 'basketball' | 'baseball' | 'soccer' | 'football';

function ballShape(ctx: Ctx, ball: Ball, Dm: number): CrossSection {
  if (ball !== 'football') return ctx.cs([circle(Dm / 2, 160)]);
  // A lens: two circular arcs meeting in points at the ends.
  const h = Dm * 0.69;
  const r = (Dm * Dm) / 4 / h + h / 4;
  return ctx
    .cs([circle(r, 240)])
    .translate([0, -(r - h / 2)])
    .intersect(ctx.cs([circle(r, 240)]).translate([0, r - h / 2]));
}

function ballMarks(ctx: Ctx, ball: Ball, Dm: number, shape: CrossSection): Marks {
  const R = Dm / 2;
  const area = ctx.contours(shape.offset(-1.2, 'Round', 2, 24));
  const clip = (ls: Contour[]) => clipPolylines(ls, area);
  const m = noMarks();
  if (ball === 'basketball') {
    const ls = clip([[0, -R, 0, R], [-R, 0, R, 0], arc(-R * 1.3, 0, R * 0.95, -60, 60), arc(R * 1.3, 0, R * 0.95, 120, 240)]);
    m.engrave = strokes(ctx, ls, Math.max(1, Dm * 0.016));
  } else if (ball === 'baseball') {
    const seams = [arc(-R * 1.18, 0, R * 0.82, -62, 62), arc(R * 1.18, 0, R * 0.82, 118, 242)];
    const ticks: Contour[] = [];
    for (const [cx, a0, a1, side] of [[-R * 1.18, -55, 55, 1], [R * 1.18, 125, 235, -1]] as const)
      for (let i = 0; i <= 10; i++) {
        const a = (a0 + ((a1 - a0) * i) / 10) * D;
        const r = R * 0.82;
        const [x, y] = [cx + r * Math.cos(a), r * Math.sin(a)];
        const [nx, ny] = [Math.cos(a), Math.sin(a)];
        const [tx, ty] = [-ny, nx];
        const k = R * 0.06;
        for (const s of [-1, 1]) ticks.push([x + s * nx * k * 0.2, y + s * ny * k * 0.2, x + s * nx * k + tx * k * 0.6 * side, y + s * ny * k + ty * k * 0.6 * side]);
      }
    m.engrave = strokes(ctx, clip([...seams, ...ticks]), Math.max(0.8, Dm * 0.011));
  } else if (ball === 'soccer') {
    const panels: Contour[] = [regularPolygon(5, R * 0.27, 90)];
    for (let k = 0; k < 5; k++) {
      const a = (90 + 36 + 72 * k) * D;
      panels.push(translate([regularPolygon(5, R * 0.27, 90 + 36 + 72 * k + 180)], R * 0.8 * Math.cos(a), R * 0.8 * Math.sin(a))[0]!);
    }
    m.engrave = ctx.cs(panels, 'NonZero').intersect(shape.offset(-1.2, 'Round', 2, 24));
    // The seams between: from each corner of the middle panel to the panel beyond it.
    const seams: Contour[] = [];
    for (let k = 0; k < 5; k++) {
      const a = (90 + 72 * k) * D;
      seams.push([R * 0.27 * Math.cos(a), R * 0.27 * Math.sin(a), R * 0.62 * Math.cos(a), R * 0.62 * Math.sin(a)]);
    }
    m.score = clip(seams);
  } else {
    // A football: the laces along the top seam, a stripe near each end.
    const h = Dm * 0.69;
    const ls: Contour[] = [[-R * 0.32, h * 0.18, R * 0.32, h * 0.18]];
    for (let i = 0; i < 7; i++) {
      const x = -R * 0.27 + (R * 0.54 * i) / 6;
      ls.push([x, h * 0.18 - h * 0.07, x, h * 0.18 + h * 0.07]);
    }
    for (const s of [-1, 1]) {
      ls.push(arc(s * R * 1.2, 0, R * 0.62, s > 0 ? 140 : -40, s > 0 ? 220 : 40));
      ls.push(arc(s * R * 1.28, 0, R * 0.62, s > 0 ? 140 : -40, s > 0 ? 220 : 40));
    }
    m.score = clip(ls);
  }
  return m;
}

function sportsTag(ball: Ball) {
  return async (ctx: Ctx, p: P): Promise<DesignOut> => {
    const notes: Diagnostic[] = [];
    const Dm = p.diameter;
    const shape = ballShape(ctx, ball, Dm);
    const d = Math.max(2.5, p.holeDiameter);
    const rim = Math.max(ball === 'football' ? 4 : Dm * 0.082, d + 4);
    const window = shape.offset(-rim, 'Round', 2, 64);
    const ring = shape.subtract(window);
    const wb = window.bounds();
    const top = shape.bounds().max[1];
    const hole = ctx.cs([circle(d / 2, 48)]).translate([0, top - rim / 2]);
    const backer = shape.subtract(hole);
    const winW = wb.max[0] - wb.min[0];
    const winH = wb.max[1] - wb.min[1];
    const bite = Math.max(1, Math.min(4, rim * 0.45));
    // The name across the window, reaching into the rim at both ends; the number under it,
    // reaching into the rim at the bottom. All one piece with the frame.
    const ink: CrossSection[] = [];
    const name = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
    if (name) {
      const nameY = winH * 0.08;
      const across = window.intersect(ctx.cs([rect(Dm * 2, 0.2)]).translate([0, nameY])).bounds();
      const reach = across.max[0] - across.min[0] + 2 * bite;
      const f = fit(ctx, name, reach, winH * 0.34);
      // Stretch up to the rim when the name is shorter than the window is wide.
      const k = Math.min(reach / f.b.width, (winH * 0.34) / f.b.height);
      const placed = f.cs.translate([-f.b.cx, -f.b.cy]).scale([k, k]).translate([0, nameY]);
      ink.push(placed.offset(Math.max(0.2, p.weight), 'Round', 2, 16));
    }
    const num = await lettering(ctx, p.font2, p.text2, p.size2);
    if (num) {
      const nh = winH * 0.24 + bite;
      const f = fit(ctx, num, winW * 0.5, nh);
      ink.push(f.cs.translate([-f.b.cx, wb.min[1] - bite - f.b.minY]));
    }
    const frameAll = union(ctx, [ring, ...ink])!.subtract(hole).intersect(shape);
    // What did not reach the rim is its own light piece, glued in the window over a scored guide.
    const islands = frameAll.decompose().sort((a, b) => b.area() - a.area());
    const frame = islands[0]!;
    const loose = islands.slice(1).filter((q) => q.area() > 1);
    const ballM = ballMarks(ctx, ball, Dm, shape);
    // Score each letter's edge where it crosses the rim, so the name reads on the frame.
    const fm = noMarks();
    for (const l of ink) fm.score.push(...clipPolylines(outlineOf(ctx, l), ctx.contours(ring.offset(-0.3, 'Round', 2, 16))));
    if (!name) marginWarning(notes, 'a name');
    const pieces: PieceOut[] = [
      { ...one('Ball', backer, ballM), sheet: 0 },
      { ...one('Frame', frame, fm), at: [0, 0, 1], sheet: 1 },
    ];
    if (loose.length) {
      const piece = ctx.CrossSection.union(loose);
      ballM.score.push(...outlineOf(ctx, piece.offset(-0.6, 'Round', 2, 16)));
      pieces.push({ ...one('Lettering', piece), at: [0, 0, 1], sheet: 1 });
      notes.push({ level: 'info', message: 'Part of the lettering does not reach the frame: it is cut as its own piece, to glue inside the scored line.' });
    }
    return { pieces, notes };
  };
}

export const EXTRA_DESIGNS: Record<string, (ctx: Ctx, p: P) => Promise<DesignOut>> = {
  'pet-feeding-sign': petFeedingSign,
  'snowflake-gift-tag': snowflakeGiftTag,
  'basketball-tag': sportsTag('basketball'),
  'baseball-tag': sportsTag('baseball'),
  'soccer-tag': sportsTag('soccer'),
  'football-tag': sportsTag('football'),
};
