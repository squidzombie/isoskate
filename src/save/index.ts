// save/: the versioned save store (MU; TECH §4.9, §10.5). Public surface (TECH §4.13).
//   Load:  JSON.parse → migrate (save/migrate.ts) → deep-merge with defaults + sanitize (save/sanitize.ts).
//          A main save that fails any step falls back to the backup, then to defaults (`loadedFrom` says which).
//   Write: debounced 500 ms after mutate(); flush() writes at once (run end, crate roll, purchase, visibility hidden).
//          Before each overwrite the last good main save is copied to `dusklane.save.bak`, so a corrupt write can
//          always be recovered; a write that throws switches to memory (persistent = false) and play goes on.
//   Back up / Restore: export() is the save as JSON; import(json) runs the same load pipeline and rejects anything
//          that is not a save, leaving the current data untouched.
import { GAME_ID } from '../core/ids';
import type { SaveStore, SaveV1 } from '../core/save';
import { makeDefaults } from './defaults';
import { migrate } from './migrate';
import { sanitize } from './sanitize';
import { createStorage, type StorageAdapter } from './storage';

export const SAVE_KEY = `${GAME_ID}.save`, BACKUP_KEY = `${GAME_ID}.save.bak`;
export const SAVE_DEBOUNCE_MS = 500;

/** Parse + migrate + sanitize one stored text; null if it is not a usable save. */
export function parseSave(text: string | null, defaults: SaveV1): SaveV1 | null {
  if (!text) return null;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  const m = migrate(raw);
  return m ? sanitize(m, defaults) : null;
}

export interface SaveStoreExt extends SaveStore {
  /** Where the data came from at boot: the main key, the backup (main was corrupt) or fresh defaults. */
  readonly loadedFrom: 'main' | 'backup' | 'defaults';
  /** Pending debounced write? (tests, the flush-on-hide check) */
  readonly dirty: boolean;
}

export interface SaveStoreOptions { now?: () => number; seed?: number }

export class Store implements SaveStoreExt {
  private d: SaveV1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastGood: string | null = null;
  readonly loadedFrom: 'main' | 'backup' | 'defaults';
  constructor(private readonly io: StorageAdapter, private readonly opts: SaveStoreOptions = {}) {
    const defaults = this.fresh();
    const mainText = io.get(SAVE_KEY);
    const main = parseSave(mainText, defaults);
    if (main) { this.d = main; this.loadedFrom = 'main'; this.lastGood = mainText; return; }
    const bakText = io.get(BACKUP_KEY);
    const bak = parseSave(bakText, defaults);
    if (bak) { this.d = bak; this.loadedFrom = 'backup'; this.lastGood = bakText; return; }
    this.d = defaults; this.loadedFrom = 'defaults';
  }
  get data(): Readonly<SaveV1> { return this.d; }
  get persistent(): boolean { return this.io.persistent; }
  get dirty(): boolean { return this.timer !== null; }
  mutate(f: (s: SaveV1) => void): void {
    f(this.d);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, SAVE_DEBOUNCE_MS);
  }
  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const json = JSON.stringify(this.d);
    if (json === this.lastGood) return;
    if (this.lastGood) this.io.set(BACKUP_KEY, this.lastGood);
    this.io.set(SAVE_KEY, json);
    this.lastGood = json;
  }
  /** Reset progress (Settings, double confirm): a fresh profile that keeps the install id and the settings. */
  reset(): void {
    const keep = { installId: this.d.installId, settings: { ...this.d.settings } };
    this.d = { ...this.fresh(), ...keep };
    this.flush();
  }
  export(): string { return JSON.stringify(this.d); }
  import(json: string): boolean {
    const m = parseSave(json, this.fresh());
    if (!m) return false;
    this.d = m;
    this.flush();
    return true;
  }
  private fresh(): SaveV1 { return makeDefaults(this.opts.now?.() ?? Date.now(), this.opts.seed); }
}

export function createSaveStore(): SaveStore {
  return new Store(createStorage());
}

export { makeDefaults, localDay, DEFAULT_SETTINGS } from './defaults';
export { createStorage, requestPersist, type StorageAdapter, type StorageLike } from './storage';
export { migrate, MIGRATIONS } from './migrate';
export { sanitize, SANE_MAX } from './sanitize';
export { TRICK_BOOK, HINT_IDS, KNOWN, RARITIES, CRATE_TIERS, REVEAL_QUEUE_MAX, type SaveDailyExt, type SaveCratesExt } from './schema';
