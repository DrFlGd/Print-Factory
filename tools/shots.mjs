#!/usr/bin/env node
/*
  Takes each module's gallery thumbnail and its screenshots from the built hub:

    modules/<id>/thumbnail.png        the default model, 16:10, for the gallery card and the
                                      Generator Library icon
    modules/<id>/screenshots/1.jpg    the whole app with the defaults
    modules/<id>/screenshots/2.jpg …  the preview with presets (module.json "screenshots"
                                      lists preset ids; otherwise the first two that change
                                      something)

    pnpm build && pnpm shots [module-id …]   (then pnpm gen to list them)

  Needs Playwright with a Chromium (require('playwright')).
*/
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const require = createRequire(import.meta.url);
const playwright = require('playwright');
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('No build: run pnpm build first.');
  process.exit(2);
}

const THUMB = { width: 480, height: 300 };
const SHOT = { width: 1280, height: 800 };
const PRESET_SHOTS = 2;
const ZOOM = Number(process.env.PF_ZOOM ?? 1.4);

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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });

// A second page to scale images down in, with a canvas.
const scaler = await browser.newPage();

/** Scales a PNG to w × h (cropping to that shape from the middle) and encodes it. */
async function scale(png, w, h, type) {
  const url = await scaler.evaluate(
    async ({ src, w, h, type }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const k = Math.max(w / img.width, h / img.height);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
      return c.toDataURL(type, 0.84);
    },
    { src: `data:image/png;base64,${png.toString('base64')}`, w, h, type },
  );
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

async function waitBuilt(prev) {
  await page.waitForFunction((n) => {
    const s = window.__pf?.mounted?.state;
    return s && !s.building && (s.builds > n || s.error);
  }, prev, { timeout: 90000 });
  return page.evaluate(() => window.__pf.mounted.state.builds);
}

/** The preview alone: no tool buttons, notes or summary over it. */
const BARE = '.pf-stage-tools, .pf-status, .pf-diagnostics { visibility: hidden !important; }';

/** Window sizes: the whole app, and one that makes the preview about 16:10. */
const FULL = { width: 1600, height: 1000 };
const WIDE = { width: 1600, height: 660 };

/** The iso view, closer than the fit: the fit frames the model's bounding sphere, which leaves room round it. */
async function iso(zoom) {
  await page.evaluate((z) => window.__pf.mounted.view('iso', z), zoom);
  await page.waitForTimeout(500);
}

async function stagePng(zoom = ZOOM) {
  await page.setViewportSize(WIDE);
  await page.waitForTimeout(200);
  await iso(zoom);
  const style = await page.addStyleTag({ content: BARE });
  // Clipped from the page: a locator shot waits for the element to stop moving, which an animated preview never does.
  const clip = await page.locator('.pf-stage').boundingBox();
  const png = await page.screenshot({ clip, timeout: 180000 });
  await style.evaluate((n) => n.remove());
  await page.setViewportSize(FULL);
  return png;
}

await page.goto(base);
for (const id of ids) {
  const dir = join(ROOT, 'modules', id);
  const manifest = JSON.parse(readFileSync(join(dir, 'module.json'), 'utf8'));
  const presets = JSON.parse(readFileSync(join(dir, 'presets.json'), 'utf8'));
  const schema = JSON.parse(readFileSync(join(dir, 'params.json'), 'utf8'));
  const defs = Object.fromEntries(schema.parameters.map((q) => [q.name, q.default]));

  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}#/m/${id}`);
  await page.waitForSelector('.pf-app');
  let builds = await waitBuilt(0);
  await page.waitForTimeout(300);

  const shots = join(dir, 'screenshots');
  rmSync(shots, { recursive: true, force: true });
  mkdirSync(shots);
  await iso(1);
  writeFileSync(join(shots, '1.jpg'), await scale(await page.screenshot({ timeout: 180000 }), SHOT.width, SHOT.height, 'image/jpeg'));

  const preset = (pid) => {
    const p = presets.find((x) => x.id === pid);
    if (!p) throw new Error(`${id}: no preset "${pid}"`);
    return p;
  };
  const thumb = manifest.thumbnail ?? {};
  if (thumb.preset) {
    await page.evaluate((v) => window.__pf.mounted.setValues(v), { ...defs, ...preset(thumb.preset).values });
    builds = await waitBuilt(builds);
  }
  writeFileSync(join(dir, 'thumbnail.png'), await scale(await stagePng(thumb.zoom ?? ZOOM), THUMB.width, THUMB.height, 'image/png'));

  const chosen = manifest.screenshots ?? presets.filter((p) => Object.keys(p.values).length).slice(0, PRESET_SHOTS).map((p) => p.id);
  let n = 2;
  for (const pid of chosen) {
    const p = preset(pid);
    await page.evaluate((v) => window.__pf.mounted.setValues(v), { ...defs, ...p.values });
    builds = await waitBuilt(builds);
    writeFileSync(join(shots, `${n++}.jpg`), await scale(await stagePng(), SHOT.width, SHOT.height, 'image/jpeg'));
  }
  console.log(`✓ ${id}: thumbnail and ${n - 1} screenshots`);
}

await browser.close();
server.close();
