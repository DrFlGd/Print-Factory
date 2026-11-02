/**
 * Photo frames to print: a frame with words, a crest, a pattern and a stand; a song plaque; a
 * social post; or a holder a bare print stands in.
 */
import type { BuildResult, Diagnostic } from '@pf/core';
import { buildFrame } from './frame';
import { buildHolder } from './holder';
import type { Ctx } from './types';

export type { Params } from './types';

export async function build(ctx: Ctx): Promise<BuildResult> {
  const notes: Diagnostic[] = [];
  const r = ctx.params.product === 'holder' ? await buildHolder(ctx, notes) : await buildFrame(ctx, notes);
  return { parts: r.parts, summary: r.summary, diagnostics: notes };
}
