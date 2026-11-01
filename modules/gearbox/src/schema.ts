/**
 * The form, derived from GearBox's part table so the two never disagree. params.json is
 * this function's output, checked in (tests/params.test.ts compares them; run the tests
 * with GEARBOX_PARAMS=write to rewrite it).
 *
 * Part kinds share parameter names (`teeth`, `level`, `throw`, …) but not always their
 * choices: a bevel gear comes in 20 or 40 teeth, a gear in 20 to 80. Each distinct set of
 * choices is its own field: the commonest keeps the name, the others are suffixed with
 * the first part that uses them (`teeth_bevel`). `fieldFor` maps a part's own parameter
 * back to its field.
 */
import type { Param, ParamSchema } from '@pf/core';
import { ASSEMBLY_KITS, PART_KINDS, PART_GROUPS, LEGACY_GROUP, SIZES, PROFILES, JOINTS, JOINT_TITLES, catalog, parseTolerances, type ParamDef, type PartKind } from './parts';

/** Parts made in Part mode: everything but the kit picture, which Kit mode shows. */
export const FORM_KINDS = PART_KINDS.filter((k) => k.id !== 'assembly');

/** Kits in menu order: those with an assembled picture first, as GearBox lists them. */
export const KIT_IDS = Object.keys(catalog.kits);

const signature = (d: ParamDef) =>
  JSON.stringify(d.type === 'select' ? { l: d.label, t: 'select', o: d.options.map((o) => [o.value, o.label]) } : { l: d.label, t: 'number', min: d.min, max: d.max, step: d.step });

interface Field {
  name: string;
  def: ParamDef;
  kinds: PartKind[];
}

function fields(): Field[] {
  const byKey = new Map<string, Map<string, PartKind[]>>();
  for (const k of FORM_KINDS) {
    for (const d of k.params) {
      const sigs = byKey.get(d.key) ?? new Map<string, PartKind[]>();
      byKey.set(d.key, sigs);
      const s = signature(d);
      sigs.set(s, [...(sigs.get(s) ?? []), k]);
    }
  }
  const out: Field[] = [];
  for (const [key, sigs] of byKey) {
    const ranked = [...sigs.entries()].sort((a, b) => b[1].length - a[1].length);
    ranked.forEach(([, kinds], i) => {
      const def = kinds[0]!.params.find((d) => d.key === key)!;
      out.push({ name: i === 0 ? key : `${key}_${kinds[0]!.id}`, def, kinds });
    });
  }
  return out;
}

const FIELDS = fields();

/** The form field that carries part `kindId`'s parameter `key`. */
export function fieldFor(kindId: string, key: string): string {
  return FIELDS.find((f) => f.def.key === key && f.kinds.some((k) => k.id === kindId))?.name ?? key;
}

const oneOf = (name: string, ids: string[]) => (ids.length === 1 ? `${name} == '${ids[0]}'` : `(${ids.map((id) => `${name} == '${id}'`).join(' || ')})`);

/** The value a field starts at: what its first part starts at. */
function startValue(f: Field): string | number {
  const k = f.kinds[0]!;
  const v = k.defaults[f.def.key];
  if (v !== undefined) return v;
  return f.def.type === 'select' ? f.def.options[0]!.value : f.def.min;
}

function fieldParam(f: Field): Param {
  const d = f.def;
  const base = {
    name: f.name,
    label: d.label,
    group: 'Part settings',
    ...(d.help ? { description: d.help[0]!.toUpperCase() + d.help.slice(1) + (/[.!?]$/.test(d.help) ? '' : '.') } : {}),
    showIf: `mode == 'part' && ${oneOf('part', f.kinds.map((k) => k.id))}`,
  };
  if (d.type === 'select') {
    const widget = d.options.length <= 3 && d.options.every((o) => o.label.length <= 16) ? { widget: 'segmented' as const } : {};
    return { ...base, type: 'enum', default: startValue(f), options: d.options.map((o) => ({ value: o.value, label: o.label[0]!.toUpperCase() + o.label.slice(1) })), ...widget };
  }
  return { ...base, type: Number.isInteger(d.step) ? 'integer' : 'number', default: Number(startValue(f)), min: d.min, max: d.max, step: d.step, ...(/mm/.test(d.label) ? { unit: 'mm' as const, label: d.label.replace(/\s*\(mm\)/, '') } : {}) };
}

/** Fit names from tolerances.scad as field names: `fit_bearing_bore_d`. */
export const fitField = (key: string) => `fit_${key}`;

export function schema(): ParamSchema {
  const groupOf = (k: PartKind) => (PART_GROUPS.includes(k.group) ? PART_GROUPS.indexOf(k.group) : k.group === LEGACY_GROUP ? 98 : 99);
  const kinds = [...FORM_KINDS].sort((a, b) => groupOf(a) - groupOf(b));
  const kitLabel = (id: string) => catalog.kits[id]!.title;
  const parameters: Param[] = [
    {
      name: 'mode',
      label: 'Make',
      type: 'enum',
      group: 'Make',
      default: 'part',
      widget: 'cards',
      options: [
        { value: 'part', label: 'One part', description: 'Any part with your own options' },
        { value: 'kit', label: 'A kit', description: 'Every part of a kit, laid out to print, or put together' },
      ],
    },
    {
      name: 'part',
      label: 'Part',
      type: 'enum',
      group: 'Make',
      default: 'gear',
      showIf: "mode == 'part'",
      options: kinds.map((k) => ({ value: k.id, label: k.title, description: k.group })),
    },
    {
      name: 'kit',
      label: 'Kit',
      type: 'enum',
      group: 'Make',
      default: 'starter',
      showIf: "mode == 'kit'",
      options: KIT_IDS.map((id) => ({ value: id, label: kitLabel(id) })),
    },
    {
      name: 'kit_view',
      label: 'Show',
      type: 'enum',
      group: 'Make',
      default: 'print',
      widget: 'segmented',
      description: 'Print layout is every part to print. Assembled and Exploded are a picture to build from, with the hardware in grey; not every kit has one.',
      showIf: "mode == 'kit'",
      options: [
        { value: 'print', label: 'Print layout' },
        { value: 'assembled', label: 'Assembled' },
        { value: 'exploded', label: 'Exploded' },
      ],
    },
    {
      name: 'size',
      label: 'Size',
      type: 'enum',
      group: 'Size',
      default: 'M2',
      widget: 'cards',
      description: 'Pick one size for a board: parts do not mix.',
      options: SIZES.map((s) => {
        const st = catalog.standards[s];
        return { value: s, label: s, description: `${st.grid} mm grid, ${st.bolt} bolts, ${st.bearing.split(' ')[0]} bearings` };
      }),
    },
    ...FIELDS.map(fieldParam),
    {
      name: 'joint',
      label: 'Gear joints',
      type: 'enum',
      group: 'Print and fit',
      default: 'jaws',
      description: 'How stacked parts join. Jaws need no hardware; dowel pins are the older joint; pins + screws add a screw clamp on parts with room.',
      options: JOINTS.map((j) => ({ value: j, label: JOINT_TITLES[j] })),
      widget: 'segmented',
    },
    {
      name: 'profile',
      label: 'Filament',
      type: 'enum',
      group: 'Print and fit',
      default: 'PETG',
      description: 'Sets every fit and clearance for that material. Print the fit test coupon first and tune below.',
      options: PROFILES.map((p) => ({ value: p, label: p })),
      widget: 'segmented',
    },
    ...parseTolerances().map(
      (t): Param => ({
        name: fitField(t.key),
        label: t.key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
        type: 'number',
        group: 'Print and fit',
        advanced: true,
        default: 0,
        min: -0.5,
        max: 0.5,
        step: 0.01,
        unit: 'mm',
        description: `Added to the profile's value (PLA ${t.values.PLA}, PETG ${t.values.PETG}, ABS ${t.values.ABS}): ${t.what}.`,
      }),
    ),
  ];
  return { groups: ['Make', 'Size', 'Part settings', 'Print and fit'], parameters };
}

/** Kits that have an assembled picture. */
export const ASSEMBLED = new Set(ASSEMBLY_KITS.map(([id]) => id));
