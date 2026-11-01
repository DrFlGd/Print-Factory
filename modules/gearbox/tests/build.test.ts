import { defaults } from '@pf/core';
import type { BuildResult, ParamSchema, Part } from '@pf/core';
import { explain } from '@pf/engine-openscad';
import { renderScad, runScad } from '@pf/engine-openscad/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import presets from '../presets.json';
import { overridesOf, partName, program, type Params } from '../src/program';
import { fitField } from '../src/schema';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = (over: Partial<Params> = {}): Promise<BuildResult> => runScad(program, { ...base, ...over } as Params);
const errors = (r: BuildResult) => (r.diagnostics ?? []).filter((d) => d.level === 'error').map((d) => d.message);
function box(parts: Pick<Part, 'positions'>[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { positions: p } of parts) for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k]!, p[i + k]!)), (max[k] = Math.max(max[k]!, p[i + k]!));
  return { min, max, size: max.map((m, k) => m - min[k]!) };
}
const SLOW = 600_000;

describe('one part', () => {
  it('renders a spacer at the height asked', async () => {
    const r = await run({ part: 'spacer', spacer_h: 5 });
    expect(errors(r)).toEqual([]);
    expect(r.parts).toHaveLength(1);
    expect(box(r.parts).size[2]).toBeCloseTo(5, 2);
    expect(r.parts[0]!.name).toBe('S5-M2');
  }, SLOW);

  it('makes a 20T gear the size GearBox records, in each size', async () => {
    // From catalog/parts.json: G20 is 44 mm across in M2, 33 in M1.5, 22 in M1.
    for (const [size, across] of [['M2', 44], ['M1.5', 33], ['M1', 22]] as const) {
      const r = await run({ part: 'gear', teeth: 20, size });
      expect(errors(r), size).toEqual([]);
      expect(box(r.parts).size[0], size).toBeCloseTo(across, 0);
    }
  }, SLOW);

  it('says when a part is not made in a size, or its options do not go together', async () => {
    expect(errors(await run({ part: 'ratchet', size: 'M1' }))[0]).toMatch(/not made in M1/);
    expect(errors(await run({ part: 'compound', teeth_compound: 40, teeth_upper: 40 }))[0]).toMatch(/fewer teeth/);
  }, SLOW);

  it("passes OpenSCAD's own asserts on in its words", async () => {
    const r = await renderScad(program.files, program.entry, ['part="nonsense"']);
    expect(r.bytes).toBeNull();
    expect(explain(r.messages)).toBe('unknown part: nonsense');
  }, SLOW);
});

describe('fits', () => {
  it('moves a fit from the profile value only when asked', () => {
    expect(overridesOf(base)).toEqual({});
    expect(overridesOf({ ...base, [fitField('bearing_bore_d')]: 0.05 })).toEqual({ bearing_bore_d: 22.2 });
    expect(overridesOf({ ...base, profile: 'PLA', [fitField('bolt_clear')]: -0.1 })).toEqual({ bolt_clear: 0.3 });
  });

  it('opens a spacer bore by the bore clearance', async () => {
    const plain = await run({ part: 'spacer' });
    const loose = await run({ part: 'spacer', [fitField('bore_clear')]: 0.4 });
    const vol = (r: BuildResult) => {
      const { positions: v, indices: t } = r.parts[0]!;
      let s = 0;
      for (let i = 0; i < t.length; i += 3) {
        const [a, b, c] = [t[i]! * 3, t[i + 1]! * 3, t[i + 2]! * 3];
        s += v[a]! * (v[b + 1]! * v[c + 2]! - v[b + 2]! * v[c + 1]!) - v[a + 1]! * (v[b]! * v[c + 2]! - v[b + 2]! * v[c]!) + v[a + 2]! * (v[b]! * v[c + 1]! - v[b + 1]! * v[c]!);
      }
      return s / 6;
    };
    // The clearance is on the diameter: a 3 mm spacer's 8.35 mm bore, 0.2 mm more all
    // round, loses about pi * 8.35 * 0.2 * 3 = 16 mm3.
    expect(vol(plain) - vol(loose)).toBeGreaterThan(12);
    expect(vol(plain) - vol(loose)).toBeLessThan(20);
    expect(box(loose.parts).size[0]).toBeCloseTo(box(plain.parts).size[0]!, 3);
  }, SLOW);
});

describe('kits', () => {
  it('lays every copy of a kit flat on the bed, apart', async () => {
    const r = await run({ mode: 'kit', kit: 'starter', kit_view: 'print' });
    expect(errors(r)).toEqual([]);
    // B4x4, four knobs, four base spacers, two 3 mm spacers, two G20, G40, G60, G60-20
    expect(r.parts).toHaveLength(16);
    expect(new Set(r.parts.map((p) => p.group)).size).toBe(16);
    for (const p of r.parts) expect(box([p]).min[2], p.name).toBeCloseTo(0, 3);
    const boxes = r.parts.map((p) => box([p]));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const apart = a.max[0]! <= b.min[0]! || b.max[0]! <= a.min[0]! || a.max[1]! <= b.min[1]! || b.max[1]! <= a.min[1]!;
        expect(apart, `${r.parts[i]!.name} and ${r.parts[j]!.name}`).toBe(true);
      }
    // Two 124 mm gears and two 85 mm squares do not share a 220 mm bed.
    expect(r.summary).toMatch(/16 parts on 3 beds/);
    expect((r.diagnostics ?? []).some((d) => /Hardware/.test(d.message))).toBe(true);
  }, SLOW);

  it('puts a kit together, printed parts and hardware, as a picture', async () => {
    const r = await run({ mode: 'kit', kit: 'crank', kit_view: 'assembled' });
    expect(errors(r)).toEqual([]);
    expect(r.parts.map((p) => p.name)).toEqual(['Printed parts', 'Hardware']);
    expect(r.parts[1]!.color).not.toEqual(r.parts[0]!.color);
  }, SLOW);

});

describe('presets', () => {
  it('only set fields the form has, and name their files', () => {
    const names = new Set((params as ParamSchema).parameters.map((p) => p.name));
    for (const p of presets) for (const k of Object.keys(p.values)) expect(names.has(k), `${p.id}.${k}`).toBe(true);
    expect(partName({ ...base, part: 'crank', throw_crank: 60 })).toBe('CRANK60');
    expect(partName({ ...base, part: 'tile', tile_nx: 2, tile_ny: 3 })).toBe('B2x3');
  });
});
