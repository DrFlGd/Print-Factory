/**
 * Photo frames that stand on a desk: three sheets glued into one frame, two ribs that lean it
 * back. The front (light) has the window and the decorations cut through it to the dark middle;
 * the middle has a pocket that runs up through the top edge, so the print drops in from above
 * and sits on the bottom rail; the back has a finger notch to push the print out, and two slots
 * low down for the ribs' tabs. Two frames: hearts (three big ones breaking the outline and a
 * cascade down one side) and icons (six round the window, from a theme), each with a name in the
 * bottom band.
 *
 * Frame coordinates: x across, y up, the bottom edge (the one it stands on) on y = 0.
 */
import type { Diagnostic } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { heart, rect, rotate, roundedRect, translate } from '@pf/shapes';
import type { DesignOut, P, PieceOut } from './kit';
import { centred, marksFor, one, union } from './kit';
import type { Ctx } from './lib';
import { fit, lettering, noMarks, region, solid, symbolRegion } from './lib';

const D = Math.PI / 180;
/** The print overlaps the window by this much all round. */
const OV = 6;
/** Room round the print in its pocket. */
const C = 1.5;
/** How far a decoration keeps off the pocket. */
const GAP = 1.5;
/** Front left round a decoration that breaks the outline. */
const RIM = 4;
/** How far the stack leans back. */
const LEAN = 20;

export const PHOTO_SIZES: Record<string, [number, number]> = {
  '4x6': [101.6, 152.4],
  '5x7': [127, 177.8],
  '3.5x5': [88.9, 127],
  '4x4': [101.6, 101.6],
};

export const ICON_THEMES: Record<string, string[]> = {
  love: ['tabler:heart', 'tabler:star', 'tabler:flower', 'tabler:heart', 'tabler:sun', 'tabler:gift'],
  dad: ['tabler:car', 'tabler:trophy', 'tabler:golf', 'tabler:beer', 'tabler:barbell', 'tabler:key'],
  pet: ['tabler:paw', 'tabler:bone', 'tabler:fish-bone', 'tabler:heart', 'tabler:paw', 'tabler:bone'],
  baby: ['tabler:baby-carriage', 'tabler:star', 'tabler:moon', 'tabler:balloon', 'tabler:heart', 'tabler:cloud'],
  sports: ['tabler:trophy', 'tabler:bike', 'tabler:golf', 'tabler:barbell', 'tabler:star', 'tabler:trophy'],
};

interface Frame {
  W: number;
  H: number;
  t: number;
  /** The window's box. */
  win: { x0: number; x1: number; y0: number; y1: number };
  pocket: CrossSection;
  /** Where nothing may be cut through the front. */
  keepOut: CrossSection;
  /** The bottom band, for the name. */
  band: { y0: number; y1: number };
  /** The top border, for a line there. */
  topBand: { y0: number; y1: number };
}

function frameOf(ctx: Ctx, p: P): Frame {
  const [a, b] = PHOTO_SIZES[p.photoSize] ?? PHOTO_SIZES['4x6']!;
  const [pw, ph] = p.orientation === 'landscape' ? [Math.max(a, b), Math.min(a, b)] : [Math.min(a, b), Math.max(a, b)];
  const bord = Math.max(18, p.frameBorder);
  const bb = bord * 1.4;
  const ww = pw - 2 * OV;
  const wh = ph - 2 * OV;
  const W = ww + 2 * bord;
  const H = wh + bord + bb;
  const t = Math.max(1, p.thickness);
  const pocketBottom = bb - OV - C;
  const pocket = ctx.cs([rect(pw + 2 * C, H)]).translate([0, pocketBottom + H / 2]);
  return { W, H, t, win: { x0: -ww / 2, x1: ww / 2, y0: bb, y1: bb + wh }, pocket, keepOut: pocket.offset(GAP, 'Miter', 2, 0), band: { y0: 0, y1: pocketBottom }, topBand: { y0: bb + wh, y1: H } };
}

/** Push a shape out from `at` along `dir` until it (grown by GAP) clears the keep-out. */
function pushOut(ctx: Ctx, shape: CrossSection, at: [number, number], dir: [number, number], keepOut: CrossSection): CrossSection {
  const n = Math.hypot(dir[0], dir[1]) || 1;
  const [dx, dy] = [dir[0] / n, dir[1] / n];
  for (let s = 0; s < 200; s += 0.5) {
    const placed = shape.translate([at[0] + dx * s, at[1] + dy * s]);
    if (placed.offset(GAP, 'Round', 2, 16).intersect(keepOut).isEmpty()) return placed;
  }
  return shape.translate([at[0] + dx * 100, at[1] + dy * 100]);
}

/** The three sheets and two ribs, given the decorations cut through the front and the front's marks. */
function pieces(ctx: Ctx, f: Frame, decor: CrossSection | null, frontInk: CrossSection | null, middleInk: CrossSection | null, op: P['op']): PieceOut[] {
  const { W, H, t } = f;
  const base = ctx.cs([roundedRect(W, H, 3)]).translate([0, H / 2]);
  const outline = decor ? base.add(decor.offset(RIM, 'Round', 2, 24)) : base;
  const window = ctx.cs([roundedRect(f.win.x1 - f.win.x0, f.win.y1 - f.win.y0, 1.5)]).translate([0, (f.win.y0 + f.win.y1) / 2]);
  let front = outline.subtract(window);
  if (decor) front = front.subtract(decor);
  const middle = outline.subtract(f.pocket);
  // The ribs: a triangle behind the back, its edge on the back's face, a tab through a slot low down.
  const th = LEAN * D;
  const [s, c] = [Math.sin(th), Math.cos(th)];
  const at = (v: number, w: number): [number, number] => [v * s + w * c, v * c - w * s + 3 * t * s];
  const A = at(0, 3 * t);
  const a = 0.45 * H;
  const B = at(a, 3 * t);
  const depth = Math.max(45, 0.4 * H);
  const Cp: [number, number] = [A[0] + depth, A[1]];
  const v1 = 4;
  const v2 = Math.max(v1 + 6, Math.min(v1 + 14, f.band.y1 - 4));
  const tab = [at(v1, 3 * t + 0.5), at(v2, 3 * t + 0.5), at(v2, 2 * t + 0.05), at(v1, 2 * t + 0.05)];
  const rib = ctx.cs([[...A, ...Cp, ...B]]).add(ctx.cs([tab.flat()]));
  // Keep the rib off the table below Z = 0 (the tab is above it).
  const ribCs = rib.intersect(ctx.cs([rect(depth * 4, a * 2)]).translate([A[0] + depth, a]));
  const xr = W * 0.3;
  let back = outline.subtract(ctx.cs([roundedRect(28, 24, 12)]).translate([0, H]));
  for (const x of [-xr, xr]) back = back.subtract(ctx.cs([rect(t + 0.2, v2 - v1 + 0.2)]).translate([x, (v1 + v2) / 2]));
  // Each sheet leans back as part of the stack: its front face `w0` back from the front's.
  const sheet = (w0: number) => ({ at: [0, (w0 + t) * c, 0] as [number, number, number], pose: { rx: 90 - LEAN, z: (2 * t - w0) * s } });
  return [
    { ...one('Front', front, marksFor(ctx, frontInk, op === 'cut' ? 'engrave' : op)), ...sheet(0), sheet: 1 },
    { ...one('Middle', middle, middleInk ? marksFor(ctx, middleInk, 'engrave') : noMarks()), ...sheet(t), sheet: 0 },
    { ...one('Back', back), ...sheet(2 * t), sheet: 0 },
    { ...one('Rib', ribCs), at: [-xr - t / 2, 0, 0], pose: { rx: 90, rz: 90, z: 0 }, sheet: 0 },
    { ...one('Rib', ribCs), at: [xr - t / 2, 0, 0], pose: { rx: 90, rz: 90, z: 0 }, sheet: 0 },
  ];
}

/** The name (and a line under it) in the bottom band. */
async function bandText(ctx: Ctx, p: P, f: Frame, notes: Diagnostic[]): Promise<CrossSection | null> {
  const w = f.win.x1 - f.win.x0 + 8;
  const h = f.band.y1 - f.band.y0 - 3;
  const name = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
  const msg = await lettering(ctx, p.font2, p.text2, p.size2);
  const nf = name ? fit(ctx, name, w, h * (msg ? 0.62 : 0.8)) : null;
  const mf = msg ? fit(ctx, msg, w, h * 0.28) : null;
  if (name && nf && nf.b.height < name.b.height * 0.97) notes.push({ level: 'info', message: 'The name was made smaller to fit the band.' });
  const gap = 1.5;
  const total = (nf?.b.height ?? 0) + (mf?.b.height ?? 0) + (nf && mf ? gap : 0);
  let y = (f.band.y0 + f.band.y1) / 2 + total / 2 + 1;
  const out: CrossSection[] = [];
  if (nf) {
    out.push(centred(nf, 0, y - nf.b.height / 2));
    y -= nf.b.height + gap;
  }
  if (mf) out.push(centred(mf, 0, y - mf.b.height / 2));
  return union(ctx, out);
}

async function heartFrame(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const f = frameOf(ctx, p);
  const short = Math.min(f.W, f.H);
  const { win } = f;
  const hs: CrossSection[] = [];
  const big: [number, [number, number], [number, number], number][] = [
    [0.25, [win.x0, win.y1], [-1, 0.8], 14],
    [0.3, [win.x0, win.y0 + (win.y1 - win.y0) * 0.42], [-1, 0], 10],
    [0.23, [win.x1, win.y1], [1, 0.8], -14],
  ];
  for (const [k, at, dir, tilt] of big) hs.push(pushOut(ctx, ctx.cs(rotate([heart(short * k)], tilt)), at, dir, f.keepOut));
  // A cascade of small hearts down the right border, inside the outline.
  const x0 = f.pocket.bounds().max[0] + GAP;
  const x1 = f.W / 2 - RIM;
  const sw = x1 - x0;
  if (sw >= 5) {
    let y = win.y0 + (win.y1 - win.y0) * 0.72;
    for (let i = 0; i < 6 && y > f.band.y1 + 4; i++) {
      const size = Math.min(sw * 0.9, 12) * (1 - i * 0.1);
      const x = (x0 + x1) / 2 + (i % 2 ? -1 : 1) * (sw - size * 0.95) * 0.3;
      const h = ctx.cs(translate(rotate([heart(size)], (i % 2 ? 12 : -12)), x, y));
      if (h.offset(GAP).intersect(f.keepOut).isEmpty()) hs.push(h);
      y -= size * 1.05 + 2;
    }
  }
  const decor = ctx.CrossSection.union(hs);
  const ink = await bandText(ctx, p, f, notes);
  notes.push({ level: 'info', message: 'Glue front, middle and back together, push the ribs’ tabs into the back, and drop the photo in from the top.' });
  return { pieces: pieces(ctx, f, decor, ink, null, p.op), notes };
}

async function iconFrame(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const f = frameOf(ctx, p);
  const short = Math.min(f.W, f.H);
  const { win } = f;
  const ids = ICON_THEMES[p.iconTheme] ?? ICON_THEMES.love!;
  const spots: [[number, number], [number, number]][] = [
    [[win.x0, win.y1], [-1, 1]],
    [[win.x1, win.y1], [1, 1]],
    [[win.x0, (win.y0 + win.y1) / 2], [-1, 0]],
    [[win.x1, (win.y0 + win.y1) / 2], [1, 0]],
    [[win.x0, win.y0], [-1, -0.4]],
    [[win.x1, win.y0], [1, -0.4]],
  ];
  const pockets: CrossSection[] = [];
  const counters: CrossSection[] = [];
  for (let i = 0; i < spots.length; i++) {
    const s = await symbolRegion(ctx, ids[i % ids.length]!, short * 0.2);
    if (!s) continue;
    const full = solid(ctx, s);
    const b = region(ctx, full).b;
    const centredFull = full.translate([-b.cx, -b.cy]);
    const placed = pushOut(ctx, centredFull, spots[i]![0], spots[i]![1], f.keepOut);
    const pb = placed.bounds();
    const shift: [number, number] = [pb.min[0] - centredFull.bounds().min[0], pb.min[1] - centredFull.bounds().min[1]];
    pockets.push(placed);
    // The icon's own counters, engraved on the middle where the pocket shows it.
    const inner = full.subtract(s);
    if (!inner.isEmpty()) counters.push(inner.translate([-b.cx + shift[0], -b.cy + shift[1]]));
  }
  const decor = pockets.length ? ctx.CrossSection.union(pockets) : null;
  const ink: (CrossSection | null)[] = [await bandText(ctx, p, f, notes)];
  notes.push({ level: 'info', message: 'Glue front, middle and back together, push the ribs’ tabs into the back, and drop the photo in from the top.' });
  return { pieces: pieces(ctx, f, decor, union(ctx, ink), counters.length ? ctx.CrossSection.union(counters) : null, p.op), notes };
}

export const FRAME_DESIGNS: Record<string, (ctx: Ctx, p: P) => Promise<DesignOut>> = {
  'photo-frame-hearts': heartFrame,
  'photo-frame-icons': iconFrame,
};
