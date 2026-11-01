// Ported from Jerred's Image LED Lightbox (DrFlGd/Generator-Standalone), MIT.
//
// A print-ready open lightbox plus a separate glue-on diffuser with multicolour inlays.
// Both sit on Z=0, next to each other on the build plate. The diffuser's total
// thickness INCLUDES its 0.4 mm colour face; no floating or overlapping slicer parts.
import type { BuildResult, Contour, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold, ManifoldContext } from '@pf/engine-manifold';
import { poleOf, signedArea } from '@pf/shapes';
import { marqueeCircles, sampleMarqueeHoles, type Path, type Point } from './marquee';

export type WireExit = 'none' | 'side' | 'back' | 'both' | 'single' | 'dual';
export type BorderColor = 'none' | 'white' | 'black';
export type MarqueeLayout = 'none' | 'outer' | 'border' | 'regions';
export type LipPlacement = 'none' | 'cover' | 'box';

export interface Params {
  size: number;
  depth: number;
  wall: number;
  back: number;
  ledgeWidth: number;
  ledgeHeight: number;
  wireExit: WireExit;
  holeDiameter: number;
  /** Angles of the radial side exits (0° = right, 90° = top). */
  hole1Angle: number;
  hole2Angle: number;
  /** Position in the available wall height, 0% nearest the back, 100% nearest the front. */
  hole1Depth: number;
  hole2Depth: number;
  diffuserThickness: number;
  includeColors: boolean;
  borderColor: BorderColor;
  borderWidth: number;
  lipPlacement: LipPlacement;
  lipWidth: number;
  lipHeight: number;
  /** Radial clearance per side. */
  lipClearance: number;
  marqueeLayout: MarqueeLayout;
  marqueeCount: number;
  marqueeDiameter: number;
  marqueeInset: number;
  /** Arc-length shift along every selected closed marquee contour, in millimetres. */
  marqueeShift: number;
  shellColor: RGB;
  diffuserColor: RGB;
  bandColor: RGB;
}

/** What the build reads from the "image" input (the shell's PreparedImage). */
export interface LightboxImage {
  width: number;
  height: number;
  silhouette: Contour[];
  regions: { color: RGB; contours: Contour[] }[];
}

const FACE_LAYER = 0.4;
const PLATE_GAP = 12;

/** A 1 × 0.64 rectangle with clipped corners: the box before an image is chosen. */
export const DEFAULT_OUTLINE: Contour = [-0.48, -0.32, 0.48, -0.32, 0.5, -0.3, 0.5, 0.3, 0.48, 0.32, -0.48, 0.32, -0.5, 0.3, -0.5, -0.3];

const toPoints = (c: Contour): Path => {
  const out: Path = [];
  for (let i = 0; i < c.length; i += 2) out.push([c[i]!, c[i + 1]!]);
  return out;
};

/** First intersection of a ray from an interior point with the silhouette boundary. */
function rayDistance(outline: Path, origin: Point, direction: Point): number {
  let nearest = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const cross = direction[0] * ey - direction[1] * ex;
    if (Math.abs(cross) < 1e-9) continue;
    const ox = a[0] - origin[0];
    const oy = a[1] - origin[1];
    const t = (ox * ey - oy * ex) / cross;
    const u = (ox * direction[1] - oy * direction[0]) / cross;
    if (t > 1e-5 && u >= -1e-7 && u <= 1 + 1e-7) nearest = Math.min(nearest, t);
  }
  return nearest;
}

function projected(c: Contour, cx: number, cy: number, scale: number): Contour {
  const out = new Array<number>(c.length);
  for (let i = 0; i < c.length; i += 2) {
    out[i] = (c[i]! - cx) * scale;
    out[i + 1] = (c[i + 1]! - cy) * scale;
  }
  return out;
}

/** The single largest outside silhouette of the image (or the default box). */
export function outlineOf(image: LightboxImage | undefined): Contour {
  if (!image?.silhouette?.length) return DEFAULT_OUTLINE;
  let best: Contour | null = null;
  let bestArea = 0;
  for (const c of image.silhouette) {
    const a = signedArea(c);
    if (a > bestArea) {
      bestArea = a;
      best = c;
    }
  }
  return best ?? DEFAULT_OUTLINE;
}

export function build(ctx: ManifoldContext<Params>): BuildResult {
  const p = ctx.params;
  const { size, depth, wall, back, ledgeWidth, ledgeHeight, wireExit, holeDiameter, diffuserThickness, lipPlacement, lipWidth, lipHeight, lipClearance, borderColor, borderWidth } = p;
  const image = ctx.inputs.image as LightboxImage | undefined;
  const outline = outlineOf(image);
  const artwork = image?.regions ?? [];
  const diagnostics: Diagnostic[] = [];
  const note = (message: string, level: Diagnostic['level'] = 'info') => diagnostics.push({ level, message });

  if (outline.length < 6) throw new Error('Load an image with a solid outer silhouette.');
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < outline.length; i += 2) {
    minX = Math.min(minX, outline[i]!);
    maxX = Math.max(maxX, outline[i]!);
    minY = Math.min(minY, outline[i + 1]!);
    maxY = Math.max(maxY, outline[i + 1]!);
  }
  const extX = maxX - minX;
  const extY = maxY - minY;
  const longest = Math.max(extX, extY);
  if (!(longest > 0.001) || back + ledgeHeight >= depth - 1) throw new Error('Increase box depth or decrease the back and LED ledge heights.');
  if (!(diffuserThickness >= FACE_LAYER + 0.19)) throw new Error('Diffuser must be at least 0.6 mm thick.');
  if (lipPlacement === 'box' && diffuserThickness - lipHeight - 0.05 < 0.5) {
    throw new Error('Lip on box requires a thicker diffuser (at least lip height + 0.55 mm) to leave a solid roof over its receiving groove.');
  }
  if (lipPlacement === 'cover' && depth - back - ledgeHeight < lipHeight + 0.7) {
    throw new Error('Lip on cover needs more clearance above the LED shelf: increase box depth or reduce lip height.');
  }
  const scale = size / longest;
  const cx = (maxX + minX) / 2;
  const cy = (maxY + minY) / 2;
  const width = extX * scale;
  const height = extY * scale;
  const contour = projected(outline, cx, cy, scale);
  const points = toPoints(contour);
  if (Math.abs(signedArea(contour)) < 30) throw new Error('The traced silhouette has almost no printable area.');

  // Pack along the shorter bounding dimension. Two 120 mm squares with 12 mm separation
  // fit a 256 mm bed; the shell checks the chosen printer.
  const move: [number, number] = width <= height ? [width + PLATE_GAP, 0] : [0, height + PLATE_GAP];

  const off = (s: CrossSection, d: number) => s.offset(d, 'Round', 2, 16);
  const outer = ctx.cs([contour], 'EvenOdd');
  const interior = off(outer, -wall);
  if (interior.isEmpty()) throw new Error('This silhouette is too thin for the selected wall thickness.');
  const ledgeInside = off(interior, -ledgeWidth);
  if (ledgeInside.isEmpty()) throw new Error('There is no room for the LED ledge. Enlarge the model or reduce ledge width.');
  const innerContours = ctx.contours(ledgeInside);
  if (!innerContours.length) throw new Error('The LED ledge leaves no usable centre opening.');
  const inner = innerContours.slice().sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0]!;
  const pole = poleOf([inner], 0.2);
  const spot: Point = [pole.x, pole.y];

  const outerVol = ctx.extrude(outer, depth);
  const cavity = ctx.extrude(interior, depth - back + 0.15, back);
  const wallAndBack = outerVol.subtract(cavity);
  const ledgeProfile = interior.subtract(ledgeInside);
  const ledge = ctx.extrude(ledgeProfile, ledgeHeight + 0.05, back - 0.04);
  let shell = wallAndBack.add(ledge);
  const cylinder = (len: number) => ctx.Manifold.cylinder(len, holeDiameter / 2, holeDiameter / 2, 40);

  if (wireExit === 'back' || wireExit === 'both') {
    if (pole.radius < holeDiameter / 2 + 0.3) throw new Error('Not enough space for the rear cable hole. Reduce its diameter.');
    shell = shell.subtract(cylinder(back + 2).translate([spot[0], spot[1], -1]));
  }
  if (wireExit === 'side' || wireExit === 'both') {
    const sideZ = back + Math.max(ledgeHeight + 2, (depth - back) * 0.5);
    if (sideZ + holeDiameter / 2 >= depth - 0.5) throw new Error('Increase box depth or reduce the side hole diameter.');
    const reach = width + holeDiameter + 6;
    shell = shell.subtract(cylinder(reach).rotate([0, 90, 0]).translate([spot[0], spot[1], sideZ]));
    if (width > 3 * height) note('Inspect the side exit on long or irregular silhouettes.', 'warning');
  }
  if (wireExit === 'single' || wireExit === 'dual') {
    // Each hole travels from the hollow interior radially through the FIRST outline wall
    // it meets. Unlike a full-width bore this cannot drill the far side of a concave or
    // narrow silhouette.
    const freeHeight = depth - back - holeDiameter - 1.2;
    if (freeHeight < 0) throw new Error('Increase box depth or reduce cable hole diameter for positioned side exits.');
    const positions: [number, number][] = wireExit === 'single' ? [[p.hole1Angle, p.hole1Depth]] : [[p.hole1Angle, p.hole1Depth], [p.hole2Angle, p.hole2Depth]];
    for (const [angle, fromBack] of positions) {
      const radians = (angle * Math.PI) / 180;
      const direction: Point = [Math.cos(radians), Math.sin(radians)];
      const hit = rayDistance(points, spot, direction);
      if (!Number.isFinite(hit) || hit < wall + 0.2) throw new Error('Could not place a wire exit at this angle. Try a different angle or a larger silhouette.');
      const start = Math.max(0, hit - wall - ledgeWidth - holeDiameter / 2 - 1);
      const reach = hit + holeDiameter / 2 + 2 - start;
      const z = back + holeDiameter / 2 + 0.6 + (freeHeight * fromBack) / 100;
      const drill = cylinder(reach)
        .rotate([0, 90, 0])
        .rotate([0, 0, angle])
        .translate([spot[0] + direction[0] * start, spot[1] + direction[1] * start, z]);
      shell = shell.subtract(drill);
    }
    if (width > 3 * height || height > 3 * width) note('Inspect radial side exits on highly elongated silhouettes.', 'warning');
  }
  // In box-lip mode, an integral male ridge stands above the outer wall's rim. Its
  // mating female groove is carved into the underside of the diffuser.
  if (lipPlacement === 'box') {
    const ridgeOuter = off(outer, -wall * 0.45);
    const ridgeInside = off(ridgeOuter, -lipWidth);
    if (ridgeInside.isEmpty()) throw new Error('Lip is too wide for this silhouette; enlarge the box or reduce lip width.');
    shell = shell.add(ctx.extrude(ridgeOuter.subtract(ridgeInside), lipHeight + 0.04, depth - 0.02));
  }
  const parts: Part[] = [];
  const shellPart = ctx.part(shell, 'LED lightbox shell', p.shellColor, { group: 'Lightbox shell' });
  if (!shellPart) throw new Error('The silhouette could not form a printable lightbox.');
  parts.push(shellPart);

  // A flat diffuser sits ON TOP OF the walls, glued along their full rim. It has the same
  // outer outline, so unlike an undersized insert it cannot fall inside. The white base
  // and complementary white top are fused into one printable body.
  const hasArtwork = p.includeColors && artwork.length > 0;
  // A registration lip or groove needs the underside facing UP while printing, so the
  // artwork prints face-down on the bed. Without a lip the face is up. Both layouts keep
  // every region on the bed.
  const faceDown = lipPlacement !== 'none';
  const faceBottom = faceDown ? 0 : diffuserThickness - FACE_LAYER;
  const bottomHeight = hasArtwork ? diffuserThickness - FACE_LAYER : diffuserThickness;
  const backing = ctx.extrude(outer, bottomHeight, hasArtwork && faceDown ? FACE_LAYER : 0);
  // Export waits until the same through-holes are removed from the white backing and
  // every separate coloured or black filament object.
  const overlays: { solid: Manifold; name: string; color: RGB }[] = [];
  const colorProfiles: CrossSection[] = [];
  let whiteCover = backing;
  if (hasArtwork) {
    // Insetting the artwork leaves a solid face band. A black band becomes its own
    // 0.4 mm filament object, never overlapping the white face.
    const inset = borderColor === 'none' ? 0.2 : borderWidth;
    if (inset * 2 >= Math.min(width, height)) throw new Error('Image border is too wide for this silhouette. Reduce border width.');
    // Shrink the whole traced image rather than cropping its edge: uniform scaling keeps
    // its proportions. Clip to the offset profile only where a concave edge needs it.
    const imageScale = borderColor === 'none' ? 1 : Math.min((width - inset * 2) / width, (height - inset * 2) / height);
    const insetArea = off(outer, -inset);
    const imageArea = borderColor === 'none' ? insetArea : insetArea.intersect(ctx.cs([contour.map((v) => v * imageScale)], 'EvenOdd'));
    if (imageArea.isEmpty()) throw new Error('Image border is too wide for this silhouette. Reduce border width.');
    const blackBand = borderColor === 'black' ? outer.subtract(imageArea) : null;
    let combined: CrossSection | null = null;
    const prepared: { cross: CrossSection; name: string; color: RGB }[] = [];
    artwork.slice(0, 6).forEach((region, i) => {
      const transformed = region.contours.map((c) => projected(c, cx, cy, scale * imageScale));
      if (!transformed.length) return;
      // Drop specks under 0.25 mm² and keep at most 120 pieces per colour.
      const pieces = ctx
        .cs(transformed, 'EvenOdd')
        .decompose()
        .filter((s) => s.area() >= 0.25)
        .sort((a, b) => b.area() - a.area())
        .slice(0, 120);
      if (!pieces.length) return;
      const clipped = ctx.CrossSection.union(pieces).intersect(imageArea);
      if (clipped.isEmpty()) return;
      combined = combined ? combined.add(clipped) : clipped;
      prepared.push({ cross: clipped, name: `Artwork colour ${i + 1}`, color: region.color });
      colorProfiles.push(clipped);
    });
    if (prepared.length && combined) {
      let whiteTop = outer.subtract(combined);
      if (blackBand) whiteTop = whiteTop.subtract(blackBand);
      if (!whiteTop.isEmpty()) whiteCover = backing.add(ctx.extrude(whiteTop, FACE_LAYER, faceBottom));
      for (const region of prepared) overlays.push({ solid: ctx.extrude(region.cross, FACE_LAYER, faceBottom), name: region.name, color: region.color });
      if (blackBand && !blackBand.isEmpty()) overlays.push({ solid: ctx.extrude(blackBand, FACE_LAYER, faceBottom), name: 'Black artwork border', color: p.bandColor });
    } else {
      note('The image had no printable colour regions; made a plain diffuser.', 'warning');
      whiteCover = ctx.extrude(outer, diffuserThickness);
    }
  }
  if (lipPlacement === 'cover') {
    // The diffuser's tongue nests inside the shell wall, with clearance on each side so
    // the mating faces are not coincident.
    const tongueOuter = off(interior, -lipClearance);
    const tongueInner = off(tongueOuter, -lipWidth);
    if (tongueInner.isEmpty()) throw new Error('The cover lip has no inner opening. Reduce its width or increase the design size.');
    whiteCover = whiteCover.add(ctx.extrude(tongueOuter.subtract(tongueInner), lipHeight + 0.02, diffuserThickness - 0.01));
  } else if (lipPlacement === 'box') {
    // Oversize both edges of the ridge's groove by the clearance. The groove opens upward
    // in the print orientation; the colour face is printed against the bed and keeps a
    // roof of at least 0.5 mm when assembled.
    const grooveOuter = off(outer, -wall * 0.45 + lipClearance);
    const grooveInner = off(outer, -wall * 0.45 - lipWidth - lipClearance);
    if (grooveInner.isEmpty()) throw new Error('The diffuser groove does not fit this silhouette. Reduce lip width or tolerance.');
    whiteCover = whiteCover.subtract(ctx.extrude(grooveOuter.subtract(grooveInner), lipHeight + 0.12, diffuserThickness - lipHeight - 0.08));
    if (whiteCover.isEmpty()) throw new Error('Groove removed the diffuser. Increase diffuser thickness or reduce lip width.');
  }
  if (lipPlacement !== 'none') note('Registration lip: test the fit with a short print; the clearance is radial, per side.');

  if (p.marqueeLayout !== 'none') {
    if (p.marqueeLayout === 'border' && borderColor !== 'black') throw new Error('Select a black artwork border to place marquee holes along the black band.');
    if (p.marqueeLayout === 'border' && (!hasArtwork || p.marqueeInset + p.marqueeDiameter / 2 + 0.25 > borderWidth)) {
      throw new Error('Marquee holes need a wider black border, a smaller inset or smaller diameter.');
    }
    if (p.marqueeLayout === 'regions' && !colorProfiles.length) throw new Error('Colour-edge marquee layout requires printable traced image colours.');
    const paths: Path[] = [];
    if (p.marqueeLayout === 'regions') {
      // Offset the printable colour profiles, cutouts included: the inside of each
      // coloured section gets its own row of lights.
      for (const profile of colorProfiles) {
        const insetProfile = off(profile, -p.marqueeInset);
        if (!insetProfile.isEmpty()) paths.push(...ctx.contours(insetProfile).map(toPoints));
      }
    } else {
      // An outer row works without artwork. Black-border mode follows the visible band at
      // an adjustable centreline inset.
      const insetProfile = off(outer, -p.marqueeInset);
      if (!insetProfile.isEmpty()) paths.push(...ctx.contours(insetProfile).map(toPoints));
    }
    const positions = sampleMarqueeHoles(paths, p.marqueeCount, p.marqueeDiameter, points, wall + 0.35, p.marqueeShift);
    const bores2d = ctx.CrossSection.ofPolygons(marqueeCircles(positions, p.marqueeDiameter), 'Positive');
    // Overshoot both faces, including a raised diffuser lip.
    const bores = ctx.extrude(bores2d, diffuserThickness + lipHeight + 2, -1);
    whiteCover = whiteCover.subtract(bores);
    for (const o of overlays) o.solid = o.solid.subtract(bores);
    note(`${positions.length} marquee holes: fit and secure individual LEDs after printing.`);
  }

  const coverPart = ctx.part(whiteCover.translate([move[0], move[1], 0]), 'Translucent diffuser', p.diffuserColor, { group: 'Diffuser cover' });
  if (!coverPart) throw new Error('Could not generate the diffuser cover.');
  parts.push(coverPart);
  let coloured = 0;
  for (const o of overlays) {
    const part = ctx.part(o.solid.translate([move[0], move[1], 0]), o.name, o.color, { group: 'Diffuser cover' });
    if (part) {
      parts.push(part);
      coloured++;
    }
  }
  if (coloured) note('Colour appearance depends on translucent filament and the LEDs; print a small light test first.');
  if (!image) note('Choose an image to shape the lightbox and colour its face. Until then it is a plain box.');
  else if (image.silhouette.length > 1) note('Only the largest outside shape of the image becomes the box; separate islands are left out.');
  return { parts, diagnostics };
}
