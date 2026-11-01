import { strToU8, zipSync } from 'fflate';

/** A zip of several files (an A-to-Z keycap set, a kit). */
export function buildZip(files: Record<string, Uint8Array | string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(files)) entries[name] = typeof data === 'string' ? strToU8(data) : data;
  return zipSync(entries, { level: 6 });
}

export const MIME: Record<string, string> = {
  '3mf': 'model/3mf',
  stl: 'model/stl',
  obj: 'text/plain',
  svg: 'image/svg+xml',
  dxf: 'application/dxf',
  zip: 'application/zip',
  json: 'application/json',
  png: 'image/png',
};
