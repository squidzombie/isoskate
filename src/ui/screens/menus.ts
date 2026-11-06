// ui/screens/menus.ts: menu screens at stub fidelity (MU replaces them in W3a):
//   - Locker / Shop: see-through over the turntable (top half), drag to rotate (UiIntent 'turntable'), slot tabs and
//     item chips from the catalog (tap = try on, UiIntent 'preview'; Equip on the Locker through MetaApi)
//   - Settings: working controls for the most useful settings (UiIntent 'settings'); values come from the app
//     (UiApi.show params.settings, core since G0), else from the stored save (read-only), else the v1 defaults
//   - Stats (level, session best), Crates, Rewards, Boot: short placeholders
import { GAME_ID, type ItemId, type ScreenId, type Slot } from '../../core/ids';
import type { SaveV1 } from '../../core/save';
import { fmtScore } from '../format';
import { h, setText } from '../h';
import { btn, section, type Screen, type ScreenCtx } from './common';

type Settings = SaveV1['settings'];
/** v1 defaults for the controls shown here (save/defaults.ts owns the real ones). */
const DEFAULT_SETTINGS: Pick<Settings, 'steerSensitivity' | 'simpleTricks' | 'haptics' | 'shake' | 'quality' | 'batterySaver'
  | 'keyPreset' | 'music' | 'sfx'> = { steerSensitivity: 1, simpleTricks: false, haptics: 'key', shake: true, quality: 'auto',
  batterySaver: false, keyPreset: 'A', music: 0.8, sfx: 0.9 };

/** The stored settings, read-only (the save module owns writing). */
function storedSettings(): Partial<Settings> {
  try { return (JSON.parse(localStorage.getItem(`${GAME_ID}.save`) ?? 'null') as { settings?: Partial<Settings> } | null)?.settings ?? {}; }
  catch { return {}; }
}

export function showcaseScreen(ctx: ScreenCtx, id: 'locker' | 'shop', label: string): Screen {
  const { raise } = ctx;
  let slot: Slot = 'skater';
  let picked: ItemId | null = null;
  const list = h('div', { class: 'chips' });
  const note = h('div', { class: 'line small' }, '');
  const equip = btn('Equip', () => {
    const m = ctx.meta();
    if (m && picked) { m.equip(picked); raise({ k: 'preview', id: null }); setText(note, 'Equipped.'); }
  }, raise, 'small');
  equip.style.display = id === 'locker' ? '' : 'none';
  const tabs = h('div', { class: 'row tabs-slot' });
  const fill = () => {
    const m = ctx.meta();
    list.replaceChildren();
    for (const c of m?.catalog() ?? []) {
      if (c.slot !== slot) continue;
      const price = id === 'shop' ? m!.price(c.id).base : 0;
      list.append(btn(`${c.name}${price ? ` · ${price}` : ''}`, () => { picked = c.id; raise({ k: 'preview', id: c.id }); setText(note, `${c.name} — ${c.rarity.toUpperCase()}`); }, raise,
        `chip r-${c.rarity}`));
    }
    for (const b of tabs.children) b.classList.toggle('on', (b as HTMLElement).dataset.slot === slot);
  };
  for (const [s, name] of [['skater', 'Skaters'], ['board', 'Boards'], ['helmet', 'Helmets']] as const) {
    const b = btn(name, () => { slot = s; fill(); }, raise, 'small');
    b.dataset.slot = s;
    tabs.append(b);
  }
  // Drag on the upper half rotates the turntable.
  const spin = h('div', { class: 'turn-area', 'aria-hidden': 'true' });
  let dragX: number | null = null;
  spin.addEventListener('pointerdown', (e) => { dragX = e.clientX; spin.setPointerCapture?.(e.pointerId); });
  spin.addEventListener('pointermove', (e) => { if (dragX === null) return; raise({ k: 'turntable', dYaw: (e.clientX - dragX) * 0.6 }); dragX = e.clientX; });
  const endDrag = () => { dragX = null; };
  spin.addEventListener('pointerup', endDrag); spin.addEventListener('pointercancel', endDrag);
  const el = section(id, 'showcase', h('h2', null, label), spin,
    h('div', { class: 'panel' }, tabs, list, note, h('div', { class: 'row' }, equip, btn('Back', { k: 'home' }, raise, 'small'))));
  return { id, el, show() { picked = null; setText(note, id === 'shop' ? 'Prices in coins. Buying arrives with the shop.' : 'Tap an item to try it on.'); fill(); } };
}

export function settingsScreen(ctx: ScreenCtx): Screen {
  const { raise } = ctx;
  let cur: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const rows: { key: string; set(v: unknown): void }[] = [];
  const seg = (label: string, key: keyof typeof DEFAULT_SETTINGS, opts: readonly (readonly [string | number | boolean, string])[]) => {
    const buttons = opts.map(([v, name]) => {
      const b = btn(name, () => { cur[key] = v; raise({ k: 'settings', key, value: v }); mark(); }, raise, 'seg');
      return [v, b] as const;
    });
    const mark = () => { for (const [v, b] of buttons) b.classList.toggle('on', cur[key] === v); };
    rows.push({ key, set: () => mark() });
    return h('div', { class: 'setting' }, h('span', null, label), h('div', { class: 'segs' }, ...buttons.map((x) => x[1])));
  };
  const onOff = [[false, 'Off'], [true, 'On']] as const;
  const list = h('div', { class: 'scroll' },
    seg('Steering', 'steerSensitivity', [[0.6, '0.6'], [0.8, '0.8'], [1, '1.0'], [1.2, '1.2'], [1.4, '1.4'], [1.6, '1.6']]),
    seg('Simple tricks', 'simpleTricks', onOff),
    seg('Haptics', 'haptics', [['off', 'Off'], ['key', 'Key'], ['all', 'All']]),
    seg('Screen shake', 'shake', onOff),
    seg('Quality', 'quality', [['auto', 'Auto'], ['low', 'Low'], ['med', 'Med'], ['high', 'High']]),
    seg('Battery saver', 'batterySaver', onOff),
    seg('Music', 'music', [[0, '0'], [0.4, '40'], [0.8, '80'], [1, '100']]),
    seg('Sound', 'sfx', [[0, '0'], [0.5, '50'], [0.9, '90'], [1, '100']]),
    seg('Keys', 'keyPreset', [['A', 'A'], ['B', 'B']]),
    h('div', { class: 'line small' }, 'No sound? Check the silent switch.'));
  const el = section('settings', 'dim', h('h2', null, 'SETTINGS'), list, btn('Back', { k: 'home' }, raise, 'small'));
  return {
    id: 'settings', el,
    show(p) {
      cur = { ...DEFAULT_SETTINGS, ...storedSettings(), ...(p.settings ?? {}) };
      for (const r of rows) r.set(cur[r.key]);
    },
  };
}

export function statsScreen(ctx: ScreenCtx): Screen {
  const level = h('div', { class: 'line' }, '');
  const best = h('div', { class: 'line' }, '');
  const el = section('stats', 'dim', h('h2', null, 'STATS'), level, best,
    h('div', { class: 'line small' }, 'Trick Book and postcards arrive with Meta/UI.'), btn('Back', { k: 'home' }, ctx.raise, 'small'));
  return {
    id: 'stats', el,
    show(p) {
      const l = ctx.meta()?.levelInfo();
      setText(level, l ? `Level ${l.level} · ${l.into} / ${l.toNext} XP` : '');
      setText(best, p.best ? `Best this session ${fmtScore(p.best)}` : 'No runs yet this session.');
    },
  };
}

export function placeholderScreen(id: ScreenId, label: string, ctx: ScreenCtx, text = 'Coming soon.'): Screen {
  const el = section(id, 'dim', h('h2', null, label), h('div', { class: 'line' }, text), btn('Back', { k: 'home' }, ctx.raise, 'small'));
  return { id, el, show() { /* static */ } };
}

export function bootScreen(): Screen {
  const el = section('boot', 'paper', h('h1', { class: 'logo' }, 'DUSKLANE'), h('div', { class: 'bar' }, h('i')));
  return { id: 'boot', el, show() { /* static */ } };
}
