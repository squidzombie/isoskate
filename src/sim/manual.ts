// sim/manual.ts: Manual and Nose Manual (DESIGN §6.4, §4.4 rule 3).
// Start: a ground HOLD while the combo's link window is open, or on a manual pad / raised landable top at any time
// (after RULES.manualHoldSec of stillness, sim/step.ts → tricks/interpret.ts); a pre-press held through a touchdown
// (the press went down 0.30–0.10 s before it); a grab held through touchdown; or the manual key on the ground.
// No fail state, steering gain 1.0. Budget per combo 3.0, 2.2, 1.6, 1.2, then 1.0 s: when it runs out the board drops
// with a wobble and the link window starts. A bump ends it. Lifting coasts 0.30 s (a tap in the coast is a linked
// ollie). ↓ (once per manual) switches to a Nose Manual. Scoring: entry + perSec·t inside a combo (Manual 75 + 100/s,
// Nose Manual 100 + 125/s; the switch closes the Manual entry and opens a Nose Manual one); the first manual of a combo
// adds its one link and refreshes the heat; every manual pauses the window and the heat; no decay.
import type { InputFrame } from '../core/input';
import type { ManualId, PropKind } from '../core/ids';
import { DT, MANUAL } from '../core/tuning';
import { addTrick, finishTrick, openWindow, pauseWindow, refreshHeat } from '../tricks';
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
  const n = sc.combo.active ? sc.combo.manualCount : 0;
  if (sc.combo.active) sc.combo.manualCount++;
  c.mode = 'manual';
  c.manual = { kind: 'manual', t: 0, budget: budgetOf(n), coast: -1, switched: false };
  st.manualEntry = -1;
  st.manualSrc = src;
  st.manualLatch = true;                             // no restart until the hold / key / press is released
  if (sc.combo.active) {
    const link = !sc.combo.manualLinked;
    sc.combo.manualLinked = true;
    if (link) refreshHeat(sc);                       // the one linked manual starts a link-adding trick
    st.manualEntry = entryFor(k, 'manual', link);
    pauseWindow(sc);
  }
  k.ev.push({ t: 'manualStart', tick: c.tick, kind: 'manual' });
  if (sc.combo.active) payLandmark(k, st.groundOb);
}

function entryFor(k: Ctx, kind: ManualId, link: boolean): number {
  const sc = k.st.score;
  const def = k.tables.manuals.find((d) => d.id === kind)!;
  const e = addTrick(sc, k.ev, k.st.cur.tick, 'manual', kind, def.entry, { link, emit: false });
  return sc.combo.entries.indexOf(e);
}

/** Close the running manual entry with its points so far (entry + perSec·t). */
function closeEntry(k: Ctx, kind: ManualId, dur: number): void {
  const st = k.st, sc = st.score;
  const def = k.tables.manuals.find((d) => d.id === kind)!;
  const entry = st.manualEntry >= 0 ? sc.combo.entries[st.manualEntry] : undefined;
  if (entry && entry.id === kind) finishTrick(sc, k.ev, st.cur.tick, 'manual', entry, def.entry + def.perSec * dur);
  st.manualEntry = -1;
}

/** ↓ while manualling (once per manual): the Nose Manual. The Manual part scores now, the Nose Manual part at the end. */
export function noseManual(k: Ctx): void {
  const st = k.st, c = st.cur, m = c.manual;
  if (!m || m.switched || c.mode !== 'manual') return;
  closeEntry(k, m.kind, m.t);
  m.switched = true;
  m.kind = 'noseManual';
  st.manualNoseT0 = m.t;
  if (st.score.combo.active) st.manualEntry = entryFor(k, 'noseManual', false);
  k.ev.push({ t: 'manualStart', tick: c.tick, kind: 'noseManual' });
}

export function endManual(k: Ctx, reason: 'budget' | 'pop' | 'bump' | 'release'): void {
  const st = k.st, c = st.cur, sc = st.score, m = c.manual;
  if (!m) return;
  closeEntry(k, m.kind, m.kind === 'noseManual' ? m.t - st.manualNoseT0 : m.t);
  k.ev.push({ t: 'manualEnd', tick: c.tick, kind: m.kind, dur: m.t, reason });
  c.manual = null;
  st.manualSrc = null;
  if (c.mode === 'manual') c.mode = 'roll';
  if (reason === 'budget') c.wobble = Math.max(c.wobble, MANUAL_END_WOBBLE);
  if (reason !== 'pop') openWindow(sc);
}

/** One manual tick (after ground following). Ends on budget, after the coast once released, or on a bump. Any press
 *  (a still touch, a HOLD) or the manual key keeps it. */
export function manualStep(k: Ctx, f: Readonly<InputFrame>, bumped: boolean): void {
  const c = k.st.cur, m = c.manual;
  if (!m || c.mode !== 'manual') return;
  if (bumped) { endManual(k, 'bump'); return; }
  m.t += DT;
  if (m.t >= m.budget - 1e-9) { endManual(k, 'budget'); return; }
  if (f.press || f.hold || f.manualKey) { m.coast = -1; return; }
  if (m.coast < 0) m.coast = MANUAL.coast;
  m.coast -= DT;
  if (m.coast <= 1e-9) endManual(k, 'release');
}
