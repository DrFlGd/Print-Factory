/** Turns a build result into the files each export button hands to the user. */
import type { BuildResult, ExportFormat, ModuleDefinition, ParamValues } from '@pf/core';
import { printable } from '@pf/core';
import { buildDXF, buildOBJ, buildSTL, buildSVG, buildThreeMF, buildZip, MIME } from '@pf/export';
import type { Bed } from '@pf/plate';
import { encodeSettings, makeProject } from '@pf/project';

export interface ExportFile {
  name: string;
  data: Uint8Array | string;
  mime: string;
}

export const FORMAT_LABELS: Record<ExportFormat, { label: string; hint: string }> = {
  '3mf': { label: '3MF', hint: 'Colours and parts kept, for Bambu Studio, Orca and PrusaSlicer' },
  stl: { label: 'STL', hint: 'One mesh, no colours' },
  obj: { label: 'OBJ', hint: 'Mesh with colours (OBJ + MTL in a zip)' },
  svg: { label: 'SVG', hint: 'Vector drawing in mm, one group per layer' },
  dxf: { label: 'DXF', hint: 'Vector drawing in mm for CAD and laser software' },
  zip: { label: 'Everything', hint: 'All formats and the project file in one zip' },
};

export function slug(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'model'
  );
}

export interface ExportContext {
  def: ModuleDefinition;
  values: ParamValues;
  inputs: Record<string, unknown>;
  result: BuildResult;
  bed: Bed;
  thumbnail?: () => Promise<Uint8Array | undefined>;
}

export function baseName(ctx: Pick<ExportContext, 'def' | 'values'>): string {
  return slug(ctx.def.fileName?.(ctx.values) ?? ctx.def.manifest.id);
}

export function available(def: ModuleDefinition, result: BuildResult | null): ExportFormat[] {
  if (!result) return [];
  const hasMesh = printable(result.parts).length > 0;
  const hasDrawing = Boolean(result.drawing?.layers.some((l) => l.contours.length || l.polylines?.length));
  return def.manifest.exports.filter((f) => (f === 'svg' || f === 'dxf' ? hasDrawing : f === 'zip' ? hasMesh || hasDrawing : hasMesh));
}

export async function exportFiles(format: ExportFormat, ctx: ExportContext): Promise<ExportFile> {
  const base = baseName(ctx);
  const { def, result } = ctx;
  const title = `${def.manifest.name} – ${base}`;
  switch (format) {
    case '3mf': {
      const thumb = await ctx.thumbnail?.().catch(() => undefined);
      const data = buildThreeMF(
        result.parts,
        { title, generator: `${def.manifest.id}@${def.manifest.version}`, description: `settings=${encodeSettings(def, ctx.values)}`, plate: ctx.bed.kind === 'printer' ? ctx.bed.size : undefined },
        thumb,
      );
      return { name: `${base}.3mf`, data, mime: MIME['3mf']! };
    }
    case 'stl':
      return { name: `${base}.stl`, data: buildSTL(result.parts, title), mime: MIME.stl! };
    case 'obj': {
      const { obj, mtl } = buildOBJ(result.parts, `${base}.mtl`);
      return { name: `${base}-obj.zip`, data: buildZip({ [`${base}.obj`]: obj, [`${base}.mtl`]: mtl }), mime: MIME.zip! };
    }
    case 'svg':
      return { name: `${base}.svg`, data: buildSVG(result.drawing!, { title }), mime: MIME.svg! };
    case 'dxf':
      return { name: `${base}.dxf`, data: buildDXF(result.drawing!), mime: MIME.dxf! };
    case 'zip': {
      const files: Record<string, Uint8Array | string> = {};
      for (const f of available(def, result)) {
        if (f === 'zip') continue;
        const one = await exportFiles(f, ctx);
        files[one.name] = one.data;
      }
      // One STL per part as well, for slicers that do colours by part.
      const parts = printable(result.parts);
      if (parts.length > 1 && def.manifest.exports.includes('stl')) for (const p of parts) files[`parts/${slug(p.name)}.stl`] = buildSTL([p], p.name);
      files[`${base}.project.json`] = JSON.stringify(makeProject(def, ctx.values, ctx.inputs), null, 2);
      return { name: `${base}.zip`, data: buildZip(files), mime: MIME.zip! };
    }
  }
}
