/**
 * Business cards to print: one of eighteen designs, the name and the contact lines, a logo or
 * the initials, a QR code, an NFC tag, on one face or both, raised or flush.
 */
import type { BuildResult, Diagnostic } from '@pf/core';
import { Card } from './layout';
import { solidify } from './solid';
import { templateById } from './templates';
import { NFC_TAGS, TAG_CLEARANCE } from './templates-qr';
import { tapMark } from './kit';
import { inkOf, pocketSpot, unionOf } from './tpl';
import type { Ctx } from './types';

export type { Params } from './types';
export { TEMPLATES } from './templates';

export async function build(ctx: Ctx): Promise<BuildResult> {
  const notes: Diagnostic[] = [];
  const p = ctx.params;
  const t = templateById(p.template);
  const card = new Card(ctx, notes, !!t.portrait);
  const plan = await t.build(card);
  const tag = NFC_TAGS[p.nfcTag] ?? NFC_TAGS['25'];
  const r = tag.dia / 2 + TAG_CLEARANCE;
  if (t.nfc || p.nfc) {
    const holes = unionOf(ctx, [plan.cutouts, plan.front.pattern?.mode === 'cut' ? plan.front.pattern.cs : null]);
    if (plan.pocket) plan.pocket = { ...plan.pocket, r };
    else {
      // Behind the most open part of the front, clear of every hole through the card.
      const at = pocketSpot(ctx, card, r, [card.w / 4, 0], holes, null);
      if (at) {
        plan.pocket = { x: at[0], y: at[1], r };
        if (p.nfcMark) {
          const mark = tapMark(ctx, 9).translate([at[0], at[1]]);
          const ink = inkOf(ctx, plan.front.ink);
          if (ink && ink.intersect(mark.offset(1.5, 'Round', 2, 12)).area() > 0.01) notes.push({ level: 'info', message: 'The tap mark would land on the lettering here, so it is left off; the tag is still inside, behind the open card.' });
          else plan.front.ink.push({ cs: mark, colour: 'accent', role: 'tap' });
        }
      } else notes.push({ level: 'warning', message: `This card has no room for a ${tag.label} clear of its holes.` });
    }
  }
  const built = solidify(ctx, plan, notes, plan.pocket ? tag : null);
  return { parts: built.parts, summary: built.summary, diagnostics: notes };
}
