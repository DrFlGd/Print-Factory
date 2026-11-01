/** Node entry for tests and tools: the same plan and render, with the engine from node_modules. */
import type { BuildResult } from '@pf/core';
import { createOpenSCAD } from 'openscad-wasm-prebuilt';
import { renderOnce, runProgram, type CreateOpenSCAD } from './run';
import type { ScadProgram } from './types';

const create = createOpenSCAD as unknown as CreateOpenSCAD;

export async function runScad<P>(program: ScadProgram<P>, params: P, inputs: Record<string, unknown> = {}): Promise<BuildResult> {
  return runProgram(program, params, inputs, async (job) => ({
    ...(await renderOnce(create, program.files, program.entry, job.defines)),
    cached: false,
  }));
}

/** One file rendered with raw defines, for library checks. */
export function renderScad(files: Record<string, string>, entry: string, defines: string[]) {
  return renderOnce(create, files, entry, defines);
}
