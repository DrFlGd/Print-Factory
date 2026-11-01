/** The plain-browser Host: downloads, a file picker and localStorage. */
import type { Host, PickedFile } from '@pf/core';
import { localStore } from '@pf/project';

export function browserHost(kind: Host['kind'] = 'browser'): Host {
  return {
    kind,
    async saveFile(name, data, mime) {
      const blob = new Blob([data as BlobPart], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    },
    openFile(accept) {
      return new Promise<PickedFile | null>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.style.display = 'none';
        let settled = false;
        input.addEventListener('change', async () => {
          settled = true;
          const f = input.files?.[0];
          input.remove();
          resolve(f ? { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
        });
        input.addEventListener('cancel', () => {
          if (!settled) resolve(null);
          input.remove();
        });
        document.body.appendChild(input);
        input.click();
      });
    },
    storage: localStore('pf:'),
    openExternal(url) {
      window.open(url, '_blank', 'noopener');
    },
  };
}

/** Reads a dropped or picked file the same way as Host.openFile. */
export async function readFile(f: File): Promise<PickedFile> {
  return { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) };
}
