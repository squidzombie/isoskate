// audio/music/drums.ts: drum voices (DESIGN §19.1 drum table and per-area kits). Each area's kit is synthesized once
// into small AudioBuffers from seeded sample math (kick sweep + click, snare band + tone, brush, rim, hats, shaker,
// clap, the Docks metallic ring), with 4 noise variants per hit so repeats never sound machine-gunned. A hit is then
// a buffer source and a gain (2 nodes), which keeps the main-thread scheduling cost low. The kick fires the sidechain.
import type { AreaMusic, MusicArea } from '../mix.config';
import { BRUSH, CLAP, HATS, KICK, METAL_RING, RIM, SHAKER, SIDECHAIN, SNARE } from '../mix.config';
import type { Graph } from '../graph';
import { biquad } from '../sfx/noise';
import { voice, type VoiceOut } from '../synth';
import { PRI } from '../voices';
import type { Inst } from './sequencer';

const VARIANTS = 4;
interface Kit { kick: AudioBuffer[]; snare: AudioBuffer[]; rim: AudioBuffer[]; hatC: AudioBuffer[]; hatO: AudioBuffer[]; shaker: AudioBuffer[]; clap: AudioBuffer[] }
const kits = new WeakMap<Graph, Map<MusicArea, KitState>>();
const rr = new WeakMap<Graph, number>();
const openHats = new WeakMap<Graph, VoiceOut>();

/** WebAudio interprets low/high-pass Q in dB; the sample-math biquad takes a linear Q. */
const qdb = (q: number) => Math.pow(10, q / 20);
/** 0 → 1 over `a`, then exponential to −60 dB at a + d. */
const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp((-6.9 * (t - a)) / d));

function buf(g: Graph, sec: number, fill: (o: Float32Array, sr: number, noise: (i: number) => number) => void, variant: number): AudioBuffer {
  const sr = g.ctx.sampleRate, n = Math.ceil(sec * sr);
  const b = g.ctx.createBuffer(1, n, sr);
  const w = g.noise.white.getChannelData(0), off = Math.floor((variant * w.length) / VARIANTS);
  fill(b.getChannelData(0), sr, (i) => w[(off + i) % w.length]!);
  return b;
}
function noiseHit(g: Graph, type: 'bandpass' | 'highpass', f: number, q: number, a: number, d: number, peak: number, v: number): AudioBuffer {
  return buf(g, a + d + 0.01, (o, sr, nz) => {
    const flt = biquad(type, f, type === 'bandpass' ? q : qdb(q), sr);
    for (let i = 0; i < o.length; i++) o[i] = flt(nz(i)) * env(i / sr, a, d) * peak;
  }, v);
}

/** The kit as a list of jobs, one per buffer (each a few hundred microseconds of sample math), so kits for the other
 *  areas can be built one job per scheduler tick instead of in one long frame. */
type Job = [keyof Kit, number, () => AudioBuffer];
function kitJobs(g: Graph, a: AreaMusic): Job[] {
  const kick = (v: number) => buf(g, a.kick.decay + 0.02, (o, sr, nz) => {
    const hp = biquad('highpass', KICK.clickHp, qdb(0.7), sr);
    let ph = 0;
    for (let i = 0; i < o.length; i++) {
      const t = i / sr;
      const f = a.kick.f0 * Math.pow(KICK.f1 / a.kick.f0, Math.min(t, KICK.sweep) / KICK.sweep);
      ph += (2 * Math.PI * f) / sr;
      const click = t < 0.006 ? hp(nz(i)) * env(t, 0.0005, KICK.clickMs / 1000) * KICK.clickGain : 0;
      o[i] = Math.sin(ph) * env(t, KICK.attack, a.kick.decay) * KICK.gain + click;
    }
  }, v);
  const snare = (v: number) => {
    if (a.snare === 'brush') return noiseHit(g, 'bandpass', BRUSH.bpHz, BRUSH.bpQ, BRUSH.attack, BRUSH.decay, BRUSH.gain * 1.6, v);
    return buf(g, Math.max(SNARE.decay, METAL_RING.decay) + 0.02, (o, sr, nz) => {
      const bp = biquad('bandpass', SNARE.bpHz, SNARE.bpQ, sr);
      let tph = 0;
      for (let i = 0; i < o.length; i++) {
        const t = i / sr;
        tph += SNARE.toneHz / sr;
        const tri = 4 * Math.abs(tph - Math.floor(tph + 0.5)) - 1;
        let x = bp(nz(i)) * env(t, 0.001, SNARE.decay) * SNARE.gain * 1.5 + tri * env(t, 0.001, SNARE.toneDecay) * SNARE.toneGain;
        if (a.snare === 'metal' && t < METAL_RING.decay * 1.5) {
          // Metallic ring: band-limited squares at 540 / 800 Hz (odd harmonics below 8 kHz), 60 ms.
          let sq = 0;
          for (const f of METAL_RING.f) for (let k = 1; k * f < 8000; k += 2) sq += Math.sin(2 * Math.PI * f * k * t) / k;
          x += sq * (4 / Math.PI) * env(t, 0.001, METAL_RING.decay) * METAL_RING.gain;
        }
        o[i] = x;
      }
    }, v);
  };
  const clap = (v: number) => buf(g, CLAP.spacing * CLAP.bursts + CLAP.tail + 0.02, (o, sr, nz) => {
    const bp = biquad('bandpass', CLAP.bpHz, CLAP.bpQ, sr);
    for (let i = 0; i < o.length; i++) {
      const t = i / sr;
      let e = 0;
      for (let k = 0; k < CLAP.bursts; k++) {
        const tk = t - k * CLAP.spacing;
        if (tk >= 0) e += (k === CLAP.bursts - 1 ? 1 : 0.7) * env(tk, 0.0008, k === CLAP.bursts - 1 ? CLAP.tail : 0.012);
      }
      o[i] = bp(nz(i)) * e * CLAP.gain;
    }
  }, v);
  const groups: [keyof Kit, number, (v: number) => AudioBuffer][] = [
    ['kick', 1, kick],
    ['snare', VARIANTS, snare],
    ['rim', VARIANTS, (v) => noiseHit(g, 'bandpass', RIM.bpHz, RIM.bpQ, 0.0005, RIM.decay, RIM.gain * 2, v)],
    ['hatC', VARIANTS, (v) => noiseHit(g, 'highpass', a.hats.hpHz, 0.7, 0.0008, a.hats.closed, HATS.gain, v)],
    ['hatO', 2, (v) => noiseHit(g, 'highpass', a.hats.hpHz, 0.7, 0.002, HATS.open, HATS.gain, v)],
    ['shaker', VARIANTS, (v) => noiseHit(g, 'bandpass', SHAKER.bpHz, SHAKER.bpQ, 0.004, SHAKER.decay, SHAKER.gain * 4, v)],
    ['clap', 2, clap],
  ];
  // One job per buffer (a few hundred microseconds of sample math each).
  const jobs: Job[] = [];
  for (const [field, count, make] of groups) for (let i = 0; i < count; i++) jobs.push([field, i, () => make(i)]);
  return jobs;
}

interface KitState { kit: Partial<Record<keyof Kit, AudioBuffer[]>>; jobs: Job[] }
function state(g: Graph, area: MusicArea, a: AreaMusic): KitState {
  let m = kits.get(g);
  if (!m) { m = new Map(); kits.set(g, m); }
  let k = m.get(area);
  if (!k) { k = { kit: {}, jobs: kitJobs(g, a) }; m.set(area, k); }
  return k;
}
/** The kit for an area, finishing any jobs still pending. */
export function kitFor(g: Graph, area: MusicArea, a: AreaMusic): Kit {
  const k = state(g, area, a);
  for (const j of k.jobs.splice(0)) run(k, j);
  return k.kit as Kit;
}
function run(k: KitState, [f, i, make]: Job): void { (k.kit[f] ??= [])[i] = make(); }
/** Queues an area's kit to be built in the background (one job per stepKits call). */
export function prepareKit(g: Graph, area: MusicArea, a: AreaMusic): void { state(g, area, a); }
/** Runs one pending kit job; false when every queued kit is complete. */
export function stepKits(g: Graph): boolean {
  const m = kits.get(g);
  if (!m) return false;
  for (const k of m.values()) {
    const j = k.jobs.shift();
    if (j) { run(k, j); return true; }
  }
  return false;
}

function hit(g: Graph, b: AudioBuffer, t: number, vel: number): VoiceOut | null {
  const v = voice(g, g.music.drumBus, t, t + b.duration, PRI.music);
  if (!v) return null;
  v.out.gain.value = vel;
  const src = g.ctx.createBufferSource();
  src.buffer = b;
  src.connect(v.out);
  v.src(src, t, t + b.duration);
  return v;
}

function sidechain(g: Graph, t: number, amount: number): void {
  const p = g.music.side.gain;
  p.setTargetAtTime(1 - (1 - SIDECHAIN.depth) * amount, t, SIDECHAIN.attack / 3);
  p.setTargetAtTime(1, t + SIDECHAIN.attack, SIDECHAIN.tau);
}

export function playDrum(g: Graph, inst: Inst, t: number, vel: number, area: MusicArea, a: AreaMusic): void {
  const kit = kitFor(g, area, a);
  const n = (rr.get(g) ?? 0) + 1;
  rr.set(g, n);
  const pick = (l: AudioBuffer[]) => l[n % l.length]!;
  switch (inst) {
    case 'kick': hit(g, kit.kick[0]!, t, vel); if (vel > 0.6) sidechain(g, t, Math.min(1, vel)); return;
    case 'snare': hit(g, pick(kit.snare), t, vel); return;
    case 'rim': hit(g, pick(kit.rim), t, vel); return;
    case 'clap': hit(g, pick(kit.clap), t, vel); return;
    case 'shaker': hit(g, pick(kit.shaker), t, vel); return;
    case 'hatC': {
      const oh = openHats.get(g);
      if (oh && oh.v.end > t) { oh.kill(t); openHats.delete(g); }    // choke the open hat
      hit(g, pick(kit.hatC), t, vel);
      return;
    }
    case 'hatO': { const v = hit(g, pick(kit.hatO), t, vel); if (v) openHats.set(g, v); return; }
    default: return;
  }
}
