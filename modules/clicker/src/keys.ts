/**
 * Which keys a clicker has, where they sit, and what is printed on each.
 *
 * Letter blocks read one key per character of their text. Rows of keys are separated by "/",
 * a space is a key with nothing on it, and in a Custom layout "." leaves a gap with no key. A
 * symbol goes on a key as its name between colons, ":heart:" or ":arrow-big-up:" (any of the
 * bundled symbols). The other designs take a count of keys and put the same picture, or a
 * comma-separated legend each, on them.
 */
import type { Params } from './types';

export type Legend = { kind: 'text'; value: string } | { kind: 'symbol'; id: string } | { kind: 'blank' };

export interface KeyCell {
  /** Column and row in a grid, row 0 at the top; half columns for the inverted T. */
  col: number;
  row: number;
  legend: Legend;
}

export const MAX_KEYS = 24;

/** Text to keys: one per character, ":name:" a symbol, by line ("/" separates lines). */
export function tokens(line: string): Legend[] {
  const out: Legend[] = [];
  const chars = [...line];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (c === ':') {
      const end = chars.indexOf(':', i + 1);
      const name = end > i + 1 ? chars.slice(i + 1, end).join('') : '';
      if (/^[\w-]+(:[\w-]+)?$/.test(name)) {
        out.push({ kind: 'symbol', id: name.includes(':') ? name : `tabler:${name}` });
        i = end;
        continue;
      }
    }
    out.push(c === ' ' ? { kind: 'blank' } : c === '.' ? { kind: 'text', value: '\u0000' } : { kind: 'text', value: c });
  }
  return out;
}

const isGap = (l: Legend) => l.kind === 'text' && l.value === '\u0000';

/** The keys of a letter-block clicker. */
export function blockCells(p: Pick<Params, 'blockText' | 'layout'>): KeyCell[] {
  const lines = p.blockText.split('/').map(tokens);
  // In a row or a column every key shows something: spaces are dropped, "." is printed.
  const all = lines
    .flat()
    .filter((l) => l.kind !== 'blank')
    .map((l): Legend => (isGap(l) ? { kind: 'text', value: '.' } : l));
  let cells: KeyCell[] = [];
  switch (p.layout) {
    case 'column':
      cells = all.map((legend, i) => ({ col: 0, row: i, legend }));
      break;
    case 'wasd':
    case 'arrows':
      cells = invertedT((i) => all[i] ?? { kind: 'blank' });
      break;
    case 'grid':
    case 'custom': {
      const cols = Math.max(1, ...lines.map((l) => l.length));
      lines.forEach((line, row) => {
        for (let col = 0; col < cols; col++) {
          const legend = line[col] ?? { kind: 'blank' };
          if (isGap(legend)) {
            // "." is a gap in a custom layout, a printed full stop elsewhere.
            if (p.layout === 'custom') continue;
            cells.push({ col, row, legend: { kind: 'text', value: '.' } });
          } else cells.push({ col, row, legend });
        }
      });
      break;
    }
    default:
      cells = all.map((legend, i) => ({ col: i, row: 0, legend }));
  }
  if (!cells.length) cells = [{ col: 0, row: 0, legend: { kind: 'blank' } }];
  return cells.slice(0, MAX_KEYS);
}

/** One key over the middle of a row of three. */
function invertedT(legend: (i: number) => Legend): KeyCell[] {
  return [
    { col: 1, row: 0, legend: legend(0) },
    { col: 0, row: 1, legend: legend(1) },
    { col: 1, row: 1, legend: legend(2) },
    { col: 2, row: 1, legend: legend(3) },
  ];
}

/** The keys of the other designs: a count, laid out; `legend(i)` says what goes on key i. */
export function countCells(p: Pick<Params, 'keys' | 'layout' | 'columns'>, legend: (i: number) => Legend): KeyCell[] {
  if (p.layout === 'wasd' || p.layout === 'arrows') return invertedT(legend);
  const n = Math.max(1, Math.min(MAX_KEYS, Math.round(p.keys)));
  const cols = n === 1 || p.layout === 'row' ? n : p.layout === 'column' ? 1 : Math.max(1, Math.min(n, Math.round(p.columns)));
  return Array.from({ length: n }, (_, i) => ({ col: i % cols, row: Math.floor(i / cols), legend: legend(i) }));
}

/** Key centres, mm, for keys `w` × `h` with `gap` between them, the layout centred. */
export function centresOf(cells: KeyCell[], w: number, h: number, gap: number): [number, number][] {
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const rows = Math.max(...cells.map((c) => c.row)) + 1;
  return cells.map((c) => [(c.col - (cols - 1) / 2) * (w + gap), ((rows - 1) / 2 - c.row) * (h + gap)]);
}
