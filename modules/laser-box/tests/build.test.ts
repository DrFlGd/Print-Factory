import { defaults } from '@pf/core';
import type { BuildResult, ParamSchema } from '@pf/core';
import type { Manifold, ManifoldContext } from '@pf/engine-manifold';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { splitSheets } from '@pf/export';
import { pointInside } from '@pf/shapes';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import presets from '../presets.json';
import type { Params } from '../src/build';
import { axisRotation, build, specOf, stockOf } from '../src/build';
import { planEdge } from '../src/fingers';
import { patternGeometry, PATTERN_IDS as PATTERNS } from '@pf/shapes';
import type { Spec } from '../src/styles';
import { buildWorld } from '../src/styles';
import type { World } from '../src/world';
import { poseOf, resolve, thicknessOf } from '../src/world';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });
const errors = (r: BuildResult) => (r.diagnostics ?? []).filter((d) => d.level === 'error').map((d) => d.message);

/** Runs `fn` with a live engine context, returning what it returns (plain numbers only). */
async function withCtx<T>(fn: (ctx: ManifoldContext<Params>) => T): Promise<T> {
  let out: T;
  await runBuild(await loadManifold(), async (ctx: ManifoldContext<Params>) => {
    out = fn(ctx);
    return { parts: [] };
  }, base);
  return out!;
}

const spec = (over: Partial<Params> = {}, fit = 0): Spec => ({ ...specOf({ ...base, ...over }), fit, flex: false });

/** Every piece as a solid where it sits in the box. */
function assembled(ctx: ManifoldContext<Params>, w: World): { id: string; group?: string; m: Manifold }[] {
  return resolve(ctx as never, w, 2, thicknessOf(w.slabs[0]!)).map((r) => ({
    id: r.slab.id,
    group: r.slab.group,
    m: ctx.extrude(r.section, thicknessOf(r.slab)).transform(poseOf(r.slab) as never),
  }));
}

function overlaps(ps: { id: string; m: Manifold }[]): { pair: string; v: number }[] {
  const out: { pair: string; v: number }[] = [];
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const v = ps[i]!.m.intersect(ps[j]!.m).volume();
      if (v > 1e-4) out.push({ pair: `${ps[i]!.id}/${ps[j]!.id}`, v });
    }
  return out;
}

describe('fingers', () => {
  it('cuts an odd number of equal segments, the corners keeping the ends', () => {
    const f = planEdge(0, 100, 10, 4.5);
    expect(f.length).toBe(4);
    const s = 100 / 9;
    f.forEach(([a, b], i) => {
      expect(a).toBeCloseTo((2 * i + 1) * s, 9);
      expect(b - a).toBeCloseTo(s, 9);
    });
    expect(planEdge(0, 20, 10, 4.5)).toHaveLength(1);
    expect(planEdge(0, 10, 10, 4.5)).toHaveLength(0);
  });
});

describe('joints', () => {
  const cases: [string, Partial<Params>][] = [
    ['open, flush', { style: 'open', bottom: 'flush' }],
    ['open, inset, dividers', { style: 'open', bottom: 'slots', dividersX: 2, dividersY: 1 }],
    ['lift-off, feet', { style: 'lid', bottom: 'feet', dividersX: 1 }],
    ['hinged, inset, dividers', { style: 'hinge', dividersX: 1, dividersY: 1 }],
    ['drawers, flush', { style: 'drawer', drawers: 3, height: 150, bottom: 'flush' }],
    ['drawers, feet', { style: 'drawer', drawers: 2, height: 120, width: 110, bottom: 'feet' }],
  ];

  it('fits every piece together with nothing overlapping when the fit is exact', async () => {
    for (const [label, over] of cases) {
      const bad = await withCtx((ctx) => overlaps(assembled(ctx, buildWorld(spec(over)))));
      // A hinged lid's pull tab grips the sides of its recess on purpose: a hair, 0.45 mm³.
      expect(bad.filter((b) => !(b.pair === 'front/lid' && b.v < 1)), label).toEqual([]);
    }
  });

  it('leaves no gaps: an open box is its whole shell', async () => {
    for (const bottom of ['flush', 'slots'] as const) {
      const s = spec({ style: 'open', bottom });
      const { L, W, H, t } = s;
      const vol = await withCtx((ctx) => assembled(ctx, buildWorld(s)).reduce((a, p) => a + p.m.volume(), 0));
      const walls = L * W * H - (L - 2 * t) * (W - 2 * t) * H;
      expect(vol, bottom).toBeCloseTo(walls + (L - 2 * t) * (W - 2 * t) * t, 3);
    }
  });

  it('squeezes only jointed pairs, by about the fit', async () => {
    const s = spec({ style: 'open', bottom: 'slots' }, 0.1);
    const { pairs, jointed } = await withCtx((ctx) => {
      const w = buildWorld(s);
      return { pairs: overlaps(assembled(ctx, w)), jointed: new Set(w.joints.flatMap((j) => [`${j.a}/${j.b}`, `${j.b}/${j.a}`])) };
    });
    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) {
      expect(jointed.has(p.pair), p.pair).toBe(true);
      // Never more than a sliver: fit/2 deep across each finger face.
      expect(p.v).toBeLessThan(0.1 * 3 * 120);
    }
  });

  it('turns the hinged lid open without hitting anything', async () => {
    const s = spec({ style: 'hinge', dividersX: 1 });
    const hits = await withCtx((ctx) => {
      const w = buildWorld(s);
      const ps = assembled(ctx, w);
      const lid = ps.find((p) => p.id === 'lid')!;
      const motion = w.motions.get('lid')!;
      if (motion.kind !== 'hinge') throw new Error('not a hinge');
      const out: string[] = [];
      for (let deg = 0; deg <= 100; deg += 5) {
        const m = lid.m.transform(axisRotation(motion.at, motion.axis, deg) as never);
        for (const p of ps) {
          if (p === lid) continue;
          const v = m.intersect(p.m).volume();
          // Closed, the pull tab grips the sides of its recess: a hair of interference, on purpose.
          const allowed = deg === 0 && p.id === 'front' ? 1 : 1e-4;
          if (v > allowed) out.push(`${deg}° ${p.id} ${v.toFixed(3)}`);
        }
      }
      return out;
    });
    expect(hits).toEqual([]);
  });

  it('slides each drawer out clear of the case', async () => {
    const s = spec({ style: 'drawer', drawers: 3, height: 150 });
    const hits = await withCtx((ctx) => {
      const w = buildWorld(s);
      const ps = assembled(ctx, w);
      const out: string[] = [];
      for (const [g, motion] of w.motions) {
        if (motion.kind !== 'slide') continue;
        const mine = ps.filter((p) => p.group === g);
        const rest = ps.filter((p) => p.group !== g);
        for (const k of [0.25, 0.5, 1]) {
          const d = motion.distance * k;
          for (const p of mine) {
            const m = p.m.translate([motion.dir[0] * d, motion.dir[1] * d, motion.dir[2] * d]);
            for (const q of rest) if (m.intersect(q.m).volume() > 1e-4) out.push(`${p.id} × ${q.id} at ${d.toFixed(0)}`);
          }
        }
      }
      return out;
    });
    expect(hits).toEqual([]);
  });

  it('measures inside sizes as the space in the box', () => {
    for (const style of ['open', 'lid', 'hinge', 'drawer'] as const) {
      const w = buildWorld(specOf({ ...base, style, measure: 'inside', length: 100, width: 70, height: 40, drawers: 2 }));
      expect(w.inside.map((v) => Math.round(v * 1000) / 1000), style).toEqual([100, 70, 40]);
    }
  });
});

describe('cut file', () => {
  it('builds every preset without errors', async () => {
    for (const p of presets) {
      const r = await run(p.values as Partial<Params>);
      expect(errors(r), p.id).toEqual([]);
      expect(r.drawing!.layers.find((l) => l.operation === 'cut')!.contours.length, p.id).toBeGreaterThan(4);
    }
  });

  it('allows for the kerf once, round every outline', async () => {
    const area = async (kerf: number) => {
      const r = await run({ style: 'open', kerfAuto: false, kerf });
      const cut = r.drawing!.layers.find((l) => l.operation === 'cut')!;
      return cut.contours.reduce((a, c) => {
        let s = 0;
        for (let i = 0; i < c.length; i += 2) {
          const j = (i + 2) % c.length;
          s += c[i]! * c[j + 1]! - c[j]! * c[i + 1]!;
        }
        return a + s / 2;
      }, 0);
    };
    const a0 = await area(0);
    const a1 = await area(0.2);
    // Outlines grow and holes shrink: the cut area grows by about half the kerf times every edge.
    expect(a1).toBeGreaterThan(a0);
    expect(a1 - a0).toBeLessThan(0.1 * 6000);
  });

  it('lays the pieces inside their sheets, one file per sheet', async () => {
    const r = await run({ style: 'drawer', drawers: 3, length: 150, width: 120, height: 150, sheet: '300x200' });
    const d = r.drawing!;
    expect(d.sheets!.length).toBeGreaterThan(1);
    const files = splitSheets(d);
    expect(files.length).toBe(d.sheets!.length);
    for (const f of files) {
      for (const l of f.drawing.layers)
        for (const c of [...l.contours, ...(l.polylines ?? [])])
          for (let i = 0; i < c.length; i += 2) {
            expect(c[i]!).toBeGreaterThanOrEqual(0);
            expect(c[i]!).toBeLessThanOrEqual(300);
            expect(c[i + 1]!).toBeGreaterThanOrEqual(0);
            expect(c[i + 1]!).toBeLessThanOrEqual(200);
          }
    }
    expect(errors(await run({ length: 400, sheet: '300x300' }))[0]).toMatch(/larger than the sheet/);
  });

  it('keeps plywood grain one way and turns other sheets to fit', async () => {
    expect(stockOf({ ...base, material: 'ply3' }).m.grain).toBe(true);
    expect(stockOf({ ...base, material: 'acrylic3' }).m.flex).toBe(false);
    const r = await run({ material: 'acrylic3' });
    expect((r.diagnostics ?? []).some((d) => /does not take flex/.test(d.message))).toBe(true);
    const cut = r.drawing!.layers.find((l) => l.operation === 'cut')!;
    expect(cut.polylines ?? []).toHaveLength(0);
  });
});

describe('patterns', () => {
  it('draws every pattern', () => {
    for (const id of PATTERNS) {
      const g = patternGeometry(id, 40, 12);
      expect(g.cells.length, id).toBeGreaterThan(10);
      expect(g.lines.reduce((n, l) => n + l.length / 2, 0), id).toBeGreaterThan(30);
    }
  });

  it('cuts a lattice that leaves each wall in one piece', async () => {
    const r = await run({ style: 'open', patternOn: 'walls', pattern: 'asanoha', patternOp: 'cut', patternSize: 16 });
    const walls = r.parts.filter((p) => /Front|Back|side/.test(p.name));
    expect(walls).toHaveLength(4);
    const wasm = await loadManifold();
    for (const p of walls) {
      const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
      mesh.merge();
      const m = wasm.Manifold.ofMesh(mesh);
      expect(m.decompose().length, p.name).toBe(1);
      expect(m.genus(), p.name).toBeGreaterThan(20);
    }
  });

  it('scores inside the face, clear of the joints', async () => {
    const r = await run({ style: 'lid', patternOn: 'lid', pattern: 'hexagons', patternOp: 'score', margin: 5, frame: false });
    const score = r.drawing!.layers.find((l) => l.operation === 'score')!;
    expect(score.polylines!.length).toBeGreaterThan(10);
    // The lid is the only patterned piece; every scored point is inside some cut outline.
    const cut = r.drawing!.layers.find((l) => l.operation === 'cut')!;
    for (const pl of score.polylines!) for (let i = 0; i < pl.length; i += 2) expect(pointInside(cut.contours, pl[i]!, pl[i + 1]!)).toBe(true);
  });

  it('shapes the pattern to a window', async () => {
    const face = await run({ style: 'lid', patternOn: 'lid', patternOp: 'engrave', pattern: 'dots' });
    const heart = await run({ style: 'lid', patternOn: 'lid', patternOp: 'engrave', pattern: 'dots', window: 'heart', windowSize: 60 });
    const n = (r: BuildResult) => r.drawing!.layers.find((l) => l.operation === 'engrave')!.contours.length;
    expect(n(heart)).toBeLessThan(n(face) * 0.6);
    expect(n(heart)).toBeGreaterThan(5);
  });
});
