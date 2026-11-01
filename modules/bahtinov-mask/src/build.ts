/**
 * Bahtinov focusing mask: a disc over the telescope's aperture with three gratings, and a
 * collar that slides over the tube.
 *
 * One half of the aperture has slits square to the dividing line; the other half is split
 * in two, its slits turned by ±angle. Each grating throws a diffraction spike square to its
 * slits, so a star shows a fixed X and a middle spike that crosses the X's centre only in
 * focus. The slit pitch is the focal length divided by the Bahtinov factor (150 to 200), which
 * spaces the spikes so they are easy to read on the sensor or at the eyepiece.
 *
 * It prints face down: the mask on the bed, the collar rising from it.
 */
import type { BuildResult, Diagnostic, RGB } from '@pf/core';
import type { CrossSection, ManifoldContext } from '@pf/engine-manifold';
import { circle, rect, rotate, translate } from '@pf/shapes';

export interface Params {
  focalLength: number;
  aperture: number;
  tubeDiameter: number;
  factor: number;
  angle: number;
  slitShare: number;
  obstruction: number;
  spineWidth: number;
  dividerWidth: number;
  maskThickness: number;
  collarDepth: number;
  collarWall: number;
  clearance: number;
  tab: boolean;
  color: RGB;
}

type Ctx = ManifoldContext<Params>;

/** The grating's pitch, the slit and the bar between slits, in mm. */
export function grating(p: Params): { pitch: number; slit: number; bar: number } {
  const pitch = p.focalLength / Math.max(50, p.factor);
  const slit = pitch * Math.min(0.8, Math.max(0.2, p.slitShare));
  return { pitch, slit, bar: pitch - slit };
}

/** Slits of `slit` width every `pitch`, turned by `deg`, over a square `size` across. */
function stripes(ctx: Ctx, size: number, pitch: number, slit: number, deg: number): CrossSection {
  const n = Math.ceil(size / pitch) + 1;
  const bars = [];
  // A slit straddles each line k·pitch, so the gratings meet the spine symmetrically.
  for (let k = -n; k <= n; k++) bars.push(translate([rect(size * 2, slit)], 0, k * pitch)[0]!);
  return ctx.cs(rotate(bars, deg), 'NonZero');
}

export function build(ctx: Ctx): BuildResult {
  const p = ctx.params;
  const notes: Diagnostic[] = [];
  const { pitch, slit, bar } = grating(p);
  const Ra = p.aperture / 2;
  const Rin = p.tubeDiameter / 2 + Math.max(0, p.clearance);
  const Rout = Rin + Math.max(0.8, p.collarWall);
  if (Ra > Rin - 0.5) notes.push({ level: 'warning', message: 'The aperture is as wide as the tube: the gratings are clipped to the inside of the collar.' });
  const Rg = Math.min(Ra, Rin - 0.5);

  const disc = (r: number) => ctx.cs([circle(r, 256)]);
  const size = Rg * 2 + 4;
  // The three areas, the dividing line upright through the middle: left half, upper right
  // quarter and lower right quarter, each cut back by half the spine or divider.
  const s2 = p.spineWidth / 2;
  const d2 = p.dividerWidth / 2;
  const left = ctx.cs([rect(size, size * 2)]).translate([-size / 2 - s2, 0]);
  const upper = ctx.cs([rect(size, size)]).translate([size / 2 + s2, size / 2 + d2]);
  const lower = ctx.cs([rect(size, size)]).translate([size / 2 + s2, -size / 2 - d2]);
  let open = disc(Rg);
  if (p.obstruction > 0) open = open.subtract(disc(p.obstruction / 2));
  const raw = ctx.CrossSection.union([
    open.intersect(left).intersect(stripes(ctx, size, pitch, slit, 0)),
    open.intersect(upper).intersect(stripes(ctx, size, pitch, slit, p.angle)),
    open.intersect(lower).intersect(stripes(ctx, size, pitch, slit, -p.angle)),
  ]);
  // Drop the slivers where a slit meets the rim, spine or divider at a slant: too thin to print
  // or cut cleanly, and they add nothing to the spikes.
  const r = Math.min(0.4, slit * 0.3);
  const slits = raw.offset(-r, 'Miter', 2).offset(r, 'Miter', 2);

  let face = disc(Rout);
  // A pull tab on the rim, in line with the dividing line.
  if (p.tab) face = face.add(ctx.cs([[-8, Rout - 3, 8, Rout - 3, 6, Rout + 9, -6, Rout + 9]]).add(disc(6).translate([0, Rout + 7])));
  const t = Math.max(0.8, p.maskThickness);
  const plate = face.subtract(slits);
  let mask = ctx.extrude(plate, t);
  if (p.collarDepth > 0) mask = mask.add(ctx.extrude(disc(Rout).subtract(disc(Rin)), p.collarDepth, t));

  if (bar < 0.8 || slit < 0.8) notes.push({ level: 'warning', message: `The ${bar < slit ? 'bars' : 'slits'} are ${Math.min(bar, slit).toFixed(2)} mm wide, thin for a 0.4 mm nozzle. A lower factor gives a coarser grating.` });
  notes.push({ level: 'info', message: `Pitch ${pitch.toFixed(2)} mm: slits ${slit.toFixed(2)} mm, bars ${bar.toFixed(2)} mm, turned ±${p.angle}°.` });
  const part = ctx.part(mask, 'Bahtinov mask', p.color);
  return {
    parts: part ? [part] : [],
    // The flat mask for a laser (acrylic, card or thin plywood); the collar is printed or taped.
    drawing: { layers: [{ name: 'Cut', operation: 'cut', color: [255, 0, 0], contours: ctx.contours(plate) }] },
    diagnostics: notes,
    summary: `Ø${(Rout * 2).toFixed(1)} mm, collar Ø${(Rin * 2).toFixed(1)} mm inside`,
  };
}
