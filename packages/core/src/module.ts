/**
 * The module contract.
 *
 * A module is one folder under `modules/<id>/`:
 *
 *   module.json    identity (ModuleManifest), read by the hub and by tools/gen-registry
 *   params.json    the ParamSchema; the form is generated from it
 *   presets.json   named starting points (Preset[]), the first is shown as "Default"
 *   README.md      the help dialog and the catalogue description
 *   src/index.ts   `export default defineModule({ … })`
 *   src/worker.ts  the engine worker that runs the build
 *   src/build.ts   params in, BuildResult out
 *   src/ui.ts      optional: panels and inputs beyond the generated form
 *   tests/         a geometry test per preset
 *
 * A module imports @pf/* packages and exactly one engine. It never imports another module
 * or the hub.
 */
import type { BuildResult, Part } from './geometry';
import type { ParamSchema, ParamValue, ParamValues, Preset } from './params';
import type { Host, PickedFile } from './host';

export type Process = '3d-print' | 'laser' | 'cnc' | 'tool';
export type ExportFormat = '3mf' | 'stl' | 'obj' | 'svg' | 'dxf' | 'zip';
export type EngineKind = 'manifold' | 'openscad' | 'js';

export interface ModuleManifest {
  /** Stable slug: lowercase letters, digits and dashes. Never rename it. */
  id: string;
  name: string;
  /** One sentence for the card. */
  summary: string;
  description?: string;
  /** Semver. Saved in project files so `migrate()` knows what it is reading. */
  version: string;
  engine: EngineKind;
  process: Process;
  /** Generator Library's category slugs: storage, mechanical, signs-text, keychains, … */
  category?: string;
  tags?: string[];
  /** Formats offered by Export, best first. */
  exports: ExportFormat[];
  /** Generator Library ids this module replaces in the catalogue. */
  supersedes?: string[];
  /** Where the idea came from, for the credits line. */
  credits?: string;
  /**
   * How `pnpm shots` takes the gallery picture: a preset to show instead of the defaults,
   * and how much closer than the fitted view (default 1.4).
   */
  thumbnail?: { preset?: string; zoom?: number };
  /** Presets `pnpm shots` screenshots after the app itself (default: the first two). */
  screenshots?: string[];
  license?: string;
  author?: string;
  /** Which stage view opens first. */
  view?: '3d' | '2d';
}

export type InputValue = unknown;

/** What a module's `ui()` can do on top of the generated form. */
export interface ModuleUI {
  readonly host: Host;
  /** The current, coerced values. */
  values(): ParamValues;
  /** Sets a parameter as if the user had moved its control (the form follows). */
  set(name: string, value: ParamValue): void;
  /** Sets several at once; one rebuild. */
  setMany(values: Partial<ParamValues>): void;
  /**
   * Data the build needs that is not a parameter: a traced image, an imported font, a
   * loaded mesh. Structured-cloneable. Kept in project files unless `persist` is false.
   */
  setInput(key: string, value: InputValue, opts?: { persist?: boolean }): void;
  getInput<T = InputValue>(key: string): T | undefined;
  /** A section in a side panel; returns the element to fill. */
  panel(opts: { title: string; side?: 'left' | 'right'; id?: string; collapsed?: boolean }): HTMLElement;
  onValues(cb: (values: ParamValues) => void): () => void;
  onResult(cb: (result: BuildResult) => void): () => void;
  toast(message: string, kind?: 'info' | 'success' | 'warning' | 'error'): void;
  /** Files dropped on the generator that are not project files (images, fonts, meshes). */
  onDrop(cb: (file: PickedFile) => void): () => void;
  /** Builds again with the current values and inputs. */
  rebuild(): void;
  /**
   * Builds the current values with `values` changed, in the background, without showing it
   * (cards that preview alternatives). One at a time: a newer call replaces one still waiting,
   * which resolves null.
   */
  preview(values: Partial<ParamValues>): Promise<BuildResult | null>;
  /** A picture of parts from the iso view: a PNG data URL with a clear background. */
  picture(parts: readonly Part[], opts?: { width?: number; height?: number }): Promise<string>;
}

export interface ModuleDefinition {
  manifest: ModuleManifest;
  params: ParamSchema;
  presets?: Preset[];
  readme?: string;
  /** Starts the engine worker that runs this module's build. */
  createWorker(): Worker;
  /** Extra panels and inputs. Returns a teardown, called on unmount. */
  ui?(api: ModuleUI): void | (() => void);
  /**
   * Rewrites values saved by an older version (renamed or re-scaled parameters). The
   * result is coerced against the current schema afterwards, so only renames and unit
   * changes need handling.
   */
  migrate?(values: Record<string, unknown>, fromVersion: string): Record<string, unknown>;
  /** The base of export file names; defaults to the module id. */
  fileName?(values: ParamValues): string;
}

export function defineModule(def: ModuleDefinition): ModuleDefinition {
  return def;
}

export const MODULE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function validateManifest(m: ModuleManifest): string[] {
  const problems: string[] = [];
  if (!MODULE_ID.test(m.id)) problems.push(`id "${m.id}" is not a lowercase slug`);
  if (!m.name) problems.push('name is empty');
  if (!m.summary) problems.push('summary is empty');
  if (!/^\d+\.\d+\.\d+/.test(m.version ?? '')) problems.push(`version "${m.version}" is not semver`);
  if (!['manifold', 'openscad', 'js'].includes(m.engine)) problems.push(`engine "${m.engine}" is unknown`);
  if (!['3d-print', 'laser', 'cnc', 'tool'].includes(m.process)) problems.push(`process "${m.process}" is unknown`);
  if (!m.exports?.length) problems.push('exports is empty');
  return problems;
}
