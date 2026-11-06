// audio/synth.ts: small WebAudio building blocks shared by music and SFX: a voice (one output gain registered with
// the voice pool), oscillators, noise sources, filters, envelopes and LFOs. Works on any BaseAudioContext, so the
// offline render uses exactly the live graph code.
import type { Sfc32 } from '../core/rng';
import type { NoiseBank } from './sfx/noise';
import { VoicePool, type Voice } from './voices';

export interface Synth { ctx: BaseAudioContext; voices: VoicePool; noise: NoiseBank; rng: Sfc32;
  /** Live contexts disconnect finished voices from `onended`; offline renders don't (its timing would make the
   *  render depend on main-thread scheduling). */
  live: boolean }
export const FLOOR = 1e-4;
export const dbGain = (db: number) => Math.pow(10, db / 20);

/** One sounding instance. Sources started through it are stopped when it is stolen. */
export class VoiceOut {
  readonly out: GainNode;
  private readonly srcs: AudioScheduledSourceNode[] = [];
  readonly v: Voice;
  constructor(private readonly s: Synth, dest: AudioNode, readonly t: number, end: number, pri: number) {
    this.out = s.ctx.createGain();
    this.out.connect(dest);
    this.v = { end, pri, stop: (at) => this.kill(at) };
    s.voices.add(this.v, s.ctx.currentTime);
  }
  /** Registers and schedules a source; the last one to end disconnects the voice. */
  src<T extends AudioScheduledSourceNode>(n: T, start: number, stop: number): T {
    n.start(Math.max(start, 0));
    n.stop(Math.max(stop, start + 0.001));
    this.srcs.push(n);
    if (this.s.live && stop >= this.v.end - 0.06) n.onended = () => { try { this.out.disconnect(); } catch { /* gone */ } };
    return n;
  }
  kill(at: number): void {
    const g = this.out.gain;
    const t = Math.max(at, this.t);
    if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
    g.setTargetAtTime(0, t, 0.004);
    for (const n of this.srcs) { try { n.stop(t + 0.03); } catch { /* not started / already stopped */ } }
    this.v.end = t + 0.03;
  }
}
/** A voice if the pool admits it (else null: the sound is dropped at the cap). */
export function voice(s: Synth, dest: AudioNode, t: number, end: number, pri: number): VoiceOut | null {
  if (!s.voices.admit(s.ctx.currentTime, pri)) return null;
  return new VoiceOut(s, dest, t, end, pri);
}

export function gain(ctx: BaseAudioContext, v: number, dest?: AudioNode): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  if (dest) g.connect(dest);
  return g;
}
export function filter(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q: number, dest?: AudioNode): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q;
  if (dest) b.connect(dest);
  return b;
}
export function osc(ctx: BaseAudioContext, type: OscillatorType, f: number, dest?: AudioNode): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.value = f;
  if (dest) o.connect(dest);
  return o;
}
/** A looping noise source at a seeded random offset. */
export function noiseSrc(s: Synth, kind: 'white' | 'pink' | 'brown', dest?: AudioNode, rate = 1): AudioBufferSourceNode {
  const b = s.ctx.createBufferSource();
  b.buffer = s.noise[kind];
  b.loop = true;
  b.playbackRate.value = rate;
  if (dest) b.connect(dest);
  return b;
}
export function noiseOffset(s: Synth): number { return s.rng.float() * 1.8; }
/** A permanent LFO: osc(hz) · depth → param. */
export function lfo(ctx: BaseAudioContext, hz: number, depth: number, target: AudioParam, type: OscillatorType = 'sine'): { osc: OscillatorNode; depth: GainNode } {
  const o = osc(ctx, type, hz);
  const d = gain(ctx, depth);
  o.connect(d); d.connect(target);
  o.start(0);
  return { osc: o, depth: d };
}
/** Percussive envelope: 0 → peak in `attack`, exponential to −60 dB at attack + decay. */
export function perc(p: AudioParam, t: number, peak: number, attack: number, decay: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(Math.max(peak, FLOOR * 2), t + attack);
  p.exponentialRampToValueAtTime(Math.max(FLOOR, peak * 0.001), t + attack + decay);
}
/** Swell: 0 → peak at `t + up`, back to 0 at `t + up + down` (linear-in-gain, smooth for whooshes). */
export function swell(p: AudioParam, t: number, peak: number, up: number, down: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + up);
  p.linearRampToValueAtTime(0, t + up + down);
}
export function sweep(p: AudioParam, t: number, from: number, to: number, sec: number): void {
  p.setValueAtTime(from, t);
  p.exponentialRampToValueAtTime(Math.max(to, 1), t + Math.max(sec, 0.002));
}
/** One-shot variation (§19.2): ±3% pitch and ±1.5 dB from the non-sim RNG. */
export function vary(s: Synth, pitchAmt: number, db: number): { pitch: number; gain: number } {
  return { pitch: 1 + (s.rng.float() * 2 - 1) * pitchAmt, gain: dbGain((s.rng.float() * 2 - 1) * db) };
}
/** tanh soft-clip curve: tanh(drive·x) / norm. */
export function tanhCurve(drive: number, normalize: boolean, n = 1024): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  const k = normalize ? Math.tanh(drive) : drive;
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(drive * x) / k; }
  return c;
}
