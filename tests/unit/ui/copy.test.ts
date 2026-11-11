// RECLAIM copy (THEME §9; T6): the banned-word grep over every player-facing string table, and the crash lines.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AREA_ORDER, type AreaId, type PropKind } from '../../../src/core/ids';
import { AREA_SUBTITLES, EMPTY, LOADING_LINES } from '../../../src/ui/copy';
import { crashCause, kindNoun, withArticle } from '../../../src/ui/format';

const ROOT = new URL('../../../', import.meta.url).pathname;
/** THEME §9: banned in all player-facing text (word starts, so "evacuated" and "survivors" are caught too). */
const BANNED = ['zombie', 'apocalypse', 'post-apocalyptic', 'outbreak', 'infected', 'quarantine', 'evacuat', 'survivor', 'last',
  'remains', 'abandoned', 'nature is healing'];
const bannedIn = (t: string) => BANNED.filter((b) => new RegExp(`\\b${b.replace(/[-]/g, '\\-')}`, 'i').test(t));

/** Every source that holds player-facing strings: the UI (screens, HUD, hints, toasts, crash lines, copy), the
 *  catalog and trick names, meta (titles, offers, rewards), game (toasts, dialogs), and the in-world signage
 *  (DECOR_BRANDS, NEON_SIGN_WORDS, the sign atlas). Debug tools are not player-facing. */
const SOURCES = ['src/ui', 'src/content', 'src/tricks', 'src/meta', 'src/game', 'src/core/decor.ts', 'src/core/ids.ts',
  'src/world/render/textures/signs.ts'];
const files = (p: string): string[] => {
  const abs = join(ROOT, p);
  if (!statSync(abs).isDirectory()) return [abs];
  return readdirSync(abs).flatMap((f) => files(join(p, f))).filter((f) => f.endsWith('.ts'));
};
/** String literals of a TS source, comments removed, template expressions dropped. Lower-case identifier-like
 *  literals ('lastGiftDay', 'run_end') are keys and ids, not text. */
function literals(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  const out: string[] = [];
  for (const m of code.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
    const t = m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, ' ');
    if (/^[a-z][A-Za-z0-9_.-]*$/.test(t)) continue;
    out.push(t);
  }
  return out;
}

describe('THEME §9 banned words', () => {
  it('no player-facing string table carries a banned word', () => {
    const hits: string[] = [];
    let n = 0;
    for (const f of SOURCES.flatMap(files)) {
      for (const t of literals(readFileSync(f, 'utf8'))) { n++; for (const b of bannedIn(t)) hits.push(`${f.slice(ROOT.length)}: "${b}" in ${JSON.stringify(t.slice(0, 80))}`); }
    }
    expect(n).toBeGreaterThan(500);   // the grep really read the tables
    expect(hits).toEqual([]);
  });
  it('the grep catches what it should', () => {
    expect(bannedIn('The last survivors evacuated the infected zone')).toEqual(['infected', 'evacuat', 'survivor', 'last']);
    expect(bannedIn('Nature is healing')).toEqual(['nature is healing']);
    expect(literals("const a = 'lastGiftDay'; // Last one\nconst b = `+${last.x} coins`;")).toEqual(['+  coins']);
  });
  it('the copy table is the §9 copy', () => {
    expect(LOADING_LINES).toContain('Shooing a cat off the car…');
    expect(EMPTY.trickBook).toBe('No tricks yet. The streets are waiting.');
    expect(EMPTY.noRuns).toBe('The city’s all yours.');
    expect(AREA_SUBTITLES.docks).toBe('the seagrass harbor');
    for (const t of [...LOADING_LINES, ...Object.values(EMPTY), ...Object.values(AREA_SUBTITLES)]) expect(bannedIn(t)).toEqual([]);
  });
});

describe('crash lines name what was drawn (THEME §9, core/skins propSkin)', () => {
  const KINDS = [...readFileSync(join(ROOT, 'src/core/ids.ts'), 'utf8').match(/export type PropKind =([\s\S]*?);/)![1]!
    .matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1] as PropKind);
  const e = (o: Partial<Parameters<typeof crashCause>[0]>, area?: AreaId, ob?: { id: number; variant: number; hgt: number }) =>
    crashCause({ cause: 'slam', kind: null, flipProgress: 0, spinProgress: 0, ...o }, area, ob);
  it('the §9 table', () => {
    expect(e({ kind: 'barrier_low' }, 'downtown')).toBe('Hit the barrier — tap to ollie it');
    expect(e({ kind: 'barrier_low' }, 'suburbs')).toBe('Hit the log — tap to ollie it');
    expect(e({ kind: 'holo_gate' }, 'neon')).toBe('Hit the holo gate — tap to ollie it');
    expect(e({ kind: 'parked_van' }, 'suburbs')).toBe('Clipped a van — steer around it');
    expect(e({ kind: 'trash_can' }, 'downtown')).toBe('Clipped a bin — steer around it');
    expect(e({ kind: 'vending_bank' }, 'neon')).toBe('Clipped a vending machine — steer around it');
    expect(e({ cause: 'fall', kind: 'trench' }, 'downtown')).toBe('Dropped into the gap — ollie it or take the plank');
    expect(e({ cause: 'fall', kind: 'trench' }, 'suburbs')).toBe('Dropped into the ditch — ollie it or take the plank');
    expect(e({ cause: 'fall', kind: 'trench' }, 'neon')).toBe('Dropped into the trench — ollie it or take the plank');
    expect(e({ cause: 'fall' }, 'docks')).toBe('Dropped into the gap — ollie it or take the plank');
    expect(e({ cause: 'splash', kind: 'fountain' }, 'downtown')).toBe('Splashed into the fountain');
    expect(e({ cause: 'splash' }, 'docks')).toBe('Splashed into the harbor');
  });
  it('a varying skin names its drawn body: the same fields as the kits', () => {
    const nouns = new Set<string>();
    for (let id = 1; id <= 60; id++) nouns.add(kindNoun('container', 'docks', { id, variant: id % 3, hgt: 2.6 }).noun);
    expect([...nouns].sort()).toEqual(['bus', 'container', 'truck']);
    expect(e({ kind: 'container' }, 'docks', { id: 7, variant: 0, hgt: 2.6 }))
      .toBe(`Clipped ${withArticle(kindNoun('container', 'docks', { id: 7, variant: 0, hgt: 2.6 }).noun)} — steer around it`);
    expect(e({ kind: 'wheelie_bins' }, 'suburbs')).toBe('Clipped bins — steer around them');
    expect(withArticle('ibeam')).toBe('an ibeam');
  });
  it('every kind in every area reads as plain copy (no "a something", no banned or theme words)', () => {
    expect(KINDS.length).toBeGreaterThan(60);
    for (const area of AREA_ORDER) for (const kind of KINDS) for (const cause of ['slam', 'badLanding'] as const) {
      for (let id = 1; id <= 8; id++) {
        const line = e({ cause, kind }, area, { id, variant: id % 4, hgt: 1.6 });
        expect(line, `${area} ${kind}`).not.toMatch(/something|undefined|_|\ba [aeiou]|\ban [^aeiou\s]|overgrown|mossy/i);
        expect(bannedIn(line), line).toEqual([]);
      }
    }
  });
});
