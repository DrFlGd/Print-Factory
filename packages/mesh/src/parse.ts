/**
 * Reading 3D model files into one triangle list: STL (binary or text), OBJ and 3MF (every
 * object the build places, with its transforms). Pure: runs in the page, a worker or Node.
 */
import { unzipSync } from 'fflate';

export interface RawMesh {
  /** xyz per vertex. */
  positions: Float32Array;
  /** Three vertex indices per triangle. */
  indices: Uint32Array;
}

export const MODEL_FILE = /\.(stl|3mf|obj)$/i;
export const MODEL_ACCEPT = '.stl,.3mf,.obj,model/stl,model/3mf,model/obj';

/** Reads a model file by its name's extension (or, failing that, by its content). */
export function parseModel(name: string, bytes: Uint8Array): RawMesh {
  const ext = /\.(\w+)$/.exec(name)?.[1]?.toLowerCase();
  if (ext === '3mf' || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return parse3mf(bytes);
  if (ext === 'obj') return parseObj(new TextDecoder().decode(bytes));
  return parseStl(bytes);
}

/* ------------------------------------------------------------------ STL */

export function parseStl(bytes: Uint8Array): RawMesh {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    // Binary when the size adds up; some exporters start a binary file with "solid" too.
    if (84 + n * 50 === bytes.byteLength) {
      const positions = new Float32Array(n * 9);
      for (let t = 0; t < n; t++) {
        const o = 84 + t * 50 + 12;
        for (let k = 0; k < 9; k++) positions[t * 9 + k] = dv.getFloat32(o + k * 4, true);
      }
      return soup(positions);
    }
  }
  const text = new TextDecoder().decode(bytes);
  const out: number[] = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(Number(m[1]), Number(m[2]), Number(m[3]));
  if (!out.length) throw new Error('This is not an STL file, or it has no triangles.');
  return soup(new Float32Array(out.length - (out.length % 9)).map((_, i) => out[i]!));
}

/** Three fresh vertices per triangle, as STL stores them. */
function soup(positions: Float32Array): RawMesh {
  const indices = new Uint32Array(positions.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  return { positions, indices };
}

/* ------------------------------------------------------------------ OBJ */

export function parseObj(text: string): RawMesh {
  const v: number[] = [];
  const f: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/);
      v.push(Number(p[1]), Number(p[2]), Number(p[3]));
    } else if (line.startsWith('f ')) {
      const n = v.length / 3;
      const ids = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((s) => {
          const i = parseInt(s, 10);
          return i < 0 ? n + i : i - 1;
        });
      // A polygon as a fan.
      for (let k = 1; k + 1 < ids.length; k++) f.push(ids[0]!, ids[k]!, ids[k + 1]!);
    }
  }
  if (!f.length) throw new Error('This OBJ file has no faces.');
  const n = v.length / 3;
  if (f.some((i) => !(i >= 0 && i < n))) throw new Error('This OBJ file refers to vertices it does not have.');
  return { positions: Float32Array.from(v), indices: Uint32Array.from(f) };
}

/* ------------------------------------------------------------------ 3MF */

type Mat = number[]; // 3MF's 12 numbers: p' = [x y z 1] · M, rows m0x m1x m2x m3x
const IDENTITY: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

interface Obj3mf {
  verts: number[];
  tris: number[];
  comps: { path: string; id: string; m: Mat }[];
}

/** Child transform, then parent: p · A · B. */
function compose(a: Mat, b: Mat): Mat {
  const r: Mat = new Array(12).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) {
      let s = i === 3 ? b[9 + j]! : 0;
      for (let k = 0; k < 3; k++) s += a[i * 3 + k]! * b[k * 3 + j]!;
      r[i * 3 + j] = s;
    }
  return r;
}

const attrs = (s: string) => {
  const o: Record<string, string> = {};
  const re = /([\w:]+)\s*=\s*"([^"]*)"/g;
  for (let m = re.exec(s); m; m = re.exec(s)) o[m[1]!.replace(/^\w+:(?=path$)/, 'p:')] = m[2]!;
  return o;
};
const matOf = (s: string | undefined): Mat => {
  const n = s?.trim().split(/\s+/).map(Number);
  return n && n.length === 12 && n.every(Number.isFinite) ? n : IDENTITY;
};

export function parse3mf(bytes: Uint8Array): RawMesh {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => /\.model$/i.test(f.name) || /\.rels$/i.test(f.name) });
  } catch {
    throw new Error('This 3MF file could not be opened.');
  }
  const dec = new TextDecoder();
  const objects = new Map<string, Map<string, Obj3mf>>();
  const builds: { path: string; items: { id: string; path: string; m: Mat }[] }[] = [];
  for (const [name, data] of Object.entries(files)) {
    if (!/\.model$/i.test(name)) continue;
    const path = '/' + name.replace(/^\/+/, '');
    const xml = dec.decode(data);
    const objs = new Map<string, Obj3mf>();
    objects.set(path.toLowerCase(), objs);
    let cur: Obj3mf | null = null;
    let inBuild = false;
    const items: { id: string; path: string; m: Mat }[] = [];
    const re = /<(\/?)([\w:]+)([^>]*)>/g;
    for (let m = re.exec(xml); m; m = re.exec(xml)) {
      const close = m[1] === '/';
      const tag = m[2]!.replace(/^\w+:/, '');
      if (tag === 'object') {
        if (close) cur = null;
        else {
          cur = { verts: [], tris: [], comps: [] };
          objs.set(attrs(m[3]!).id ?? '', cur);
          if (m[3]!.endsWith('/')) cur = null;
        }
      } else if (tag === 'build') inBuild = !close && !m[3]!.endsWith('/');
      else if (close) continue;
      else if (tag === 'vertex' && cur) {
        const a = attrs(m[3]!);
        cur.verts.push(Number(a.x), Number(a.y), Number(a.z));
      } else if (tag === 'triangle' && cur) {
        const a = attrs(m[3]!);
        cur.tris.push(Number(a.v1), Number(a.v2), Number(a.v3));
      } else if (tag === 'component' && cur) {
        const a = attrs(m[3]!);
        cur.comps.push({ id: a.objectid ?? '', path: (a['p:path'] ?? path).toLowerCase(), m: matOf(a.transform) });
      } else if (tag === 'item' && inBuild) {
        const a = attrs(m[3]!);
        items.push({ id: a.objectid ?? '', path: (a['p:path'] ?? path).toLowerCase(), m: matOf(a.transform) });
      }
    }
    if (items.length) builds.push({ path, items });
  }
  if (!builds.length) throw new Error('This 3MF file has nothing on its build plate.');

  const pos: number[] = [];
  const idx: number[] = [];
  const emit = (path: string, id: string, M: Mat, depth: number) => {
    const o = objects.get(path)?.get(id);
    if (!o || depth > 16) return;
    if (o.tris.length) {
      const base = pos.length / 3;
      for (let i = 0; i < o.verts.length; i += 3) {
        const x = o.verts[i]!;
        const y = o.verts[i + 1]!;
        const z = o.verts[i + 2]!;
        pos.push(x * M[0]! + y * M[3]! + z * M[6]! + M[9]!, x * M[1]! + y * M[4]! + z * M[7]! + M[10]!, x * M[2]! + y * M[5]! + z * M[8]! + M[11]!);
      }
      for (const t of o.tris) idx.push(base + t);
    }
    for (const c of o.comps) emit(c.path, c.id, compose(c.m, M), depth + 1);
  };
  for (const b of builds) for (const it of b.items) emit(it.path, it.id, it.m, 0);
  if (!idx.length) throw new Error('This 3MF file has no triangles.');
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}

/* ------------------------------------------------------------------ welding */

/**
 * Shares vertices that sit at exactly the same position (an STL has three fresh vertices per
 * triangle, and a closed surface only exists once they are shared), and drops triangles with
 * a non-finite corner or two corners the same. Exact rather than within a tolerance: close
 * but separate features stay apart, and Manifold's own merge closes the near misses.
 */
export function weld(m: RawMesh): RawMesh {
  const { positions: p, indices: ix } = m;
  const nv = p.length / 3;
  const bits = new Uint32Array(p.buffer, p.byteOffset, p.length);
  let size = 1;
  while (size < nv * 2) size <<= 1;
  const table = new Int32Array(size).fill(-1);
  const remap = new Int32Array(nv).fill(-1);
  const out: number[] = [];
  const ok = (i: number) => Number.isFinite(p[i * 3]!) && Number.isFinite(p[i * 3 + 1]!) && Number.isFinite(p[i * 3 + 2]!);
  const id = (i: number): number => {
    if (remap[i]! >= 0) return remap[i]!;
    const a = bits[i * 3]!;
    const b = bits[i * 3 + 1]!;
    const c = bits[i * 3 + 2]!;
    let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) & (size - 1);
    for (;;) {
      const s = table[h]!;
      if (s < 0) {
        const n = out.length / 3;
        out.push(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!);
        table[h] = i;
        remap[i] = n;
        return n;
      }
      if (bits[s * 3] === a && bits[s * 3 + 1] === b && bits[s * 3 + 2] === c) {
        remap[i] = remap[s]!;
        return remap[i]!;
      }
      h = (h + 1) & (size - 1);
    }
  };
  const tri: number[] = [];
  for (let t = 0; t + 2 < ix.length; t += 3) {
    const a = ix[t]!;
    const b = ix[t + 1]!;
    const c = ix[t + 2]!;
    if (a >= nv || b >= nv || c >= nv || !ok(a) || !ok(b) || !ok(c)) continue;
    const A = id(a);
    const B = id(b);
    const C = id(c);
    if (A === B || B === C || A === C) continue;
    tri.push(A, B, C);
  }
  return { positions: Float32Array.from(out), indices: Uint32Array.from(tri) };
}

/** Six times the signed volume a closed, consistently wound mesh encloses (negative inside out). */
export function signedVolume(m: RawMesh): number {
  const p = m.positions;
  let v = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t]! * 3;
    const b = m.indices[t + 1]! * 3;
    const c = m.indices[t + 2]! * 3;
    v += p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!);
  }
  return v / 6;
}

export function boxOf(p: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const x = p[i + k]!;
      if (x < min[k]!) min[k] = x;
      if (x > max[k]!) max[k] = x;
    }
  return { min, max };
}
