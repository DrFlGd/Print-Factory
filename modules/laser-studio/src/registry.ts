/** Every design by id. */
import { CORE_DESIGNS } from './designs';
import { CARD_DESIGNS } from './cards';
import { EXTRA_DESIGNS } from './extras';
import { KEYCHAIN_DESIGNS } from './keychains';
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
};
