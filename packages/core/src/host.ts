/**
 * What the page a module runs in can do for it.
 *
 * The same module runs in a plain browser tab, in the hub, and inside Generator Library's
 * sandboxed window. Each of those provides a Host; every capability has a browser fallback
 * (a download for Save, a file picker for Open, localStorage for storage), so a module
 * never checks where it is running and never imports from the host.
 */

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
  type: string;
}

export interface KeyValueStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

export interface Host {
  kind: 'browser' | 'hub' | 'library' | 'desktop';
  /** Hands a file to the user (a download in a browser). */
  saveFile(name: string, data: Uint8Array | string, mime: string): Promise<void>;
  /** Asks the user for a file. `accept` is an <input accept> string. Null when cancelled. */
  openFile(accept: string): Promise<PickedFile | null>;
  /** Small persistent storage scoped to this origin. */
  storage: KeyValueStore;
  /** Opens a link outside the app. */
  openExternal(url: string): void;
}
