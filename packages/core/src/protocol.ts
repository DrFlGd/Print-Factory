/**
 * The engine protocol: what crosses between a module's UI and its build worker.
 *
 * Every engine (Manifold, OpenSCAD, plain JS) speaks this, so the shell neither knows nor
 * cares which one a module uses. Builds are numbered; a reply always names the build it
 * answers, and the client drops replies to builds it no longer wants.
 */
import type { BuildResult } from './geometry';
import type { ParamValues } from './params';

export interface BuildRequest {
  kind: 'build';
  id: number;
  params: ParamValues;
  inputs: Record<string, unknown>;
}

export type EngineRequest = BuildRequest;

export type EngineResponse =
  | { kind: 'ready' }
  | { kind: 'log'; id: number; text: string }
  | { kind: 'result'; id: number; result: BuildResult; ms: number }
  | { kind: 'error'; id: number; message: string; stack?: string };

/** The buffers of a result, so postMessage can move them instead of copying. */
export function transferables(result: BuildResult): ArrayBuffer[] {
  const seen = new Set<ArrayBuffer>();
  for (const p of result.parts) {
    seen.add(p.positions.buffer as ArrayBuffer);
    seen.add(p.indices.buffer as ArrayBuffer);
  }
  return [...seen];
}
