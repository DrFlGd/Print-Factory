/**
 * Laser and CNC files from a `Drawing`.
 *
 * SVG: millimetre units, one group per layer named after its operation, and the layer's
 * colour on the stroke (cut and score) or the fill (engrave), which is how Bambu Suite,
 * LightBurn, xTool Creative Space and Inkscape map paths to laser settings. Y is flipped
 * back to SVG's downward axis.
 *
 * DXF: R12 LWPOLYLINE-free ASCII (POLYLINE/VERTEX), one DXF layer per drawing layer, which
 * every CAM and laser program reads.
 */
import type { Drawing, DrawingLayer } from '@pf/core';
import { rgbToHex } from '@pf/core';

function drawingBounds(d: Drawing): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of d.layers)
    for (const c of [...l.contours, ...(l.polylines ?? [])])
      for (let i = 0; i < c.length; i += 2) {
        minX = Math.min(minX, c[i]!);
        maxX = Math.max(maxX, c[i]!);
        minY = Math.min(minY, c[i + 1]!);
        maxY = Math.max(maxY, c[i + 1]!);
      }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

const n = (v: number) => String(Math.round(v * 1000) / 1000);

function pathData(contours: number[][], close: boolean, flip: (y: number) => number): string {
  return contours
    .filter((c) => c.length >= 4)
    .map((c) => {
      let d = `M${n(c[0]!)} ${n(flip(c[1]!))}`;
      for (let i = 2; i < c.length; i += 2) d += `L${n(c[i]!)} ${n(flip(c[i + 1]!))}`;
      return close ? d + 'Z' : d;
    })
    .join('');
}

export interface SvgOptions {
  /** Margin around the design when the drawing has no sheet size. */
  margin?: number;
  /** Stroke width for cut and score lines, in mm (lasers treat hairlines as vectors). */
  hairline?: number;
  title?: string;
}

export function buildSVG(d: Drawing, opts: SvgOptions = {}): string {
  const margin = opts.margin ?? 2;
  const b = drawingBounds(d);
  const sheet = d.width !== undefined && d.height !== undefined;
  const x0 = sheet ? 0 : b.minX - margin;
  const y0 = sheet ? 0 : b.minY - margin;
  const w = sheet ? d.width! : b.maxX - b.minX + margin * 2;
  const h = sheet ? d.height! : b.maxY - b.minY + margin * 2;
  // SVG y grows downwards: y_svg = (y0 + h) - y
  const flip = (y: number) => y0 + h - y;
  const hair = opts.hairline ?? 0.1;
  const groups = d.layers.map((l: DrawingLayer) => {
    const color = rgbToHex(l.color);
    const closed = pathData(l.contours, true, flip);
    const open = pathData(l.polylines ?? [], false, flip);
    const style = l.operation === 'engrave' ? `fill="${color}" fill-rule="evenodd" stroke="none"` : `fill="none" stroke="${color}" stroke-width="${hair}"`;
    const paths = [closed && `<path d="${closed}" ${style}/>`, open && `<path d="${open}" fill="none" stroke="${color}" stroke-width="${hair}"/>`].filter(Boolean).join('');
    const id = `${l.operation}-${l.name}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    return `<g id="${id}" inkscape:groupmode="layer" inkscape:label="${l.name} (${l.operation})">${paths}</g>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${n(w)}mm" height="${n(h)}mm" viewBox="${n(x0)} ${n(y0)} ${n(w)} ${n(h)}">`,
    opts.title ? `<title>${opts.title.replace(/[<&>]/g, '')}</title>` : '',
    ...groups,
    '</svg>',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildDXF(d: Drawing): string {
  const out: string[] = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(d.layers.length)];
  d.layers.forEach((l, i) => out.push('0', 'LAYER', '2', l.name.replace(/\s+/g, '_'), '70', '0', '62', String((i % 7) + 1), '6', 'CONTINUOUS'));
  out.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  for (const l of d.layers) {
    const layer = l.name.replace(/\s+/g, '_');
    const emit = (c: number[], closed: boolean) => {
      out.push('0', 'POLYLINE', '8', layer, '66', '1', '70', closed ? '1' : '0');
      for (let i = 0; i < c.length; i += 2) out.push('0', 'VERTEX', '8', layer, '10', n(c[i]!), '20', n(c[i + 1]!), '30', '0');
      out.push('0', 'SEQEND', '8', layer);
    };
    l.contours.forEach((c) => emit(c, true));
    (l.polylines ?? []).forEach((c) => emit(c, false));
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n') + '\n';
}
