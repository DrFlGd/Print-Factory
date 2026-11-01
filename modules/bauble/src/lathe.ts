/**
 * Solids of revolution as meshes, with every vertex free to move along the surface normal:
 * how a pattern, a name or a screw thread is wrapped onto a curved surface.
 */
import type { Manifold, ManifoldToplevel } from '@pf/engine-manifold';

export type Pt = [number, number];

/** A profile point and what a displacement needs to know about it. */
export interface Row {
  r: number;
  z: number;
  /** Arc length up the profile from its start. */
  s: number;
  /** Outward normal in the (r, z) plane. */
  nr: number;
  nz: number;
  /** Angle of the surface from the vertical, degrees (0 upright, 90 flat). */
  slope: number;
}

/**
 * Resamples a polyline so no segment is longer than `step(z)`, keeping its corners.
 */
export function resample(pts: Pt[], step: (r: number, z: number) => number): Pt[] {
  const out: Pt[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const [r0, z0] = pts[i - 1]!;
    const [r1, z1] = pts[i]!;
    const len = Math.hypot(r1 - r0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / Math.max(0.05, step((r0 + r1) / 2, (z0 + z1) / 2))));
    for (let k = 1; k <= n; k++) out.push([r0 + ((r1 - r0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  return out;
}

/** The rows of a profile with their arc length, normal and slope. */
export function rowsOf(pts: Pt[]): Row[] {
  const rows: Row[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [r, z] = pts[i]!;
    if (i) s += Math.hypot(r - pts[i - 1]![0], z - pts[i - 1]![1]);
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const tr = b[0] - a[0];
    const tz = b[1] - a[1];
    const l = Math.hypot(tr, tz) || 1;
    rows.push({ r, z, s, nr: tz / l, nz: -tr / l, slope: (Math.atan2(Math.abs(tr), Math.abs(tz)) * 180) / Math.PI });
  }
  return rows;
}

/**
 * A closed solid from a profile that starts and ends on the axis (r = 0), going up the outside.
 * `displace(row, rowIndex, theta)` moves each vertex along the normal (mm, outward positive).
 */
export function lathe(wasm: ManifoldToplevel, pts: Pt[], columns: number, displace?: (row: Row, i: number, theta: number) => number): Manifold {
  const rows = rowsOf(pts);
  const n = Math.max(8, Math.round(columns));
  const verts: number[] = [];
  const index: number[] = []; // first vertex of each row; poles have one vertex
  const pole: boolean[] = [];
  rows.forEach((row, i) => {
    index.push(verts.length / 3);
    if (row.r < 1e-9) {
      pole.push(true);
      verts.push(0, 0, row.z);
      return;
    }
    pole.push(false);
    for (let j = 0; j < n; j++) {
      const th = (2 * Math.PI * j) / n;
      const d = displace ? displace(row, i, th) : 0;
      const r = row.r + d * row.nr;
      verts.push(r * Math.cos(th), r * Math.sin(th), row.z + d * row.nz);
    }
  });
  const tris: number[] = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = index[i]!;
    const b = index[i + 1]!;
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n;
      if (pole[i] && pole[i + 1]) continue;
      if (pole[i]) tris.push(a, b + j1, b + j);
      else if (pole[i + 1]) tris.push(a + j, a + j1, b);
      else tris.push(a + j, a + j1, b + j1, a + j, b + j1, b + j);
    }
  }
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) });
  mesh.merge();
  return wasm.Manifold.ofMesh(mesh);
}

/** The total surface area of a lathe's mesh, mm² (for a vase-mode weight). */
export function surfaceArea(m: Manifold): number {
  return m.surfaceArea();
}
