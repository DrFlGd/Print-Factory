/**
 * Node entry for tests and tools: the same context and runBuild, with the WebAssembly
 * loaded from node_modules.
 */
import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';

let wasmPromise: Promise<ManifoldToplevel> | null = null;

export function loadManifold(): Promise<ManifoldToplevel> {
  if (!wasmPromise) {
    wasmPromise = Module().then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return wasmPromise;
}

export { runBuild, createContext, meshToPart } from './context';
export type { ManifoldContext, BuildFn } from './context';
