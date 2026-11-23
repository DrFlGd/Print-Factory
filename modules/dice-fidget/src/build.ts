import type { BuildResult, Diagnostic, Part, RGB } from '@pf/core';
import type { Manifold, ManifoldContext } from '@pf/engine-manifold';
import { circle, namedShape, rect, rectSize } from '@pf/shapes';
import { text } from '@pf/text';
import { CAP_WALL, HOUSING_CLEAR, MX, stemPost, switchDummy } from '../../clicker/src/switch';
import { dot, faceOutline, normals, type Vec } from './dice';

export interface Params {
  die: string;
  coreRadius: number;
  preview: boolean;
  shape: string;
  profile: string;
  size: number;
  recessed?: boolean;
  recessDepth?: number;
  switchRecessed?: boolean;
  switchDepth?: number;
  legend: string;
  labels: string;
  font: string;
  socketFit: number;
  stemFit: number;
}

function onFace(solid: Manifold, [x, y, z]: Vec, radius: number) {
  const degrees = 180 / Math.PI;
  return solid
    .translate([0, 0, radius])
    .rotate([0, Math.atan2(Math.hypot(x, y), z) * degrees, Math.atan2(y, x) * degrees]);
}

export async function build(ctx: ManifoldContext<Params>): Promise<BuildResult> {
  const p = ctx.params;
  const faces = normals(p.die);
  const recess = p.recessed ? Math.min(6, Math.max(1, p.recessDepth ?? 5)) : 0;
  const switchDepth = p.switchRecessed ? Math.min(16, Math.max(1, p.switchDepth ?? 12)) : 0;
  const mountDepth = recess + switchDepth;
  const panels = faces.map((face) => {
    const matched = p.shape === 'face' ? faceOutline(faces, face, p.size) : null;
    const outline = ctx.cs([matched?.contour ?? namedShape(p.shape, p.size, p.size)]);
    return { outline, matched };
  });
  const pocketDepth = MX.pinsBelow + 1;
  // Keep each full-depth pocket and moving panel in its own angular sector.
  const closest = Math.max(...faces.flatMap((a, i) => faces.slice(i + 1).map((b) => dot(a, b))));
  const slope = Math.tan(Math.acos(closest) / 2);
  const housingWidth = MX.housing + 2 * HOUSING_CLEAR;
  // Die-body size depends ONLY on its switch pockets and die topology, never on
  // panel width or panel outline. The previous formula used p.size and the panel
  // contours, silently inflating the core whenever users enlarged a cap.
  //
  // A 19 mm reference face (the original default) preserves existing default
  // body dimensions. More faces may still need a larger minimum for MX switches.
  const referencePanel = 19;
  const referenceReach = Math.max(
    referencePanel / Math.SQRT2,
    ...faces.flatMap(face => {
      const contour = faceOutline(faces, face, referencePanel).contour;
      const lengths: number[] = [];
      for (let i = 0; i < contour.length; i += 2) lengths.push(Math.hypot(contour[i]!, contour[i + 1]!));
      return lengths;
    }),
  );
  const requiredCoreRadius = Math.ceil(
    Math.max(
      switchDepth ? mountDepth + (Math.max(housingWidth / Math.SQRT2, referenceReach + HOUSING_CLEAR) + 2) / slope : 0,
      mountDepth + Math.max(
        pocketDepth + (MX.pocket / Math.SQRT2 + 1.2) / slope,
        (referenceReach + 1) / slope,
      ),
    ),
  );
  // 0 means automatically use the hardware-safe minimum. A manual core radius
  // lets the centre grow independently; requests below the minimum are clamped.
  const radius = Math.max(requiredCoreRadius, Math.ceil(p.coreRadius || 0));
  const maximumPanelReach = Math.max(
    ...panels.flatMap(({ outline }) =>
      outline.toPolygons().flatMap(poly => poly.map(([x, y]) => Math.hypot(x, y))),
    ),
  );
  const safePanelReach = Math.max(0, (radius - mountDepth) * slope - 2);
  const panelOverhang = maximumPanelReach > safePanelReach + 1e-4;
  const span = radius * 8;
  let body = ctx.Manifold.cube([span, span, span], true);
  for (const [x, y, z] of faces) body = body.trimByPlane([-x, -y, -z], -radius);
  const hole = MX.cutout + p.socketFit;
  const cutter = ctx
    .extrude([rect(hole, hole)], MX.plate + 1.1, -MX.plate - 0.1)
    .add(ctx.extrude([rect(MX.pocket, MX.pocket)], pocketDepth - MX.plate, -pocketDepth));
  const plateRadius = radius - mountDepth;
  const housing = ctx.cs([rect(housingWidth, housingWidth)]);
  // The rim moves with the stem. Relieve the outer face wherever the rim
  // crosses it at full travel, leaving a clearance below and beside the rim.
  const wellDepth = Math.max(switchDepth, mountDepth + recess + MX.travel + HOUSING_CLEAR - MX.stemTop);
  const sockets = faces.map((n, i) => {
    let socket = cutter;
    if (mountDepth) socket = socket.add(ctx.extrude(housing, mountDepth + 0.1));
    if (wellDepth > 0) {
      // Keep a recessed panel's well inside the selected core's face. Oversize
      // panels may overhang, but may not remove material from adjacent face pockets.
      let well = panels[i]!.outline.offset(HOUSING_CLEAR);
      if (panelOverhang) {
        const safe = ctx.cs([circle(Math.max(1, safePanelReach - HOUSING_CLEAR), 96)]);
        well = well.intersect(safe);
      }
      if (!well.isEmpty()) socket = socket.add(ctx.extrude(well, wellDepth + 0.1, mountDepth - wellDepth));
    }
    return onFace(socket, n, plateRadius);
  });
  body = body.subtract(ctx.union(sockets)).translate([0, 0, radius]);
  const parts: Part[] = [];
  const add = (solid: Manifold, name: string, color: RGB, preview = false) => {
    const part = ctx.part(solid, name, color, {
      group: preview ? 'Assembly' : name,
      role: preview ? 'preview' : undefined,
    });
    if (part) parts.push(part);
  };
  add(body, 'Die body', [53, 76, 101]);
  const height = 3;
  const post = stemPost(ctx, p.stemFit, MX.insert + 0.05).translate([0, 0, -MX.insert]);
  const labels = p.labels.split(/\r?\n/);
  const missing = new Set<string>();
  const box = body.boundingBox();
  const assemblyOffset: Vec = [
    box.min[0] - box.max[0] - 2 * (MX.stemTop + height) - 6,
    0,
    radius + MX.stemTop + height,
  ];
  const hardware = p.preview ? switchDummy(ctx) : null;
  if (hardware)
    add(body.translate([assemblyOffset[0], 0, assemblyOffset[2] - radius]), 'Assembled body', [53, 76, 101], true);
  const pitch = p.size + 3;
  const cols = Math.ceil(Math.sqrt(faces.length));
  for (let i = 0; i < faces.length; i++) {
    const { matched, outline } = panels[i]!;
    let panel =
      p.profile === 'bevel' ? ctx.edged(outline, height, { top: 1.2, style: 'chamfer' }) : ctx.extrude(outline, height);
    if (p.profile === 'dished') {
      const depth = 1.1;
      const r = ((p.size * p.size) / 4 + depth * depth) / (2 * depth);
      panel = panel.subtract(ctx.Manifold.sphere(r, 96).translate([0, 0, height + r - depth]));
    }
    const skin = panel.subtract(panel.translate([0, 0, -0.65]));
    const legend =
      p.legend === 'numbers'
        ? String(i + 1)
        : p.legend === 'letters'
          ? String.fromCharCode(65 + i)
          : p.legend === 'custom'
            ? labels[i]?.trim()
            : '';
    let cap = panel;
    if (legend) {
      const glyphs = await text(p.font, legend, { capHeight: 8 }, ctx.inputs);
      glyphs.missing.forEach((c) => missing.add(c));
      if (glyphs.contours.length) {
        const b = rectSize(glyphs.bounds);
        const labelSpan = matched ? 2 * (matched.labelRadius - 1.4) : p.size * 0.7;
        const scale = Math.min(1, labelSpan / Math.hypot(b.width, b.height));
        const section = ctx.cs(glyphs.contours, 'NonZero').translate([-b.cx, -b.cy]).scale([scale, scale]);
        cap = cap.subtract(ctx.extrude(section, height + 1).intersect(skin));
      }
    }
    if (recess) {
      const rim = outline.subtract(outline.offset(-CAP_WALL)).subtract(housing);
      // Remove thin slivers where a small or pointed panel crosses the housing.
      const printableRim = rim.offset(-0.5).offset(0.5).intersect(rim);
      if (!printableRim.isEmpty()) cap = cap.add(ctx.extrude(printableRim, recess + 0.05, -recess));
    }
    cap = cap.add(post);
    if (hardware) {
      const n = faces[i]!;
      add(onFace(hardware, n, plateRadius).translate(assemblyOffset), `Switch ${i + 1}`, [76, 80, 80], true);
      add(
        onFace(cap, n, plateRadius + MX.stemTop).translate(assemblyOffset),
        `Mounted panel ${i + 1}`,
        [226, 151, 81],
        true,
      );
    }
    const bounds = cap.boundingBox();
    const cx = (bounds.min[0] + bounds.max[0]) / 2;
    const cy = (bounds.min[1] + bounds.max[1]) / 2;
    cap = cap
      .translate([-cx, -cy, 0])
      .rotate([180, 0, 0])
      .translate([
        box.max[0] + pitch / 2 + 2 + (i % cols) * pitch,
        box.min[1] + pitch / 2 + Math.floor(i / cols) * pitch,
        height,
      ]);
    add(cap, `Panel ${i + 1}`, [226, 151, 81]);
  }
  const diagnostics: Diagnostic[] = [];
  if (p.coreRadius > 0 && p.coreRadius < requiredCoreRadius)
    diagnostics.push({ level: 'warning', message:
      'The selected core radius is too small for the ' + p.die.toUpperCase() +
      ' switch hardware. Using the safe minimum of ' + requiredCoreRadius + ' mm instead.' });
  if (panelOverhang)
    diagnostics.push({ level: 'warning', message:
      'Panel width exceeds the available core face. The core will NOT grow automatically. ' +
      'Reduce panel width or increase Core radius to at least ' +
      Math.ceil(mountDepth + (maximumPanelReach + 2) / slope) +
      ' mm to avoid overhanging or interfering panels.' });
  if (missing.size) diagnostics.push({ level: 'warning', message: `Missing glyphs: ${[...missing].join(' ')}.` });
  return {
    parts,
    diagnostics,
    summary: `${p.die.toUpperCase()} · ${faces.length} MX switches · one body and ${faces.length} press-on panels`,
  };
}
