/**
 * Standalone PDF generator for real-size cookie-outline templates, no rasterisation or
 * third-party runtime. The contours are in millimetres; PDF points are 72/25.4 per mm.
 * Uses A4 when possible, otherwise a custom larger media box, never scaling artwork.
 */
import type { Drawing } from '@pf/core';
const PT = 72 / 25.4;
const ascii = (s: string): Uint8Array => new TextEncoder().encode(s);
const n = (x: number) => (Math.round(x * 10000) / 10000).toString();

export function outlinePdf(drawing: Drawing): Uint8Array {
  const contours = drawing.layers.flatMap(layer => layer.operation === 'cut' ? layer.contours : []);
  if (!contours.length) throw new Error('There is no outline to export.');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of contours) for (let i = 0; i < c.length; i += 2) {
    minX = Math.min(minX, c[i]!); minY = Math.min(minY, c[i + 1]!);
    maxX = Math.max(maxX, c[i]!); maxY = Math.max(maxY, c[i + 1]!);
  }
  const w = maxX - minX, h = maxY - minY;
  const pageW = Math.max(210, w + 25) * PT, pageH = Math.max(297, h + 50) * PT;
  const ox = pageW / 2 - (minX + maxX) * PT / 2;
  const oy = pageH / 2 - (minY + maxY) * PT / 2;
  const lines = ['q', '0 0 0 RG', '0.2 w', '1 J', '1 j'];
  for (const c of contours) {
    if (c.length < 6) continue;
    lines.push(n(c[0]! * PT + ox) + ' ' + n(c[1]! * PT + oy) + ' m');
    for (let i = 2; i < c.length; i += 2)
      lines.push(n(c[i]! * PT + ox) + ' ' + n(c[i + 1]! * PT + oy) + ' l');
    lines.push('h S');
  }
  lines.push('Q');
  // 100 mm calibration ruler; users should choose Actual size, never Fit to page.
  const x0 = 20 * PT, y0 = 17 * PT;
  lines.push('0.6 w', n(x0) + ' ' + n(y0) + ' m', n(x0 + 100 * PT) + ' ' + n(y0) + ' l S');
  for (const x of [0, 50, 100]) lines.push(n(x0 + x * PT) + ' ' + n(y0 - 4) + ' m ' + n(x0 + x * PT) + ' ' + n(y0 + 4) + ' l S');
  lines.push('BT /F1 8 Tf ' + n(x0) + ' ' + n(y0 + 12) + ' Td (100 mm check line - print at 100% / Actual size) Tj ET');
  const stream = lines.join('\n') + '\n';
  const chunks: string[] = [];
  const offsets: number[] = [0];
  let length = 0;
  const put = (s: string) => { chunks.push(s); length += ascii(s).length; };
  put('%PDF-1.4\n');
  const obj = (id: number, s: string) => {
    offsets[id] = length;
    put(id + ' 0 obj\n' + s + '\nendobj\n');
  };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + n(pageW) + ' ' + n(pageH) +
    '] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>');
  obj(4, '<< /Length ' + ascii(stream).length + ' >>\nstream\n' + stream + 'endstream');
  obj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const xref = length;
  put('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) put(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  put('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return ascii(chunks.join(''));
}
