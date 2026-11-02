import { loadManifold } from '@pf/engine-manifold/node';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeMesh, encodeMesh, parse3mf, parseModel, prepareFile, signedVolume, weld } from '../src/index';
import type { RawMesh } from '../src/index';

/** A box's 12 triangles, outward, as a soup of 36 vertices. */
function boxTris(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[][] {
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return f.map((t) => t.flatMap((i) => v[i]!));
}
function binaryStl(tris: number[][]): Uint8Array {
  const b = new Uint8Array(84 + tris.length * 50);
  const dv = new DataView(b.buffer);
  dv.setUint32(80, tris.length, true);
  tris.forEach((t, i) => t.forEach((x, k) => dv.setFloat32(84 + i * 50 + 12 + k * 4, x, true)));
  return b;
}
function asciiStl(tris: number[][]): Uint8Array {
  let s = 'solid test\n';
  for (const t of tris) s += `facet normal 0 0 0\nouter loop\n${[0, 1, 2].map((k) => `vertex ${t[k * 3]} ${t[k * 3 + 1]} ${t[k * 3 + 2]}`).join('\n')}\nendloop\nendfacet\n`;
  return new TextEncoder().encode(s + 'endsolid test\n');
}
const volume = (m: RawMesh) => signedVolume(m);

describe('reading model files', () => {
  it('reads binary and text STL and welds the soup', () => {
    const tris = boxTris(0, 0, 0, 10, 20, 30);
    for (const bytes of [binaryStl(tris), asciiStl(tris)]) {
      const m = weld(parseModel('box.stl', bytes));
      expect(m.positions.length / 3).toBe(8);
      expect(m.indices.length / 3).toBe(12);
      expect(volume(m)).toBeCloseTo(6000, 3);
    }
  });

  it('reads OBJ quads as two triangles each', () => {
    const obj = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1/1 2/2 3/3 4/4\n';
    expect(parseModel('q.obj', new TextEncoder().encode(obj)).indices.length).toBe(6);
  });

  it('reads 3MF build items through components and transforms', () => {
    const mesh = (id: number) => {
      const t = boxTris(0, 0, 0, 1, 1, 1);
      let v = '';
      let f = '';
      t.forEach((tri, i) => {
        for (let k = 0; k < 3; k++) v += `<vertex x="${tri[k * 3]}" y="${tri[k * 3 + 1]}" z="${tri[k * 3 + 2]}"/>`;
        f += `<triangle v1="${i * 3}" v2="${i * 3 + 1}" v3="${i * 3 + 2}"/>`;
      });
      return `<object id="${id}" type="model"><mesh><vertices>${v}</vertices><triangles>${f}</triangles></mesh></object>`;
    };
    const part = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${mesh(1)}</resources></model>`;
    const root = `<?xml version="1.0"?><model unit="millimeter" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"><resources><object id="2" type="model"><components><component p:path="/3D/Objects/part.model" objectid="1" transform="2 0 0 0 2 0 0 0 2 0 0 0"/></components></object></resources><build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 0 0"/></build></model>`;
    const zip = zipSync({ '3D/3dmodel.model': strToU8(root), '3D/Objects/part.model': strToU8(part) });
    const m = weld(parse3mf(zip));
    expect(volume(m)).toBeCloseTo(8, 3); // scaled by two
    let minX = Infinity;
    for (let i = 0; i < m.positions.length; i += 3) minX = Math.min(minX, m.positions[i]!);
    expect(minX).toBeCloseTo(100, 3); // then moved
  });
});

describe('preparing a model', () => {
  it('centres a clean model on the bed and notes nothing', async () => {
    const wasm = await loadManifold();
    const p = prepareFile(wasm, 'box.stl', binaryStl(boxTris(5, 5, 5, 15, 25, 35)));
    expect(p.info.notes).toEqual([]);
    expect(p.info.size.map((x) => Math.round(x))).toEqual([10, 20, 30]);
    let minZ = Infinity;
    let sumX = 0;
    for (let i = 0; i < p.mesh.positions.length; i += 3) {
      minZ = Math.min(minZ, p.mesh.positions[i + 2]!);
      sumX += p.mesh.positions[i]!;
    }
    expect(minZ).toBeCloseTo(0, 5);
    expect(sumX).toBeCloseTo(0, 3);
  });

  it('turns an inside-out model round', async () => {
    const wasm = await loadManifold();
    const tris = boxTris(0, 0, 0, 10, 10, 10).map((t) => [...t.slice(0, 3), ...t.slice(6, 9), ...t.slice(3, 6)]);
    const p = prepareFile(wasm, 'inv.stl', binaryStl(tris));
    expect(p.info.notes.join(' ')).toMatch(/inside out/);
    expect(volume(p.mesh)).toBeCloseTo(1000, 1);
  });

  it('joins overlapping shells', async () => {
    const wasm = await loadManifold();
    const p = prepareFile(wasm, 'two.stl', binaryStl([...boxTris(0, 0, 0, 10, 10, 10), ...boxTris(5, 0, 0, 15, 10, 10)]));
    expect(p.info.notes.join(' ')).toMatch(/joined/);
    expect(volume(p.mesh)).toBeCloseTo(1500, 0);
  });

  it('rebuilds a model with a hole from voxels', async () => {
    const wasm = await loadManifold();
    const tris = boxTris(0, 0, 0, 20, 20, 20).slice(0, 11); // one triangle missing
    const p = prepareFile(wasm, 'holey.stl', binaryStl(tris));
    expect(p.info.notes.join(' ')).toMatch(/rebuilt/);
    // The surface is put back where it was (exact distances, not a blurred mask): flat
    // faces and the box's size to within a fraction of a cell.
    expect(Math.abs(volume(p.mesh) / 8000 - 1)).toBeLessThan(0.03);
    expect(p.info.size[0]).toBeGreaterThan(19.7);
    expect(p.info.size[0]).toBeLessThan(20.3);
  });

  it('simplifies past the budget', async () => {
    const wasm = await loadManifold();
    // A finely tessellated sphere.
    const s = wasm.Manifold.sphere(20, 400);
    const g = s.getMesh();
    const raw = { positions: new Float32Array(g.vertProperties), indices: new Uint32Array(g.triVerts) };
    const tris: number[][] = [];
    for (let t = 0; t < raw.indices.length; t += 3) tris.push([0, 1, 2].flatMap((k) => Array.from(raw.positions.subarray(raw.indices[t + k]! * 3, raw.indices[t + k]! * 3 + 3))));
    const p = prepareFile(wasm, 'ball.stl', binaryStl(tris), 20_000);
    expect(p.info.triangles).toBeLessThanOrEqual(20_000);
    expect(p.info.notes.join(' ')).toMatch(/Simplified/);
    expect(Math.abs(volume(p.mesh) / ((4 / 3) * Math.PI * 8000) - 1)).toBeLessThan(0.01);
  });

  it('round-trips through the stored form', async () => {
    const wasm = await loadManifold();
    const p = prepareFile(wasm, 'box.stl', binaryStl(boxTris(0, 0, 0, 10, 20, 30)));
    const stored = JSON.parse(JSON.stringify(encodeMesh(p.mesh, p.info)));
    const back = decodeMesh(stored);
    expect(Array.from(back.positions)).toEqual(Array.from(p.mesh.positions));
    expect(Array.from(back.indices)).toEqual(Array.from(p.mesh.indices));
  });

  it('says plainly when a file is not a model', async () => {
    const wasm = await loadManifold();
    expect(() => prepareFile(wasm, 'x.stl', new TextEncoder().encode('hello'))).toThrow(/not an STL/);
  });
});
