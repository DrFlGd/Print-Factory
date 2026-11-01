/**
 * Bin labels: a thin plate with an icon on the left and one or two lines on the right, the
 * second line text or the side view of a screw. Every line of the text can be its own label.
 *
 * Text and icons are fitted into their boxes (as large as the box allows), then raised, inlaid
 * or engraved. Each label is its own group, so a 3MF opens with one object per label.
 */
import type { BuildResult, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, ManifoldContext } from '@pf/engine-manifold';
import { circle, rect, regularPolygon, rotate, roundedRect, translate } from '@pf/shapes';
import { symbolShapes } from '@pf/symbols';
import { text as layoutText } from '@pf/text';

export const ICONS = ['hex-nut', 'nylock', 'washer', 'large-washer', 'lock-washer', 'insert', 'torx', 'phillips', 'slot', 'hex-socket'] as const;
export const HEADS = ['socket', 'button', 'countersunk', 'hex', 'pan', 'grub'] as const;
export type Icon = 'none' | 'symbol' | (typeof ICONS)[number];
export type Head = (typeof HEADS)[number];

export interface Params {
  text: string;
  perLine: boolean;
  font: string;
  letterSpacing: number;
  icon: Icon;
  symbol: string;
  line2: 'text' | 'screw';
  head: Head;
  size: 'pred-1' | 'pred-2' | 'pred-3' | 'custom';
  labelWidth: number;
  labelHeight: number;
  thickness: number;
  cornerRadius: number;
  margin: number;
  style: 'raised' | 'inlay' | 'engraved';
  depth: number;
  plateColor: RGB;
  textColor: RGB;
  ams: boolean;
}

type Ctx = ManifoldContext<Params>;

/** Pred's Gridfinity bin label is 36 × 11.5 mm for one unit; each extra unit adds a 42 mm pitch. */
export function labelSize(p: Params): [number, number] {
  if (p.size === 'custom') return [p.labelWidth, p.labelHeight];
  const units = Number(p.size.slice(5));
  return [36 + 42 * (units - 1), 11.5];
}

/** "M3 x 12", "M3x12", "m4×20" → [3, 12]. */
export function screwSize(s: string): [number, number] | null {
  const m = /M\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i.exec(s);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/* ------------------------------------------------------------------ icons */

/** A fastener icon `s` across, centred on the origin. */
export function fastenerIcon(ctx: Ctx, icon: (typeof ICONS)[number], s: number): CrossSection {
  const R = s / 2;
  const disc = (r: number, x = 0, y = 0) => ctx.cs([circle(r, 72)]).translate([x, y]);
  const hex = (r: number) => ctx.cs([regularPolygon(6, r, 0)]);
  switch (icon) {
    case 'hex-nut':
      return hex(R).subtract(disc(0.45 * R));
    case 'nylock':
      return hex(R).subtract(disc(0.64 * R)).add(disc(0.5 * R).subtract(disc(0.34 * R)));
    case 'washer':
      return disc(R).subtract(disc(0.5 * R));
    case 'large-washer':
      return disc(R).subtract(disc(0.28 * R));
    case 'lock-washer': {
      const split = ctx.cs(translate(rotate([rect(0.16 * R, 0.7 * R)], -25), 0.32 * R, 0.68 * R));
      return disc(R).subtract(disc(0.56 * R)).subtract(split);
    }
    case 'insert': {
      // A heat-set insert from the side: a collar on top of a toothed, knurled body.
      const w = 0.66 * s;
      const pts: number[] = [];
      const teeth = 3;
      const y0 = -R;
      const y1 = R - 0.22 * s;
      const step = (y1 - y0) / teeth;
      // Right side, bottom to top, then the collar, then the left side top to bottom.
      pts.push(w / 2 - 0.06 * s, y0);
      for (let i = 0; i < teeth; i++) pts.push(w / 2, y0 + (i + 0.5) * step, w / 2 - 0.1 * s, y0 + (i + 1) * step);
      pts.push(w / 2 + 0.06 * s, y1, w / 2 + 0.06 * s, R, -w / 2 - 0.06 * s, R, -w / 2 - 0.06 * s, y1);
      for (let i = teeth - 1; i >= 0; i--) pts.push(-w / 2 + 0.1 * s, y0 + (i + 1) * step, -w / 2, y0 + (i + 0.5) * step);
      pts.push(-w / 2 + 0.06 * s, y0);
      // The knurls as two grooves across the body.
      const grooves = [0.33, 0.66].map((f) => ctx.cs(rotate([rect(w * 1.4, 0.07 * s)], 25)).translate([0, y0 + f * (y1 - y0)]));
      return ctx.cs([pts]).subtract(ctx.CrossSection.union(grooves));
    }
    case 'torx': {
      const lobes = [0, 1, 2, 3, 4, 5].map((k) => disc(0.15 * R, 0.4 * R * Math.cos((k * Math.PI) / 3 + Math.PI / 6), 0.4 * R * Math.sin((k * Math.PI) / 3 + Math.PI / 6)));
      return disc(R).subtract(ctx.CrossSection.union([disc(0.34 * R), ...lobes]));
    }
    case 'phillips': {
      const cross = ctx.cs([rect(1.2 * R, 0.24 * R), rect(0.24 * R, 1.2 * R)], 'NonZero').add(ctx.cs(rotate([rect(0.36 * R, 0.36 * R)], 45)));
      return disc(R).subtract(cross);
    }
    case 'slot':
      return disc(R).subtract(ctx.cs([rect(1.4 * R, 0.22 * R)]));
    case 'hex-socket':
      return disc(R).subtract(hex(0.46 * R));
  }
}

/* ------------------------------------------------------------------ screws */

/**
 * A screw from the side, axis along x, head on the left, in units of the thread's diameter:
 * returns the outline and its length and height in those units.
 */
export function screwProfile(ctx: Ctx, head: Head, ratio: number): { cs: CrossSection; length: number; height: number } {
  const d = 1;
  let hl = 0;
  let hh = d;
  let headCs: CrossSection | null = null;
  switch (head) {
    case 'socket':
      [hl, hh] = [1, 1.5];
      headCs = ctx.cs([roundedRect(hl, hh, 0.12)]).translate([hl / 2, 0]);
      break;
    case 'button': {
      [hl, hh] = [0.55, 1.75];
      const dome: number[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = Math.PI / 2 + (i / 24) * Math.PI;
        dome.push(hl + hl * Math.cos(a), (hh / 2) * Math.sin(a));
      }
      headCs = ctx.cs([dome]);
      break;
    }
    case 'countersunk':
      [hl, hh] = [0.6, 2];
      headCs = ctx.cs([[0, -hh / 2, hl + 0.02, -d / 2, hl + 0.02, d / 2, 0, hh / 2]]);
      break;
    case 'hex':
      [hl, hh] = [0.7, 1.75];
      // The flats show as two lines across the head.
      headCs = ctx.cs([rect(hl, hh)]).subtract(ctx.cs([...translate([rect(hl + 1, 0.08)], 0, 0.3), ...translate([rect(hl + 1, 0.08)], 0, -0.3)], 'NonZero')).translate([hl / 2, 0]);
      break;
    case 'pan':
      [hl, hh] = [0.7, 1.8];
      headCs = ctx.cs([roundedRect(hl * 2, hh, 0.35)]).translate([hl, 0]).intersect(ctx.cs([rect(hl, hh + 1)]).translate([hl / 2, 0]));
      break;
    case 'grub':
      break;
  }
  const L = Math.max(1, ratio);
  const x0 = hl;
  const x1 = hl + L;
  const crest = d / 2;
  const root = 0.36 * d;
  const pitch = 0.45 * d;
  const n = Math.max(1, Math.floor((L - 0.25) / pitch));
  // Bottom edge left to right, a chamfer at the tip, the top edge back.
  const pts: number[] = [x0, -crest];
  for (let i = 0; i < n; i++) pts.push(x0 + (i + 0.5) * pitch, -root, x0 + (i + 1) * pitch, -crest);
  pts.push(x1 - 0.12, -crest, x1, -root * 0.8, x1, root * 0.8, x1 - 0.12, crest);
  for (let i = n; i > 0; i--) pts.push(x0 + i * pitch, crest, x0 + (i - 0.5) * pitch, root);
  pts.push(x0, crest);
  let cs = ctx.cs([pts]);
  if (headCs) cs = cs.add(headCs.add(ctx.cs([rect(0.04, d)]).translate([hl, 0])));
  // A grub screw has a slot in its end instead of a head.
  if (head === 'grub') cs = cs.subtract(ctx.cs([rect(0.3, 0.2)]).translate([0.1, 0]));
  return { cs, length: hl + L, height: Math.max(hh, d) };
}

/* ------------------------------------------------------------------ fitting */

/** Scales `cs` to fit `w` × `h` and puts its left edge at `x`, its middle at `y` (or centres it on x when `centre`). */
function place(cs: CrossSection, w: number, h: number, x: number, y: number, centre = false): CrossSection {
  if (cs.isEmpty()) return cs;
  const b = cs.bounds();
  const bw = b.max[0] - b.min[0];
  const bh = b.max[1] - b.min[1];
  const k = Math.min(w / bw, h / bh);
  const s = cs.scale([k, k]);
  const sb = s.bounds();
  const dx = centre ? x - (sb.min[0] + sb.max[0]) / 2 : x - sb.min[0];
  return s.translate([dx, y - (sb.min[1] + sb.max[1]) / 2]);
}

async function lineOf(ctx: Ctx, p: Params, s: string, notes: Diagnostic[]): Promise<CrossSection | null> {
  if (!s.trim()) return null;
  const t = await layoutText(p.font, s.trim(), { capHeight: 10, letterSpacing: p.letterSpacing * (10 / 4), tolerance: 0.02 }, ctx.inputs);
  if (t.missing.length) notes.push({ level: 'warning', message: `No bundled font has ${t.missing.map((c) => `“${c}”`).join(' ')}; left out.` });
  const cs = ctx.cs(t.contours, 'NonZero');
  return cs.isEmpty() ? null : cs;
}

/** The ink of one label: icon, line 1, and line 2 or a screw, in label coordinates. */
async function ink(ctx: Ctx, p: Params, W: number, H: number, one: string, two: string, notes: Diagnostic[]): Promise<CrossSection | null> {
  const m = Math.max(0.3, p.margin);
  const h = H - 2 * m;
  let x = -W / 2 + m;
  const right = W / 2 - m;
  const parts: CrossSection[] = [];
  if (p.icon !== 'none') {
    let icon: CrossSection | null = null;
    if (p.icon === 'symbol') {
      const shapes = await symbolShapes(p.symbol, h, ctx.inputs);
      if (shapes.length) icon = ctx.CrossSection.union(shapes.map((s) => ctx.cs(s.contours, s.fillRule)));
    } else icon = fastenerIcon(ctx, p.icon, h);
    if (icon && !icon.isEmpty()) {
      parts.push(place(icon, h, h, x + h / 2, 0, true));
      x += h + Math.max(1, h * 0.12);
    }
  }
  const w = right - x;
  if (w < 3) {
    notes.push({ level: 'warning', message: 'No room for text beside the icon: make the label wider.' });
    return parts.length ? ctx.CrossSection.union(parts) : null;
  }
  const first = await lineOf(ctx, p, one, notes);
  let second: CrossSection | null = null;
  if (p.line2 === 'screw') {
    const size = screwSize(one) ?? screwSize(two);
    const sp = screwProfile(ctx, p.head, size ? size[1] / size[0] : 4);
    second = sp.cs;
  } else second = await lineOf(ctx, p, two, notes);
  const gap = Math.max(0.8, h * 0.12);
  if (first && second) {
    const h1 = (h - gap) * 0.55;
    const h2 = h - gap - h1;
    parts.push(place(first, w, h1, x, h / 2 - h1 / 2));
    parts.push(place(second, w, h2, x, -h / 2 + h2 / 2));
  } else if (first || second) parts.push(place((first ?? second)!, w, h * (first ? 0.62 : 0.5), x, 0));
  return parts.length ? ctx.CrossSection.union(parts) : null;
}

/* ------------------------------------------------------------------ build */

export async function build(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  const notes: Diagnostic[] = [];
  const [W, H] = labelSize(p);
  const lines = p.text.split('\n').map((l) => l.trim());
  const labels: [string, string][] = p.perLine
    ? lines.filter(Boolean).slice(0, 40).map((l) => {
        const [a = '', b = ''] = l.split('|').map((s) => s.trim());
        return [a, b];
      })
    : [[lines[0] ?? '', lines[1] ?? '']];
  if (p.perLine && lines.filter(Boolean).length > 40) notes.push({ level: 'warning', message: 'Only the first 40 labels are made.' });
  if (!labels.length) labels.push(['', '']);

  const t = Math.max(0.4, p.thickness);
  const depth = p.style === 'raised' ? Math.max(0.1, p.depth) : Math.min(p.depth, t - 0.2);
  if (p.style !== 'raised' && p.depth > t - 0.2) notes.push({ level: 'warning', message: `Letters can go at most ${(t - 0.2).toFixed(1)} mm into a ${t} mm label; using that.` });
  const plate = ctx.cs([roundedRect(W, H, Math.min(p.cornerRadius, H / 2 - 0.01))]);
  const pitch = H + 3;
  const parts: Part[] = [];
  for (let i = 0; i < labels.length; i++) {
    const [one, two] = labels[i]!;
    const y = -i * pitch;
    const art = await ink(ctx, p, W, H, one, two, notes);
    const clipped = art ? art.intersect(plate.offset(-0.2, 'Round', 2, 16)) : null;
    let body = ctx.extrude(plate, t);
    let raised = null;
    if (clipped && !clipped.isEmpty()) {
      if (p.style === 'raised') raised = ctx.extrude(clipped, depth, t);
      else {
        body = body.subtract(ctx.extrude(clipped, depth + 1, t - depth));
        if (p.style === 'inlay') raised = ctx.extrude(clipped, depth, t - depth);
      }
    }
    const group = labels.length > 1 ? `label-${i + 1}` : 'label';
    const suffix = labels.length > 1 ? ` ${i + 1}` : '';
    const add = (m: typeof body | null, name: string, color: RGB) => {
      const part = m && ctx.part(m.translate([0, y, 0]), name + suffix, color, { group });
      if (part) parts.push(part);
    };
    add(body, 'Label', p.plateColor);
    add(raised, 'Text', p.textColor);
  }
  if (p.style === 'raised' && !p.ams) notes.push({ level: 'info', message: `Without an AMS: pause at ${t.toFixed(2)} mm (the first layer of the text) and swap filament.` });
  if (p.style === 'inlay' && !p.ams) notes.push({ level: 'warning', message: 'Inlaid text shares layers with the label, so it needs a printer that swaps filament. Choose Raised, or turn the AMS option on.' });
  if (p.style === 'engraved') notes.push({ level: 'info', message: 'Engraved text is a recess: fill it with paint, or choose Inlaid for a second filament.' });
  return { parts, diagnostics: notes, summary: `${labels.length} label${labels.length > 1 ? 's' : ''}, ${W} × ${H} × ${t} mm` };
}

