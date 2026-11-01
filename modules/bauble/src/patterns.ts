/**
 * Repeating patterns as line art on one tile, 1 wide and `h` tall (in tile widths), that
 * repeats round the bauble and up it. A pattern is strokes (segments, arcs, wavy lines) and
 * fills (polygons, discs); `mask` says how much of a point is pattern, 0 to 1, with the lines
 * drawn `line` mm wide whatever the tile's size on the surface.
 *
 * The Japanese patterns are the traditional ones; the others are drawn for Print Factory.
 */
export type Prim =
  | { k: 'seg'; a: [number, number]; b: [number, number] }
  | { k: 'arc'; c: [number, number]; r: number; a0: number; a1: number; hide?: [number, number, number][] }
  | { k: 'poly'; p: number[] }
  | { k: 'disc'; c: [number, number]; r: number };

export interface Tile {
  /** Height in tile widths. */
  h: number;
  prims: Prim[];
}

const S3 = Math.sqrt(3);
const seg = (a: [number, number], b: [number, number]): Prim => ({ k: 'seg', a, b });
const arc = (c: [number, number], r: number, a0 = 0, a1 = 2 * Math.PI, hide?: [number, number, number][]): Prim => ({ k: 'arc', c, r, a0, a1, hide });
const disc = (c: [number, number], r: number): Prim => ({ k: 'disc', c, r });
const poly = (p: number[]): Prim => ({ k: 'poly', p });
/** A polyline as segments. */
const path = (pts: [number, number][]): Prim[] => pts.slice(1).map((p, i) => seg(pts[i]!, p));
/** A curve x = f(t), y = g(t) as segments. */
const curve = (f: (t: number) => [number, number], n = 24): Prim[] => path(Array.from({ length: n + 1 }, (_, i) => f(i / n)));

/** Points of a triangular lattice with unit spacing, two rows per tile (h = √3). */
function triLattice(fn: (p: (i: number, j: number) => [number, number]) => void) {
  fn((i, j) => [i + 0.5 * j, (j * S3) / 2]);
}

function triangles(each: (a: [number, number], b: [number, number], c: [number, number]) => Prim[]): Prim[] {
  const out: Prim[] = [];
  triLattice((p) => {
    for (let j = 0; j < 2; j++)
      for (let i = -1; i < 2; i++) {
        out.push(...each(p(i, j), p(i + 1, j), p(i, j + 1)));
        out.push(...each(p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)));
      }
  });
  return out;
}

const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const centroid = (a: [number, number], b: [number, number], c: [number, number]): [number, number] => [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];

function starPoly(cx: number, cy: number, n: number, ro: number, ri: number, rot = Math.PI / 2): number[] {
  const p: number[] = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 ? ri : ro;
    p.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return p;
}

function flower(cx: number, cy: number, r: number, petals = 5): number[] {
  const p: number[] = [];
  for (let i = 0; i < 80; i++) {
    const a = (i / 80) * 2 * Math.PI;
    const k = 0.55 + 0.45 * Math.abs(Math.cos((petals / 2) * a)) ** 0.6;
    p.push(cx + r * k * Math.cos(a + Math.PI / 2), cy + r * k * Math.sin(a + Math.PI / 2));
  }
  return p;
}

function heartPoly(cx: number, cy: number, s: number): number[] {
  const p: number[] = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * 2 * Math.PI;
    p.push(cx + (s * 16 * Math.sin(t) ** 3) / 34, cy + (s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))) / 34);
  }
  return p;
}

/** A six-armed snowflake of strokes. */
function snowflake(cx: number, cy: number, r: number): Prim[] {
  const out: Prim[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 + Math.PI / 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    out.push(seg([cx, cy], [cx + r * dx, cy + r * dy]));
    for (const f of [0.45, 0.72]) {
      const bx = cx + r * f * dx;
      const by = cy + r * f * dy;
      const l = r * (f < 0.5 ? 0.32 : 0.22);
      for (const s of [-1, 1]) {
        const b = a + s * (Math.PI / 4);
        out.push(seg([bx, by], [bx + l * Math.cos(b), by + l * Math.sin(b)]));
      }
    }
  }
  return out;
}

export const THEMES = {
  plain: [],
  traditional: ['snowflakes', 'stars', 'candy-stripes', 'polka'],
  japanese: ['asanoha', 'kikko', 'kagome', 'shippo', 'seigaiha', 'sakura', 'uroko', 'tachiwaki', 'yagasuri'],
  scandinavian: ['nordic-stars', 'hearts', 'zigzag', 'knit'],
  'art-deco': ['fans', 'sunburst', 'chevrons', 'steps'],
  oriental: ['key', 'quatrefoil', 'clouds'],
  gothic: ['arches', 'trefoil', 'rose'],
  geometric: ['cubes', 'argyle', 'triangles', 'hexagons'],
  halloween: ['webs', 'bats', 'pumpkins'],
  easter: ['eggs', 'daisies', 'bunnies'],
  valentine: ['heart-lattice', 'xo'],
  hanukkah: ['david-stars', 'dreidels'],
  'st-patricks': ['shamrocks', 'clover-lattice'],
  autumn: ['leaves', 'acorns'],
  'new-year': ['fireworks', 'confetti'],
} as const;
export type Theme = keyof typeof THEMES;

export function tile(id: string): Tile | null {
  switch (id) {
    /* ------------------------------------------------ Japanese */
    case 'asanoha':
      // Hemp leaf: every triangle of the lattice, and from its corners to its centre.
      return { h: S3, prims: triangles((a, b, c) => { const m = centroid(a, b, c); return [seg(a, b), seg(b, c), seg(c, a), seg(a, m), seg(b, m), seg(c, m)]; }) };
    case 'kagome':
      // Basket weave: the lines joining the midpoints of every triangle's sides.
      return { h: S3, prims: triangles((a, b, c) => { const [x, y, z] = [mid(a, b), mid(b, c), mid(c, a)]; return [seg(x, y), seg(y, z), seg(z, x)]; }) };
    case 'kikko': {
      // Tortoise shell: hexagons, each with a smaller one inside.
      const prims: Prim[] = [];
      const R = 1 / S3;
      for (const [cx, cy] of [[0, 0], [1, 0], [0.5, S3 / 2], [0, S3], [1, S3], [-0.5, S3 / 2], [1.5, S3 / 2]] as [number, number][]) {
        for (const f of [1, 0.62]) {
          const hex: [number, number][] = [];
          for (let k = 0; k <= 6; k++) hex.push([cx + f * R * Math.cos(Math.PI / 6 + (k * Math.PI) / 3), cy + f * R * Math.sin(Math.PI / 6 + (k * Math.PI) / 3)]);
          prims.push(...path(hex));
        }
      }
      return { h: S3, prims };
    }
    case 'shippo':
      // Seven treasures: circles overlapping their four neighbours.
      return { h: 1, prims: [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]].map((c) => arc(c as [number, number], 0.5)) };
    case 'seigaiha': {
      // Waves of the blue sea: rows of concentric scales, each half hidden by the row in front.
      const prims: Prim[] = [];
      const rows: [number, number][] = [];
      for (let j = -1; j <= 3; j++) for (let i = -1; i <= 2; i++) rows.push([i + (j % 2 ? 0.5 : 0), j * 0.25]);
      for (const [cx, cy] of rows) {
        const front: [number, number, number][] = [[cx - 0.5, cy - 0.25, 0.5], [cx + 0.5, cy - 0.25, 0.5], [cx, cy - 0.5, 0.5]];
        for (const r of [0.5, 0.36, 0.22]) prims.push(arc([cx, cy], r, 0, Math.PI, front));
      }
      return { h: 0.5, prims };
    }
    case 'sakura':
      return { h: 1, prims: [poly(flower(0.25, 0.25, 0.17)), poly(flower(0.75, 0.75, 0.17))] };
    case 'uroko': {
      // Dragon scales: rows of solid triangles.
      const h = S3 / 2;
      return { h: 2 * h, prims: [poly([0, 0, 1, 0, 0.5, h]), poly([-0.5, h, 0.5, h, 0, 2 * h]), poly([0.5, h, 1.5, h, 1, 2 * h])] };
    }
    case 'tachiwaki':
      // Rising steam: wavy lines that swell and pinch in pairs.
      return { h: 1, prims: [...curve((t) => [0.5 + 0.2 * Math.sin(2 * Math.PI * t), t]), ...curve((t) => [0.5 - 0.2 * Math.sin(2 * Math.PI * t), t]), ...curve((t) => [0.0 + 0.2 * Math.sin(2 * Math.PI * t + Math.PI), t]), ...curve((t) => [1.0 + 0.2 * Math.sin(2 * Math.PI * t + Math.PI), t])] };
    case 'yagasuri':
      // Arrow feathers: columns of chevrons, pointing up and down by turns.
      return { h: 1, prims: [...path([[0, 0], [0.25, 0.25], [0.5, 0]]), ...path([[0, 0.5], [0.25, 0.75], [0.5, 0.5]]), ...path([[0.5, 0.25], [0.75, 0], [1, 0.25]]), ...path([[0.5, 0.75], [0.75, 0.5], [1, 0.75]]), seg([0, 0], [0, 1]), seg([0.5, 0], [0.5, 1])] };
    /* ------------------------------------------------ Traditional */
    case 'snowflakes':
      return { h: 1, prims: [...snowflake(0.25, 0.25, 0.2), ...snowflake(0.75, 0.75, 0.2)] };
    case 'stars':
      return { h: 1, prims: [poly(starPoly(0.25, 0.25, 5, 0.17, 0.07)), poly(starPoly(0.75, 0.75, 5, 0.12, 0.05))] };
    case 'candy-stripes':
      return { h: 1, prims: [poly([0, 0, 0.3, 0, 1, 0.7, 1, 1, 0.7, 1, 0, 0.3]), poly([0.6, 0, 1, 0, 1, 0.4]), poly([0, 0.6, 0.4, 1, 0, 1])] };
    case 'polka':
      return { h: 1, prims: [disc([0.25, 0.25], 0.13), disc([0.75, 0.75], 0.13)] };
    /* ------------------------------------------------ Scandinavian */
    case 'nordic-stars': {
      const p: Prim[] = [];
      for (const [cx, cy] of [[0.25, 0.25], [0.75, 0.75]] as [number, number][]) {
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          const tip: [number, number] = [cx + 0.2 * Math.cos(a), cy + 0.2 * Math.sin(a)];
          p.push(seg([cx + 0.08 * Math.cos(a - Math.PI / 4), cy + 0.08 * Math.sin(a - Math.PI / 4)], tip), seg([cx + 0.08 * Math.cos(a + Math.PI / 4), cy + 0.08 * Math.sin(a + Math.PI / 4)], tip));
        }
      }
      return { h: 1, prims: p };
    }
    case 'hearts':
      return { h: 1, prims: [poly(heartPoly(0.25, 0.27, 0.32)), poly(heartPoly(0.75, 0.77, 0.32))] };
    case 'zigzag':
      return { h: 0.5, prims: [...path([[0, 0.1], [0.25, 0.4], [0.5, 0.1], [0.75, 0.4], [1, 0.1]])] };
    case 'knit':
      // Rows of knitted Vs.
      return { h: 0.5, prims: [...path([[0.05, 0.4], [0.25, 0.1], [0.45, 0.4]]), ...path([[0.55, 0.4], [0.75, 0.1], [0.95, 0.4]])] };
    /* ------------------------------------------------ Art Deco */
    case 'fans': {
      const p: Prim[] = [];
      for (const [cx, cy] of [[0.5, 0], [0, 0.5], [1, 0.5], [0.5, 1]] as [number, number][]) {
        p.push(arc([cx, cy], 0.5, 0, Math.PI), arc([cx, cy], 0.32, 0, Math.PI));
        for (let k = 1; k < 6; k++) {
          const a = (k * Math.PI) / 6;
          p.push(seg([cx + 0.32 * Math.cos(a), cy + 0.32 * Math.sin(a)], [cx + 0.5 * Math.cos(a), cy + 0.5 * Math.sin(a)]));
        }
      }
      return { h: 1, prims: p };
    }
    case 'sunburst': {
      const p: Prim[] = [arc([0.5, 0.5], 0.12)];
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6;
        p.push(seg([0.5 + 0.18 * Math.cos(a), 0.5 + 0.18 * Math.sin(a)], [0.5 + (k % 2 ? 0.36 : 0.48) * Math.cos(a), 0.5 + (k % 2 ? 0.36 : 0.48) * Math.sin(a)]));
      }
      return { h: 1, prims: p };
    }
    case 'chevrons':
      return { h: 0.6, prims: [...path([[0, 0.05], [0.5, 0.3], [1, 0.05]]), ...path([[0, 0.25], [0.5, 0.5], [1, 0.25]])] };
    case 'steps':
      return { h: 1, prims: [...path([[0, 0], [0, 0.25], [0.25, 0.25], [0.25, 0.5], [0.5, 0.5], [0.5, 0.75], [0.75, 0.75], [0.75, 1]]), ...path([[0.5, 0], [0.5, 0.25], [0.75, 0.25], [0.75, 0.5], [1, 0.5]])] };
    /* ------------------------------------------------ Oriental */
    case 'key':
      // A running key (fret) border, row on row.
      return { h: 0.6, prims: path([[0, 0.1], [0.8, 0.1], [0.8, 0.5], [0.2, 0.5], [0.2, 0.25], [0.6, 0.25], [0.6, 0.38], [0.4, 0.38]]).concat([seg([0.8, 0.1], [1, 0.1])]) };
    case 'quatrefoil': {
      const p: Prim[] = [];
      for (const [dx, dy] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) p.push(arc([0.5 + dx!, 0.5 + dy!], 0.25));
      return { h: 1, prims: p };
    }
    case 'clouds': {
      const p: Prim[] = [];
      for (const [cx, cy] of [[0.25, 0.3], [0.75, 0.8]] as [number, number][]) p.push(arc([cx - 0.1, cy], 0.1, 0, Math.PI), arc([cx + 0.1, cy], 0.1, 0, Math.PI), arc([cx, cy + 0.08], 0.12, 0, Math.PI), arc([cx + 0.05, cy], 0.05, Math.PI, 2 * Math.PI), seg([cx - 0.2, cy], [cx + 0.2, cy]));
      return { h: 1, prims: p };
    }
    /* ------------------------------------------------ Gothic */
    case 'arches': {
      // Pointed arches on columns.
      const p: Prim[] = [seg([0, 0], [0, 0.55]), seg([1, 0], [1, 0.55])];
      p.push(arc([1, 0.55], 1, (5 * Math.PI) / 6, Math.PI), arc([0, 0.55], 1, 0, Math.PI / 6));
      p.push(arc([0.5, 0.2], 0.12));
      return { h: 1.1, prims: p };
    }
    case 'trefoil': {
      const p: Prim[] = [arc([0.5, 0.5], 0.42)];
      for (let k = 0; k < 3; k++) {
        const a = Math.PI / 2 + (k * 2 * Math.PI) / 3;
        p.push(arc([0.5 + 0.14 * Math.cos(a), 0.5 + 0.14 * Math.sin(a)], 0.14));
      }
      return { h: 1, prims: p };
    }
    case 'rose': {
      const p: Prim[] = [arc([0.5, 0.5], 0.45), arc([0.5, 0.5], 0.12)];
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        p.push(seg([0.5 + 0.12 * Math.cos(a), 0.5 + 0.12 * Math.sin(a)], [0.5 + 0.45 * Math.cos(a), 0.5 + 0.45 * Math.sin(a)]));
        p.push(arc([0.5 + 0.3 * Math.cos(a + Math.PI / 8), 0.5 + 0.3 * Math.sin(a + Math.PI / 8)], 0.07));
      }
      return { h: 1, prims: p };
    }
    /* ------------------------------------------------ Geometric */
    case 'cubes': {
      // Tumbling blocks: hexagons split into three rhombi.
      const prims: Prim[] = [];
      const R = 1 / S3;
      for (const [cx, cy] of [[0, 0], [1, 0], [0.5, S3 / 2], [0, S3], [1, S3]] as [number, number][]) {
        const v = (k: number): [number, number] => [cx + R * Math.cos(Math.PI / 6 + (k * Math.PI) / 3), cy + R * Math.sin(Math.PI / 6 + (k * Math.PI) / 3)];
        for (let k = 0; k < 6; k++) prims.push(seg(v(k), v(k + 1)));
        for (const k of [1, 3, 5]) prims.push(seg([cx, cy], v(k)));
      }
      return { h: S3, prims };
    }
    case 'argyle':
      return { h: 1.4, prims: [...path([[0.5, 0], [1, 0.7], [0.5, 1.4], [0, 0.7], [0.5, 0]]), seg([0, 0], [1, 1.4]), seg([1, 0], [0, 1.4])] };
    case 'triangles':
      return { h: S3, prims: triangles((a, b, c) => [seg(a, b), seg(b, c), seg(c, a)]) };
    case 'hexagons': {
      const prims: Prim[] = [];
      const R = 1 / S3;
      for (const [cx, cy] of [[0, 0], [1, 0], [0.5, S3 / 2], [0, S3], [1, S3]] as [number, number][]) {
        const hex: [number, number][] = [];
        for (let k = 0; k <= 6; k++) hex.push([cx + R * Math.cos(Math.PI / 6 + (k * Math.PI) / 3), cy + R * Math.sin(Math.PI / 6 + (k * Math.PI) / 3)]);
        prims.push(...path(hex));
      }
      return { h: S3, prims };
    }
    /* ------------------------------------------------ Halloween */
    case 'webs': {
      // A spider's web in each corner of the tile, meeting its neighbours'.
      const p: Prim[] = [];
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        p.push(seg([0.5, 0.5], [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]));
      }
      for (const r of [0.15, 0.3, 0.45]) {
        const ring: [number, number][] = [];
        for (let k = 0; k <= 8; k++) {
          const a = (k * Math.PI) / 4;
          ring.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]);
        }
        p.push(...path(ring));
      }
      return { h: 1, prims: p };
    }
    case 'bats':
      return { h: 1, prims: [poly(bat(0.25, 0.3, 0.36)), poly(bat(0.75, 0.8, 0.28))] };
    case 'pumpkins':
      return { h: 1, prims: [poly(pumpkin(0.25, 0.25, 0.32)), poly(pumpkin(0.75, 0.75, 0.32)), seg([0.25, 0.4], [0.28, 0.46]), seg([0.75, 0.9], [0.78, 0.96])] };
    /* ------------------------------------------------ Easter */
    case 'eggs':
      return { h: 1.2, prims: [poly(egg(0.25, 0.3, 0.17)), poly(egg(0.75, 0.9, 0.17))] };
    case 'daisies':
      return { h: 1, prims: [poly(flower(0.25, 0.25, 0.18, 8)), poly(flower(0.75, 0.75, 0.13, 8))] };
    case 'bunnies':
      return { h: 1, prims: [poly(bunny(0.3, 0.35, 0.36)), poly(bunny(0.8, 0.85, 0.3))] };
    /* ------------------------------------------------ Valentine */
    case 'heart-lattice': {
      const p: Prim[] = [seg([0, 0], [1, 1]), seg([1, 0], [0, 1])];
      p.push(poly(heartPoly(0.5, 0.52, 0.28)), poly(heartPoly(0, 0.02, 0.2)), poly(heartPoly(1, 0.02, 0.2)), poly(heartPoly(0, 1.02, 0.2)), poly(heartPoly(1, 1.02, 0.2)));
      return { h: 1, prims: p };
    }
    case 'xo':
      return { h: 1, prims: [seg([0.12, 0.12], [0.38, 0.38]), seg([0.38, 0.12], [0.12, 0.38]), arc([0.75, 0.25], 0.13), arc([0.25, 0.75], 0.13), seg([0.62, 0.62], [0.88, 0.88]), seg([0.88, 0.62], [0.62, 0.88])] };
    /* ------------------------------------------------ Hanukkah */
    case 'david-stars': {
      const p: Prim[] = [];
      for (const [cx, cy, r] of [[0.25, 0.25, 0.2], [0.75, 0.75, 0.16]] as [number, number, number][])
        for (const rot of [Math.PI / 2, -Math.PI / 2]) {
          const tri: [number, number][] = [];
          for (let k = 0; k <= 3; k++) tri.push([cx + r * Math.cos(rot + (k * 2 * Math.PI) / 3), cy + r * Math.sin(rot + (k * 2 * Math.PI) / 3)]);
          p.push(...path(tri));
        }
      return { h: 1, prims: p };
    }
    case 'dreidels':
      return { h: 1, prims: [poly([0.17, 0.32, 0.33, 0.32, 0.33, 0.18, 0.25, 0.06, 0.17, 0.18]), seg([0.25, 0.32], [0.25, 0.42]), poly([0.67, 0.82, 0.83, 0.82, 0.83, 0.68, 0.75, 0.56, 0.67, 0.68]), seg([0.75, 0.82], [0.75, 0.92])] };
    /* ------------------------------------------------ St Patrick's */
    case 'shamrocks':
      return { h: 1, prims: [...shamrock(0.25, 0.27, 0.11), ...shamrock(0.75, 0.77, 0.09)] };
    case 'clover-lattice': {
      const p: Prim[] = [];
      for (const [cx, cy] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]] as [number, number][]) for (const [dx, dy] of [[0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]]) p.push(arc([cx + dx!, cy + dy!], 0.12));
      return { h: 1, prims: p };
    }
    /* ------------------------------------------------ Autumn */
    case 'leaves':
      return { h: 1, prims: [poly(leaf(0.27, 0.25, 0.22, 0.5)), poly(leaf(0.75, 0.75, 0.2, -0.6)), seg([0.27, 0.06], [0.24, 0.0]), seg([0.75, 0.57], [0.8, 0.51])] };
    case 'acorns':
      return { h: 1, prims: [poly(egg(0.25, 0.22, 0.1)), poly([0.13, 0.3, 0.37, 0.3, 0.33, 0.38, 0.17, 0.38]), seg([0.25, 0.38], [0.25, 0.43]), poly(egg(0.75, 0.72, 0.1)), poly([0.63, 0.8, 0.87, 0.8, 0.83, 0.88, 0.67, 0.88]), seg([0.75, 0.88], [0.75, 0.93])] };
    /* ------------------------------------------------ New Year */
    case 'fireworks': {
      const p: Prim[] = [];
      for (const [cx, cy, r] of [[0.28, 0.3, 0.22], [0.78, 0.78, 0.16]] as [number, number, number][])
        for (let k = 0; k < 12; k++) {
          const a = (k * Math.PI) / 6;
          p.push(seg([cx + r * 0.3 * Math.cos(a), cy + r * 0.3 * Math.sin(a)], [cx + r * Math.cos(a), cy + r * Math.sin(a)]));
          p.push(disc([cx + r * 1.18 * Math.cos(a), cy + r * 1.18 * Math.sin(a)], 0.018));
        }
      return { h: 1, prims: p };
    }
    case 'confetti':
      return { h: 1, prims: [seg([0.1, 0.1], [0.2, 0.16]), disc([0.4, 0.2], 0.04), seg([0.7, 0.1], [0.66, 0.22]), poly(starPoly(0.85, 0.35, 5, 0.07, 0.03)), seg([0.2, 0.5], [0.3, 0.44]), disc([0.55, 0.55], 0.035), seg([0.8, 0.65], [0.9, 0.72]), poly(starPoly(0.3, 0.8, 5, 0.06, 0.025)), disc([0.62, 0.88], 0.04), seg([0.05, 0.75], [0.1, 0.86])] };
  }
  return null;
}

function bat(cx: number, cy: number, w: number): number[] {
  // Wings scalloped along the bottom, a small head with ears.
  const s = w / 2;
  const p = [-1, 0.1, -0.8, 0.35, -0.45, 0.4, -0.2, 0.25, -0.12, 0.42, -0.06, 0.3, 0.06, 0.3, 0.12, 0.42, 0.2, 0.25, 0.45, 0.4, 0.8, 0.35, 1, 0.1, 0.75, 0.18, 0.62, -0.02, 0.45, 0.12, 0.3, -0.05, 0.12, 0.05, 0, -0.18, -0.12, 0.05, -0.3, -0.05, -0.45, 0.12, -0.62, -0.02, -0.75, 0.18];
  return p.map((v, i) => (i % 2 ? cy + v * s : cx + v * s));
}

function pumpkin(cx: number, cy: number, w: number): number[] {
  const p: number[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * 2 * Math.PI;
    const lobes = 1 - 0.08 * Math.abs(Math.sin(2.5 * a));
    p.push(cx + (w / 2) * lobes * Math.cos(a), cy + (w / 2.6) * lobes * Math.sin(a));
  }
  return p;
}

function egg(cx: number, cy: number, r: number): number[] {
  const p: number[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    const k = Math.sin(a) > 0 ? 1.35 : 1.05;
    p.push(cx + r * 0.85 * Math.cos(a), cy + r * k * Math.sin(a));
  }
  return p;
}

function bunny(cx: number, cy: number, s: number): number[] {
  // A sitting rabbit in profile: body, head, two long ears.
  const pts = [-0.45, -0.4, 0.3, -0.4, 0.38, -0.2, 0.3, 0.02, 0.36, 0.14, 0.32, 0.5, 0.26, 0.52, 0.24, 0.2, 0.18, 0.24, 0.16, 0.55, 0.1, 0.56, 0.1, 0.16, -0.05, 0.06, -0.3, 0.05, -0.45, -0.1, -0.55, -0.12, -0.5, -0.3];
  return pts.map((v, i) => (i % 2 ? cy + v * s : cx + v * s));
}

function leaf(cx: number, cy: number, s: number, rot: number): number[] {
  // A maple-ish leaf: five points.
  const p: number[] = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * 2 * Math.PI;
    const r = s * (0.55 + 0.45 * Math.abs(Math.cos((5 / 2) * (a - Math.PI / 2))) ** 3) * (Math.sin(a) < -0.7 ? 0.6 : 1);
    p.push(cx + r * Math.cos(a + rot), cy + r * Math.sin(a + rot));
  }
  return p;
}

function shamrock(cx: number, cy: number, r: number): Prim[] {
  const out: Prim[] = [seg([cx, cy], [cx + r * 0.3, cy - r * 1.6])];
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / 3;
    // Each leaf a heart with its point to the middle.
    const lx = cx + r * Math.cos(a);
    const ly = cy + r * Math.sin(a);
    const turn = a + Math.PI * 1.5;
    const h = heartPoly(0, 0, r * 1.9);
    out.push(poly(h.map((v, i) => (i % 2 ? ly + h[i - 1]! * Math.sin(turn) + v * Math.cos(turn) : lx + v * Math.cos(turn) - h[i + 1]! * Math.sin(turn)))));
  }
  return out;
}

/* ------------------------------------------------------------------ sampling */

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function inPoly(px: number, py: number, p: number[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const yi = p[i + 1]!;
    const yj = p[j + 1]!;
    if (yi > py !== yj > py && px < ((p[j]! - p[i]!) * (py - yi)) / (yj - yi) + p[i]!) inside = !inside;
  }
  return inside;
}

function polyDist(px: number, py: number, p: number[]): number {
  let d = Infinity;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) d = Math.min(d, segDist(px, py, p[j]!, p[j + 1]!, p[i]!, p[i + 1]!));
  return d;
}

/**
 * How much the point (u, v) in tile units is pattern, 0 to 1. `scale` is mm per tile unit
 * there (so lines keep their width), `line` the line width in mm.
 */
export function mask(t: Tile, u: number, v: number, scale: number, line: number): number {
  const x0 = u - Math.floor(u);
  const y0 = v - Math.floor(v / t.h) * t.h;
  const half = line / 2 / scale;
  const aa = 0.12 / scale;
  const reach = half + aa;
  const boxes = boxesOf(t);
  let best = 0;
  for (const ox of [-1, 0, 1])
    for (const oy of [-t.h, 0, t.h]) {
      const x = x0 + ox;
      const y = y0 + oy;
      for (let n = 0; n < t.prims.length; n++) {
        const b = n * 4;
        if (x < boxes[b]! - reach || x > boxes[b + 2]! + reach || y < boxes[b + 1]! - reach || y > boxes[b + 3]! + reach) continue;
        const q = t.prims[n]!;
        let m = 0;
        if (q.k === 'seg') {
          const d = segDist(x, y, q.a[0], q.a[1], q.b[0], q.b[1]);
          if (d > reach) continue;
          m = Math.min(1, (reach - d) / (2 * aa));
        } else if (q.k === 'arc') {
          const dx = x - q.c[0];
          const dy = y - q.c[1];
          const rr = Math.hypot(dx, dy);
          if (Math.abs(rr - q.r) > reach) continue;
          let a = Math.atan2(dy, dx);
          if (a < q.a0) a += 2 * Math.PI;
          const full = q.a1 - q.a0 >= 2 * Math.PI - 1e-9;
          let d = Math.abs(rr - q.r);
          if (!full && (a < q.a0 || a > q.a1)) {
            const e0: [number, number] = [q.c[0] + q.r * Math.cos(q.a0), q.c[1] + q.r * Math.sin(q.a0)];
            const e1: [number, number] = [q.c[0] + q.r * Math.cos(q.a1), q.c[1] + q.r * Math.sin(q.a1)];
            d = Math.min(Math.hypot(x - e0[0], y - e0[1]), Math.hypot(x - e1[0], y - e1[1]));
          }
          if (d > reach) continue;
          if (q.hide?.some(([hx, hy, hr]) => Math.hypot(x - hx, y - hy) < hr - half)) continue;
          m = Math.min(1, (reach - d) / (2 * aa));
        } else if (q.k === 'disc') {
          const d = Math.hypot(x - q.c[0], y - q.c[1]) - q.r;
          m = Math.max(0, Math.min(1, 0.5 - d / (2 * aa)));
        } else {
          if (inPoly(x, y, q.p)) m = 1;
          else {
            const d = polyDist(x, y, q.p);
            m = Math.max(0, Math.min(1, 0.5 - d / (2 * aa)));
          }
        }
        if (m > best) {
          best = m;
          if (best >= 1) return 1;
        }
      }
    }
  return best;
}

const BOXES = new WeakMap<Tile, Float64Array>();

/** Each primitive's bounding box (x0, y0, x1, y1), so a sample skips the ones far from it. */
function boxesOf(t: Tile): Float64Array {
  let b = BOXES.get(t);
  if (b) return b;
  b = new Float64Array(t.prims.length * 4);
  t.prims.forEach((q, n) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const add = (x: number, y: number) => {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    };
    if (q.k === 'seg') {
      add(...q.a);
      add(...q.b);
    } else if (q.k === 'arc' || q.k === 'disc') {
      add(q.c[0] - q.r, q.c[1] - q.r);
      add(q.c[0] + q.r, q.c[1] + q.r);
    } else for (let i = 0; i < q.p.length; i += 2) add(q.p[i]!, q.p[i + 1]!);
    b!.set([x0, y0, x1, y1], n * 4);
  });
  BOXES.set(t, b);
  return b;
}

/**
 * Which ways the pattern's lines join up into one net, across tile edges: `u` round the
 * bauble, `v` up it. Lace keeps the lines where they form a net, adds ribs where they only
 * run one way, and cuts the motifs out where they are separate shapes.
 */
export function connectivity(t: Tile, line: number, scale: number, invert = false): { u: boolean; v: boolean } {
  const N = 40;
  const M = Math.max(8, Math.round(N * t.h));
  const W = 3 * N;
  const H = 3 * M;
  const on = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) on[j * W + i] = mask(t, (i + 0.5) / N, ((j + 0.5) / M) * t.h, scale, line) > 0.5 !== invert ? 1 : 0;
  // A pattern pixel in the middle tile.
  let start = -1;
  for (let j = M; j < 2 * M && start < 0; j++) for (let i = N; i < 2 * N; i++) if (on[j * W + i]) { start = j * W + i; break; }
  if (start < 0) return { u: false, v: false };
  const seen = new Uint8Array(W * H);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const k = stack.pop()!;
    const i = k % W;
    const j = (k - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= W || b >= H) continue;
      const q = b * W + a;
      if (on[q] && !seen[q]) {
        seen[q] = 1;
        stack.push(q);
      }
    }
  }
  return { u: !!seen[start + N] || !!seen[start - N], v: !!seen[start + M * W] || !!seen[start - M * W] };
}
