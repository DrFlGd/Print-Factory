/** Bold two-colour patterns for a frame's face, drawn over a box at a repeat `s` mm. */
import type { Contour } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { circle, heart, rect, star } from '@pf/shapes';
import type { Box } from './outline';
import type { Ctx, Params } from './types';

const at = (c: Contour, x: number, y: number, k = 1, a = 0): Contour => {
  const out: number[] = [];
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  for (let i = 0; i < c.length; i += 2) {
    const px = c[i]! * k;
    const py = c[i + 1]! * k;
    out.push(x + px * ca - py * sa, y + px * sa + py * ca);
  }
  return out;
};

/** A deterministic random number in [0, 1) for a cell. */
const rnd = (i: number, j: number, k = 0) => {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function band(pts: [number, number][], w: number): Contour {
  // A polyline thickened to a closed band `w` wide.
  const L: number[] = [];
  const R: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i]!;
    const [ax, ay] = pts[Math.max(0, i - 1)]!;
    const [bx, by] = pts[Math.min(pts.length - 1, i + 1)]!;
    const tx = bx - ax;
    const ty = by - ay;
    const n = Math.hypot(tx, ty) || 1;
    L.push(x - (ty / n) * (w / 2), y + (tx / n) * (w / 2));
    R.push(x + (ty / n) * (w / 2), y - (tx / n) * (w / 2));
  }
  const out = [...L];
  for (let i = R.length - 2; i >= 0; i -= 2) out.push(R[i]!, R[i + 1]!);
  return out;
}

export function patternOver(ctx: Ctx, p: Params, b: Box): CrossSection | null {
  const s = Math.max(4, p.patternSize);
  const ox = p.patternDx;
  const oy = p.patternDy;
  const cs: Contour[] = [];
  const i0 = Math.floor((b.x0 - ox) / s) - 2;
  const i1 = Math.ceil((b.x1 - ox) / s) + 2;
  const j0 = Math.floor((b.y0 - oy) / s) - 2;
  const j1 = Math.ceil((b.y1 - oy) / s) + 2;
  const stag = (i: number, j: number): [number, number] => [ox + (i + (j & 1 ? 0.5 : 0)) * s, oy + j * s * 0.87];
  switch (p.pattern) {
    case 'dots':
      for (let j = j0; j <= j1 / 0.87 + 2; j++) for (let i = i0; i <= i1; i++) cs.push(at(circle(s * 0.22, 32), ...stag(i, j)));
      break;
    case 'checks': {
      const c = s / 2;
      for (let j = 2 * j0; j <= 2 * j1; j++) for (let i = 2 * i0; i <= 2 * i1; i++) if ((i + j) & 1) cs.push(at(rect(c + 0.02, c + 0.02), ox + (i + 0.5) * c, oy + (j + 0.5) * c));
      break;
    }
    case 'stars':
      for (let j = j0; j <= j1 / 0.87 + 2; j++) for (let i = i0; i <= i1; i++) cs.push(at(star(5, s * 0.3, s * 0.13), ...stag(i, j)));
      break;
    case 'hearts':
      for (let j = j0; j <= j1 / 0.87 + 2; j++)
        for (let i = i0; i <= i1; i++) {
          const h = heart(s * 0.5, 64);
          cs.push(at(h, ...stag(i, j)));
        }
      break;
    case 'stripes':
      // Wavy stripes on the slant.
      for (let k = Math.floor((b.x0 + b.y0 - ox) / s) - 4; k <= Math.ceil((b.x1 + b.y1 - ox) / s) + 4; k++) {
        const pts: [number, number][] = [];
        const span = (b.x1 - b.x0 + b.y1 - b.y0) * 1.2;
        for (let t = -span; t <= span; t += 1) {
          const wv = Math.sin((t / s) * Math.PI) * s * 0.12;
          pts.push([ox + k * s + t * 0.707 + wv * 0.707, oy + -t * 0.707 + wv * 0.707]);
        }
        cs.push(band(pts, s * 0.45));
      }
      break;
    case 'swirls':
      for (let j = j0; j <= j1 / 0.87 + 2; j++)
        for (let i = i0; i <= i1; i++) {
          const [x, y] = stag(i, j);
          const pts: [number, number][] = [];
          const turns = 1.6;
          const rot = rnd(i, j) * Math.PI * 2;
          for (let t = 0.15; t <= 1; t += 0.02) pts.push([x + Math.cos(rot + t * turns * 2 * Math.PI) * t * s * 0.42, y + Math.sin(rot + t * turns * 2 * Math.PI) * t * s * 0.42]);
          cs.push(band(pts, s * 0.1));
        }
      break;
    case 'blobs':
      for (let j = j0; j <= j1 / 0.87 + 2; j++)
        for (let i = i0; i <= i1; i++) {
          const [x, y] = stag(i, j);
          const pts: number[] = [];
          const r0 = s * (0.2 + 0.12 * rnd(i, j, 1));
          const a1 = rnd(i, j, 2) * 6.28;
          for (let k = 0; k < 40; k++) {
            const a = (k / 40) * Math.PI * 2;
            const r = r0 * (1 + 0.22 * Math.sin(3 * a + a1) + 0.12 * Math.sin(2 * a - a1));
            pts.push(x + (rnd(i, j, 3) - 0.5) * s * 0.3 + r * Math.cos(a), y + (rnd(i, j, 4) - 0.5) * s * 0.3 + r * Math.sin(a));
          }
          cs.push(pts);
        }
      break;
    case 'deco':
      // Art-deco fans: rows of concentric half rings, each row over the next.
      for (let j = j1 + 2; j >= j0 - 2; j--)
        for (let i = i0; i <= i1; i++) {
          const x = ox + (i + (j & 1 ? 0.5 : 0)) * s;
          const y = oy + j * s * 0.5;
          for (let k = 0; k < 3; k++) {
            const ro = s * (0.5 - k * 0.15);
            const ri = ro - s * 0.07;
            const arc: number[] = [];
            for (let q = 0; q <= 24; q++) arc.push(x + ro * Math.cos((Math.PI * q) / 24), y + ro * Math.sin((Math.PI * q) / 24));
            for (let q = 24; q >= 0; q--) arc.push(x + ri * Math.cos((Math.PI * q) / 24), y + ri * Math.sin((Math.PI * q) / 24));
            cs.push(arc);
          }
        }
      break;
    default:
      return null;
  }
  if (!cs.length) return null;
  return ctx.cs(cs, 'NonZero');
}
