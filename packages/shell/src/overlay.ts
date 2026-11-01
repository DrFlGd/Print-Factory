/** Toasts, dialogs and pop-up menus. All are plain elements under one root. */
import { h, icon } from './dom';

let toastRoot: HTMLElement | null = null;

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export function toast(message: string, kind: ToastKind = 'info', ms = kind === 'error' ? 7000 : 3500): void {
  if (!toastRoot || !toastRoot.isConnected) {
    toastRoot = h('div', { class: 'pf-toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastRoot);
  }
  const t = h('div', { class: `pf-toast pf-toast-${kind}` }, message);
  toastRoot.appendChild(t);
  const done = () => {
    t.classList.add('pf-out');
    setTimeout(() => t.remove(), 250);
  };
  t.addEventListener('click', done);
  setTimeout(done, ms);
}

export interface DialogOptions {
  title: string;
  /** Wider dialog for previews. */
  wide?: boolean;
  /** Called when closed any way (button, Escape, backdrop). */
  onClose?: () => void;
}

export interface DialogHandle {
  body: HTMLElement;
  footer: HTMLElement;
  close(): void;
  element: HTMLDialogElement;
}

export function dialog(opts: DialogOptions): DialogHandle {
  const body = h('div', { class: 'pf-dialog-body' });
  const footer = h('div', { class: 'pf-dialog-footer' });
  const el = h(
    'dialog',
    { class: `pf-dialog ${opts.wide ? 'pf-dialog-wide' : ''}` },
    h('header', { class: 'pf-dialog-head' }, h('h2', null, opts.title), h('button', { type: 'button', class: 'pf-btn pf-btn-icon', 'aria-label': 'Close', onclick: () => close() }, icon('close'))),
    body,
    footer,
  );
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.close();
    el.remove();
    opts.onClose?.();
  };
  el.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  el.addEventListener('mousedown', (e) => {
    if (e.target === el) close();
  });
  document.body.appendChild(el);
  el.showModal();
  return { body, footer, close, element: el };
}

/** A yes/no question. Resolves true for the confirming button. */
export function confirm(title: string, message: string, ok = 'OK', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const d = dialog({ title, onClose: () => resolve(answer) });
    d.body.append(h('p', null, message));
    d.footer.append(
      h('button', { type: 'button', class: 'pf-btn', onclick: () => d.close() }, 'Cancel'),
      h(
        'button',
        {
          type: 'button',
          class: `pf-btn ${danger ? 'pf-btn-danger' : 'pf-btn-primary'}`,
          onclick: () => {
            answer = true;
            d.close();
          },
        },
        ok,
      ),
    );
  });
}

/** Asks for a line of text. Null when cancelled. */
export function prompt(title: string, label: string, value = '', ok = 'Save'): Promise<string | null> {
  return new Promise((resolve) => {
    let answer: string | null = null;
    const d = dialog({ title, onClose: () => resolve(answer) });
    const input = h('input', { type: 'text', class: 'pf-input', value });
    const submit = () => {
      answer = input.value.trim() || null;
      d.close();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    d.body.append(h('label', { class: 'pf-field-label' }, label), input);
    d.footer.append(h('button', { type: 'button', class: 'pf-btn', onclick: () => d.close() }, 'Cancel'), h('button', { type: 'button', class: 'pf-btn pf-btn-primary', onclick: submit }, ok));
    setTimeout(() => input.select(), 0);
  });
}

export interface MenuItem {
  label: string;
  hint?: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Renders a separator above. */
  separator?: boolean;
  /** Secondary action shown at the item's end (e.g. delete a saved preset). */
  aside?: { label: string; onSelect: () => void };
}

/** A pop-up menu anchored under `anchor`. Closes on select, Escape or an outside click. */
export function menu(anchor: HTMLElement, items: MenuItem[], heading?: string): void {
  document.querySelector('.pf-menu')?.remove();
  const el = h('div', { class: 'pf-menu', role: 'menu' });
  if (heading) el.append(h('div', { class: 'pf-menu-heading' }, heading));
  for (const it of items) {
    if (it.separator) el.append(h('hr', { class: 'pf-menu-sep' }));
    const row = h(
      'div',
      { class: 'pf-menu-row' },
      h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          class: `pf-menu-item ${it.danger ? 'pf-danger' : ''}`,
          disabled: it.disabled,
          onclick: () => {
            close();
            it.onSelect?.();
          },
        },
        h('span', null, it.label),
        it.hint ? h('small', null, it.hint) : null,
      ),
      it.aside
        ? h(
            'button',
            {
              type: 'button',
              class: 'pf-menu-aside',
              title: it.aside.label,
              'aria-label': it.aside.label,
              onclick: () => {
                close();
                it.aside!.onSelect();
              },
            },
            icon('close', 14),
          )
        : null,
    );
    el.append(row);
  }
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left))}px`;
  el.style.top = `${Math.min(window.innerHeight - el.offsetHeight - 8, r.bottom + 4)}px`;
  const onDown = (e: Event) => {
    if (!el.contains(e.target as Node) && e.target !== anchor) close();
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  function close() {
    el.remove();
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey);
  }
  setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
  }, 0);
  (el.querySelector('button:not([disabled])') as HTMLElement | null)?.focus();
}
