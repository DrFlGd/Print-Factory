#!/usr/bin/env node
/*
  Finds every module in modules/*, checks its manifest, and writes:

    apps/hub/src/registry.generated.ts   the hub's module list (each loads on demand)
    generator-library.json               the Generator Library collection: the hub and one
                                         card per module, built from source

    node tools/gen-registry.mjs           write both
    node tools/gen-registry.mjs --check   fail if either is out of date (CI)

  Full schema validation (parameters, presets) is in tools/tests/modules.test.ts.
*/
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');
const REPO = 'DrFlGd/Print-Factory';

const ids = readdirSync(join(ROOT, 'modules'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'modules', d.name, 'module.json')))
  .map((d) => d.name)
  .sort();

const problems = [];
const manifests = ids.map((dir) => {
  const m = JSON.parse(readFileSync(join(ROOT, 'modules', dir, 'module.json'), 'utf8'));
  if (m.id !== dir) problems.push(`modules/${dir}: id "${m.id}" must match the folder name`);
  for (const k of ['name', 'summary', 'version', 'engine', 'process', 'exports']) if (!m[k]) problems.push(`modules/${dir}: module.json has no ${k}`);
  for (const f of ['params.json', 'README.md', 'src/index.ts']) if (!existsSync(join(ROOT, 'modules', dir, f))) problems.push(`modules/${dir}: missing ${f}`);
  return { dir, m, thumb: existsSync(join(ROOT, 'modules', dir, 'thumbnail.png')) };
});
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const registry = `// Written by tools/gen-registry.mjs. Do not edit; run \`pnpm gen\`.
import type { ModuleEntry } from '@pf/hub';
${manifests.map(({ dir, thumb }, i) => (thumb ? `import thumb${i} from '../../../modules/${dir}/thumbnail.png';\n` : '')).join('')}
export const modules: ModuleEntry[] = [
${manifests
  .map(
    ({ dir, m, thumb }, i) =>
      `  {\n    manifest: ${JSON.stringify(m)},\n    load: () => import('../../../modules/${dir}/src/index'),${thumb ? `\n    thumbnail: thumb${i},` : ''}\n  },`,
  )
  .join('\n')}
];
`;

const build = { output: 'dist', steps: [['npm', 'run', 'build']] };
const source = (entry) => ({ kind: 'bundle', label: 'Build from source', from: { type: 'repo', repo: REPO }, entry, build });
const release = (entry) => ({ kind: 'bundle', label: 'Install release', from: { type: 'release', tag: 'web-*', asset: 'print-factory-web-*.zip' }, entry });
const collection = {
  $schema: 'https://raw.githubusercontent.com/DrFlGd/Generator-Library/main/schema/collection.schema.json',
  id: 'print-factory',
  name: 'Print Factory',
  repo: REPO,
  defaults: { license: 'MIT', author: 'Jerred', tags: ['print-factory'], pricing: 'free', openSource: true },
  generators: [
    {
      id: 'print-factory',
      name: 'Print Factory',
      summary: `All ${manifests.length} Print Factory generators in one app.`,
      process: 'tool',
      category: 'collections',
      icon: 'apps/hub/public/favicon.svg',
      distributions: [source('index.html'), release('index.html')],
    },
    ...manifests.map(({ dir, m, thumb }) => {
      const g = {
        id: `pf-${m.id}`,
        name: m.name,
        version: m.version,
        summary: m.summary,
        process: m.process,
        exports: m.exports.filter((f) => f !== 'zip'),
        distributions: [source(`index.html#/m/${m.id}`), release(`index.html#/m/${m.id}`)],
      };
      if (m.description) g.description = m.description;
      if (m.category) g.category = m.category;
      if (m.tags?.length) g.tags = m.tags;
      if (m.license) g.license = m.license;
      if (m.supersedes?.length) g.supersedes = m.supersedes;
      if (thumb) g.icon = `modules/${dir}/thumbnail.png`;
      return g;
    }),
  ],
};
const json = JSON.stringify(collection, null, 2) + '\n';

const outputs = [
  [join(ROOT, 'apps/hub/src/registry.generated.ts'), registry],
  [join(ROOT, 'generator-library.json'), json],
];
let stale = false;
for (const [file, text] of outputs) {
  const old = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (old === text) continue;
  if (check) {
    console.error(`${file.slice(ROOT.length)} is out of date: run pnpm gen`);
    stale = true;
  } else writeFileSync(file, text);
}
if (stale) process.exit(1);
console.log(`${manifests.length} module${manifests.length === 1 ? '' : 's'}: ${manifests.map((x) => x.m.id).join(', ')}`);
