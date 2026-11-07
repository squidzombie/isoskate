// ui/screens/stats.ts: Stats (DESIGN §14.3, §17.2): bests (score, combo, distance, time, furthest area), totals
// (runs, distance, tricks), the 36-entry Trick Book grid (count per trick, the longest grind) and the 4 Area
// Postcards (Neon City glows as a silhouette until reached: the aspirational one).
import { AREA_ORDER } from '../../core/ids';
import { isMetaExt, xpToNext } from '../../meta';
import { TRICK_BOOK } from '../../save';
import { TRICKS } from '../../tricks';
import { postcardArt } from '../art';
import { AREA_SUBTITLES, EMPTY } from '../copy';
import { areaName, fmtScore, trickName } from '../format';
import { h, setText } from '../h';
import { bar, fmtN, header, section, type Screen, type ScreenCtx } from './common';

/** Trick Book category of each entry, shown on undiscovered tiles so the book hints at what is out there. */
const CATEGORY = new Map<string, string>([['ollie', 'OLLIE'], ...TRICKS.flips.map((d) => [d.id, 'FLIP'] as [string, string]),
  ...TRICKS.spins.map((d) => [d.id, 'SPIN'] as [string, string]), ...TRICKS.grabs.map((d) => [d.id, 'GRAB'] as [string, string]),
  ...TRICKS.grinds.map((d) => [d.id, 'GRIND'] as [string, string]), ...TRICKS.manuals.map((d) => [d.id, 'MANUAL'] as [string, string])]);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export function statsScreen(ctx: ScreenCtx): Screen {
  const lv = h('b', { class: 'st-lv' }, '1');
  const xp = bar('xp');
  const xpText = h('span', { class: 'xp-text' }, '');
  const titles = h('div', { class: 'st-titles' }, '');
  const bests = h('div', { class: 'st-grid' });
  const totals = h('div', { class: 'st-grid' });
  const bookCount = h('span', { class: 'count' }, '');
  const book = h('div', { class: 'book' });
  const cards = h('div', { class: 'postcards' });
  // Empty states (THEME §9): a fresh profile reads an invitation, not a table of zeros.
  const EMPTY_STYLE = 'margin:2px 0 8px;opacity:.8;font-weight:700';
  const noRuns = h('p', { class: 'st-empty', style: EMPTY_STYLE }, EMPTY.noRuns);
  const noTricks = h('p', { class: 'st-empty', style: EMPTY_STYLE }, EMPTY.trickBook);
  const pcCount = h('span', { class: 'count' }, '');
  const el = section('stats', 'stats', header('STATS', ctx),
    h('div', { class: 'scroll' },
      h('div', { class: 'st-level' }, h('span', { class: 'lv' }, 'LEVEL'), lv, h('div', { class: 'xp-wrap' }, xp.el, xpText), titles),
      h('h3', null, 'Bests'), noRuns, bests, h('h3', null, 'Totals'), totals,
      h('h3', null, 'Trick Book ', bookCount), noTricks, book,
      h('h3', null, 'Postcards ', pcCount), cards));
  const cell = (k: string, v: string) => h('div', { class: 'st-cell' }, h('span', null, k), h('b', null, v));
  return {
    id: 'stats', el,
    show(p) {
      const m = ctx.meta();
      const ext = isMetaExt(m) ? m : null;
      const l = m?.levelInfo() ?? { level: 1, into: 0, toNext: xpToNext(1) };
      setText(lv, String(l.level));
      xp.set(l.into / Math.max(1, l.toNext));
      setText(xpText, `${fmtN(l.into)} / ${fmtN(l.toNext)} XP`);
      const s = ext?.data.stats;
      setText(titles, ext?.data.titles.length ? `Titles: ${ext.data.titles.join(' · ')}` : '');
      bests.replaceChildren(
        cell('Score', fmtScore(Math.max(s?.best ?? 0, p.best ?? 0))), cell('Combo', fmtScore(s?.bestCombo ?? 0)),
        cell('Distance', km(s?.bestDist ?? 0)), cell('Time', mmss(s?.bestTime ?? 0)),
        cell('Furthest', areaName(s?.furthestArea ?? 'downtown')), cell('Longest grind', `${(s?.longestGrind ?? 0).toFixed(1)} s`));
      const tricksTotal = Object.values(s?.tricks ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      totals.replaceChildren(cell('Runs', fmtN(s?.runs ?? 0)), cell('Distance', km(s?.totalDist ?? 0)), cell('Tricks', fmtN(tricksTotal)),
        cell('Time', mmss(s?.totalTime ?? 0)));
      const found = new Set(ext?.data.trickBook ?? []);
      noRuns.hidden = (s?.runs ?? 0) > 0;
      noTricks.hidden = found.size > 0;
      setText(bookCount, `${found.size}/${TRICK_BOOK.length}`);
      book.replaceChildren(...TRICK_BOOK.map((id) => {
        const got = found.has(id);
        return h('div', { class: `tb${got ? ' got' : ''}`, title: got ? trickName(id) : 'Not discovered yet' },
          h('b', null, got ? trickName(id) : '?'), h('span', null, got ? `×${fmtN(s?.tricks[id] ?? 0)}` : CATEGORY.get(id) ?? ''));
      }));
      const pcs = new Set(ext?.data.postcards ?? []);
      setText(pcCount, `${pcs.size}/4`);
      cards.replaceChildren(...AREA_ORDER.map((a) => {
        const got = pcs.has(a);
        const img = h('img', { alt: got ? areaName(a) : 'Locked postcard' }); img.src = postcardArt(a, got);
        return h('figure', { class: `pc${got ? ' got' : ''} a-${a}`, title: got ? AREA_SUBTITLES[a] : '' }, img,
          h('figcaption', null, got ? areaName(a) : a === 'neon' ? 'Neon City ?' : '???', got ? h('small', { style: 'display:block;font-weight:600;opacity:.72;font-size:.82em' }, AREA_SUBTITLES[a]) : null));
      }));
    },
  };
}
