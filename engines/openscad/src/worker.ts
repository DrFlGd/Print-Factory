/**
 * The worker side. A module's `src/worker.ts` is:
 *
 *   import { serveScad } from '@pf/engine-openscad/worker';
 *   import { program } from './program';
 *   serveScad(program);
 *
 * The engine itself (openscad-wasm-prebuilt: one 11 MB ES module with the WebAssembly
 * inlined, GPL-2.0-or-later) is emitted as a separate file and loaded at run time, so it
 * stays a separate program that the module talks to through files and arguments.
 */
import type { EngineRequest, EngineResponse } from '@pf/core';
import { transferables } from '@pf/core';
import engineUrl from 'openscad-wasm-prebuilt?url';
import { RenderCache } from './cache';
import { renderOnce, runProgram, type CreateOpenSCAD } from './run';
import type { ScadProgram } from './types';

const ENGINE_VERSION = 'openscad-wasm-prebuilt@1.2.0';

let enginePromise: Promise<CreateOpenSCAD> | null = null;
function loadEngine(): Promise<CreateOpenSCAD> {
  enginePromise ??= (import(/* @vite-ignore */ engineUrl) as Promise<{ createOpenSCAD: CreateOpenSCAD }>).then((m) => m.createOpenSCAD);
  return enginePromise;
}

export function serveScad<P>(program: ScadProgram<P>): void {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  const post = (msg: EngineResponse, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);
  const cache = new RenderCache(program.id, program.files, ENGINE_VERSION);
  let queue = Promise.resolve();
  scope.onmessage = (e: MessageEvent<EngineRequest>) => {
    const req = e.data;
    if (req?.kind !== 'build') return;
    queue = queue.then(async () => {
      const t0 = performance.now();
      const log = (text: string) => post({ kind: 'log', id: req.id, text });
      try {
        const result = await runProgram(program, req.params as P, req.inputs, async (job) => {
          const key = await cache.key([program.entry, ...job.defines]).catch(() => null);
          const hit = key ? await cache.get(key) : null;
          if (hit) {
            log(`${job.name}: from the browser cache (first rendered in ${hit.seconds.toFixed(1)} s).`);
            return { ...hit, cached: true };
          }
          log(`${job.name}: rendering…`);
          const r = await renderOnce(await loadEngine(), program.files, program.entry, job.defines, log);
          if (r.bytes && key) await cache.put(key, { bytes: r.bytes, seconds: r.seconds, messages: r.messages });
          return { ...r, cached: false };
        });
        post({ kind: 'result', id: req.id, result, ms: performance.now() - t0 }, transferables(result));
      } catch (err) {
        const e2 = err instanceof Error ? err : new Error(String(err));
        post({ kind: 'error', id: req.id, message: e2.message, stack: e2.stack });
      }
    });
  };
  loadEngine().then(
    () => post({ kind: 'ready' }),
    (err) => post({ kind: 'error', id: -1, message: `Could not load the OpenSCAD engine: ${String(err)}` }),
  );
}
