#!/usr/bin/env node
/*
  Starts a new module from tools/module-template.

    pnpm new:module my-thing "My Thing"

  Then: pnpm install, pnpm dev, and open #/m/my-thing.
*/
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [id, name = id?.replace(/(^|-)(\w)/g, (_, s, c) => (s ? ' ' : '') + c.toUpperCase())] = process.argv.slice(2);
if (!id || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id)) {
  console.error('Usage: pnpm new:module <id> ["Name"]   (id: lowercase letters, digits and dashes)');
  process.exit(1);
}
const dest = join(ROOT, 'modules', id);
if (existsSync(dest)) {
  console.error(`modules/${id} already exists.`);
  process.exit(1);
}
cpSync(join(ROOT, 'tools/module-template'), dest, { recursive: true });
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else writeFileSync(p, readFileSync(p, 'utf8').replaceAll('__ID__', id).replaceAll('__NAME__', name));
  }
};
walk(dest);
console.log(`Created modules/${id}. Next: pnpm install && pnpm gen && pnpm dev, then open #/m/${id}.`);
