/**
 * Pictures of parts without a stage: one small renderer, made on first use and kept, that
 * draws parts from the iso view onto a clear background. For cards that preview a choice.
 */
import type { Part } from '@pf/core';
import * as THREE from 'three';

let renderer: THREE.WebGLRenderer | null = null;

export async function renderPicture(parts: readonly Part[], opts: { width?: number; height?: number } = {}): Promise<string> {
  const width = Math.round(opts.width ?? 320);
  const height = Math.round(opts.height ?? 200);
  THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.setClearColor(0x000000, 0);
  }
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(ratio);
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(-0.6, -1, 1.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(1, 1, 0.6);
  scene.add(rim);
  const made: { g: THREE.BufferGeometry; m: THREE.Material }[] = [];
  for (const p of parts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
    g.setIndex(new THREE.BufferAttribute(p.indices, 1));
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(p.color[0] / 255, p.color[1] / 255, p.color[2] / 255, THREE.SRGBColorSpace),
      roughness: 0.62,
      metalness: 0.02,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(g, m));
    made.push({ g, m });
  }
  const box = new THREE.Box3().setFromObject(scene);
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.5, 20000);
  camera.up.set(0, 0, 1);
  if (!box.isEmpty()) {
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(5, box.getSize(new THREE.Vector3()).length() / 2);
    const fov = (camera.fov * Math.PI) / 180;
    const dist = (radius / Math.sin(Math.min(fov, fov * camera.aspect) / 2)) * 0.82;
    camera.position.copy(centre).addScaledVector(new THREE.Vector3(1, -1.25, 0.95).normalize(), dist);
    camera.lookAt(centre);
    camera.near = Math.max(0.1, dist / 200);
    camera.far = dist * 50;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  for (const { g, m } of made) {
    g.dispose();
    m.dispose();
  }
  return url;
}
