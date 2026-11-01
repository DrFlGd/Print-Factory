import { readFileSync, writeFileSync } from 'node:fs';
import type { EnumParam, Param, ParamSchema } from '@pf/core';
import { validateSchema } from '@pf/core';
import { describe, expect, it } from 'vitest';
import { DESIGN_INFO, RING_FIELDS } from '../src/catalog';
import { DESIGNS } from '../src/registry';

const file = new URL('../params.json', import.meta.url);

/** params.json with the design menu and the design conditions rebuilt from the catalogue. */
function generated(current: ParamSchema): ParamSchema {
  const any = (ids: string[]) => ids.map((id) => `design == '${id}'`).join(' || ');
  const parameters = current.parameters.map((p): Param => {
    if (p.name === 'design') return { ...(p as EnumParam), options: DESIGN_INFO.map((d) => ({ value: d.id, label: d.label, description: d.description })) };
    const users = DESIGN_INFO.filter((d) => d.uses.includes(p.name)).map((d) => d.id);
    if (!users.length) return p;
    let showIf = any(users);
    if (RING_FIELDS.includes(p.name)) {
      const ringed = users.filter((id) => DESIGN_INFO.find((d) => d.id === id)!.uses.includes('ring'));
      const plain = users.filter((id) => !ringed.includes(id));
      showIf = [ringed.length ? `((${any(ringed)}) && ring != 'none')` : '', plain.length ? any(plain) : ''].filter(Boolean).join(' || ');
    }
    return { ...p, showIf };
  });
  return { ...current, parameters };
}

describe('the form', () => {
  it('matches the design catalogue (LS_PARAMS=write rewrites params.json)', () => {
    const current = JSON.parse(readFileSync(file, 'utf8')) as ParamSchema;
    const want = generated(current);
    if (process.env.LS_PARAMS === 'write') writeFileSync(file, JSON.stringify(want, null, 1) + '\n');
    expect(current).toEqual(want);
    expect(validateSchema(want)).toEqual([]);
  });

  it('has a design for every menu entry and a menu entry for every design', () => {
    expect(DESIGN_INFO.map((d) => d.id).sort()).toEqual(Object.keys(DESIGNS).sort());
    const names = new Set((JSON.parse(readFileSync(file, 'utf8')) as ParamSchema).parameters.map((p) => p.name));
    for (const d of DESIGN_INFO) for (const u of d.uses) expect(names.has(u), `${d.id} uses ${u}`).toBe(true);
  });
});
