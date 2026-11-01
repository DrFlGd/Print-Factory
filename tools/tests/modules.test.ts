/**
 * Every module in modules/ against the contract: manifest, parameter schema, presets,
 * README, and a successful build with its defaults and with every preset (for Manifold
 * modules, in Node). A new module gets all of this without writing a test.
 */
import { applyPreset, defaults, validateManifest, validateSchema } from '@pf/core';
import type { ModuleManifest, ParamSchema, Preset } from '@pf/core';
import { loadManifold, runBuild } from '@pf/engine-manifold/node';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ids = readdirSync(join(ROOT, 'modules')).filter((d) => existsSync(join(ROOT, 'modules', d, 'module.json')));
const json = <T>(id: string, f: string): T => JSON.parse(readFileSync(join(ROOT, 'modules', id, f), 'utf8')) as T;

describe.each(ids)('module %s', (id) => {
  const manifest = json<ModuleManifest>(id, 'module.json');
  const schema = json<ParamSchema>(id, 'params.json');
  const presets = existsSync(join(ROOT, 'modules', id, 'presets.json')) ? json<Preset[]>(id, 'presets.json') : [];

  it('has a valid manifest, schema and presets', () => {
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.id).toBe(id);
    expect(validateSchema(schema)).toEqual([]);
    const names = new Set(schema.parameters.map((p) => p.name));
    for (const p of presets) for (const k of Object.keys(p.values)) expect(names.has(k), `preset ${p.id} sets unknown "${k}"`).toBe(true);
    expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
    expect(readFileSync(join(ROOT, 'modules', id, 'README.md'), 'utf8').length).toBeGreaterThan(200);
  });

  it.runIf(manifest.engine === 'manifold')('builds with its defaults and every preset', async () => {
    const { build } = (await import(`../../modules/${id}/src/build.ts`)) as { build: Parameters<typeof runBuild>[1] };
    const wasm = await loadManifold();
    for (const values of [defaults(schema), ...presets.map((p) => applyPreset(schema, p))]) {
      const r = await runBuild(wasm, build, values);
      expect(r.parts.length + (r.drawing?.layers.length ?? 0)).toBeGreaterThan(0);
      expect((r.diagnostics ?? []).filter((d) => d.level === 'error')).toEqual([]);
    }
  });
});
