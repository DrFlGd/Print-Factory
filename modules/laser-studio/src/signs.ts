/**
 * QR codes and signs that stand: a Wi-Fi card, a table sign and a QR table tent (both tents),
 * a QR stand on two feet, a QR slot stand with the code on its own raised plate, and the QR
 * display stand in four styles. The face of each is one composition: an optional logo, a
 * title, the code and a caption, stacked and shrunk together to fit the clear box the
 * construction leaves.
 */
import type { Diagnostic } from '@pf/core';
import type { CrossSection } from '@pf/engine-manifold';
import { circle, rect, roundedRect } from '@pf/shapes';
import type { DesignOut, P, PieceOut } from './kit';
import { centred, lines, marksFor, one, union } from './kit';
import type { Ctx, Lettering } from './lib';
import { fit, lettering, noMarks, outlineOf, qrRegion, region, symbolRegion } from './lib';
import type { Box } from './stands';
import { boxH, boxW, footPoses, footStand, slotPoses, slotStand, tent, tentPoses } from './stands';

const markOp = (p: P) => (p.op === 'cut' ? 'engrave' : p.op);

/** A QR code with its quiet zone (four modules each side) `side` mm across; the code itself is smaller. */
export function codeBlock(ctx: Ctx, data: string, side: number, ecc: P['ecc'], notes: Diagnostic[]): CrossSection | null {
  if (!data.trim()) return null;
  const probe = qrRegion(ctx, data, 10, ecc);
  if (!probe) return null;
  const n = probe.modules;
  const code = (side * n) / (n + 8);
  const q = qrRegion(ctx, data, code, ecc)!;
  const cell = code / n;
  if (cell < 0.8) notes.push({ level: 'warning', message: `Each square of the code is ${cell.toFixed(2)} mm: too small to scan reliably. Make the code bigger or the link shorter.` });
  return q.cs;
}

interface Face {
  logo?: boolean;
  title?: string;
  caption?: string;
  code?: string;
  /** A second code beside the first, with its own label (the double display stand). */
  code2?: { data: string; label: string };
}

/**
 * A face's lettering and code in `box`: logo, title, code and caption top to bottom on the
 * box's middle, all shrunk by one factor when they do not fit.
 */
export async function composeFace(ctx: Ctx, p: P, box: Box, f: Face, notes: Diagnostic[]): Promise<CrossSection | null> {
  const W = boxW(box);
  const H = boxH(box);
  if (W <= 4 || H <= 4) return null;
  const gap = Math.max(2, H * 0.04);
  type Row = { l: Lettering; kind: 'text' | 'code' | 'logo' };
  const rows: Row[] = [];
  if (f.logo) {
    const s = await symbolRegion(ctx, p.symbol, Math.min(W * 0.35, H * 0.18));
    if (s) rows.push({ l: region(ctx, s), kind: 'logo' });
  }
  const title = f.title ? await lettering(ctx, p.font, f.title, p.size, { spacing: p.spacing }) : null;
  if (title) rows.push({ l: fit(ctx, title, W, H * 0.4), kind: 'text' });
  const texts = rows.reduce((h, r) => h + r.l.b.height + gap, 0);
  const caption = f.caption ? await lettering(ctx, p.font2, f.caption, p.size2) : null;
  const capFit = caption ? fit(ctx, caption, W, H * 0.3) : null;
  const room = H - texts - (capFit ? capFit.b.height + gap : 0);
  if (f.code2) {
    // Two codes side by side, each over its label.
    const side = Math.min(p.qrSize, (W - gap) / 2, room - p.size2 * 1.6);
    const cols: CrossSection[] = [];
    for (const [k, [data, label]] of [
      [f.code ?? '', ''],
      [f.code2.data, f.code2.label],
    ].entries()) {
      const c = codeBlock(ctx, data!, Math.max(10, side), p.ecc, notes);
      const x = (k ? 1 : -1) * (side / 2 + gap / 2);
      if (c) cols.push(c.translate([x, 0]));
      const text = k ? label : (f.caption ?? '');
      const l = text ? await lettering(ctx, p.font2, text, p.size2) : null;
      if (l) cols.push(centred(fit(ctx, l, side, p.size2 * 1.5), x, -side / 2 - gap - Math.min(l.b.height, p.size2 * 1.5) / 2));
    }
    const both = union(ctx, cols);
    if (both) rows.push({ l: region(ctx, both), kind: 'code' });
  } else if (f.code) {
    const side = Math.min(p.qrSize, W, room);
    if (side < 12) notes.push({ level: 'warning', message: 'There is little room for the code. Make the face bigger or the lettering smaller.' });
    const c = codeBlock(ctx, f.code, Math.max(10, side), p.ecc, notes);
    if (c) {
      // Keep the quiet zone: the row is the whole block, not just the dark squares.
      rows.push({ l: { cs: c, b: { minX: -side / 2, maxX: side / 2, minY: -side / 2, maxY: side / 2, width: side, height: side, cx: 0, cy: 0 } }, kind: 'code' });
    }
  }
  if (capFit && !f.code2) rows.push({ l: capFit, kind: 'text' });
  if (!rows.length) return null;
  const total = rows.reduce((h, r) => h + r.l.b.height, 0) + gap * (rows.length - 1);
  const wide = Math.max(...rows.map((r) => r.l.b.width));
  const k = Math.min(1, H / total, W / wide);
  if (k < 0.97) notes.push({ level: 'info', message: 'The lettering and the code were made smaller to fit the face.' });
  // Stacked from the top, on the box's middle, a little above centre.
  const cx = (box.x0 + box.x1) / 2;
  let y = (box.y0 + box.y1) / 2 + (total * k) / 2 + Math.min(H - total * k, H * 0.08) * 0.25;
  const out: CrossSection[] = [];
  for (const r of rows) {
    const h = r.l.b.height * k;
    out.push(r.l.cs.translate([-r.l.b.cx, -r.l.b.cy]).scale([k, k]).translate([cx, y - h / 2]));
    y -= h + gap * k;
  }
  return union(ctx, out);
}

/* ---------------------------------------------------------------- QR card */

/** The Wi-Fi mark: three arcs over a dot, `s` mm across. */
export function wifiMark(ctx: Ctx, s: number): CrossSection {
  const w = s * 0.09;
  const out: CrossSection[] = [ctx.cs([circle(w * 0.95, 32)]).translate([0, -s * 0.32])];
  for (const r of [0.22, 0.4, 0.58]) {
    const R = r * s + w / 2;
    const ring = ctx.cs([circle(R, 96)]).subtract(ctx.cs([circle(R - w, 96)]));
    // A 90° fan opening upwards from the dot.
    const fan = ctx.cs([[0, 0, -R * 2, R * 2, R * 2, R * 2]]);
    out.push(ring.intersect(fan).translate([0, -s * 0.32]));
  }
  return ctx.CrossSection.union(out);
}

async function qrCard(ctx: Ctx, p: P): Promise<DesignOut> {
  const notes: Diagnostic[] = [];
  const W = 85.6;
  const H = 54;
  const edge = 3;
  const card = ctx.cs([roundedRect(W, H, 3.2)]);
  const side = H - 2 * edge;
  const ink: (CrossSection | null)[] = [];
  const code = codeBlock(ctx, p.qrData, side, p.ecc, notes);
  if (!code) notes.push({ level: 'warning', message: 'Type what the code opens: a link, or Wi-Fi details.' });
  else ink.push(code.translate([-W / 2 + edge + side / 2, 0]));
  const x0 = -W / 2 + edge + side + 1.5;
  const qn = code ? region(ctx, code).b.height : side * 0.8;
  ink.push(ctx.cs([rect(0.5, qn)]).translate([x0, 0]));
  const right = W / 2 - edge - 1;
  const cw = right - (x0 + 2);
  const cx = (x0 + 2 + right) / 2;
  const details = lines(p.text2);
  const detail = details.length ? await lettering(ctx, p.font2, details.join('\n'), p.size2, { align: 'center' }) : null;
  const dFit = detail ? fit(ctx, detail, cw, H * 0.3) : null;
  const iconH = H - 2 * edge - (dFit ? dFit.b.height + 3 : 0);
  let icon: CrossSection | null = null;
  if (p.icon === 'wifi') icon = wifiMark(ctx, Math.min(cw * 0.8, iconH * 1.2));
  else if (p.icon === 'symbol') icon = await symbolRegion(ctx, p.symbol, Math.min(cw * 0.75, iconH * 0.85));
  const top = H / 2 - edge;
  if (icon) {
    const f = fit(ctx, region(ctx, icon), cw * 0.85, iconH * 0.85);
    ink.push(centred(f, cx, dFit ? top - iconH / 2 : 0));
  }
  if (dFit) ink.push(centred(dFit, cx, -H / 2 + edge + dFit.b.height / 2 + 1));
  if (dFit && dFit.b.height < p.size2 * 0.75) notes.push({ level: 'info', message: 'The details were made smaller to fit beside the code.' });
  return { pieces: [one('Card', card, marksFor(ctx, union(ctx, ink), markOp(p)))], notes };
}

/* ---------------------------------------------------------------- tents */

async function tentDesign(ctx: Ctx, p: P, face: (box: Box, notes: Diagnostic[]) => Promise<CrossSection | null>): Promise<DesignOut> {
  const t = Math.max(1, p.thickness);
  const W = p.standWidth;
  const H = p.standHeight;
  const g = tent(ctx, W, H, t, 90 - p.lean, Math.max(4, p.margin));
  const notes = [...g.notes];
  const ink = await face(g.content, notes);
  const poses = tentPoses(g, H, t);
  const marks = marksFor(ctx, ink, markOp(p));
  const pieces: PieceOut[] = [
    { ...one('Front panel', g.panel, marks), ...poses.front },
    { ...one('Back panel', g.panel, marksFor(ctx, ink, markOp(p))), ...poses.back },
    { ...one('Brace', g.brace), ...poses.brace(-1) },
    { ...one('Brace', g.brace), ...poses.brace(1) },
  ];
  notes.push({ level: 'info', message: 'Lean the two panels together and drop a brace through the slots at each end.' });
  return { pieces, notes };
}

async function tableSign(ctx: Ctx, p: P): Promise<DesignOut> {
  return tentDesign(ctx, p, async (box, notes) => {
    // A small label over a big word, in a steep ladder.
    const W = boxW(box);
    const H = boxH(box);
    const head = await lettering(ctx, p.font, p.text, p.size, { spacing: p.spacing });
    const label = await lettering(ctx, p.font2, p.text2, p.size2);
    if (!head && !label) {
      notes.push({ level: 'warning', message: 'Type a word for the sign.' });
      return null;
    }
    const gap = Math.max(2, H * 0.05);
    const hl = head ? fit(ctx, head, W, H * (label ? 0.62 : 0.85)) : null;
    const ll = label ? fit(ctx, label, W, H * 0.25) : null;
    const total = (hl?.b.height ?? 0) + (ll?.b.height ?? 0) + (hl && ll ? gap : 0);
    const cx = (box.x0 + box.x1) / 2;
    let y = box.y0 + H * 0.54 + total / 2;
    const out: CrossSection[] = [];
    if (ll) {
      out.push(centred(ll, cx, y - ll.b.height / 2));
      y -= ll.b.height + gap;
    }
    if (hl) out.push(centred(hl, cx, y - hl.b.height / 2));
    if (head && hl && hl.b.height < head.b.height * 0.97) notes.push({ level: 'info', message: 'The word was made smaller to fit the panel.' });
    return union(ctx, out);
  });
}

async function qrTableTent(ctx: Ctx, p: P): Promise<DesignOut> {
  return tentDesign(ctx, p, (box, notes) => composeFace(ctx, p, box, { title: p.text, code: p.qrData, caption: p.text2, logo: p.logo }, notes));
}

/* ---------------------------------------------------------------- stands */

async function qrStand(ctx: Ctx, p: P, face: Face = { title: p.text, code: p.qrData, caption: p.text2, logo: p.logo }): Promise<DesignOut> {
  const t = Math.max(1, p.thickness);
  const g = footStand(ctx, p.standWidth, p.standHeight, t, p.lean, Math.max(4, p.margin));
  const notes = [...g.notes];
  const ink = await composeFace(ctx, p, g.content, face, notes);
  const poses = footPoses(g, p.lean, t);
  notes.push({ level: 'info', message: 'Slide a foot onto each slot in the plate, crowns up.' });
  return {
    pieces: [{ ...one('Plate', g.plate, marksFor(ctx, ink, markOp(p))), ...poses.plate }, { ...one('Foot', g.foot), ...poses.foot(-1) }, { ...one('Foot', g.foot), ...poses.foot(1) }],
    notes,
  };
}

/**
 * The slot stand with its code engraved on the face, or cut as its own square plate (from the
 * second sheet) glued on, with its outline scored on the face to place it.
 */
async function slotDesign(ctx: Ctx, p: P, face: Face, opts: { raised: boolean; corner?: number }): Promise<DesignOut> {
  const t = Math.max(1, p.thickness);
  const W = p.standWidth;
  const H = p.standHeight;
  const m = Math.max(4, p.margin);
  const notes: Diagnostic[] = [];
  if (!opts.raised) {
    const g = slotStand(ctx, W, H, t, p.lean, m, undefined, opts.corner);
    notes.push(...g.notes);
    const ink = await composeFace(ctx, p, g.content, face, notes);
    const poses = slotPoses(p.lean, t);
    notes.push({ level: 'info', message: 'Drop the upright’s tongue into the slot in the base; it leans back by itself.' });
    return { pieces: [{ ...one('Upright', g.upright, marksFor(ctx, ink, markOp(p))), ...poses.upright }, one('Base', g.base)], notes };
  }
  // The raised plate: as big as the code wants and the face allows, in the middle of the face.
  const s = Math.min(p.qrSize + 8, W - 2 * m);
  const g0 = slotStand(ctx, W, H, t, p.lean, m, undefined, opts.corner);
  const cb = g0.content;
  // Title above the plate, caption below; the plate sits where the code would.
  const titleL = face.title ? await lettering(ctx, p.font, face.title, p.size, { spacing: p.spacing }) : null;
  const capL = face.caption ? await lettering(ctx, p.font2, face.caption, p.size2) : null;
  const gap = Math.max(3, H * 0.04);
  const logoS = face.logo ? await symbolRegion(ctx, p.symbol, Math.min(W * 0.3, H * 0.14)) : null;
  const tl = titleL ? fit(ctx, titleL, boxW(cb), H * 0.18) : null;
  const ll = logoS ? region(ctx, logoS) : null;
  const cl = capL ? fit(ctx, capL, boxW(cb), H * 0.14) : null;
  const total = (ll ? ll.b.height + gap : 0) + (tl ? tl.b.height + gap : 0) + s + (cl ? cl.b.height + gap : 0);
  const k = Math.min(1, boxH(cb) / total);
  if (k < 0.97) notes.push({ level: 'info', message: 'The lettering and the code were made smaller to fit the face.' });
  let y = (cb.y0 + cb.y1) / 2 + (total * k) / 2;
  const ink: CrossSection[] = [];
  const put = (l: Lettering) => {
    const h = l.b.height * k;
    ink.push(l.cs.translate([-l.b.cx, -l.b.cy]).scale([k, k]).translate([0, y - h / 2]));
    y -= h + gap * k;
  };
  if (ll) put(ll);
  if (tl) put(tl);
  const side = s * k;
  const vc = y - side / 2;
  y -= side + gap * k;
  if (cl) put(cl);
  const plateAt = vc;
  const g = slotStand(ctx, W, H, t, p.lean, m, { area: side * side, v: plateAt - g0.shoulder }, opts.corner);
  notes.push(...g.notes);
  const plate = ctx.cs([roundedRect(side, side, 1.5)]);
  const code = codeBlock(ctx, face.code ?? '', side - 4, p.ecc, notes);
  const poses = slotPoses(p.lean, t);
  const marks = marksFor(ctx, union(ctx, ink), markOp(p));
  marks.score.push(...outlineOf(ctx, plate.offset(-0.6, 'Round', 2, 16).translate([0, plateAt])));
  const pieces: PieceOut[] = [
    { ...one('Upright', g.upright, marks), ...poses.upright },
    one('Base', g.base),
    { ...one('Code plate', plate, code ? marksFor(ctx, code, 'engrave') : noMarks()), ...poses.onFace(plateAt), sheet: 1 },
  ];
  notes.push({ level: 'info', message: 'Glue the code plate inside the scored square, then drop the upright into the base.' });
  return { pieces, notes };
}

async function qrSlotStand(ctx: Ctx, p: P): Promise<DesignOut> {
  return slotDesign(ctx, p, { title: p.text, code: p.qrData, caption: p.text2, logo: p.logo }, { raised: p.codeMount === 'raised' });
}

async function qrDisplayStand(ctx: Ctx, p: P): Promise<DesignOut> {
  switch (p.standStyle) {
    case 'foot':
      return qrStand(ctx, p, { title: p.text2, code: p.qrData, caption: p.text, logo: p.logo });
    case 'double':
      return slotDesign(ctx, p, { title: p.text, code: p.qrData, caption: lines(p.text2)[0] ?? '', code2: { data: p.qrData2, label: lines(p.text2)[1] ?? '' }, logo: p.logo }, { raised: false });
    case 'corner':
      return slotDesign(ctx, p, { title: p.text2, code: p.qrData, caption: p.text, logo: p.logo }, { raised: false, corner: Math.min(p.standWidth, p.standHeight) * 0.3 });
    default:
      // The plaque: logo and title over a raised code, the name under it.
      return slotDesign(ctx, p, { title: p.text2, code: p.qrData, caption: p.text, logo: p.logo }, { raised: true });
  }
}

export const SIGN_DESIGNS: Record<string, (ctx: Ctx, p: P) => Promise<DesignOut>> = {
  'qr-card': qrCard,
  'table-sign': tableSign,
  'qr-table-tent': qrTableTent,
  'qr-stand': (ctx, p) => qrStand(ctx, p),
  'qr-slot-stand': qrSlotStand,
  'qr-display-stand': qrDisplayStand,
};
