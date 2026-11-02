/**
 * The fallback for a mesh Manifold will not take as a solid (holes, edges shared by three
 * faces, faces through each other): rebuild it from voxels.
 *
 * Rays are cast along X, Y and Z through every column of a grid and their crossings with
 * the triangles counted; a cell is inside a column when an odd number of crossings lie
 * before it. A column with an odd total went through a hole, so it does not vote. A cell is
 * inside when most of the columns through it that do vote say so. The inside/outside field
 * is smoothed a little and Manifold's level set makes a closed surface of it.
 *
 * Detail finer than a cell is lost, which is why this only runs when nothing else works.
 */
import type { Manifold, ManifoldToplevel } from '@pf/engine-manifold';
import type { RawMesh } from './parse';
import { boxOf } from './parse';

/** Cells along the model's longest side. */
const CELLS = 120;

export function voxelRepair(wasm: ManifoldToplevel, m: RawMesh): Manifold {
  const { min, max } = boxOf(m.positions);
  const longest = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const h = longest / (CELLS - 4);
  const o = [min[0] - 2 * h, min[1] - 2 * h, min[2] - 2 * h];
  const n = [0, 1, 2].map((k) => Math.max(4, Math.ceil((max[k]! - min[k]!) / h) + 5));
  const [nx, ny, nz] = n as [number, number, number];
  const at = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  const votes = new Uint8Array(nx * ny * nz);
  const voters = new Uint8Array(nx * ny * nz);
  const p = m.positions;
  const ix = m.indices;

  for (let w = 0; w < 3; w++) {
    const u = (w + 1) % 3;
    const v = (w + 2) % 3;
    const nu = n[u]!;
    const nv = n[v]!;
    const cols: (number[] | undefined)[] = new Array(nu * nv);
    // A hair off the cell centres, so no ray runs exactly along an edge.
    const du = 0.5 + 1.3e-4;
    const dv = 0.5 + 2.9e-4;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t]! * 3;
      const b = ix[t + 1]! * 3;
      const c = ix[t + 2]! * 3;
      const au = (p[a + u]! - o[u]!) / h;
      const av = (p[a + v]! - o[v]!) / h;
      const bu = (p[b + u]! - o[u]!) / h;
      const bv = (p[b + v]! - o[v]!) / h;
      const cu = (p[c + u]! - o[u]!) / h;
      const cv = (p[c + v]! - o[v]!) / h;
      const det = (bu - au) * (cv - av) - (cu - au) * (bv - av);
      if (Math.abs(det) < 1e-12) continue; // edge-on to these rays
      const i0 = Math.max(0, Math.ceil(Math.min(au, bu, cu) - du));
      const i1 = Math.min(nu - 1, Math.floor(Math.max(au, bu, cu) - du));
      const j0 = Math.max(0, Math.ceil(Math.min(av, bv, cv) - dv));
      const j1 = Math.min(nv - 1, Math.floor(Math.max(av, bv, cv) - dv));
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const x = i + du;
          const y = j + dv;
          const l1 = ((bu - x) * (cv - y) - (cu - x) * (bv - y)) / det;
          const l2 = ((cu - x) * (av - y) - (au - x) * (cv - y)) / det;
          const l3 = 1 - l1 - l2;
          if (l1 < 0 || l2 < 0 || l3 < 0) continue;
          const z = (l1 * p[a + w]! + l2 * p[b + w]! + l3 * p[c + w]! - o[w]!) / h;
          (cols[j * nu + i] ??= []).push(z);
        }
    }
    const nw = n[w]!;
    const idx = [0, 0, 0];
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const hits = cols[j * nu + i];
        if (hits && hits.length % 2) continue; // through a hole: no vote
        if (hits) hits.sort((x, y) => x - y);
        let next = 0;
        idx[u] = i;
        idx[v] = j;
        for (let k = 0; k < nw; k++) {
          const z = k + 0.5;
          while (hits && next < hits.length && hits[next]! < z) next++;
          idx[w] = k;
          const c = at(idx[0]!, idx[1]!, idx[2]!);
          voters[c]!++;
          if (next % 2) votes[c]!++;
        }
      }
  }

  // +1 inside, -1 outside, then two passes of a 3 × 3 × 3 average to put the surface
  // between cells rather than on their faces.
  let f = new Float32Array(nx * ny * nz);
  for (let c = 0; c < f.length; c++) f[c] = voters[c]! && votes[c]! * 2 > voters[c]! ? 1 : -1;
  for (let pass = 0; pass < 2; pass++) {
    const g = new Float32Array(f.length);
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          let s = 0;
          let cnt = 0;
          for (let dk = -1; dk <= 1; dk++)
            for (let dj = -1; dj <= 1; dj++)
              for (let di = -1; di <= 1; di++) {
                const I = i + di;
                const J = j + dj;
                const K = k + dk;
                s += I < 0 || J < 0 || K < 0 || I >= nx || J >= ny || K >= nz ? -1 : f[at(I, J, K)]!;
                cnt++;
              }
          g[at(i, j, k)] = s / cnt;
        }
    f = g;
  }
  const sample = (x: number, y: number, z: number) => {
    const fx = (x - o[0]!) / h - 0.5;
    const fy = (y - o[1]!) / h - 0.5;
    const fz = (z - o[2]!) / h - 0.5;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const k = Math.floor(fz);
    const tx = fx - i;
    const ty = fy - j;
    const tz = fz - k;
    const g = (I: number, J: number, K: number) => (I < 0 || J < 0 || K < 0 || I >= nx || J >= ny || K >= nz ? -1 : f[at(I, J, K)]!);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(
      l(l(g(i, j, k), g(i + 1, j, k), tx), l(g(i, j + 1, k), g(i + 1, j + 1, k), tx), ty),
      l(l(g(i, j, k + 1), g(i + 1, j, k + 1), tx), l(g(i, j + 1, k + 1), g(i + 1, j + 1, k + 1), tx), ty),
      tz,
    );
  };
  const bounds = { min: [o[0]!, o[1]!, o[2]!] as [number, number, number], max: [o[0]! + nx * h, o[1]! + ny * h, o[2]! + nz * h] as [number, number, number] };
  return wasm.Manifold.levelSet((pt) => sample(pt[0], pt[1], pt[2]) * h, bounds, h, 0);
}
