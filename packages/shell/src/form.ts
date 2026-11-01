/**
 * The settings form, generated from a module's parameter schema.
 *
 * Each parameter type has one control, so every module's form looks and behaves the
 * same: sliders with a number box beside them, segmented buttons for short choices,
 * swatches for colours, the font picker for fonts. Groups fold; parameters marked
 * `advanced` sit under "More settings". Double-clicking a label resets that field.
 */
import type { ColorParam, EnumParam, Host, NumberParam, Param, ParamSchema, ParamValue, ParamValues, RGB, StringParam, VectorParam } from '@pf/core';
import { clampNumber, coerceValue, grouped, hexToRgb, isVisible, labelOf, rgbToHex } from '@pf/core';
import { h } from './dom';
import { fontLabel, fontPreview, pickFont } from './font-picker';
import { MM_PER_IN, prefs } from './prefs';

export interface FormOptions {
  host: Host;
  /** Called on every change; `final` is false while a slider is being dragged. */
  onChange(name: string, value: ParamValue, final: boolean): void;
  /** Text to preview fonts with (usually the module's main text parameter). */
  sampleText?: () => string;
  /** Folded group names, remembered per module. */
  collapsed?: Set<string>;
  onToggleGroup?: (group: string, open: boolean) => void;
}

export interface Form {
  element: HTMLElement;
  /** Shows these values without firing onChange. */
  update(values: ParamValues): void;
  /** Re-renders unit labels after the units preference changes. */
  refreshUnits(): void;
}

interface Control {
  param: Param;
  row: HTMLElement;
  set(v: ParamValue): void;
}

const fmt = (v: number, step = 0.1) => {
  const d = Math.max(0, Math.min(4, Math.ceil(-Math.log10(step || 1) - 1e-9)));
  return Number(v.toFixed(d)).toString();
};

function inches(p: { unit?: string }): boolean {
  return p.unit === 'mm' && prefs().units === 'in';
}

function unitLabel(p: { unit?: string }): string {
  if (inches(p)) return 'in';
  return p.unit === 'deg' ? '°' : (p.unit ?? '');
}

export function createForm(schema: ParamSchema, initial: ParamValues, opts: FormOptions): Form {
  const controls: Control[] = [];
  let values = { ...initial };
  const root = h('form', { class: 'pf-form', onsubmit: (e: Event) => e.preventDefault() });

  const emit = (p: Param, v: ParamValue, final = true) => {
    values = { ...values, [p.name]: v };
    opts.onChange(p.name, v, final);
  };

  function field(p: Param, control: HTMLElement, set: (v: ParamValue) => void, inline = false): Control {
    const id = `pf-${p.name}`;
    const label = h('label', { class: 'pf-field-label', for: id, title: p.description ? `${p.description}\nDouble-click to reset.` : 'Double-click to reset.' }, labelOf(p));
    label.addEventListener('dblclick', () => {
      set(p.default as ParamValue);
      emit(p, p.default as ParamValue);
    });
    const row = h(
      'div',
      { class: `pf-field ${inline ? 'pf-field-inline' : ''}`, dataset: { param: p.name, type: p.type } },
      label,
      control,
      p.description && !inline ? h('p', { class: 'pf-help' }, p.description) : null,
    );
    control.querySelector('input,select,textarea,button')?.setAttribute('id', id);
    const c = { param: p, row, set };
    controls.push(c);
    return c;
  }

  function numberControl(p: NumberParam): Control {
    const slider = p.widget !== 'number' && p.min !== undefined && p.max !== undefined;
    const step = p.step ?? (p.type === 'integer' ? 1 : 0.1);
    const range = slider ? h('input', { type: 'range', class: 'pf-range', min: String(p.min), max: String(p.max), step: String(step), 'aria-label': labelOf(p) }) : null;
    const box = h('input', { type: 'number', class: 'pf-number', step: 'any', inputMode: 'decimal' });
    const unit = h('span', { class: 'pf-unit' });
    const toDisplay = (mm: number) => (inches(p) ? mm / MM_PER_IN : mm);
    const fromDisplay = (d: number) => (inches(p) ? d * MM_PER_IN : d);
    const set = (v: ParamValue) => {
      const n = Number(v);
      if (range) range.value = String(n);
      if (document.activeElement !== box) box.value = fmt(toDisplay(n), inches(p) ? step / 10 : step);
      unit.textContent = unitLabel(p);
      if (range) range.style.setProperty('--pf-fill', `${((n - p.min!) / (p.max! - p.min! || 1)) * 100}%`);
    };
    range?.addEventListener('input', () => {
      const v = clampNumber(p, Number(range.value));
      set(v);
      emit(p, v, false);
    });
    range?.addEventListener('change', () => emit(p, clampNumber(p, Number(range.value)), true));
    const commit = () => {
      const raw = Number(box.value.replace(',', '.'));
      if (!Number.isFinite(raw)) return set(values[p.name]!);
      const v = clampNumber(p, fromDisplay(raw));
      box.value = fmt(toDisplay(v), step);
      set(v);
      emit(p, v);
    };
    box.addEventListener('change', commit);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const k = (e.shiftKey ? 10 : 1) * step * (e.key === 'ArrowUp' ? 1 : -1);
        const v = clampNumber(p, Number(values[p.name]) + k);
        set(v);
        box.value = fmt(toDisplay(v), step);
        emit(p, v);
      }
    });
    box.addEventListener('blur', () => set(values[p.name]!));
    const wrap = h('div', { class: `pf-number-row ${slider ? '' : 'pf-number-only'}` }, range, h('div', { class: 'pf-number-box' }, box, unit));
    return field(p, wrap, set);
  }

  function enumControl(p: EnumParam): Control {
    const widget = p.widget ?? (p.options.length <= 4 && p.options.every((o) => (o.label ?? String(o.value)).length <= 12) ? 'segmented' : 'select');
    if (widget === 'select') {
      const sel = h('select', { class: 'pf-select' }, ...p.options.map((o) => h('option', { value: String(o.value) }, o.label ?? String(o.value))));
      sel.addEventListener('change', () => {
        const o = p.options[sel.selectedIndex]!;
        emit(p, o.value);
      });
      return field(p, sel, (v) => (sel.selectedIndex = Math.max(0, p.options.findIndex((o) => String(o.value) === String(v)))));
    }
    const buttons = p.options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          class: widget === 'cards' ? 'pf-card-option' : 'pf-seg',
          role: 'radio',
          title: o.description ?? '',
          onclick: () => {
            set(o.value);
            emit(p, o.value);
          },
        },
        h('span', null, o.label ?? String(o.value)),
        widget === 'cards' && o.description ? h('small', null, o.description) : null,
      ),
    );
    const group = h('div', { class: widget === 'cards' ? 'pf-cards' : 'pf-segmented', role: 'radiogroup', 'aria-label': labelOf(p) }, ...buttons);
    const set = (v: ParamValue) =>
      buttons.forEach((b, i) => {
        const on = String(p.options[i]!.value) === String(v);
        b.classList.toggle('pf-on', on);
        b.setAttribute('aria-checked', String(on));
      });
    return field(p, group, set);
  }

  function boolControl(p: Param & { type: 'boolean' }): Control {
    const input = h('input', { type: 'checkbox', class: 'pf-switch', role: 'switch' });
    input.addEventListener('change', () => emit(p, input.checked));
    return field(p, input, (v) => (input.checked = Boolean(v)), true);
  }

  function stringControl(p: StringParam): Control {
    const input = p.multiline
      ? h('textarea', { class: 'pf-input pf-textarea', rows: 2, maxLength: p.maxLength ?? 500, placeholder: p.placeholder ?? '', spellcheck: false })
      : h('input', { type: 'text', class: 'pf-input', maxLength: p.maxLength ?? 200, placeholder: p.placeholder ?? '', spellcheck: false });
    input.addEventListener('input', () => emit(p, input.value, false));
    input.addEventListener('change', () => emit(p, input.value, true));
    return field(p, input, (v) => {
      if (input.value !== v) input.value = String(v);
    });
  }

  function colorControl(p: ColorParam): Control {
    const native = h('input', { type: 'color', class: 'pf-color-input', 'aria-label': `${labelOf(p)}: custom colour` });
    const hex = h('span', { class: 'pf-color-hex' });
    const swatches = (p.palette ?? []).map((c) =>
      h('button', {
        type: 'button',
        class: 'pf-swatch',
        title: rgbToHex(c),
        'aria-label': rgbToHex(c),
        style: { background: rgbToHex(c) },
        onclick: () => {
          set(c);
          emit(p, c);
        },
      }),
    );
    const set = (v: ParamValue) => {
      const c = v as RGB;
      native.value = rgbToHex(c);
      hex.textContent = rgbToHex(c).toUpperCase();
      swatches.forEach((s, i) => s.classList.toggle('pf-on', rgbToHex(p.palette![i]!) === rgbToHex(c)));
    };
    native.addEventListener('input', () => {
      const c = hexToRgb(native.value);
      hex.textContent = native.value.toUpperCase();
      emit(p, c, false);
    });
    native.addEventListener('change', () => emit(p, hexToRgb(native.value), true));
    return field(p, h('div', { class: 'pf-color-row' }, ...swatches, h('label', { class: 'pf-color-custom' }, native, hex)), set);
  }

  function fontControl(p: Param & { type: 'font' }): Control {
    const preview = h('span', { class: 'pf-font-button-sample' });
    const name = h('span', { class: 'pf-font-button-name' });
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'pf-font-button',
        onclick: async () => {
          const id = await pickFont(String(values[p.name]), opts.sampleText?.() ?? '', opts.host);
          if (id) {
            set(id);
            emit(p, id);
          }
        },
      },
      preview,
      name,
    );
    let shown = '';
    const set = (v: ParamValue) => {
      const id = String(v);
      name.textContent = fontLabel(id);
      if (id === shown) return;
      shown = id;
      fontPreview(id, 'Aa Bb 123', 22)
        .then((svg) => shown === id && preview.replaceChildren(svg))
        .catch(() => preview.replaceChildren());
    };
    return field(p, btn, set);
  }

  function vectorControl(p: VectorParam): Control {
    const n = p.default.length;
    const boxes = Array.from({ length: n }, (_, i) => {
      const b = h('input', { type: 'number', class: 'pf-number', step: 'any', 'aria-label': `${labelOf(p)} ${p.labels?.[i] ?? i + 1}` });
      b.addEventListener('change', () => {
        const next = boxes.map((x, j) => clampNumber(p, (inches(p) ? MM_PER_IN : 1) * Number(x.value || (values[p.name] as number[])[j])));
        set(next);
        emit(p, next);
      });
      return b;
    });
    const set = (v: ParamValue) => {
      const arr = v as number[];
      boxes.forEach((b, i) => (b.value = fmt((arr[i] ?? 0) / (inches(p) ? MM_PER_IN : 1), p.step ?? 0.1)));
    };
    const row = h('div', { class: 'pf-vector' }, ...boxes.map((b, i) => h('label', { class: 'pf-vector-item' }, h('small', null, p.labels?.[i] ?? 'XYZW'[i] ?? String(i + 1)), b)), h('span', { class: 'pf-unit' }, unitLabel(p)));
    return field(p, row, set);
  }

  function controlFor(p: Param): Control | null {
    if (p.hidden) return null;
    switch (p.type) {
      case 'number':
      case 'integer':
        return numberControl(p);
      case 'enum':
        return enumControl(p);
      case 'boolean':
        return boolControl(p);
      case 'string':
        return stringControl(p);
      case 'color':
        return colorControl(p);
      case 'font':
        return fontControl(p);
      case 'vector':
        return vectorControl(p);
    }
  }

  for (const { group, params } of grouped(schema)) {
    const main = params.filter((p) => !p.advanced);
    const more = params.filter((p) => p.advanced);
    const body = h('div', { class: 'pf-group-body' });
    for (const p of main) {
      const c = controlFor(p);
      if (c) body.append(c.row);
    }
    if (more.length) {
      const extra = h('details', { class: 'pf-more' }, h('summary', null, 'More settings'));
      for (const p of more) {
        const c = controlFor(p);
        if (c) extra.append(c.row);
      }
      body.append(extra);
    }
    if (!body.childElementCount) continue;
    if (!group) {
      root.append(body);
      continue;
    }
    const sec = h('details', { class: 'pf-group', open: !opts.collapsed?.has(group), dataset: { group } }, h('summary', null, group), body);
    sec.addEventListener('toggle', () => opts.onToggleGroup?.(group, sec.open));
    root.append(sec);
  }

  function update(next: ParamValues) {
    values = { ...next };
    for (const c of controls) {
      const v = values[c.param.name] ?? coerceValue(c.param, undefined);
      c.set(v);
      c.row.hidden = !isVisible(c.param, values);
    }
    // Hide groups whose fields are all hidden.
    root.querySelectorAll<HTMLElement>('.pf-group').forEach((g) => {
      g.hidden = ![...g.querySelectorAll<HTMLElement>('.pf-field')].some((f) => !f.hidden);
    });
  }
  update(values);

  return { element: root, update, refreshUnits: () => update(values) };
}
