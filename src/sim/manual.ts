// sim/manual.ts: the M0 manual (DESIGN §6.4): HOLD on the ground while the combo's link window is open or on a pad /
// ledge top, or the manual key. No fail state. Budget per combo 3.0, 2.2, 1.6, 1.2, then 1.0 s; lifting coasts 0.30 s;
// a bump ends it; a tap (or ↑ / ↗ ↖) is a linked ollie. Scores entry + perSec·t once inside a combo, one link per combo.
// The window and heat are paused while manualling; the window restarts when it ends.
// TODO(GP W1a): Nose Manual (↓), pre-press on landing, grab → manual, shrinking-budget polish.
import type { InputFrame } from '../core/input';
import type { PropKind } from '../core/ids';
import { DT, MANUAL } from '../core/tuning';
import { addTrick, finishTrick, openWindow, pauseWindow } from '../tricks';
import type { Ctx } from './state';

/** Kinds whose top counts as "a manual pad or ledge top" (a HOLD there starts a manual outside a combo). */
export const TOP_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(['manual_pad', 'granite_ledge', 'bench', 'planter',
  'planter_tree', 'garden_wall', 'crate_stack', 'pallet_2', 'pallet_3', 'loading_dock', 'skywalk', 'hubba', 'cherry_planter']);

export function onTop(k: Ctx): boolean {
  const id = k.st.groundOb;
  if (id < 0) return false;
  const ob = k.world.obstacle(id);
  return !!ob && TOP_KINDS.has(ob.kind);
}

export function startManual(k: Ctx): void {
  const st = k.st, c = st.cur, sc = st.score;
  const n = sc.combo.active ? sc.combo.manualCount : 0;
  const budget = n < MANUAL.budgets.length ? MANUAL.budgets[n]! : MANUAL.budgetFloor;
  if (sc.combo.active) sc.combo.manualCount++;
  c.mode = 'manual';
  c.manual = { kind: 'manual', t: 0, budget, coast: -1, switched: false };
  st.manualEntry = -1;
  if (sc.combo.active) {
    const def = k.tables.manuals.find((d) => d.id === 'manual')!;
    const link = !sc.combo.manualLinked;
    sc.combo.manualLinked = true;
    const e = addTrick(sc, k.ev, c.tick, 'manual', 'manual', def.entry, { link, emit: false });
    st.manualEntry = sc.combo.entries.indexOf(e);
    pauseWindow(sc);
  }
  k.ev.push({ t: 'manualStart', tick: c.tick, kind: 'manual' });
}

export function endManual(k: Ctx, reason: 'budget' | 'pop' | 'bump' | 'release'): void {
  const st = k.st, c = st.cur, sc = st.score, m = c.manual;
  if (!m) return;
  const def = k.tables.manuals.find((d) => d.id === m.kind)!;
  const entry = st.manualEntry >= 0 ? sc.combo.entries[st.manualEntry] : undefined;
  if (entry && entry.id === m.kind) finishTrick(sc, k.ev, c.tick, 'manual', entry, def.entry + def.perSec * m.t);
  st.manualEntry = -1;
  k.ev.push({ t: 'manualEnd', tick: c.tick, kind: m.kind, dur: m.t, reason });
  c.manual = null;
  if (c.mode === 'manual') c.mode = 'roll';
  if (reason === 'budget') c.wobble = Math.max(c.wobble, 0.3);
  if (reason !== 'pop') openWindow(sc);
}

/** One manual tick (after ground following). Ends on budget, after the coast once released, or on a bump. */
export function manualStep(k: Ctx, f: Readonly<InputFrame>, bumped: boolean): void {
  const c = k.st.cur, m = c.manual;
  if (!m || c.mode !== 'manual') return;
  if (bumped) { endManual(k, 'bump'); return; }
  m.t += DT;
  if (m.t >= m.budget - 1e-9) { endManual(k, 'budget'); return; }
  const held = f.hold || f.manualKey;
  if (held) { m.coast = -1; return; }
  if (m.coast < 0) m.coast = MANUAL.coast;
  m.coast -= DT;
  if (m.coast <= 1e-9) endManual(k, 'release');
}
