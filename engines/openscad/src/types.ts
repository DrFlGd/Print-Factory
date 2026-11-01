/**
 * What an OpenSCAD module gives the engine: its .scad sources, the entry file, and a plan
 * that turns parameter values into one or more renders.
 */
import type { BuildResult, Diagnostic, Part, PartRole, RGB } from '@pf/core';

/** One OpenSCAD run: the entry file with these `-D name=value` defines. */
export interface ScadJob {
  /** The part's name in the viewer and the slicer. */
  name: string;
  defines: string[];
  color?: RGB;
  group?: string;
  role?: PartRole;
  /** Moves the mesh after it renders, in millimetres (laying a kit out on the plate). */
  offset?: [number, number, number];
  /** Turns it about Z first, in degrees. */
  rotate?: number;
  /** Nothing to render is not a failure (an empty hardware layer). */
  optional?: boolean;
}

export interface ScadPlan {
  jobs: ScadJob[];
  diagnostics?: Diagnostic[];
  summary?: string;
}

export interface ScadProgram<P> {
  /** Names the browser cache, so two modules never share renders. */
  id: string;
  /** Virtual path → contents. Paths are absolute in the engine's file system. */
  files: Record<string, string>;
  /** The file every job renders, e.g. `/work/gearbox.scad`. */
  entry: string;
  plan(params: P, inputs: Record<string, unknown>): ScadPlan;
  /** A last look at the result: notes from the meshes' sizes, a summary. */
  finish?(result: BuildResult, params: P, rendered: RenderedJob[]): BuildResult;
}

export interface RenderedJob {
  job: ScadJob;
  part: Part | null;
  messages: string[];
  seconds: number;
  cached: boolean;
}

/** Where OpenSCAD looks for libraries such as BOSL2 in this build. */
export const LIB_DIR = '/home/web_user/.local/share/OpenSCAD/libraries';
export const WORK_DIR = '/work';

/** A string as an OpenSCAD literal for a define. */
export function scadValue(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `[${v.map(scadValue).join(',')}]`;
  return JSON.stringify(String(v));
}
