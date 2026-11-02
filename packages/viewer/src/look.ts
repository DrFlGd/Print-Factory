/**
 * How parts and the bed look, shared by the stage and the card pictures.
 *
 * Parts are shaded smooth across shallow angles and flat across sharp ones, lit by a soft
 * room reflection as well as the lamps (so a black part still shows its form by its
 * highlights), and drawn with their sharp edges in a shade that stands off the part's own
 * colour: lighter on dark parts, darker on light ones.
 *
 * The bed is a printer's build plate: a 2 mm slab with rounded corners and a speckled,
 * textured top, its grid inset from the edge, and the model standing on it.
 */
import type { Part } from '@pf/core';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Above this many triangles a part is flat shaded and drawn without edge lines (cheap). */
const DETAILED = 150_000;
const CREASE = (32 * Math.PI) / 180;

/** A part as a mesh, its sharp edges as a child line set. */
export function partObject(p: Part, opts: { wireframe?: boolean } = {}): THREE.Mesh {
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
  g.setIndex(new THREE.BufferAttribute(p.indices, 1));
  const tris = p.indices.length / 3;
  const detailed = tris <= DETAILED;
  if (detailed) {
    const creased = toCreasedNormals(g, CREASE);
    g.dispose();
    g = creased;
  }
  g.computeBoundingSphere();
  const color = new THREE.Color().setRGB(p.color[0] / 255, p.color[1] / 255, p.color[2] / 255, THREE.SRGBColorSpace);
  const preview = p.role === 'preview' || p.role === 'reference';
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.0,
    flatShading: !detailed,
    wireframe: opts.wireframe ?? false,
    transparent: preview,
    opacity: p.role === 'reference' ? 0.22 : preview ? 0.45 : 1,
    depthWrite: !preview,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = p.name;
  mesh.renderOrder = preview ? 1 : 0;
  if (detailed) {
    // Indexed again for the edges: the creased copy has every triangle on its own.
    const src = new THREE.BufferGeometry();
    src.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
    src.setIndex(new THREE.BufferAttribute(p.indices, 1));
    const edges = new THREE.EdgesGeometry(src, 30);
    src.dispose();
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: edgeColour(color), transparent: true, opacity: preview ? 0.22 : 0.75, depthWrite: false }),
    );
    line.name = 'edges';
    line.renderOrder = mesh.renderOrder;
    line.visible = !(opts.wireframe ?? false);
    mesh.add(line);
  }
  return mesh;
}

/** A shade that stands off `c`: lighter for dark colours, darker for light ones. */
function edgeColour(c: THREE.Color): THREE.Color {
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear
  return lum < 0.08 ? c.clone().lerp(new THREE.Color(0xffffff), 0.42) : c.clone().lerp(new THREE.Color(0x000000), 0.55);
}

/** The lights every view uses: a soft room for reflections, a key lamp and a fill. */
const rooms = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();
export function addLights(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
  let env = rooms.get(renderer);
  if (!env) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    env = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    rooms.set(renderer, env);
  }
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-0.6, -1, 1.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7);
  rim.position.set(1, 1, 0.6);
  scene.add(rim);
}

export interface PlateLook {
  /** The plate's top. */
  plate: string;
  /** Grid lines, and every fifth. */
  grid: string;
  gridMajor: string;
}

/** Speckled, like a textured PEI sheet: fine grey noise, tiled. */
let speckle: THREE.CanvasTexture | null = null;
function speckleTexture(): THREE.CanvasTexture | null {
  if (speckle) return speckle;
  if (typeof document === 'undefined') return null;
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(n, n);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n * n; i++) {
    const v = 200 + Math.round((rand() - 0.5) * 70);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  speckle = new THREE.CanvasTexture(c);
  speckle.wrapS = speckle.wrapT = THREE.RepeatWrapping;
  speckle.colorSpace = THREE.SRGBColorSpace;
  speckle.anisotropy = 4;
  return speckle;
}

/** A rounded rectangle from (0, 0) to (w, h). */
function roundedShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(r, 0);
  s.lineTo(w - r, 0);
  s.quadraticCurveTo(w, 0, w, r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(r, h);
  s.quadraticCurveTo(0, h, 0, h - r);
  s.lineTo(0, r);
  s.quadraticCurveTo(0, 0, r, 0);
  return s;
}

/**
 * The build plate for a bed of w × h mm, its usable area from (0, 0), top at z = 0. The top
 * draws first and writes no depth, so a part a few tenths thick still shows on it.
 */
export function plateObject(w: number, h: number, look: PlateLook): THREE.Group {
  const group = new THREE.Group();
  const margin = 4;
  const r = 8;
  const thick = 2;
  const shape = roundedShape(w + 2 * margin, h + 2 * margin, r);
  const tex = speckleTexture();
  // Shape UVs are in millimetres: scale them so the texture tiles every 60 mm.
  const topGeo = new THREE.ShapeGeometry(shape, 12);
  const uv = topGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 60, uv.getY(i) / 60);
  const top = new THREE.Mesh(
    topGeo,
    new THREE.MeshStandardMaterial({ color: look.plate, roughness: 0.9, metalness: 0.05, map: tex ?? null, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
  );
  top.position.set(-margin, -margin, -0.02);
  top.renderOrder = -2;
  group.add(top);
  // The slab's sides, below the top.
  const sideGeo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 12 });
  const side = new THREE.Mesh(sideGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(look.plate).multiplyScalar(0.7), roughness: 0.7, metalness: 0.2 }));
  side.position.set(-margin, -margin, -thick - 0.06);
  side.renderOrder = -3;
  group.add(side);
  // The grid over the usable area, every fifth line stronger.
  const step = w > 400 || h > 400 ? 50 : 10;
  const minor: number[] = [];
  const major: number[] = [];
  let k = 0;
  for (let x = 0; x <= w + 1e-6; x += step, k++) (k % 5 ? minor : major).push(x, 0, 0, x, h, 0);
  k = 0;
  for (let y = 0; y <= h + 1e-6; y += step, k++) (k % 5 ? minor : major).push(0, y, 0, w, y, 0);
  for (const [pts, color, opacity] of [
    [minor, look.grid, 0.55],
    [major, look.gridMajor, 0.8],
  ] as const) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    lines.renderOrder = -1;
    group.add(lines);
  }
  const edge = new THREE.BufferGeometry();
  edge.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, w, 0, 0, w, h, 0, 0, h, 0, 0, 0, 0], 3));
  const rim = new THREE.Line(edge, new THREE.LineBasicMaterial({ color: look.gridMajor, transparent: true, opacity: 0.9, depthWrite: false }));
  rim.renderOrder = -1;
  group.add(rim);
  return group;
}
