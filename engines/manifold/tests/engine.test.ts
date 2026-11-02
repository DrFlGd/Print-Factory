import { describe, expect, it } from 'vitest';
import { boundsSize, partBounds } from '@pf/core';
import { roundedRect, circle } from '@pf/shapes';
import { loadManifold, runBuild } from '../src/node';

describe('manifold engine', () => {
  it('extrudes contours with holes into a watertight part and frees the heap', async () => {
    const wasm = await loadManifold();
    const result = await runBuild(wasm, (ctx) => {
      const plate = ctx.extrude([roundedRect(40, 20, 4)], 3);
      const hole = ctx.extrude([circle(2)], 10, -1).translate([14, 0, 0]);
      const body = plate.subtract(hole);
      const text = ctx.extrude(ctx.offset([roundedRect(10, 4, 0)], 1), 1, 3);
      const part = ctx.part(body, 'Plate', [20, 20, 20])!;
      const top = ctx.part(text, 'Top', [255, 255, 255], { group: 'g' })!;
      expect(body.genus()).toBe(1);
      return { parts: [part, top] };
    }, {});
    expect(result.parts).toHaveLength(2);
    const size = boundsSize(partBounds([result.parts[0]!]));
    expect(size.map((n) => Math.round(n * 1000) / 1000)).toEqual([40, 20, 3]);
    const top = boundsSize(partBounds([result.parts[1]!]));
    expect(top[0]).toBeCloseTo(12, 1);
    expect(result.parts[1]!.group).toBe('g');
    // every triangle index points at a vertex
    const p = result.parts[0]!;
    expect(Math.max(...p.indices)).toBeLessThan(p.positions.length / 3);
  });

  it('handles empty input without throwing', async () => {
    const wasm = await loadManifold();
    const result = await runBuild(wasm, (ctx) => {
      const empty = ctx.extrude([], 5);
      const u = ctx.union([empty]);
      return { parts: [ctx.part(u, 'x', [0, 0, 0])].filter((p) => p !== null) };
    }, {});
    expect(result.parts).toHaveLength(0);
  });

  it('frees objects even when the build throws', async () => {
    const wasm = await loadManifold();
    await expect(
      runBuild(wasm, (ctx) => {
        ctx.extrude([circle(5)], 2);
        throw new Error('boom');
      }, {}),
    ).rejects.toThrow('boom');
  });

  it('chamfers and rounds edges as one solid of the right volume', async () => {
    const wasm = await loadManifold();
    await runBuild(wasm, (ctx) => {
      const sq = ctx.cs([[-5, -5, 5, -5, 5, 5, -5, 5]]);
      const top = ctx.edged(sq, 4, { top: 1 });
      expect(top.volume()).toBeCloseTo(300 + (100 + 64 + 80) / 3, 3);
      const both = ctx.edged(sq, 4, { top: 1, bottom: 1 });
      expect(both.volume()).toBeCloseTo(200 + (2 * (100 + 64 + 80)) / 3, 3);
      const round = ctx.edged(sq, 4, { top: 1, style: 'round' });
      // A quarter-round of radius 1 removes (1 − π/4) mm² of section round a 10 mm square.
      expect(round.volume()).toBeGreaterThan(top.volume());
      expect(round.volume()).toBeLessThan(400);
      expect(round.decompose().length).toBe(1);
      // A ring keeps its hole and rounds both walls.
      const ring = ctx.cs([[-5, -5, 5, -5, 5, 5, -5, 5], [-3, -3, -3, 3, 3, 3, 3, -3]]);
      const r = ctx.edged(ring, 3, { top: 0.5, bottom: 0.5 });
      expect(r.status()).toBe('NoError');
      expect(r.genus()).toBe(1);
      // A stroke thinner than the edge rounds a little instead of folding through itself.
      const thin = ctx.edged(ctx.cs([[-5, -0.3, 5, -0.3, 5, 0.3, -5, 0.3]]), 3, { top: 1, bottom: 1 });
      expect(thin.status()).toBe('NoError');
      expect(thin.volume()).toBeGreaterThan(0);
      return { parts: [] };
    }, {});
  });

  it('frees what instance methods make, not only the constructors', async () => {
    const wasm = await loadManifold();
    const kept: { isDeleted(): boolean }[] = [];
    await runBuild(wasm, (ctx) => {
      const c = ctx.Manifold.cube([2, 2, 2]);
      const s = ctx.cs([roundedRect(4, 4, 1)]);
      const made = [c.translate([1, 0, 0]), c.add(c.translate([0, 3, 0])), c.warp((v) => void (v[2] *= 2)), c.mirror([1, 0, 0]), s.offset(0.5, 'Round', 2, 12), s.extrude(1), ...c.decompose()];
      kept.push(...(made as unknown as { isDeleted(): boolean }[]));
      return { parts: [] };
    }, {});
    expect(kept.filter((o) => !o.isDeleted())).toHaveLength(0);
  });
});
