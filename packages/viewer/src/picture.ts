/**
 * Pictures of parts without a stage: one small renderer, made on first use and kept, that
 * draws parts from the iso view onto a clear background. For cards that preview a choice.
 */
import type { Part } from '@pf/core';
import * as THREE from 'three';
import { addLights, partObject } from './look';

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
  addLights(scene, renderer);
  const made: THREE.Object3D[] = [];
  for (const p of parts) {
    const m = partObject(p);
    scene.add(m);
    made.push(m);
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
  for (const o of made)
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
  return url;
}
