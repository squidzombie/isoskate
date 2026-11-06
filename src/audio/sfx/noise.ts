// audio/sfx/noise.ts: the noise buffers of the bank (DESIGN §19.2 "noise buffers are pre-rendered at boot"), seeded
// sample math run in chunks by audio/bank.ts: white, pink and brown noise loops (seamless, crossfaded at the loop
// point) and the 4 s vinyl loop (hiss + Poisson pops, §19.1). Also the sample-math biquad the kits use.
import { Sfc32 } from '../../core/rng';
import { pcm, tick, type Pcm } from '../bank';
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

/** Fills `o` with a generator, made loopable: the next `fade` samples are equal-power crossfaded over the head. */
function* loopableInto(o: Float32Array, fade: number, gen: () => number): Generator<void, void, void> {
  const n = o.length;
  for (let i = 0; i < n; i++) { o[i] = gen(); if (tick(i)) yield; }
  for (let i = 0; i < fade; i++) {
    const u = i / fade;
    o[i] = o[i]! * Math.sin(u * Math.PI / 2) + gen() * Math.cos(u * Math.PI / 2);
  }
}
/** Removes the mean, then scales to `peak`. */
function* normalizeInto(a: Float32Array, peak: number): Generator<void, void, void> {
  let mean = 0;
  for (let i = 0; i < a.length; i++) { mean += a[i]!; if (tick(i)) yield; }
  mean /= a.length;
  let m = 1e-9;
  for (let i = 0; i < a.length; i++) { a[i]! -= mean; m = Math.max(m, Math.abs(a[i]!)); if (tick(i)) yield; }
  const k = peak / m;
  for (let i = 0; i < a.length; i++) { a[i]! *= k; if (tick(i)) yield; }
}

/** Seamless 2 s noise loops, normalized to 0.9: white; pink (Paul Kellet's economy filter); brown (leaky-integrated
 *  white, no DC drift). */
function noiseFill(kind: 'white' | 'pink' | 'brown', seed: number) {
  return function* (out: readonly Float32Array[]): Generator<void, void, void> {
    const o = out[0]!, r = new Sfc32(seed);
    if (kind === 'white') yield* loopableInto(o, 256, () => r.float() * 2 - 1);
    else if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0;
      yield* loopableInto(o, 4096, () => {
        const w = r.float() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
        return b0 + b1 + b2 + w * 0.1848;
      });
    } else {
      let y = 0;
      yield* loopableInto(o, 8192, () => { y = 0.996 * y + (r.float() * 2 - 1) * 0.06; return y; });
    }
    yield* normalizeInto(o, 0.9);
  };
}

/** The 4 s stereo vinyl loop: band-passed hiss plus Poisson pops (1–3 samples, high-passed). */
function* vinylFill(out: readonly Float32Array[], sr: number): Generator<void, void, void> {
  for (let ch = 0; ch < 2; ch++) {
    const o = out[ch]!, n = o.length;
    const r = new Sfc32(NOISE_SEED + 4 + 17 * ch);
    const bp = biquad('bandpass', VINYL.hissHz, VINYL.hissQ, sr);
    const hp = biquad('highpass', VINYL.popHpHz, 0.7, sr);
    yield* loopableInto(o, 512, () => bp(r.float() * 2 - 1));
    yield* normalizeInto(o, 1);
    const pops = new Float32Array(n);
    const rate = VINYL.popsPerSec / sr;
    for (let i = 0; i < n; i++) {
      if (r.float() < rate) {
        const len = r.int(1, 3), amp = r.range(VINYL.popAmp[0], VINYL.popAmp[1]) * (r.chance(0.5) ? 1 : -1);
        for (let k = 0; k < len && i + k < n; k++) pops[i + k]! += amp * (1 - k / (len + 1));
      }
      if (tick(i)) yield;
    }
    for (let i = 0; i < n; i++) { o[i] = o[i]! * VINYL.hissGain * 2.2 + hp(pops[i]!); if (tick(i)) yield; }
  }
}

/** Fixed seed: the noise is the same for every song and render (only offsets into it are seeded per song). */
const NOISE_SEED = 0x6e6f6973;
export const NOISE_SEC = 2;
export const whitePcm = (): Pcm => pcm('noise:white', 1, NOISE_SEC, noiseFill('white', NOISE_SEED + 1));
export const pinkPcm = (): Pcm => pcm('noise:pink', 1, NOISE_SEC, noiseFill('pink', NOISE_SEED + 2));
export const brownPcm = (): Pcm => pcm('noise:brown', 1, NOISE_SEC, noiseFill('brown', NOISE_SEED + 3));
export const vinylPcm = (): Pcm => pcm('noise:vinyl', 2, VINYL.sec, vinylFill);
/** Registers the noise buffers (boot order: these first, every kit needs the white loop). */
export function registerNoise(): void { whitePcm(); pinkPcm(); brownPcm(); vinylPcm(); }

export interface NoiseBank { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer; vinyl: AudioBuffer }
/** The noise AudioBuffers for a context (finished now if the idle build has not got there yet). */
export function noiseBank(ctx: BaseAudioContext): NoiseBank {
  return { white: whitePcm().buffer(ctx), pink: pinkPcm().buffer(ctx), brown: brownPcm().buffer(ctx), vinyl: vinylPcm().buffer(ctx) };
}
