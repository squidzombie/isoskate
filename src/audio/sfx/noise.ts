// audio/sfx/noise.ts: pre-rendered buffers (DESIGN §19.2 "noise buffers are pre-rendered at boot") from seeded
// sample math, so live play and offline renders are bit-identical: white, pink and brown noise loops (seamless,
// crossfaded at the loop point) and the 4 s vinyl loop (hiss + Poisson pops, §19.1).
import { Sfc32 } from '../../core/rng';
import { VINYL } from '../mix.config';

/** RBJ-cookbook biquad on sample arrays (used only to pre-render buffers). */
export function biquad(type: 'lowpass' | 'highpass' | 'bandpass', f: number, q: number, sr: number): (x: number) => number {
  const w = (2 * Math.PI * f) / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0 = 0, b1 = 0, b2 = 0;
  if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
  else if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

/** n samples of a generator, made loopable: the tail beyond n is equal-power crossfaded over the head. */
export function loopable(n: number, fade: number, gen: () => number): Float32Array {
  const raw = new Float32Array(n + fade);
  for (let i = 0; i < raw.length; i++) raw[i] = gen();
  const out = raw.slice(0, n);
  for (let i = 0; i < fade; i++) {
    const u = i / fade;
    out[i] = raw[i]! * Math.sin(u * Math.PI / 2) + raw[n + i]! * Math.cos(u * Math.PI / 2);
  }
  return out;
}
function normalize(a: Float32Array, peak: number): Float32Array {
  let mean = 0;
  for (let i = 0; i < a.length; i++) mean += a[i]!;
  mean /= a.length;
  let m = 1e-9;
  for (let i = 0; i < a.length; i++) { a[i]! -= mean; m = Math.max(m, Math.abs(a[i]!)); }
  for (let i = 0; i < a.length; i++) a[i]! *= peak / m;
  return a;
}

export function whiteSamples(n: number, seed: number): Float32Array {
  const r = new Sfc32(seed);
  return normalize(loopable(n, 256, () => r.float() * 2 - 1), 0.9);
}
/** Pink noise (Paul Kellet's economy filter). */
export function pinkSamples(n: number, seed: number): Float32Array {
  const r = new Sfc32(seed);
  let b0 = 0, b1 = 0, b2 = 0;
  return normalize(loopable(n, 4096, () => {
    const w = r.float() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
    return b0 + b1 + b2 + w * 0.1848;
  }), 0.9);
}
/** Brown noise: leaky-integrated white noise (no DC drift). */
export function brownSamples(n: number, seed: number): Float32Array {
  const r = new Sfc32(seed);
  let y = 0;
  return normalize(loopable(n, 8192, () => { y = 0.996 * y + (r.float() * 2 - 1) * 0.06; return y; }), 0.9);
}

/** The 4 s stereo vinyl loop: band-passed hiss plus Poisson pops (1–3 samples, high-passed). */
export function vinylSamples(sr: number, seed: number): [Float32Array, Float32Array] {
  const n = Math.round(VINYL.sec * sr);
  const chans: Float32Array[] = [];
  for (let ch = 0; ch < 2; ch++) {
    const r = new Sfc32(seed + 17 * ch);
    const bp = biquad('bandpass', VINYL.hissHz, VINYL.hissQ, sr);
    const hp = biquad('highpass', VINYL.popHpHz, 0.7, sr);
    const hiss = loopable(n, 512, () => bp(r.float() * 2 - 1));
    normalize(hiss, 1);
    const pops = new Float32Array(n);
    const rate = VINYL.popsPerSec / sr;
    for (let i = 0; i < n; i++) {
      if (r.float() < rate) {
        const len = r.int(1, 3), amp = r.range(VINYL.popAmp[0], VINYL.popAmp[1]) * (r.chance(0.5) ? 1 : -1);
        for (let k = 0; k < len && i + k < n; k++) pops[i + k]! += amp * (1 - k / (len + 1));
      }
    }
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = hiss[i]! * VINYL.hissGain * 2.2 + hp(pops[i]!);
    chans.push(out);
  }
  return [chans[0]!, chans[1]!];
}

export interface NoiseBank { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer; vinyl: AudioBuffer }
export function makeNoiseBank(ctx: BaseAudioContext, seed: number): NoiseBank {
  const sr = ctx.sampleRate, n = Math.round(2 * sr);
  const mono = (a: Float32Array) => { const b = ctx.createBuffer(1, a.length, sr); b.getChannelData(0).set(a); return b; };
  const [vl, vr] = vinylSamples(sr, seed + 4);
  const vinyl = ctx.createBuffer(2, vl.length, sr);
  vinyl.getChannelData(0).set(vl); vinyl.getChannelData(1).set(vr);
  return { white: mono(whiteSamples(n, seed + 1)), pink: mono(pinkSamples(n, seed + 2)), brown: mono(brownSamples(n, seed + 3)), vinyl };
}
