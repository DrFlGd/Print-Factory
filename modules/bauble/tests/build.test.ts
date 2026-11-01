import { boundsSize, defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import { grooveWave, isolines } from '../src/bauble';
import type { Params } from '../src/build';
import { build, FLAT_SHAPES, SHAPES, THEMES, threadWave, TOPPERS } from '../src/build';
import { mask, tile } from '../src/patterns';
import { outline } from '../src/shapes';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });
const named = (r: BuildResult, name: string) => r.parts.find((p) => p.name === name)!;
async function solid(p: Part) {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  return wasm.Manifold.ofMesh(mesh);
}

describe('bauble outline', () => {
  it('never leans further than the overhang limit, up or down', () => {
    for (const shape of [...SHAPES, 'custom'] as const)
      for (const overhang of [40, 45, 55]) {
        const o = outline(shape, 70, 1.2, overhang, 10, 13, 6, { bulge: 0.35, top: 0.8, bottom: 3, aspect: 1.1 });
        const k = Math.tan((overhang * Math.PI) / 180) + 1e-6;
        // Skip the foot (flat on the bed) and the neck's top (on the axis).
        for (let i = 2; i < o.pts.length - 1; i++) {
          const [r0, z0] = o.pts[i - 1]!;
          const [r1, z1] = o.pts[i]!;
          expect(z1, shape).toBeGreaterThan(z0 - 1e-9);
          if (z1 - z0 > 1e-9) expect(Math.abs(r1 - r0) / (z1 - z0), `${shape} ${overhang}° at z ${z0.toFixed(1)}`).toBeLessThanOrEqual(k);
        }
        expect(o.rMax, shape).toBeCloseTo(35, 1);
        expect(o.pts[1]).toEqual([5, 0]);
      }
  });

  it('cuts a groove in the cap wide enough for the neck thread', () => {
    for (const c of [0, 0.15, 0.4])
      for (let x = -5; x < 5; x += 0.01) {
        expect(grooveWave(x, c)).toBeGreaterThanOrEqual(threadWave(x));
        expect(grooveWave(x, c)).toBeLessThanOrEqual(1);
      }
  });
});

describe('patterns', () => {
  it('has a tile for every pattern of every theme', () => {
    for (const [theme, list] of Object.entries(THEMES))
      for (const id of list as readonly string[]) {
        const t = tile(id);
        expect(t, `${theme}/${id}`).toBeTruthy();
        let some = 0;
        for (let i = 0; i < 400; i++) {
          const m = mask(t!, (i % 20) / 20, (Math.floor(i / 20) / 20) * t!.h, 18, 1.5);
          expect(m).toBeGreaterThanOrEqual(0);
          expect(m).toBeLessThanOrEqual(1);
          if (m > 0.5) some++;
        }
        // Some of the tile is pattern and some is not.
        expect(some, `${theme}/${id}`).toBeGreaterThan(4);
        expect(some, `${theme}/${id}`).toBeLessThan(396);
      }
  });

  it('traces the outline of a region', () => {
    const w = 60;
    const h = 60;
    const f = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) f[j * w + i] = Math.hypot(i - 30, j - 30) - 20;
    const loops = isolines(f, w, h, 0, 0, 1, 1);
    expect(loops.length).toBe(1);
    let a = 0;
    const c = loops[0]!;
    for (let i = 0, j = c.length - 2; i < c.length; j = i, i += 2) a += c[j]! * c[i + 1]! - c[i]! * c[j + 1]!;
    expect(Math.abs(a / 2)).toBeCloseTo(Math.PI * 400, -1);
  });
});

describe('bauble', () => {
  it('stands on the bed with its cap beside it, and the cap shown on the neck', async () => {
    const r = await run();
    const b = partBounds([named(r, 'Bauble')]);
    expect(b.min[2]).toBeCloseTo(0, 3);
    // The pattern stands out of the 70 mm shape by up to the relief depth.
    expect(b.max[0] - b.min[0]).toBeGreaterThan(70);
    expect(b.max[0] - b.min[0]).toBeLessThan(70 + 2 * base.depth + 0.1);
    expect(partBounds([named(r, 'Cap')]).min[2]).toBeCloseTo(0, 3);
    expect(named(r, 'Cap (on the bauble)').role).toBe('preview');
    expect(r.diagnostics?.some((d) => /vase \(spiral\) mode/.test(d.message))).toBe(true);
    // The cap is in one piece and sits over the neck.
    expect((await solid(named(r, 'Cap'))).decompose().length).toBe(1);
    const on = partBounds([named(r, 'Cap (on the bauble)')]);
    expect(on.min[2]).toBeLessThan(b.max[2]);
    expect(on.max[2]).toBeGreaterThan(b.max[2]);
  });

  it('builds every shape, with and without a pattern', async () => {
    for (const shape of [...SHAPES, 'custom'] as const) {
      const r = await run({ shape, theme: shape === 'tree' ? 'plain' : 'geometric', resolution: 'draft' });
      expect(r.parts.length, shape).toBe(3);
      expect(r.diagnostics?.filter((d) => d.level === 'error') ?? [], shape).toEqual([]);
    }
  });

  it('engraves into the wall instead of standing out', async () => {
    const r = await run({ engrave: true, resolution: 'draft' });
    const b = boundsSize(partBounds([named(r, 'Bauble')]));
    expect(b[0]).toBeLessThan(70.05);
  });

  it('wraps a name onto the front', async () => {
    const plain = await run({ theme: 'plain', resolution: 'draft' });
    const withName = await run({ theme: 'plain', text: 'Noel', resolution: 'draft' });
    const front = (r: BuildResult) => partBounds([named(r, 'Bauble')]).min[1];
    expect(front(withName)).toBeLessThan(front(plain) - base.depth * 0.8);
  });

  it('cuts lace into one piece that stands on its foot ring', async () => {
    const r = await run({ mode: 'lace', japanesePattern: 'kagome', repeats: 8, resolution: 'draft' });
    const body = named(r, 'Bauble');
    expect(partBounds([body]).min[2]).toBeCloseTo(0, 2);
    const m = await solid(body);
    expect(m.decompose().length).toBe(1);
    const volume = m.volume();
    // Openwork: well under the volume of the whole wall.
    const shell = await run({ mode: 'lace', theme: 'plain', resolution: 'draft' });
    const full = (await solid(named(shell, 'Bauble'))).volume();
    expect(volume).toBeLessThan(full * 0.85);
    expect(r.diagnostics?.some((d) => /normal mode/.test(d.message))).toBe(true);
  }, 60000);
});

describe('flat ornament', () => {
  it('builds every shape at its height, the decoration on top', async () => {
    for (const flatShape of FLAT_SHAPES) {
      const r = await run({ product: 'flat', flatShape, loop: false });
      const body = named(r, 'Ornament');
      const b = partBounds([body]);
      expect(b.max[1] - b.min[1], flatShape).toBeCloseTo(80, 1);
      expect(b.min[2], flatShape).toBeCloseTo(0, 3);
      expect(b.max[2], flatShape).toBeCloseTo(4, 3);
      const deco = named(r, 'Decoration');
      expect(deco, flatShape).toBeTruthy();
      expect(partBounds([deco]).min[2], flatShape).toBeCloseTo(4, 3);
      expect((await solid(body)).decompose().length, flatShape).toBe(1);
    }
  });

  it('adds a loop on top, and merges the decoration for one colour', async () => {
    const loop = await run({ product: 'flat', loop: true });
    expect(boundsSize(partBounds([named(loop, 'Ornament')]))[1]).toBeGreaterThan(80 + base.loopHole);
    const one = await run({ product: 'flat', colorMode: 'single' });
    expect(one.parts.map((p) => p.name)).toEqual(['Ornament']);
    const swap = await run({ product: 'flat', colorMode: 'swap' });
    expect(swap.diagnostics?.some((d) => /pause at 4\.00 mm/.test(d.message))).toBe(true);
  });
});

describe('tree topper', () => {
  it('builds every star with a socket whose slot fits the tongue', async () => {
    for (const topper of TOPPERS) {
      const r = await run({ product: 'topper', topper });
      const star = partBounds([named(r, 'Star')]);
      expect(star.max[1], topper).toBeCloseTo(base.topperHeight, 1);
      // The tongue below the star, as thick as the star.
      expect(star.min[1], topper).toBeCloseTo(-14, 3);
      expect(star.max[2], topper).toBeCloseTo(base.topperThickness, 3);
      const sock = partBounds([named(r, 'Socket')]);
      expect(sock.max[2] - sock.min[2], topper).toBeCloseTo(base.socketDepth + 3 + 14, 3);
      expect(r.parts.filter((p) => p.role === 'preview').length).toBeGreaterThan(1);
    }
  });

  it('leaves the slot the tongue plus the clearance each side', async () => {
    const r = await run({ product: 'topper', topperThickness: 5, fitClearance: 0.2 });
    expect(r.diagnostics?.some((d) => /slot 5\.40 mm/.test(d.message))).toBe(true);
  });
});
