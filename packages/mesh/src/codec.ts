/**
 * A prepared model as a module input: plain JSON, so it goes into project files and
 * autosaves like a traced image does. The mesh is packed (vertex and triangle counts, the
 * positions as float32, the indices as uint32), deflated and base64-encoded: about a third of
 * its raw size.
 */
import { deflateSync, inflateSync } from 'fflate';
import type { RawMesh } from './parse';
import type { MeshInfo } from './prepare';

export interface StoredMesh extends MeshInfo {
  kind: 'mesh';
  /** Changes with the content; builds cache the decoded mesh by it. */
  id: string;
  data: string;
}

export function encodeMesh(mesh: RawMesh, info: MeshInfo): StoredMesh {
  const nv = mesh.positions.length / 3;
  const nt = mesh.indices.length / 3;
  const buf = new Uint8Array(8 + nv * 12 + nt * 12);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, nv, true);
  dv.setUint32(4, nt, true);
  buf.set(new Uint8Array(mesh.positions.buffer, mesh.positions.byteOffset, nv * 12), 8);
  buf.set(new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, nt * 12), 8 + nv * 12);
  const z = deflateSync(buf, { level: 6 });
  let s = '';
  for (let i = 0; i < z.length; i += 0x8000) s += String.fromCharCode(...z.subarray(i, i + 0x8000));
  const data = btoa(s);
  return { kind: 'mesh', id: `${nv}-${nt}-${hash(data)}`, ...info, data };
}

const cache = new Map<string, RawMesh>();

/** The mesh back; the last few are kept, so a rebuild does not unpack it again. */
export function decodeMesh(m: StoredMesh): RawMesh {
  const hit = cache.get(m.id);
  if (hit) return hit;
  const bin = atob(m.data);
  const z = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) z[i] = bin.charCodeAt(i);
  const buf = inflateSync(z);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const nv = dv.getUint32(0, true);
  const nt = dv.getUint32(4, true);
  // Copies, so the typed arrays are aligned.
  const positions = new Float32Array(buf.slice(8, 8 + nv * 12).buffer);
  const indices = new Uint32Array(buf.slice(8 + nv * 12, 8 + nv * 12 + nt * 12).buffer);
  const out = { positions, indices };
  cache.set(m.id, out);
  while (cache.size > 3) cache.delete(cache.keys().next().value!);
  return out;
}

export const isStoredMesh = (v: unknown): v is StoredMesh => !!v && typeof v === 'object' && (v as StoredMesh).kind === 'mesh' && typeof (v as StoredMesh).data === 'string';

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}
