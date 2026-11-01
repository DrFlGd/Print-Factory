/**
 * The font picker: every bundled font, previewed with the user's own text, grouped by
 * style, searchable, with a filter for fonts that print well as raised letters. Previews
 * load as they scroll into view, so opening the picker does not download every font.
 */
import { FONT_CATEGORIES, FONTS, fontInfo, layoutText, loadFont, registerFont } from '@pf/text';
import type { Host } from '@pf/core';
import { h, icon } from './dom';
import { dialog } from './overlay';

const CATEGORY_LABELS: Record<string, string> = {
  sans: 'Sans serif',
  rounded: 'Rounded',
  condensed: 'Condensed',
  display: 'Display',
  serif: 'Serif',
  stencil: 'Stencil',
  tech: 'Techno',
  pixel: 'Pixel',
  script: 'Script',
  handwriting: 'Handwriting',
  typewriter: 'Typewriter',
  mono: 'Monospace',
  novelty: 'Novelty',
  custom: 'Your fonts',
};

/** An SVG of `text` in the font, height fixed, width as the text needs. */
export async function fontPreview(id: string, text: string, height = 28): Promise<SVGSVGElement> {
  const font = await loadFont(id);
  const l = layoutText(font, text || 'Aa', { size: 10, align: 'left', tolerance: 0.05 });
  const b = l.bounds;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const w = Math.max(1, b.maxX - b.minX);
  const hh = Math.max(1, b.maxY - b.minY);
  const pad = 0.5;
  svg.setAttribute('viewBox', `${b.minX - pad} ${-b.maxY - pad} ${w + pad * 2} ${hh + pad * 2}`);
  svg.setAttribute('height', String(height));
  svg.setAttribute('width', String(Math.min(600, (height * (w + pad * 2)) / (hh + pad * 2))));
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', l.contours.map((c) => 'M' + c.map((v, i) => (i % 2 ? (-v).toFixed(2) : v.toFixed(2))).join(' ') + 'Z').join(''));
  p.setAttribute('fill', 'currentColor');
  svg.appendChild(p);
  return svg;
}

export function fontLabel(id: string): string {
  return fontInfo(id)?.label ?? id;
}

export function pickFont(current: string, sample: string, host: Host): Promise<string | null> {
  return new Promise((resolve) => {
    let chosen: string | null = null;
    const d = dialog({ title: 'Choose a font', wide: true, onClose: () => resolve(chosen) });
    const search = h('input', { type: 'search', class: 'pf-input', placeholder: 'Search fonts', 'aria-label': 'Search fonts' });
    const sampleInput = h('input', { type: 'text', class: 'pf-input', value: sample.split('\n')[0] || 'Print Factory', 'aria-label': 'Preview text' });
    const signOnly = h('input', { type: 'checkbox' });
    const grid = h('div', { class: 'pf-font-grid' });
    const upload = h(
      'button',
      {
        type: 'button',
        class: 'pf-btn',
        onclick: async () => {
          const f = await host.openFile('.ttf,.otf,.woff,font/ttf,font/otf,font/woff');
          if (!f) return;
          try {
            const { id } = registerFont(f.bytes, f.name.replace(/\.[^.]+$/, ''));
            chosen = id;
            d.close();
          } catch {
            alertRow.textContent = `${f.name} is not a font file this app can read (TTF, OTF or WOFF).`;
          }
        },
      },
      icon('upload'),
      h('span', null, 'Use a font file…'),
    );
    const alertRow = h('p', { class: 'pf-error-text', role: 'alert' });
    d.body.append(
      h('div', { class: 'pf-font-toolbar' }, search, sampleInput, h('label', { class: 'pf-check' }, signOnly, h('span', null, 'Good for raised letters')), upload),
      alertRow,
      grid,
    );

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const card = e.target as HTMLElement;
          observer.unobserve(card);
          void renderPreview(card);
        }
      },
      { root: d.body, rootMargin: '200px' },
    );

    async function renderPreview(card: HTMLElement) {
      const slot = card.querySelector('.pf-font-sample')!;
      try {
        slot.replaceChildren(await fontPreview(card.dataset.id!, sampleInput.value, 30));
      } catch {
        slot.textContent = 'Preview unavailable';
      }
    }

    function render() {
      observer.disconnect();
      grid.replaceChildren();
      const q = search.value.trim().toLowerCase();
      for (const cat of FONT_CATEGORIES) {
        const list = FONTS.filter((f) => f.category === cat && (!signOnly.checked || f.sign) && (!q || f.label.toLowerCase().includes(q) || cat.includes(q)));
        if (!list.length) continue;
        grid.append(h('h3', { class: 'pf-font-cat' }, CATEGORY_LABELS[cat] ?? cat));
        for (const f of list) {
          const card = h(
            'button',
            {
              type: 'button',
              class: `pf-font-card ${f.id === current ? 'pf-selected' : ''}`,
              dataset: { id: f.id },
              'aria-pressed': String(f.id === current),
              onclick: () => {
                chosen = f.id;
                d.close();
              },
            },
            h('span', { class: 'pf-font-sample' }, h('span', { class: 'pf-skeleton' })),
            h('span', { class: 'pf-font-name' }, f.label, h('small', null, f.license)),
          );
          grid.append(card);
          observer.observe(card);
        }
      }
      if (!grid.childElementCount) grid.append(h('p', { class: 'pf-muted' }, 'No fonts match.'));
    }
    search.addEventListener('input', render);
    signOnly.addEventListener('change', render);
    let t = 0;
    sampleInput.addEventListener('input', () => {
      clearTimeout(t);
      t = window.setTimeout(() => grid.querySelectorAll<HTMLElement>('.pf-font-card').forEach((c) => c.getBoundingClientRect().top < window.innerHeight + 200 && void renderPreview(c)), 250);
    });
    render();
    setTimeout(() => search.focus(), 0);
  });
}
