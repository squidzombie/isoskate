// save/: versioned save store (MU; M0 ships a minimal version). Public surface (TECH §4.13).
// M0: load → JSON.parse → shallow-merge with defaults → minimal sanitize; backup before each overwrite;
// debounced (500 ms) writes after mutate; flush() writes immediately.
// TODO(MU): migrations, full sanitize (clamps, unknown ids), corrupt-main → backup path tests, persist().
import { GAME_ID } from '../core/ids';
import type { SaveStore, SaveV1 } from '../core/save';
import { makeDefaults } from './defaults';
import { createStorage, type StorageAdapter } from './storage';

export const SAVE_KEY = `${GAME_ID}.save`, BACKUP_KEY = `${GAME_ID}.save.bak`;
const DEBOUNCE_MS = 500;

function merge(defaults: SaveV1, raw: unknown): SaveV1 | null {
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) return null;
  const r = raw as Record<string, unknown>;
  const out = { ...defaults } as Record<string, unknown>;
  for (const k of Object.keys(defaults)) {
    const dv = (defaults as unknown as Record<string, unknown>)[k], rv = r[k];
    if (rv === undefined) continue;
    if (dv && typeof dv === 'object' && !Array.isArray(dv)) out[k] = { ...(dv as object), ...(rv as object) };
    else out[k] = rv;
  }
  const s = out as unknown as SaveV1;
  for (const id of defaults.owned) if (!s.owned.includes(id)) s.owned.push(id);
  for (const slot of ['skater', 'board', 'helmet'] as const) if (!s.owned.includes(s.equipped[slot])) s.equipped[slot] = defaults.equipped[slot];
  if (!Number.isFinite(s.wallet.coins) || s.wallet.coins < 0) s.wallet.coins = 0;
  return s;
}

function parse(text: string | null): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

class Store implements SaveStore {
  private d: SaveV1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly io: StorageAdapter) {
    const defaults = makeDefaults();
    this.d = merge(defaults, parse(io.get(SAVE_KEY))) ?? merge(defaults, parse(io.get(BACKUP_KEY))) ?? defaults;
  }
  get data(): Readonly<SaveV1> { return this.d; }
  get persistent(): boolean { return this.io.persistent; }
  mutate(f: (s: SaveV1) => void): void {
    f(this.d);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }
  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const prev = this.io.get(SAVE_KEY);
    if (prev) this.io.set(BACKUP_KEY, prev);
    this.io.set(SAVE_KEY, JSON.stringify(this.d));
  }
  reset(): void { this.d = makeDefaults(); this.flush(); }
  export(): string { return JSON.stringify(this.d); }
  import(json: string): boolean {
    const m = merge(makeDefaults(), parse(json));
    if (!m) return false;
    this.d = m;
    this.flush();
    return true;
  }
}

export function createSaveStore(): SaveStore {
  return new Store(createStorage());
}

export { makeDefaults, localDay } from './defaults';
