/**
 * The body shapes. Each is drawn in a box about one unit across as filled contours to
 * union (`add`) and holes to cut (`cut`); the builder scales it so its longest side is the
 * chosen size, then rounds off sharp points.
 */
import type { Contour } from '@pf/core';
import { circle, ellipse, heart, pill, rect, regularPolygon, rotate, roundedRect, star, translate } from '@pf/shapes';

export interface ShapeDraw {
  add: Contour[];
  cut?: Contour[];
  /** Pieces that only touch: close the gaps between them. */
  join?: boolean;
}

export interface ShapeOptions {
  /** Corner radius as a fraction of the size. */
  corner: number;
  holeRatio: number;
  starPoints: number;
}

const at = (c: Contour, x: number, y: number): Contour => translate([c], x, y)[0]!;
const turned = (c: Contour, deg: number, x = 0, y = 0): Contour => translate(rotate([c], deg), x, y)[0]!;

export const SHAPES: Record<string, { name: string; group: 'Basic' | 'Fun' | 'Characters'; draw: (o: ShapeOptions) => ShapeDraw }> = {
  circle: { name: 'Circle', group: 'Basic', draw: () => ({ add: [circle(0.5, 180)] }) },
  roundedSquare: { name: 'Rounded square', group: 'Basic', draw: (o) => ({ add: [roundedRect(1, 1, Math.min(0.5, o.corner))] }) },
  square: { name: 'Square', group: 'Basic', draw: () => ({ add: [rect(1, 1)] }) },
  rectangle: { name: 'Rectangle', group: 'Basic', draw: (o) => ({ add: [roundedRect(1, 0.62, Math.min(0.31, o.corner))] }) },
  hexagon: { name: 'Hexagon', group: 'Basic', draw: () => ({ add: [regularPolygon(6, 0.5, 90)] }) },
  octagon: { name: 'Octagon', group: 'Basic', draw: () => ({ add: [regularPolygon(8, 0.5, 22.5)] }) },
  triangle: { name: 'Triangle', group: 'Basic', draw: () => ({ add: [regularPolygon(3, 0.5, 90)] }) },
  donut: { name: 'Donut', group: 'Basic', draw: (o) => ({ add: [circle(0.5, 180)], cut: [circle(Math.min(0.3, Math.max(0.05, o.holeRatio / 2)), 120)] }) },
  heart: { name: 'Heart', group: 'Fun', draw: () => ({ add: [heart(1)] }) },
  star: { name: 'Star', group: 'Fun', draw: (o) => ({ add: [star(Math.round(o.starPoints), 0.5, 0.29)] }) },
  flower: {
    name: 'Flower',
    group: 'Fun',
    draw: () => ({ add: [circle(0.3, 120), ...Array.from({ length: 6 }, (_, i) => at(circle(0.19, 90), 0.3 * Math.cos((i * Math.PI) / 3), 0.3 * Math.sin((i * Math.PI) / 3)))] }),
  },
  egg: {
    name: 'Egg',
    group: 'Fun',
    draw: () => {
      const out: number[] = [];
      for (let i = 0; i < 160; i++) {
        const t = (i / 160) * Math.PI * 2;
        out.push(0.4 * Math.cos(t) * (1 - 0.12 * Math.sin(t)), 0.5 * Math.sin(t));
      }
      return { add: [out] };
    },
  },
  cloud: {
    name: 'Cloud',
    group: 'Fun',
    draw: () => ({
      add: [at(circle(0.2, 90), -0.3, -0.06), at(circle(0.27, 120), -0.05, 0.08), at(circle(0.22, 90), 0.24, 0.03), at(circle(0.17, 90), 0.37, -0.1), at(roundedRect(0.78, 0.26, 0.13), 0.02, -0.15)],
    }),
  },
  moon: { name: 'Crescent moon', group: 'Fun', draw: () => ({ add: [circle(0.5, 180)], cut: [at(circle(0.4, 160), 0.27, 0.12)] }) },
  lightning: { name: 'Lightning', group: 'Fun', draw: () => ({ add: [[0.08, 0.5, -0.32, -0.04, -0.04, -0.04, -0.14, -0.5, 0.32, 0.08, 0.04, 0.08, 0.22, 0.5]] }) },
  speech: {
    name: 'Speech bubble',
    group: 'Fun',
    draw: (o) => ({ add: [at(roundedRect(1, 0.68, Math.min(0.3, Math.max(0.08, o.corner))), 0, 0.1), [-0.32, -0.22, -0.08, -0.22, -0.38, -0.46]] }),
  },
  human: {
    name: 'Person',
    group: 'Characters',
    draw: () => ({
      add: [
        at(circle(0.15, 90), 0, 0.35),
        at(roundedRect(0.36, 0.42, 0.1), 0, 0.02),
        turned(pill(0.5, 0.15), 25, -0.22, 0.08),
        turned(pill(0.5, 0.15), -25, 0.22, 0.08),
        turned(pill(0.17, 0.42), -12, -0.11, -0.26),
        turned(pill(0.17, 0.42), 12, 0.11, -0.26),
      ],
      join: true,
    }),
  },
  cat: {
    name: 'Cat',
    group: 'Characters',
    draw: () => ({ add: [at(ellipse(0.44, 0.36, 160), 0, -0.08), [-0.42, 0.04, -0.36, 0.42, -0.08, 0.2], [0.42, 0.04, 0.08, 0.2, 0.36, 0.42]] }),
  },
  paw: {
    name: 'Paw',
    group: 'Characters',
    draw: () => ({
      add: [at(ellipse(0.3, 0.24, 120), 0, -0.18), at(ellipse(0.12, 0.15, 60), -0.33, 0.05), at(ellipse(0.12, 0.15, 60), -0.13, 0.2), at(ellipse(0.12, 0.15, 60), 0.13, 0.2), at(ellipse(0.12, 0.15, 60), 0.33, 0.05)],
      join: true,
    }),
  },
  fish: { name: 'Fish', group: 'Characters', draw: () => ({ add: [at(ellipse(0.36, 0.24, 140), -0.12, 0), [0.14, 0, 0.5, 0.24, 0.42, 0, 0.5, -0.24]] }) },
  butterfly: {
    name: 'Butterfly',
    group: 'Characters',
    draw: () => ({
      add: [turned(ellipse(0.24, 0.17, 90), 30, -0.24, 0.17), turned(ellipse(0.24, 0.17, 90), -30, 0.24, 0.17), turned(ellipse(0.17, 0.13, 70), -25, -0.19, -0.2), turned(ellipse(0.17, 0.13, 70), 25, 0.19, -0.2), pill(0.1, 0.64)],
      join: true,
    }),
  },
};

export const SHAPE_IDS = Object.keys(SHAPES);
