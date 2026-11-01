/**
 * Flat ornaments and the tree topper's star: outlines drawn on a 100-tall grid, each with its
 * own raised decoration (icing, stripes, an inner outline), scaled to the height asked for.
 */
import type { CrossSection } from '@pf/engine-manifold';
import { circle, ellipse, heart, rect, star } from '@pf/shapes';
import type { Ctx, FlatShape, Topper } from './types';

type P2 = [number, number];

export interface Drawing {
  body: CrossSection;
  /** Raised details, inside the body. */
  deco: CrossSection | null;
  /** Where a name or logo goes (the centre of a clear area), in the drawing's units. */
  spot: P2;
}

class Pen {
  constructor(readonly ctx: Ctx) {}
  disc(x: number, y: number, r: number) {
    return this.ctx.cs([circle(r, Math.max(24, Math.round(r * 6)))]).translate([x, y]);
  }
  oval(x: number, y: number, rx: number, ry: number, deg = 0) {
    return this.ctx.cs([ellipse(rx, ry, 64)]).rotate(deg).translate([x, y]);
  }
  box(x0: number, y0: number, x1: number, y1: number) {
    return this.ctx.cs([rect(x1 - x0, y1 - y0)]).translate([(x0 + x1) / 2, (y0 + y1) / 2]);
  }
  poly(pts: P2[]) {
    return this.ctx.cs([pts.flat()], 'NonZero');
  }
  /** A polyline drawn `w` wide with round ends. */
  stroke(pts: P2[], w: number) {
    const parts: CrossSection[] = [];
    for (let i = 0; i < pts.length; i++) {
      parts.push(this.disc(pts[i]![0], pts[i]![1], w / 2));
      if (i) {
        const [ax, ay] = pts[i - 1]!;
        const [bx, by] = pts[i]!;
        const l = Math.hypot(bx - ax, by - ay);
        if (l < 1e-9) continue;
        parts.push(this.ctx.cs([rect(l, w)]).rotate((Math.atan2(by - ay, bx - ax) * 180) / Math.PI).translate([(ax + bx) / 2, (ay + by) / 2]));
      }
    }
    return this.ctx.CrossSection.union(parts);
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, w: number, n = 24) {
    const pts: P2[] = [];
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return this.stroke(pts, w);
  }
  union(...cs: CrossSection[]) {
    return this.ctx.CrossSection.union(cs);
  }
  hull(...cs: CrossSection[]) {
    return this.ctx.CrossSection.hull(cs);
  }
  star(x: number, y: number, n: number, ro: number, ri: number, deg = 90) {
    return this.ctx.cs([star(n, ro, ri, deg)]).translate([x, y]);
  }
  /** A line `w` wide just inside the outline, `inset` from it. */
  rim(body: CrossSection, inset: number, w: number) {
    return body.offset(-inset, 'Round', 2, 24).subtract(body.offset(-inset - w, 'Round', 2, 24));
  }
  zigzag(x0: number, x1: number, y: number, amp: number, n: number, w: number) {
    const pts: P2[] = [];
    for (let i = 0; i <= 2 * n; i++) pts.push([x0 + ((x1 - x0) * i) / (2 * n), y + (i % 2 ? amp : -amp)]);
    return this.stroke(pts, w);
  }
}

/** A six-armed snowflake, its arms `w` thick. */
function snowflake(d: Pen, cx: number, cy: number, R: number, w: number): CrossSection {
  const parts: CrossSection[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 + Math.PI / 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    parts.push(d.stroke([[cx, cy], [cx + R * dx, cy + R * dy]], w));
    for (const [f, l] of [[0.45, 0.34], [0.72, 0.22]] as const) {
      const bx = cx + R * f * dx;
      const by = cy + R * f * dy;
      for (const s of [-1, 1]) {
        const b = a + s * (Math.PI / 4);
        parts.push(d.stroke([[bx, by], [bx + R * l * Math.cos(b), by + R * l * Math.sin(b)]], w * 0.85));
      }
    }
  }
  parts.push(d.star(cx, cy, 6, R * 0.2, R * 0.2 * Math.cos(Math.PI / 6), 90));
  return d.union(...parts);
}

export function flatDrawing(ctx: Ctx, shape: FlatShape | Topper): Drawing {
  const d = new Pen(ctx);
  const dots = (pts: P2[], r: number) => d.union(...pts.map(([x, y]) => d.disc(x, y, r)));
  switch (shape) {
    case 'tree': {
      const body = d.union(
        d.box(-8, 0, 8, 14),
        d.poly([[-40, 12], [40, 12], [0, 46]]),
        d.poly([[-32, 34], [32, 34], [0, 66]]),
        d.poly([[-24, 54], [24, 54], [0, 86]]),
        d.star(0, 89, 5, 11, 4.6),
      );
      const garland = d.union(d.stroke([[-30, 20], [-8, 26], [14, 23], [33, 28]], 2.4), d.stroke([[-23, 41], [-4, 47], [16, 44], [24, 47]], 2.4), d.stroke([[-16, 61], [0, 66], [14, 63]], 2.4));
      const balls = dots([[-20, 30], [6, 34], [22, 20], [-10, 52], [12, 54], [-2, 74]], 2.8);
      return { body, deco: d.union(garland, balls, d.star(0, 89, 5, 7, 2.9)), spot: [0, 24] };
    }
    case 'snowflake': {
      const body = snowflake(d, 0, 50, 50, 9);
      return { body, deco: d.union(snowflake(d, 0, 50, 44, 2.6), d.disc(0, 50, 5)), spot: [0, 50] };
    }
    case 'gingerbread': {
      const body = d.union(d.disc(0, 82, 17), d.hull(d.disc(0, 54, 18), d.disc(0, 36, 16)), d.stroke([[-10, 58], [-36, 46]], 17), d.stroke([[10, 58], [36, 46]], 17), d.stroke([[-8, 32], [-20, 7]], 18), d.stroke([[8, 32], [20, 7]], 18));
      const deco = d.union(
        dots([[-6, 86], [6, 86]], 2.4),
        d.arc(0, 82, 8, 210, 330, 2),
        dots([[0, 56], [0, 46], [0, 36]], 2.6),
        d.zigzag(-38, -30, 48, 3, 2, 1.8),
        d.zigzag(30, 38, 48, 3, 2, 1.8),
        d.zigzag(-24, -14, 10, 3, 2, 1.8),
        d.zigzag(14, 24, 10, 3, 2, 1.8),
      );
      return { body, deco, spot: [0, 46] };
    }
    case 'stocking': {
      const leg = d.box(-15, 30, 15, 84);
      const foot = d.hull(d.disc(-1, 22, 16), d.disc(26, 16, 12), d.box(-15, 26, 15, 34));
      const cuff = d.box(-20, 80, 20, 100);
      const body = d.union(leg, foot, cuff).offset(-2, 'Round', 2, 16).offset(2, 'Round', 2, 16);
      const inner = body.offset(-2.2, 'Round', 2, 16);
      const deco = d.union(inner.intersect(d.box(-30, 82, 30, 98)), inner.intersect(d.disc(30, 16, 13)), inner.intersect(d.disc(-8, 20, 13)));
      return { body, deco, spot: [0, 56] };
    }
    case 'bell': {
      const right: P2[] = [];
      for (let i = 0; i <= 30; i++) {
        const u = i / 30;
        // From the flared mouth up to the crown.
        const y = 12 + u * 76;
        const r = u < 0.1 ? 40 - 60 * u : 34 * (1 - 0.55 * ((u - 0.1) / 0.9) ** 0.9) * Math.cos(((u - 0.1) / 0.9) ** 3 * (Math.PI / 2)) ** 0.5;
        right.push([Math.max(0, r), y]);
      }
      const outline = [...right, ...right.slice().reverse().map(([x, y]) => [-x, y] as P2)];
      const body = d.union(d.poly(outline), d.disc(0, 8, 8), d.box(-4, 84, 4, 94), d.disc(0, 94, 5));
      const inner = body.offset(-2.5, 'Round', 2, 16);
      const deco = d.union(inner.intersect(d.box(-50, 16, 50, 21)), inner.intersect(d.box(-50, 25, 50, 27.5)), d.star(0, 60, 5, 8, 3.3));
      return { body, deco, spot: [0, 44] };
    }
    case 'jingle-bell': {
      const body = d.union(d.disc(0, 46, 42), d.box(-6, 84, 6, 96), d.disc(0, 96, 6));
      const inner = body.offset(-2.5, 'Round', 2, 16);
      const deco = d.union(inner.intersect(d.box(-50, 48, 50, 53)), d.stroke([[0, 24], [0, 12]], 2.4), dots([[0, 26], [0, 10]], 3.4));
      return { body, deco, spot: [0, 68] };
    }
    case 'star': {
      const body = d.star(0, 45, 5, 55, 23).offset(-2, 'Round', 2, 16).offset(2, 'Round', 2, 16);
      return { body, deco: d.rim(body, 4, 2.4), spot: [0, 47] };
    }
    case 'heart': {
      const body = ctx.cs([heart(100, 160)]);
      const b = body.bounds();
      const h = body.translate([-(b.min[0] + b.max[0]) / 2, -b.min[1]]);
      return { body: h, deco: d.rim(h, 4, 2.4), spot: [0, 55] };
    }
    case 'candy-cane': {
      const path: P2[] = [[8, 6]];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI;
        path.push([-12 + 20 * Math.cos(a), 70 + 20 * Math.sin(a)]);
      }
      path.push([-32, 56]);
      const pts: P2[] = [[8, 6], [8, 70], ...path.slice(2)];
      const body = d.stroke(pts, 18);
      const stripes: CrossSection[] = [];
      for (let k = -8; k < 14; k++) stripes.push(ctx.cs([rect(5, 200)]).rotate(-35).translate([k * 9, 50]));
      const deco = body.offset(-1.6, 'Round', 2, 16).intersect(d.union(...stripes));
      return { body, deco, spot: [8, 30] };
    }
    case 'snowman': {
      const body = d.union(d.disc(0, 26, 26), d.disc(0, 63, 19), d.disc(0, 88, 13), d.box(-13, 98, 13, 101), d.box(-9, 100, 9, 112));
      const deco = d.union(
        dots([[-4.5, 91], [4.5, 91]], 1.9),
        d.poly([[0, 87.5], [10, 85], [0, 84]]),
        dots([[0, 68], [0, 59], [0, 34], [0, 24]], 2.4),
        d.disc(0, 63, 19).intersect(d.box(-20, 74, 20, 79)),
        d.stroke([[9, 76], [15, 64]], 4),
        d.box(-11, 100, 11, 103),
      );
      return { body, deco, spot: [0, 20] };
    }
    case 'pumpkin': {
      const body = d.union(d.oval(-20, 40, 20, 34), d.oval(20, 40, 20, 34), d.oval(-9, 41, 20, 37), d.oval(9, 41, 20, 37), d.stroke([[0, 70], [4, 86]], 9), d.oval(12, 86, 9, 4, 20));
      const deco = d.union(
        d.poly([[-20, 52], [-8, 52], [-14, 64]]),
        d.poly([[8, 52], [20, 52], [14, 64]]),
        d.poly([[-3, 40], [3, 40], [0, 47]]),
        d.poly([[-24, 30], [-16, 24], [-10, 28], [-4, 22], [4, 22], [10, 28], [16, 24], [24, 30], [16, 18], [-16, 18]]),
      );
      return { body, deco, spot: [0, 10] };
    }
    case 'ghost': {
      let body = d.union(d.disc(0, 66, 32), d.box(-32, 14, 32, 66));
      for (let k = 0; k < 4; k++) body = body.add(d.disc(-24 + k * 16, 14, 8));
      for (let k = 0; k < 3; k++) body = body.subtract(d.disc(-16 + k * 16, 6, 8));
      body = body.offset(-1.5, 'Round', 2, 16).offset(1.5, 'Round', 2, 16);
      return { body, deco: d.union(d.oval(-11, 70, 5, 8), d.oval(11, 70, 5, 8), d.oval(0, 52, 6, 8)), spot: [0, 34] };
    }
    case 'bat': {
      const wing: P2[] = [[0, 58], [18, 70], [50, 78], [46, 60], [36, 54], [28, 46], [16, 44], [6, 40]];
      const body = d.union(d.poly(wing), d.poly(wing.map(([x, y]) => [-x, y] as P2).reverse()), d.oval(0, 52, 10, 16), d.disc(0, 70, 9), d.poly([[-8, 72], [-6, 84], [-2, 76]]), d.poly([[8, 72], [6, 84], [2, 76]]));
      const b = body.bounds();
      const t = body.translate([0, -b.min[1]]);
      return { body: t, deco: dots([[-3.5, 32], [3.5, 32]], 1.8), spot: [0, 14] };
    }
    case 'egg': {
      const pts: P2[] = [];
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * 2 * Math.PI;
        const y = 50 + 50 * Math.sin(a);
        const w = 36 * Math.cos(a) * (1 - 0.14 * Math.sin(a));
        pts.push([w, y]);
      }
      const body = d.poly(pts);
      const inner = body.offset(-2.5, 'Round', 2, 16);
      const deco = d.union(inner.intersect(d.zigzag(-40, 40, 62, 5, 7, 2.6)), inner.intersect(d.zigzag(-40, 40, 30, 5, 7, 2.6)), inner.intersect(dots([[-24, 46], [-12, 46], [0, 46], [12, 46], [24, 46]], 2.6)));
      return { body, deco, spot: [0, 46] };
    }
    case 'bunny': {
      const body = d.union(d.oval(0, 32, 30, 26), d.oval(-13, 72, 9, 26, 10), d.oval(13, 72, 9, 26, -10));
      const deco = d.union(d.oval(-13, 74, 4, 18, 10), d.oval(13, 74, 4, 18, -10), dots([[-10, 38], [10, 38]], 2.6), d.poly([[-4, 30], [4, 30], [0, 25]]), d.stroke([[-6, 26], [-22, 30]], 1.4), d.stroke([[-6, 24], [-22, 22]], 1.4), d.stroke([[6, 26], [22, 30]], 1.4), d.stroke([[6, 24], [22, 22]], 1.4));
      return { body, deco, spot: [0, 16] };
    }
    case 'shamrock': {
      const leaf = ctx.cs([heart(36, 96)]);
      const lb = leaf.bounds();
      // Each heart points at the middle.
      const one = leaf.translate([-(lb.min[0] + lb.max[0]) / 2, -lb.min[1] - 2]);
      const c: P2 = [0, 56];
      const leaves = [0, 120, 240].map((a) => one.rotate(a).translate(c));
      const body = d.union(...leaves, d.stroke([[0, 50], [6, 24], [14, 4]], 7));
      const veins = [0, 120, 240].map((a) => {
        const r = (((a + 90) * Math.PI) / 180);
        return d.stroke([[c[0] + 4 * Math.cos(r), c[1] + 4 * Math.sin(r)], [c[0] + 26 * Math.cos(r), c[1] + 26 * Math.sin(r)]], 2);
      });
      return { body, deco: d.union(...veins), spot: [0, 56] };
    }
    case 'star-of-david': {
      const t = (deg: number, r: number) => ctx.cs([[0, r, -r * Math.sin(Math.PI / 3), -r / 2, r * Math.sin(Math.PI / 3), -r / 2]]).rotate(deg).translate([0, 50]);
      const body = t(0, 54).add(t(180, 54)).offset(-1.5, 'Round', 2, 16).offset(1.5, 'Round', 2, 16);
      const lines = d.union(d.rim(t(0, 54), 5, 2.4), d.rim(t(180, 54), 5, 2.4));
      return { body, deco: lines, spot: [0, 50] };
    }
    case 'leaf': {
      // A maple leaf: five lobes, each pointed, round a stem.
      const pts: P2[] = [];
      const lobes = [[90, 50], [38, 46], [-14, 36], [142, 46], [194, 36]] as const;
      for (let i = 0; i < 360; i += 3) {
        let r = 12;
        for (const [a, l] of lobes) {
          const da = Math.abs(((i - a + 540) % 360) - 180);
          r = Math.max(r, l * Math.max(0, 1 - da / 26) ** 0.8 * (1 + 0.12 * Math.cos((da * Math.PI) / 6)));
        }
        pts.push([r * Math.cos((i * Math.PI) / 180), 50 + r * Math.sin((i * Math.PI) / 180) - 12]);
      }
      const body = d.union(d.poly(pts), d.stroke([[0, 32], [0, 2]], 4));
      const veins = d.union(...lobes.map(([a, l]) => d.stroke([[0, 38], [0.8 * l * Math.cos((a * Math.PI) / 180), 38 + 0.8 * l * Math.sin((a * Math.PI) / 180)]], 1.8)));
      return { body, deco: veins, spot: [0, 60] };
    }
    case 'north-star': {
      const pts: P2[] = [];
      for (let i = 0; i < 16; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 8;
        const long = i % 4 === 0;
        const r = i % 2 ? 7 : long ? (i === 8 ? 50 : i === 0 ? 50 : 34) : 20;
        pts.push([r * Math.cos(a), 50 + r * Math.sin(a)]);
      }
      const body = d.poly(pts);
      return { body, deco: d.rim(body, 3.2, 1.8), spot: [0, 50] };
    }
    case 'radiant-star': {
      const pts: P2[] = [];
      for (let i = 0; i < 24; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 12;
        const r = i % 2 ? 22 : i % 4 === 0 ? 50 : 36;
        pts.push([r * Math.cos(a), 50 + r * Math.sin(a)]);
      }
      const body = d.poly(pts).add(d.disc(0, 50, 25));
      return { body, deco: d.union(d.rim(d.disc(0, 50, 24), 0, 2.2), d.star(0, 50, 5, 14, 6)), spot: [0, 50] };
    }
  }
}

/** The drawing scaled to `height` (mm), standing on y = 0, centred on x = 0. */
export function scaled(dr: Drawing, height: number): Drawing {
  const b = dr.body.bounds();
  const k = height / (b.max[1] - b.min[1]);
  const cx = (b.min[0] + b.max[0]) / 2;
  const f = (c: CrossSection) => c.translate([-cx, -b.min[1]]).scale(k);
  return { body: f(dr.body), deco: dr.deco ? f(dr.deco) : null, spot: [(dr.spot[0] - cx) * k, (dr.spot[1] - b.min[1]) * k] };
}
