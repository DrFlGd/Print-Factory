/**
 * What a module's settings look like at rest: project files, share links, autosave,
 * presets the user saved, and undo history.
 *
 * Values are always stored as the difference from the module's defaults, so a project
 * saved today still opens after a new parameter is added (it simply takes its default),
 * and share links stay short.
 */
import type { KeyValueStore, ModuleDefinition, ParamValues, Preset } from '@pf/core';
import { coerceValues, defaults, diffFromDefaults } from '@pf/core';
import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';

export const PROJECT_FORMAT = 'print-factory-project';

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  /** File layout version; bumped only if this shape changes. */
  version: 1;
  module: string;
  moduleVersion: string;
  name?: string;
  saved: string;
  /** Only values that differ from the defaults. */
  values: Partial<ParamValues>;
  /** Non-parameter data (traced images, imported fonts). */
  inputs?: Record<string, unknown>;
}

export function makeProject(def: ModuleDefinition, values: ParamValues, inputs: Record<string, unknown> = {}, name?: string): ProjectFile {
  const p: ProjectFile = {
    format: PROJECT_FORMAT,
    version: 1,
    module: def.manifest.id,
    moduleVersion: def.manifest.version,
    saved: new Date().toISOString(),
    values: diffFromDefaults(def.params, values),
  };
  if (name) p.name = name;
  if (Object.keys(inputs).length) p.inputs = inputs;
  return p;
}

export class ProjectError extends Error {}

/** Parses a project file and checks it belongs to this module. */
export function readProject(text: string, def?: ModuleDefinition): ProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError('This file is not a project file (it is not JSON).');
  }
  const p = raw as Partial<ProjectFile>;
  if (p?.format !== PROJECT_FORMAT || typeof p.module !== 'string' || typeof p.values !== 'object') throw new ProjectError('This file is not a Print Factory project.');
  if (def && p.module !== def.manifest.id) throw new ProjectError(`This project was made with “${p.module}”, not ${def.manifest.name}.`);
  return p as ProjectFile;
}

/** The project's values for the current module version: migrated, then coerced. */
export function projectValues(def: ModuleDefinition, p: Pick<ProjectFile, 'values' | 'moduleVersion'>): ParamValues {
  let v: Record<string, unknown> = { ...p.values };
  if (def.migrate && p.moduleVersion !== def.manifest.version) v = def.migrate(v, p.moduleVersion);
  return coerceValues(def.params, { ...defaults(def.params), ...v });
}

/* --------------------------------------------------------------- share links */

function toBase64Url(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** Settings as a compact URL-safe token: deflated JSON of the non-default values. */
export function encodeSettings(def: ModuleDefinition, values: ParamValues): string {
  const diff = diffFromDefaults(def.params, values);
  if (!Object.keys(diff).length) return '';
  return toBase64Url(zlibSync(strToU8(JSON.stringify({ v: def.manifest.version, p: diff })), { level: 9 }));
}

export function decodeSettings(def: ModuleDefinition, token: string): ParamValues {
  if (!token) return defaults(def.params);
  try {
    const { v, p } = JSON.parse(strFromU8(unzlibSync(fromBase64Url(token)))) as { v: string; p: Record<string, unknown> };
    return projectValues(def, { values: p as Partial<ParamValues>, moduleVersion: v });
  } catch {
    throw new ProjectError('This share link is damaged or incomplete.');
  }
}

/* --------------------------------------------------------------- storage */

const AUTOSAVE = (id: string) => `autosave:${id}`;
const PRESETS = (id: string) => `presets:${id}`;

export async function loadAutosave(store: KeyValueStore, def: ModuleDefinition): Promise<{ values: ParamValues; inputs: Record<string, unknown> } | null> {
  const p = await store.get<ProjectFile>(AUTOSAVE(def.manifest.id)).catch(() => undefined);
  if (!p?.values) return null;
  try {
    return { values: projectValues(def, p), inputs: p.inputs ?? {} };
  } catch {
    return null;
  }
}

export function saveAutosave(store: KeyValueStore, def: ModuleDefinition, values: ParamValues, inputs: Record<string, unknown>): Promise<void> {
  return store.set(AUTOSAVE(def.manifest.id), makeProject(def, values, inputs));
}

export function clearAutosave(store: KeyValueStore, def: ModuleDefinition): Promise<void> {
  return store.delete(AUTOSAVE(def.manifest.id));
}

export async function userPresets(store: KeyValueStore, moduleId: string): Promise<Preset[]> {
  return ((await store.get<Preset[]>(PRESETS(moduleId)).catch(() => undefined)) ?? []).filter((p) => p && p.id && p.values);
}

export async function saveUserPreset(store: KeyValueStore, def: ModuleDefinition, name: string, values: ParamValues): Promise<Preset> {
  const list = await userPresets(store, def.manifest.id);
  const preset: Preset = { id: `user-${Date.now().toString(36)}`, name, values: diffFromDefaults(def.params, values) };
  await store.set(PRESETS(def.manifest.id), [...list.filter((p) => p.name !== name), preset]);
  return preset;
}

export async function deleteUserPreset(store: KeyValueStore, moduleId: string, id: string): Promise<void> {
  const list = await userPresets(store, moduleId);
  await store.set(
    PRESETS(moduleId),
    list.filter((p) => p.id !== id),
  );
}

/* --------------------------------------------------------------- history */

/**
 * Undo and redo over whole value sets. Changes that arrive within `mergeMs` of each other
 * (a slider being dragged) become one step.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private last = 0;

  constructor(
    private current: T,
    private readonly limit = 200,
    private readonly mergeMs = 600,
  ) {}

  get value(): T {
    return this.current;
  }

  push(next: T, now = Date.now()): void {
    if (now - this.last > this.mergeMs || !this.past.length) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.last = now;
    this.current = next;
    this.future = [];
  }

  /** Ends the current merge window, so the next change is its own step. */
  seal(): void {
    this.last = 0;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): T | undefined {
    const prev = this.past.pop();
    if (prev === undefined) return undefined;
    this.future.push(this.current);
    this.current = prev;
    this.last = 0;
    return prev;
  }

  redo(): T | undefined {
    const next = this.future.pop();
    if (next === undefined) return undefined;
    this.past.push(this.current);
    this.current = next;
    this.last = 0;
    return next;
  }
}

/* --------------------------------------------------------------- stores */

/** An in-memory store, for tests and for hosts with nothing better. */
export function memoryStore(): KeyValueStore {
  const m = new Map<string, unknown>();
  return {
    async get(k) {
      return structuredClone(m.get(k)) as never;
    },
    async set(k, v) {
      m.set(k, structuredClone(v));
    },
    async delete(k) {
      m.delete(k);
    },
    async keys(prefix = '') {
      return [...m.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

/** localStorage under a prefix; falls back to memory when storage is blocked. */
export function localStore(prefix = 'pf:'): KeyValueStore {
  let ls: Storage | null = null;
  try {
    ls = globalThis.localStorage ?? null;
    ls?.getItem('x');
  } catch {
    ls = null;
  }
  if (!ls) return memoryStore();
  const s = ls;
  return {
    async get(k) {
      try {
        const v = s.getItem(prefix + k);
        return v == null ? undefined : JSON.parse(v);
      } catch {
        return undefined;
      }
    },
    async set(k, v) {
      try {
        s.setItem(prefix + k, JSON.stringify(v));
      } catch {
        /* quota or blocked: autosave is a convenience */
      }
    },
    async delete(k) {
      try {
        s.removeItem(prefix + k);
      } catch {
        /* ignore */
      }
    },
    async keys(p = '') {
      const out: string[] = [];
      try {
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          if (k?.startsWith(prefix + p)) out.push(k.slice(prefix.length));
        }
      } catch {
        /* ignore */
      }
      return out;
    },
  };
}
