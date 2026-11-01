/**
 * Keychain carabiner set: a snap hook, a chain, connector rings and a charm, all printed
 * flat in one job.
 *
 * Every part starts as a silhouette and becomes a band (the outline minus itself inset by
 * the bar). The hook's band gets an S-shaped gate cut, so the whole ring is the spring and
 * the two sides key into each other when closed. What the hook hangs things by is a plain
 * loop, nothing (the chain goes through the hook itself) or a print-in-place swivel: a
 * barrel in a window through the neck with its stem out through a tunnel in the floor.
 *
 * The chain is either open links, each with one slit to close by hand, or a print-in-place
 * chain: wide and narrow octagon links alternating, each wide link's end bar passing over
 * one side of the narrow link and under the other, so they come off the bed linked.
 *
 * Feature set after the Vostok Labs Keychain Carabiner Set; geometry written for Print
 * Factory.
 */
import type { BuildResult, Contour, Diagnostic, Part, RGB } from '@pf/core';
import type { CrossSection, Manifold, ManifoldContext } from '@pf/engine-manifold';
import { arrange } from '@pf/plate';
import { circle, rect, roundedRect, signedArea } from '@pf/shapes';
import { symbolShapes } from '@pf/symbols';
import { shapeOutline } from './shapes';

type Pt = [number, number];

export interface Params {
  hookShape: string;
  hookSize: number;
  hookBar: number;
  hookThick: number;
  gateFit: 'soft' | 'normal' | 'firm';
  attach: 'swivel' | 'loop' | 'none';
  swivelStem: number;
  loopBar: number;
  icon: string;
  iconSameColor: boolean;
  iconSize: number;
  iconAngle: number;
  iconOffset: number;
  iconRotate: number;
  iconRaise: number;
  chainMode: 'open' | 'pip';
  linkShape: string;
  linkCount: number;
  linkSize: number;
  linkBar: number;
  linkThick: number;
  connectorRings: number;
  connectorExtra: number;
  pipLinkCount: number;
  pipLinkSize: number;
  pipLinkAspect: 'round' | 'oval' | 'long' | 'cuban';
  pipLinkBar: number;
  pipLinkThick: number;
  pipConnectorRings: number;
  pipAttached: boolean;
  charm: boolean;
  charmMount: 'chain' | 'swivel';
  charmShape: string;
  charmSize: number;
  charmThick: number;
  charmFill: 'solid' | 'frame';
  charmBar: number;
  charmIcon: string;
  charmIconSize: number;
  charmIconStyle: 'cut' | 'engrave' | 'raise';
  edge: 'chamfer' | 'round';
  edgeSize: number;
  oneColor: boolean;
  hookColor: RGB;
  iconColor: RGB;
  linkColor: RGB;
  charmColor: RGB;
}

/** The S-cut's strip width: the clearance the two halves of the gate slide past. */
export const GATE_GAP: Record<Params['gateFit'], number> = { soft: 0.5, normal: 0.45, firm: 0.4 };
/** How far a fused feature reaches into what it joins. */
const FUSE = 1.5;
/** Room round whatever passes through a loop. */
export const LOOP_CLEARANCE = 2.5;
/** Width of a link's slit. */
const SLIT = 0.6;
/** Swivel clearances and walls; they never scale. */
const SW_GAP = 0.4;
const SW_WALL = 1.6;
const SW_SKIN = 0.9;
const SW_FLOOR = 2.4;
const SW_DROP = 1.0;
/** The thinnest hook that can hold a swivel with a given stem. */
export const swivelMinThick = (stem: number) => Math.round((stem / 2 + SW_GAP + SW_SKIN) * 2 * 10) / 10;
/** Print-in-place chain: vertical gap at a crossing, and side clearance. */
const PIP_GAP = 0.4;
const PIP_SIDE = 0.5;
export const PIP_ASPECT: Record<Params['pipLinkAspect'], number> = { round: 1, oval: 1.3, long: 1.7, cuban: 1.15 };
const ENGRAVE_MAX = 1.2;
const RAISE_H = 0.8;

const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const rot = (v: Pt, deg: number): Pt => {
  const r = (deg * Math.PI) / 180;
  return [v[0] * Math.cos(r) - v[1] * Math.sin(r), v[0] * Math.sin(r) + v[1] * Math.cos(r)];
};

/* ------------------------------------------------------------------ 2D helpers */

function scaled(c: Contour, k: number): Contour {
  return c.map((v) => v * k);
}

/** Where a ray from `o` along `d` last leaves the outer contours: the outline's far edge. */
function farHit(contours: Contour[], o: Pt, d: Pt): { at: Pt; normal: Pt } | null {
  let best = -Infinity;
  let normal: Pt = [d[0], d[1]];
  for (const c of contours) {
    if (signedArea(c) <= 0) continue;
    const n = c.length;
    for (let i = 0; i < n; i += 2) {
      const ax = c[i]!;
      const ay = c[i + 1]!;
      const bx = c[(i + 2) % n]!;
      const by = c[(i + 3) % n]!;
      const ex = bx - ax;
      const ey = by - ay;
      const cross = d[0] * ey - d[1] * ex;
      if (Math.abs(cross) < 1e-12) continue;
      const ox = ax - o[0];
      const oy = ay - o[1];
      const t = (ox * ey - oy * ex) / cross;
      const u = (ox * d[1] - oy * d[0]) / cross;
      if (t > 0 && u >= 0 && u <= 1 && t > best) {
        best = t;
        const len = Math.hypot(ex, ey) || 1;
        // Counter-clockwise outer contour: the outward normal is the edge turned clockwise.
        normal = [ey / len, -ex / len];
      }
    }
  }
  return best > -Infinity ? { at: add(o, d, best), normal } : null;
}

function centreOf(s: CrossSection): Pt {
  const b = s.bounds();
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
}

/** A polyline swept as a strip of constant width with round joints. */
function strip(ctx: ManifoldContext<Params>, pts: Pt[], width: number): CrossSection {
  const pieces: Contour[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (width / 2);
    const ny = (dx / len) * (width / 2);
    pieces.push([a[0] + nx, a[1] + ny, a[0] - nx, a[1] - ny, b[0] - nx, b[1] - ny, b[0] + nx, b[1] + ny]);
  }
  for (const p of pts) pieces.push(circle(width / 2, 16).map((v, i) => v + (i % 2 ? p[1] : p[0])));
  return ctx.CrossSection.union(pieces.map((c) => ctx.cs([c])));
}

function ringSection(ctx: ManifoldContext<Params>, innerR: number, bar: number): CrossSection {
  return ctx.cs([circle(innerR + bar, 96)]).subtract(ctx.cs([circle(innerR, 96)]));
}

/** Only the outer loops: a glyph's counters would otherwise be islands. */
function filled(ctx: ManifoldContext<Params>, s: CrossSection): CrossSection {
  return ctx.cs(ctx.contours(s).filter((c) => signedArea(c) > 0));
}

/** A symbol from the library as one section, longest side `size`, centred. */
async function symbolSection(ctx: ManifoldContext<Params>, id: string, size: number): Promise<CrossSection | null> {
  if (!id) return null;
  const shapes = await symbolShapes(id, size, ctx.inputs);
  if (!shapes.length) return null;
  const s = ctx.CrossSection.union(shapes.map((x) => ctx.cs(x.contours, x.fillRule)));
  return s.isEmpty() ? null : s;
}

/** A shape's outline at `size`, with corners eased so they print. */
function outlineOf(ctx: ManifoldContext<Params>, id: string, size: number): CrossSection {
  const r = Math.min(0.6, size * 0.02);
  return ctx.cs([scaled(shapeOutline(id), size)]).offset(-r, 'Round', 2, 24).offset(r, 'Round', 2, 24);
}

/* ------------------------------------------------------------------ 3D helpers */

/** Extrudes with the top and bottom edges chamfered or rounded. */
function edged(ctx: ManifoldContext<Params>, s: CrossSection, h: number, size: number, style: Params['edge'], z0 = 0): Manifold {
  const c = Math.max(0, Math.min(size, h / 2 - 0.05));
  return ctx.edged(s, h, { top: c, bottom: c, style, z0 });
}

/** A slab of `region` between two heights. */
function slab(ctx: ManifoldContext<Params>, region: CrossSection, z0: number, z1: number): Manifold {
  return ctx.extrude(region, z1 - z0, z0);
}

/** Cylinder of radius r along +Y from y0 to y1 at (x, z). */
function cylY(ctx: ManifoldContext<Params>, x: number, y0: number, y1: number, z: number, r: number): Manifold {
  return ctx.Manifold.cylinder(y1 - y0, r, r, 32).rotate([-90, 0, 0]).translate([x, y0, z]);
}

/* ------------------------------------------------------------------ link slit */

/** The slit for a split ring: across the band where it is thinnest, leaning 25°. */
function slitFor(ctx: ManifoldContext<Params>, band: CrossSection): CrossSection | null {
  const cs = ctx.contours(band);
  const outer = cs.filter((c) => signedArea(c) > 0);
  const holes = cs.filter((c) => signedArea(c) < 0);
  if (!holes.length || !outer.length) return null;
  let best: { p: Pt; q: Pt; d: number } | null = null;
  for (const c of outer)
    for (let i = 0; i < c.length; i += 2) {
      const p: Pt = [c[i]!, c[i + 1]!];
      let q: Pt = p;
      let d = Infinity;
      for (const hc of holes)
        for (let j = 0; j < hc.length; j += 2) {
          const ax = hc[j]!;
          const ay = hc[j + 1]!;
          const bx = hc[(j + 2) % hc.length]!;
          const by = hc[(j + 3) % hc.length]!;
          const ex = bx - ax;
          const ey = by - ay;
          const l2 = ex * ex + ey * ey;
          const t = l2 ? Math.max(0, Math.min(1, ((p[0] - ax) * ex + (p[1] - ay) * ey) / l2)) : 0;
          const x = ax + t * ex;
          const y = ay + t * ey;
          const dd = Math.hypot(p[0] - x, p[1] - y);
          if (dd < d) {
            d = dd;
            q = [x, y];
          }
        }
      // Prefer the left side on ties, where every plain ring's slit is.
      if (!best || d < best.d - 0.05 || (Math.abs(d - best.d) <= 0.05 && p[0] < best.p[0])) best = { p, q, d };
    }
  if (!best) return null;
  const mid: Pt = [(best.p[0] + best.q[0]) / 2, (best.p[1] + best.q[1]) / 2];
  let dir: Pt = [best.p[0] - best.q[0], best.p[1] - best.q[1]];
  const len = Math.hypot(dir[0], dir[1]) || 1;
  dir = rot([dir[0] / len, dir[1] / len], 25);
  const reach = best.d / Math.cos((25 * Math.PI) / 180) / 2 + 1;
  return strip(ctx, [add(mid, dir, -reach), add(mid, dir, reach)], SLIT);
}

/* ------------------------------------------------------------------ the print-in-place chain */

interface PipLink {
  index: number;
  wide: boolean;
  cy: number;
  w: number;
}

interface PipPlan {
  links: PipLink[];
  L: number;
  bar: number;
  h: number;
  pitch: number;
  /** Where the last link's hole bottom is (what hangs from it hangs there). */
  carry: Pt;
}

export function pipPlan(p: Params, topY: number): PipPlan {
  const L = p.pipLinkSize;
  const bar = p.pipLinkBar;
  const W = L / PIP_ASPECT[p.pipLinkAspect];
  const narrow = W - 2 * bar - 2 * PIP_SIDE;
  if (narrow - 2 * bar < 2) throw new Error(`Print-in-place links ${L} mm long need a thinner bar or a rounder shape: the narrow links have no room inside.`);
  const pitch = L - 2 * bar - 0.5;
  const links: PipLink[] = [];
  const n = Math.max(1, Math.round(p.pipLinkCount));
  for (let i = 0; i < n; i++) links.push({ index: i, wide: i % 2 === 0, cy: topY - L / 2 - i * pitch, w: i % 2 === 0 ? W : narrow });
  const last = links[links.length - 1]!;
  return { links, L, bar, h: p.pipLinkThick, pitch, carry: [0, last.cy - L / 2 + bar] };
}

function octagon(ctx: ManifoldContext<Params>, w: number, l: number, bar: number): CrossSection {
  const c = Math.min(bar * 0.7, w * 0.25, l * 0.25);
  const hw = w / 2;
  const hl = l / 2;
  const outer = ctx.cs([[-hw + c, -hl, hw - c, -hl, hw, -hl + c, hw, hl - c, hw - c, hl, -hw + c, hl, -hw, hl - c, -hw, -hl + c]]);
  return outer.subtract(outer.offset(-bar, 'Miter', 2));
}

/** Link `k` as a solid, with its crossings cut to over or under. */
function pipLinkSolid(ctx: ManifoldContext<Params>, plan: PipPlan, k: number, edgeSize: number, style: Params['edge']): Manifold {
  const link = plan.links[k]!;
  const { L, bar, h } = plan;
  let m = edged(ctx, octagon(ctx, link.w, L, bar).translate([0, link.cy]), h, Math.min(edgeSize, 0.4), style);
  const lo = h / 2 - PIP_GAP / 2;
  const hi = h / 2 + PIP_GAP / 2;
  const box = (x: number, y: number) => ctx.cs([rect(bar + 2 * PIP_SIDE, bar + 2 * PIP_SIDE)]).translate([x, y]);
  // A wide link's end bar crosses the narrow neighbour's two side bars: over on the left,
  // under on the right. The narrow link takes the other level at each crossing.
  const crossings: { x: number; y: number; over: boolean }[] = [];
  for (const nb of [plan.links[k - 1], plan.links[k + 1]]) {
    if (!nb) continue;
    const wide = link.wide ? link : nb;
    const narrow = link.wide ? nb : link;
    // The wide link's end bar that lies inside the narrow one.
    const endY = wide.cy > narrow.cy ? wide.cy - L / 2 + bar / 2 : wide.cy + L / 2 - bar / 2;
    const sx = narrow.w / 2 - bar / 2;
    crossings.push({ x: -sx, y: endY, over: link.wide }, { x: sx, y: endY, over: !link.wide });
  }
  for (const c of crossings) m = m.subtract(c.over ? slab(ctx, box(c.x, c.y), -1, hi) : slab(ctx, box(c.x, c.y), lo, h + 1));
  return m;
}

/* ------------------------------------------------------------------ the build */

interface Piece {
  solid: Manifold;
  name: string;
  color: RGB;
}

export async function build(ctx: ManifoldContext<Params>): Promise<BuildResult> {
  const p = ctx.params;
  const diagnostics: Diagnostic[] = [];
  const note = (message: string, level: Diagnostic['level'] = 'info') => diagnostics.push({ level, message });
  const colour = (c: RGB) => (p.oneColor ? p.hookColor : c);
  const edgeSize = Math.max(0, p.edgeSize);
  const t = p.hookThick;
  const pip = p.chainMode === 'pip';

  /* ---- swivel feasibility */
  let attach = p.attach;
  let stem = Math.max(2.4, p.swivelStem);
  if (attach === 'swivel') {
    const maxStem = 2 * (t / 2 - SW_SKIN - SW_GAP);
    if (maxStem < 2.4 - 1e-9) {
      note(`A swivel needs the hook at least ${swivelMinThick(2.4)} mm thick; using a plain loop.`, 'warning');
      attach = 'loop';
    } else if (stem > maxStem + 1e-9) {
      note(`A ${stem} mm stem needs a ${swivelMinThick(stem)} mm hook; using ${maxStem.toFixed(1)} mm.`, 'warning');
      stem = maxStem;
    }
  }
  if (pip && attach === 'none') attach = 'loop';
  const charmOnSwivel = p.charm && p.charmMount === 'swivel' && attach === 'swivel';

  /* ---- the hook's outline and band */
  const outline = outlineOf(ctx, p.hookShape, p.hookSize);
  const inner = outline.offset(-p.hookBar, 'Round', 2, 32);
  const solidHook = inner.isEmpty();
  let section = solidHook ? outline : outline.subtract(inner);
  if (solidHook) note('The bar fills the whole hook, so it has no opening and no gate. Make it bigger or the bar thinner.', 'warning');
  const centre = centreOf(outline);
  const oc = ctx.contours(outline);
  const eye = farHit(oc, centre, [0, -1])?.at ?? [centre[0], outline.bounds().min[1]];

  /* ---- the gate: in, across, in, so the two halves key together */
  let gateCut: CrossSection | null = null;
  if (!solidHook) {
    const hit = farHit(oc, centre, [-1, 0]);
    if (hit) {
      const n = hit.normal;
      const tan: Pt = [-n[1], n[0]];
      const across = Math.max(2.5, p.hookBar * 1.2);
      const p0 = add(hit.at, n, 1);
      const p1 = add(hit.at, n, -p.hookBar * 0.5);
      const p2 = add(p1, tan, across);
      const p3 = add(p2, n, -(p.hookBar * 0.5 + 1.5));
      gateCut = strip(ctx, [p0, p1, p2, p3], GATE_GAP[p.gateFit]).intersect(section.offset(0.8, 'Round', 2, 16));
      section = section.subtract(gateCut);
    }
  }

  /* ---- the symbol on the hook */
  let icon: CrossSection | null = null;
  const iconShape = await symbolSection(ctx, p.icon, p.iconSize);
  if (iconShape) {
    const r = (p.iconAngle * Math.PI) / 180;
    const hit = farHit(oc, centre, [Math.cos(r), Math.sin(r)]);
    if (hit) {
      const at = add(hit.at, hit.normal, -p.hookBar / 2 + p.iconOffset);
      const ic = centreOf(iconShape);
      icon = filled(ctx, iconShape.translate([-ic[0], -ic[1]]).rotate(p.iconRotate)).translate(at);
      if (gateCut) icon = icon.subtract(gateCut);
      section = section.add(icon);
    }
  }

  /* ---- what the hook hangs things by */
  const firstThick = pip ? p.pipLinkThick : p.linkThick;
  const loopR = (firstThick + LOOP_CLEARANCE) / 2;
  const hookPieces: Piece[] = [];
  const tunnelCuts: Manifold[] = [];
  /** Where the next thing hangs from, and how it attaches (for the pip chain root). */
  let anchorY = eye[1] + FUSE;
  /** Under the swivel: the top of what hangs from its stem. */
  let captiveTop = 0;
  if (attach === 'loop' && !(pip && p.pipAttached)) {
    const R = loopR + p.loopBar;
    section = section.add(ringSection(ctx, loopR, p.loopBar).translate([eye[0], eye[1] - R + FUSE]));
  } else if (attach === 'swivel') {
    const db = t + 0.2;
    const lb = Math.max(4, db);
    const winW = db + 2 * SW_GAP;
    const winL = lb + 2 * SW_GAP;
    const houseW = winW + 2 * SW_WALL;
    const yTop = eye[1] + FUSE;
    const winTop = eye[1] - SW_WALL;
    const winBot = winTop - winL;
    // The floor runs at least down to the hook's lowest point, so what hangs below clears
    // a star's points or a heart's lobes.
    const yBot = Math.min(winBot - SW_FLOOR, outline.bounds().min[1]);
    const house = ctx.cs([roundedRect(houseW, yTop - yBot, Math.min(2, houseW / 4))]).translate([eye[0], (yTop + yBot) / 2]);
    const window = ctx.cs([rect(winW, winL)]).translate([eye[0], (winTop + winBot) / 2]);
    section = section.add(house).subtract(window);
    tunnelCuts.push(cylY(ctx, eye[0], yBot - 1, winBot + 0.01, t / 2, stem / 2 + SW_GAP));
    // The captive piece: barrel, stem, and the ring (or the charm) under the housing.
    const barrel = cylY(ctx, eye[0], winBot + SW_GAP, winTop - SW_GAP, t / 2, db / 2).intersect(ctx.Manifold.cube([db + 2, winL + 2, t - 0.4]).translate([eye[0] - db / 2 - 1, winBot - 1, 0]));
    const ringTop = yBot - SW_DROP;
    const stemSolid = cylY(ctx, eye[0], ringTop - FUSE, winBot + SW_GAP + 0.5, t / 2, stem / 2);
    let captive = barrel.add(stemSolid);
    if (!charmOnSwivel && !pip) {
      const R = loopR + p.loopBar;
      captive = captive.add(edged(ctx, ringSection(ctx, loopR, p.loopBar).translate([eye[0], ringTop - R]), t, edgeSize, p.edge));
    }
    hookPieces.push({ solid: captive, name: 'Swivel', color: colour(p.hookColor) });
    anchorY = ringTop;
    captiveTop = ringTop;
    note('Print-in-place swivel: after printing, turn the barrel gently until it spins free.');
  }

  /* ---- the hook as a solid, split by colour along the symbol */
  let hookSolid = edged(ctx, section, t, edgeSize, p.edge);
  for (const c of tunnelCuts) hookSolid = hookSolid.subtract(c);
  if (icon && (!p.iconSameColor || p.iconRaise > 0) && !p.oneColor) {
    const column = ctx.extrude(icon, t + 2, -1);
    let iconSolid = hookSolid.intersect(column);
    if (p.iconRaise > 0) iconSolid = iconSolid.add(edged(ctx, icon, p.iconRaise + 0.01, Math.min(edgeSize, p.iconRaise / 3), p.edge, t - 0.01));
    hookPieces.unshift({ solid: hookSolid.subtract(column), name: 'Hook', color: p.hookColor }, { solid: iconSolid, name: 'Hook symbol', color: p.iconSameColor ? p.hookColor : p.iconColor });
  } else {
    if (icon && p.iconRaise > 0) hookSolid = hookSolid.add(edged(ctx, icon, p.iconRaise + 0.01, Math.min(edgeSize, p.iconRaise / 3), p.edge, t - 0.01));
    hookPieces.unshift({ solid: hookSolid, name: 'Hook', color: p.hookColor });
  }

  const groups: { name: string; pieces: Piece[] }[] = [{ name: 'Hook', pieces: hookPieces }];
  /** The thickness of whatever the charm or a connector hangs from, last in the chain. */
  let lastThick = t;

  /* ---- the chain */
  const connectorR = (also: number) => (Math.max(p.linkThick, t, p.charm ? p.charmThick : 0, also) + LOOP_CLEARANCE + Math.max(0, p.connectorExtra)) / 2;
  const splitRing = (ring: CrossSection, thick: number, name: string, c: RGB): Piece => {
    const slit = slitFor(ctx, ring);
    if (!slit) note(`${name} is too small to have a hole; it will not close round anything.`, 'warning');
    return { solid: edged(ctx, slit ? ring.subtract(slit) : ring, thick, edgeSize, p.edge), name, color: colour(c) };
  };
  const connector = (i: number, also = 0, thick = p.linkThick) => {
    const r = connectorR(also);
    groups.push({ name: `Connector ${i}`, pieces: [splitRing(ringSection(ctx, r, Math.max(1.6, p.linkBar)), thick, `Connector ring ${i}`, p.linkColor)] });
  };

  let connectors = 0;
  if (!charmOnSwivel) {
    if (!pip) {
      const n = Math.max(0, Math.round(p.connectorRings));
      const before = Math.ceil(n / 2);
      for (let i = 0; i < before; i++) connector(++connectors);
      for (let i = 0; i < Math.round(p.linkCount); i++) {
        const o = outlineOf(ctx, p.linkShape, p.linkSize);
        const hole = o.offset(-p.linkBar, 'Round', 2, 32);
        if (hole.isEmpty()) throw new Error(`A ${p.linkSize} mm link with a ${p.linkBar} mm bar has no hole. Make the links bigger or the bar thinner.`);
        groups.push({ name: `Link ${i + 1}`, pieces: [splitRing(o.subtract(hole), p.linkThick, `Link ${i + 1}`, p.linkColor)] });
      }
      for (let i = before; i < n; i++) connector(++connectors);
      if (p.linkCount > 0) {
        lastThick = p.linkThick;
        note('Open each link at its slit (a little warmth helps with PLA), thread it on, and press it shut; a drop of glue keeps it closed.');
      } else if (n) lastThick = p.linkThick;
    } else {
      const plan = pipPlan(p, anchorY);
      const pieces: Piece[] = plan.links.map((_, k) => ({ solid: pipLinkSolid(ctx, plan, k, edgeSize, p.edge), name: `Chain link ${k + 1}`, color: colour(p.linkColor) }));
      if (p.pipAttached) {
        // The root link grows out of the hook (or the swivel's stem): fused, one object.
        groups[0]!.pieces.push(...pieces);
      } else {
        // Its own object (the layout moves it clear), joined to the hook by a connector ring.
        if (attach !== 'swivel') {
          // The hook keeps an ordinary loop for the connector.
          const R = loopR + p.loopBar;
          const loop = edged(ctx, ringSection(ctx, loopR, p.loopBar).translate([eye[0], eye[1] - R + FUSE]), t, edgeSize, p.edge);
          groups[0]!.pieces[0]!.solid = groups[0]!.pieces[0]!.solid.add(loop);
        }
        groups.push({ name: 'Chain', pieces });
        connector(++connectors, p.pipLinkThick);
      }
      if (attach === 'swivel' && p.pipAttached) note('The chain grows out of the swivel’s stem, already linked.');
      note('The chain prints already linked: flex each link gently to free it before use.');
      for (let i = 0; i < Math.round(p.pipConnectorRings); i++) connector(++connectors, p.pipLinkThick, Math.min(4, t));
      lastThick = p.pipConnectorRings > 0 ? Math.min(4, t) : p.pipLinkThick;
    }
  }

  /* ---- the charm */
  if (p.charm) {
    const o = outlineOf(ctx, p.charmShape, p.charmSize);
    const hole = o.offset(-p.charmBar, 'Round', 2, 32);
    const frame = p.charmFill === 'frame' && !hole.isEmpty();
    let sec = frame ? o.subtract(hole) : o;
    const thick = charmOnSwivel ? t : p.charmThick;
    const pieces: Piece[] = [];
    let iconCs = await symbolSection(ctx, p.charmIcon, p.charmIconSize);
    if (iconCs) {
      const ic = centreOf(iconCs);
      const oc2 = centreOf(o);
      iconCs = iconCs.translate([oc2[0] - ic[0], oc2[1] - ic[1]]);
      // Keep a wall round the symbol: shrink it until it sits inside the outline.
      const room = o.offset(-1.2, 'Round', 2, 16);
      for (let i = 0; i < 12 && iconCs.subtract(room).area() > 0.01; i++) {
        const c = centreOf(iconCs);
        iconCs = iconCs.translate([-c[0], -c[1]]).scale([0.9, 0.9]).translate(c);
      }
    }
    let body: Manifold;
    if (frame) {
      if (iconCs) {
        const joined = sec.add(filled(ctx, iconCs));
        if (joined.decompose().length > 1) note('The charm’s symbol does not touch its frame, so it would fall out. Make the symbol bigger or the charm solid.', 'warning');
        sec = joined;
      }
    }
    // The loop at the top, unless the charm hangs on the swivel's stem.
    // Where it hangs from: the outline's edge straight above its middle (a heart's cleft).
    const top = farHit(ctx.contours(o), centreOf(o), [0, 1])?.at ?? [0, o.bounds().max[1]];
    const bboxTop = o.bounds().max[1];
    if (!charmOnSwivel) {
      const r = (lastThick + LOOP_CLEARANCE) / 2;
      const bar = Math.max(1.6, p.loopBar);
      // High enough that nothing (a heart's lobes) reaches into the hole, with a tab down
      // to the outline so it is joined however deep the cleft.
      const cy = Math.max(top[1] + r + bar - FUSE, bboxTop + r + 0.4);
      const hole = ctx.cs([circle(r, 96)]).translate([top[0], cy]);
      const disk = ctx.cs([circle(r + bar, 96)]).translate([top[0], cy]);
      const tab = ctx.cs([rect(2 * r, cy - top[1] + FUSE)]).translate([top[0], (cy + top[1] - FUSE) / 2]);
      sec = sec.add(disk).add(tab).subtract(hole);
    }
    body = edged(ctx, sec, thick, edgeSize, p.edge);
    if (iconCs && !frame) {
      if (p.charmIconStyle === 'cut') body = body.subtract(ctx.extrude(filled(ctx, iconCs), thick + 2, -1));
      else if (p.charmIconStyle === 'engrave') body = body.subtract(ctx.extrude(iconCs, ENGRAVE_MAX + 1, thick - Math.min(ENGRAVE_MAX, thick / 2)));
      else pieces.push({ solid: edged(ctx, iconCs, RAISE_H + 0.01, Math.min(edgeSize, RAISE_H / 3), p.edge, thick - 0.01), name: 'Charm symbol', color: colour(p.iconColor) });
    }
    pieces.unshift({ solid: body, name: 'Charm', color: colour(p.charmColor) });
    if (charmOnSwivel) {
      // Hung straight from the stem: its highest point just under the housing, the stem
      // carried on down into the outline (a heart's cleft sits lower than its lobes).
      const dx = eye[0] - top[0];
      const dy = captiveTop - bboxTop;
      const reach = cylY(ctx, eye[0], top[1] + dy - FUSE, captiveTop, t / 2, stem / 2);
      pieces[0]!.solid = pieces[0]!.solid.translate([dx, dy, 0]).add(reach);
      for (const pc of pieces.slice(1)) pc.solid = pc.solid.translate([dx, dy, 0]);
      groups[0]!.pieces.push(...pieces);
    } else groups.push({ name: 'Charm', pieces });
  }

  /* ---- parts, laid out on the plate */
  const parts: Part[] = [];
  for (const g of groups)
    for (const pc of g.pieces) {
      const part = ctx.part(pc.solid, pc.name, pc.color, { group: g.name });
      if (part) parts.push(part);
    }
  arrange(parts, { id: 'layout', name: 'layout', size: [230, 230] } as unknown as Parameters<typeof arrange>[1], 6);
  note(`Gate gap ${GATE_GAP[p.gateFit]} mm. If it fuses, choose a softer fit; PETG makes a springier gate than PLA.`);
  return { parts, diagnostics };
}
