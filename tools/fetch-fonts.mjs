#!/usr/bin/env node
/*
  Downloads the bundled fonts from the Google Fonts repository into packages/text/fonts/,
  with each family's licence, and writes packages/text/src/catalog.json.

    node tools/fetch-fonts.mjs          # fetch what is missing
    node tools/fetch-fonts.mjs --force  # fetch everything again

  Variable fonts are cut into static instances at the weights listed (their default
  instance is often Thin or Light, which is useless for printed text). That step needs
  fontTools: pip install fonttools.

  Every family here is under the SIL Open Font License 1.1 (or Apache 2.0 where noted in
  the catalogue), which allows bundling and redistribution with the licence text. Fonts
  are committed so builds and the offline app need no network.

  To add a family: append it to FAMILIES as [directory in google/fonts/ofl, category,
  weights to keep], run this, commit the .ttf, the licence and catalog.json.
*/
import { mkdirSync, writeFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'packages/text/fonts');
const LIC = join(OUT, 'licenses');
const CATALOG = join(ROOT, 'packages/text/src/catalog.json');
const BASE = 'https://raw.githubusercontent.com/google/fonts/main';
const force = process.argv.includes('--force');

// [directory, category, weights wanted (static families), sign-ready?]
const FAMILIES = [
  ['ofl/montserrat', 'sans', [400, 700, 900], true],
  ['ofl/poppins', 'sans', [400, 700, 900], true],
  ['ofl/inter', 'sans', [400], true],
  ['ofl/rubik', 'sans', [400], true],
  ['ofl/nunito', 'rounded', [400], false],
  ['ofl/quicksand', 'rounded', [400], false],
  ['ofl/fredoka', 'rounded', [400], true],
  ['ofl/varelaround', 'rounded', [400], false],
  ['ofl/comfortaa', 'rounded', [400], false],
  ['ofl/baloo2', 'rounded', [400], true],
  ['ofl/oswald', 'condensed', [400], true],
  ['ofl/bebasneue', 'condensed', [400], true],
  ['ofl/anton', 'condensed', [400], true],
  ['ofl/teko', 'condensed', [400], false],
  ['ofl/staatliches', 'condensed', [400], true],
  ['ofl/archivoblack', 'display', [400], true],
  ['ofl/lilitaone', 'display', [400], true],
  ['apache/luckiestguy', 'display', [400], true],
  ['ofl/bangers', 'display', [400], false],
  ['ofl/righteous', 'display', [400], true],
  ['ofl/russoone', 'display', [400], true],
  ['ofl/titanone', 'display', [400], true],
  ['ofl/bungee', 'display', [400], true],
  ['ofl/shrikhand', 'display', [400], false],
  ['ofl/alfaslabone', 'serif', [400], true],
  ['ofl/abrilfatface', 'serif', [400], false],
  ['apache/ultra', 'serif', [400], true],
  ['apache/robotoslab', 'serif', [400], true],
  ['ofl/playfairdisplay', 'serif', [400], false],
  ['ofl/cinzel', 'serif', [400], true],
  ['ofl/blackopsone', 'stencil', [400], true],
  ['ofl/stardosstencil', 'stencil', [400, 700], true],
  ['ofl/allertastencil', 'stencil', [400], true],
  ['ofl/orbitron', 'tech', [400], true],
  ['ofl/audiowide', 'tech', [400], true],
  ['ofl/chakrapetch', 'tech', [400, 700], true],
  ['ofl/pressstart2p', 'pixel', [400], false],
  ['ofl/silkscreen', 'pixel', [400, 700], false],
  ['ofl/vt323', 'pixel', [400], false],
  ['ofl/pacifico', 'script', [400], false],
  ['ofl/lobster', 'script', [400], false],
  ['ofl/dancingscript', 'script', [400], false],
  ['ofl/greatvibes', 'script', [400], false],
  ['ofl/sacramento', 'script', [400], false],
  ['apache/satisfy', 'script', [400], false],
  ['ofl/kaushanscript', 'script', [400], false],
  ['apache/permanentmarker', 'handwriting', [400], false],
  ['ofl/caveat', 'handwriting', [400], false],
  ['ofl/amaticsc', 'handwriting', [400, 700], false],
  ['ofl/gloriahallelujah', 'handwriting', [400], false],
  ['apache/specialelite', 'typewriter', [400], false],
  ['ofl/spacemono', 'mono', [400, 700], false],
  ['ofl/creepster', 'novelty', [400], false],
  ['ofl/monoton', 'novelty', [400], false],
  ['ofl/notosans', 'sans', [400], false],
];

function parseMetadata(pb) {
  const name = /^name:\s*"([^"]+)"/m.exec(pb)?.[1];
  const fonts = [...pb.matchAll(/fonts\s*\{([\s\S]*?)\n\}/g)].map((m) => ({
    style: /style:\s*"([^"]+)"/.exec(m[1])?.[1],
    weight: Number(/weight:\s*(\d+)/.exec(m[1])?.[1]),
    filename: /filename:\s*"([^"]+)"/.exec(m[1])?.[1],
    fullName: /full_name:\s*"([^"]+)"/.exec(m[1])?.[1],
  }));
  const subsets = [...pb.matchAll(/^subsets:\s*"([^"]+)"/gm)].map((m) => m[1]);
  const license = /^license:\s*"([^"]+)"/m.exec(pb)?.[1];
  const axes = [...pb.matchAll(/axes\s*\{[\s\S]*?tag:\s*"([^"]+)"[\s\S]*?\}/g)].map((m) => m[1]);
  return { name, fonts, subsets, license, axes, raw: pb };
}

async function get(url, binary = false) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url);
    if (res.ok) return binary ? new Uint8Array(await res.arrayBuffer()) : res.text();
    if (res.status === 404) throw new Error(`404 ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
  throw new Error(`failed ${url}`);
}

function wghtRange(meta) {
  const m = /axes\s*\{\s*tag:\s*"wght"\s*min_value:\s*([\d.]+)\s*max_value:\s*([\d.]+)/.exec(meta.raw);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Cuts a static instance out of a variable font: wght as given, every other axis at its default. */
function instance(bytes, wght, dest) {
  const dir = mkdtempSync(join(tmpdir(), 'pf-font-'));
  const src = join(dir, 'in.ttf');
  writeFileSync(src, bytes);
  const args = ['-m', 'fontTools.varLib.instancer', src, '--static', '-q', '-o', dest];
  if (wght != null) args.splice(3, 0, `wght=${wght}`);
  execFileSync('python3', args, { stdio: 'inherit' });
  rmSync(dir, { recursive: true, force: true });
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

mkdirSync(LIC, { recursive: true });
const catalog = [];
for (const [dir, category, weights, sign] of FAMILIES) {
  let meta;
  try {
    meta = parseMetadata(await get(`${BASE}/${dir}/METADATA.pb`));
  } catch (e) {
    console.warn(`skipped ${dir}: ${e.message}`);
    continue;
  }
  const licName = meta.license === 'APACHE2' ? 'LICENSE.txt' : meta.license === 'UFL' ? 'UFL.txt' : 'OFL.txt';
  const licFile = join(LIC, `${slug(meta.name)}.txt`);
  if (force || !existsSync(licFile)) writeFileSync(licFile, await get(`${BASE}/${dir}/${licName}`));
  const variable = meta.fonts.some((f) => /\[/.test(f.filename));
  const normal = meta.fonts.filter((f) => f.style === 'normal');
  const jobs = [];
  if (variable) {
    const vf = normal[0];
    const range = /wght/.test(vf.filename) ? wghtRange(meta) : null;
    const wanted = range ? [...new Set(weights.map((w) => Math.min(range[1], Math.max(range[0], w))))] : [400];
    for (const w of wanted) jobs.push({ weight: w, src: vf.filename, instance: range ? w : null });
  } else {
    for (const w of weights) {
      const f = normal.find((x) => x.weight === w);
      if (f) jobs.push({ weight: w, src: f.filename, instance: null });
    }
  }
  for (const job of jobs) {
    const weight = job.weight;
    const id = slug(meta.name) + (weight === 400 ? '' : `-${weight}`);
    const file = `${id}.ttf`;
    const dest = join(OUT, file);
    if (force || !existsSync(dest)) {
      process.stdout.write(`${id} … `);
      const bytes = await get(`${BASE}/${dir}/${encodeURIComponent(job.src).replace(/%5B/g, '[').replace(/%5D/g, ']').replace(/%2C/g, ',')}`, true);
      if (variable) instance(bytes, job.instance, dest);
      else writeFileSync(dest, bytes);
      console.log('ok');
    }
    catalog.push({
      id,
      family: meta.name,
      label: weight === 400 ? meta.name : `${meta.name} ${weight === 700 ? 'Bold' : weight === 900 ? 'Black' : weight}`,
      weight,
      category,
      sign: Boolean(sign),
      scripts: meta.subsets.filter((s) => s !== 'menu'),
      file,
      license: meta.license === 'APACHE2' ? 'Apache-2.0' : 'OFL-1.1',
      licenseFile: `licenses/${slug(meta.name)}.txt`,
      source: `https://github.com/google/fonts/tree/main/${dir}`,
    });
  }
}
writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + '\n');
console.log(`${catalog.length} fonts in the catalogue`);
