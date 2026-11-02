/**
 * The lithophane in each form, built where it prints: z up, bed at z = 0, the picture's
 * front toward −y (the viewer). Each returns the solid and where its walls are, for the
 * stands and lamp bases.
 */
import type { Contour, Diagnostic } from '@pf/core';
import type { CrossSection, Manifold } from '@pf/engine-manifold';
import { circle, ellipse, heart, rect, regularPolygon, roundedRect } from '@pf/shapes';
import type { Grey } from './image';
import { framer, toner } from './image';
import { count, sheet } from './sheet';
import type { Ctx, Params } from './types';

export const STEP = { draft: 0.45, standard: 0.3, fine: 0.2 } as const;
/** More samples than this and the build slows to a crawl: the step grows to fit. */
const MAX_SAMPLES = 1_400_000;

export interface Built {
  body: Manifold;
  /** The thickest wall: the frame or rims. */
  T: number;
  /** A flat panel: its size and which side of y = 0 its walls are on. */
  panel?: { W: number; H: number; y0: number; y1: number; flatBottom: boolean };
  /** A lamp: its footprint at the bed (inner and outer radius, or half sides for the cube), height. */
  lamp?: { shape: 'round' | 'square'; rIn: number; rOut: number; H: number; topIn: number; topOut: number };
}

interface Tools {
  ctx: Ctx;
  p: Params;
  notes: Diagnostic[];
  /** Picture thickness at (u, v) of an area aw × ah mm. */
  pic: (aw: number, ah: number) => (u: number, v: number) => number;
  /** The frame/rim thickness. */
  T: number;
  step: (area: number) => number;
}

export function tools(ctx: Ctx, g: Grey, notes: Diagnostic[]): Tools {
  const p = ctx.params;
  const tone = toner(p);
  const T = Math.max(p.frameThickness, p.maxThickness);
  const white = tone(1);
  return {
    ctx,
    p,
    notes,
    T,
    pic: (aw, ah) => {
      const f = framer(g, p, aw, ah);
      return (u, v) => {
        const grey = f(u, v);
        return grey === null ? white : tone(grey);
      };
    },
    step: (area) => {
      const s = STEP[p.detail];
      const need = Math.sqrt(area / MAX_SAMPLES);
      if (need > s) {
        notes.push({ level: 'info', message: `At this size the detail is ${need.toFixed(2)} mm per sample (asked ${s} mm) to keep the build quick.` });
        return need;
      }
      return s;
    },
  };
}

/** A section in the (x, z) plane stood up `y0` … `y1` in y. */
export function ySlab(ctx: Ctx, cs: CrossSection, y0: number, y1: number): Manifold {
  return ctx.extrude(cs, y1 - y0).rotate([90, 0, 0]).translate([0, y1, 0]);
}

/** The flat panel's outline, `W` × `H`, bottom at z = 0, centred on x = 0 (in the (x, z) plane). */
export function outlineOf(p: Params, W: number, H: number): Contour {
  let c: Contour;
  switch (p.outline) {
    case 'rounded':
      c = roundedRect(W, H, Math.min(W, H) * 0.08);
      break;
    case 'oval':
      c = ellipse(W / 2, H / 2, 160);
      break;
    case 'heart':
      c = heart(100, 200);
      break;
    case 'hexagon':
      c = regularPolygon(6, 50, 0);
      break;
    case 'arch': {
      // A rectangle with a half round top.
      const r = W / 2;
      const hs = Math.max(0, H - r);
      const pts: number[] = [-W / 2, -H / 2, W / 2, -H / 2, W / 2, -H / 2 + hs];
      for (let k = 1; k < 64; k++) {
        const a = (Math.PI * k) / 64;
        pts.push(r * Math.cos(a), -H / 2 + hs + r * Math.sin(a));
      }
      pts.push(-W / 2, -H / 2 + hs);
      c = pts;
      break;
    }
    default:
      c = rect(W, H);
  }
  // Stretched to W × H exactly, bottom on z = 0.
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < c.length; i += 2) {
    x0 = Math.min(x0, c[i]!);
    x1 = Math.max(x1, c[i]!);
    y0 = Math.min(y0, c[i + 1]!);
    y1 = Math.max(y1, c[i + 1]!);
  }
  const out: number[] = [];
  for (let i = 0; i < c.length; i += 2) out.push(((c[i]! - (x0 + x1) / 2) * W) / (x1 - x0), ((c[i + 1]! - y0) * H) / (y1 - y0));
  return out;
}

/** Distance from (x, y) to a closed contour's edges. */
function distTo(c: Contour, x: number, y: number): number {
  let best = Infinity;
  const n = c.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = c[i * 2]!;
    const ay = c[i * 2 + 1]!;
    const bx = c[((i + 1) % n) * 2]!;
    const by = c[((i + 1) % n) * 2 + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
    const ex = ax + dx * t - x;
    const ey = ay + dy * t - y;
    const d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** The flat panel's picture area: the outline's box less the frame. */
function areaOf(W: number, H: number, frame: number) {
  return { x0: -W / 2 + frame, z0: frame, aw: Math.max(1, W - 2 * frame), ah: Math.max(1, H - 2 * frame) };
}

/** Flat: a panel in the (x, z) plane, the relief toward the viewer (−y) or behind. */
export function flat(t: Tools, W: number, H: number): Built {
  const { ctx, p, T } = t;
  const out = outlineOf(p, W, H);
  const fr = Math.max(0, p.frame);
  const a = areaOf(W, H, fr);
  const pic = t.pic(a.aw, a.ah);
  const step = t.step(W * H);
  const cu = count(W, step);
  const cv = count(H, step);
  const sign = p.relief === 'front' ? -1 : 1;
  const rectOutline = p.outline === 'rect';
  // Thickness per vertex, the frame by distance to the outline.
  const thick = new Float32Array(cu * cv);
  for (let j = 0; j < cv; j++) {
    const z = (H * j) / (cv - 1);
    for (let i = 0; i < cu; i++) {
      const x = -W / 2 + (W * i) / (cu - 1);
      const d = fr <= 0 ? Infinity : rectOutline ? Math.min(x + W / 2, W / 2 - x, z, H - z) : distTo(out, x, z);
      thick[j * cu + i] = d < fr ? T : pic((x - a.x0) / a.aw, (z - a.z0) / a.ah);
    }
  }
  let body = sheet(ctx, {
    cu,
    cv,
    closedU: false,
    base: (i, j, o) => {
      o.p[0] = -W / 2 + (W * i) / (cu - 1);
      o.p[1] = 0;
      o.p[2] = (H * j) / (cv - 1);
      o.n[0] = 0;
      o.n[1] = sign;
      o.n[2] = 0;
    },
    thickness: (i, j) => thick[j * cu + i]!,
  });
  if (!rectOutline) body = body.intersect(ySlab(ctx, ctx.cs([out]), -T - 5, T + 5));
  const y0 = sign < 0 ? -T : 0;
  const y1 = sign < 0 ? 0 : T;
  const flatBottom = p.outline === 'rect' || p.outline === 'rounded' || p.outline === 'arch' || p.outline === 'hexagon';
  return { body, T, panel: { W, H, y0, y1, flatBottom } };
}

/** Curved: the flat panel bent round a vertical axis behind it, `arcAngle` degrees. */
export function arc(t: Tools, W: number, H: number): Built {
  const { ctx, p, T } = t;
  const A = (Math.max(10, Math.min(300, p.arcAngle)) * Math.PI) / 180;
  const R = W / A;
  const fr = Math.max(0, p.frame);
  const a = areaOf(W, H, fr);
  const pic = t.pic(a.aw, a.ah);
  const step = t.step(W * H);
  const cu = count(W, step);
  const cv = count(H, step);
  const sign = p.relief === 'front' ? 1 : -1;
  return {
    body: sheet(ctx, {
      cu,
      cv,
      closedU: false,
      base: (i, j, o) => {
        const th = (i / (cu - 1) - 0.5) * A;
        o.p[0] = R * Math.sin(th);
        o.p[1] = R * (1 - Math.cos(th));
        o.p[2] = (H * j) / (cv - 1);
        // Out of the curve, toward the viewer.
        o.n[0] = sign * Math.sin(th);
        o.n[1] = -sign * Math.cos(th);
        o.n[2] = 0;
      },
      thickness: (i, j) => {
        const x = (W * i) / (cu - 1);
        const z = (H * j) / (cv - 1);
        if (Math.min(x, W - x, z, H - z) < fr) return T;
        return pic((x - fr) / a.aw, (z - a.z0) / a.ah);
      },
    }),
    T,
  };
}

/**
 * A lamp: the picture round a vertical axis, a solid band (the rim) at the bottom and top.
 * `radius(z)` is the smooth face's radius; the relief goes out or in from it.
 */
function round(t: Tools, H: number, rb: number, rt: number): Built {
  const { ctx, p, T } = t;
  const rim = Math.max(0, p.rim);
  const circ = Math.PI * (rb + rt);
  const aw = circ;
  const ah = Math.max(1, H - 2 * rim);
  const pic = t.pic(aw, ah);
  const step = t.step(circ * H);
  const cu = Math.max(24, Math.round(circ / step));
  const cv = count(H, step);
  const sign = p.relief === 'front' ? 1 : -1;
  const body = sheet(ctx, {
    cu,
    cv,
    closedU: true,
    base: (i, j, o) => {
      // u = 0.5 faces the viewer (−y); u grows to the viewer's right.
      const th = -Math.PI / 2 + (i / cu - 0.5) * 2 * Math.PI;
      const z = (H * j) / (cv - 1);
      const r = rb + ((rt - rb) * z) / H;
      o.p[0] = r * Math.cos(th);
      o.p[1] = r * Math.sin(th);
      o.p[2] = z;
      // Horizontal, so the top and bottom stay flat.
      o.n[0] = sign * Math.cos(th);
      o.n[1] = sign * Math.sin(th);
      o.n[2] = 0;
    },
    thickness: (i, j) => {
      const z = (H * j) / (cv - 1);
      if (z < rim || z > H - rim) return T;
      return pic(i / cu, (z - rim) / ah);
    },
  });
  const inner = (r: number) => (sign > 0 ? r : r - T);
  const outer = (r: number) => (sign > 0 ? r + T : r);
  return { body, T, lamp: { shape: 'round', rIn: inner(rb), rOut: outer(rb), H, topIn: inner(rt), topOut: outer(rt) } };
}

export const cylinder = (t: Tools, H: number) => round(t, H, t.p.diameter / 2, t.p.diameter / 2);

export function cone(t: Tools, H: number): Built {
  const rb = t.p.diameter / 2;
  const rt = t.p.topDiameter / 2;
  const lean = (Math.atan2(Math.abs(rb - rt), H) * 180) / Math.PI;
  if (lean > 45) t.notes.push({ level: 'warning', message: `The shade's side leans ${lean.toFixed(0)}° from upright; past 45° it needs supports. Make it taller or the ends closer in size.` });
  return round(t, H, rb, rt);
}

/** A globe: a sphere with an opening at the bottom for the light and a vent at the top. */
export function globe(t: Tools): Built {
  const { ctx, p, T } = t;
  const R = p.diameter / 2;
  const ro = Math.min(R * 0.95, Math.max(5, p.opening / 2));
  const rv = Math.min(R * 0.5, Math.max(1.5, p.vent / 2));
  const f0 = -Math.acos(ro / R);
  const f1 = Math.acos(rv / R);
  const sign = p.relief === 'front' ? 1 : -1;
  const rimA = Math.max(0, p.rim) / R; // the rim as an angle
  const span = f1 - f0;
  const aw = Math.PI * 2 * R;
  const ah = Math.max(1, R * (span - 2 * rimA));
  const pic = t.pic(aw, ah);
  const step = t.step(aw * R * span);
  const cu = Math.max(24, Math.round(aw / step));
  const cv = count(R * span, step);
  const lat = (j: number) => f0 + (span * j) / (cv - 1);
  if (ro < R * 0.69) t.notes.push({ level: 'info', message: 'Below about 70 % of the diameter, the opening leaves the lower part of the globe overhanging more than 45°: print it slowly with good cooling, or widen the opening.' });
  let body = sheet(ctx, {
    cu,
    cv,
    closedU: true,
    base: (i, j, o) => {
      const th = -Math.PI / 2 + (i / cu - 0.5) * 2 * Math.PI;
      const f = lat(j);
      const c = Math.cos(f);
      o.n[0] = c * Math.cos(th);
      o.n[1] = c * Math.sin(th);
      o.n[2] = Math.sin(f);
      o.p[0] = R * o.n[0];
      o.p[1] = R * o.n[1];
      o.p[2] = R * o.n[2];
      o.n[0] *= sign;
      o.n[1] *= sign;
      o.n[2] *= sign;
    },
    thickness: (i, j) => {
      const f = lat(j);
      if (f < f0 + rimA || f > f1 - rimA) return T;
      return pic(i / cu, (f - f0 - rimA) / (span - 2 * rimA));
    },
  });
  // A flat ring to stand on: cut level just above the lowest point.
  const zb = body.boundingBox().min[2];
  const zCut = R * Math.sin(f0) + 0.4;
  body = body.trimByPlane([0, 0, 1], Math.max(zb, zCut)).translate([0, 0, -Math.max(zb, zCut)]);
  const H = body.boundingBox().max[2];
  const rIn = sign > 0 ? ro : ro - T;
  return { body, T, lamp: { shape: 'round', rIn, rOut: rIn + T / Math.max(0.3, Math.abs(Math.sin(f0))), H, topIn: rv, topOut: rv + T } };
}

/** A cube lamp: four panels, the picture wrapped round them, posts at the corners. */
export function cube(t: Tools, H: number): Built {
  const { ctx, p, T } = t;
  const S = p.side;
  const rim = Math.max(0, p.rim);
  const edge = 2.5; // a solid band down each side, into the post
  const sign = p.relief === 'front' ? 1 : -1;
  const aw = 4 * S;
  const ah = Math.max(1, H - 2 * rim);
  const pic = t.pic(aw, ah);
  const step = t.step(4 * S * H);
  const cu = count(S, step);
  const cv = count(H, step);
  // Each face: where its left edge is, the direction across (viewer's right) and out.
  const faces: { o: [number, number]; d: [number, number]; n: [number, number]; u0: number }[] = [
    { o: [-S / 2, -S / 2], d: [1, 0], n: [0, -1], u0: 0.375 },
    { o: [S / 2, -S / 2], d: [0, 1], n: [1, 0], u0: 0.625 },
    { o: [S / 2, S / 2], d: [-1, 0], n: [0, 1], u0: 0.875 },
    { o: [-S / 2, S / 2], d: [0, -1], n: [-1, 0], u0: 0.125 },
  ];
  const parts: Manifold[] = faces.map((f) =>
    sheet(ctx, {
      cu,
      cv,
      closedU: false,
      base: (i, j, o) => {
        const s = (S * i) / (cu - 1);
        o.p[0] = f.o[0] + f.d[0] * s;
        o.p[1] = f.o[1] + f.d[1] * s;
        o.p[2] = (H * j) / (cv - 1);
        o.n[0] = sign * f.n[0];
        o.n[1] = sign * f.n[1];
        o.n[2] = 0;
      },
      thickness: (i, j) => {
        const s = (S * i) / (cu - 1);
        const z = (H * j) / (cv - 1);
        if (z < rim || z > H - rim || s < edge || s > S - edge) return T;
        const u = f.u0 + s / aw;
        return pic(u - Math.floor(u), (z - rim) / ah);
      },
    }),
  );
  // Corner posts fill the notch where two panels meet.
  const post = (x: number, y: number) => ctx.extrude(ctx.cs([rect(T, T)]).translate([x, y]), H);
  const h = sign > 0 ? S / 2 + T / 2 : S / 2 - T / 2;
  for (const [x, y] of [[h, h], [-h, h], [h, -h], [-h, -h]] as const) parts.push(post(x, y));
  const body = ctx.union(parts);
  const rIn = sign > 0 ? S / 2 : S / 2 - T;
  return { body, T, lamp: { shape: 'square', rIn, rOut: rIn + T, H, topIn: rIn, topOut: rIn + T } };
}

/** A disc in the (x, z) plane. */
export const discXZ = (ctx: Ctx, x: number, z: number, r: number) => ctx.cs([circle(r, Math.max(32, Math.round(r * 8)))]).translate([x, z]);
