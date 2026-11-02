/**
 * The fallback for a mesh Manifold will not take as a solid (holes, edges shared by three
 * faces, faces through each other): rebuild it from voxels.
 *
 * Rays are cast along X, Y and Z through every column of a grid and their crossings with
 * the triangles counted; a cell is inside a column when an odd number of crossings lie
 * before it. A column with an odd total went through a hole, so it does not vote. A cell is
 * inside when most of the columns through it that do vote say so. That gives each cell its
 * side; next to the surface its value is the exact distance to the nearest triangle, further
 * out it is clamped, and Manifold's level set makes a closed surface of the field. Using the
 * real distance puts the surface where the model's was, between cells, so flat faces stay
 * flat and edges stay sharp to within the grid.
 *
 * Detail finer than a cell is lost, which is why this only runs when nothing else works.
 */
import type { Manifold, ManifoldToplevel } from '@pf/engine-manifold';
import type { RawMesh } from './parse';
import { boxOf } from './parse';

/** Cells along the model's longest side. */
const CELLS = 150;

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

  // The side each cell is on, and its distance to the surface where a triangle is near.
  const N = nx * ny * nz;
  const clampD = 1.5 * h;
  const f = new Float32Array(N);
  for (let c = 0; c < N; c++) f[c] = voters[c]! && votes[c]! * 2 > voters[c]! ? clampD : -clampD;
  // Triangles binned by the cells within a cell of them (counted, then filled: one flat array).
  const nTri = ix.length / 3;
  const cellBox = (t: number) => {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let q = 0; q < 3; q++) {
      const a = ix[t * 3 + q]! * 3;
      for (let k = 0; k < 3; k++) {
        const g = (p[a + k]! - o[k]!) / h - 0.5;
        lo[k] = Math.min(lo[k]!, g);
        hi[k] = Math.max(hi[k]!, g);
      }
    }
    return [0, 1, 2].map((k) => [Math.max(0, Math.floor(lo[k]! - 1)), Math.min(n[k]! - 1, Math.ceil(hi[k]! + 1))]) as [number, number][];
  };
  const counts = new Uint32Array(N + 1);
  for (let t = 0; t < nTri; t++) {
    const [[i0, i1], [j0, j1], [k0, k1]] = cellBox(t);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) counts[at(i, j, k) + 1]!++;
  }
  for (let c = 0; c < N; c++) counts[c + 1]! += counts[c]!;
  const fill = counts.slice(0, N);
  const tris = new Uint32Array(counts[N]!);
  for (let t = 0; t < nTri; t++) {
    const [[i0, i1], [j0, j1], [k0, k1]] = cellBox(t);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) tris[fill[at(i, j, k)]!++] = t;
  }
  const P = (q: number): [number, number, number] => [p[q * 3]!, p[q * 3 + 1]!, p[q * 3 + 2]!];
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const c = at(i, j, k);
        if (counts[c] === counts[c + 1]) continue;
        const x: [number, number, number] = [o[0]! + (i + 0.5) * h, o[1]! + (j + 0.5) * h, o[2]! + (k + 0.5) * h];
        let d2 = clampD * clampD;
        for (let e = counts[c]!; e < counts[c + 1]!; e++) {
          const t = tris[e]!;
          d2 = Math.min(d2, pointTriangle2(x, P(ix[t * 3]!), P(ix[t * 3 + 1]!), P(ix[t * 3 + 2]!)));
        }
        f[c] = Math.sign(f[c]!) * Math.sqrt(d2);
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
    const g = (I: number, J: number, K: number) => (I < 0 || J < 0 || K < 0 || I >= nx || J >= ny || K >= nz ? -clampD : f[at(I, J, K)]!);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(
      l(l(g(i, j, k), g(i + 1, j, k), tx), l(g(i, j + 1, k), g(i + 1, j + 1, k), tx), ty),
      l(l(g(i, j, k + 1), g(i + 1, j, k + 1), tx), l(g(i, j + 1, k + 1), g(i + 1, j + 1, k + 1), tx), ty),
      tz,
    );
  };
  const bounds = { min: [o[0]!, o[1]!, o[2]!] as [number, number, number], max: [o[0]! + nx * h, o[1]! + ny * h, o[2]! + nz * h] as [number, number, number] };
  return wasm.Manifold.levelSet((pt) => sample(pt[0], pt[1], pt[2]), bounds, h, 0);
}

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Squared distance from point `x` to triangle abc (closest point by Voronoi regions). */
export function pointTriangle2(x: V3, a: V3, b: V3, c: V3): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ax = sub(x, a);
  const d1 = dot(ab, ax);
  const d2 = dot(ac, ax);
  const at = (q: V3) => dot(sub(x, q), sub(x, q));
  if (d1 <= 0 && d2 <= 0) return at(a);
  const bx = sub(x, b);
  const d3 = dot(ab, bx);
  const d4 = dot(ac, bx);
  if (d3 >= 0 && d4 <= d3) return at(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const t = d1 / (d1 - d3);
    return at([a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
  }
  const cx = sub(x, c);
  const d5 = dot(ab, cx);
  const d6 = dot(ac, cx);
  if (d6 >= 0 && d5 <= d6) return at(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const t = d2 / (d2 - d6);
    return at([a[0] + ac[0] * t, a[1] + ac[1] * t, a[2] + ac[2] * t]);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const t = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return at([b[0] + (c[0] - b[0]) * t, b[1] + (c[1] - b[1]) * t, b[2] + (c[2] - b[2]) * t]);
  }
  const den = 1 / (va + vb + vc);
  const v = vb * den;
  const w = vc * den;
  return at([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}
