// Music theory of the engine (DESIGN §9, §19.1): relative-major pentatonic in minor keys for feedback and coins,
// the DESIGN voicings verbatim, a smooth alternate voice-led set, the gateway V7 pivots, no clashing melody notes.
import { describe, expect, it } from 'vitest';
import { AREA_MUSIC, COIN, FEEDBACK, VOICING_RANGE, type MusicArea } from '../../../src/audio/mix.config';
import {
  allowedPool, altBars, chordPcs, coinMidi, feedbackMidi, isAvoid, midiHz, mod12, pentatonicNote, pentatonicPcs, pentatonicRoot, pivotChord, tuneHz,
} from '../../../src/audio/music/progressions';

const AREAS = Object.keys(AREA_MUSIC) as MusicArea[];

describe('keys and pentatonics', () => {
  it('BPMs and keys from DESIGN §19.1', () => {
    expect([AREA_MUSIC.downtown.bpm, AREA_MUSIC.suburbs.bpm, AREA_MUSIC.docks.bpm, AREA_MUSIC.neon.bpm, AREA_MUSIC.menu.bpm]).toEqual([84, 80, 78, 88, 76]);
    expect(AREA_MUSIC.downtown).toMatchObject({ tonic: 5, mode: 'major' });     // F
    expect(AREA_MUSIC.suburbs).toMatchObject({ tonic: 9, mode: 'minor' });      // A minor
    expect(AREA_MUSIC.docks).toMatchObject({ tonic: 0, mode: 'minor' });        // C minor
    expect(AREA_MUSIC.neon).toMatchObject({ tonic: 2, mode: 'major' });         // D
    expect(AREA_MUSIC.menu).toMatchObject({ tonic: 3, mode: 'major' });         // E♭
  });

  it('minor keys use the relative major pentatonic: Suburbs → C, Docks → E♭', () => {
    expect(pentatonicRoot(AREA_MUSIC.suburbs)).toBe(0);
    expect(pentatonicRoot(AREA_MUSIC.docks)).toBe(3);
    expect(pentatonicPcs(AREA_MUSIC.suburbs).sort((a, b) => a - b)).toEqual([0, 2, 4, 7, 9]);   // C D E G A
    expect(pentatonicPcs(AREA_MUSIC.docks).sort((a, b) => a - b)).toEqual([0, 3, 5, 7, 10]);   // E♭ F G B♭ C
    expect(pentatonicPcs(AREA_MUSIC.downtown).sort((a, b) => a - b)).toEqual([0, 2, 5, 7, 9]); // F G A C D
  });

  it('feedback and coin notes are always in the pentatonic, climb one degree per step, capped at two octaves', () => {
    for (const area of AREAS) {
      const a = AREA_MUSIC[area], pent = new Set(pentatonicPcs(a));
      let prevCoin = -1;
      for (let n = 0; n <= 14; n++) {
        const m = coinMidi(a, n, COIN.octave, COIN.maxDegrees);
        expect(pent.has(mod12(m))).toBe(true);
        if (n <= COIN.maxDegrees) { expect(m).toBeGreaterThan(prevCoin); prevCoin = m; } else expect(m).toBe(prevCoin);
        expect(m - coinMidi(a, 0, COIN.octave, COIN.maxDegrees)).toBeLessThanOrEqual(24);
      }
      expect(coinMidi(a, 0, COIN.octave, COIN.maxDegrees)).toBe(12 * (COIN.octave + 1) + pentatonicRoot(a));   // tonic, octave 5
      for (const bar of a.bars) for (const ch of bar) {
        let prev = -1;
        for (let seq = 0; seq <= FEEDBACK.maxDegrees; seq++) {
          const m = feedbackMidi(a, ch, seq, FEEDBACK.octave, FEEDBACK.maxDegrees);
          expect(pent.has(mod12(m))).toBe(true);
          expect(isAvoid(m, chordPcs(ch))).toBe(false);                       // never clashes with the chord
          expect(m).toBeGreaterThanOrEqual(prev);                             // rising (or held) melody
          prev = m;
        }
      }
    }
  });
});

describe('progressions and voicings', () => {
  it('DESIGN §19.1 voicings verbatim (bass | EP)', () => {
    const d = AREA_MUSIC.downtown.bars.map((b) => b.map((c) => [c.name, c.bass, ...c.voicing]));
    expect(d).toEqual([[['Gm9', 43, 58, 62, 65, 69]], [['C9', 48, 58, 62, 64, 67]], [['Fmaj9', 41, 57, 60, 64, 67]], [['Dm9', 38, 53, 57, 60, 64]]]);
    expect(AREA_MUSIC.suburbs.bars[3]!.map((c) => [c.name, c.beats])).toEqual([['Gm9', 2], ['C9', 2]]);
    expect(AREA_MUSIC.docks.bars[3]![0]).toMatchObject({ name: 'G7alt', bass: 43, voicing: [53, 59, 63, 70] });
    expect(AREA_MUSIC.neon.bars[1]![0]).toMatchObject({ name: 'A13', bass: 45, voicing: [55, 59, 61, 66] });
    for (const area of AREAS) for (const bar of AREA_MUSIC[area].bars) expect(bar.reduce((s, c) => s + c.beats, 0)).toBe(4);
  });

  it('the bass is the chord root, below every EP voice', () => {
    for (const area of AREAS) for (const bar of AREA_MUSIC[area].bars) for (const ch of bar) {
      expect(ch.bass).toBeLessThan(Math.min(...ch.voicing));
      expect(ch.bass).toBeGreaterThanOrEqual(36);
      expect(ch.bass).toBeLessThanOrEqual(48);
    }
  });

  it('alternate set: same pitch classes, in range, smooth voice leading (≤ 10 semitones per change, never rougher than DESIGN)', () => {
    const moveOf = (v: readonly number[], w: readonly number[]) => v.reduce((s, m, k) => s + Math.abs(m - w[k]!), 0);
    for (const area of AREAS) {
      const prim = AREA_MUSIC[area].bars.flat(), alt = altBars(AREA_MUSIC[area].bars).flat();
      expect(alt.length).toBe(prim.length);
      let altTotal = 0, primTotal = 0;
      for (let i = 0; i < alt.length; i++) {
        const v = alt[i]!.voicing;
        expect(new Set(v.map(mod12))).toEqual(new Set(prim[i]!.voicing.map(mod12)));
        for (const m of v) { expect(m).toBeGreaterThanOrEqual(VOICING_RANGE.lo); expect(m).toBeLessThanOrEqual(VOICING_RANGE.hi); }
        const j = (i + 1) % alt.length, move = moveOf(v, alt[j]!.voicing);
        expect(move, `${area} ${alt[i]!.name} → ${alt[j]!.name}`).toBeLessThanOrEqual(10);
        altTotal += move; primTotal += moveOf(prim[i]!.voicing, prim[j]!.voicing);
      }
      expect(altTotal, area).toBeLessThanOrEqual(primTotal);
    }
  });

  it('gateway pivots are the new key V7 (♭9 in minor keys) with the dominant in the bass', () => {
    const v7 = (area: MusicArea) => pivotChord(AREA_MUSIC[area], [55, 59, 62, 65]);
    expect(mod12(v7('downtown').bass)).toBe(0);                      // C7 → F
    expect(mod12(v7('suburbs').bass)).toBe(4);                       // E7♭9 → A minor
    expect(mod12(v7('docks').bass)).toBe(7);                         // G7♭9 → C minor
    expect(mod12(v7('neon').bass)).toBe(9);                          // A7 → D
    expect(new Set(v7('suburbs').voicing.map(mod12))).toEqual(new Set([8, 2, 5, 11]));   // G♯ D F B
    expect(new Set(v7('downtown').voicing.map(mod12))).toEqual(new Set([4, 10, 2, 7]));  // E B♭ D G
  });

  it('melody pools never contain avoid notes', () => {
    for (const area of AREAS) for (const bar of AREA_MUSIC[area].bars) for (const ch of bar) {
      const pool = allowedPool(AREA_MUSIC[area], ch, 60, 86);
      expect(pool.length).toBeGreaterThanOrEqual(6);
      for (const m of pool) expect(isAvoid(m, chordPcs(ch))).toBe(false);
    }
  });

  it('pitch helpers', () => {
    expect(midiHz(69)).toBe(440);
    expect(midiHz(81)).toBeCloseTo(880, 9);
    expect(pentatonicNote(AREA_MUSIC.downtown, 0, 4)).toBe(65);      // F4
    expect(pentatonicNote(AREA_MUSIC.downtown, 5, 4)).toBe(77);      // F5
    expect(pentatonicNote(AREA_MUSIC.downtown, -1, 5)).toBe(74);     // D5
  });

  it('tuneHz: the wheel whir lands on a chord tone near its nominal pitch (or the key pentatonic with no chord)', () => {
    for (const area of ['downtown', 'suburbs', 'docks', 'neon', 'menu'] as MusicArea[]) {
      for (const bar of AREA_MUSIC[area].bars) for (const ch of bar) {
        for (const hz of [810, 900, 990]) {
          const f = tuneHz(AREA_MUSIC[area], ch, hz), m = Math.round(69 + 12 * Math.log2(f / 440));
          expect(chordPcs(ch).has(((m % 12) + 12) % 12), `${area} ${ch.name} ${hz}`).toBe(true);
          expect(Math.abs(Math.log2(f / hz)) * 12).toBeLessThanOrEqual(6);
        }
      }
      const f = tuneHz(AREA_MUSIC[area], null, 900), m = Math.round(69 + 12 * Math.log2(f / 440));
      expect(pentatonicPcs(AREA_MUSIC[area])).toContain(((m % 12) + 12) % 12);
    }
  });
});
