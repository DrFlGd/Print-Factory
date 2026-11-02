import { defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build } from '../src/build';
import { matrix, MODULE, payload } from '../src/qr';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });
const printed = (r: BuildResult) => r.parts.filter((p) => p.role !== 'preview');
const named = (r: BuildResult, n: string) => r.parts.find((p) => p.name === n)!;
async function volume(p: Part) {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  return wasm.Manifold.ofMesh(mesh).volume();
}

describe('business card', () => {
  it('prints a flush card face down, one part per filament, at the size asked', async () => {
    const r = await run();
    expect(printed(r).map((p) => p.name)).toEqual(['Card', 'Lettering', 'Accent']);
    const b = partBounds(printed(r));
    expect(b.max[0] - b.min[0]).toBeCloseTo(85, 3);
    expect(b.max[1] - b.min[1]).toBeCloseTo(55, 3);
    expect(b.min[2]).toBeCloseTo(0, 4);
    expect(b.max[2]).toBeCloseTo(1.4, 4);
    // The lettering lies in the face's first three layers, on the plate.
    expect(partBounds([named(r, 'Lettering')]).min[2]).toBeCloseTo(0, 4);
    expect(r.parts.some((p) => p.role === 'preview' && /front up/.test(p.name))).toBe(true);
  });

  it('stands raised lettering on a card printed face up', async () => {
    const r = await run({ raised: true, raise: 0.6, twoSided: false, logoMode: 'none', qr: false });
    expect(partBounds([named(r, 'Lettering')]).max[2]).toBeCloseTo(2.0, 4);
    expect(partBounds([named(r, 'Lettering')]).min[2]).toBeCloseTo(1.4, 4);
    expect(r.diagnostics?.some((d) => /filament change at 1\.40 mm/.test(d.message))).toBe(true);
  });

  it('cuts a window and a lattice right through the card', async () => {
    const plain = await volume(named(await run({ template: 'band', patternMode: 'colour' }), 'Card'));
    const cut = await volume(named(await run({ template: 'band', patternMode: 'cut', pattern: 'hexagons' }), 'Card'));
    expect(cut).toBeLessThan(plain * 0.95);
    const w = await run({ template: 'window' });
    const all = (await Promise.all(printed(w).map(volume))).reduce((a, b) => a + b, 0);
    expect(all).toBeLessThan(85 * 55 * 1.4 - Math.PI * 8.5 ** 2 * 1.4 + 1);
  });

  it('makes a pocket for the NFC tag and says where to pause', async () => {
    const r = await run({ template: 'tap', nfcTag: '25c' });
    const b = partBounds(printed(r));
    // A 1 mm coin needs 0.6 mm over and under it (and its pocket rounds up to whole layers).
    expect(b.max[2]).toBeCloseTo(2.4, 4);
    expect(r.diagnostics?.some((d) => /NFC: add a pause at 1\.80 mm/.test(d.message))).toBe(true);
  });

  it('keeps the pocket clear of the window', async () => {
    const r = await run({ template: 'window', nfc: true, nfcMark: false });
    expect(r.diagnostics?.some((d) => /no room for a/.test(d.message))).toBe(false);
    expect(r.diagnostics?.some((d) => /NFC: add a pause/.test(d.message))).toBe(true);
  });

  it('says when a design has no room for the code on a one-sided card', async () => {
    const r = await run({ template: 'sash', twoSided: false });
    expect(r.diagnostics?.some((d) => /no room for the QR code/.test(d.message))).toBe(true);
  });
});

describe('qr', () => {
  it('opens the website, or saves the contact', () => {
    expect(payload({ ...base, qrKind: 'website' })).toBe('https://smithstudio.com');
    const v = payload({ ...base, qrKind: 'contact' });
    expect(v).toContain('BEGIN:VCARD');
    expect(v).toContain('N:Smith;John;;;');
    expect(v).toContain('EMAIL:john@smithstudio.com');
    expect(payload({ ...base, qrKind: 'link', qrLink: 'example.org/x' })).toBe('https://example.org/x');
    // A contact code is bigger than a website one.
    expect(matrix(v, false).n).toBeGreaterThan(matrix('https://smithstudio.com', false).n);
    expect(MODULE).toBeGreaterThanOrEqual(0.7);
  });
});
