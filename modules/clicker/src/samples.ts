/**
 * Sample models for model mode, sculpted here from spheres, cylinders and hulls so the
 * generator shows a clicker before a file is chosen. Each stands on a flat bottom, Z up; the
 * build scales it to the Size asked for.
 */
import type { Manifold } from '@pf/engine-manifold';
import type { Ctx, Params } from './types';

export function sampleModel(ctx: Ctx, kind: Params['sample']): Manifold {
  switch (kind) {
    case 'acorn':
      return acorn(ctx);
    case 'owl':
      return owl(ctx);
    case 'snowman':
      return snowman(ctx);
    case 'cactus':
      return cactus(ctx);
    default:
      return toadstool(ctx);
  }
}

/** Keeps what is above z and drops it onto the bed. */
const standOn = (m: Manifold, z: number) => m.trimByPlane([0, 0, 1], z).translate([0, 0, -z]);

function toadstool(ctx: Ctx): Manifold {
  const M = ctx.Manifold;
  const stem = M.cylinder(26, 19, 17, 96);
  const capDome = M.sphere(27, 128).scale([1, 1, 0.65]).trimByPlane([0, 0, 1], 0).translate([0, 0, 22]);
  const rim = M.cylinder(3, 27, 27, 128).translate([0, 0, 20]);
  let cap = capDome.add(rim);
  for (const [x, y, r] of [[10, 6, 4], [-8, 11, 3.2], [-12, -6, 3.6], [6, -12, 3], [0, 0, 3.8]] as const) {
    const z = 22 + 0.65 * Math.sqrt(Math.max(0, 27 * 27 - x * x - y * y));
    cap = cap.subtract(M.sphere(r, 32).scale([1, 1, 0.5]).translate([x, y, z + 0.4]));
  }
  return stem.add(cap);
}

/** A nut with a scaly cup and a stalk. */
function acorn(ctx: Ctx): Manifold {
  const M = ctx.Manifold;
  const nut = standOn(M.sphere(17, 112).scale([1, 1, 1.18]).translate([0, 0, 20]), 2.5);
  // The cup: a low dome over the nut's top, a rim round it, scales in rings on it.
  const cupZ = 26;
  const R = 19.5;
  let cup = M.sphere(R, 112).scale([1, 1, 0.62]).trimByPlane([0, 0, 1], 0).translate([0, 0, cupZ]).add(M.cylinder(3, R - 0.4, R, 112).translate([0, 0, cupZ - 3]));
  const scales: Manifold[] = [];
  for (const [ring, n] of [[0.25, 14], [0.55, 12], [0.8, 8]] as const) {
    const a = ring * (Math.PI / 2);
    for (let k = 0; k < n; k++) {
      const t = (k / n) * Math.PI * 2 + ring * 2;
      const r = R * Math.cos(a);
      scales.push(M.sphere(2.3, 20).scale([1.3, 1.3, 0.8]).translate([Math.cos(t) * r, Math.sin(t) * r, cupZ + R * 0.62 * Math.sin(a)]));
    }
  }
  cup = cup.add(ctx.union(scales));
  const stalk = M.cylinder(7, 2.6, 1.9, 32).translate([0, 0, cupZ + R * 0.62 - 1]);
  return nut.add(cup).add(stalk);
}

/** A round owl with ear tufts, big eyes, a beak and folded wings. */
function owl(ctx: Ctx): Manifold {
  const M = ctx.Manifold;
  const body = standOn(M.sphere(18, 112).scale([1, 0.9, 1.25]).translate([0, 0, 21.5]), 1.5);
  const tuft = (side: 1 | -1) => M.hull([M.sphere(4.5, 24).translate([side * 9, 0, 38]), M.sphere(0.8, 12).translate([side * 14, 0, 47])]);
  const eye = (side: 1 | -1) => {
    const disc = M.cylinder(4, 6.2, 6.2, 48).rotate([90, 0, 0]).translate([side * 6.8, -11.5, 31]);
    const pupil = M.sphere(2.6, 24).translate([side * 6.4, -15.6, 31]);
    return disc.add(pupil);
  };
  const beak = M.hull([M.sphere(2, 16).translate([0, -14.5, 27]), M.sphere(0.6, 12).translate([0, -18, 23.5])]);
  const wing = (side: 1 | -1) => M.sphere(10, 48).scale([0.32, 0.75, 1.35]).rotate([0, side * -8, 0]).translate([side * 16.2, 1.5, 19]);
  const foot = (side: 1 | -1) => M.sphere(3.4, 24).scale([1, 1.4, 0.6]).translate([side * 5, -10.5, 2]);
  return ctx.union([body, tuft(1), tuft(-1), eye(1), eye(-1), beak, wing(1), wing(-1), foot(1), foot(-1)]).trimByPlane([0, 0, 1], 0);
}

/** Two snowballs and a head, a hat, a carrot nose and coal buttons. */
function snowman(ctx: Ctx): Manifold {
  const M = ctx.Manifold;
  const base = standOn(M.sphere(19, 112).translate([0, 0, 19]), 2.5);
  const middle = M.sphere(14, 96).translate([0, 0, 42]);
  const head = M.sphere(10.5, 96).translate([0, 0, 61]);
  const brim = M.cylinder(1.6, 12, 12, 64).translate([0, 0, 68.5]);
  const hat = M.cylinder(9, 7.5, 7, 64).translate([0, 0, 69.5]);
  const nose = M.cylinder(8, 1.8, 0.4, 24).rotate([90, 0, 0]).translate([0, -9.5, 61]);
  const buttons = [0, 1, 2].map((i) => M.sphere(1.6, 16).translate([0, -Math.sqrt(14 * 14 - (i * 5 - 3) ** 2) + 0.4, 42 + i * 5 - 3]));
  const scarf = M.cylinder(3.2, 10, 10.5, 64).translate([0, 0, 52]);
  return ctx.union([base, middle, head, brim, hat, nose, scarf, ...buttons]);
}

/** A ribbed cactus with two arms in a pot. */
function cactus(ctx: Ctx): Manifold {
  const M = ctx.Manifold;
  const pot = M.cylinder(18, 15, 18, 96).add(M.cylinder(4.5, 19.5, 19.5, 96).translate([0, 0, 15]));
  const top = 50;
  const ribs: Manifold[] = [M.cylinder(top - 16, 12, 12, 64).translate([0, 0, 16]), M.sphere(12, 64).translate([0, 0, top])];
  for (let k = 0; k < 10; k++) {
    const t = (k / 10) * Math.PI * 2;
    const [x, y] = [Math.cos(t) * 11, Math.sin(t) * 11];
    // Straight up the sides, then over the dome to the crown.
    const rib = (k: number, z: number) => M.sphere(2.4, 16).translate([x * k, y * k, z]);
    ribs.push(M.hull([rib(1, 18), rib(1, top)]).add(M.hull([rib(1, top), rib(0.75, top + 6.5), rib(0.35, top + 10)])));
  }
  // Arms at 45° out, then straight up: they print without supports.
  const arm = (side: 1 | -1, z0: number, up: number) => {
    const out = M.hull([M.sphere(5, 32).translate([side * 9, 0, z0]), M.sphere(5, 32).translate([side * 19, 0, z0 + 10])]);
    return out.add(M.hull([M.sphere(5, 32).translate([side * 19, 0, z0 + 10]), M.sphere(5, 32).translate([side * 19, 0, z0 + 10 + up])]));
  };
  return ctx.union([pot, ...ribs, arm(-1, 28, 9), arm(1, 34, 7)]);
}
