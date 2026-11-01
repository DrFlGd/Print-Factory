/**
 * The parameter schema: one description of a generator's settings that the form, the
 * presets, project files, share links and every engine read.
 *
 * It is a superset of the shape SCAD Workshop extracts from OpenSCAD's Customizer
 * (`schema/params.schema.json` there): `show_if` is accepted as an alias of `showIf`, and
 * `fromCustomizer()` converts OpenSCAD's own `--export-format=param` output.
 */
import type { RGB } from './geometry';
import { compileExpression, identifiers } from './expr';

export type Unit = 'mm' | 'deg' | '%' | 'u' | 'x' | 's' | '';

interface ParamBase {
  /** Key in the params object. Letters, digits and underscores. */
  name: string;
  label?: string;
  /** Section in the form; parameters keep their order within a group. */
  group?: string;
  /** One sentence; shown as the field's help. */
  description?: string;
  /** Expression over other parameters; the field is hidden (and its value kept) when false. */
  showIf?: string;
  /** SCAD Workshop's spelling of `showIf`. */
  show_if?: string;
  /** Never shown; still saved and passed to the build. */
  hidden?: boolean;
  /** Folded under "More settings" in its group. */
  advanced?: boolean;
}

export interface NumberParam extends ParamBase {
  type: 'number' | 'integer';
  default: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: Unit;
  /** `slider` (default when min and max are set) or a plain number box. */
  widget?: 'slider' | 'number';
}

export interface BooleanParam extends ParamBase {
  type: 'boolean';
  default: boolean;
}

export interface EnumOption {
  value: string | number;
  label?: string;
  description?: string;
}

export interface EnumParam extends ParamBase {
  type: 'enum';
  default: string | number;
  options: EnumOption[];
  /** `select` (default), `segmented` (a row of buttons, for up to about five) or `cards`. */
  widget?: 'select' | 'segmented' | 'cards';
}

export interface StringParam extends ParamBase {
  type: 'string';
  default: string;
  maxLength?: number;
  multiline?: boolean;
  placeholder?: string;
}

export interface ColorParam extends ParamBase {
  type: 'color';
  default: RGB;
  /** Swatches offered first. */
  palette?: RGB[];
}

export interface FontParam extends ParamBase {
  type: 'font';
  /** A font id from @pf/text's catalogue, or `custom:<hash>` for an imported file. */
  default: string;
}

export interface VectorParam extends ParamBase {
  type: 'vector';
  default: number[];
  min?: number;
  max?: number;
  step?: number;
  unit?: Unit;
  /** Labels per component ("X", "Y", "Z"). */
  labels?: string[];
}

export type Param = NumberParam | BooleanParam | EnumParam | StringParam | ColorParam | FontParam | VectorParam;

export interface ParamSchema {
  /** Group order. Groups not listed come after, in the order they first appear. */
  groups?: string[];
  parameters: Param[];
}

export type ParamValue = number | boolean | string | RGB | number[];
export type ParamValues = Record<string, ParamValue>;

export interface Preset {
  id: string;
  name: string;
  description?: string;
  /** Only the values that differ from the defaults. */
  values: Partial<ParamValues>;
}

export function condition(p: Param): string | undefined {
  return p.showIf ?? p.show_if;
}

export function defaults(schema: ParamSchema): ParamValues {
  const out: ParamValues = {};
  for (const p of schema.parameters) out[p.name] = clone(p.default);
  return out;
}

function clone<T>(v: T): T {
  return Array.isArray(v) ? (v.slice() as T) : v;
}

/** Clamps a number to a numeric parameter's range and step. */
export function clampNumber(p: NumberParam | VectorParam, v: number): number {
  let x = v;
  if (p.min !== undefined) x = Math.max(p.min, x);
  if (p.max !== undefined) x = Math.min(p.max, x);
  if (p.type === 'integer') x = Math.round(x);
  else if (p.step && p.step > 0) {
    const base = p.min ?? 0;
    x = base + Math.round((x - base) / p.step) * p.step;
    // Floating-point noise from the division (0.1 * 3 = 0.30000000000000004).
    const decimals = Math.max(0, -Math.floor(Math.log10(p.step)) + 1);
    x = Number(x.toFixed(Math.min(decimals, 10)));
    if (p.max !== undefined) x = Math.min(p.max, x);
  }
  return x;
}

/**
 * One value made valid for its parameter, or the parameter's default when it cannot be.
 * Used on everything that arrives from outside: project files, share links, presets, a
 * module's old version.
 */
export function coerceValue(p: Param, v: unknown): ParamValue {
  switch (p.type) {
    case 'number':
    case 'integer': {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      return typeof n === 'number' && isFinite(n) ? clampNumber(p, n) : p.default;
    }
    case 'boolean':
      if (typeof v === 'boolean') return v;
      if (v === 'true' || v === 1) return true;
      if (v === 'false' || v === 0) return false;
      return p.default;
    case 'enum': {
      const hit = p.options.find((o) => o.value === v || String(o.value) === String(v));
      return hit ? hit.value : p.default;
    }
    case 'string': {
      if (typeof v !== 'string') return p.default;
      return p.maxLength ? v.slice(0, p.maxLength) : v;
    }
    case 'font':
      return typeof v === 'string' && v ? v : p.default;
    case 'color': {
      if (Array.isArray(v) && v.length === 3 && v.every((c) => typeof c === 'number' && isFinite(c))) {
        return v.map((c) => Math.max(0, Math.min(255, Math.round(c)))) as RGB;
      }
      if (typeof v === 'string' && /^#?[0-9a-f]{3,6}$/i.test(v)) {
        const h = v.replace('#', '');
        const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
        const n = parseInt(full, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      return clone(p.default);
    }
    case 'vector': {
      if (!Array.isArray(v) || v.length !== p.default.length) return clone(p.default);
      return v.map((c, i) => (typeof c === 'number' && isFinite(c) ? clampNumber(p, c) : p.default[i]!));
    }
  }
}

/**
 * A full, valid set of values: `raw` merged over the defaults, each value coerced, unknown
 * keys dropped.
 */
export function coerceValues(schema: ParamSchema, raw: unknown): ParamValues {
  const out = defaults(schema);
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const p of schema.parameters) {
    if (p.name in src) out[p.name] = coerceValue(p, src[p.name]);
  }
  return out;
}

/** Whether a parameter's field is shown for these values. A broken expression shows it. */
export function isVisible(p: Param, values: ParamValues): boolean {
  if (p.hidden) return false;
  const c = condition(p);
  if (!c) return true;
  try {
    return Boolean(compileExpression(c)(values));
  } catch {
    return true;
  }
}

/** Only the values that differ from the defaults, for share links and presets. */
export function diffFromDefaults(schema: ParamSchema, values: ParamValues): Partial<ParamValues> {
  const out: Partial<ParamValues> = {};
  for (const p of schema.parameters) {
    const v = values[p.name];
    if (v === undefined) continue;
    if (JSON.stringify(v) !== JSON.stringify(p.default)) out[p.name] = v;
  }
  return out;
}

export function applyPreset(schema: ParamSchema, preset: Preset): ParamValues {
  return coerceValues(schema, { ...defaults(schema), ...preset.values });
}

/** Groups in display order, each with its parameters in schema order. */
export function grouped(schema: ParamSchema): { group: string; params: Param[] }[] {
  const order = [...(schema.groups ?? [])];
  for (const p of schema.parameters) {
    const g = p.group ?? '';
    if (!order.includes(g)) order.push(g);
  }
  return order
    .map((group) => ({ group, params: schema.parameters.filter((p) => (p.group ?? '') === group) }))
    .filter((g) => g.params.length > 0);
}

export function labelOf(p: Param): string {
  if (p.label) return p.label;
  return p.name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Checks a schema for the mistakes that otherwise surface as a silently wrong form:
 * duplicate names, defaults outside their range, enum defaults that are not an option,
 * conditions that do not parse or name a parameter that does not exist.
 */
export function validateSchema(schema: ParamSchema): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  for (const p of schema.parameters) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name)) problems.push(`${p.name}: not a valid name`);
    if (names.has(p.name)) problems.push(`${p.name}: duplicate name`);
    names.add(p.name);
    if ((p.type === 'number' || p.type === 'integer') && p.min !== undefined && p.max !== undefined) {
      if (p.min > p.max) problems.push(`${p.name}: min is above max`);
      if (p.default < p.min || p.default > p.max) problems.push(`${p.name}: default ${p.default} outside ${p.min}..${p.max}`);
    }
    if (p.type === 'enum' && !p.options.some((o) => o.value === p.default)) {
      problems.push(`${p.name}: default ${String(p.default)} is not one of its options`);
    }
  }
  for (const p of schema.parameters) {
    const c = condition(p);
    if (!c) continue;
    try {
      compileExpression(c);
      for (const id of identifiers(c)) if (!names.has(id)) problems.push(`${p.name}: showIf reads unknown "${id}"`);
    } catch (e) {
      problems.push(`${p.name}: showIf does not parse (${(e as Error).message})`);
    }
  }
  return problems;
}

