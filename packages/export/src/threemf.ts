/**
 * 3MF with one filament per colour.
 *
 * The file carries the same assignment three ways, because each slicer reads its own:
 *
 * - Standard 3MF: a `<m:colorgroup>` and a `pid` on each mesh object, so any 3MF viewer
 *   shows the colours.
 * - Bambu Studio and Orca Slicer: `Metadata/model_settings.config` gives every part an
 *   `extruder`, and `Metadata/project_settings.config` lists the filament colours. Bambu
 *   Studio only reads those when the model carries the `BambuStudio:3mfVersion` metadata
 *   and namespace, so both are written.
 * - PrusaSlicer: `Metadata/Slic3r_PE_model.config` gives every volume an `extruder`.
 *
 * Parts that share a `group` become one object made of several parts (one body, several
 * filaments); different groups stay separately movable on the plate. Filament slots are
 * numbered by distinct colour in first-seen order.
 */
import type { Part, RGB } from '@pf/core';
import { emptyBounds, partBounds, printable, rgbToHex, sameColor } from '@pf/core';
import { strToU8, zipSync } from 'fflate';

export interface ThreeMFMeta {
  /** Shown as the model title in slicers. */
  title: string;
  /** The module that made it, e.g. "name-tag@1.2.0". */
  generator?: string;
  /** Free text: the settings, a share link. */
  description?: string;
  /** Build plate size; objects are centred on it. Default 256 × 256 (Bambu A1, P1, X1). */
  plate?: [number, number];
  /** Filament type per slot (default PLA). */
  filamentType?: string;
}

const NS_CORE = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
const NS_MATERIAL = 'http://schemas.microsoft.com/3dmanufacturing/material/2015/02';
const NS_BAMBU = 'http://schemas.bambulab.com/package/2021';

/** Distinct printable colours in first-seen order: index + 1 is the filament slot. */
export function palette(parts: readonly Part[]): RGB[] {
  const out: RGB[] = [];
  for (const p of printable(parts)) if (!out.some((c) => sameColor(c, p.color))) out.push(p.color);
  return out;
}

export function slotOf(pal: readonly RGB[], color: RGB): number {
  return pal.findIndex((c) => sameColor(c, color)) + 1;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function num(n: number): string {
  // 4 decimals = 0.1 µm; enough for any printer, and keeps files small.
  const r = Math.round(n * 1e4) / 1e4;
  return Object.is(r, -0) ? '0' : String(r);
}

function meshXml(p: Part): string {
  const v = p.positions;
  const parts: string[] = ['<mesh><vertices>'];
  for (let i = 0; i < v.length; i += 3) parts.push(`<vertex x="${num(v[i]!)}" y="${num(v[i + 1]!)}" z="${num(v[i + 2]!)}"/>`);
  parts.push('</vertices><triangles>');
  const t = p.indices;
  for (let i = 0; i < t.length; i += 3) parts.push(`<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>`);
  parts.push('</triangles></mesh>');
  return parts.join('');
}

interface Layout {
  groups: { name: string; parts: { part: Part; meshId: number }[]; objectId: number; dx: number; dy: number }[];
}

function layout(parts: Part[], plate: [number, number]): Layout {
  const byGroup = new Map<string, Part[]>();
  for (const p of parts) {
    const g = p.group ?? '';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(p);
  }
  // One translation for everything keeps the parts where the generator put them relative
  // to each other: centred on the plate as a whole, resting on the bed.
  const b = partBounds(parts, emptyBounds());
  const dx = plate[0] / 2 - (b.min[0] + b.max[0]) / 2;
  const dy = plate[1] / 2 - (b.min[1] + b.max[1]) / 2;
  let id = 1;
  const groups: Layout['groups'] = [];
  for (const [name, list] of byGroup) {
    const entries = list.map((part) => ({ part, meshId: ++id }));
    groups.push({ name: name || list[0]!.name, parts: entries, objectId: ++id, dx, dy });
  }
  return { groups };
}

function modelXml(parts: Part[], pal: RGB[], meta: ThreeMFMeta, lay: Layout): string {
  const zLift = -partBounds(parts).min[2];
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<model unit="millimeter" xml:lang="en-US" xmlns="${NS_CORE}" xmlns:m="${NS_MATERIAL}" xmlns:BambuStudio="${NS_BAMBU}">`);
  out.push('<metadata name="BambuStudio:3mfVersion">1</metadata>');
  out.push(`<metadata name="Title">${esc(meta.title)}</metadata>`);
  out.push(`<metadata name="Application">${esc(meta.generator ? `Print Factory (${meta.generator})` : 'Print Factory')}</metadata>`);
  if (meta.description) out.push(`<metadata name="Description">${esc(meta.description)}</metadata>`);
  out.push(`<metadata name="CreationDate">${new Date().toISOString().slice(0, 10)}</metadata>`);
  out.push('<resources>');
  out.push(`<m:colorgroup id="1">${pal.map((c) => `<m:color color="${rgbToHex(c).toUpperCase()}FF"/>`).join('')}</m:colorgroup>`);
  for (const g of lay.groups) {
    for (const { part, meshId } of g.parts) {
      const slot = slotOf(pal, part.color) - 1;
      out.push(`<object id="${meshId}" type="model" name="${esc(part.name)}" pid="1" pindex="${Math.max(0, slot)}">${meshXml(part)}</object>`);
    }
    out.push(`<object id="${g.objectId}" type="model" name="${esc(g.name)}"><components>`);
    for (const { meshId } of g.parts) out.push(`<component objectid="${meshId}"/>`);
    out.push('</components></object>');
  }
  out.push('</resources><build>');
  for (const g of lay.groups) out.push(`<item objectid="${g.objectId}" transform="1 0 0 0 1 0 0 0 1 ${num(g.dx)} ${num(g.dy)} ${num(zLift)}" printable="1"/>`);
  out.push('</build></model>');
  return out.join('\n');
}

function bambuModelSettings(pal: RGB[], lay: Layout): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>'];
  for (const g of lay.groups) {
    const first = slotOf(pal, g.parts[0]!.part.color);
    out.push(`  <object id="${g.objectId}">`);
    out.push(`    <metadata key="name" value="${esc(g.name)}"/>`);
    out.push(`    <metadata key="extruder" value="${first}"/>`);
    for (const { part, meshId } of g.parts) {
      out.push(`    <part id="${meshId}" subtype="normal_part">`);
      out.push(`      <metadata key="name" value="${esc(part.name)}"/>`);
      out.push(`      <metadata key="extruder" value="${slotOf(pal, part.color)}"/>`);
      out.push('    </part>');
    }
    out.push('  </object>');
  }
  out.push('  <plate>');
  out.push('    <metadata key="plater_id" value="1"/>');
  for (const g of lay.groups) {
    out.push('    <model_instance>');
    out.push(`      <metadata key="object_id" value="${g.objectId}"/>`);
    out.push('      <metadata key="instance_id" value="0"/>');
    out.push('    </model_instance>');
  }
  out.push('  </plate>');
  out.push('</config>');
  return out.join('\n');
}

function bambuProjectSettings(pal: RGB[], type: string): string {
  return JSON.stringify(
    {
      filament_colour: pal.map((c) => rgbToHex(c).toUpperCase()),
      filament_type: pal.map(() => type),
    },
    null,
    2,
  );
}

function prusaConfig(pal: RGB[], lay: Layout): string {
  // PrusaSlicer reads components as volumes of one object; volumes are listed by
  // triangle range over the object's merged mesh, in component order.
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>'];
  for (const g of lay.groups) {
    out.push(`<object id="${g.objectId}" instances_count="1">`);
    out.push(`<metadata type="object" key="name" value="${esc(g.name)}"/>`);
    let first = 0;
    for (const { part } of g.parts) {
      const n = part.indices.length / 3;
      out.push(`<volume firstid="${first}" lastid="${first + n - 1}">`);
      out.push(`<metadata type="volume" key="name" value="${esc(part.name)}"/>`);
      out.push(`<metadata type="volume" key="extruder" value="${slotOf(pal, part.color)}"/>`);
      out.push('</volume>');
      first += n;
    }
    out.push('</object>');
  }
  out.push('</config>');
  return out.join('\n');
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
<Default Extension="config" ContentType="text/xml"/>
<Default Extension="png" ContentType="image/png"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

export function buildThreeMF(allParts: readonly Part[], meta: ThreeMFMeta, thumbnail?: Uint8Array): Uint8Array {
  const parts = printable(allParts);
  if (!parts.length) throw new Error('Nothing to export: the model has no printable parts.');
  const pal = palette(parts);
  const lay = layout(parts, meta.plate ?? [256, 256]);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(RELS),
    '3D/3dmodel.model': strToU8(modelXml(parts, pal, meta, lay)),
    'Metadata/model_settings.config': strToU8(bambuModelSettings(pal, lay)),
    'Metadata/project_settings.config': strToU8(bambuProjectSettings(pal, meta.filamentType ?? 'PLA')),
    'Metadata/Slic3r_PE_model.config': strToU8(prusaConfig(pal, lay)),
    'Metadata/print-factory.txt': strToU8(
      [`title: ${meta.title}`, `generator: ${meta.generator ?? ''}`, `filaments: ${pal.map((c) => rgbToHex(c)).join(' ')}`, meta.description ? `settings: ${meta.description}` : ''].filter(Boolean).join('\n') + '\n',
    ),
  };
  if (thumbnail) files['Metadata/thumbnail.png'] = thumbnail;
  return zipSync(files, { level: 6 });
}
