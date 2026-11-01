import { boundsSize, defaults, partBounds } from '@pf/core';
import type { BuildResult, ParamSchema } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { describe, expect, it } from 'vitest';
import params from '../params.json';
import presets from '../presets.json';
import type { Params } from '../src/build';
import { build, ICONS, screwSize } from '../src/build';

const base = defaults(params as ParamSchema) as unknown as Params;
const run = async (over: Partial<Params> = {}): Promise<BuildResult> => runBuild(await loadManifold(), build, { ...base, ...over });
const preset = (id: string) => presets.find((p) => p.id === id)!.values as Partial<Params>;
const round = (v: number[]) => v.map((n) => Math.round(n * 100) / 100);

describe('bin label', () => {
  it('is the size of the Gridfinity label slot, the text on top', async () => {
    for (const [size, w] of [['pred-1', 36], ['pred-2', 78], ['pred-3', 120]] as const) {
      const r = await run({ size });
      const label = r.parts.find((p) => p.name === 'Label')!;
      expect(round(boundsSize(partBounds([label])))).toEqual([w, 11.5, 0.8]);
      expect(round(boundsSize(partBounds(r.parts)))[2]).toBe(1.2);
    }
  });

  it('keeps the icon and text inside the label', async () => {
    for (const icon of ICONS) {
      const r = await run({ icon, size: 'pred-1' });
      const text = r.parts.find((p) => p.name === 'Text');
      expect(text, icon).toBeTruthy();
      const b = partBounds([text!]);
      expect(b.min[0]).toBeGreaterThanOrEqual(-18);
      expect(b.max[0]).toBeLessThanOrEqual(18);
      expect(b.max[1] - b.min[1]).toBeLessThanOrEqual(11.5);
    }
  });

  it('makes one label per line, splitting each at the bar', async () => {
    const r = await run(preset('nuts'));
    expect(r.parts.filter((p) => p.name.startsWith('Label '))).toHaveLength(5);
    expect(new Set(r.parts.map((p) => p.group)).size).toBe(5);
  });

  it('reads a screw size from the text', () => {
    expect(screwSize('M3 x 12')).toEqual([3, 12]);
    expect(screwSize('m2.5×8 button')).toEqual([2.5, 8]);
    expect(screwSize('Washers')).toBeNull();
  });

  it('draws a longer screw for a longer size', async () => {
    const right = async (text: string) => {
      const r = await run({ text, line2: 'screw', icon: 'none', size: 'pred-3' });
      return partBounds(r.parts.filter((p) => p.name === 'Text')).max[0];
    };
    expect(await right('M3 x 30')).toBeGreaterThan((await right('M3 x 6')) + 5);
  });

  it('caps the depth of engraved text', async () => {
    const r = await run({ style: 'engraved', depth: 2 });
    expect(r.parts).toHaveLength(1);
    expect(r.diagnostics?.some((d) => d.level === 'warning')).toBe(true);
  });
});
