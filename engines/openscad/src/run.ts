/**
 * One render, the same in the browser and in Node: a fresh OpenSCAD instance (its main()
 * runs only once), the files mounted, the entry rendered to binary STL.
 */
import type { Diagnostic, Part } from '@pf/core';
import { parseStl, place } from './stl';
import type { ScadJob, ScadPlan, ScadProgram, RenderedJob } from './types';

export interface ScadFS {
  mkdir(p: string): void;
  writeFile(p: string, d: string | Uint8Array): void;
  readFile(p: string, o: { encoding: 'binary' }): Uint8Array;
}
export interface ScadInstance {
  FS: ScadFS;
  callMain(args: string[]): number;
}
export type CreateOpenSCAD = (opts: Record<string, unknown>) => Promise<{ getInstance(): ScadInstance }>;

export interface RawRender {
  bytes: Uint8Array | null;
  messages: string[];
  seconds: number;
}

export function mount(FS: ScadFS, files: Record<string, string>): void {
  const made = new Set<string>();
  for (const [p, content] of Object.entries(files)) {
    let cur = '';
    for (const s of p.slice(0, p.lastIndexOf('/')).split('/').filter(Boolean)) {
      cur += '/' + s;
      if (made.has(cur)) continue;
      made.add(cur);
      try {
        FS.mkdir(cur);
      } catch {
        /* there already */
      }
    }
    FS.writeFile(p, content);
  }
}

export async function renderOnce(
  create: CreateOpenSCAD,
  files: Record<string, string>,
  entry: string,
  defines: string[],
  onLine: (text: string) => void = () => {},
): Promise<RawRender> {
  const log: string[] = [];
  const line = (text: string) => {
    log.push(text);
    onLine(text);
  };
  const t0 = performance.now();
  const api = await create({ noInitialRun: true, print: line, printErr: line });
  const inst = api.getInstance();
  mount(inst.FS, files);
  const out = '/out.stl';
  const args = [entry, '--backend=manifold', '-o', out, '--export-format=binstl'];
  for (const d of defines) args.push('-D', d);
  try {
    inst.callMain(args);
  } catch (e) {
    // emscripten throws the exit status when main() returns non-zero
    if (typeof e !== 'number') log.push(`ERROR: ${String(e)}`);
  }
  let bytes: Uint8Array | null = null;
  try {
    bytes = new Uint8Array(inst.FS.readFile(out, { encoding: 'binary' }));
  } catch {
    /* nothing written */
  }
  const messages = log.filter((l) => /WARNING|ERROR|ECHO|DEPRECATED|TRACE/.test(l));
  if (messages.some((l) => /ERROR/.test(l))) bytes = null;
  return { bytes: bytes && bytes.length > 84 ? bytes : null, messages, seconds: (performance.now() - t0) / 1000 };
}

/** OpenSCAD's own words, without the noise: an assert's message, else the first error line. */
export function explain(messages: string[]): string {
  for (const m of messages) {
    const a = /Assertion '.*' failed: "(.*)"/.exec(m);
    if (a) return a[1]!;
  }
  const err = messages.find((m) => /ERROR/.test(m));
  return err ? err.replace(/^ERROR:\s*/, '').replace(/\s*in file .*$/, '') : 'OpenSCAD made no model.';
}

export function toPart(job: ScadJob, bytes: Uint8Array): Part {
  const { positions, indices } = parseStl(bytes);
  if (job.rotate || job.offset) place(positions, job.rotate, job.offset);
  return {
    name: job.name,
    positions,
    indices,
    color: job.color ?? [230, 140, 50],
    ...(job.group ? { group: job.group } : {}),
    ...(job.role ? { role: job.role } : {}),
  };
}

export type JobRenderer = (job: ScadJob) => Promise<{ bytes: Uint8Array | null; messages: string[]; seconds: number; cached: boolean }>;

/** Plans, renders every job in turn, and gathers the parts and what OpenSCAD said. */
export async function runProgram<P>(program: ScadProgram<P>, params: P, inputs: Record<string, unknown>, render: JobRenderer) {
  const plan: ScadPlan = program.plan(params, inputs);
  const diagnostics: Diagnostic[] = [...(plan.diagnostics ?? [])];
  const rendered: RenderedJob[] = [];
  if (!diagnostics.some((d) => d.level === 'error')) {
    for (const job of plan.jobs) {
      const r = await render(job);
      const part = r.bytes ? toPart(job, r.bytes) : null;
      rendered.push({ job, part, messages: r.messages, seconds: r.seconds, cached: r.cached });
      if (!part && !job.optional) diagnostics.push({ level: 'error', message: plan.jobs.length > 1 ? `${job.name}: ${explain(r.messages)}` : explain(r.messages) });
      for (const m of r.messages) {
        const w = /^WARNING:\s*(.*)$/.exec(m);
        if (w && !/deprecated|was assigned on line/i.test(w[1]!)) diagnostics.push({ level: 'warning', message: w[1]!.replace(/\s*in file .*$/, '') });
      }
    }
  }
  let result = { parts: rendered.flatMap((r) => (r.part ? [r.part] : [])), diagnostics, ...(plan.summary ? { summary: plan.summary } : {}) };
  if (program.finish) result = { ...result, ...program.finish(result, params, rendered) };
  return result;
}
