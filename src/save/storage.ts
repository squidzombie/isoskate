// save/storage.ts: the storage adapter (TECH §10.5). Every call is wrapped in try/catch; on any failure (private
// mode, quota, a sandboxed iframe, a storage that throws on access) it falls back to memory for good and reports
// persistent = false, which Settings shows as "progress won't be saved".
export interface StorageAdapter {
  readonly persistent: boolean;
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** The subset of the Web Storage API the adapter uses (tests inject throwing or quota-limited fakes). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultBacking(): StorageLike | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function createStorage(backing: StorageLike | null = defaultBacking()): StorageAdapter {
  const mem = new Map<string, string>();
  let ls: StorageLike | null = backing;
  try {
    if (ls) { const k = '__dusklane_probe'; ls.setItem(k, '1'); ls.removeItem(k); }
  } catch { ls = null; }
  /** First failure: keep what we have in memory (later reads come from there) and stop touching the backing. */
  const fail = () => { adapter.persistent = false; ls = null; };
  const adapter = {
    persistent: !!ls,
    get(key: string): string | null {
      if (ls) {
        try {
          const v = ls.getItem(key);
          if (v !== null) mem.set(key, v); else mem.delete(key);
          return v;
        } catch { fail(); }
      }
      return mem.get(key) ?? null;
    },
    set(key: string, value: string): void {
      mem.set(key, value);
      if (ls) { try { ls.setItem(key, value); } catch { fail(); } }
    },
    remove(key: string): void {
      mem.delete(key);
      if (ls) { try { ls.removeItem(key); } catch { fail(); } }
    },
  };
  return adapter;
}

/** Asks the browser to keep this origin's storage (Safari evicts script-writable storage after 7 days without a
 *  visit; TECH §10.5). Feature-detected; resolves false where unsupported or refused, never rejects. */
export async function requestPersist(): Promise<boolean> {
  try {
    const st = (globalThis.navigator as Navigator | undefined)?.storage;
    if (!st || typeof st.persist !== 'function') return false;
    if (typeof st.persisted === 'function' && (await st.persisted())) return true;
    return await st.persist();
  } catch { return false; }
}
