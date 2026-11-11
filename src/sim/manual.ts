// sim/manual.ts: Manual and Nose Manual (DESIGN §6.4, §4.4 rule 3).
// Start: a ground HOLD while the combo's link window is open, or on a manual pad / raised landable top at any time
// (after RULES.manualHoldSec of stillness, sim/step.ts → tricks/interpret.ts); a pre-press held through a touchdown
// (the press went down 0.30–0.10 s before it); a grab held through touchdown; or the manual key on the ground.
// No fail state, steering gain 1.0. Budget per combo 3.0, 2.2, 1.6, 1.2, then 1.0 s: when it runs out the board drops
// with a wobble and the link window starts. A bump ends it. Lifting coasts 0.30 s (a tap in the coast is a linked
// ollie). ↓ (once per manual) switches to a Nose Manual. Scoring: entry + perSec·t (Manual 75 + 100/s, Nose Manual
// 100 + 125/s; the switch closes the Manual entry and opens a Nose Manual one), counted up every tick so the combo
// pill moves while you ride; no decay. A manual scores inside a combo, and a deliberate one starts a combo (a pad or
// ledge top, a pre-press, a grab held through touchdown: DESIGN §12.3 "Hold = manual. The combo counter … appear");
// the manual key on flat ground outside a combo rides unscored, as a resting thumb there does nothing. The first
// manual of a combo adds its one link and refreshes the heat; every manual pauses the window, and the heat too unless
// it is a back-to-back manual (RULES.backToBackManualPausesHeat).
import type { InputFrame } from '../core/input';
import type { ManualId, PropKind } from '../core/ids';
import { DT, MANUAL } from '../core/tuning';
import type { ComboEntry } from '../core/sim';
import type { ManualDef } from '../core/tricks';
import { RULES, addTrick, finishTrick, liveTrick, openWindow, pauseWindow, refreshHeat } from '../tricks';
import { MANUAL_END_WOBBLE } from './consts';
import type { Ctx, SimState } from './state';
import { payLandmark } from './bonus';

/** Kinds whose top counts as "a manual pad or ledge top" (a HOLD there starts a manual outside a combo). Any other
 *  obstacle top the board rides counts too when it is a raised landable top (it has a landable body). */
export const TOP_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(['manual_pad', 'granite_ledge', 'bench', 'planter',
  'planter_tree', 'garden_wall', 'crate_stack', 'pallet_2', 'pallet_3', 'loading_dock', 'skywalk', 'hubba', 'cherry_planter']);

export function onTop(k: Ctx): boolean {
  const id = k.st.groundOb;
  if (id < 0) return false;
  const ob = k.world.obstacle(id);
  if (!ob) return false;
  if (TOP_KINDS.has(ob.kind)) return true;
  const y = k.st.cur.p.y;
  for (const so of ob.solids) if (so.top === 'landable' && Math.abs(so.box.y1 - y) < 1e-6) return true;
  return false;
}

/** The budget of the next manual in this combo (DESIGN §6.4: 3.0, 2.2, 1.6, 1.2, then 1.0). */
export function budgetOf(n: number): number { return n < MANUAL.budgets.length ? MANUAL.budgets[n]! : MANUAL.budgetFloor; }

export function startManual(k: Ctx, src: NonNullable<SimState['manualSrc']>): void {
  const st = k.st, c = st.cur, sc = st.score;
  if (c.mode !== 'roll') return;
  const scores = sc.combo.active || src !== 'key' || onTop(k);
  const n = sc.combo.active ? sc.combo.manualCount : 0;
  const backToBack = st.manualsSinceAir > 0;
  st.manualsSinceAir++;
  c.mode = 'manual';
  c.manual = { kind: 'manual', t: 0, budget: budgetOf(n), coast: -1, switched: false };
  st.manualEntry = -1;
  st.manualSrc = src;
  st.manualLatch = true;                             // no restart until the hold / key / press is released
  st.manualHeat = false;
  st.timedCarry = false;
  st.manualPartT0 = 0;
  if (scores) {
    const link = !sc.combo.active || !sc.combo.manualLinked;
    st.manualEntry = entryFor(k, 'manual', link);    // starts the combo when there is none
    sc.combo.manualLinked = true;
    sc.combo.manualCount++;
    if (link) refreshHeat(sc);                       // the one linked manual starts a link-adding trick
    st.manualHeat = !link && backToBack && !RULES.backToBackManualPausesHeat;
    pauseWindow(sc);
  }
  k.ev.push({ t: 'manualStart', tick: c.tick, kind: 'manual' });
  if (scores) payLandmark(k, st.groundOb);
}

function defOf(k: Ctx, kind: ManualId): ManualDef {
  const ds = k.tables.manuals;
  for (let i = 0; i < ds.length; i++) if (ds[i]!.id === kind) return ds[i]!;
  return ds[0]!;
}

function entryFor(k: Ctx, kind: ManualId, link: boolean): number {
  const sc = k.st.score;
  const e = addTrick(sc, k.ev, k.st.cur.tick, 'manual', kind, defOf(k, kind).entry, { link, emit: false });
  return sc.combo.entries.indexOf(e);
}

/** Points of the running part after `dur` seconds (a part a gateway bank cut pays no entry points again). */
function partPts(k: Ctx, kind: ManualId, dur: number): number {
  const def = defOf(k, kind);
  return (k.st.timedCarry ? 0 : def.entry) + def.perSec * dur;
}

function runningEntry(k: Ctx, kind: ManualId): ComboEntry | undefined {
  const st = k.st;
  const e = st.manualEntry >= 0 ? st.score.combo.entries[st.manualEntry] : undefined;
  return e && e.id === kind ? e : undefined;
}

/** Close the running manual entry with its points so far (entry + perSec·t). */
function closeEntry(k: Ctx, kind: ManualId, dur: number): void {
  const st = k.st, entry = runningEntry(k, kind);
  if (entry) finishTrick(st.score, k.ev, st.cur.tick, 'manual', entry, partPts(k, kind, dur));
  st.manualEntry = -1;
}

/** The running manual's combo entry (before a gateway bank: sim/pickups.ts carries it over). */
export function manualEntryNow(k: Ctx): ComboEntry | undefined {
  const m = k.st.cur.manual;
  return m && k.st.cur.mode === 'manual' ? runningEntry(k, m.kind) : undefined;
}

/** A gateway bank cut the running manual (its part so far is in the banked combo): the rest scores into a new combo,
 *  as a flip still rotating does (DESIGN §13.2), without its entry points or a second link. */
export function carryManual(k: Ctx, was: ComboEntry): void {
  const st = k.st, m = st.cur.manual, sc = st.score;
  if (!m) return;
  st.manualPartT0 = m.t;
  st.timedCarry = true;
  const e = addTrick(sc, k.ev, st.cur.tick, 'manual', m.kind, 0, { link: false, emit: false, mod: was.mod, carryFactor: was.factor });
  st.manualEntry = sc.combo.entries.indexOf(e);
  sc.combo.manualLinked = true;
  pauseWindow(sc);
}

/** ↓ while manualling (once per manual): the Nose Manual. The Manual part scores now, the Nose Manual part at the end. */
export function noseManual(k: Ctx): void {
  const st = k.st, c = st.cur, m = c.manual;
  if (!m || m.switched || c.mode !== 'manual') return;
  const scored = !!runningEntry(k, m.kind);
  closeEntry(k, m.kind, m.t - st.manualPartT0);
  m.switched = true;
  m.kind = 'noseManual';
  st.manualPartT0 = m.t;
  st.timedCarry = false;
  if (scored) st.manualEntry = entryFor(k, 'noseManual', false);
  k.ev.push({ t: 'manualStart', tick: c.tick, kind: 'noseManual' });
}

export function endManual(k: Ctx, reason: 'budget' | 'pop' | 'bump' | 'release'): void {
  const st = k.st, c = st.cur, sc = st.score, m = c.manual;
  if (!m) return;
  closeEntry(k, m.kind, m.t - st.manualPartT0);
  st.manualHeat = false;
  k.ev.push({ t: 'manualEnd', tick: c.tick, kind: m.kind, dur: m.t, reason });
  c.manual = null;
  st.manualSrc = null;
  if (c.mode === 'manual') c.mode = 'roll';
  if (reason === 'budget') c.wobble = Math.max(c.wobble, MANUAL_END_WOBBLE);
  if (reason !== 'pop') openWindow(sc);
}

/** One manual tick (after ground following). Ends on budget, after the coast once released, or on a bump. Any press
 *  (a still touch, a HOLD) or the manual key keeps it. The running entry counts up every tick. */
export function manualStep(k: Ctx, f: Readonly<InputFrame>, bumped: boolean): void {
  const c = k.st.cur, m = c.manual;
  if (!m || c.mode !== 'manual') return;
  if (bumped) { endManual(k, 'bump'); return; }
  m.t += DT;
  if (m.t >= m.budget - 1e-9) { endManual(k, 'budget'); return; }
  const e = runningEntry(k, m.kind);
  if (e) liveTrick(e, partPts(k, m.kind, m.t - k.st.manualPartT0));
  if (f.press || f.hold || f.manualKey) { m.coast = -1; return; }
  if (m.coast < 0) m.coast = MANUAL.coast;
  m.coast -= DT;
  if (m.coast <= 1e-9) endManual(k, 'release');
}
