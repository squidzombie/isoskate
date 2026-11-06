// ROADMAP W1a acceptance: an exhaustive table test, every (state, gesture, label set) → exactly the intent DESIGN §4.3
// gives (with the ordered conflict rules of §4.4, the steering-stroke rule, the G0 fresh-stroke rule and the keyboard
// amend of §4.6). The oracle below is a second, independent statement of those tables (it never calls the module's
// helpers); every state class is crossed with every gesture: none, TAP, long tap, HOLD, the manual key, the grab key,
// and a swipe in each of the 8 directions with each of the 16 label sets (steer × fast × fromRest × swipeDx ≠ 0).
import { describe, expect, it } from 'vitest';
import type { Dir8 } from '../../../src/core/ids';
import { EMPTY_FRAME } from '../../../src/core/input';
import { emptyView, interpret, TRICKS, type InputFrameExt, type Intent, type InterpretView } from '../../../src/tricks';

const DIRS: readonly Dir8[] = ['u', 'd', 'l', 'r', 'ul', 'ur', 'dl', 'dr'];
type Labels = { steer: boolean; fast: boolean; fromRest: boolean; dx: boolean };
const LABELS: Labels[] = [];
for (let m = 0; m < 16; m++) LABELS.push({ steer: !!(m & 1), fast: !!(m & 2), fromRest: !!(m & 4), dx: !!(m & 8) });

type Gesture = { k: 'none' } | { k: 'tap' } | { k: 'longTap' } | { k: 'hold' } | { k: 'key' } | { k: 'grabKey' }
  | { k: 'swipe'; dir: Dir8; l: Labels; amend?: boolean };
const GESTURES: Gesture[] = [{ k: 'none' }, { k: 'tap' }, { k: 'longTap' }, { k: 'hold' }, { k: 'key' }, { k: 'grabKey' }];
for (const dir of DIRS) for (const l of LABELS) GESTURES.push({ k: 'swipe', dir, l });

function frameOf(g: Gesture): InputFrameExt {
  const f: InputFrameExt = { ...EMPTY_FRAME };
  if (g.k === 'tap') f.tap = true;
  if (g.k === 'longTap') f.longTap = true;
  if (g.k === 'hold') { f.hold = true; f.press = true; }
  if (g.k === 'key') { f.manualKey = true; f.press = true; }
  if (g.k === 'grabKey') f.grab = true;
  if (g.k === 'swipe') {
    f.swipe = g.dir; f.swipeSteer = g.l.steer; f.swipeFast = g.l.fast; f.swipeFromRest = g.l.fromRest;
    f.swipeDx = g.l.dx ? 0.3 : 0; f.swipeAmend = !!g.amend;
  }
  return f;
}

// ── The oracle: DESIGN §4.3 / §4.4 restated ──────────────────────────────────────────────────────────────────────
const SIDE = (d: Dir8) => d !== 'u' && d !== 'd';           // has a sideways component
const HORIZ = (d: Dir8) => d === 'l' || d === 'r';
const POPS = (d: Dir8) => d === 'u' || d === 'ur' || d === 'ul';
/** Steering-stroke table (§4.3) and the G0 fresh-stroke rule. */
function counts(state: 'ground' | 'air' | 'grind', d: Dir8, l: Labels): boolean {
  if (!l.steer) return !(l.dx && SIDE(d)) || l.fast || l.fromRest;           // fresh owner strokes, sideways
  if (state === 'ground') return POPS(d) && (l.fast || l.fromRest);           // "other directions: never"
  if (HORIZ(d)) return l.fromRest;                                           // "a fast sideways dodge … never a kickflip"
  return l.fast || l.fromRest;
}
const FLIP_OF: Record<Dir8, string> = { d: 'popShuvit', l: 'kickflip', r: 'heelflip', u: 'impossible', dl: 'varialKickflip',
  dr: 'varialHeelflip', ul: 'hardflip', ur: 'inwardHeelflip' };
const UPGRADE_OF: Record<string, [Dir8, string]> = { kickflip: ['l', 'doubleKickflip'], heelflip: ['r', 'doubleHeelflip'],
  doubleKickflip: ['l', 'tripleKickflip'], doubleHeelflip: ['r', 'tripleHeelflip'], popShuvit: ['d', 'shuvit360'],
  varialKickflip: ['dl', 'treFlip'], varialHeelflip: ['dr', 'laserFlip'] };
const GRIND_OF: Partial<Record<Dir8, string>> = { d: 'fiveO', l: 'boardslide', r: 'feeble', dl: 'tailslide', dr: 'smith' };
const DOUBLE_OF: Partial<Record<Dir8, string>> = { d: 'bluntslide', l: 'lipslide' };

interface Case { name: string; v: Partial<InterpretView>; oracle(g: Gesture): string[] }

const ground = (v: Partial<InterpretView>, name: string): Case => ({ name, v: { mode: 'roll', ...v }, oracle(g) {
  if (g.k === 'swipe' && counts('ground', g.dir, g.l)) {
    if (g.dir === 'u') return ['ollie'];
    if (g.dir === 'ur' || g.dir === 'ul') return [`spinOllie:${g.dir}`];
  }
  if (g.k === 'tap' || g.k === 'longTap') return ['ollie'];
  if (v.manualLatched) return [];
  if (g.k === 'key') return ['manualStart:key'];
  // HOLD → manual only in the link window or on a pad / ledge top, after 0.30 s of stillness.
  if (g.k === 'hold' && ((v.comboWindow ?? -1) > 0 || v.onTop) && (v.pressAge ?? -1) >= 0.3) return ['manualStart:hold'];
  return [];
} });

const manual = (m: InterpretView['manual'], name: string): Case => ({ name, v: { mode: 'manual', manual: m }, oracle(g) {
  if (g.k === 'swipe' && counts('ground', g.dir, g.l)) {
    if (g.dir === 'u') return ['ollie'];
    if (g.dir === 'ur' || g.dir === 'ul') return [`spinOllie:${g.dir}`];
  }
  if (g.k === 'swipe' && g.dir === 'd' && counts('ground', 'd', g.l) && !m!.switched) return ['noseManual'];
  if (g.k === 'tap' || (g.k === 'longTap' && m!.fromHold)) return ['ollie'];
  return [];
} });

type AirV = Partial<InterpretView> & { airLeft: number };
const air = (v: AirV, name: string): Case => ({ name, v: { mode: 'air', ...v }, oracle(g) {
  const out: string[] = [];
  const sw = g.k === 'swipe' && counts('air', g.dir, g.l) ? g.dir : null;
  const tapped = g.k === 'tap' || (g.k === 'longTap' && !v.grab && !v.grabbed);
  const buffer = tapped && v.airLeft <= 0.15;
  if (sw && v.pickOpen) return buffer ? [`pick:${sw}`, 'bufferOllie'] : [`pick:${sw}`];        // rule 1
  if ((v.coyote ?? 0) > 0) {
    if (tapped) return ['ollie'];
    if (sw && counts('ground', sw, (g as { l: Labels }).l)) {
      if (sw === 'u') return ['ollie'];
      if (sw === 'ur' || sw === 'ul') return [`spinOllie:${sw}`];
    }
  }
  const held = g.k === 'hold' || g.k === 'grabKey';
  const flipping = !!v.flip && v.flip.t < v.flip.dur;
  if (v.grab && !held) out.push('grabEnd');
  else if (!v.grab && held && !v.grabbed && !flipping && v.airLeft >= 0.25) out.push('grabStart');
  if (buffer) out.push('bufferOllie');
  if (!sw) return out;
  if ((v.popBleed ?? 0) > 0) return out;                                                      // rule 4
  if (v.airLeft < 0.15) { if (sw === 'u' && !tapped && v.airLeft <= 0.15) out.push('bufferOllie'); return out; }   // rule 5
  if (v.spin && v.spin.t < v.spin.dur && (sw === 'ur' || sw === 'ul')) {
    const own = v.spin.id.startsWith('fs') ? 'ur' : 'ul';
    if (sw === own && v.spin.t / v.spin.dur < 0.6) {
      if (!v.spin.id.endsWith('180')) return out;                                            // a 360 has no upgrade
      if ((v.spin.t + v.airLeft) / 0.5 >= 0.55) out.push(`spinUpgrade:${v.spin.id.replace('180', '360')}`);   // rule 6
      return out;
    }
  }
  if (flipping) {
    const up = UPGRADE_OF[v.flip!.id];
    const dur = up && TRICKS.flips.find((d) => d.id === up[1])!.dur;
    if (up && up[0] === sw && v.flip!.t / v.flip!.dur < 0.6 && (v.flip!.t + v.airLeft) / dur! >= 0.55) out.push(`flipUpgrade:${up[1]}`);
    return out;
  }
  out.push(`flip:${FLIP_OF[sw]}`);
  return out;
} });

type GrindV = NonNullable<InterpretView['grind']>;
const grind = (gv: GrindV, pickOpen: boolean, name: string): Case => ({ name, v: { mode: 'grind', grind: gv, pickOpen }, oracle(g) {
  const sw = g.k === 'swipe' && counts('grind', g.dir, g.l) ? g.dir : null;
  if (sw && pickOpen) return [`pick:${sw}`];
  if (g.k === 'tap' || g.k === 'longTap') return ['popOut'];
  if (!sw) return [];
  if (sw === 'u') return ['popOut'];
  if (sw === 'ur' || sw === 'ul') return [`spinOut:${sw}`];
  if (gv.sinceLock < 0.25) return [];
  // A repeat of the last switch's direction within 0.25 s → its double in place; otherwise a new switch (max 2),
  // and the direction you are already on → its double.
  if (gv.switches > 0 && gv.lastSwitchDir === sw && gv.sinceSwitch <= 0.25) {
    const d = DOUBLE_OF[sw];
    return d && d !== gv.id ? [`switch:${d}:inPlace`] : [];
  }
  if (gv.switches >= 2 || (gv.switches > 0 && gv.sinceSwitch < 0.25)) return [];
  const single = GRIND_OF[sw]!;
  const to = single === gv.id ? DOUBLE_OF[sw] : single;
  return to && to !== gv.id ? [`switch:${to}`] : [];
} });

const flip = (id: string, t: number) => ({ id: id as never, t, dur: TRICKS.flips.find((d) => d.id === id)!.dur });
const spin = (id: string, t: number) => ({ id: id as never, t, dur: TRICKS.spins.find((d) => d.id === id)!.dur });
const gv = (o: Partial<GrindV> = {}): GrindV => ({ id: 'fiftyFifty', sinceLock: 0.5, switches: 0, sinceSwitch: Infinity, lastSwitchDir: null, ...o });

const CASES: Case[] = [
  ground({}, 'roll, no combo'),
  ground({ comboWindow: 0.5, pressAge: 0.35 }, 'roll, link window open, still 0.35 s'),
  ground({ comboWindow: 0.5, pressAge: 0.25 }, 'roll, link window open, still only 0.25 s'),
  ground({ comboWindow: 0.5, pressAge: 0.35, manualLatched: true }, 'roll, window open, latched'),
  ground({ onTop: true, pressAge: 0.4 }, 'roll on a pad, no combo'),
  ground({ comboWindow: 0, pressAge: 0.6 }, 'roll, window expired'),
  manual({ kind: 'manual', switched: false, fromHold: true }, 'manual from a HOLD'),
  manual({ kind: 'noseManual', switched: true, fromHold: false }, 'nose manual (switched), from a pre-press'),
  air({ airLeft: 0.42 }, 'air, flat ollie at +0.18 s'),
  air({ airLeft: 0.42, popBleed: 0.03 }, 'air, pop bleed'),
  air({ airLeft: 0.1 }, 'air, last 0.1 s'),
  air({ airLeft: 0.2 }, 'air, 0.2 s left (no grab)'),
  air({ airLeft: 0.2, pickOpen: true }, 'air, pick window open'),
  air({ airLeft: 0.1, pickOpen: true }, 'air, pick window, last 0.1 s'),
  air({ airLeft: 0.5, coyote: 0.05 }, 'air, coyote'),
  air({ airLeft: 0.42, flip: flip('kickflip', 0.05) }, 'air, kickflip 16 % done'),
  air({ airLeft: 0.25, flip: flip('kickflip', 0.1) }, 'air, kickflip early, little air (upgrade refused)'),
  air({ airLeft: 0.3, flip: flip('kickflip', 0.25) }, 'air, kickflip 78 % done'),
  air({ airLeft: 0.3, flip: flip('kickflip', 0.32) }, 'air, kickflip finished (Double-up next)'),
  air({ airLeft: 0.4, flip: flip('doubleKickflip', 0.1) }, 'air, double kickflip early'),
  air({ airLeft: 0.42, flip: flip('popShuvit', 0.05) }, 'air, pop shove-it early'),
  air({ airLeft: 0.42, flip: flip('varialKickflip', 0.05) }, 'air, varial kickflip early'),
  air({ airLeft: 0.42, spin: spin('fs180', 0.05) }, 'air, FS 180 early'),
  air({ airLeft: 0.42, spin: spin('bs180', 0.05) }, 'air, BS 180 early'),
  air({ airLeft: 0.2, spin: spin('fs180', 0.05) }, 'air, FS 180 early, little air'),
  air({ airLeft: 0.3, spin: spin('fs180', 0.2) }, 'air, FS 180 67 % done'),
  air({ airLeft: 0.3, spin: spin('fs360', 0.1) }, 'air, FS 360'),
  air({ airLeft: 0.4, spin: spin('bs180', 0.05), flip: flip('kickflip', 0.1) }, 'air, BS 180 + kickflip'),
  air({ airLeft: 0.4, grab: true, grabbed: true }, 'air, grabbing'),
  air({ airLeft: 0.4, grabbed: true }, 'air, grab done'),
  grind(gv({ sinceLock: 0.05 }), true, 'grind, 0.05 s after lock (pick window)'),
  grind(gv({ sinceLock: 0.15 }), false, 'grind, 0.15 s after lock'),
  grind(gv(), false, 'grind, 50-50 at 0.5 s'),
  grind(gv({ id: 'boardslide' }), false, 'grind, boardslide picked'),
  grind(gv({ id: 'boardslide', switches: 1, sinceSwitch: 0.1, lastSwitchDir: 'l' }), false, 'grind, just switched ←'),
  grind(gv({ id: 'fiveO', switches: 1, sinceSwitch: 0.4, lastSwitchDir: 'd' }), false, 'grind, switched ↓ 0.4 s ago'),
  grind(gv({ id: 'feeble', switches: 2, sinceSwitch: 0.6, lastSwitchDir: 'r' }), false, 'grind, two switches made'),
];

const norm = (out: readonly Intent[]): string[] => out.map((i) => {
  switch (i.k) {
    case 'spinOllie': case 'spinOut': return `${i.k}:${i.dir}`;
    case 'flip': return `flip:${i.id}`;
    case 'flipUpgrade': case 'spinUpgrade': return `${i.k}:${i.to}`;
    case 'pick': return `pick:${i.dir}`;
    case 'switch': return `switch:${i.to}${i.inPlace ? ':inPlace' : ''}`;
    case 'manualStart': return `manualStart:${i.src}`;
    case 'amend': return `amend:${i.dir}`;
    default: return i.k;
  }
});

describe('interpretation table (DESIGN §4.3, §4.4)', () => {
  let total = 0;
  for (const c of CASES) {
    it(c.name, () => {
      const v: InterpretView = { ...emptyView(), ...c.v } as InterpretView;
      const bad: string[] = [];
      for (const g of GESTURES) {
        const got = norm(interpret(v, frameOf(g), TRICKS, []));
        const want = c.oracle(g);
        total++;
        if (JSON.stringify(got) !== JSON.stringify(want)) {
          const what = g.k === 'swipe' ? `${g.dir} ${JSON.stringify(g.l)}` : g.k;
          bad.push(`${what}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }
  it('covers every state class × gesture × label set', () => {
    expect(CASES.length * GESTURES.length).toBe(total);
    expect(total).toBeGreaterThan(4000);
  });
});

describe('the rules the table encodes, spelled out', () => {
  const view = (o: Partial<InterpretView>) => ({ ...emptyView(), ...o }) as InterpretView;
  const one = (v: Partial<InterpretView>, f: Partial<InputFrameExt>) => norm(interpret(view(v), { ...EMPTY_FRAME, ...f }, TRICKS, []));
  it('a steering-stroke ← in the air that is not fromRest is no flip (and so nothing cancels its steering)', () => {
    expect(one({ mode: 'air', airLeft: 0.4 }, { swipe: 'l', swipeSteer: true, swipeFast: true, swipeDx: -0.5 })).toEqual([]);
    expect(one({ mode: 'air', airLeft: 0.4 }, { swipe: 'l', swipeSteer: true, swipeFromRest: true, swipeDx: -0.5 })).toEqual(['flip:kickflip']);
  });
  it('a hard flick from a steering thumb counts where DESIGN says it does: ↑ ↗ ↖ on the ground, ↓ in the air', () => {
    expect(one({ mode: 'roll' }, { swipe: 'u', swipeSteer: true, swipeFast: true })).toEqual(['ollie']);
    expect(one({ mode: 'roll' }, { swipe: 'ul', swipeSteer: true, swipeFast: true })).toEqual(['spinOllie:ul']);
    expect(one({ mode: 'air', airLeft: 0.4 }, { swipe: 'd', swipeSteer: true, swipeFast: true })).toEqual(['flip:popShuvit']);
    expect(one({ mode: 'roll' }, { swipe: 'l', swipeSteer: true, swipeFast: true })).toEqual([]);
  });
  it('keyboard amend: ↑ then → on the ground is a FS 180 ollie; ← then ↓ in the air a Varial Kickflip; too late is a new swipe', () => {
    const amend = { swipeFast: true, swipeAmend: true };
    expect(one({ mode: 'air', airLeft: 0.55, popBleed: 0.05, amend: { kind: 'ollie', age: 0.05, progress: 0 } }, { swipe: 'ur', ...amend }))
      .toEqual(['amend:ur']);
    expect(one({ mode: 'air', airLeft: 0.4, flip: flip('kickflip', 0.05), amend: { kind: 'flip', age: 0.05, progress: 0.16 } }, { swipe: 'dl', ...amend }))
      .toEqual(['amend:dl']);
    expect(one({ mode: 'air', airLeft: 0.4, flip: flip('kickflip', 0.1), amend: { kind: 'flip', age: 0.1, progress: 0.31 } }, { swipe: 'dl', ...amend }))
      .toEqual([]);                                     // too late to amend, and a rotating flip ignores other swipes
    expect(one({ mode: 'roll' }, { swipe: 'ul', ...amend })).toEqual(['spinOllie:ul']);   // ← did nothing on the ground
    expect(one({ mode: 'grind', grind: gv({ id: 'boardslide', switches: 1, sinceSwitch: 0.05, lastSwitchDir: 'l' }),
      amend: { kind: 'switch', age: 0.05, progress: 0 } }, { swipe: 'dl', ...amend })).toEqual(['switch:tailslide:inPlace']);
  });
});
