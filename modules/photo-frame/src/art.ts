/**
 * Everything printed in the second colour: the words, the initials in a crest, a music player
 * under a song's cover, and a post's header and footer. Front view, mm.
 */
import type { Diagnostic } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { circle, rect, roundedRect } from '@pf/shapes';
import { symbolShapes } from '@pf/symbols';
import { text as layoutText } from '@pf/text';
import type { Box } from './outline';
import { box, bw } from './outline';
import type { Ctx } from './types';

/** The least capital height that prints with a 0.4 mm nozzle, mm. */
export const FLOOR = 2.6;

/** A line of text with its capitals `cap` tall, baseline at y = 0, centred on x = 0. */
export async function textLine(ctx: Ctx, font: string, value: string, cap: number, notes?: Diagnostic[]): Promise<{ cs: CrossSection; w: number } | null> {
  const v = value.replace(/\s+/g, ' ').trim();
  if (!v) return null;
  const t = await layoutText(font, v, { capHeight: cap, align: 'left', tolerance: 0.01 }, ctx.inputs);
  if (t.missing.length && notes) notes.push({ level: 'warning', message: `No bundled font has ${t.missing.map((c) => `“${c}”`).join(' ')}; left out.` });
  if (!t.contours.length) return null;
  const w = t.bounds.maxX - t.bounds.minX;
  return { cs: ctx.cs(t.contours, 'NonZero').translate([-t.bounds.minX - w / 2, 0]), w };
}

/** A line scaled to at most `maxW` wide (never under the floor), placed with its centre/left/right at x and baseline at y. */
export async function placeLine(ctx: Ctx, font: string, value: string, cap: number, maxW: number, x: number, y: number, align: 'left' | 'center' | 'right', notes: Diagnostic[], what: string): Promise<{ cs: CrossSection; w: number; cap: number } | null> {
  const l = await textLine(ctx, font, value, cap, notes);
  if (!l) return null;
  let k = Math.min(1, maxW / Math.max(l.w, 1e-6));
  if (cap * k < FLOOR) {
    k = FLOOR / cap;
    notes.push({ level: 'warning', message: `The ${what} is too long to print legibly here; shorten it.` });
  }
  const w = l.w * k;
  const dx = align === 'left' ? x + w / 2 : align === 'right' ? x - w / 2 : x;
  let cs = l.cs.scale([k, k]).translate([dx, y]);
  // Small letters are thickened a little so their strokes still print.
  const g = Math.max(0, 0.46 - 0.12 * cap * k) / 2;
  if (g > 0) cs = cs.offset(g, 'Round', 2, 12);
  return { cs, w, cap: cap * k };
}

export async function glyph(ctx: Ctx, id: string, size: number): Promise<CrossSection | null> {
  const shapes = await symbolShapes(id, size, ctx.inputs);
  if (!shapes.length) return null;
  const cs = ctx.CrossSection.union(shapes.map((s) => ctx.cs(s.contours, s.fillRule)));
  const b = cs.bounds();
  return cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
}

/** A polyline drawn `t` wide with round ends. */
function stroke(ctx: Ctx, pts: [number, number][], t: number): CrossSection {
  const parts: CrossSection[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-6) continue;
    const a = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    parts.push(ctx.cs([rect(L, t)]).rotate(a).translate([(ax + bx) / 2, (ay + by) / 2]));
    parts.push(ctx.cs([circle(t / 2, 16)]).translate([bx, by]));
  }
  parts.push(ctx.cs([circle(t / 2, 16)]).translate(pts[0]!));
  return ctx.CrossSection.union(parts);
}

const tri = (ctx: Ctx, pts: [number, number][]) => ctx.cs([pts.flat()]);

/** Shuffle: two arrows crossing, `s` across. */
function shuffle(ctx: Ctx, s: number, t: number): CrossSection {
  const h = s * 0.32;
  const a = stroke(ctx, [[-s / 2, -h], [-s * 0.15, -h], [s * 0.15, h], [s * 0.3, h]], t);
  const b = stroke(ctx, [[-s / 2, h], [-s * 0.15, h], [s * 0.15, -h], [s * 0.3, -h]], t);
  const head = (y: number) => tri(ctx, [[s * 0.28, y + s * 0.17], [s / 2, y], [s * 0.28, y - s * 0.17]]);
  return a.add(b).add(head(h)).add(head(-h));
}

/** Repeat: a loop with an arrowhead, `s` across. */
function repeat(ctx: Ctx, s: number, t: number): CrossSection {
  const w = s * 0.8;
  const h = s * 0.5;
  const loop = ctx.cs([roundedRect(w + t, h + t, h / 2 + t / 2)]).subtract(ctx.cs([roundedRect(w - t, h - t, Math.max(0.1, h / 2 - t / 2))]));
  const gap = ctx.cs([rect(s * 0.22, t * 2)]).translate([s * 0.05, h / 2]);
  const head = tri(ctx, [[-s * 0.06, h / 2 + s * 0.16], [s * 0.18, h / 2], [-s * 0.06, h / 2 - s * 0.16]]);
  return loop.subtract(gap).add(head);
}

/** A paper plane, `s` across. */
function send(ctx: Ctx, s: number, t: number): CrossSection {
  const o = tri(ctx, [[-s / 2, s * 0.05], [s / 2, s * 0.42], [s * 0.08, -s / 2]]);
  return o.subtract(o.offset(-t, 'Miter', 2, 0)).add(stroke(ctx, [[-s * 0.05, -s * 0.02], [s * 0.42, s * 0.36]], t));
}

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const seconds = (s: string) => {
  const m = /^(\d+):(\d{1,2})$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** A music player under a cover, in `b`. Returns the ink. */
export async function player(ctx: Ctx, b: Box, notes: Diagnostic[]): Promise<CrossSection[]> {
  const p = ctx.params;
  const out: CrossSection[] = [];
  const W = bw(b);
  const u = W / 60;
  let y = b.y1 - 3.6 * u;
  const heartS = 4.2 * u;
  const title = await placeLine(ctx, p.font, p.song || 'Our song', 3.6 * u, W - heartS - 3 * u, b.x0, y, 'left', notes, 'song title');
  if (title) out.push(title.cs);
  const h = await glyph(ctx, 'tabler:heart', heartS);
  if (h) out.push(h.translate([b.x1 - heartS / 2, y + 1.8 * u]));
  if (p.artist.trim()) {
    y -= 5 * u;
    const a = await placeLine(ctx, p.font, p.artist, 2.6 * u, W, b.x0, y, 'left', notes, 'artist');
    if (a) out.push(a.cs);
  }
  // The bar, a third of the way through.
  y -= 4.6 * u;
  const t = Math.max(0.8, 0.55 * u);
  const at = b.x0 + W * 0.35;
  out.push(ctx.cs([rect(W * 0.35, t)]).translate([b.x0 + W * 0.175, y]));
  out.push(ctx.cs([rect(W * 0.65, Math.max(0.6, t * 0.6))]).translate([at + W * 0.325, y]));
  out.push(ctx.cs([circle(1.3 * u, 32)]).translate([at, y]));
  const len = seconds(p.length);
  if (len !== null) {
    y -= 4 * u;
    const l = await placeLine(ctx, p.font, fmt(len * 0.35), Math.max(FLOOR, 2.2 * u), W / 3, b.x0, y, 'left', notes, 'time');
    const r = await placeLine(ctx, p.font, `-${fmt(len * 0.65)}`, Math.max(FLOOR, 2.2 * u), W / 3, b.x1, y, 'right', notes, 'time');
    if (l) out.push(l.cs);
    if (r) out.push(r.cs);
  } else if (p.length.trim()) notes.push({ level: 'info', message: 'Write the song’s length as minutes:seconds, like 3:45, to show the times.' });
  // The controls.
  const cy = y - (len !== null ? 6.5 : 7) * u;
  const play = 9 * u;
  const lt = Math.max(0.6, 0.55 * u);
  const disc = ctx.cs([circle(play / 2, 48)]).translate([(b.x0 + b.x1) / 2, cy]);
  const tri0 = await glyph(ctx, 'tabler:player-play', play * 0.42);
  out.push(tri0 ? disc.subtract(tri0.translate([(b.x0 + b.x1) / 2 + play * 0.04, cy])) : disc);
  const prev = await glyph(ctx, 'tabler:player-skip-back', 4.6 * u);
  const next = await glyph(ctx, 'tabler:player-skip-forward', 4.6 * u);
  const cx = (b.x0 + b.x1) / 2;
  if (prev) out.push(prev.translate([cx - W * 0.22, cy]));
  if (next) out.push(next.translate([cx + W * 0.22, cy]));
  out.push(shuffle(ctx, 4.6 * u, lt).translate([b.x0 + 2.3 * u, cy]));
  out.push(repeat(ctx, 4.6 * u, lt).translate([b.x1 - 2.3 * u, cy]));
  return out;
}

/** How tall the player is for a cover `W` wide, mm. */
export function playerHeight(ctx: Ctx, W: number): number {
  const p = ctx.params;
  const u = W / 60;
  return (3.6 + (p.artist.trim() ? 5 : 0) + 4.6 + (seconds(p.length) !== null ? 4 + 6.5 : 7) + 4.5) * u + 3.6 * u;
}

/** A post's header (over the photo) and footer (under it). */
export async function postArt(ctx: Ctx, head: Box, foot: Box, notes: Diagnostic[]): Promise<CrossSection[]> {
  const p = ctx.params;
  const out: CrossSection[] = [];
  const W = bw(head);
  const u = W / 60;
  const hy = (head.y0 + head.y1) / 2;
  const av = 3.4 * u;
  const lt = Math.max(0.6, 0.5 * u);
  out.push(ctx.cs([circle(av, 48)]).subtract(ctx.cs([circle(av - lt, 48)])).translate([head.x0 + av, hy]));
  const me = await glyph(ctx, 'tabler:user', av * 1.1);
  if (me) out.push(me.translate([head.x0 + av, hy]));
  const handle = p.handle.trim() || 'you';
  const hl = await placeLine(ctx, p.font, handle, 2.8 * u, W - 2 * av - 10 * u, head.x0 + 2 * av + 2 * u, hy - 1.4 * u, 'left', notes, 'handle');
  if (hl) out.push(hl.cs);
  for (let i = -1; i <= 1; i++) out.push(ctx.cs([circle(0.55 * u + 0.15, 16)]).translate([head.x1 - 2 * u + i * 1.8 * u, hy]));
  // Under the photo: the actions, the likes, the caption.
  let y = foot.y1 - 3 * u;
  const s = 4.6 * u;
  const heart = await glyph(ctx, 'tabler:heart', s);
  const talk = await glyph(ctx, 'tabler:message-circle', s);
  const mark = await glyph(ctx, 'tabler:bookmark', s);
  if (heart) out.push(heart.translate([foot.x0 + s / 2, y]));
  if (talk) out.push(talk.translate([foot.x0 + s * 1.9, y]));
  out.push(send(ctx, s, lt).translate([foot.x0 + s * 3.3, y]));
  if (mark) out.push(mark.translate([foot.x1 - s / 2, y]));
  y -= s / 2 + 4 * u;
  const likes = p.likes.trim();
  if (likes) {
    const word = /^[\d.,kKmM]+$/.test(likes) ? `${likes} likes` : likes;
    const l = await placeLine(ctx, p.font, word, Math.max(FLOOR, 2.6 * u), W, foot.x0, y, 'left', notes, 'likes');
    if (l) out.push(l.cs);
    y -= 4.4 * u;
  }
  const cap = p.postCaption.trim();
  if (cap) {
    const l = await placeLine(ctx, p.font, `${handle}  ${cap}`, Math.max(FLOOR, 2.4 * u), W, foot.x0, y, 'left', notes, 'caption');
    if (l) out.push(l.cs);
  }
  return out;
}

export function postHeights(ctx: Ctx, W: number): { head: number; foot: number } {
  const p = ctx.params;
  const u = W / 60;
  return { head: 10 * u, foot: (3 + 2.3 + 4 + (p.likes.trim() ? 4.4 : 0) + (p.postCaption.trim() ? 3 : 0) + 2) * u };
}

/** The words in a chin: the caption over a smaller second line, centred in `b`. */
export async function chinWords(ctx: Ctx, b: Box, cap: number, notes: Diagnostic[]): Promise<CrossSection[]> {
  const p = ctx.params;
  const out: CrossSection[] = [];
  const two = !!p.second.trim();
  const c2 = Math.max(FLOOR, cap * 0.5);
  const H = cap + (two ? cap * 0.45 + c2 : 0);
  let y = (b.y0 + b.y1) / 2 + H / 2 - cap;
  const cx = (b.x0 + b.x1) / 2;
  const a = await placeLine(ctx, p.font, p.caption, cap, bw(b), cx, y, 'center', notes, 'caption');
  if (a) out.push(a.cs);
  if (two) {
    y -= cap * 0.45 + c2;
    const l = await placeLine(ctx, p.font, p.second, c2, bw(b), cx, y, 'center', notes, 'second line');
    if (l) out.push(l.cs);
  }
  return out;
}

export const chinHeight = (ctx: Ctx, cap: number) => cap + (ctx.params.second.trim() ? cap * 0.45 + Math.max(FLOOR, cap * 0.5) : 0) + cap * 0.35;

/** Initials fitted inside a crest. */
export async function crestInitials(ctx: Ctx, x: number, y: number, r: number, notes: Diagnostic[]): Promise<CrossSection | null> {
  const p = ctx.params;
  const l = await textLine(ctx, p.font, p.initials, r * 0.75, notes);
  if (!l) return null;
  const k = Math.min(1, (r * 1.3) / l.w);
  const cs = l.cs.scale([k, k]);
  const b = cs.bounds();
  return cs.translate([x - (b.min[0] + b.max[0]) / 2, y - (b.min[1] + b.max[1]) / 2]);
}

export { box };
