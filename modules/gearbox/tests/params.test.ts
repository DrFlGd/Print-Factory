import { readFileSync, writeFileSync } from 'node:fs';
import { validateSchema } from '@pf/core';
import { describe, expect, it } from 'vitest';
import { schema } from '../src/schema';
import { PART_KINDS } from '../src/parts';
import { fieldFor } from '../src/schema';

const file = new URL('../params.json', import.meta.url);

describe('the form', () => {
  it('is what the part table says (GEARBOX_PARAMS=write rewrites params.json)', () => {
    const want = schema();
    if (process.env.GEARBOX_PARAMS === 'write') writeFileSync(file, JSON.stringify(want, null, 1) + '\n');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(want);
  });

  it('parses, and every part parameter has a field', () => {
    const s = schema();
    expect(validateSchema(s)).toEqual([]);
    const names = new Set(s.parameters.map((p) => p.name));
    for (const k of PART_KINDS) for (const d of k.params) if (k.id !== 'assembly') expect(names.has(fieldFor(k.id, d.key)), `${k.id}.${d.key}`).toBe(true);
  });
});
