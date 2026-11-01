/** Every design by id. */
import { CORE_DESIGNS } from './designs';
import { KEYCHAIN_DESIGNS } from './keychains';
import type { DesignOut, P } from './kit';
import type { Ctx } from './lib';

export type DesignFn = (ctx: Ctx, p: P) => Promise<DesignOut>;

export const DESIGNS: Record<string, DesignFn> = {
  ...CORE_DESIGNS,
  ...KEYCHAIN_DESIGNS,
};
