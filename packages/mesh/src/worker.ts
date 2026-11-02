/**
 * Prepares an uploaded model off the page's thread: read, repair, simplify, set down, pack.
 * One request at a time: { name, bytes } in, a StoredMesh or { error } out.
 */
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import type { ManifoldToplevel } from 'manifold-3d';
import { encodeMesh } from './codec';
import { prepareFile } from './prepare';

let wasm: Promise<ManifoldToplevel> | null = null;
const load = () =>
  (wasm ??= Module({ locateFile: () => wasmUrl }).then((w) => {
    w.setup();
    return w;
  }));

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (e: MessageEvent<{ name: string; bytes: Uint8Array }>) => {
  try {
    const w = await load();
    const p = prepareFile(w, e.data.name, e.data.bytes);
    scope.postMessage(encodeMesh(p.mesh, p.info));
  } catch (err) {
    scope.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
