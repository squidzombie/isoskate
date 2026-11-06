// audio/music/instruments.ts: melodic voices (DESIGN §19.1 instrument table): FM electric piano, mono bass with
// glide, detuned-saw pad, mallet (melody and feedback), triangle arp, Docks FM clank.
import { ARP, BASS, CLANK, EP, MALLET, PAD, PLUCKY, type AreaMusic } from '../mix.config';
import type { Graph } from '../graph';
import { midiHz } from './progressions';
import { FLOOR, gain, osc, perc, tanhCurve, voice } from '../synth';
import { PRI } from '../voices';

/** FM electric piano note: sine carrier, ratio-1 modulator (index 1.6 → 0.3 over 0.8 s), ratio-14 tine (index 0.4,
 *  50 ms), ADSR 5 ms / 1.6 s / 0.25 / 0.6 s. Tremolo, auto-pan and the low-pass are shared on the EP bus. */
export function playEp(g: Graph, t: number, midi: number, vel: number, dur: number): void {
  const end = t + dur + EP.r + 0.05;
  const v = voice(g, g.music.ep, t, end, PRI.music);
  if (!v) return;
  const ctx = g.ctx, f = midiHz(midi);
  const car = v.src(osc(ctx, 'sine', f, v.out), t, end);
  const mod = osc(ctx, 'sine', f * EP.modRatio);
  const mi = gain(ctx, 0);
  mod.connect(mi); mi.connect(car.frequency);
  const dev0 = EP.index0 * f * EP.modRatio * (0.6 + 0.4 * vel), dev1 = EP.index1 * f * EP.modRatio;
  mi.gain.setValueAtTime(dev0, t);
  mi.gain.setTargetAtTime(dev1, t, EP.indexSec / 3);
  v.src(mod, t, end);
  const tine = osc(ctx, 'sine', f * EP.tineRatio);
  const ti = gain(ctx, 0);
  tine.connect(ti); ti.connect(car.frequency);
  ti.gain.setValueAtTime(EP.tineIndex * f * EP.tineRatio * vel, t);
  ti.gain.exponentialRampToValueAtTime(FLOOR, t + EP.tineSec);
  v.src(tine, t, t + EP.tineSec + 0.02);
  const p = v.out.gain, peak = EP.gain * vel;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + EP.a);
  p.setTargetAtTime(peak * EP.s, t + EP.a, EP.d / 3);
  p.setTargetAtTime(0, t + dur, EP.r / 5);
}

/** Pad chord (one voice): two saws per note at ±7 cents, attack 1.2 s, release 2 s, through the shared pad LP. */
export function playPad(g: Graph, t: number, notes: readonly number[], vel: number, dur: number): void {
  const end = t + dur + PAD.r + 0.1;
  const v = voice(g, g.music.pad, t, end, PRI.music);
  if (!v) return;
  const ctx = g.ctx;
  for (const m of notes) {
    for (const det of [-PAD.detuneCents, PAD.detuneCents]) {
      const o = osc(ctx, 'sawtooth', midiHz(m), v.out);
      o.detune.value = det;
      v.src(o, t, end);
    }
  }
  const p = v.out.gain, peak = (PAD.gain * vel) / notes.length;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + PAD.a);
  p.setTargetAtTime(0, t + dur, PAD.r / 4);
}

/** Mallet: sine + a 4× partial at 0.25 decaying in 120 ms; body decay 0.7 s (Suburbs: plucky, 0.35 s). */
export function playMallet(g: Graph, dest: AudioNode, t: number, midi: number, vel: number, o: { plucky?: boolean; gain?: number; decay?: number; pri?: number } = {}): void {
  const decay = o.decay ?? (o.plucky ? PLUCKY.decay : MALLET.decay);
  const end = t + decay + 0.05;
  const v = voice(g, dest, t, end, o.pri ?? PRI.music);
  if (!v) return;
  const ctx = g.ctx, f = midiHz(midi);
  v.src(osc(ctx, 'sine', f, v.out), t, end);
  const pg = gain(ctx, 0, v.out);
  v.src(osc(ctx, 'sine', f * MALLET.partial, pg), t, t + MALLET.partialSec + 0.02);
  perc(pg.gain, t, o.plucky ? PLUCKY.partialGain : MALLET.partialGain, 0.001, MALLET.partialSec);
  perc(v.out.gain, t, (o.gain ?? MALLET.gain) * vel, 0.002, decay);
}

export function playArp(g: Graph, t: number, midi: number, vel: number, pan: number): void {
  const end = t + ARP.decay + 0.03;
  const v = voice(g, pan < 0 ? g.music.arpL : g.music.arpR, t, end, PRI.music);
  if (!v) return;
  v.src(osc(g.ctx, 'triangle', midiHz(midi), v.out), t, end);
  perc(v.out.gain, t, ARP.gain * vel, 0.002, ARP.decay);
}

/** Docks: off-beat FM clank, ratio 1.41 (inharmonic), index 3 → 0 over 0.35 s. */
export function playClank(g: Graph, t: number, midi: number, vel: number, pan: number): void {
  const end = t + CLANK.sec + 0.03;
  const v = voice(g, g.music.harmonic, t, end, PRI.music);
  if (!v) return;
  const ctx = g.ctx, f = midiHz(midi);
  const p = ctx.createStereoPanner();
  p.pan.value = pan; p.connect(v.out);
  const car = v.src(osc(ctx, 'sine', f, p), t, end);
  const mod = v.src(osc(ctx, 'sine', f * CLANK.ratio), t, end);
  const mi = gain(ctx, CLANK.index * f * CLANK.ratio);
  mod.connect(mi); mi.connect(car.frequency);
  mi.gain.setValueAtTime(CLANK.index * f * CLANK.ratio, t);
  mi.gain.exponentialRampToValueAtTime(1, t + CLANK.sec);
  perc(v.out.gain, t, CLANK.gain * vel, 0.001, CLANK.sec);
}

/** The bass: one persistent mono voice (sine + triangle an octave up at 0.3, tanh soft clip for phone speakers,
 *  low-pass 600 Hz), so notes glide 30 ms into each other. ADSR 8 ms / 0.4 s / 0.6 / 0.12 s. */
export class Bass {
  private readonly sine: OscillatorNode; private readonly tri: OscillatorNode; readonly env: GainNode;
  constructor(private readonly g: Graph) {
    const ctx = g.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = BASS.lpHz; lp.Q.value = 0.6;
    lp.connect(g.music.bassIn);
    const sh = ctx.createWaveShaper(); sh.curve = tanhCurve(BASS.drive, true); sh.connect(lp);
    this.env = gain(ctx, 0, sh);
    const level = gain(ctx, BASS.gain, this.env);
    this.sine = osc(ctx, 'sine', 55, level);
    this.tri = osc(ctx, 'triangle', 110, gain(ctx, BASS.triGain, level));
    this.sine.start(0); this.tri.start(0);
  }
  note(t: number, midi: number, vel: number, dur: number, legato: boolean): void {
    const f = midiHz(midi);
    for (const [o, k] of [[this.sine, 1], [this.tri, 2]] as const) {
      if (legato) o.frequency.setTargetAtTime(f * k, t, BASS.glide / 3);
      else o.frequency.setValueAtTime(f * k, t);
    }
    const p = this.env.gain;
    p.setTargetAtTime(vel, t, BASS.a / 3);
    p.setTargetAtTime(vel * BASS.s, t + BASS.a, BASS.d / 3);
    p.setTargetAtTime(0, t + dur, BASS.r / 4);
  }
  silence(t: number): void { this.env.gain.setTargetAtTime(0, t, 0.02); }
}

export function areaMallet(a: AreaMusic): { plucky: boolean } { return { plucky: a.mallet === 'plucky' }; }
