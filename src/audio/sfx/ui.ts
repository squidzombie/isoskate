// audio/sfx/ui.ts: interface and meta sounds (DESIGN §19.3 "Other sounds"): taps, back, toggle, error, purchase,
// level up (Maj9 arpeggio on EP + mallet with a 6 kHz shimmer), crate shake / open and the four reveal stingers.
// All of them are in the current key, short and soft; they play on the SFX bus and never through the music chain.
import { LEVEL_UP, SFX_LEVEL, VARIATION } from '../mix.config';
import type { Graph } from '../graph';
import { playEp, playMallet } from '../music/instruments';
import { midiHz, pentatonicNote } from '../music/progressions';
import { gain, osc, perc, vary, voice } from '../synth';
import { PRI } from '../voices';
import { nz, tn, type CueOpts, type KeyInfo } from './oneshots';

/** Maj9 of the key's pentatonic root (the relative major in minor keys), as MIDI notes 1 3 5 7 9 from octave 4. */
function maj9(key: KeyInfo, octave: number): number[] {
  const r = pentatonicNote(key.area, 0, octave);
  return [r, r + 4, r + 7, r + 11, r + 14];
}

export function playUi(g: Graph, id: string, t: number, o: CueOpts, key: KeyInfo): void {
  const L = SFX_LEVEL;
  const v = (len: number, lvl: number) => {
    const x = voice(g, g.sfx, t, t + len + 0.05, PRI.sfx);
    if (x) x.out.gain.value = lvl * (o.gain ?? 1) * vary(g, 0, VARIATION.db).gain;   // ±1.5 dB; pitch stays in key
    return x;
  };
  switch (id) {
    case 'uiTap': { const s = v(0.04, L.ui); if (!s) return; tn(g, s, s.out, t, 0.03, 'sine', 1200, 0.15); tn(g, s, s.out, t, 0.01, 'sine', 2400, 0.08); return; }
    case 'uiBack': { const s = v(0.04, L.ui); if (!s) return; tn(g, s, s.out, t, 0.03, 'sine', 800, 0.15); tn(g, s, s.out, t, 0.01, 'sine', 1600, 0.07); return; }
    case 'uiToggle': { const s = v(0.09, L.ui); if (!s) return; tn(g, s, s.out, t, 0.03, 'sine', 900, 0.14); tn(g, s, s.out, t + 0.04, 0.03, 'sine', 1350, 0.12); return; }
    case 'uiError': { const s = v(0.16, L.ui); if (!s) return; tn(g, s, s.out, t, 0.06, 'triangle', 466, 0.14); tn(g, s, s.out, t + 0.07, 0.08, 'triangle', 392, 0.12); return; }
    case 'purchase': {
      // Three coin chimes climbing the pentatonic.
      const s = v(0.5, L.purchase); if (!s) return;
      [0, 2, 4].forEach((d, i) => {
        const f = midiHz(pentatonicNote(key.area, d, 5));
        tn(g, s, s.out, t + i * 0.08, 0.18, 'sine', f, 0.2);
        tn(g, s, s.out, t + i * 0.08 + 0.06, 0.18, 'sine', f * 1.5, 0.12);
      });
      return;
    }
    case 'levelUp': {
      // Maj9 arpeggio, 5 notes 70 ms apart on EP + mallet, the last held 1.2 s; 0.6 s shimmer high-passed at 6 kHz.
      const notes = maj9(key, 4);
      notes.forEach((m, i) => {
        const at = t + (i * LEVEL_UP.noteMs) / 1000;
        const hold = i === notes.length - 1 ? LEVEL_UP.holdSec : 0.25;
        playEp(g, at, m, 0.7, hold);
        playMallet(g, g.sfx, at, m + 12, 0.7, { gain: 0.12 * L.levelUp / 0.3, decay: hold + 0.3, pri: PRI.sfx });
      });
      const s = v(LEVEL_UP.shimmerSec, L.levelUp); if (!s) return;
      nz(g, s, s.out, t + 0.2, LEVEL_UP.shimmerSec, 'highpass', LEVEL_UP.shimmerHz, 0.7, 0.12, 0, undefined, 'swell');
      return;
    }
    case 'crateShake': {
      // Cardboard thump (noise low-passed at 800 Hz + a 100 Hz sine), +2 semitones per tap.
      const n = Math.max(1, o.n ?? 1), k = Math.pow(2, (2 * (n - 1)) / 12);
      const s = v(0.15, L.crate); if (!s) return;
      nz(g, s, s.out, t, 0.08, 'lowpass', 800 * k, 0.7, 0.6, 0.002);
      tn(g, s, s.out, t, 0.1, 'sine', 100 * k, 0.7, 0.002, 70 * k);
      return;
    }
    case 'crateOpen': {
      // Tape rip (band-pass 1 → 4 kHz over 0.25 s with 40 Hz AM) and a 400 → 800 Hz blip.
      const s = v(0.4, L.crateOpen); if (!s) return;
      const ctx = g.ctx;
      const am = gain(ctx, 0.5, s.out);
      const lfo = osc(ctx, 'square', 40); const ld = gain(ctx, 0.5); lfo.connect(ld); ld.connect(am.gain);
      s.src(lfo, t, t + 0.3);
      nz(g, s, am, t, 0.25, 'bandpass', 1000, 1.5, 0.6, 0.005, 4000, 'swell');
      tn(g, s, s.out, t + 0.22, 0.12, 'sine', 400, 0.2, 0.003, 800, 0.1);
      return;
    }
    case 'revealCommon': case 'revealRare': case 'revealEpic': case 'revealLegendary': {
      const tier = id === 'revealCommon' ? 0 : id === 'revealRare' ? 1 : id === 'revealEpic' ? 2 : 3;
      const chord = maj9(key, 5);
      const pick = tier === 0 ? [chord[2]!, chord[0]! + 12] : tier === 1 ? [chord[0]!, chord[1]!, chord[2]!] : tier === 2 ? chord.slice(0, 4) : chord;
      const gap = tier === 3 ? 0.03 : 0.09;
      pick.forEach((m, i) => playMallet(g, g.sfx, t + i * gap, m, 0.8, { plucky: tier === 0, gain: 0.14 * (L.reveal / 0.3), decay: tier === 3 ? 1.4 : 0.6, pri: PRI.sfx }));
      if (tier >= 2) {
        const s = v(1.2, L.reveal); if (!s) return;
        nz(g, s, s.out, t + 0.1, 0.8, 'highpass', 6000, 0.7, 0.1, 0, undefined, 'swell');
        if (tier === 3) {
          // Rising swell, an FM bell (ratio 3.5, index 2) and crackle confetti.
          nz(g, s, s.out, t, 0.9, 'bandpass', 500, 1, 0.18, 0, 3000, 'swell');
          const ctx = g.ctx, f = midiHz(chord[0]! + 12);
          const car = osc(ctx, 'sine', f); const eg = gain(ctx, 0, s.out); car.connect(eg);
          const mod = osc(ctx, 'sine', f * 3.5); const mi = gain(ctx, 2 * f * 3.5); mod.connect(mi); mi.connect(car.frequency);
          mi.gain.setValueAtTime(2 * f * 3.5, t + 0.25); mi.gain.exponentialRampToValueAtTime(10, t + 1.2);
          perc(eg.gain, t + 0.25, 0.22, 0.002, 0.95);
          s.src(car, t + 0.25, t + 1.22); s.src(mod, t + 0.25, t + 1.22);
          for (let i = 0; i < 9; i++) nz(g, s, s.out, t + 0.3 + g.rng.float() * 0.8, 0.004, 'highpass', 3000, 0.7, 0.25, 0.0005);
        }
      }
      return;
    }
    default: return;
  }
}
