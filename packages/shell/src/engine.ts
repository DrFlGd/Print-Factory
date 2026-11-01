/**
 * The page side of the engine protocol.
 *
 * Latest wins: while a build runs, further requests replace each other, and only the
 * newest is sent when the worker is free. A slider dragged across its range therefore
 * costs at most two builds in flight, never a queue of fifty.
 */
import type { BuildResult, EngineResponse, ParamValues } from '@pf/core';

export interface BuildOutcome {
  result: BuildResult;
  ms: number;
}

export interface EngineClient {
  build(params: ParamValues, inputs: Record<string, unknown>): Promise<BuildOutcome | null>;
  onLog(cb: (text: string) => void): void;
  /** True while a build is running or waiting. */
  readonly busy: boolean;
  dispose(): void;
}

export function createEngine(makeWorker: () => Worker): EngineClient {
  let worker = makeWorker();
  let nextId = 1;
  let running: { id: number; resolve: (o: BuildOutcome | null) => void; reject: (e: Error) => void } | null = null;
  let pending: { params: ParamValues; inputs: Record<string, unknown>; resolve: (o: BuildOutcome | null) => void; reject: (e: Error) => void } | null = null;
  const logs: ((t: string) => void)[] = [];

  function attach(w: Worker) {
    w.onmessage = (e: MessageEvent<EngineResponse>) => {
      const m = e.data;
      if (m.kind === 'log') logs.forEach((cb) => cb(m.text));
      if (m.kind !== 'result' && m.kind !== 'error') return;
      if (!running || m.id !== running.id) return;
      const r = running;
      running = null;
      if (m.kind === 'result') r.resolve({ result: m.result, ms: m.ms });
      else r.reject(Object.assign(new Error(m.message), { stack: m.stack }));
      pump();
    };
    w.onerror = (e) => {
      e.preventDefault?.();
      const r = running;
      running = null;
      // A crashed worker (out of memory, a WebAssembly trap) is replaced so the next build works.
      worker.terminate();
      worker = makeWorker();
      attach(worker);
      r?.reject(new Error(e.message || 'The geometry engine stopped unexpectedly. Try smaller values.'));
      pump();
    };
  }
  attach(worker);

  function pump() {
    if (running || !pending) return;
    const job = pending;
    pending = null;
    const id = nextId++;
    running = { id, resolve: job.resolve, reject: job.reject };
    worker.postMessage({ kind: 'build', id, params: job.params, inputs: job.inputs });
  }

  return {
    build(params, inputs) {
      return new Promise((resolve, reject) => {
        // A request replaced before it was sent resolves to null: the caller ignores it.
        pending?.resolve(null);
        pending = { params, inputs, resolve, reject };
        pump();
      });
    },
    onLog(cb) {
      logs.push(cb);
    },
    get busy() {
      return Boolean(running || pending);
    },
    dispose() {
      pending?.resolve(null);
      running?.resolve(null);
      pending = running = null;
      worker.terminate();
    },
  };
}
