import { defaults } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { bounds, rectSize } from '@pf/shapes';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import presets from '../presets.json';
import type { Params } from '../src/build';
import { build } from '../src/build';
import { jigsawLines } from '../src/designs';

const base = defaults(params as ParamSchema) as unknown as Params;
const preset = (id: string) => presets.find((p) => p.id === id)!.values as Partial<Params>;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });
const errors = (r: BuildResult) => (r.diagnostics ?? []).filter((d) => d.level === 'error').map((d) => d.message);
const layer = (r: BuildResult, op: string) => r.drawing!.layers.find((l) => l.operation === op);

/** How many separate pieces a part's mesh is, and its volume. */
async function solidOf(p: Part) {
  const wasm = await loadManifold();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices });
  mesh.merge();
  const m = wasm.Manifold.ofMesh(mesh);
  return { pieces: m.decompose().length, volume: m.volume(), genus: m.genus() };
}

const cutPieces = (r: BuildResult) => r.parts.filter((p) => p.name !== 'Engraving');

describe('every design', () => {
  it('builds each preset with something to cut and nothing wrong', async () => {
    for (const p of presets) {
      const r = await run(p.values as Partial<Params>);
      expect(errors(r), p.id).toEqual([]);
      expect(layer(r, 'cut')!.contours.length, p.id).toBeGreaterThan(0);
      for (const part of cutPieces(r)) expect((await solidOf(part)).volume, `${p.id} ${part.name}`).toBeGreaterThan(10);
    }
  });

  it('says so when there is nothing to cut', async () => {
    const r = await run({ text: '  ' });
    expect(r.summary).toMatch(/Nothing/);
    expect((r.diagnostics ?? []).some((d) => /Type some text/.test(d.message))).toBe(true);
  });
});

describe('one-piece designs stay in one piece', () => {
  it('connected text, whatever the name and font', async () => {
    for (const [text, font] of [
      ['Grace', 'great-vibes'],
      ['Wilhelmina', 'dancing-script'],
      ['OLIVER', 'montserrat-700'],
      ['Ida Mae', 'pacifico'],
    ] as const) {
      const r = await run({ ...preset('connected'), text, font });
      const parts = cutPieces(r);
      expect(parts).toHaveLength(1);
      expect((await solidOf(parts[0]!)).pieces, `${text} in ${font}`).toBe(1);
    }
  });

  it('keychains, charms and tags, with their holes', async () => {
    for (const id of ['name-keychain', 'paw', 'heart-tag', 'pet', 'pattern', 'qr']) {
      const r = await run(preset(id));
      const s = await solidOf(cutPieces(r)[0]!);
      expect(s.pieces, id).toBe(1);
      expect(s.genus, id).toBeGreaterThanOrEqual(1);
    }
  });

  it('a cake topper with its stakes', async () => {
    for (const stakes of [1, 2]) {
      const r = await run({ ...preset('topper'), stakes, text: 'Happy\nBirthday\nAva' });
      const part = cutPieces(r)[0]!;
      expect((await solidOf(part)).pieces, `${stakes} stakes`).toBe(1);
    }
  });
});

describe('layers', () => {
  it('sits the name of a layered keychain inside its backer, a sheet up', async () => {
    const r = await run(preset('layered'));
    const [backer, name] = cutPieces(r);
    expect(backer!.name).toBe('Backer');
    const bb = rectSize(bounds([Array.from(backer!.positions).filter((_, i) => i % 3 !== 2)]));
    const nb = rectSize(bounds([Array.from(name!.positions).filter((_, i) => i % 3 !== 2)]));
    expect(nb.width).toBeLessThan(bb.width);
    const zOf = (p: Part) => Math.min(...Array.from(p.positions).filter((_, i) => i % 3 === 2));
    expect(zOf(name!) - zOf(backer!)).toBeCloseTo(base.thickness, 6);
    expect(backer!.color).toEqual(preset('layered').color2);
  });

  it('gives a framed ornament two layers that share the hanging hole', async () => {
    const r = await run(preset('ornament'));
    const parts = cutPieces(r);
    expect(parts.map((p) => p.name)).toEqual(['Backer', 'Frame and name']);
    for (const p of parts) expect((await solidOf(p)).pieces, p.name).toBe(1);
  });
});

describe('marks', () => {
  it('keeps lettering on a tag inside the tag, clear of the hole', async () => {
    for (const shape of ['heart', 'circle', 'bone', 'shield', 'star']) {
      const r = await run({ ...preset('heart-tag'), shape, text: 'Persephone' });
      const engrave = layer(r, 'engrave')!;
      const cut = layer(r, 'cut')!;
      const eb = bounds(engrave.contours);
      const outer = cut.contours.reduce((a, c) => (rectSize(bounds(c)).width > rectSize(bounds(a)).width ? c : a));
      const ob = bounds(outer);
      expect(eb.minX, shape).toBeGreaterThan(ob.minX);
      expect(eb.maxX, shape).toBeLessThan(ob.maxX);
      expect(eb.minY, shape).toBeGreaterThan(ob.minY);
      expect(eb.maxY, shape).toBeLessThan(ob.maxY);
    }
  });

  it('bends coaster text round the rim, inside the border', async () => {
    const r = await run(preset('coaster'));
    const e = layer(r, 'engrave')!;
    const b = rectSize(bounds(e.contours));
    const R = (preset('coaster').diameter as number) / 2;
    expect(b.width).toBeLessThan(2 * R);
    expect(b.width).toBeGreaterThan(R);
  });

  it('engraves a QR code of whole modules, warning when they get too small', async () => {
    const r = await run(preset('qr'));
    expect(layer(r, 'engrave')!.contours.length).toBeGreaterThan(20);
    const tiny = await run({ ...preset('qr'), tagWidth: 20, qrData: 'https://example.com/a/very/long/link/that/needs/a/big/code?with=parameters&and=more' });
    expect((tiny.diagnostics ?? []).some((d) => /too small to scan/.test(d.message))).toBe(true);
  });

  it('scores the fold of every place card', async () => {
    const r = await run(preset('cards'));
    expect(cutPieces(r)).toHaveLength(4);
    const folds = layer(r, 'score')!.polylines!.filter((l) => l.length === 4 && Math.abs(l[1]! - l[3]!) < 1e-6);
    expect(folds).toHaveLength(4);
  });
});

describe('jigsaw', () => {
  it('cuts a grid of pieces with knobs', async () => {
    const lines = jigsawLines(150, 100, 5, 4, 22, 1);
    expect(lines).toHaveLength(4 + 3);
    const r = await run(preset('jigsaw'));
    const part = cutPieces(r)[0]!;
    // The 3D view cuts the lines through: every piece comes apart.
    expect((await solidOf(part)).pieces).toBe(20);
    expect(layer(r, 'cut')!.polylines!.length).toBe(7);
  });

  it('keeps its knobs between builds and moves them with Shuffle', () => {
    expect(jigsawLines(100, 100, 3, 3, 22, 7)).toEqual(jigsawLines(100, 100, 3, 3, 22, 7));
    expect(jigsawLines(100, 100, 3, 3, 22, 8)).not.toEqual(jigsawLines(100, 100, 3, 3, 22, 7));
  });
});

describe('sheet', () => {
  it('spreads a long guest list over several sheets', async () => {
    const names = Array.from({ length: 30 }, (_, i) => `Guest ${i + 1}`).join('\n');
    const r = await run({ ...preset('cards'), text: names, sheet: 'a4' });
    expect(errors(r)).toEqual([]);
    expect(r.drawing!.sheets!.length).toBeGreaterThan(2);
  });

  it('says when a piece is larger than the sheet', async () => {
    const r = await run({ ...preset('jigsaw'), puzzleWidth: 500, puzzleHeight: 400, sheet: '300x300' });
    expect(errors(r)[0]).toMatch(/larger than the sheet/);
  });

  it('adds half the kerf round every outline', async () => {
    const area = (r: BuildResult) => {
      const c = layer(r, 'cut')!.contours;
      return c.reduce((a, q) => {
        let s = 0;
        for (let i = 0; i < q.length; i += 2) {
          const j = (i + 2) % q.length;
          s += q[i]! * q[j + 1]! - q[j]! * q[i + 1]!;
        }
        return a + s / 2;
      }, 0);
    };
    const a0 = area(await run({ ...preset('heart-tag'), ring: 'none', kerf: 0 }));
    const a1 = area(await run({ ...preset('heart-tag'), ring: 'none', kerf: 0.2 }));
    // A 50 mm heart's edge is about 160 mm long: 0.1 mm more all round.
    expect(a1 - a0).toBeGreaterThan(10);
    expect(a1 - a0).toBeLessThan(25);
  });
});
