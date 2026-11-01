/** Every design by id. */
import { CORE_DESIGNS } from './designs';
import { CARD_DESIGNS } from './cards';
import { EXTRA_DESIGNS } from './extras';
import { FRAME_DESIGNS } from './frames';
import { KEYCHAIN_DESIGNS } from './keychains';
import { ORNAMENT_DESIGNS } from './ornaments';
import { SIGN_DESIGNS } from './signs';
import type { DesignOut, P } from './kit';
import type { Ctx } from './lib';

export type DesignFn = (ctx: Ctx, p: P) => Promise<DesignOut>;

export const DESIGNS: Record<string, DesignFn> = {
  ...CORE_DESIGNS,
  ...KEYCHAIN_DESIGNS,
  ...CARD_DESIGNS,
  ...SIGN_DESIGNS,
  ...EXTRA_DESIGNS,
  ...ORNAMENT_DESIGNS,
  ...FRAME_DESIGNS,
};
