// save/ (TECH §10.5, §11.1): migrations, corrupt JSON, a throwing storage, the backup path, export/import round-trip,
// sanitize (clamps, unknown ids, starters owned, equipped owned), debounce and flush.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAVE_VERSION, type SaveV1 } from '../../../src/core/save';
import {
  BACKUP_KEY, createStorage, makeDefaults, migrate, parseSave, sanitize, SAVE_DEBOUNCE_MS, SAVE_KEY, Store, TRICK_BOOK,
  type StorageLike,
} from '../../../src/save';

/** An in-memory Web Storage with switchable failure modes. */
function fakeStorage(opts: { throwOnGet?: boolean; throwOnSet?: boolean; quota?: number } = {}) {
  const m = new Map<string, string>();
  const s: StorageLike & { m: Map<string, string>; opts: typeof opts; writes: number } = {
    m, opts, writes: 0,
    getItem(k) { if (opts.throwOnGet) throw new Error('SecurityError'); return m.get(k) ?? null; },
    setItem(k, v) {
      if (opts.throwOnSet) throw new Error('QuotaExceededError');
      if (opts.quota !== undefined && v.length > opts.quota) throw new Error('QuotaExceededError');
      if (!k.startsWith('__')) s.writes++;
      m.set(k, v);
    },
    removeItem(k) { m.delete(k); },
  };
  return s;
}
const storeOn = (b: StorageLike | null) => new Store(createStorage(b), { now: () => Date.UTC(2026, 10, 6, 12), seed: 7 });

afterEach(() => { vi.useRealTimers(); });

describe('defaults', () => {
  it('a fresh profile: v1, starters owned and equipped, Level 1, no coins, crate meter at 4 km', () => {
    const d = makeDefaults(0, 1);
    expect(d.v).toBe(SAVE_VERSION);
    expect(d.owned).toEqual(['sk_juno', 'bd_plain_maple', 'hm_classic']);
    expect(d.equipped).toEqual({ skater: 'sk_juno', board: 'bd_plain_maple', helmet: 'hm_classic' });
    expect(d.xp).toEqual({ total: 0, level: 1, intoLevel: 0, held: 0 });
    expect(d.wallet.coins).toBe(0);
    expect(d.crateMeter).toEqual({ metres: 0, nextAt: 4000 });
    expect(d.crates.rng.some((x) => x !== 0)).toBe(true);
    expect(makeDefaults(0, 1).crates.rng).toEqual(d.crates.rng);
    expect(makeDefaults(0, 2).crates.rng).not.toEqual(d.crates.rng);
  });
  it('the Trick Book has 36 unique entries', () => {
    expect(TRICK_BOOK.length).toBe(36);
    expect(new Set(TRICK_BOOK).size).toBe(36);
  });
});

describe('migrate', () => {
  it('passes v1 through, upgrades a version-less save, rejects non-saves', () => {
    expect(migrate({ v: 1, wallet: { coins: 3 } })).toEqual({ v: 1, wallet: { coins: 3 } });
    expect(migrate({ coins: 40, xp: { total: 9 } })).toEqual({ v: 1, wallet: { coins: 40 }, xp: { total: 9 } });
    for (const bad of [null, 42, 'x', [], {}, { v: -1, wallet: {} }, { v: 'one', wallet: {} }, { hello: 'world' }]) expect(migrate(bad)).toBeNull();
  });
  it('a save from a newer build is read as v1 (no progress thrown away)', () => {
    expect(migrate({ v: 99, wallet: { coins: 5 } })).toEqual({ v: 1, wallet: { coins: 5 } });
  });
});

describe('sanitize', () => {
  const d = makeDefaults(0, 1);
  it('clamps numbers, drops unknown ids, keeps starters owned and equipped items owned', () => {
    const s = sanitize({
      v: 1,
      wallet: { coins: -50, earnedTotal: Infinity, spentTotal: 'x' },
      xp: { total: 1e99, level: 0, intoLevel: -3, held: NaN },
      owned: ['sk_rook', 'sk_rook', 'bd_does_not_exist', 7],
      equipped: { skater: 'sk_lark', board: 'sk_rook', helmet: 'hm_classic' },   // not owned / wrong slot
      wishlist: 'sk_rook',                                                          // owned → cleared
      unseen: ['sk_rook', 'sk_kofi'],
      trickBook: ['kickflip', 'notATrick', 'kickflip'], postcards: ['suburbs', 'mars'],
      stats: { runs: 2, tricks: { kickflip: 3, bogus: 2, ollie: -1 } },
      settings: { music: 3, sfx: -1, haptics: 'loud', steerSensitivity: 9, keyPreset: 'C', quality: 'ultra', simpleTricks: 'yes' },
      crates: { held: { cardboard: 9, street: -2, pro: 1.7 }, rng: [0, 0, 0, 0], pending: { tier: 'mega', rarity: 'epic', item: null, coins: 0, dup: false } },
    }, d);
    expect(s.wallet).toEqual({ coins: 0, earnedTotal: 0, spentTotal: 0, coinsPurchased: 0 });
    expect(s.xp.level).toBe(1); expect(s.xp.intoLevel).toBe(0); expect(s.xp.held).toBe(0);
    expect(s.xp.total).toBeLessThanOrEqual(1e12);
    expect(s.owned).toEqual(['hm_classic', 'bd_plain_maple', 'sk_juno', 'sk_rook']);
    expect(s.equipped).toEqual({ skater: 'sk_juno', board: 'bd_plain_maple', helmet: 'hm_classic' });
    expect(s.wishlist).toBeNull();
    expect(s.unseen).toEqual(['sk_rook']);
    expect(s.trickBook).toEqual(['kickflip']);
    expect(s.postcards).toEqual(['downtown', 'suburbs']);    // runs > 0: Downtown's postcard is guaranteed
    expect(s.stats.tricks).toEqual({ kickflip: 3 });
    expect(s.settings).toMatchObject({ music: 1, sfx: 0, haptics: 'key', steerSensitivity: 1.6, keyPreset: 'A', quality: 'auto', simpleTricks: false });
    expect(s.crates.held).toEqual({ cardboard: 2, street: 0, pro: 1 });
    expect(s.crates.rng).toEqual(d.crates.rng);               // an all-zero RNG state is replaced
    expect(s.crates.pending).toBeNull();
  });
  it('a well-formed save survives unchanged', () => {
    const good: SaveV1 = { ...makeDefaults(5, 3), owned: ['sk_juno', 'bd_plain_maple', 'hm_classic', 'sk_rook'], trickBook: ['ollie'], postcards: ['downtown'] };
    good.equipped.skater = 'sk_rook';
    good.stats.runs = 4;
    good.crates.pending = { tier: 'street', rarity: 'rare', item: 'sk_rook', coins: 0, dup: false };
    expect(sanitize(JSON.parse(JSON.stringify(good)), makeDefaults(0, 1))).toEqual(good);
  });
});

describe('store: load paths', () => {
  it('fresh storage → defaults; written on flush; reloaded from main', () => {
    const b = fakeStorage();
    const a = storeOn(b);
    expect(a.loadedFrom).toBe('defaults');
    a.mutate((s) => { s.wallet.coins = 120; });
    a.flush();
    const again = storeOn(b);
    expect(again.loadedFrom).toBe('main');
    expect(again.data.wallet.coins).toBe(120);
    expect(again.data.installId).toBe(a.data.installId);
  });
  it('corrupt main → backup; corrupt both → defaults (and the good backup is never overwritten by garbage)', () => {
    const b = fakeStorage();
    const a = storeOn(b);
    a.mutate((s) => { s.wallet.coins = 10; }); a.flush();
    a.mutate((s) => { s.wallet.coins = 20; }); a.flush();      // main 20, backup 10
    expect(JSON.parse(b.m.get(BACKUP_KEY)!).wallet.coins).toBe(10);
    b.m.set(SAVE_KEY, '{"v":1,"wallet":{"coins":2');            // truncated write
    const c = storeOn(b);
    expect(c.loadedFrom).toBe('backup');
    expect(c.data.wallet.coins).toBe(10);
    c.mutate((s) => { s.wallet.coins = 11; }); c.flush();
    expect(JSON.parse(b.m.get(BACKUP_KEY)!).wallet.coins).toBe(10);   // backup = last good, not the garbage
    expect(JSON.parse(b.m.get(SAVE_KEY)!).wallet.coins).toBe(11);
    b.m.set(SAVE_KEY, 'garbage'); b.m.set(BACKUP_KEY, '[]');
    expect(storeOn(b).loadedFrom).toBe('defaults');
  });
  it('a storage that throws on every access → memory fallback, persistent = false, play goes on', () => {
    const b = fakeStorage({ throwOnGet: true, throwOnSet: true });
    const s = storeOn(b);
    expect(s.persistent).toBe(false);
    s.mutate((x) => { x.wallet.coins = 5; });
    expect(() => s.flush()).not.toThrow();
    expect(s.data.wallet.coins).toBe(5);
    expect(s.import(s.export())).toBe(true);
  });
  it('a storage that starts failing mid-session (quota) falls back to memory without losing data', () => {
    const b = fakeStorage();
    const s = storeOn(b);
    s.mutate((x) => { x.wallet.coins = 1; }); s.flush();
    expect(s.persistent).toBe(true);
    b.opts.quota = 10;
    s.mutate((x) => { x.wallet.coins = 2; });
    expect(() => s.flush()).not.toThrow();
    expect(s.persistent).toBe(false);
    expect(s.data.wallet.coins).toBe(2);
  });
  it('no storage at all (sandboxed iframe) → memory', () => {
    const s = storeOn(null);
    expect(s.persistent).toBe(false);
    expect(s.loadedFrom).toBe('defaults');
  });
});

describe('store: writes', () => {
  it('mutate debounces 500 ms; flush writes at once; identical data is not rewritten', () => {
    vi.useFakeTimers();
    const b = fakeStorage();
    const s = storeOn(b);
    s.mutate((x) => { x.wallet.coins = 1; });
    s.mutate((x) => { x.wallet.coins = 2; });
    expect(b.writes).toBe(0);
    expect(s.dirty).toBe(true);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    expect(b.writes).toBe(0);
    vi.advanceTimersByTime(1);
    expect(b.writes).toBe(1);
    expect(JSON.parse(b.m.get(SAVE_KEY)!).wallet.coins).toBe(2);
    s.flush();
    expect(b.writes).toBe(1);
    s.mutate((x) => { x.wallet.coins = 3; });
    s.flush();
    expect(s.dirty).toBe(false);
    expect(b.writes).toBe(3);                                   // backup + main
  });
  it('export → import round-trips; import rejects garbage and leaves the data untouched', () => {
    const s = storeOn(fakeStorage());
    s.mutate((x) => { x.wallet.coins = 777; x.owned.push('sk_rook'); x.trickBook.push('kickflip'); x.stats.best = 12345; });
    const json = s.export();
    const t = storeOn(fakeStorage());
    expect(t.import(json)).toBe(true);
    expect(t.data).toEqual(s.data);
    for (const bad of ['', 'nope', '{}', '[1,2]', '{"hello":1}', 'null']) {
      expect(t.import(bad)).toBe(false);
      expect(t.data).toEqual(s.data);
    }
    expect(parseSave(json, makeDefaults(0, 1))).toEqual(s.data);
  });
  it('reset keeps the install id and the settings, clears progress', () => {
    const s = storeOn(fakeStorage());
    const id = s.data.installId;
    s.mutate((x) => { x.wallet.coins = 900; x.settings.music = 0.2; x.stats.runs = 9; });
    s.reset();
    expect(s.data.installId).toBe(id);
    expect(s.data.settings.music).toBe(0.2);
    expect(s.data.wallet.coins).toBe(0);
    expect(s.data.stats.runs).toBe(0);
  });
});
