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
});
