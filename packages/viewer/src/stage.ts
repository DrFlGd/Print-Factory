/**
 * The 3D stage.
 *
 * Z is up, as in every slicer, so a part sits on the bed the way it will print. The camera
 * frames the model on the first build and when the model's size changes a lot; otherwise
 * it stays where the user left it, so dragging a slider never throws the view around.
 * Rendering is on demand (only after a change or camera move), which keeps laptops cool.
 */
import type { Part } from '@pf/core';
import { boundsSize, partBounds } from '@pf/core';
import type { Bed } from '@pf/plate';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ViewPreset = 'iso' | 'top' | 'front' | 'side';

export interface StageOptions {
  background?: string;
  /** Colour of the bed surface and grid. */
  bedColor?: string;
  gridColor?: string;
}

export interface Stage {
  setParts(parts: readonly Part[]): void;
  setBed(bed: Bed | null): void;
  setTheme(t: StageOptions): void;
  /** Frames the model; `preset` also turns the camera to that view. */
  fit(preset?: ViewPreset): void;
  setWireframe(on: boolean): void;
  /** Hides or shows parts by name (for "show only the base" toggles). */
  setHidden(names: readonly string[]): void;
  /** A PNG of the model from the iso view, square, for 3MF thumbnails and cards. */
  capture(size?: number): Promise<Uint8Array>;
  resize(): void;
  dispose(): void;
  readonly canvas: HTMLCanvasElement;
}

const ISO = new THREE.Vector3(1, -1.25, 0.95).normalize();
const DIRS: Record<ViewPreset, THREE.Vector3> = {
  iso: ISO,
  top: new THREE.Vector3(0, -0.0001, 1).normalize(),
  front: new THREE.Vector3(0, -1, 0.0001).normalize(),
  side: new THREE.Vector3(1, 0, 0.0001).normalize(),
};

export function createStage(host: HTMLElement, opts: StageOptions = {}): Stage {
  THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.className = 'pf-stage-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '3D preview. Drag to orbit, right-drag to pan, scroll to zoom.');
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 20000);
  camera.up.set(0, 0, 1);
  camera.position.set(150, -190, 150);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(-0.6, -1, 1.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(1, 1, 0.6);
  scene.add(rim);

  const model = new THREE.Group();
  scene.add(model);
  const bedGroup = new THREE.Group();
  scene.add(bedGroup);

  let theme: Required<StageOptions> = { background: '#eef0f3', bedColor: '#dfe3e8', gridColor: '#c3c9d1', ...opts };
  let bed: Bed | null = null;
  let wire = false;
  let hidden = new Set<string>();
  let lastSize = 0;
  let framed = false;
  let raf = 0;

  const render = () => {
    raf = 0;
    controls.update();
    renderer.render(scene, camera);
  };
  const invalidate = () => {
    if (!raf) raf = requestAnimationFrame(render);
  };
  controls.addEventListener('change', invalidate);
  // Damping needs a few frames after the pointer is released.
  controls.addEventListener('end', () => {
    let n = 20;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      if (--n > 0) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  function applyTheme() {
    scene.background = new THREE.Color(theme.background);
    drawBed();
    invalidate();
  }

  function drawBed() {
    for (const c of [...bedGroup.children]) {
      bedGroup.remove(c);
      disposeObject(c);
    }
    if (!bed) return;
    const [w, h] = bed.size;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: theme.bedColor, transparent: true, opacity: 0.9 }));
    plane.position.set(w / 2, h / 2, -0.05);
    bedGroup.add(plane);
    const step = w > 400 || h > 400 ? 50 : 10;
    const pts: number[] = [];
    for (let x = 0; x <= w + 1e-6; x += step) pts.push(x, 0, 0, x, h, 0);
    for (let y = 0; y <= h + 1e-6; y += step) pts.push(0, y, 0, w, y, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    bedGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: theme.gridColor })));
    const edge = new THREE.BufferGeometry();
    edge.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, w, 0, 0, w, h, 0, 0, h, 0, 0, 0, 0], 3));
    bedGroup.add(new THREE.Line(edge, new THREE.LineBasicMaterial({ color: theme.gridColor })));
  }

  function disposeObject(o: THREE.Object3D) {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }

  function modelBox(): THREE.Box3 {
    const box = new THREE.Box3();
    for (const c of model.children) if (c.visible) box.expandByObject(c);
    return box;
  }

  function fit(preset?: ViewPreset) {
    const box = modelBox();
    if (box.isEmpty()) {
      if (bed) box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(bed.size[0], bed.size[1], 10));
      else box.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 20));
    }
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(5, box.getSize(new THREE.Vector3()).length() / 2);
    const dir = preset ? DIRS[preset].clone() : camera.position.clone().sub(controls.target).normalize();
    const fov = (camera.fov * Math.PI) / 180;
    const dist = (radius / Math.sin(Math.min(fov, fov * camera.aspect) / 2)) * 1.08;
    controls.target.copy(centre);
    camera.position.copy(centre).addScaledVector(dir, dist);
    camera.near = Math.max(0.1, dist / 200);
    camera.far = dist * 50;
    camera.updateProjectionMatrix();
    invalidate();
  }

  function setParts(parts: readonly Part[]) {
    for (const c of [...model.children]) {
      model.remove(c);
      disposeObject(c);
    }
    for (const p of parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
      g.setIndex(new THREE.BufferAttribute(p.indices, 1));
      g.computeBoundingSphere();
      const color = new THREE.Color().setRGB(p.color[0] / 255, p.color[1] / 255, p.color[2] / 255, THREE.SRGBColorSpace);
      const preview = p.role === 'preview' || p.role === 'reference';
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.62,
        metalness: 0.02,
        flatShading: true,
        wireframe: wire,
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
      mesh.visible = !hidden.has(p.name);
      mesh.renderOrder = preview ? 1 : 0;
      model.add(mesh);
    }
    const size = parts.length ? Math.max(...boundsSize(partBounds(parts))) : 0;
    // Re-frame on the first model and when the size changes by more than 2×; otherwise
    // leave the camera alone.
    if (!framed || (size > 0 && (size > lastSize * 2 || size < lastSize / 2))) {
      fit(framed ? undefined : 'iso');
      framed = size > 0;
    }
    if (size > 0) lastSize = size;
    invalidate();
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(host);
  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  }

  async function capture(size = 512): Promise<Uint8Array> {
    const prev = { pos: camera.position.clone(), target: controls.target.clone(), aspect: camera.aspect };
    const oldBed = bedGroup.visible;
    bedGroup.visible = false;
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    fit('iso');
    controls.update();
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    const px = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    renderer.setRenderTarget(null);
    rt.dispose();
    bedGroup.visible = oldBed;
    camera.position.copy(prev.pos);
    controls.target.copy(prev.target);
    camera.aspect = prev.aspect;
    camera.updateProjectionMatrix();
    invalidate();
    // Flip rows (GL origin is bottom-left) and encode.
    const c = new OffscreenCanvas(size, size);
    const g = c.getContext('2d')!;
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    g.putImageData(img, 0, 0);
    const blob = await c.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
  }

  canvas.addEventListener('dblclick', () => fit());
  applyTheme();
  resize();

  return {
    canvas,
    setParts,
    setBed(b) {
      bed = b;
      drawBed();
      invalidate();
    },
    setTheme(t) {
      theme = { ...theme, ...t };
      applyTheme();
    },
    fit,
    setWireframe(on) {
      wire = on;
      model.traverse((c) => {
        const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && 'wireframe' in m) m.wireframe = on;
      });
      invalidate();
    },
    setHidden(names) {
      hidden = new Set(names);
      for (const c of model.children) c.visible = !hidden.has(c.name);
      invalidate();
    },
    capture,
    resize,
    dispose() {
      ro.disconnect();
      cancelAnimationFrame(raf);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      canvas.remove();
    },
  };
}
