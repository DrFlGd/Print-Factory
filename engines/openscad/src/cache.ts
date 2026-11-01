/**
 * Renders kept in the browser (IndexedDB), so a part rendered before opens at once.
 * The key hashes the program's sources, the engine version and the job's defines, so a
 * change to any of them renders fresh. Entries from older sources are dropped, and the
 * newest MAX_ENTRIES stay. After GearBox's render cache.
 */
const STORE = 'renders';
const MAX_ENTRIES = 400;

export interface CachedRender {
  bytes: Uint8Array;
  seconds: number;
  messages: string[];
}
type Row = CachedRender & { key: string; src: string; at: number };

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (text: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export class RenderCache {
  private src: Promise<string>;
  private dbp: Promise<IDBDatabase | null> | null = null;

  constructor(
    private readonly name: string,
    files: Record<string, string>,
    version: string,
  ) {
    this.src = sha256(version + '\n' + Object.keys(files).sort().map((p) => p + '\n' + files[p]).join('\n'));
  }

  private db(): Promise<IDBDatabase | null> {
    this.dbp ??= (async () => {
      try {
        if (typeof indexedDB === 'undefined') return null;
        const open = indexedDB.open(`pf-openscad-${this.name}`, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'key' }).createIndex('at', 'at');
        const d = await req(open);
        void this.prune(d, await this.src);
        return d;
      } catch {
        return null; // private window or storage blocked: render every time
      }
    })();
    return this.dbp;
  }

  private async prune(d: IDBDatabase, src: string) {
    try {
      const rows = (await req(d.transaction(STORE).objectStore(STORE).index('at').getAll())) as Row[];
      const fresh = rows.filter((r) => r.src === src);
      const drop = [...rows.filter((r) => r.src !== src), ...fresh.slice(0, Math.max(0, fresh.length - MAX_ENTRIES))];
      if (!drop.length) return;
      const store = d.transaction(STORE, 'readwrite').objectStore(STORE);
      for (const r of drop) store.delete(r.key);
    } catch {
      /* best effort */
    }
  }

  async key(defines: string[]): Promise<string> {
    return sha256((await this.src) + '\n' + defines.join('\n'));
  }

  async get(key: string): Promise<CachedRender | null> {
    const d = await this.db();
    if (!d) return null;
    try {
      const row = (await req(d.transaction(STORE).objectStore(STORE).get(key))) as Row | undefined;
      if (!row) return null;
      d.transaction(STORE, 'readwrite').objectStore(STORE).put({ ...row, at: Date.now() }); // keep what is in use
      return { bytes: row.bytes, seconds: row.seconds, messages: row.messages };
    } catch {
      return null;
    }
  }

  async put(key: string, r: CachedRender): Promise<void> {
    const d = await this.db();
    if (!d) return;
    try {
      const row: Row = { key, src: await this.src, at: Date.now(), bytes: r.bytes.slice(), seconds: r.seconds, messages: r.messages };
      await req(d.transaction(STORE, 'readwrite').objectStore(STORE).put(row));
      void this.prune(d, row.src);
    } catch {
      /* quota full: carry on without the cache */
    }
  }
}
