import { defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { pointInside } from '@pf/shapes';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build, foldMatrices, hingeMatrix, netOptions, placeArt, sheetOf } from '../src/build';
import type { Panel, Style } from '../src/net';
import { allowance, buildNet } from '../src/net';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });
const has = (r: BuildResult, re: RegExp) => (r.diagnostics ?? []).some((d) => re.test(d.message));
const box = (p: Part) => partBounds([p]);
const apply = (m: number[], x: number, y: number, z: number): [number, number, number] => [
  m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
  m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
  m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
];
const STYLES: Style[] = ['mailer', 'mailer-flaps', 'tray', 'tray-lid'];

function folded(over: Partial<Params> = {}) {
  const o = netOptions({ ...base, ...over });
  const net = buildNet(o);
  const mats = foldMatrices(net.panels, 1);
  const get = (id: string) => net.panels.find((q) => q.id === id)!;
  return { o, net, mats, get, a: allowance(o.t) };
}

async function solid(p: Part) {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  const m = wasm.Manifold.ofMesh(mesh);
  expect(m.status()).toBe('NoError');
  return m;
}

describe('folding', () => {
  it('turns a panel up about its hinge', () => {
    const [x, y, z] = apply(hingeMatrix(0, 0, 1, 0, 90), 0, 5, 0);
    expect([x, y, z].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, 5]);
  });

  it('closes each style to its outside size', () => {
    for (const style of ['mailer', 'mailer-flaps', 'tray'] as Style[]) {
      const { o, net, mats, a } = folded({ style });
      let lo = [Infinity, Infinity, Infinity];
      let hi = [-Infinity, -Infinity, -Infinity];
      for (const q of net.panels) {
        const m = mats.get(q.id)!;
        for (let i = 0; i < q.outline.length; i += 2)
          for (const z of [0, o.t]) {
            const w = apply(m, q.outline[i]!, q.outline[i + 1]!, z);
            lo = lo.map((v, k) => Math.min(v, w[k]!));
            hi = hi.map((v, k) => Math.max(v, w[k]!));
          }
      }
      const lidOverhang = style === 'tray' ? 0 : 2 * o.t;
      // The lid closes on top of the walls, its thickness inside them.
      expect(hi[0]! - lo[0]!, style).toBeCloseTo(o.L + a.L + lidOverhang, 1);
      expect(hi[1]! - lo[1]!, style).toBeCloseTo(o.W + a.W, 1);
      expect(hi[2]! - lo[2]!, style).toBeCloseTo(o.H + a.H, 1);
      expect(lo[2]!, style).toBeGreaterThan(-1e-6);
    }
  });

  it('drops the end tabs through the floor slots, ending flush underneath', () => {
    const { o, mats, get } = folded();
    const floor = get('base');
    for (const e of ['l', 'r']) {
      const ply = get(`ply-${e}`);
      const m = mats.get(ply.id)!;
      const xs = ply.outline.filter((_, i) => i % 2 === 0);
      const far = e === 'r' ? Math.max(...xs) : Math.min(...xs);
      let tips = 0;
      for (let i = 0; i < ply.outline.length; i += 2) {
        if (Math.abs(ply.outline[i]! - far) > 1e-6) continue;
        tips++;
        for (const z of [0, o.t]) {
          const [x, y, wz] = apply(m, ply.outline[i]!, ply.outline[i + 1]!, z);
          expect(wz).toBeCloseTo(0, 6);
          expect(pointInside(floor.holes, x, y), `tab tip ${x.toFixed(2)}, ${y.toFixed(2)} in a slot`).toBe(true);
        }
      }
      expect(tips).toBeGreaterThanOrEqual(4);
    }
  });

  it('traps each ear between the end wall and its inner ply', () => {
    const { o, mats, get, a } = folded();
    const Lb = o.L + a.L;
    const ply = get('ply-r');
    for (let i = 0; i < ply.outline.length; i += 2)
      for (const z of [0, o.t]) expect(apply(mats.get('ply-r')!, ply.outline[i]!, ply.outline[i + 1]!, z)[0]).toBeLessThan(Lb / 2 - 2 * o.t - 0.1);
    for (const id of ['front-ear-r', 'back-ear-r']) {
      const ear = get(id);
      const m = mats.get(id)!;
      for (let i = 0; i < ear.outline.length; i += 2) {
        const [x] = apply(m, ear.outline[i]!, ear.outline[i + 1]!, o.t / 2);
        expect(x).toBeGreaterThan(Lb / 2 - 2 * o.t - 1e-6);
        expect(x).toBeLessThan(Lb / 2 - o.t + 1e-6);
      }
    }
  });

  it('reads the logo right on the folded lid and on a tray front', () => {
    const cases: [Style, string, number[], number[]][] = [
      ['mailer', 'lid', [1, 0, 0], [0, 1, 0]],
      ['tray', 'front', [1, 0, 0], [0, 0, 1]],
    ];
    for (const [style, faceId, right, up] of cases) {
      const { mats } = folded({ style });
      const m = mats.get(faceId)!;
      const at = (x: number, y: number) => {
        const c = placeArt([[x, y]], 0, 0, 0)[0]!;
        return apply(m, c[0]!, c[1]!, 0);
      };
      const w0 = at(0, 0);
      const w1 = at(1, 0);
      const w2 = at(0, 1);
      expect(w1.map((v, k) => Math.round(v - w0[k]!) + 0), style).toEqual(right);
      expect(w2.map((v, k) => Math.round(v - w0[k]!) + 0), style).toEqual(up);
    }
  });
});

describe('sheet', () => {
  it('builds every style as one watertight sheet', async () => {
    for (const style of STYLES) {
      for (const size of [{}, { length: 40, width: 30, height: 12 }, { length: 200, width: 30, height: 120 }]) {
        const label = `${style} ${JSON.stringify(size)}`;
        const r = await run({ style, ...size, foldPreview: 0, handHoles: true, window: true, thumbNotch: true });
        expect(has(r, /run into each other/), label).toBe(false);
        const m = await solid(r.parts[0]!);
        expect(m.decompose().length, label).toBe(style === 'tray-lid' ? 2 : 1);
        expect(box(r.parts[0]!).max[2]).toBeCloseTo(sheetOf(base).t, 6);
      }
    }
  });

  it('thins only along the folds', async () => {
    const { t, hinge, groove } = sheetOf(base);
    const m = await solid((await run({ foldPreview: 0 })).parts[0]!);
    const lost = m.slice(hinge / 2).area() - m.slice((hinge + t) / 2).area();
    const net = buildNet(netOptions(base));
    const len = net.panels.filter((q: Panel) => q.hinge).reduce((s, q) => s + Math.hypot(q.hinge![2] - q.hinge![0], q.hinge![3] - q.hinge![1]), 0);
    expect(lost).toBeGreaterThan(len * groove * 0.9);
    expect(lost).toBeLessThan(len * groove * 1.05);
  });

  it('inlays a logo in the first layer and previews the folded box', async () => {
    const r = await run({ art: 'symbol', symbol: 'tabler:heart' });
    expect(r.parts.map((p) => p.name)).toEqual(['Sheet', 'Logo', 'Folded box (preview)', 'Logo (preview)']);
    expect(box(r.parts[1]!).max[2]).toBeCloseTo(base.layerHeight, 6);
    expect(r.parts[2]!.role).toBe('preview');
    expect(has(await run({ art: 'symbol', symbol: 'tabler:heart', artSize: 200 }), /trimmed/)).toBe(true);
  });

  it('takes outside sizes', () => {
    const o = netOptions({ ...base, sizeBasis: 'outside', length: 100, width: 70, height: 35 });
    const a = allowance(o.t);
    expect(o.L + a.L).toBeCloseTo(100, 6);
    expect(o.W + a.W).toBeCloseTo(70, 6);
    expect(o.H + a.H).toBeCloseTo(35, 6);
  });
});
