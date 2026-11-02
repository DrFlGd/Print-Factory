/** The Cherry MX switch as every clicker needs it, and the heights built round it. */
import type { Manifold } from '@pf/engine-manifold';
import { rect } from '@pf/shapes';
import type { Ctx, Params } from './types';

/** Cherry MX, mm, from the plate's top face. */
export const MX = {
  cutout: 14,
  plate: 1.5,
  housing: 15.6,
  housingTop: 6.6,
  stemTop: 11.6,
  travel: 4,
  pinsBelow: 8.3,
  /** Under the plate the clips need room to spring out. */
  pocket: 15.2,
  stemDia: 5.5,
  crossLength: 4.05,
  crossWidth: 1.29,
  /** How far the cross goes into the cap's post. */
  insert: 4,
} as const;

export const FLOOR = 1.6;
export const CAP_WALL = 1.6;
/** Room round the housing inside the cap. */
export const HOUSING_CLEAR = 0.5;
/** Cap roof thickness (picture face included). */
export const ROOF = 2.2;
export const NAMED = ['circle', 'rounded-square', 'square', 'hexagon', 'octagon', 'heart', 'star', 'squircle', 'shield', 'pill', 'oval', 'teardrop'];

/** Heights in the body frame (floor on the bed). */
export function heights(p: Pick<Params, 'capProud'>) {
  const plateTop = FLOOR + (MX.pinsBelow + 0.4 - MX.plate) + MX.plate;
  const capBottom = plateTop + MX.stemTop - MX.insert;
  // The cavity must take the housing top at full travel, with room to spare.
  const cavity = MX.housingTop - (MX.stemTop - MX.insert - MX.travel) + 0.8;
  const capH = cavity + ROOF;
  const proud = Math.max(0.5, Math.min(p.capProud, MX.travel));
  const bodyTop = capBottom + capH - proud;
  return { plateTop, capBottom, cavity, capH, proud, bodyTop };
}

/** The square inside a cap that the switch needs: housing, clearance and a wall. */
export const NEEDS = MX.housing + 2 * HOUSING_CLEAR + 2 * CAP_WALL;


/** The post that grips the switch's stem, `height` tall, the cross socket in its bottom. */
export function stemPost(ctx: Ctx, fit: number, height: number): Manifold {
  const body = ctx.Manifold.cylinder(height, MX.stemDia / 2, MX.stemDia / 2, 48);
  const L = MX.crossLength + fit;
  const W = MX.crossWidth + fit;
  return body.subtract(ctx.extrude(ctx.cs([rect(L, W), rect(W, L)], 'NonZero'), MX.insert + 1, -1));
}
