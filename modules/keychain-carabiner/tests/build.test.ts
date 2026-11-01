import { defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build, pipPlan } from '../src/build';
import { SHAPE_IDS, shapeOutline } from '../src/shapes';
import { bounds, rectSize, signedArea } from '@pf/shapes';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });
const has = (r: BuildResult, re: RegExp) => (r.diagnostics ?? []).some((d) => re.test(d.message));
async function solidCount(p: Part): Promise<number> {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  const m = wasm.Manifold.ofMesh(mesh);
  expect(m.status()).toBe('NoError');
  return m.decompose().length;
}

describe('shapes', () => {
  it.each(SHAPE_IDS)('%s is normalised and counter-clockwise', (id) => {
    const c = shapeOutline(id);
    const r = rectSize(bounds(c));
    expect(Math.max(r.width, r.height)).toBeCloseTo(1, 6);
    expect(Math.abs(r.cx) + Math.abs(r.cy)).toBeLessThan(1e-6);
    expect(signedArea(c)).toBeGreaterThan(0);
  });
});

describe('hook', () => {
  it('the gate splits the band but the hook stays one piece', async () => {
    const r = await run({ attach: 'loop', icon: '', linkCount: 0, connectorRings: 0 });
    const hook = r.parts.find((p) => p.name === 'Hook')!;
    expect(await solidCount(hook)).toBe(1);
    const b = partBounds([hook]);
    expect(b.max[2] - b.min[2]).toBeCloseTo(base.hookThick, 4);
  });

  it('the swivel is a separate captive body; thin hooks fall back to a loop', async () => {
    const r = await run({ icon: '' });
    const swivel = r.parts.find((p) => p.name === 'Swivel')!;
    expect(swivel).toBeTruthy();
    expect(swivel.group).toBe('Hook');
    const thin = await run({ hookThick: 3.5, icon: '' });
    expect(thin.parts.some((p) => p.name === 'Swivel')).toBe(false);
    expect(has(thin, /needs the hook at least/)).toBe(true);
  });

  it('puts the symbol in its own colour when asked', async () => {
    const r = await run({ iconSameColor: false, attach: 'loop' });
    const sym = r.parts.find((p) => p.name === 'Hook symbol')!;
    expect(sym.color).toEqual(base.iconColor);
    const raised = await run({ iconSameColor: false, iconRaise: 1, attach: 'loop' });
    expect(partBounds([raised.parts.find((p) => p.name === 'Hook symbol')!]).max[2]).toBeCloseTo(base.hookThick + 1, 3);
  });
});

describe('chain', () => {
  it('open links and connector rings are separate split parts', async () => {
    const r = await run({ linkCount: 3, connectorRings: 2 });
    expect(r.parts.filter((p) => /^Link/.test(p.name))).toHaveLength(3);
    expect(r.parts.filter((p) => /^Connector/.test(p.name))).toHaveLength(2);
    for (const p of r.parts.filter((x) => /^(Link|Connector)/.test(x.name))) expect(await solidCount(p)).toBe(1);
    expect(new Set(r.parts.map((p) => p.group)).size).toBe(6);
  });

  it('print-in-place links alternate wide and narrow and never touch', async () => {
    const plan = pipPlan(base, 0);
    expect(plan.links).toHaveLength(4);
    expect(plan.links[1]!.w).toBeLessThan(plan.links[0]!.w - 2 * plan.bar);
    const r = await run({ chainMode: 'pip', attach: 'loop', icon: '' });
    const links = r.parts.filter((p) => /^Chain link/.test(p.name));
    expect(links).toHaveLength(4);
    // Separate meshes in the hook's object: link 1 fused to the hook, the rest loose.
    for (const l of links) expect(l.group).toBe('Hook');
    const wasm = await loadManifold();
    const solid = (p: Part) => {
      const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
      mesh.merge();
      return wasm.Manifold.ofMesh(mesh);
    };
    for (let i = 0; i + 1 < links.length; i++) expect(solid(links[i]!).intersect(solid(links[i + 1]!)).volume()).toBeLessThan(1e-6);
    expect(() => pipPlan({ ...base, pipLinkSize: 16, pipLinkBar: 4 }, 0)).toThrow(/narrow links/);
  });

  it('a detached print-in-place chain gets its own object and a connector', async () => {
    const r = await run({ chainMode: 'pip', pipAttached: false, attach: 'loop', icon: '' });
    expect(r.parts.filter((p) => p.group === 'Chain')).toHaveLength(4);
    expect(r.parts.filter((p) => /^Connector/.test(p.name)).length).toBe(2);
  });
});

describe('charm', () => {
  it.each(['cut', 'engrave', 'raise'] as const)('symbol %s', async (charmIconStyle) => {
    const r = await run({ charm: true, charmIconStyle, linkCount: 1 });
    expect(r.parts.some((p) => p.name === 'Charm')).toBe(true);
    expect(r.parts.some((p) => p.name === 'Charm symbol')).toBe(charmIconStyle === 'raise');
  });
  it('hangs straight off the swivel', async () => {
    const r = await run({ charm: true, charmMount: 'swivel' });
    expect(r.parts.find((p) => p.name === 'Charm')!.group).toBe('Hook');
    expect(r.parts.some((p) => /^Link/.test(p.name))).toBe(false);
  });
});
