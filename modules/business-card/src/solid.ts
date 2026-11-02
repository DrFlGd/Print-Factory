/**
 * The card as solids, one part per filament.
 *
 *   RAISED  printed face up: the colour fields lie in the front's top layers, the lettering,
 *           the icons, the code and a pattern in colour stand on top.
 *   FLUSH   printed face down: everything on the front is laid into its first layers, so the
 *           face is as smooth as the plate.
 *   BACK    a two-sided card's back is laid into the other face's layers, in either finish.
 *   CARVED  sunk into the front through its skin; with a reveal the card under the skin is the
 *           accent, so the carving shows it.
 *   POCKET  an NFC tag's cavity between the faces, with whole layers above and below it.
 *
 * Every height is a whole number of 0.2 mm layers, so each colour change and the pause for the
 * tag land on a layer line.
 */
import type { Diagnostic, Part } from '@pf/core';
import type { CrossSection, Manifold } from '@pf/engine-manifold';
import { roundedRect } from '@pf/shapes';
import { disc } from './kit';
import type { Colour, Ctx, Face, Plan } from './types';

export const LAYER = 0.2;
/** How deep colour is laid into a face, and how deep carving goes: three layers. */
export const INLAY = 0.6;
/** Plastic over and under an NFC tag. */
const COVER = 0.6;
const layers = (mm: number) => Math.ceil(mm / LAYER - 1e-6) * LAYER;
const r2 = (x: number) => Math.round(x * 100) / 100;

const NAMES: Record<Colour, string> = { card: 'Card', ink: 'Lettering', accent: 'Accent' };
const ORDER: Colour[] = ['card', 'ink', 'accent'];

type Regions = Map<Colour, CrossSection>;

function add(m: Regions, c: Colour, cs: CrossSection) {
  if (cs.isEmpty()) return;
  const had = m.get(c);
  m.set(c, had ? had.add(cs) : cs);
}

/**
 * A face's layers: what is laid into it (`flat`) and what stands on it (`raised`), each region
 * kept off what was set before it, so the lettering wins over a pattern and a pattern over a field.
 */
function faceRegions(ctx: Ctx, f: Face, O: CrossSection, base: Colour, raised: boolean): { flat: Regions; up: Regions; carved: CrossSection | null } {
  const flat: Regions = new Map();
  const up: Regions = new Map();
  let covered = ctx.CrossSection.union([]);
  let coveredUp = ctx.CrossSection.union([]);
  const carvedParts = [f.carved, f.pattern?.mode === 'carved' ? f.pattern.cs : null].filter((x): x is CrossSection => !!x && !x.isEmpty());
  const carved = carvedParts.length ? ctx.CrossSection.union(carvedParts).intersect(O) : null;
  const put = (cs: CrossSection, c: Colour, high: boolean) => {
    if (high) {
      const r = cs.intersect(O).subtract(coveredUp);
      add(up, c, r);
      coveredUp = coveredUp.add(r);
    } else {
      const r = cs.intersect(O).subtract(covered);
      add(flat, c, r);
      covered = covered.add(r);
    }
  };
  for (const pc of f.ink) put(pc.cs, pc.colour, raised);
  if (f.pattern?.mode === 'colour') put(f.pattern.cs, 'accent', raised);
  if (f.fields) put(f.fields, 'accent', false);
  add(flat, base, O.subtract(covered));
  if (carved) {
    for (const [c, cs] of flat) flat.set(c, cs.subtract(carved));
    for (const [c, cs] of up) up.set(c, cs.subtract(carved));
  }
  return { flat, up, carved };
}

export interface Built {
  parts: Part[];
  summary: string;
}

export function solidify(ctx: Ctx, plan: Plan, notes: Diagnostic[], tag: { depth: number; label: string } | null): Built {
  const p = ctx.params;
  const { w, h } = plan;
  const outline = ctx.cs([roundedRect(w, h, Math.max(0.01, Math.min(p.corner, h / 2 - 1)))]);
  const holes = [plan.cutouts, plan.front.pattern?.mode === 'cut' ? plan.front.pattern.cs : null].filter((x): x is CrossSection => !!x && !x.isEmpty());
  const O = holes.length ? outline.subtract(ctx.CrossSection.union(holes)) : outline;
  const back = plan.back;
  const raise = p.raised ? layers(Math.max(LAYER, p.raise)) : 0;
  const Db = back ? INLAY : 0;
  const Df = INLAY;
  const T0 = layers(Math.max(0.8, p.thickness));
  let T = Math.max(T0, Db + Df + LAYER);
  const pocket = plan.pocket && tag ? plan.pocket : null;
  const td = pocket && tag ? layers(tag.depth + 0.1) : 0;
  if (pocket) T = Math.max(T, td + 2 * COVER);
  T = r2(T);
  if (T > T0 + 1e-6) notes.push({ level: 'info', message: `The card is ${T.toFixed(1)} mm thick (${T0.toFixed(1)} asked) to hold ${pocket ? `the ${tag!.label} with plastic over and under it` : 'both faces’ colours'}.` });

  const coreColour: Colour = plan.reveal ? 'accent' : 'card';
  const solids = new Map<Colour, Manifold[]>();
  const push = (c: Colour, m: Manifold) => {
    const list = solids.get(c) ?? [];
    list.push(m);
    solids.set(c, list);
  };
  const slab = (regions: Regions, z0: number, z1: number) => {
    if (z1 - z0 < 1e-6) return;
    for (const [c, cs] of regions) if (!cs.isEmpty()) push(c, ctx.extrude(cs, r2(z1 - z0), r2(z0)));
  };

  // Front, face up: its skin in the top layers, raised work on top.
  const fr = faceRegions(ctx, plan.front, O, 'card', p.raised);
  slab(fr.flat, T - Df, T);
  slab(fr.up, T, T + raise);
  if (back) {
    const bk = faceRegions(ctx, back, O, coreColour, false);
    slab(bk.flat, 0, Db);
  }
  // The core, with the tag's pocket in it.
  const core = (cs: CrossSection): Regions => new Map([[coreColour, cs]]);
  let z0 = 0;
  let z1 = 0;
  if (pocket) {
    const pk = disc(ctx, pocket.x, pocket.y, pocket.r);
    z0 = r2(Math.min(Math.max(COVER, Math.round((T - td) / 2 / LAYER) * LAYER), T - COVER - td));
    z1 = r2(z0 + td);
    // Pocket layers inside a face's inlay take that face's regions less the pocket.
    slab(core(O), Db, Math.min(z0, T - Df));
    slab(core(O.subtract(pk)), Math.max(z0, Db), Math.min(z1, T - Df));
    slab(core(O), Math.max(z1, Db), T - Df);
  } else slab(core(O), Db, T - Df);

  // Print pose: a raised card as built, a flush one turned face down.
  const top = T + raise;
  const flushDown = !p.raised;
  const pose = (m: Manifold) => (flushDown ? m.rotate([180, 0, 0]).translate([0, 0, T]) : m);
  const other = (m: Manifold) => (flushDown ? m : m.rotate([180, 0, 0]).translate([0, 0, top]));
  const parts: Part[] = [];
  const preview: Part[] = [];
  let volume = 0;
  const showOther = flushDown || !!back;
  for (const c of ORDER) {
    const list = solids.get(c);
    if (!list?.length) continue;
    const m = ctx.union(list);
    volume += m.volume();
    const colour = c === 'card' ? p.cardColor : c === 'ink' ? p.inkColor : p.accentColor;
    const part = ctx.part(pose(m), NAMES[c], colour, { group: 'card' });
    if (part) parts.push(part);
    if (showOther) {
      const pv = ctx.part(other(m).translate([0, h + 10, 0]), `${NAMES[c]} (${flushDown ? 'front' : 'back'} up)`, colour, { group: 'preview', role: 'preview' });
      if (pv) preview.push(pv);
    }
  }
  const nColours = parts.length;

  if (flushDown) notes.push({ level: 'info', message: 'Prints face down: the front takes the plate’s finish (a textured sheet gives it a fine grain). No supports.' });
  else notes.push({ level: 'info', message: `Prints face up, the lettering ${raise.toFixed(1)} mm proud.${back ? ' The back is laid into the first layers, on the plate.' : ''}` });
  if (nColours > 1) {
    // Without an AMS a colour that shares a layer with another cannot be swapped by height.
    const layersOf = (z0: number, z1: number) => [r2(z0), r2(z1)] as const;
    const shared = (fr.flat.size > 1) || (back !== null);
    if (!shared && p.raised) notes.push({ level: 'info', message: `Without an AMS: add a filament change at ${T.toFixed(2)} mm, where the lettering starts.` });
    else notes.push({ level: 'info', message: `${nColours} filaments share the face’s layers (${layersOf(0, Df).join('–')} mm from the plate${back ? ' on both faces' : ''}): print with an AMS or another multi-material printer.` });
  }
  if (pocket && tag) {
    const pause = flushDown ? r2(T - z0) : z1;
    const layer = Math.round(pause / LAYER);
    notes.push({ level: 'info', message: `NFC: add a pause at ${pause.toFixed(2)} mm (layer ${layer + 1} starts there), press the ${tag.label} into its pocket, and resume. Write the tag with any NFC app.` });
  }
  const grams = (volume * 1.24) / 1000;
  const summary = `${w.toFixed(1).replace(/\.0$/, '')} × ${h.toFixed(1).replace(/\.0$/, '')} × ${(T + raise).toFixed(1)} mm · ${back ? 'two-sided' : 'one-sided'} · ${nColours} colour${nColours === 1 ? '' : 's'} · ≈ ${grams.toFixed(1)} g`;
  return { parts: [...parts, ...preview], summary };
}
