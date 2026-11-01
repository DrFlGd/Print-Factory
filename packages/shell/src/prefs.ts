/** App-wide preferences: theme, display units, printer bed. Kept in localStorage. */
export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  units: 'mm' | 'in';
  bed: string;
}

const KEY = 'pf:prefs';
const DEFAULTS: Prefs = { theme: 'system', units: 'mm', bed: 'bambu-a1' };
const listeners = new Set<(p: Prefs) => void>();

function read(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return { ...DEFAULTS };
  }
}

let current = read();

export function prefs(): Prefs {
  return current;
}

export function setPrefs(p: Partial<Prefs>): void {
  current = { ...current, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* blocked storage: preferences last for this visit */
  }
  listeners.forEach((cb) => cb(current));
}

export function onPrefs(cb: (p: Prefs) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The effective theme, resolving "system". */
export function themeOf(p: Prefs = current): 'light' | 'dark' {
  if (p.theme !== 'system') return p.theme;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(root: HTMLElement = document.documentElement): void {
  root.dataset.theme = themeOf();
}

export const MM_PER_IN = 25.4;
