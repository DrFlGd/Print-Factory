/**
 * The hub: every module in one app.
 *
 *   #/              the gallery
 *   #/m/<id>        a module
 *   #/m/<id>?s=…    a module with shared settings
 *
 * Modules load on demand (each is its own chunk), so the gallery opens fast however many
 * there are. A separate repo of modules builds its own hub with `createHub` and its own
 * registry; nothing here knows which modules exist.
 */
import type { Host, ModuleDefinition, ModuleManifest } from '@pf/core';
import type { Mounted } from '@pf/shell';
import { applyTheme, browserHost, h, icon, mountModule } from '@pf/shell';

export interface ModuleEntry {
  manifest: ModuleManifest;
  load(): Promise<{ default: ModuleDefinition }>;
  /** URL of a card image. */
  thumbnail?: string;
}

export interface HubOptions {
  title?: string;
  tagline?: string;
  modules: ModuleEntry[];
  host?: Host;
  /** Links shown in the gallery footer. */
  links?: { label: string; href: string }[];
}

const PROCESS_LABELS: Record<string, string> = { '3d-print': '3D print', laser: 'Laser', cnc: 'CNC', tool: 'Tool' };

export interface Route {
  view: 'gallery' | 'module';
  id?: string;
  share?: string;
}

export function parseRoute(hash: string): Route {
  const m = /^#\/m\/([a-z0-9-]+)(?:\?(.*))?$/.exec(hash);
  if (!m) return { view: 'gallery' };
  const share = new URLSearchParams(m[2] ?? '').get('s') ?? undefined;
  return share ? { view: 'module', id: m[1]!, share } : { view: 'module', id: m[1]! };
}

export function createHub(root: HTMLElement, opts: HubOptions): { dispose(): void; readonly mounted: Mounted | null } {
  const host = opts.host ?? browserHost('hub');
  const title = opts.title ?? 'Print Factory';
  let mounted: Mounted | null = null;
  let current = '';
  let query = '';
  let category = '';
  applyTheme();

  function gallery() {
    document.title = title;
    const search = h('input', { type: 'search', class: 'pf-input pf-hub-search', placeholder: 'Search generators', value: query, 'aria-label': 'Search generators' });
    const cats = [...new Set(opts.modules.map((m) => m.manifest.category).filter(Boolean))] as string[];
    const chips = h('div', { class: 'pf-hub-chips', role: 'radiogroup', 'aria-label': 'Category' });
    const grid = h('div', { class: 'pf-hub-grid' });
    const renderChips = () =>
      chips.replaceChildren(
        ...['', ...cats].map((c) =>
          h(
            'button',
            {
              type: 'button',
              class: `pf-seg ${category === c ? 'pf-on' : ''}`,
              onclick: () => {
                category = c;
                renderChips();
                renderGrid();
              },
            },
            c ? c.replace(/-/g, ' ') : 'All',
          ),
        ),
      );
    const renderGrid = () => {
      const q = query.trim().toLowerCase();
      const list = opts.modules.filter(
        (m) =>
          (!category || m.manifest.category === category) &&
          (!q || [m.manifest.name, m.manifest.summary, ...(m.manifest.tags ?? [])].join(' ').toLowerCase().includes(q)),
      );
      grid.replaceChildren(
        ...list.map((m) =>
          h(
            'a',
            { class: 'pf-hub-card', href: `#/m/${m.manifest.id}`, dataset: { id: m.manifest.id } },
            h('div', { class: 'pf-hub-thumb' }, m.thumbnail ? h('img', { src: m.thumbnail, alt: '', loading: 'lazy' }) : icon(m.manifest.process === 'laser' ? 'layers' : 'cube', 40)),
            h(
              'div',
              { class: 'pf-hub-card-body' },
              h('h2', null, m.manifest.name),
              h('p', null, m.manifest.summary),
              h('div', { class: 'pf-hub-tags' }, h('span', { class: 'pf-tag' }, PROCESS_LABELS[m.manifest.process] ?? m.manifest.process), m.manifest.category ? h('span', { class: 'pf-tag' }, m.manifest.category.replace(/-/g, ' ')) : null),
            ),
          ),
        ),
      );
      if (!list.length) grid.append(h('p', { class: 'pf-muted' }, 'No generators match.'));
    };
    search.addEventListener('input', () => {
      query = search.value;
      renderGrid();
    });
    renderChips();
    renderGrid();
    root.replaceChildren(
      h(
        'div',
        { class: 'pf-hub' },
        h('header', { class: 'pf-hub-head' }, h('div', null, h('h1', null, title), opts.tagline ? h('p', { class: 'pf-muted' }, opts.tagline) : null), search),
        cats.length > 1 ? chips : null,
        grid,
        opts.links?.length ? h('footer', { class: 'pf-hub-foot' }, ...opts.links.map((l) => h('a', { href: l.href, target: '_blank', rel: 'noopener' }, l.label))) : null,
      ),
    );
  }

  async function route() {
    const hash = location.hash;
    const r = parseRoute(hash);
    const key = r.view === 'module' ? `m:${r.id}` : 'gallery';
    if (key === current && r.view === 'module') return; // only the share token changed
    mounted?.unmount();
    mounted = null;
    current = key;
    if (r.view === 'gallery') return gallery();
    const entry = opts.modules.find((m) => m.manifest.id === r.id);
    if (!entry) {
      root.replaceChildren(h('div', { class: 'pf-hub' }, h('h1', null, 'Not found'), h('p', null, `There is no generator called “${r.id}”. `, h('a', { href: '#/' }, 'See all generators'))));
      return;
    }
    root.replaceChildren(h('div', { class: 'pf-hub-loading' }, h('span', { class: 'pf-spinner' }), `Loading ${entry.manifest.name}…`));
    const def = (await entry.load()).default;
    if (current !== key) return;
    document.title = `${def.manifest.name} · ${title}`;
    const mountOpts: Parameters<typeof mountModule>[2] = {
      host,
      onHome: () => (location.hash = '#/'),
      linkFor: (t) => `${location.href.split('#')[0]}#/m/${def.manifest.id}${t ? `?s=${t}` : ''}`,
      onSettings: (t) => {
        const next = `#/m/${def.manifest.id}${t ? `?s=${t}` : ''}`;
        // replaceState fires no hashchange, so the module stays mounted.
        if (location.hash !== next) history.replaceState(null, '', next);
      },
    };
    if (r.share) mountOpts.share = r.share;
    mounted = mountModule(root, def, mountOpts);
  }

  window.addEventListener('hashchange', route);
  void route();
  return {
    dispose() {
      window.removeEventListener('hashchange', route);
      mounted?.unmount();
    },
    get mounted() {
      return mounted;
    },
  };
}
