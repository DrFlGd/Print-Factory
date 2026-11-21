/**
 * Side-panel node editor. The SVG displays both sides of the revolved silhouette; only
 * the right side is editable. Drag nodes, double-click the curve to add, remove or reset.
 * Changes to the persistent profile parameter happen at the end of a drag (one rebuild).
 */
import type { ModuleUI } from '@pf/core';
import { h } from '@pf/shell';
import { encodeProfile, legacyProfile, MAX_PROFILE_NODES, parseProfile, profileRadius } from './profile';
import type { ProfileNode } from './profile';

const NS = 'http://www.w3.org/2000/svg';
const W = 260, H = 286, AXIS = 130, TOP = 17, BOTTOM = 265, RADIUS = 103;
const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));

function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}
function xy([u, r]: ProfileNode): [number, number] {
  return [AXIS + r * RADIUS, BOTTOM - u * (BOTTOM - TOP)];
}

export function profileEditor(api: ModuleUI): () => void {
  const body = api.panel({ title: 'Custom bauble profile', id: 'bauble-profile' });
  const desc = h('p', { class: 'pf-muted' }, 'Drag the orange nodes to shape the bauble. Double-click to add a node. The outline is revolved around the centre line.');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Bauble outline editor; select a point and use arrow keys to move it');
  svg.setAttribute('tabindex', '0');
  svg.style.cssText = 'display:block;max-width:400px;touch-action:none;border-radius:12px;background:var(--pf-panel-2);border:1px solid var(--pf-border,#353b46);';
  const status = h('p', { class: 'pf-muted', 'aria-live': 'polite' });
  const remove = h('button', { class: 'pf-btn', type: 'button' }, 'Remove selected node');
  const reset = h('button', { class: 'pf-btn', type: 'button' }, 'Reset profile');
  const actions = h('div', { class: 'pf-image-actions' }, remove, reset);
  body.append(desc, svg, actions, status);

  let nodes: ProfileNode[] = [];
  let selected = -1;
  let dragging: number | null = null;
  let signature = '';

  const read = (): ProfileNode[] => {
    const p = api.values();
    return parseProfile(p.customProfile) ?? legacyProfile(Number(p.customBulge), Number(p.customTop), Number(p.customBottom));
  };
  function draw() {
    svg.replaceChildren();
    for (const u of [0.25, 0.5, 0.75]) {
      const y = BOTTOM - u * (BOTTOM - TOP);
      svg.append(svgEl('line', { x1: 10, y1: y, x2: 250, y2: y, stroke: 'currentColor', 'stroke-opacity': 0.1 }));
    }
    svg.append(svgEl('line', { x1: AXIS, y1: 8, x2: AXIS, y2: BOTTOM + 4, stroke: 'currentColor', 'stroke-opacity': 0.3, 'stroke-dasharray': '4 5' }));
    svg.append(svgEl('line', { x1: 13, y1: BOTTOM, x2: 247, y2: BOTTOM, stroke: 'currentColor', 'stroke-opacity': 0.2 }));
    // Sample the same shape-preserving curve as the 3D builder.
    let right = '', left = '';
    for (let i = 0; i <= 160; i++) {
      const [x, y] = xy([i / 160, profileRadius(nodes, i / 160)]);
      right += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    for (let i = 160; i >= 0; i--) {
      const [x, y] = xy([i / 160, profileRadius(nodes, i / 160)]);
      left += `L${(2 * AXIS - x).toFixed(2)} ${y.toFixed(2)}`;
    }
    svg.append(svgEl('path', { d: right + left + 'Z', fill: 'rgba(249,115,22,.09)', stroke: '#f97316', 'stroke-width': 1.6 }));
    nodes.forEach((point, i) => {
      const [x, y] = xy(point);
      const c = svgEl('circle', { cx: x, cy: y, r: i === selected ? 7.5 : 6, fill: i === selected ? '#fff' : 'var(--pf-panel,#171a1f)', stroke: '#f97316', 'stroke-width': i === selected ? 3 : 2.5, 'data-node': i });
      c.setAttribute('aria-label', `Node ${i + 1}, ${Math.round(point[0] * 100)}% high, ${Math.round(point[1] * 100)}% radius`);
      c.style.cursor = i === 0 || i === nodes.length - 1 ? 'default' : 'grab';
      svg.append(c);
    });
    remove.disabled = selected <= 0 || selected >= nodes.length - 1;
    status.textContent = `${nodes.length} nodes · drag the right-side points · top/bottom stay on the axis`;
  }
  function reload() {
    const p = api.values();
    const key = JSON.stringify([p.customProfile, p.customBulge, p.customTop, p.customBottom]);
    if (dragging === null && signature !== key) {
      signature = key;
      nodes = read();
      selected = -1;
      draw();
    }
    const panel = body.closest<HTMLElement>('.pf-module-panel');
    if (panel) panel.hidden = p.product !== 'bauble' || p.shape !== 'custom';
  }
  function commit() {
    api.set('customProfile', encodeProfile(nodes));
  }
  function position(e: MouseEvent | PointerEvent): ProfileNode {
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    return [clamp((BOTTOM - y) / (BOTTOM - TOP), 0, 1), clamp((x - AXIS) / RADIUS, 0, 1)];
  }
  svg.addEventListener('pointerdown', (e) => {
    const target = e.target as SVGElement;
    const str = target.getAttribute('data-node');
    if (str === null) return;
    selected = Number(str);
    if (selected > 0 && selected < nodes.length - 1) {
      dragging = selected;
      svg.setPointerCapture(e.pointerId);
    }
    draw();
  });
  svg.addEventListener('pointermove', (e) => {
    if (dragging === null) return;
    const i = dragging;
    const [u, r] = position(e);
    nodes[i] = [clamp(u, nodes[i - 1]![0] + 0.018, nodes[i + 1]![0] - 0.018), r];
    draw();
  });
  const endDrag = (e: PointerEvent) => {
    if (dragging === null) return;
    dragging = null;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    commit();
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('dblclick', (e) => {
    if (nodes.length >= MAX_PROFILE_NODES) {
      api.toast('Maximum 18 profile nodes.', 'warning');
      return;
    }
    const [u, r] = position(e);
    const i = nodes.findIndex((n) => n[0] >= u);
    if (i <= 0 || u - nodes[i - 1]![0] < 0.02 || nodes[i]![0] - u < 0.02) return;
    nodes.splice(i, 0, [u, r]);
    selected = i;
    draw();
    commit();
  });
  svg.addEventListener('keydown', (e) => {
    if (selected <= 0 || selected >= nodes.length - 1) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      nodes.splice(selected, 1);
      selected = -1;
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const [u, r] = nodes[selected]!;
      const step = e.shiftKey ? 0.05 : 0.01;
      nodes[selected] = [
        clamp(u + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0), nodes[selected - 1]![0] + 0.018, nodes[selected + 1]![0] - 0.018),
        clamp(r + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), 0, 1),
      ];
    } else return;
    draw();
    commit();
  });
  remove.addEventListener('click', () => {
    if (selected <= 0 || selected >= nodes.length - 1) return;
    nodes.splice(selected, 1);
    selected = -1;
    draw();
    commit();
  });
  reset.addEventListener('click', () => api.set('customProfile', ''));
  const off = api.onValues(reload);
  reload();
  return () => off();
}
