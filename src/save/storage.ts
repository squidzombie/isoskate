// save/storage.ts: storage adapter. Every call is wrapped in try/catch; on failure (private mode, quota,
// sandboxed iframe) it falls back to memory and reports persistent = false (TECH §10.5).
export interface StorageAdapter {
  readonly persistent: boolean;
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function createStorage(): StorageAdapter {
  const mem = new Map<string, string>();
  let ls: Storage | null = null;
  try {
    ls = globalThis.localStorage ?? null;
    if (ls) { const k = '__dusklane_probe'; ls.setItem(k, '1'); ls.removeItem(k); }
  } catch { ls = null; }
  const adapter = {
    persistent: !!ls,
    get(key: string): string | null {
      if (ls) { try { return ls.getItem(key); } catch { adapter.persistent = false; ls = null; } }
      return mem.get(key) ?? null;
    },
    set(key: string, value: string): void {
      mem.set(key, value);
      if (ls) { try { ls.setItem(key, value); } catch { adapter.persistent = false; ls = null; } }
    },
    remove(key: string): void {
      mem.delete(key);
      if (ls) { try { ls.removeItem(key); } catch { adapter.persistent = false; ls = null; } }
    },
  };
  return adapter;
}
