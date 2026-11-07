// ui/screens/settings.ts: Settings (DESIGN §17.2). Every control raises UiIntent 'settings' (game/app.ts writes the
// save and re-applies the modules); the screen shows the values the App passes (UiApi.show params.settings).
//   Audio: music and SFX sliders, "No sound? Check the silent switch".
//   Feel: haptics Off / Key moments / All, screen shake, reduce effects (lo-fi overlay and speed lines), reduce
//         motion, quality auto/low/med/high, battery saver (30 fps).
//   Controls: touch controls Two thumbs (default: left steers, right tricks) / One thumb (classic) (touch screens only:
//         a mouse always plays one thumb), swap sides (steer right, tricks left; dimmed while One thumb is selected),
//         steering sensitivity 0.6–1.6, simple tricks (diagonals snap to cardinals), key preset A / B.
//   Progress: Back up / Restore (SaveStore.export / import: copy, share or download a file; paste or pick one), the
//         "progress won't be saved" warning without storage, reset progress (double confirm).
//   Privacy: usage stats on this device (the analytics opt-out), restore purchases. Credits.
import { BUILD, GAME_NAME } from '../../core/ids';
import type { SaveV1 } from '../../core/save';
import { isMetaExt, type MetaExt } from '../../meta';
import { DEFAULT_SETTINGS } from '../../save';
import { h, setText } from '../h';
import { btn, header, section, type Screen, type ScreenCtx } from './common';

type Settings = SaveV1['settings'];
type Key = keyof Settings;

export function settingsScreen(ctx: ScreenCtx): Screen {
  let cur: Settings = { ...DEFAULT_SETTINGS };
  const refresh: (() => void)[] = [];
  const set = (key: Key, value: Settings[Key]) => {
    (cur as Record<Key, unknown>)[key] = value;
    if (key === 'controls') dimSwap();
    ctx.raise({ k: 'settings', key, value });
    ctx.emit({ t: 'settings', key });
    if (key === 'effects' || key === 'reducedMotion') ctx.lofi.set({ effects: cur.effects, reducedMotion: cur.reducedMotion });
    if (key === 'quality') ctx.lofi.set({ tier: cur.quality === 'auto' ? (ctx.coarse() ? 'med' : 'high') : cur.quality });
  };
  /** Segmented control in a `.setting` row; `map` turns the shown option into the stored value (inverted toggles). */
  const seg = <K extends Key>(label: string, key: K, opts: readonly (readonly [Settings[K], string])[], sub?: string, cls = '') => {
    const buttons = opts.map(([v, name]) => [v, btn(name, () => { set(key, v); mark(); }, ctx, 'seg', undefined, 'toggle')] as const);
    const mark = () => { for (const [v, b] of buttons) { const on = cur[key] === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } };
    refresh.push(mark);
    return h('div', { class: `setting ${cls}`.trim(), 'data-setting': key }, h('div', { class: 'set-label' }, h('span', null, label), sub ? h('small', null, sub) : null),
      h('div', { class: 'segs' }, ...buttons.map((x) => x[1])));
  };
  const onOff = [[false, 'Off'], [true, 'On']] as const;
  const offOn = [[true, 'Off'], [false, 'On']] as const;          // inverted: "Reduce effects: On" stores effects = false
  const slider = (label: string, key: 'music' | 'sfx' | 'steerSensitivity', min: number, max: number, step: number, fmt: (v: number) => string) => {
    const out = h('b', { class: 'slider-val' }, '');
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), 'aria-label': label });
    let last = 0;
    const read = () => Math.round(Number(input.value) / step) * step;
    input.addEventListener('input', () => {
      setText(out, fmt(read()));
      const t = performance.now();
      if (t - last > 120) { last = t; set(key, Math.round(read() * 1000) / 1000); }
    });
    input.addEventListener('change', () => { set(key, Math.round(read() * 1000) / 1000); ctx.sfx('toggle'); });
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    refresh.push(() => { input.value = String(cur[key]); setText(out, fmt(cur[key])); });
    return h('div', { class: 'setting slider' }, h('div', { class: 'set-label' }, h('span', null, label), out), input);
  };
  const pctFmt = (v: number) => `${Math.round(v * 100)}%`;
  // Swap sides only means something with two thumbs: dimmed (still settable) while One thumb is selected.
  const swapRow = seg('Swap sides', 'swapSides', onOff, 'Two thumbs: steer right, tricks left');
  const dimSwap = () => swapRow.classList.toggle('dim', cur.controls === 'one');
  refresh.push(dimSwap);

  const storageWarn = h('div', { class: 'warn' }, 'This browser is not letting Dusklane save: progress won’t be saved after you close it. Use Back up to keep a copy.');
  const resetBtn = btn('Reset progress', () => resetTap(), ctx, 'danger small', undefined, 'back');
  let resetArmed = 0;
  const resetTap = () => {
    if (performance.now() - resetArmed > 4000) { resetArmed = performance.now(); setText(resetBtn, 'Tap again to erase'); return; }
    resetArmed = 0; setText(resetBtn, 'Reset progress');
    confirmBox('Erase all progress?', 'Coins, levels, items and stats on this device are wiped. This cannot be undone.', 'Erase everything', () => {
      ext()?.resetProgress();
      ctx.toast('Progress erased. Restarting…', 1500);
      setTimeout(() => location.reload(), 700);
    });
  };
  const ext = (): MetaExt | null => { const m = ctx.meta(); return isMetaExt(m) ? m : null; };

  const list = h('div', { class: 'scroll set-list' },
    h('h3', null, 'Audio'),
    slider('Music', 'music', 0, 1, 0.05, pctFmt),
    slider('Sound effects', 'sfx', 0, 1, 0.05, pctFmt),
    h('div', { class: 'note' }, 'No sound? Check the silent switch and the volume.'),
    h('h3', null, 'Feel'),
    seg('Haptics', 'haptics', [['off', 'Off'], ['key', 'Key'], ['all', 'All']], 'Key moments or every pop'),
    seg('Screen shake', 'shake', onOff),
    seg('Reduce effects', 'effects', offOn, 'Grain, vignette, speed lines'),
    seg('Reduce motion', 'reducedMotion', onOff),
    seg('Quality', 'quality', [['auto', 'Auto'], ['low', 'Low'], ['med', 'Med'], ['high', 'High']]),
    seg('Battery saver', 'batterySaver', onOff, '30 fps'),
    h('h3', null, 'Controls'),
    seg('Touch controls', 'controls', [['two', 'Two thumbs'], ['one', 'One thumb']], 'Touch screens only · Two: left thumb steers, right thumb tricks · One: classic', 'stack'),
    swapRow,
    slider('Steering sensitivity', 'steerSensitivity', 0.6, 1.6, 0.05, (v) => `${v.toFixed(2)}×`),
    seg('Simple tricks', 'simpleTricks', onOff, 'Diagonals snap to arrows'),
    seg('Keys', 'keyPreset', [['A', 'A'], ['B', 'B']], 'A: A/D + arrows · B: arrows + IJKL'),
    h('h3', null, 'Back up progress'),
    storageWarn,
    h('div', { class: 'note' }, 'Save a copy of your progress, or bring it to another browser.'),
    h('div', { class: 'row' }, btn('Export', () => exportBox(), ctx, 'small'), btn('Restore', () => restoreBox(), ctx, 'small')),
    h('h3', null, 'Privacy'),
    seg('Usage stats', 'analyticsOptOut', offOn, 'Kept on this device only'),
    h('div', { class: 'row' }, btn('Restore purchases', () => void restorePurchases(), ctx, 'small'), resetBtn),
    h('h3', null, 'Credits'),
    h('div', { class: 'note credits' }, `${GAME_NAME} — every model, texture and note is made in code while you play. Fonts: Bungee and Nunito (SIL Open Font License). v${BUILD.version}`));
  const el = section('settings', 'settings', header('SETTINGS', ctx), list);

  // ── modals ──
  const confirmBox = (title: string, text: string, yes: string, onYes: () => void) => {
    const box = h('div', { class: 'confirm' }, h('h3', null, title), h('p', null, text),
      h('div', { class: 'row' }, btn('Keep', () => ctx.modal.close(), ctx, 'small', undefined, 'back'), btn(yes, () => { ctx.modal.close(); onYes(); }, ctx, 'danger small')));
    ctx.modal.show(box, { cls: 'small' });
  };
  const exportBox = () => {
    const m = ext();
    if (!m) return;
    const json = m.exportSave();
    ctx.raise({ k: 'backup' });
    const area = h('textarea', { class: 'code', readonly: true, rows: '5', 'aria-label': 'Progress code', spellcheck: 'false' });
    area.value = json;
    const copy = btn('Copy', () => {
      area.select();
      const done = () => { setText(copy, 'Copied ✓'); ctx.toast('Progress copied'); };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(json).then(done, () => { document.execCommand?.('copy'); done(); });
      else { document.execCommand?.('copy'); done(); }
    }, ctx, 'small');
    const file = () => new Blob([json], { type: 'application/json' });
    const name = `${GAME_NAME.toLowerCase()}-progress-${m.today()}.json`;
    const download = btn('Download', () => {
      const url = URL.createObjectURL(file());
      const a = h('a', { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);          // after the download has started
    }, ctx, 'small');
    const nav = navigator as Navigator & { canShare?(d: object): boolean };
    const share = btn('Share', () => {
      const f = new File([file()], name, { type: 'application/json' });
      void navigator.share?.({ files: [f], title: `${GAME_NAME} progress` }).catch(() => undefined);
    }, ctx, 'small');
    share.style.display = typeof navigator.share === 'function' && typeof File === 'function' && nav.canShare?.({ files: [new File([''], 'x.json', { type: 'application/json' })] }) ? '' : 'none';
    ctx.modal.show(h('div', { class: 'backup' }, h('h3', null, 'Your progress'), h('p', null, 'Keep this code or file somewhere safe. Restore it in Settings on any device.'),
      area, h('div', { class: 'row' }, copy, download, share), btn('Done', () => ctx.modal.close(), ctx, 'small', undefined, 'back')), { cls: 'wide' });
  };
  const restoreBox = () => {
    const area = h('textarea', { class: 'code', rows: '5', placeholder: 'Paste your progress code here', 'aria-label': 'Paste progress code', spellcheck: 'false' });
    const msg = h('p', { class: 'msg' }, '');
    const pick = h('input', { type: 'file', accept: 'application/json,.json,text/plain', class: 'file' });
    pick.addEventListener('change', () => { const f = pick.files?.[0]; if (f) void f.text().then((t) => { area.value = t; }); });
    const doRestore = btn('Restore', () => {
      const json = area.value.trim();
      const m = ext();
      if (!m || !json) { setText(msg, 'Paste a code or pick a file first.'); ctx.sfx('error'); return; }
      ctx.modal.close();
      confirmBox('Replace your progress?', 'The progress on this device is replaced by the backup.', 'Restore', () => {
        if (!m.importSave(json)) { ctx.toast('That code is not a Dusklane backup'); ctx.sfx('error'); return; }
        ctx.raise({ k: 'restore', json });
        ctx.toast('Progress restored. Restarting…', 1500);
        setTimeout(() => location.reload(), 600);
      });
    }, ctx, 'primary small');
    ctx.modal.show(h('div', { class: 'backup' }, h('h3', null, 'Restore progress'), area, h('label', { class: 'file-label' }, 'or pick a file ', pick), msg,
      h('div', { class: 'row' }, btn('Cancel', () => ctx.modal.close(), ctx, 'small', undefined, 'back'), doRestore)), { cls: 'wide' });
  };
  const restorePurchases = async () => {
    const skus = await ctx.monetization().restore();
    ctx.toast(skus.length ? `Restored ${skus.length} purchase${skus.length > 1 ? 's' : ''}` : 'Nothing to restore');
  };

  return {
    id: 'settings', el,
    show(p) {
      const m = ext();
      cur = { ...DEFAULT_SETTINGS, ...(m?.data.settings ?? {}), ...(p.settings ?? {}) };
      for (const f of refresh) f();
      storageWarn.style.display = m && !m.persistent ? '' : 'none';
      resetArmed = 0; setText(resetBtn, 'Reset progress');
    },
  };
}
