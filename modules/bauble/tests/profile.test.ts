import { describe, expect, it } from 'vitest';
import { encodeProfile, legacyProfile, parseProfile, profileRadius } from '../src/profile';
import { outline } from '../src/shapes';

describe('custom bauble node profile', () => {
  const nodes = [[0, 0], [0.2, 0.55], [0.5, 1], [0.78, 0.65], [1, 0]] as [number, number][];

  it('serialises normalized nodes for share links and project files', () => {
    const decoded = parseProfile(encodeProfile(nodes));
    expect(decoded).toEqual(nodes);
    expect(parseProfile('not-json')).toBeNull();
    expect(parseProfile('[[0,0],[0.5,1],[0.4,.5],[1,0]]')).toBeNull();
    expect(parseProfile('[[0,0],[0.5,1],[0.49,0.5],[1,0]]')).toBeNull();
    expect(parseProfile('[[0,0],[0.5,2],[1,0]]')).toBeNull();
    expect(parseProfile('[[0,0],[0.5,1],[1,0.1]]')).toBeNull();
    expect(parseProfile('[[0,0],[1,0]]')).toBeNull();
  });

  it('samples smoothly and stays inside each span without overshooting', () => {
    expect(profileRadius(nodes, 0)).toBe(0);
    expect(profileRadius(nodes, 0.5)).toBe(1);
    expect(profileRadius(nodes, 1)).toBe(0);
    for (let i = 0; i < 100; i++) {
      const u = i / 100;
      const r = profileRadius(nodes, u);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
    const straight = [[0, 0], [0.5, 0.5], [1, 0]] as [number, number][];
    expect(profileRadius(straight, 0.25)).toBeGreaterThan(0);
  });

  it('generates an overhang-limited 3D outline from the edited points', () => {
    const o = outline('custom', 70, 1, 45, 10, 13, 6, { bulge: 0.5, top: 2, bottom: 2, aspect: 1.1, profile: nodes });
    expect(o.rMax).toBeCloseTo(35, 1);
    expect(o.pts[1]).toEqual([5, 0]);
    for (let i = 2; i < o.pts.length - 1; i++) {
      const [r0, z0] = o.pts[i - 1]!, [r1, z1] = o.pts[i]!;
      if (z1 - z0 > 1e-8) expect(Math.abs(r1 - r0) / (z1 - z0)).toBeLessThanOrEqual(1.00001);
    }
  });

  it('preserves a legacy custom shape until nodes are edited', () => {
    const old = legacyProfile(0.35, 1.1, 3);
    expect(old.length).toBe(11);
    expect(old[0]).toEqual([0, 0]);
    expect(old[old.length - 1]).toEqual([1, 0]);
    expect(profileRadius(old, 0.35)).toBeGreaterThan(0.9);
  });
});
