/**
 * The symbol picker: the bundled library by category, searchable by name and tag, plus
 * the user's own SVGs. Previews are the icons' own SVG, so the grid is cheap to draw.
 */
import type { Host } from '@pf/core';
import { registerSymbol, symbolIndex, symbolSvg } from '@pf/symbols';
import type { SymbolInfo } from '@pf/symbols';
import { h, icon } from './dom';
import { dialog } from './overlay';

export async function symbolPreview(id: string, size = 28): Promise<HTMLElement> {
  const svg = await symbolSvg(id);
  const span = h('span', { class: 'pf-symbol-preview', style: { width: `${size}px`, height: `${size}px` } });
  if (svg) span.innerHTML = svg.replace(/<script[\s\S]*?<\/script>/gi, '');
  return span;
}

export function pickSymbol(current: string, host: Host, optional = true): Promise<string | null | undefined> {
  return new Promise((resolve) => {
    // undefined: cancelled; '' : none chosen; string: a symbol.
    let chosen: string | null | undefined = undefined;
    const d = dialog({ title: 'Choose a symbol', wide: true, onClose: () => resolve(chosen) });
    const search = h('input', { type: 'search', class: 'pf-input', placeholder: 'Search 1,000 symbols: heart, star, paw…', 'aria-label': 'Search symbols' });
    const cats = h('select', { class: 'pf-select', 'aria-label': 'Category' });
    const grid = h('div', { class: 'pf-symbol-grid' });
    const note = h('p', { class: 'pf-error-text', role: 'alert' });
    const upload = h(
      'button',
      {
        type: 'button',
        class: 'pf-btn',
        onclick: async () => {
          const f = await host.openFile('.svg,image/svg+xml');
          if (!f) return;
          try {
            chosen = registerSymbol(new TextDecoder().decode(f.bytes), f.name.replace(/\.svg$/i, '')).id;
            d.close();
          } catch (e) {
            note.textContent = (e as Error).message;
          }
        },
      },
      icon('upload'),
      h('span', null, 'Use an SVG…'),
    );
    const none = optional
      ? h(
          'button',
          {
            type: 'button',
            class: 'pf-btn',
            onclick: () => {
              chosen = '';
              d.close();
            },
          },
          'No symbol',
        )
      : null;
    d.body.append(h('div', { class: 'pf-font-toolbar' }, search, cats, none, upload), note, grid);
    let all: SymbolInfo[] = [];
    let shown = 0;
    const PAGE = 240;
    let list: SymbolInfo[] = [];
    const more = h('button', { type: 'button', class: 'pf-btn pf-symbol-more', onclick: () => page() }, 'Show more');

    function page() {
      more.remove();
      const slice = list.slice(shown, shown + PAGE);
      shown += slice.length;
      for (const s of slice) {
        const b = h(
          'button',
          {
            type: 'button',
            class: `pf-symbol-cell ${s.id === current ? 'pf-selected' : ''}`,
            title: s.name,
            'aria-label': s.name,
            onclick: () => {
              chosen = s.id;
              d.close();
            },
          },
          h('span', { class: 'pf-skeleton' }),
        );
        grid.append(b);
        void symbolPreview(s.id, 30).then((el) => b.replaceChildren(el));
      }
      if (shown < list.length) grid.after(more);
    }
    function render() {
      const q = search.value.trim().toLowerCase();
      const c = cats.value;
      list = all.filter((s) => (!c || s.category === c) && (!q || s.name.includes(q) || s.tags.some((t) => String(t).includes(q))));
      grid.replaceChildren();
      shown = 0;
      if (!list.length) grid.append(h('p', { class: 'pf-muted' }, 'No symbols match.'));
      page();
    }
    void symbolIndex().then((idx) => {
      all = idx;
      const names = [...new Set(idx.map((s) => s.category))].sort();
      cats.replaceChildren(h('option', { value: '' }, 'All categories'), ...names.map((n) => h('option', { value: n }, n)));
      render();
    });
    search.addEventListener('input', render);
    cats.addEventListener('change', render);
    setTimeout(() => search.focus(), 0);
  });
}
