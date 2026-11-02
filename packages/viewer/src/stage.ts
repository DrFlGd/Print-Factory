/**
 * The 3D stage.
 *
 * Z is up, as in every slicer, so a part sits on the bed the way it will print. The camera
 * frames the model on the first build and when the model's size changes a lot; otherwise
 * it stays where the user left it, so dragging a slider never throws the view around.
 * Rendering is on demand (only after a change or camera move), which keeps laptops cool.
 */
import type { Handle, Part } from '@pf/core';
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
  /** Frames the model; `preset` also turns the camera to that view, and `zoom` > 1 comes closer than the fit. */
  fit(preset?: ViewPreset, zoom?: number): void;
  setWireframe(on: boolean): void;
  /** Hides or shows parts by name (for "show only the base" toggles). */
  setHidden(names: readonly string[]): void;
  /**
   * Draws grips that set a parameter when dragged along their axis (or nudged with the
   * arrow keys once clicked); `onSet` gets the new value when one is let go.
   */
  setHandles(handles: readonly Handle[], onSet: (param: string, value: number) => void): void;
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
    // The bed draws first and writes no depth, so parts always draw over it. A sheet a few
    // tenths of a millimetre thick is otherwise lost in the depth buffer's precision.
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: theme.bedColor, depthWrite: false }));
    plane.position.set(w / 2, h / 2, -0.05);
    plane.renderOrder = -2;
    bedGroup.add(plane);
    const step = w > 400 || h > 400 ? 50 : 10;
    const pts: number[] = [];
    for (let x = 0; x <= w + 1e-6; x += step) pts.push(x, 0, 0, x, h, 0);
    for (let y = 0; y <= h + 1e-6; y += step) pts.push(0, y, 0, w, y, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: theme.gridColor, depthWrite: false }));
    grid.renderOrder = -1;
    bedGroup.add(grid);
    const edge = new THREE.BufferGeometry();
    edge.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, w, 0, 0, w, h, 0, 0, h, 0, 0, 0, 0], 3));
    const rim = new THREE.Line(edge, new THREE.LineBasicMaterial({ color: theme.gridColor, depthWrite: false }));
    rim.renderOrder = -1;
    bedGroup.add(rim);
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

  function fit(preset?: ViewPreset, zoom = 1) {
    const box = modelBox();
    if (box.isEmpty()) {
      if (bed) box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(bed.size[0], bed.size[1], 10));
      else box.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 20));
    }
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(5, box.getSize(new THREE.Vector3()).length() / 2);
    const dir = preset ? DIRS[preset].clone() : camera.position.clone().sub(controls.target).normalize();
    const fov = (camera.fov * Math.PI) / 180;
    const dist = ((radius / Math.sin(Math.min(fov, fov * camera.aspect) / 2)) * 1.08) / Math.max(0.1, zoom);
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


  /* ---------------------------------------------------------------- handles */
  const handleGroup = new THREE.Group();
  scene.add(handleGroup);
  const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  const ACCENT = new THREE.Color('#e0592a');
  interface Grip {
    h: Handle;
    obj: THREE.Group;
    value: number;
    plane: THREE.MeshBasicMaterial;
    knob: THREE.MeshBasicMaterial;
    pick: THREE.Object3D[];
  }
  let grips: Grip[] = [];
  let onSet: (param: string, value: number) => void = () => {};
  let active: Grip | null = null;
  let selected: Grip | null = null;
  let hover: Grip | null = null;
  let drag: { s0: number; v0: number } | null = null;
  const label = document.createElement('div');
  label.className = 'pf-handle-label';
  label.style.cssText = 'position:absolute;pointer-events:none;padding:2px 7px;border-radius:6px;font:600 12px/1.5 system-ui,sans-serif;background:#e0592a;color:#fff;white-space:nowrap;transform:translate(10px,-50%);display:none;z-index:2';
  host.appendChild(label);

  const snap = (g: Grip, v: number) => {
    const step = g.h.step ?? 0.5;
    return Math.min(g.h.max, Math.max(g.h.min, Math.round(v / step) * step));
  };
  /** Moves a grip to show `value` (the plane slides along its axis). */
  const place = (g: Grip, value: number) => {
    g.value = value;
    const d = value - g.h.value;
    g.obj.position.set(g.h.at[0], g.h.at[1], g.h.at[2]).addScaledVector(AXES[g.h.axis], d);
  };
  const paint = () => {
    for (const g of grips) {
      const on = g === active || g === selected || g === hover;
      g.plane.opacity = on ? 0.28 : 0.14;
      g.knob.color.copy(on ? ACCENT.clone().offsetHSL(0, 0, 0.08) : ACCENT);
    }
    const g = active ?? selected ?? hover;
    if (g) {
      const knob = g.obj.children[2]!;
      const pos = knob.getWorldPosition(new THREE.Vector3()).project(camera);
      label.style.left = `${((pos.x + 1) / 2) * host.clientWidth}px`;
      label.style.top = `${((1 - pos.y) / 2) * host.clientHeight}px`;
      const step = g.h.step ?? 0.5;
      label.textContent = `${g.h.label} ${g.value.toFixed(step < 1 ? 1 : 0)} mm`;
      label.style.display = '';
    } else label.style.display = 'none';
    invalidate();
  };
  controls.addEventListener('change', () => {
    if (active || selected || hover) paint();
  });

  function setHandles(list: readonly Handle[], cb: (param: string, value: number) => void) {
    onSet = cb;
    const keep = selected?.h.param;
    for (const c of [...handleGroup.children]) {
      handleGroup.remove(c);
      disposeObject(c);
    }
    grips = [];
    active = hover = selected = null;
    drag = null;
    for (const h of list) {
      const obj = new THREE.Group();
      const [w, d] = h.size;
      const plane = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, d), plane);
      const edge = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w / 2, -d / 2, 0), new THREE.Vector3(w / 2, -d / 2, 0), new THREE.Vector3(w / 2, d / 2, 0), new THREE.Vector3(-w / 2, d / 2, 0)]),
        new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false, transparent: true, opacity: 0.9 }),
      );
      // The knob: a double cone on the plane's edge, pointing both ways along the axis.
      const knob = new THREE.MeshBasicMaterial({ color: ACCENT.clone(), depthTest: false });
      const r = Math.max(2, Math.min(5, Math.max(w, d) * 0.06));
      const cone = new THREE.ConeGeometry(r, r * 1.6, 24);
      const up = new THREE.Mesh(cone, knob);
      up.position.set(0, r * 0.8, 0);
      const down = new THREE.Mesh(cone, knob);
      down.rotation.z = Math.PI;
      down.position.set(0, -r * 0.8, 0);
      const grip = new THREE.Group();
      grip.add(up, down);
      // Cones stand along local Y; turn them to the plane's normal (local Z) and put them at the edge.
      grip.rotation.x = Math.PI / 2;
      grip.position.set(w / 2 + r * 1.4, 0, 0);
      grip.renderOrder = 3;
      up.renderOrder = down.renderOrder = 3;
      sheet.renderOrder = 2;
      obj.add(sheet, edge, grip);
      // The plane lies in local XY: turn it square to the axis.
      if (h.axis === 'x') obj.rotation.y = Math.PI / 2;
      if (h.axis === 'y') obj.rotation.x = Math.PI / 2;
      handleGroup.add(obj);
      const g: Grip = { h, obj, value: h.value, plane, knob, pick: [sheet, up, down] };
      place(g, h.value);
      grips.push(g);
      if (h.param === keep) selected = g;
    }
    paint();
  }

  const pointer = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  function hit(e: PointerEvent): Grip | null {
    if (!grips.length) return null;
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    // The knobs first: they draw over everything.
    for (const g of grips) if (ray.intersectObjects(g.pick.slice(1), false).length) return g;
    const hits = ray.intersectObjects(grips.map((g) => g.pick[0]!), false);
    if (!hits.length) return null;
    // The plane only counts where nothing of the model is in front of it.
    const solid = model.children.filter((c) => c.visible && !((c as THREE.Mesh).material as THREE.Material).transparent);
    const front = ray.intersectObjects(solid, false)[0];
    if (front && front.distance < hits[0]!.distance - 0.5) return null;
    return grips.find((g) => g.pick[0] === hits[0]!.object) ?? null;
  }
  /** Where the pointer's ray passes closest to the grip's axis, as a distance along it. */
  function along(g: Grip, e: PointerEvent): number {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const A = AXES[g.h.axis];
    const P = new THREE.Vector3(...g.h.at);
    const D = ray.ray.direction;
    const w0 = P.clone().sub(ray.ray.origin);
    const b = A.dot(D);
    const den = 1 - b * b;
    if (den < 1e-6) return drag?.s0 ?? 0;
    return (b * D.dot(w0) - A.dot(w0)) / den;
  }
  // Capture: before OrbitControls sees the press, so it can be turned off for a drag.
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      const g = hit(e);
      if (!g) {
        if (selected) {
          selected = null;
          paint();
        }
        return;
      }
      controls.enabled = false;
      active = selected = g;
      drag = { s0: along(g, e), v0: g.value };
      canvas.setPointerCapture(e.pointerId);
      canvas.focus();
      paint();
    },
    { capture: true },
  );
  canvas.addEventListener('pointermove', (e) => {
    if (active && drag) {
      place(active, snap(active, drag.v0 + along(active, e) - drag.s0));
      paint();
      return;
    }
    const g = e.buttons ? null : hit(e);
    if (g !== hover) {
      hover = g;
      canvas.style.cursor = g ? (g.h.axis === 'z' ? 'ns-resize' : 'ew-resize') : '';
      paint();
    }
  });
  const release = (e: PointerEvent) => {
    if (!active) return;
    const g = active;
    active = null;
    drag = null;
    controls.enabled = true;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    paint();
    if (g.value !== g.h.value) onSet(g.h.param, g.value);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => {
    if (hover && !active) {
      hover = null;
      canvas.style.cursor = '';
      paint();
    }
  });
  canvas.addEventListener('keydown', (e) => {
    const g = selected;
    if (!g) return;
    if (e.key === 'Escape') {
      selected = null;
      paint();
      return;
    }
    const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    const v = snap(g, g.value + dir * (g.h.step ?? 0.5) * (e.shiftKey ? 10 : 1));
    if (v === g.value) return;
    place(g, v);
    paint();
    onSet(g.h.param, v);
  });

  canvas.addEventListener('dblclick', (e) => {
    if (!hit(e as PointerEvent)) fit();
  });
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
    setHandles,
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
      label.remove();
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      canvas.remove();
    },
  };
}
