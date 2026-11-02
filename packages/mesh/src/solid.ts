/** A stored model as a Manifold inside a build (freed with the build like everything else). */
import type { Manifold, ManifoldContext } from '@pf/engine-manifold';
import type { StoredMesh } from './codec';
import { decodeMesh } from './codec';
import type { RawMesh } from './parse';

export function meshSolid(ctx: ManifoldContext<unknown>, stored: StoredMesh | RawMesh): Manifold {
  const m = 'kind' in stored ? decodeMesh(stored) : stored;
  const mesh = new ctx.wasm.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices });
  mesh.merge();
  const s = ctx.Manifold.ofMesh(mesh);
  if (s.status() !== 'NoError') throw new Error(`The model is not a closed solid (${s.status()}); load it again.`);
  return s;
}
