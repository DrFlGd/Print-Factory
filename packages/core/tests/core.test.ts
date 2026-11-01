import { describe, expect, it } from 'vitest';
import {
  applyPreset,
  clampNumber,
  coerceValues,
  defaults,
  diffFromDefaults,
  evaluate,
  grouped,
  hexToRgb,
  identifiers,
  isVisible,
  labelOf,
  partBounds,
  boundsSize,
  rgbToHex,
  validateManifest,
  validateSchema,
  type ParamSchema,
} from '../src';

const schema: ParamSchema = {
  groups: ['Shape', 'Colours'],
  parameters: [
    { name: 'width', group: 'Shape', type: 'number', default: 60, min: 20, max: 120, step: 0.5, unit: 'mm' },
    { name: 'count', group: 'Shape', type: 'integer', default: 3, min: 1, max: 8 },
    { name: 'style', group: 'Shape', type: 'enum', default: 'rounded', options: [{ value: 'rounded' }, { value: 'pill' }] },
    { name: 'rim', group: 'Shape', type: 'number', default: 2, min: 0, max: 5, step: 0.1 },
    { name: 'rimColor', group: 'Colours', type: 'color', default: [10, 20, 30], showIf: 'rim > 0' },
    { name: 'label', type: 'string', default: 'Hi', maxLength: 4 },
    { name: 'size', group: 'Shape', type: 'vector', default: [1, 2, 3], min: 0, max: 10 },
    { name: 'flat', group: 'Shape', type: 'boolean', default: false, show_if: "style == 'pill' && !flat" },
  ],
};

describe('expressions', () => {
  it('evaluates precedence, logic and strings', () => {
    expect(evaluate('1 + 2 * 3 == 7', {})).toBe(true);
    expect(evaluate("a > 2 && b == 'x'", { a: 3, b: 'x' })).toBe(true);
    expect(evaluate('!(a || b)', { a: false, b: false })).toBe(true);
    expect(evaluate('-a + 1', { a: 4 })).toBe(-3);
    expect(evaluate('o.k == 1', { o: { k: 1 } })).toBe(true);
  });
  it('rejects malformed input instead of guessing', () => {
    expect(() => evaluate('a >', {})).toThrow(SyntaxError);
    expect(() => evaluate('a ? b : c', {})).toThrow(SyntaxError);
    expect(() => evaluate("'open", {})).toThrow(SyntaxError);
  });
  it('lists identifiers but not string contents', () => {
    expect(identifiers("style == 'two words' && rim > 0")).toEqual(['style', 'rim']);
  });
});

describe('params', () => {
  it('builds defaults and keeps arrays independent', () => {
    const a = defaults(schema);
    const b = defaults(schema);
    (a.size as number[])[0] = 9;
    expect((b.size as number[])[0]).toBe(1);
    expect(a.width).toBe(60);
  });

  it('clamps to range and step without float noise', () => {
    const rim = schema.parameters[3]! as never;
    expect(clampNumber(rim, 0.30000000001)).toBe(0.3);
    expect(clampNumber(rim, 9)).toBe(5);
    expect(clampNumber(schema.parameters[1]! as never, 2.6)).toBe(3);
  });

  it('coerces outside data and drops unknown keys', () => {
    const v = coerceValues(schema, {
      width: '75.2',
      count: 99,
      style: 'nope',
      rimColor: '#ff0080',
      label: 'Hello',
      size: [5, 'x', 20],
      flat: 'true',
      evil: 1,
    });
    expect(v.width).toBe(75);
    expect(v.count).toBe(8);
    expect(v.style).toBe('rounded');
    expect(v.rimColor).toEqual([255, 0, 128]);
    expect(v.label).toBe('Hell');
    expect(v.size).toEqual([5, 2, 10]);
    expect(v.flat).toBe(true);
    expect('evil' in v).toBe(false);
  });

  it('shows fields by condition, including the SCAD Workshop spelling', () => {
    const v = defaults(schema);
    expect(isVisible(schema.parameters[4]!, v)).toBe(true);
    expect(isVisible(schema.parameters[4]!, { ...v, rim: 0 })).toBe(false);
    expect(isVisible(schema.parameters[7]!, v)).toBe(false);
    expect(isVisible(schema.parameters[7]!, { ...v, style: 'pill' })).toBe(true);
  });

  it('diffs and applies presets', () => {
    const v = { ...defaults(schema), width: 80 };
    expect(diffFromDefaults(schema, v)).toEqual({ width: 80 });
    expect(applyPreset(schema, { id: 'p', name: 'P', values: { width: 200 } }).width).toBe(120);
  });

  it('groups in declared order, ungrouped last', () => {
    expect(grouped(schema).map((g) => g.group)).toEqual(['Shape', 'Colours', '']);
  });

  it('labels from names', () => {
    expect(labelOf({ name: 'rimColor', type: 'boolean', default: true })).toBe('Rim Color');
    expect(labelOf({ name: 'hole_size', type: 'boolean', default: true })).toBe('Hole size');
  });

  it('validates schemas', () => {
    expect(validateSchema(schema)).toEqual([]);
    const bad: ParamSchema = {
      parameters: [
        { name: 'a', type: 'number', default: 5, min: 6, max: 9 },
        { name: 'a', type: 'enum', default: 'x', options: [{ value: 'y' }] },
        { name: 'b', type: 'boolean', default: true, showIf: 'ghost > 1' },
        { name: 'c', type: 'boolean', default: true, showIf: 'a >' },
      ],
    };
    expect(validateSchema(bad)).toHaveLength(5);
  });
});

describe('geometry helpers', () => {
  it('measures bounds', () => {
    const b = partBounds([{ positions: new Float32Array([0, 0, 0, 10, 5, 2]) }]);
    expect(boundsSize(b)).toEqual([10, 5, 2]);
  });
  it('converts colours both ways', () => {
    expect(rgbToHex([255, 0, 128])).toBe('#ff0080');
    expect(hexToRgb('#f08')).toEqual([255, 0, 136]);
  });
  it('validates manifests', () => {
    expect(
      validateManifest({ id: 'Bad Id', name: '', summary: 's', version: '1', engine: 'manifold', process: 'laser', exports: [] }),
    ).toHaveLength(4);
  });
});
