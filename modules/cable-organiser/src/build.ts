/**
 * Cable organisers sized to your cables: a snap-in holder that sticks or screws to a wall or
 * desk, a clip that pushes onto a desk edge, a winder for earbuds and chargers, and a tag that
 * clips onto a cable with its name on it.
 *
 * The holder and the desk clip are drawn as a profile and printed lying on it, so the snap
 * rings flex along the layers instead of across them. The winder and the tag print flat.
 */
import type { BuildResult, Contour, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold, ManifoldContext } from '@pf/engine-manifold';
import { bounds, centerOn, circle, rect, rectSize, roundedRect, scale } from '@pf/shapes';
import { text as layoutText } from '@pf/text';

export interface Params {
  product: 'holder' | 'desk' | 'winder' | 'tag';
  cableDia: number;
  cables: number;
  grip: 'light' | 'firm';
  spacing: number;
  width: number;
  mount: 'adhesive' | 'screw';
  deskThickness: number;
  jawDepth: number;
  winderLength: number;
  winderWidth: number;
  label: string;
  font: string;
  tagLength: number;
  tagHeight: number;
  thickness: number;
  bodyColor: RGB;
  textColor: RGB;
}

type Ctx = ManifoldContext<Params>;

/** How much wider than the cable a ring's bore is, mm: cables are soft, rings are not. */
const BORE = 0.3;
/** A snap ring's opening as a share of the cable's diameter. */
const MOUTH = { light: 0.85, firm: 0.72 } as const;
const RING_WALL = 2;
const SCREW = { hole: 4.2, head: 8.4 } as const;

export async function build(ctx: Ctx): Promise<BuildResult> {
  const p = ctx.params;
  const notes: Diagnostic[] = [];
  let parts: Part[] = [];
  let summary = '';
  switch (p.product) {
    case 'desk':
      ({ parts, summary } = desk(ctx, notes));
      break;
    case 'winder':
      ({ parts, summary } = winder(ctx, notes));
      break;
    case 'tag':
      ({ parts, summary } = await tag(ctx, notes));
      break;
    default:
      ({ parts, summary } = holder(ctx, notes));
  }
  return { parts, diagnostics: notes, summary };
}

const part = (ctx: Ctx, m: Manifold, name: string, color: RGB, out: Part[]) => {
  const q = ctx.part(m, name, color);
  if (q) out.push(q);
};

/* ------------------------------------------------------------------ snap rings */

interface Ring {
  /** Bore radius and outer radius. */
  r: number;
  R: number;
  mouth: number;
}

function ring(p: Params): Ring {
  const r = p.cableDia / 2 + BORE / 2;
  return { r, R: r + RING_WALL, mouth: Math.max(1, p.cableDia * MOUTH[p.grip]) };
}

/**
 * A snap ring at (x, y) opening towards `dir` (radians): the ring, plus a lead-in that widens
 * the mouth at 45° so the cable finds it.
 */
function ringCut(ctx: Ctx, g: Ring, x: number, y: number, dir: number): CrossSection {
  const reach = g.R + 2;
  const m = g.mouth / 2;
  // In the ring's own frame the mouth points +y: straight at the mouth's width through the
  // narrowest part of the ring, then opening at 45° so the cable finds it.
  const y1 = Math.sqrt(Math.max(0, g.r * g.r - m * m)) + (g.R - g.r) * 0.4;
  const w = m + reach - y1;
  const slot = ctx.cs([[-m, 0, m, 0, m, y1, w, reach, -w, reach, -m, y1]]);
  return ctx
    .cs([circle(g.r, 64)])
    .add(slot)
    .rotate((dir * 180) / Math.PI - 90)
    .translate([x, y]);
}

/* ------------------------------------------------------------------ the holder */

function holder(ctx: Ctx, notes: Diagnostic[]): { parts: Part[]; summary: string } {
  const p = ctx.params;
  const g = ring(p);
  const n = Math.max(1, Math.round(p.cables));
  const pitch = 2 * g.R + Math.max(0, p.spacing) - RING_WALL * 0.6;
  const base = p.mount === 'screw' ? 3.5 : 2.4;
  const cy = base + g.r + 0.6;
  const L = (n - 1) * pitch + 2 * g.R;
  const tab = p.mount === 'screw' ? SCREW.head + 4 : 0;
  // The profile: a base, a tooth round each ring, the rings cut out.
  let prof = ctx.cs([roundedRect(L + 2 * tab, base, 0.01)]).translate([0, base / 2]);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * pitch;
    prof = prof.add(ctx.cs([circle(g.R, 64)]).translate([x, cy])).add(ctx.cs([rect(2 * g.R, cy)]).translate([x, cy / 2]));
  }
  prof = prof.offset(0.6, 'Round', 2, 16).offset(-0.6, 'Round', 2, 16).intersect(ctx.cs([rect(L + 2 * tab + 2, cy + g.R + 2)]).translate([0, (cy + g.R + 2) / 2]));
  for (let i = 0; i < n; i++) prof = prof.subtract(ringCut(ctx, g, (i - (n - 1) / 2) * pitch, cy, Math.PI / 2));
  // Wide enough for the screw heads when it screws on.
  const width = Math.max(4, p.width, p.mount === 'screw' ? SCREW.head + 3 : 0);
  if (width > p.width) notes.push({ level: 'info', message: `Made ${width} mm wide so the screw heads fit.` });
  let m = ctx.extrude(prof, width);
  if (p.mount === 'screw') {
    for (const s of [-1, 1]) m = m.subtract(screwHole(ctx, s * (L / 2 + tab / 2), base, width / 2));
  }
  const parts: Part[] = [];
  // Printed lying on its profile; the flat back (y = 0) goes against the wall.
  part(ctx, m, 'Holder', p.bodyColor, parts);
  if (p.mount === 'adhesive') notes.push({ level: 'info', message: 'Stick it on with double-sided foam tape on the flat back.' });
  return { parts, summary: `${n} × Ø${p.cableDia} mm · ${(L + 2 * tab).toFixed(0)} × ${(cy + g.R).toFixed(0)} × ${width} mm · prints on its side` };
}

/** A countersunk screw hole through a wall `t` thick at x, its axis along y, centred at z. */
function screwHole(ctx: Ctx, x: number, t: number, z: number): Manifold {
  const r = SCREW.hole / 2;
  // A teardrop, so the top of the hole bridges: its point ends up towards +z, up the print.
  const td: Contour = [];
  for (let i = 0; i <= 32; i++) {
    const a = -Math.PI / 4 - (i / 32) * (1.5 * Math.PI);
    td.push(r * Math.cos(a), -r * Math.sin(a));
  }
  td.push(0, -r * Math.SQRT2);
  const hole = ctx.extrude(ctx.cs([td]), t + 2, -1);
  const sink = ctx.Manifold.cylinder(SCREW.head / 2 - r + 0.01, r, SCREW.head / 2, 48).translate([0, 0, t - (SCREW.head / 2 - r)]);
  // Drawn along z; turned to run along y (out of the wall), the point to +z.
  return hole.add(sink).rotate([-90, 0, 0]).translate([x, 0, z]);
}

/* ------------------------------------------------------------------ the desk clip */

function desk(ctx: Ctx, notes: Diagnostic[]): { parts: Part[]; summary: string } {
  const p = ctx.params;
  const g = ring(p);
  const n = Math.max(1, Math.round(p.cables));
  const t = 3;
  const T = p.deskThickness;
  const J = Math.max(10, p.jawDepth);
  // The C: open towards +x, the desk between the jaws, 0.2 mm tight.
  const H = T + 2 * t;
  let prof = ctx.cs([roundedRect(J + t, H, 2)]).translate([(J + t) / 2 - t, H / 2]);
  prof = prof.subtract(ctx.cs([rect(J + 1, T - 0.2)]).translate([(J + 1) / 2, H / 2]));
  // Small lips at the jaw tips, 0.5 mm into the gap, that the jaws spring over and hold by.
  const face = (T - 0.2) / 2;
  for (const s of [-1, 1]) prof = prof.add(ctx.cs([circle(1, 24)]).translate([J - 1.5, H / 2 + s * (face + 0.5)]));
  // Rings under the lower jaw, mouths down.
  const pitch = 2 * g.R + Math.max(0, p.spacing) - RING_WALL * 0.6;
  const span = (n - 1) * pitch;
  const x0 = (J - t) / 2 - span / 2;
  if (span + 2 * g.R > J + t) notes.push({ level: 'info', message: 'The rings run past the jaw: make the jaw deeper or use fewer cables.' });
  const cy = -(g.r + 1.2);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * pitch;
    prof = prof.add(ctx.cs([circle(g.R, 64)]).translate([x, cy])).add(ctx.cs([rect(2 * g.R, -cy + 1)]).translate([x, cy / 2 + 0.5]));
  }
  prof = prof.offset(0.6, 'Round', 2, 16).offset(-0.6, 'Round', 2, 16);
  for (let i = 0; i < n; i++) prof = prof.subtract(ringCut(ctx, g, x0 + i * pitch, cy, -Math.PI / 2));
  const m = ctx.extrude(prof, Math.max(6, p.width));
  const parts: Part[] = [];
  part(ctx, m, 'Desk clip', p.bodyColor, parts);
  notes.push({ level: 'info', message: `For a ${T} mm desk top. The jaws spring open 1 mm to go on; PETG takes that better than PLA.` });
  return { parts, summary: `${n} × Ø${p.cableDia} mm under a ${T} mm desk · ${p.width} mm wide · prints on its side` };
}

/* ------------------------------------------------------------------ the winder */

function winder(ctx: Ctx, _notes: Diagnostic[]): { parts: Part[]; summary: string } {
  const p = ctx.params;
  const L = p.winderLength;
  const W = p.winderWidth;
  const th = Math.max(1.6, p.thickness);
  let s = ctx.cs([roundedRect(L, W, Math.min(W, L) * 0.22)]);
  // The waist the cable winds round: a bay cut into each long side.
  const bayL = L * 0.62;
  const bayD = W * 0.3;
  for (const sy of [-1, 1]) s = s.subtract(ctx.cs([roundedRect(bayL, bayD * 2, Math.min(bayD, 6))]).translate([0, sy * W * 0.5]));
  // Slits at the ends to hold the plug and the far end of the cable.
  const slit = Math.max(1, p.cableDia * 0.8);
  for (const sx of [-1, 1]) s = s.subtract(ctx.cs([rect(slit, W * 0.32)]).translate([sx * (L / 2 - Math.min(8, L * 0.12)), W * 0.5 - W * 0.16]));
  s = s.offset(-0.4, 'Round', 2, 16).offset(0.4, 'Round', 2, 16);
  const m = ctx.edged(s, th, { top: Math.min(0.6, th / 3), bottom: 0.3, style: 'chamfer' });
  const parts: Part[] = [];
  part(ctx, m, 'Winder', p.bodyColor, parts);
  return { parts, summary: `${L} × ${W} × ${th} mm · slits for a ${p.cableDia} mm cable` };
}

/* ------------------------------------------------------------------ the tag */

async function tag(ctx: Ctx, notes: Diagnostic[]): Promise<{ parts: Part[]; summary: string }> {
  const p = ctx.params;
  const g = ring(p);
  const Lf = p.tagLength;
  const Hf = p.tagHeight;
  const th = 1.6;
  const relief = 0.6;
  // The flag, flat on the bed; the cable runs along x under its lower edge.
  let flag = ctx.edged(ctx.cs([roundedRect(Lf, Hf, Math.min(3, Hf / 3))]).translate([0, Hf / 2]), th, { top: 0.3, style: 'chamfer' });
  // A clip: a ring standing on the bed with its mouth at the top, joined to the flag by a web.
  const clipL = Math.min(Lf, Math.max(8, 2 * g.R + 2));
  const zc = g.R;
  const yc = -g.R + 0.2;
  const sec = ctx.cs([circle(g.R, 64)]).subtract(ringCut(ctx, g, 0, 0, Math.PI / 2));
  // Drawn in (y, z) and extruded along z; the turn makes that (x, y, z) → (z, x, y), so the
  // ring runs along world x with its mouth up.
  const ringM = ctx.extrude(sec.translate([yc, zc]), clipL, -clipL / 2).rotate([90, 0, 90]);
  const web = ctx.extrude(ctx.cs([rect(clipL, -yc + 0.6)]).translate([0, yc / 2 + 0.3]), th);
  flag = flag.add(ringM).add(web);
  const parts: Part[] = [];
  let textM: Manifold | null = null;
  const v = p.label.trim();
  if (v) {
    const t = await layoutText(p.font, v, { capHeight: Hf * 0.5, align: 'center', tolerance: 0.01 }, ctx.inputs);
    let cs = t.contours;
    if (cs.length) {
      const b = rectSize(bounds(cs));
      const f = Math.min(1, (Lf - 4) / b.width, (Hf - 3) / b.height);
      if (f < 1) cs = scale(cs, f);
      cs = centerOn(cs, 0, Hf / 2);
      textM = ctx.extrude(ctx.cs(cs, 'NonZero'), relief, th - 0.01);
      if (Hf * 0.5 * f < 3) notes.push({ level: 'warning', message: 'The label is small; make the tag longer or the text shorter.' });
    }
  }
  part(ctx, flag, 'Tag', p.bodyColor, parts);
  if (textM) part(ctx, textM, 'Text', p.textColor, parts);
  if (textM) notes.push({ level: 'info', message: `The text stands ${relief} mm proud: change filament at ${th.toFixed(1)} mm for two colours.` });
  return { parts, summary: `${Lf} × ${Hf} mm tag for a Ø${p.cableDia} mm cable` };
}
