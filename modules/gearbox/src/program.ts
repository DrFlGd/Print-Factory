/**
 * GearBox on the OpenSCAD engine: the form's values become `-D` defines for
 * scad/gearbox.scad, one render per part. A kit renders each of its parts once and lays
 * every copy out on print beds; its assembled view is two renders, the printed parts and
 * the hardware.
 */
import type { BuildResult, Diagnostic, Part, RGB } from '@pf/core';
import type { RenderedJob, ScadJob, ScadProgram } from '@pf/engine-openscad';
import { WORK_DIR } from '@pf/engine-openscad';
import { packRects } from '@pf/shapes';
import { files } from './files';
import {
  catalog,
  catalogPart,
  defines,
  kitHardware,
  kitInSize,
  kitParts,
  parseTolerances,
  partKind,
  validate,
  type Joint,
  type Overrides,
  type Params as KindParams,
  type Profile,
  type Size,
} from './parts';
import { ASSEMBLED, fieldFor, fitField } from './schema';

import { kindParams, type Params } from './naming';

export type { Params };
export { kindParams, partName } from './naming';

export const PRINT_COLOR: RGB = [237, 140, 43];
export const HARDWARE_COLOR: RGB = [158, 163, 171];

/** The bed GearBox lays kits out for, and the gaps it leaves. */
export const BED = 220;
const GAP = 6;
const MARGIN = 5;
const PLATE_GAP = 30;

const TOLERANCES = parseTolerances();

/** The profile's fits moved by the form's adjustments; only the ones moved. */
export function overridesOf(v: Params): Overrides {
  const out: Overrides = {};
  const profile = String(v.profile) as Profile;
  for (const t of TOLERANCES) {
    const d = Number(v[fitField(t.key)] ?? 0);
    if (d) out[t.key] = Math.round((t.values[profile] + d) * 1000) / 1000;
  }
  return out;
}

function boundsOf(p: Float32Array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p[i + k]!);
      max[k] = Math.max(max[k]!, p[i + k]!);
    }
  return { min, max };
}

/** A kit's parts with how many of each, from the catalog. */
export function kitItems(kitId: string, joint: Joint) {
  const kit = catalog.kits[kitId]!;
  const counts = new Map<string, number>();
  for (const n of kitParts(kit, joint)) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].flatMap(([name, qty]) => {
    const p = catalogPart(name);
    return p ? [{ name, title: p.title, qty, params: p.params }] : [];
  });
}

function plan(v: Params) {
  const size = String(v.size) as Size;
  const profile = String(v.profile) as Profile;
  const joint = String(v.joint) as Joint;
  const overrides = overridesOf(v);
  const diagnostics: Diagnostic[] = [];
  const jobs: ScadJob[] = [];
  const std = catalog.standards[size];

  if (v.mode === 'kit') {
    const kitId = String(v.kit);
    const kit = catalog.kits[kitId];
    if (!kit) return { jobs, diagnostics: [{ level: 'error' as const, message: `There is no kit called ${kitId}.` }] };
    if (!kitInSize(kitId, size)) {
      return { jobs, diagnostics: [{ level: 'error' as const, message: `The ${kit.title.toLowerCase()} is not made in ${size}: some of its parts do not fit the ${std.grid} mm grid. Pick another size.` }] };
    }
    const hardware = [...kitHardware(kit, joint), `bolt lengths ${Object.entries(std.bolt_lengths).map(([l, mm]) => `${l} level${l === '1' ? '' : 's'} ${mm} mm`).join(', ')}`];
    diagnostics.push({ level: 'info', message: `Hardware for the ${kit.title.toLowerCase()} in ${size}: ${hardware.join('; ')}.` });
    let view = String(v.kit_view);
    if (view !== 'print' && !ASSEMBLED.has(kitId)) {
      diagnostics.push({ level: 'info', message: `The ${kit.title.toLowerCase()} has no assembled picture; showing its print layout.` });
      view = 'print';
    }
    if (view !== 'print') {
      const base = { kit: kitId, explode: view === 'exploded' ? 1 : 0 };
      jobs.push(
        { name: 'Printed parts', defines: defines('assembly', { ...base, layer: 'printed' }, size, profile, overrides, joint), color: PRINT_COLOR },
        { name: 'Hardware', defines: defines('assembly', { ...base, layer: 'hardware' }, size, profile, overrides, joint), color: HARDWARE_COLOR, optional: true },
      );
      diagnostics.push({ level: 'info', message: 'This is a picture to build from, hardware in grey. Switch Show to Print layout for the parts to print.' });
      return { jobs, diagnostics, summary: `${kit.title}, ${view}` };
    }
    for (const it of kitItems(kitId, joint)) {
      const { part, ...params } = it.params;
      jobs.push({ name: it.name, defines: defines(String(part), params, size, profile, overrides, joint), color: PRINT_COLOR });
    }
    return { jobs, diagnostics };
  }

  const kindId = String(v.part);
  const params = kindParams(kindId, v);
  const problem = validate(kindId, params, size);
  if (problem) return { jobs, diagnostics: [{ level: 'error' as const, message: problem }] };
  const name = partKind(kindId)!.name(params);
  jobs.push({ name: `${name}-${size}`, defines: defines(kindId, params, size, profile, overrides, joint), color: PRINT_COLOR });
  return { jobs, diagnostics, summary: `${partKind(kindId)!.title} ${name}, ${size}, ${profile}` };
}

/** Every copy of every kit part, flat on the bed and spaced apart. */
function layKit(v: Params, rendered: RenderedJob[]): { parts: Part[]; plates: number } {
  const items = kitItems(String(v.kit), String(v.joint) as Joint);
  const copies: Part[] = [];
  for (const r of rendered) {
    if (!r.part) continue;
    const qty = items.find((it) => it.name === r.job.name)?.qty ?? 1;
    for (let k = 0; k < qty; k++) {
      copies.push({ ...r.part, name: qty > 1 ? `${r.part.name} ${k + 1}` : r.part.name, group: `${r.part.name}#${k}`, positions: k ? r.part.positions.slice() : r.part.positions, indices: k ? r.part.indices.slice() : r.part.indices });
    }
  }
  const boxes = copies.map((c) => boundsOf(c.positions));
  const { placements, sheets } = packRects(
    boxes.map((b, i) => ({ id: String(i), w: b.max[0]! - b.min[0]!, h: b.max[1]! - b.min[1]!, rotate: true })),
    BED,
    BED,
    GAP,
    MARGIN,
  );
  for (const at of placements) {
    const i = Number(at.id);
    const b = boxes[i]!;
    const p = copies[i]!.positions;
    // A quarter turn about the box's corner when the packer turned it, then onto its spot.
    const cx = b.min[0]!;
    const cy = b.min[1]!;
    const h = b.max[1]! - b.min[1]!;
    const ox = at.sheet * (BED + PLATE_GAP) + MARGIN + at.x;
    const oy = MARGIN + at.y;
    for (let j = 0; j < p.length; j += 3) {
      const x = p[j]! - cx;
      const y = p[j + 1]! - cy;
      p[j] = ox + (at.rotated ? h - y : x);
      p[j + 1] = oy + (at.rotated ? x : y);
      p[j + 2] = p[j + 2]! - b.min[2]!;
    }
  }
  return { parts: copies, plates: sheets };
}

export const program: ScadProgram<Params> = {
  id: 'gearbox',
  files,
  entry: `${WORK_DIR}/gearbox.scad`,
  plan,
  finish(result: BuildResult, v: Params, rendered: RenderedJob[]): BuildResult {
    if (v.mode !== 'kit' || (String(v.kit_view) !== 'print' && ASSEMBLED.has(String(v.kit)))) return result;
    const { parts, plates } = layKit(v, rendered);
    const kit = catalog.kits[String(v.kit)]!;
    const diagnostics = [...(result.diagnostics ?? [])];
    if (plates > 1) diagnostics.push({ level: 'info', message: `The kit needs ${plates} beds of ${BED} mm; they are laid side by side. Print them one at a time.` });
    return { ...result, parts, diagnostics, summary: `${kit.title}: ${parts.length} part${parts.length === 1 ? '' : 's'} on ${plates} bed${plates === 1 ? '' : 's'} (${BED} mm), ${String(v.size)}` };
  },
};
