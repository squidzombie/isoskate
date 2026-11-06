// The composer (DESIGN §19.1): song form, patterns, B-section kick drop, fills, intensity layers, humanize bounds,
// motif rests, melody notes that never clash, determinism per seed.
import { describe, expect, it } from 'vitest';
import { stepOffset } from '../../../src/audio/clock';
import { AREA_MUSIC, FORM_BARS, MALLET, SCHED, type MusicArea } from '../../../src/audio/mix.config';
import { PATTERN_ROWS, PATTERNS, parseRow } from '../../../src/audio/music/patterns';
import { chordAt, chordPcs, isAvoid } from '../../../src/audio/music/progressions';
import { composeBar, formAt, layersFor, makeMotif, progression, sectionStart, type Level } from '../../../src/audio/music/sequencer';

const AREAS = Object.keys(AREA_MUSIC) as MusicArea[];

describe('patterns and form', () => {
  it('the three DESIGN patterns parse to 16 steps', () => {
    expect(PATTERN_ROWS.A).toEqual({ K: 'x......x..x.....', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.' });
    expect(PATTERNS.A.K.map((h) => h.step)).toEqual([0, 7, 10]);
    expect(PATTERNS.B.S).toEqual([{ step: 4, kind: 'x' }, { step: 12, kind: 'x' }, { step: 15, kind: 'g' }]);
    expect(PATTERNS.C.H.map((h) => h.step)).toEqual([0, 4, 8, 12]);
    expect(() => parseRow('x...')).toThrow();
  });

  it('form: intro 4, A 16, B 8, A′ 16, break 4, A″ 16 = 64 bars', () => {
    expect(FORM_BARS).toBe(64);
    expect(formAt(0).section).toBe('intro');
    expect(formAt(4).section).toBe('A');
    expect(formAt(20)).toMatchObject({ section: 'B', inSection: 0 });
    expect(formAt(28).section).toBe('A2');
    expect(formAt(44).section).toBe('break');
    expect(formAt(48).section).toBe('A3');
    expect(formAt(63).section).toBe('A3');
    expect(sectionStart('A')).toBe(4);
  });

  it('layers: level 0 = EP, pad, muffled drums; 1 adds bass; 2 ghost hats + melody; 3 arp + shaker; melody enters at A′', () => {
    const a = AREA_MUSIC.downtown;
    const on = (l: Level, s = 'A' as const) => Object.entries(layersFor(l, s, a, false)).filter(([, v]) => v).map(([k]) => k).sort();
    expect(on(0)).toEqual(['drums', 'ep', 'pad']);
    expect(on(1)).toEqual(['bass', 'drums', 'ep', 'pad']);
    expect(on(2)).toEqual(['bass', 'drums', 'ep', 'ghost', 'melody', 'pad']);
    expect(on(3)).toEqual(['arp', 'bass', 'drums', 'ep', 'ghost', 'melody', 'pad', 'shaker']);
    expect(layersFor(1, 'A2', a, false).melody).toBe(true);
    expect(layersFor(3, 'intro', a, false).melody).toBe(false);
    expect(layersFor(2, 'A', a, true).melody).toBe(false);           // pivot bar
    expect(layersFor(2, 'A', AREA_MUSIC.neon, false).arp).toBe(true); // Neon: triangle arp from level 2
  });
});

describe('composeBar', () => {
  it('is deterministic per (seed, bar, level) and differs between seeds', () => {
    const a = composeBar({ area: 'downtown', seed: 9, alt: false, bar: 12, level: 3 });
    expect(composeBar({ area: 'downtown', seed: 9, alt: false, bar: 12, level: 3 })).toEqual(a);
    expect(composeBar({ area: 'downtown', seed: 10, alt: false, bar: 12, level: 3 })).not.toEqual(a);
  });

  it('every note sits on its swung step ±8 ms (plus the EP strum), velocities within ±10%', () => {
    for (const area of AREAS) for (let bar = 0; bar < FORM_BARS; bar++) {
      const bpm = AREA_MUSIC[area].bpm;
      for (const e of composeBar({ area, seed: 3, alt: bar % 2 === 1, bar, level: 3 })) {
        const grid = stepOffset(bpm, e.step, SCHED.swing);
        const slack = e.inst === 'ep' ? 0.008 + 0.075 + 0.005 : e.inst === 'clap' ? 0.013 : e.inst === 'pad' ? 0 : 0.008 + 1e-9;
        expect(e.t - grid).toBeGreaterThanOrEqual(-0.008 - 1e-9);
        expect(e.t - grid).toBeLessThanOrEqual(slack);
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(1.1 * 1.06 * 1.6);
      }
    }
  });

  it('B section: the kick drops out in bars 7–8 and the alternate pattern plays', () => {
    const kicks = (bar: number) => composeBar({ area: 'downtown', seed: 1, alt: false, bar, level: 1 }).filter((e) => e.inst === 'kick').length;
    expect(kicks(20 + 6)).toBe(0);
    expect(kicks(20 + 7)).toBe(0);
    expect(kicks(20)).toBeGreaterThan(0);
    const bKicks = composeBar({ area: 'downtown', seed: 1, alt: false, bar: 21, level: 1 }).filter((e) => e.inst === 'kick').map((e) => e.step);
    expect(bKicks).toEqual(PATTERNS.B.K.map((h) => h.step));            // Downtown B section = lazy pattern
  });

  it('fills land on bar 4 of a phrase about half the time (snare roll or kick drop)', () => {
    let fills = 0, phrases = 0;
    for (let seed = 1; seed <= 40; seed++) for (const bar of [7, 11, 15, 19]) {
      phrases++;
      const ev = composeBar({ area: 'downtown', seed, alt: false, bar, level: 1 });
      const roll = ev.filter((e) => (e.inst === 'rim' || e.inst === 'snare') && e.step >= 13).length >= 2;
      const drop = !ev.some((e) => e.inst === 'kick' && e.step >= 8);
      if (roll || drop) fills++;
    }
    expect(fills / phrases).toBeGreaterThan(0.35);
    expect(fills / phrases).toBeLessThan(0.65);
  });

  it('bass: no note a semitone from the voicing above it (the fifth gives way to the octave, e.g. Docks G7alt)', () => {
    let fifths = 0, octaves = 0;
    for (const area of ['downtown', 'suburbs', 'docks', 'neon', 'menu'] as const) {
      for (const alt of [false, true]) {
        const prog = progression(area, alt);
        for (let bar = 4; bar < 64; bar++) {
          const ch = prog[bar % 4]!;
          for (const e of composeBar({ area, seed: 9 + bar, alt, bar, level: 2 }).filter((x) => x.inst === 'bass' && x.step === 8)) {
            const c = chordAt(ch, 2);
            expect(isAvoid(e.midi, chordPcs(c)), `${area} ${alt ? 'alt ' : ''}bar ${bar} ${c.name}: bass ${e.midi}`).toBe(false);
            if (e.midi === c.bass + 7) fifths++; else if (e.midi === c.bass + 12) octaves++;
          }
        }
      }
    }
    expect(fifths).toBeGreaterThan(50);
    expect(octaves).toBeGreaterThan(50);
  });

  it('bass: root on beat 1, fifth/octave or the 2nd chord root on beat 3, chromatic approach into the next root', () => {
    let approaches = 0;
    for (let bar = 4; bar < 64; bar++) {
      const prog = progression('suburbs', false);
      const ev = composeBar({ area: 'suburbs', seed: 5, alt: false, bar, level: 1 }).filter((e) => e.inst === 'bass');
      const ch = prog[bar % 4]!;
      expect(ev[0]).toMatchObject({ step: 0, midi: ch[0]!.bass });
      const b3 = ev.find((e) => e.step === 8)!;
      if (ch.length > 1) expect(b3.midi).toBe(ch[1]!.bass); else expect([ch[0]!.bass + 7, ch[0]!.bass + 12]).toContain(b3.midi);
      const ap = ev.find((e) => e.step === 15);
      if (ap) { approaches++; expect(Math.abs(ap.midi - prog[(bar + 1) % 4]![0]!.bass)).toBe(1); }
    }
    expect(approaches / 60).toBeGreaterThan(0.15);
    expect(approaches / 60).toBeLessThan(0.45);
  });

  it('EP comps on beat 1 and the "and" of 2 most of the time, strummed low → high', () => {
    let classic = 0;
    for (let bar = 4; bar < 64; bar++) {
      const ep = composeBar({ area: 'downtown', seed: 2, alt: false, bar, level: 1 }).filter((e) => e.inst === 'ep');
      const steps = [...new Set(ep.map((e) => e.step))];
      if (steps.includes(0) && steps.includes(6)) classic++;
      const first = ep.filter((e) => e.step === 0);
      for (let i = 1; i < first.length; i++) { expect(first[i]!.t).toBeGreaterThan(first[i - 1]!.t); expect(first[i]!.midi).toBeGreaterThan(first[i - 1]!.midi); }
    }
    expect(classic / 60).toBeGreaterThan(0.5);
  });

  it('melody: rests on about 35% of beats, stays in register, and never plays an avoid note over its chord', () => {
    let beats = 0, rests = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const m = makeMotif(seed);
      for (let b = 0; b < 7; b++) { beats++; if (!m.some((n) => Math.floor(n.step / 4) === b)) rests++; }
    }
    expect(rests / beats).toBeGreaterThan(0.25);
    expect(rests / beats).toBeLessThan(0.45);
    for (const area of AREAS) for (let seed = 1; seed <= 6; seed++) for (let bar = 28; bar < 44; bar++) {
      const prog = progression(area, seed % 2 === 0);
      for (const e of composeBar({ area, seed, alt: seed % 2 === 0, bar, level: 2 }).filter((x) => x.inst === 'mallet')) {
        const ch = chordAt(prog[bar % 4]!, Math.floor(e.step / 4));
        expect(isAvoid(e.midi, chordPcs(ch))).toBe(false);
        expect(e.midi).toBeGreaterThanOrEqual(MALLET.lo - 3);
        expect(e.midi).toBeLessThanOrEqual(MALLET.hi);
      }
    }
  });
});
