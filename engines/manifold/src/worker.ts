/**
 * The worker side. A module's `src/worker.ts` is two lines:
 *
 *   import { serve } from '@pf/engine-manifold/worker';
 *   import { build } from './build';
 *   serve(build);
 */
import type { EngineRequest, EngineResponse } from '@pf/core';
import { transferables } from '@pf/core';
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import type { ManifoldToplevel } from 'manifold-3d';
import { runBuild, type BuildFn } from './context';

let wasmPromise: Promise<ManifoldToplevel> | null = null;

function loadWasm(): Promise<ManifoldToplevel> {
  if (!wasmPromise) {
    wasmPromise = Module({ locateFile: () => wasmUrl }).then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return wasmPromise;
}

export function serve<P>(build: BuildFn<P>): void {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  const post = (msg: EngineResponse, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);
  // Builds run one at a time, in order; the client only ever keeps the newest.
  let queue = Promise.resolve();
  scope.onmessage = (e: MessageEvent<EngineRequest>) => {
    const req = e.data;
    if (req?.kind !== 'build') return;
    queue = queue.then(async () => {
      const t0 = performance.now();
      try {
        const wasm = await loadWasm();
        const result = await runBuild(wasm, build, req.params as P, req.inputs, (text) => post({ kind: 'log', id: req.id, text }));
        post({ kind: 'result', id: req.id, result, ms: performance.now() - t0 }, transferables(result));
      } catch (err) {
        const e2 = err instanceof Error ? err : new Error(String(err));
        post({ kind: 'error', id: req.id, message: e2.message, stack: e2.stack });
      }
    });
  };
  // Start loading straight away so the first build does not pay for it alone.
  loadWasm().then(
    () => post({ kind: 'ready' }),
    (err) => post({ kind: 'error', id: -1, message: `Could not load the geometry engine: ${String(err)}` }),
  );
}
