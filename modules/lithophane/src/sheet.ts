/**
 * A thick sheet over a grid of samples: one face lies on a base surface, the other stands
 * off it along the surface normal by the sampled thickness. Built as a mesh directly (a
 * picture is hundreds of thousands of samples, far too many for booleans), then handed to
 * Manifold.
 */
import type { Manifold } from '@pf/engine-manifold';
import type { Ctx } from './types';

export type Vec3 = [number, number, number];

export interface SheetSpec {
  /** Vertices across (u) and up (v). */
  cu: number;
  cv: number;
  /** Joined round in u (a cylinder): the last column meets the first. */
  closedU: boolean;
  /** The base point and the unit normal the thickness goes along, at vertex (i, j). */
  base(i: number, j: number, out: { p: Vec3; n: Vec3 }): void;
  /** The thickness at vertex (i, j), mm (signed: negative goes against the normal). */
  thickness(i: number, j: number): number;
}

export function sheet(ctx: Ctx, s: SheetSpec): Manifold {
  const { cu, cv, closedU } = s;
  const layer = cu * cv;
  const pos = new Float32Array(layer * 2 * 3);
  const tmp = { p: [0, 0, 0] as Vec3, n: [0, 0, 0] as Vec3 };
  for (let j = 0; j < cv; j++)
    for (let i = 0; i < cu; i++) {
      s.base(i, j, tmp);
      const t = s.thickness(i, j);
      const a = (j * cu + i) * 3;
      const b = (layer + j * cu + i) * 3;
      pos[a] = tmp.p[0];
      pos[a + 1] = tmp.p[1];
      pos[a + 2] = tmp.p[2];
      pos[b] = tmp.p[0] + tmp.n[0] * t;
      pos[b + 1] = tmp.p[1] + tmp.n[1] * t;
      pos[b + 2] = tmp.p[2] + tmp.n[2] * t;
    }
  const qu = closedU ? cu : cu - 1;
  const qv = cv - 1;
  const quads = 2 * qu * qv + 2 * qu + (closedU ? 0 : 2 * qv);
  const tri = new Uint32Array(quads * 6);
  let k = 0;
  const id = (i: number, j: number, l: number) => l * layer + j * cu + (i % cu);
  const quad = (a: number, b: number, c: number, d: number) => {
    tri[k++] = a;
    tri[k++] = b;
    tri[k++] = c;
    tri[k++] = a;
    tri[k++] = c;
    tri[k++] = d;
  };
  // In (i, j, l) the solid is a slab; each face below points out of it.
  for (let j = 0; j < qv; j++)
    for (let i = 0; i < qu; i++) {
      quad(id(i, j, 1), id(i + 1, j, 1), id(i + 1, j + 1, 1), id(i, j + 1, 1));
      quad(id(i, j, 0), id(i, j + 1, 0), id(i + 1, j + 1, 0), id(i + 1, j, 0));
    }
  for (let i = 0; i < qu; i++) {
    quad(id(i, 0, 0), id(i + 1, 0, 0), id(i + 1, 0, 1), id(i, 0, 1));
    quad(id(i, qv, 0), id(i, qv, 1), id(i + 1, qv, 1), id(i + 1, qv, 0));
  }
  if (!closedU)
    for (let j = 0; j < qv; j++) {
      quad(id(0, j, 0), id(0, j, 1), id(0, j + 1, 1), id(0, j + 1, 0));
      quad(id(qu, j, 0), id(qu, j + 1, 0), id(qu, j + 1, 1), id(qu, j, 1));
    }
  // The map from (i, j, l) to space may turn it inside out: then flip every triangle.
  let vol = 0;
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t]! * 3;
    const b = tri[t + 1]! * 3;
    const c = tri[t + 2]! * 3;
    vol +=
      pos[a]! * (pos[b + 1]! * pos[c + 2]! - pos[b + 2]! * pos[c + 1]!) -
      pos[a + 1]! * (pos[b]! * pos[c + 2]! - pos[b + 2]! * pos[c]!) +
      pos[a + 2]! * (pos[b]! * pos[c + 1]! - pos[b + 1]! * pos[c]!);
  }
  if (vol < 0)
    for (let t = 0; t < tri.length; t += 3) {
      const x = tri[t + 1]!;
      tri[t + 1] = tri[t + 2]!;
      tri[t + 2] = x;
    }
  const mesh = new ctx.wasm.Mesh({ numProp: 3, vertProperties: pos, triVerts: tri });
  const m = ctx.Manifold.ofMesh(mesh);
  const st = m.status();
  if (st !== 'NoError') throw new Error(`The lithophane mesh is not solid (${st}).`);
  return m;
}

/** Vertex counts for a span `len` mm at `step` mm, at least 2. */
export const count = (len: number, step: number) => Math.max(2, Math.round(len / step) + 1);
