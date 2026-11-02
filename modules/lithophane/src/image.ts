/**
 * The picture as the build sees it: a greyscale raster (0 black … 255 white), sampled
 * through the framing (fill or fit, zoom, shift, a quarter turn, a mirror) and the tone
 * (brightness, contrast, midtones, negative) into a wall thickness.
 */
import type { Params } from './types';

/** What the Photo panel stores: small enough for a project file, base64 for JSON. */
export interface PhotoInput {
  name: string;
  width: number;
  height: number;
  /** Greyscale bytes, row-major, top row first, base64. */
  gray: string;
}

export interface Grey {
  width: number;
  height: number;
  data: Uint8Array;
  name: string;
}

export function decodePhoto(p: PhotoInput | undefined): Grey {
  if (!p || !p.gray || !(p.width > 0) || !(p.height > 0)) return demo();
  const bin = atob(p.gray);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  if (data.length < p.width * p.height) return demo();
  return { width: p.width, height: p.height, data, name: p.name };
}

/** RGBA (top row first) to the stored form: transparent pixels count as white. */
export function photoFromRgba(name: string, width: number, height: number, rgba: ArrayLike<number>): PhotoInput {
  const g = new Uint8Array(width * height);
  for (let i = 0; i < g.length; i++) {
    const a = rgba[i * 4 + 3]! / 255;
    const y = 0.2126 * rgba[i * 4]! + 0.7152 * rgba[i * 4 + 1]! + 0.0722 * rgba[i * 4 + 2]!;
    g[i] = Math.round(y * a + 255 * (1 - a));
  }
  let s = '';
  for (let i = 0; i < g.length; i += 0x8000) s += String.fromCharCode(...g.subarray(i, i + 0x8000));
  return { name, width, height, gray: btoa(s) };
}

let demoCache: Grey | null = null;

/** A night scene drawn here, so a lithophane shows something before a photo is chosen. */
export function demo(): Grey {
  if (demoCache) return demoCache;
  const W = 600;
  const H = 400;
  const data = new Uint8Array(W * H);
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const ridge = (x: number, f: number[], base: number, amp: number) => base + amp * (Math.sin(x * f[0]! + 1.3) * 0.5 + Math.sin(x * f[1]! + 0.4) * 0.3 + Math.sin(x * f[2]! + 2.1) * 0.2);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const x = i / W;
      const y = 1 - j / H; // up
      // Sky: dark at the top, glowing at the horizon.
      let v = 0.18 + 0.62 * Math.pow(1 - y, 2.2);
      // The moon and its halo.
      const d = Math.hypot(x - 0.72, (y - 0.72) * (H / W));
      v = Math.max(v, 0.95 * (1 - smooth(0.055, 0.06, d)));
      v += 0.25 * Math.exp(-((d / 0.12) ** 2));
      // Craters.
      for (const [cx, cy, r] of [[0.705, 0.74, 0.012], [0.735, 0.7, 0.009], [0.725, 0.755, 0.006]] as const) if (Math.hypot(x - cx, (y - cy) * (H / W)) < r) v -= 0.12;
      // Far and near mountains.
      const far = ridge(x * 6.28, [3, 7, 13], 0.38, 0.12);
      if (y < far) v = 0.45 - 0.15 * (far - y);
      const near = ridge(x * 6.28, [2, 5, 11], 0.22, 0.1);
      if (y < near) v = 0.12;
      // A lake.
      if (y < 0.1) v = 0.25 + 0.2 * Math.abs(Math.sin(x * 90 + y * 40)) * (y / 0.1);
      // Pines on the near shore.
      for (let k = 0; k < 9; k++) {
        const tx = 0.05 + k * 0.035 + 0.01 * Math.sin(k * 3.1);
        const th = 0.16 + 0.05 * Math.abs(Math.sin(k * 1.7));
        const base = 0.1;
        if (y > base && y < base + th) {
          const half = 0.022 * (1 - (y - base) / th);
          if (Math.abs(x - tx) < half) v = 0.05;
        }
      }
      data[j * W + i] = Math.round(255 * Math.max(0, Math.min(1, v)));
    }
  demoCache = { width: W, height: H, data, name: 'Moonrise (built in)' };
  return demoCache;
}

/** Bilinear grey in [0, 1] at image coordinates (0..1 across, 0..1 up). */
function bilinear(g: Grey, x: number, y: number): number {
  const fx = x * (g.width - 1);
  const fy = (1 - y) * (g.height - 1);
  const i0 = Math.max(0, Math.min(g.width - 1, Math.floor(fx)));
  const j0 = Math.max(0, Math.min(g.height - 1, Math.floor(fy)));
  const i1 = Math.min(g.width - 1, i0 + 1);
  const j1 = Math.min(g.height - 1, j0 + 1);
  const tx = Math.max(0, Math.min(1, fx - i0));
  const ty = Math.max(0, Math.min(1, fy - j0));
  const d = g.data;
  const a = d[j0 * g.width + i0]! * (1 - tx) + d[j0 * g.width + i1]! * tx;
  const b = d[j1 * g.width + i0]! * (1 - tx) + d[j1 * g.width + i1]! * tx;
  return (a * (1 - ty) + b * ty) / 255;
}

/**
 * The framing: maps a point of the picture area (u across, v up, both 0..1, the area
 * `aw` × `ah` mm) to a grey, or null outside the picture when it is fitted.
 */
export function framer(g: Grey, p: Params, aw: number, ah: number): (u: number, v: number) => number | null {
  const turned = p.turn === '90' || p.turn === '270';
  const iw = turned ? g.height : g.width;
  const ih = turned ? g.width : g.height;
  const areaAspect = aw / ah;
  const imgAspect = iw / ih;
  // The picture's size in area units (1 = the area's width / height).
  let sw: number;
  let sh: number;
  if ((p.fit === 'fill') === imgAspect > areaAspect) {
    sh = 1;
    sw = imgAspect / areaAspect;
  } else {
    sw = 1;
    sh = areaAspect / imgAspect;
  }
  const z = Math.max(0.1, p.zoom / 100);
  sw *= z;
  sh *= z;
  const ox = p.shiftX / 100;
  const oy = p.shiftY / 100;
  return (u, v) => {
    let x = (u - 0.5 - ox) / sw + 0.5;
    const y = (v - 0.5 - oy) / sh + 0.5;
    if (p.mirror) x = 1 - x;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    switch (p.turn) {
      case '90':
        return bilinear(g, 1 - y, x);
      case '180':
        return bilinear(g, 1 - x, 1 - y);
      case '270':
        return bilinear(g, y, 1 - x);
      default:
        return bilinear(g, x, y);
    }
  };
}

/**
 * Grey (1 white) to wall thickness. "Natural" makes the light through the wall follow
 * the picture: light falls off about exponentially with thickness, so a mid grey is
 * not half way between the thinnest and the thickest wall.
 */
export function toner(p: Params): (grey: number) => number {
  const t0 = p.minThickness;
  const t1 = Math.max(t0 + 0.2, p.maxThickness);
  const span = t1 - t0;
  const c = p.contrast / 100;
  const b = p.brightness / 100;
  // Midtones: a gamma, 50 = none.
  const gamma = Math.pow(2, (50 - p.midtones) / 25);
  const E = Math.exp(-3); // the darkest wall lets through about 5 % of the lightest
  return (grey) => {
    let g = (grey - 0.5) * c + 0.5 + b;
    g = Math.max(0, Math.min(1, g));
    g = Math.pow(g, gamma);
    if (p.negative) g = 1 - g;
    if (p.mapping === 'linear') return t1 - span * g;
    return t0 + (span * Math.log(1 / (g * (1 - E) + E))) / 3;
  };
}
