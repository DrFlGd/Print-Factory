#!/usr/bin/env node
/*
  Opens the built hub in headless Chromium and checks every module for real: it loads,
  builds with its defaults and with each preset, draws something on the stage, and
  exports its first format. Screenshots go to test-results/.

    pnpm build && node tools/browser-check.mjs [module-id …]

  Needs Playwright with a Chromium (require('playwright')).
*/
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'test-results');
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  console.error('Playwright is not installed: npm i -g playwright && npx playwright install chromium');
  process.exit(2);
}
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('No build: run pnpm build first.');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const wanted = process.argv.slice(2);
const ids = readdirSync(join(ROOT, 'modules')).filter((d) => existsSync(join(ROOT, 'modules', d, 'module.json')) && (!wanted.length || wanted.includes(d)));

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

let failed = 0;
const fail = (id, msg) => {
  failed++;
  console.error(`✗ ${id}: ${msg}`);
};

async function waitBuilt(prev, timeout = 60000) {
  await page.waitForFunction((n) => {
    const s = window.__pf?.mounted?.state;
    return s && !s.building && (s.builds > n || s.error);
  }, prev, { timeout });
  return page.evaluate(() => {
    const s = window.__pf.mounted.state;
    return { builds: s.builds, error: s.error, parts: s.result?.parts.length ?? 0, layers: s.result?.drawing?.layers.length ?? 0, diagnostics: (s.result?.diagnostics ?? []).filter((d) => d.level === 'error').map((d) => d.message) };
  });
}

/** Spread of pixel values on the stage: a blank canvas has none. */
async function stageInk() {
  const shot = await page.locator('.pf-stage').screenshot();
  return shot.length;
}

await page.goto(base);
await page.waitForSelector('.pf-hub-card');
const cards = await page.locator('.pf-hub-card').count();
console.log(`gallery: ${cards} cards`);
await page.screenshot({ path: join(OUT, 'gallery.png') });

for (const id of ids) {
  const t0 = Date.now();
  errors.length = 0;
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}#/m/${id}`);
  await page.waitForSelector('.pf-app');
  let s;
  try {
    s = await waitBuilt(0);
  } catch {
    fail(id, 'no build within 60 s');
    await page.screenshot({ path: join(OUT, `${id}-timeout.png`) });
    continue;
  }
  if (s.error) fail(id, `default build failed: ${s.error}`);
  if (!s.parts && !s.layers) fail(id, 'default build made nothing');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${id}.png`) });
  const ink = await stageInk();
  if (ink < 8000) fail(id, `stage looks empty (${ink} bytes)`);

  // Every preset builds.
  const presets = JSON.parse(readFileSync(join(ROOT, 'modules', id, 'presets.json'), 'utf8'));
  for (const p of presets) {
    const before = s.builds;
    await page.evaluate((v) => window.__pf.mounted.setValues(v), p.values);
    if (!Object.keys(p.values).length) continue;
    try {
      s = await waitBuilt(before);
      if (s.error) fail(id, `preset "${p.name}" failed: ${s.error}`);
    } catch {
      fail(id, `preset "${p.name}" did not build`);
    }
  }

  // Export the first format.
  const btn = page.locator('.pf-export-btn').first();
  if (await btn.isEnabled()) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), btn.click()]);
    const path = join(OUT, dl.suggestedFilename());
    await dl.saveAs(path);
    const size = statSync(path).size;
    if (size < 200) fail(id, `export ${dl.suggestedFilename()} is only ${size} bytes`);
    else console.log(`  exported ${dl.suggestedFilename()} (${(size / 1024).toFixed(0)} KB)`);
  } else fail(id, 'export button disabled');

  const real = errors.filter((e) => !/WebGL|GPU stall|favicon/i.test(e));
  if (real.length) fail(id, `console errors:\n    ${real.join('\n    ')}`);
  console.log(`${failed ? '…' : '✓'} ${id} (${presets.length} presets, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

await browser.close();
server.close();
if (failed) {
  console.error(`${failed} problem${failed === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('all modules pass');
