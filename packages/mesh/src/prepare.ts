/**
 * An uploaded model made into the one solid a build can cut:
 *
 *   read → weld → turn the right way out → make it a solid (or rebuild it from voxels)
 *   → join overlapping shells → simplify → centre it on the bed
 *
 * Runs once per upload (in a worker in the app), so builds only pay for loading the result.
 */
import type { Manifold, ManifoldToplevel } from '@pf/engine-manifold';
import { withTracking } from '@pf/engine-manifold';
import type { RawMesh } from './parse';
import { boxOf, parseModel, signedVolume, weld } from './parse';
import { voxelRepair } from './repair';

/**
 * Triangles a build works with. A boolean against the model is most of a rebuild's time and
 * grows with its triangles; 100k keeps one well under a second, and is finer than a nozzle
 * can print at the sizes models are scaled to.
 */
export const TRIANGLE_BUDGET = 100_000;

export interface MeshInfo {
  name: string;
  /** Triangles in the file. */
  fileTriangles: number;
  /** Triangles kept. */
  triangles: number;
  /** Size as it came (the file's own units, usually mm). */
  size: [number, number, number];
  /** What had to be done to it, in plain words. */
  notes: string[];
}

export interface PreparedMesh {
  mesh: RawMesh;
  info: MeshInfo;
}

/** Reads and prepares a model file. Frees every WebAssembly object it made. */
export function prepareFile(wasm: ManifoldToplevel, name: string, bytes: Uint8Array, budget = TRIANGLE_BUDGET): PreparedMesh {
  const raw = parseModel(name, bytes);
  return withTracking(wasm, () => prepareMesh(wasm, raw, name, budget));
}

/** Prepares a parsed mesh. Call it through `withTracking` (or inside a build), which frees what it makes. */
export function prepareMesh(wasm: ManifoldToplevel, raw: RawMesh, name: string, budget = TRIANGLE_BUDGET): PreparedMesh {
  const notes: string[] = [];
  const fileTriangles = Math.floor(raw.indices.length / 3);
  const m = weld(raw);
  if (m.indices.length < 12) throw new Error('This file has no solid in it.');
  const box = boxOf(m.positions);
  const longest = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]);
  if (!(longest > 0)) throw new Error('This model has no size.');
  if (signedVolume(m) < 0) {
    for (let t = 0; t < m.indices.length; t += 3) {
      const x = m.indices[t + 1]!;
      m.indices[t + 1] = m.indices[t + 2]!;
      m.indices[t + 2] = x;
    }
    notes.push('It was inside out and has been turned the right way.');
  }

  let solid = solidOf(wasm, m);
  if (solid) {
    // Bring a huge model down first: joining shells costs in proportion to what it is given.
    if (solid.numTri() > 2 * budget) solid = simplifyTo(solid, 2 * budget, longest);
    const parts = solid.decompose();
    // A part with negative volume is a hollow inside another: joining would fill it.
    if (parts.length > 1 && parts.every((x) => x.volume() > 0)) {
      const joined = wasm.Manifold.union(parts);
      if (joined.numTri() !== solid.numTri() || Math.abs(joined.volume() - solid.volume()) > 1e-6 * Math.abs(solid.volume())) notes.push('Overlapping parts were joined into one solid.');
      solid = joined;
    }
  } else {
    solid = voxelRepair(wasm, m);
    if (solid.isEmpty()) throw new Error('This model could not be made into a solid.');
    notes.push('It had holes or broken faces, so it was rebuilt as a closed solid; the finest details may be softer.');
  }
  if (solid.numTri() > budget) {
    solid = simplifyTo(solid, budget, longest);
    notes.push(`Simplified from ${fileTriangles.toLocaleString('en')} to ${solid.numTri().toLocaleString('en')} triangles.`);
  }
  const bb = solid.boundingBox();
  const out = solid.getMesh();
  const positions = new Float32Array(out.numVert * 3);
  const np = out.numProp;
  const cx = (bb.min[0] + bb.max[0]) / 2;
  const cy = (bb.min[1] + bb.max[1]) / 2;
  for (let i = 0; i < out.numVert; i++) {
    positions[i * 3] = out.vertProperties[i * np]! - cx;
    positions[i * 3 + 1] = out.vertProperties[i * np + 1]! - cy;
    positions[i * 3 + 2] = out.vertProperties[i * np + 2]! - bb.min[2];
  }
  return {
    mesh: { positions, indices: Uint32Array.from(out.triVerts) },
    info: { name, fileTriangles, triangles: out.triVerts.length / 3, size: [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]], notes },
  };
}

/** A Manifold of a welded mesh, or null when it is not a closed, consistently wound surface. */
function solidOf(wasm: ManifoldToplevel, m: RawMesh): Manifold | null {
  try {
    const mesh = new wasm.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices });
    mesh.merge();
    const s = wasm.Manifold.ofMesh(mesh);
    if (s.status() !== 'NoError' || s.isEmpty()) return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * Simplifies to at most `budget` triangles with the smallest tolerance that gets there:
 * starting at 0.01 % of the model's size and doubling.
 */
function simplifyTo(s: Manifold, budget: number, longest: number): Manifold {
  let t = longest * 1e-4;
  let out = s;
  for (let i = 0; i < 24 && out.numTri() > budget; i++) {
    out = s.simplify(t);
    t *= 2;
  }
  return out;
}
