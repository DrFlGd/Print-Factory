/**
 * Name keychain geometry.
 *
 * Text → outlines (@pf/text) → plate outline (offset, plate or pill) → ring tab or hole →
 * solids. Every colour is its own part in one group, so the 3MF opens as one object with
 * a filament per part. Without an AMS the colours are stacked by height instead, and the
 * summary says at which height to swap filament.
 */
import type { BuildResult, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, ManifoldContext } from '@pf/engine-manifold';
import { circle, pill, roundedRect } from '@pf/shapes';
import { text as layoutText } from '@pf/text';

export interface Params {
  text: string;
  font: string;
  letterHeight: number;
  letterSpacing: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  shape: 'outline' | 'rounded' | 'pill' | 'none';
  padding: number;
  cornerRadius: number;
  smoothing: number;
  baseThickness: number;
  layers: 1 | 2 | 3;
  textStyle: 'raised' | 'inlay' | 'engraved';
  textHeight: number;
  depth: number;
  borderWidth: number;
  borderHeight: number;
  ring: 'tab' | 'hole' | 'none';
  ringSide: 'left' | 'top' | 'right';
  holeDiameter: number;
  ringWall: number;
  baseColor: RGB;
  textColor: RGB;
  borderColor: RGB;
  ams: boolean;
}

/** The plate's outline before the ring is added. */
function plateOutline(ctx: ManifoldContext<Params>, letters: CrossSection, p: Params): CrossSection {
  const b = letters.bounds();
  const w = b.max[0] - b.min[0];
  const h = b.max[1] - b.min[1];
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  switch (p.shape) {
    case 'rounded':
      return ctx.cs([roundedRect(w + p.padding * 2, h + p.padding * 2, p.cornerRadius)]).translate([cx, cy]);
    case 'pill':
      return ctx.cs([pill(w + p.padding * 2 + h * 0.3, h + p.padding * 2)]).translate([cx, cy]);
    case 'none': {
      // Letters only: a thin bar along the baseline area holds separate letters together.
      const bar = ctx.cs([roundedRect(Math.max(1, w - p.letterHeight * 0.4), Math.max(1.2, p.letterHeight * 0.22), 0.6)]).translate([cx, b.min[1] + h * 0.32]);
      return letters.add(bar).offset(0.01, 'Round', 2, 32);
    }
    case 'outline':
    default: {
      // Grow the letters by the margin, close the gaps between them (open then shrink by the
      // smoothing radius), and drop any holes so the plate is solid under the counters.
      const r = Math.max(0, p.smoothing);
      let out = letters.offset(p.padding + r, 'Round', 2, 48);
      if (r > 0) out = out.offset(-r, 'Round', 2, 48);
      let filled = fillHoles(ctx, out);
      if (filled.decompose().length > 1) {
        // Still apart (wide letter spacing): join with a bar through the middle.
        filled = filled.add(ctx.cs([roundedRect(w, Math.max(2, h * 0.45), Math.min(2, h * 0.2))]).translate([cx, cy]));
      }
      return filled;
    }
  }
}

/** Keeps only outer boundaries. */
function fillHoles(ctx: ManifoldContext<Params>, s: CrossSection): CrossSection {
  const outers = ctx.contours(s).filter((c) => {
    let a = 0;
    for (let i = 0; i < c.length; i += 2) {
      const j = (i + 2) % c.length;
      a += c[i]! * c[j + 1]! - c[j]! * c[i + 1]!;
    }
    return a > 0;
  });
  return ctx.cs(outers);
}

interface Ring {
  /** Added to the plate. */
  tab: CrossSection | null;
  /** Cut through everything. */
  hole: CrossSection | null;
}

function ring(ctx: ManifoldContext<Params>, plate: CrossSection, p: Params): Ring {
  if (p.ring === 'none') return { tab: null, hole: null };
  const r = p.holeDiameter / 2;
  const outer = r + p.ringWall;
  const b = plate.bounds();
  const cy = (b.min[1] + b.max[1]) / 2;
  const cx = (b.min[0] + b.max[0]) / 2;
  let x = cx;
  let y = cy;
  if (p.ring === 'tab') {
    // Centre of the tab just outside the plate, overlapping it by a wall's width.
    const reach = outer - p.ringWall * 0.9;
    if (p.ringSide === 'left') x = b.min[0] - reach;
    else if (p.ringSide === 'right') x = b.max[0] + reach;
    else y = b.max[1] + reach;
    if (p.ringSide === 'top') x = cx;
    else y = edgeCentre(ctx, plate, p.ringSide === 'left' ? b.min[0] + 0.5 : b.max[0] - 0.5, cy);
    const tab = ctx.cs([circle(outer)]).translate([x, y]);
    // A neck so the tab is not joined by a sliver.
    const neckLen = Math.abs(p.ringSide === 'top' ? y - b.max[1] : p.ringSide === 'left' ? x - b.min[0] : x - b.max[0]) + p.ringWall * 2;
    const neck = p.ringSide === 'top' ? ctx.cs([roundedRect(outer * 1.4, neckLen, 0)]).translate([x, y - neckLen / 2]) : ctx.cs([roundedRect(neckLen, outer * 1.4, 0)]).translate([p.ringSide === 'left' ? x + neckLen / 2 : x - neckLen / 2, y]);
    return { tab: tab.add(neck.intersect(plate.offset(p.ringWall, 'Round', 2, 32))), hole: ctx.cs([circle(r)]).translate([x, y]) };
  }
  // A hole inside the plate: as close to the edge as the wall allows.
  const inset = outer;
  if (p.ringSide === 'left') x = b.min[0] + inset;
  else if (p.ringSide === 'right') x = b.max[0] - inset;
  else y = b.max[1] - inset;
  if (p.ringSide !== 'top') y = edgeCentre(ctx, plate, x, cy);
  return { tab: null, hole: ctx.cs([circle(r)]).translate([x, y]) };
}

/** The middle of the plate's span at a given x (a bubble outline is not symmetric). */
function edgeCentre(ctx: ManifoldContext<Params>, plate: CrossSection, x: number, fallback: number): number {
  const b = plate.bounds();
  const strip = ctx.cs([roundedRect(0.6, b.max[1] - b.min[1] + 2, 0)]).translate([x, (b.min[1] + b.max[1]) / 2]);
  const cut = plate.intersect(strip);
  if (cut.isEmpty()) return fallback;
  const cb = cut.bounds();
  return (cb.min[1] + cb.max[1]) / 2;
}

export async function build(ctx: ManifoldContext<Params>): Promise<BuildResult> {
  const p = ctx.params;
  const diagnostics: Diagnostic[] = [];
  const value = p.text.split('\n').slice(0, 3).join('\n');
  if (!value.trim()) return { parts: [], diagnostics: [{ level: 'info', message: 'Type some text to make a keychain.' }] };

  const t = await layoutText(p.font, value, { capHeight: p.letterHeight, letterSpacing: p.letterSpacing, lineHeight: p.lineHeight, align: p.align, tolerance: 0.03 }, ctx.inputs);
  if (t.missing.length) diagnostics.push({ level: 'warning', message: `No bundled font has ${t.missing.map((c) => `“${c}”`).join(' ')}; left out.` });
  const letters = ctx.cs(t.contours, 'NonZero');
  if (letters.isEmpty()) return { parts: [], diagnostics: [...diagnostics, { level: 'info', message: 'Nothing to draw: the text is only spaces.' }] };

  let plate = plateOutline(ctx, letters, p);
  const r = ring(ctx, plate, p);
  if (r.tab) plate = plate.add(r.tab);

  const layers = p.layers;
  const base = p.baseThickness;
  const raised = p.textStyle === 'raised';
  const depth = Math.min(p.depth, base - 0.4);
  if (!raised && p.depth > base - 0.4) diagnostics.push({ level: 'warning', message: `Letters can go at most ${(base - 0.4).toFixed(1)} mm into a ${base} mm plate; using that.` });

  // Text sits inside the plate's border, never over the ring hole.
  let textSection = letters;
  if (r.hole) textSection = textSection.subtract(r.hole.offset(0.8, 'Round', 2, 32));

  let plateSolid = ctx.extrude(plate, base);
  const textSolid = raised ? ctx.extrude(textSection, p.textHeight, base) : ctx.extrude(textSection, depth, base - depth);
  // The cutter pokes out of the top so the recess has no skin left over it.
  if (!raised) plateSolid = plateSolid.subtract(ctx.extrude(textSection, depth + 1, base - depth));

  let borderSolid = null;
  if (layers === 3) {
    const inner = plate.offset(-p.borderWidth, 'Round', 2, 48);
    const band = plate.subtract(inner);
    borderSolid = ctx.extrude(band, p.borderHeight, base);
    if (r.hole) borderSolid = borderSolid.subtract(ctx.extrude(r.hole.offset(p.ringWall * 0.5, 'Round', 2, 32), 50, -1));
  }

  const holeSolid = r.hole ? ctx.extrude(r.hole, 100, -10) : null;
  const cutHole = (m: ReturnType<typeof ctx.extrude>) => (holeSolid ? m.subtract(holeSolid) : m);

  const parts: Part[] = [];
  const group = 'keychain';
  const add = (m: ReturnType<typeof ctx.extrude> | null, name: string, color: RGB) => {
    if (!m) return;
    const part = ctx.part(cutHole(m), name, color, { group });
    if (part) parts.push(part);
  };

  if (layers === 1) {
    // One colour: raised letters are part of the plate; engraved letters are just the recess.
    add(p.textStyle === 'raised' ? plateSolid.add(textSolid) : plateSolid, 'Keychain', p.baseColor);
  } else {
    add(plateSolid, 'Plate', p.baseColor);
    if (p.textStyle !== 'engraved' || p.ams) add(p.textStyle === 'engraved' ? null : textSolid, 'Letters', p.textColor);
    if (p.textStyle === 'engraved') diagnostics.push({ level: 'info', message: 'Engraved letters are a recess in the plate. Fill them with paint, or choose Inlaid for a second filament.' });
    if (borderSolid) add(borderSolid, 'Border', p.borderColor);
  }

  if (!p.ams && layers > 1) {
    if (p.textStyle === 'inlay') diagnostics.push({ level: 'warning', message: 'Inlaid letters share layers with the plate, so they need a printer that swaps filament. Choose Raised letters, or turn the AMS option on.' });
    else if (layers === 3 && p.textStyle === 'raised' && Math.abs(p.borderHeight - p.textHeight) > 1e-6) {
      const low = Math.min(p.borderHeight, p.textHeight);
      diagnostics.push({ level: 'info', message: `Swap filament at ${base.toFixed(2)} mm, and again at ${(base + low).toFixed(2)} mm.` });
    } else if (p.textStyle === 'raised') {
      diagnostics.push({ level: 'info', message: `Without an AMS: add a pause at ${base.toFixed(2)} mm (the first layer of the letters) and swap filament there.` });
    }
  }
  return { parts, diagnostics };
}
