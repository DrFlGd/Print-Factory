/**
 * STL and OBJ writers, and STL, OBJ and 3MF readers.
 */
import type { Part, RGB } from '@pf/core';
import { printable } from '@pf/core';
import { strFromU8, unzipSync } from 'fflate';

/** Binary STL of every printable part. STL has no colours and no parts. */
export function buildSTL(allParts: readonly Part[], header = 'Print Factory'): Uint8Array {
  const parts = printable(allParts);
  const tris = parts.reduce((n, p) => n + p.indices.length / 3, 0);
  const buf = new ArrayBuffer(84 + tris * 50);
  const dv = new DataView(buf);
  const head = new TextEncoder().encode(header.slice(0, 79));
  new Uint8Array(buf, 0, 80).set(head);
  dv.setUint32(80, tris, true);
  let o = 84;
  for (const p of parts) {
    const v = p.positions;
    const t = p.indices;
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i]! * 3;
      const b = t[i + 1]! * 3;
      const c = t[i + 2]! * 3;
      const ux = v[b]! - v[a]!;
      const uy = v[b + 1]! - v[a + 1]!;
      const uz = v[b + 2]! - v[a + 2]!;
      const wx = v[c]! - v[a]!;
      const wy = v[c + 1]! - v[a + 1]!;
      const wz = v[c + 2]! - v[a + 2]!;
      let nx = uy * wz - uz * wy;
      let ny = uz * wx - ux * wz;
      let nz = ux * wy - uy * wx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      dv.setFloat32(o, nx, true);
      dv.setFloat32(o + 4, ny, true);
      dv.setFloat32(o + 8, nz, true);
      o += 12;
      for (const idx of [a, b, c]) {
        dv.setFloat32(o, v[idx]!, true);
        dv.setFloat32(o + 4, v[idx + 1]!, true);
        dv.setFloat32(o + 8, v[idx + 2]!, true);
        o += 12;
      }
      dv.setUint16(o, 0, true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

/** OBJ with one object per part and a material per colour (in the companion MTL). */
export function buildOBJ(allParts: readonly Part[], mtlName = 'model.mtl'): { obj: string; mtl: string } {
  const parts = printable(allParts);
  const colors: RGB[] = [];
  const mat = (c: RGB) => {
    let i = colors.findIndex((x) => x[0] === c[0] && x[1] === c[1] && x[2] === c[2]);
    if (i < 0) i = colors.push(c) - 1;
    return `color${i + 1}`;
  };
  const lines: string[] = ['# Print Factory', `mtllib ${mtlName}`];
  let base = 1;
  for (const p of parts) {
    lines.push(`o ${p.name.replace(/\s+/g, '_')}`, `usemtl ${mat(p.color)}`);
    const v = p.positions;
    for (let i = 0; i < v.length; i += 3) lines.push(`v ${v[i]!.toFixed(4)} ${v[i + 1]!.toFixed(4)} ${v[i + 2]!.toFixed(4)}`);
    const t = p.indices;
    for (let i = 0; i < t.length; i += 3) lines.push(`f ${t[i]! + base} ${t[i + 1]! + base} ${t[i + 2]! + base}`);
    base += v.length / 3;
  }
  const mtl = colors.map((c, i) => `newmtl color${i + 1}\nKd ${(c[0] / 255).toFixed(4)} ${(c[1] / 255).toFixed(4)} ${(c[2] / 255).toFixed(4)}\n`).join('\n');
  return { obj: lines.join('\n') + '\n', mtl };
}

export interface ReadMesh {
  name: string;
  positions: Float32Array;
  indices: Uint32Array;
  color?: RGB;
}

/** Merges identical vertices (exact match after rounding to 1 µm). */
function indexed(raw: number[], name: string, color?: RGB): ReadMesh {
  const map = new Map<string, number>();
  const pos: number[] = [];
  const idx = new Uint32Array(raw.length / 3);
  for (let i = 0; i < raw.length; i += 3) {
    const key = `${Math.round(raw[i]! * 1000)},${Math.round(raw[i + 1]! * 1000)},${Math.round(raw[i + 2]! * 1000)}`;
    let k = map.get(key);
    if (k === undefined) {
      k = pos.length / 3;
      map.set(key, k);
      pos.push(raw[i]!, raw[i + 1]!, raw[i + 2]!);
    }
    idx[i / 3] = k;
  }
  const m: ReadMesh = { name, positions: new Float32Array(pos), indices: idx };
  if (color) m.color = color;
  return m;
}

export function readSTL(bytes: Uint8Array, name = 'model'): ReadMesh {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  const isBinary = bytes.byteLength === 84 + count * 50;
  const raw: number[] = [];
  if (isBinary) {
    let o = 84;
    for (let i = 0; i < count; i++) {
      o += 12;
      for (let k = 0; k < 9; k++) raw.push(dv.getFloat32(o + k * 4, true));
      o += 38;
    }
  } else {
    const text = new TextDecoder().decode(bytes);
    const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) raw.push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if (raw.length < 9) throw new Error('No triangles found in the STL file.');
  return indexed(raw, name);
}

export function readOBJ(text: string, name = 'model'): ReadMesh {
  const verts: number[] = [];
  const raw: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'v') verts.push(Number(t[1]), Number(t[2]), Number(t[3]));
    else if (t[0] === 'f') {
      const ids = t.slice(1).map((s) => {
        const n = parseInt(s.split('/')[0]!, 10);
        return n < 0 ? verts.length / 3 + n : n - 1;
      });
      for (let i = 1; i + 1 < ids.length; i++) {
        for (const k of [ids[0]!, ids[i]!, ids[i + 1]!]) raw.push(verts[k * 3]!, verts[k * 3 + 1]!, verts[k * 3 + 2]!);
      }
    }
  }
  if (raw.length < 9) throw new Error('No faces found in the OBJ file.');
  return indexed(raw, name);
}

/** Every mesh object in a 3MF, with build-item transforms applied. */
export function read3MF(bytes: Uint8Array): ReadMesh[] {
  const files = unzipSync(bytes);
  const modelPath = Object.keys(files).find((k) => /^3D\/.*\.model$/i.test(k) && /3dmodel/i.test(k)) ?? Object.keys(files).find((k) => k.endsWith('.model'));
  if (!modelPath) throw new Error('No 3D model inside the 3MF file.');
  const all: Record<string, string> = {};
  for (const k of Object.keys(files)) if (k.endsWith('.model')) all['/' + k] = strFromU8(files[k]!);
  const xml = all['/' + modelPath]!;
  const objects = new Map<string, { name: string; mesh?: ReadMesh; components: { id: string; path?: string; m: number[] }[] }>();
  const parseObjects = (src: string, path: string) => {
    const re = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const id = /\bid="([^"]+)"/.exec(m[1]!)?.[1] ?? '';
      const nm = /\bname="([^"]*)"/.exec(m[1]!)?.[1] ?? `object ${id}`;
      const body = m[2]!;
      const entry: { name: string; mesh?: ReadMesh; components: { id: string; path?: string; m: number[] }[] } = { name: nm, components: [] };
      if (/<mesh/.test(body)) {
        const v: number[] = [];
        const vr = /<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/g;
        let q: RegExpExecArray | null;
        while ((q = vr.exec(body))) v.push(Number(q[1]), Number(q[2]), Number(q[3]));
        const t: number[] = [];
        const tr = /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/g;
        while ((q = tr.exec(body))) t.push(Number(q[1]), Number(q[2]), Number(q[3]));
        entry.mesh = { name: nm, positions: new Float32Array(v), indices: new Uint32Array(t) };
      }
      const cr = /<component\b([^>]*)\/?>/g;
      let c: RegExpExecArray | null;
      while ((c = cr.exec(body))) {
        const oid = /objectid="([^"]+)"/.exec(c[1]!)?.[1] ?? '';
        const p = /path="([^"]+)"/.exec(c[1]!)?.[1];
        const tf = /transform="([^"]+)"/.exec(c[1]!)?.[1];
        entry.components.push({ id: oid, path: p, m: tf ? tf.trim().split(/\s+/).map(Number) : [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] });
      }
      objects.set(`${path}#${id}`, entry);
    }
  };
  for (const [p, src] of Object.entries(all)) parseObjects(src, p);
  const out: ReadMesh[] = [];
  const apply = (mesh: ReadMesh, m: number[], name: string): ReadMesh => {
    const v = mesh.positions;
    const o = new Float32Array(v.length);
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i]!;
      const y = v[i + 1]!;
      const z = v[i + 2]!;
      o[i] = m[0]! * x + m[3]! * y + m[6]! * z + m[9]!;
      o[i + 1] = m[1]! * x + m[4]! * y + m[7]! * z + m[10]!;
      o[i + 2] = m[2]! * x + m[5]! * y + m[8]! * z + m[11]!;
    }
    return { name, positions: o, indices: mesh.indices };
  };
  const compose = (a: number[], b: number[]): number[] => {
    // b applied first, then a (row vectors, 3MF order)
    const r = new Array(12).fill(0) as number[];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) r[i * 3 + j] = b[i * 3]! * a[j]! + b[i * 3 + 1]! * a[3 + j]! + b[i * 3 + 2]! * a[6 + j]!;
    for (let j = 0; j < 3; j++) r[9 + j] = b[9]! * a[j]! + b[10]! * a[3 + j]! + b[11]! * a[6 + j]! + a[9 + j]!;
    return r;
  };
  const visit = (key: string, m: number[], depth: number) => {
    const o = objects.get(key);
    if (!o || depth > 8) return;
    if (o.mesh && o.mesh.indices.length) out.push(apply(o.mesh, m, o.name));
    for (const c of o.components) {
      const path = c.path ?? key.split('#')[0]!;
      visit(`${path}#${c.id}`, compose(m, c.m), depth + 1);
    }
  };
  const items = [...xml.matchAll(/<item\b([^>]*)\/?>/g)];
  for (const it of items) {
    const id = /objectid="([^"]+)"/.exec(it[1]!)?.[1] ?? '';
    const tf = /transform="([^"]+)"/.exec(it[1]!)?.[1];
    visit(`/${modelPath}#${id}`, tf ? tf.trim().split(/\s+/).map(Number) : [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 0);
  }
  if (!out.length) throw new Error('The 3MF file has no meshes.');
  return out;
}

/** Reads STL, OBJ or 3MF by file name. Returns one or more meshes. */
export function readModel(name: string, bytes: Uint8Array): ReadMesh[] {
  const lower = name.toLowerCase();
  const base = name.replace(/\.[^.]+$/, '');
  if (lower.endsWith('.3mf')) return read3MF(bytes);
  if (lower.endsWith('.obj')) return [readOBJ(new TextDecoder().decode(bytes), base)];
  if (lower.endsWith('.stl')) return [readSTL(bytes, base)];
  throw new Error(`Cannot read "${name}": use an STL, OBJ or 3MF file.`);
}
