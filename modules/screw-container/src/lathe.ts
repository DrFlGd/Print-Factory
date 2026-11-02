/**
 * Solids of revolution as meshes whose vertices can move along the surface normal: how a
 * screw thread, a groove for one, or a knurl is put on a round surface. (The same approach
 * as the bauble's neck, kept here so the modules stay independent.)
 */
import type { Manifold, ManifoldToplevel } from '@pf/engine-manifold';

export type Pt = [number, number];

export interface Row {
  r: number;
  z: number;
  /** Outward normal in the (r, z) plane. */
  nr: number;
  nz: number;
}

/**
 * Splits a polyline so no segment is longer than `step`, keeping its corners. Segments to
 * or from the axis (a flat end) are left whole: nothing displaces them.
 */
export function resample(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const [r0, z0] = pts[i - 1]!;
    const [r1, z1] = pts[i]!;
    const n = r0 < 1e-9 || r1 < 1e-9 ? 1 : Math.max(1, Math.ceil(Math.hypot(r1 - r0, z1 - z0) / Math.max(0.03, step)));
    for (let k = 1; k <= n; k++) out.push([r0 + ((r1 - r0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  return out;
}

/**
 * A closed solid from a profile that starts and ends on the axis (r = 0), going up the
 * outside. `displace(row, theta)` moves a vertex along the normal, mm, outward positive.
 */
export function lathe(wasm: ManifoldToplevel, pts: Pt[], columns: number, displace?: (row: Row, theta: number) => number): Manifold {
  const n = Math.max(12, Math.round(columns));
  const verts: number[] = [];
  const first: number[] = [];
  const pole: boolean[] = [];
  const row: Row = { r: 0, z: 0, nr: 0, nz: 0 };
  pts.forEach(([r, z], i) => {
    first.push(verts.length / 3);
    if (r < 1e-9) {
      pole.push(true);
      verts.push(0, 0, z);
      return;
    }
    pole.push(false);
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const tr = b[0] - a[0];
    const tz = b[1] - a[1];
    const l = Math.hypot(tr, tz) || 1;
    row.r = r;
    row.z = z;
    row.nr = tz / l;
    row.nz = -tr / l;
    for (let j = 0; j < n; j++) {
      const th = (2 * Math.PI * j) / n;
      const d = displace ? displace(row, th) : 0;
      const rr = r + d * row.nr;
      verts.push(rr * Math.cos(th), rr * Math.sin(th), z + d * row.nz);
    }
  });
  const tris: number[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = first[i]!;
    const b = first[i + 1]!;
    if (pole[i] && pole[i + 1]) continue;
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n;
      if (pole[i]) tris.push(a, b + j1, b + j);
      else if (pole[i + 1]) tris.push(a + j, a + j1, b);
      else tris.push(a + j, a + j1, b + j1, a + j, b + j1, b + j);
    }
  }
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) });
  mesh.merge();
  const m = wasm.Manifold.ofMesh(mesh);
  const st = m.status();
  if (st !== 'NoError') throw new Error(`A round part did not come out solid (${st}).`);
  return m;
}

/**
 * The thread's form: 45° flanks, a flat crest and a wider flat root. `x` is the position
 * along the axis within one pitch; the result is the height over the root, 0 to 1.
 */
export const FORM = { rise: 0.32, crest: 0.14 } as const;

export function threadWave(x: number, pitch: number): number {
  const f = (((x / pitch) % 1) + 1) % 1;
  const { rise, crest } = FORM;
  if (f < rise) return f / rise;
  if (f < rise + crest) return 1;
  if (f < 2 * rise + crest) return 1 - (f - rise - crest) / rise;
  return 0;
}

/** The groove a thread runs in: the thread widened by the clearance on both flanks. */
export function grooveWave(x: number, pitch: number, c: number): number {
  return Math.max(threadWave(x - c, pitch), threadWave(x + c, pitch), threadWave(x, pitch));
}

/** The thread's depth, mm: the flanks are 45°, so it rises as far as it runs. */
export const depthOf = (pitch: number) => FORM.rise * pitch;
