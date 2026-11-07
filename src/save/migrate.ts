// save/migrate.ts: version upgrades (TECH §10.5: JSON.parse → migrate → deep-merge with defaults → sanitize).
// v1 is the only shipped schema. The scaffold: each entry upgrades a save from version n to n + 1; a save without a
// `v` is treated as version 0 (a pre-release dev save), and one from a newer build is read field-by-field as v1
// (sanitize keeps what it understands), so a downgrade never throws progress away.
import { SAVE_VERSION } from '../core/save';

type Raw = Record<string, unknown>;

/** MIGRATIONS[n] upgrades a version-n object to version n + 1. Add one entry per new SaveVn. */
export const MIGRATIONS: Readonly<Record<number, (s: Raw) => Raw>> = {
  // v0 → v1: pre-release saves had no version field and kept coins at the top level.
  0: (s) => {
    const out: Raw = { ...s, v: 1 };
    if (typeof s.coins === 'number' && !s.wallet) out.wallet = { coins: s.coins };
    delete out.coins;
    return out;
  },
};

const isObj = (x: unknown): x is Raw => !!x && typeof x === 'object' && !Array.isArray(x);

/** Upgrades a parsed save to SAVE_VERSION. Returns null for anything that is not a save object. */
export function migrate(raw: unknown): Raw | null {
  if (!isObj(raw)) return null;
  let s: Raw = raw;
  let v = typeof s.v === 'number' && Number.isInteger(s.v) ? s.v : s.v === undefined ? 0 : NaN;
  if (!Number.isFinite(v) || v < 0) return null;
  // A save object needs at least one of the v1 sections; a bare `{}` or an unrelated JSON document is rejected.
  if (!('wallet' in s) && !('xp' in s) && !('owned' in s) && !('coins' in s)) return null;
  if (v > SAVE_VERSION) return { ...s, v: SAVE_VERSION };
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    s = step(s);
    v++;
  }
  return s;
}
