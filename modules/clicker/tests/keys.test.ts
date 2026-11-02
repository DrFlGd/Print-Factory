import { defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import type { Params } from '../src/build';
import { build } from '../src/build';
import { blockCells, tokens } from '../src/keys';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, showAssembled: false, ...over });
const caps = (r: BuildResult) => r.parts.filter((p) => /^Cap( \d+)?$/.test(p.name));
const errors = (r: BuildResult) => (r.diagnostics ?? []).filter((d) => d.level !== 'info').map((d) => d.message);

describe('letter block keys', () => {
  it('reads characters, blanks and symbols', () => {
    expect(tokens('A :heart:B')).toEqual([
      { kind: 'text', value: 'A' },
      { kind: 'blank' },
      { kind: 'symbol', id: 'tabler:heart' },
      { kind: 'text', value: 'B' },
    ]);
    expect(tokens('a:b')).toHaveLength(3); // a lone colon is a character
  });

  it('lays out rows, columns, grids, the inverted T and custom maps', () => {
    const at = (text: string, layout: Params['layout']) => blockCells({ blockText: text, layout }).map((c) => [c.col, c.row]);
    expect(at('Name', 'row')).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(at('Hi there', 'row')).toHaveLength(7); // spaces dropped
    expect(at('Hi', 'column')).toEqual([[0, 0], [0, 1]]);
    expect(at('12/3', 'grid')).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]); // the short row filled with a blank key
    expect(at('W/ASD', 'wasd')).toEqual([[1, 0], [0, 1], [1, 1], [2, 1]]);
    expect(at('.W./ASD', 'custom')).toEqual([[1, 0], [0, 1], [1, 1], [2, 1]]);
  });
});

describe('clickers with several keys', () => {
  it('makes a key per letter of a word', async () => {
    const r = await run({ source: 'blocks', blockText: 'Name', size: 20 });
    expect(errors(r)).toEqual([]);
    expect(caps(r)).toHaveLength(4);
    expect(r.parts.filter((p) => /Text$/.test(p.name))).toHaveLength(4);
  });

  it('makes an inverted T for WASD and arrows with symbols', async () => {
    const r = await run({ source: 'blocks', blockText: ':arrow-big-up:/:arrow-big-left::arrow-big-down::arrow-big-right:', layout: 'arrows', size: 20 });
    expect(errors(r)).toEqual([]);
    expect(caps(r)).toHaveLength(4);
    expect(r.parts.filter((p) => /Text$/.test(p.name))).toHaveLength(4);
    const body = partBounds([r.parts.find((p) => p.name === 'Body')!]);
    // Three keys wide, two deep.
    expect(body.max[0] - body.min[0]).toBeGreaterThan(1.4 * (body.max[1] - body.min[1]));
  });

  it('puts an icon on the cap, and says when a symbol is unknown', async () => {
    const r = await run({ source: 'icon', icon: 'tabler:heart' });
    expect(errors(r)).toEqual([]);
    expect(r.parts.some((p) => p.name === 'Text')).toBe(true);
    const bad = await run({ source: 'blocks', blockText: ':no-such-thing:' });
    expect(errors(bad).join(' ')).toMatch(/no symbol called "no-such-thing"/);
  });
});
