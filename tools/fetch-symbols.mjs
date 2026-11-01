#!/usr/bin/env node
/*
  Writes packages/symbols/data/tabler-filled.json from the Tabler Icons npm package
  (MIT, https://tabler.io/icons): every filled icon with its category and search tags.

    node tools/fetch-symbols.mjs [version]
*/
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const version = process.argv[2] ?? '3.35.0';
const dir = mkdtempSync(join(tmpdir(), 'pf-tabler-'));
execFileSync('npm', ['pack', `@tabler/icons@${version}`, '--silent'], { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'] });
execFileSync('tar', ['xzf', `tabler-icons-${version}.tgz`], { cwd: dir });
const pkg = join(dir, 'package');
const nodes = JSON.parse(readFileSync(join(pkg, 'tabler-nodes-filled.json'), 'utf8'));
const meta = JSON.parse(readFileSync(join(pkg, 'icons.json'), 'utf8'));
const attrs = (o) => Object.entries(o).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
const out = Object.entries(nodes)
  .map(([name, list]) => {
    const m = meta[name] ?? {};
    const svg = list.filter(([, a]) => a.fill !== 'none' && a.d !== 'M0 0h24v24H0z').map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('');
    return { id: `tabler:${name}`, name: name.replace(/-/g, ' '), category: m.category || 'Other', tags: m.tags ?? [], svg };
  })
  .filter((s) => s.svg)
  .sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(join(ROOT, 'packages/symbols/data/tabler-filled.json'), JSON.stringify({ source: `@tabler/icons@${version}`, license: 'MIT', viewBox: 24, symbols: out }));
copyFileSync(join(pkg, 'LICENSE'), join(ROOT, 'packages/symbols/data/TABLER-LICENSE.txt'));
rmSync(dir, { recursive: true, force: true });
console.log(`${out.length} symbols`);
