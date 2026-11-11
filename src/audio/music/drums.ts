// audio/music/drums.ts: drum voices (DESIGN §19.1 drum table and per-area kits). Each area's kit is pre-rendered once
// into small buffers of the bank (audio/bank.ts, built in idle time from boot) from seeded sample math (kick sweep +
// click, snare band + tone, brush, rim, hats, shaker, clap, the Docks metallic ring), with 4 noise variants per hit so
// repeats never sound machine-gunned. A hit is then a buffer source and a gain (2 nodes), which keeps the main-thread
// scheduling cost low. The kick fires the sidechain.
import { after, pcm, tick, type Pcm } from '../bank';
import type { AreaMusic, MusicArea } from '../mix.config';
import { AREA_MUSIC, BRUSH, CLAP, HATS, KICK, METAL_RING, RIM, SHAKER, SIDECHAIN, SNARE } from '../mix.config';
import type { Graph } from '../graph';
import { biquad, whitePcm } from '../sfx/noise';
import { voice, type VoiceOut } from '../synth';
import { PRI } from '../voices';
import type { Inst } from './sequencer';

const VARIANTS = 4;
interface Kit { kick: AudioBuffer[]; snare: AudioBuffer[]; rim: AudioBuffer[]; hatC: AudioBuffer[]; hatO: AudioBuffer[]; shaker: AudioBuffer[]; clap: AudioBuffer[] }
type KitPcm = Record<keyof Kit, Pcm[]>;
const kitPcms = new Map<MusicArea, KitPcm>();
const kitBufs = new Map<MusicArea, Kit>();
const rr = new WeakMap<Graph, number>();
const openHats = new WeakMap<Graph, VoiceOut>();

/** WebAudio interprets low/high-pass Q in dB; the sample-math biquad takes a linear Q. */
const qdb = (q: number) => Math.pow(10, q / 20);
/** 0 → 1 over `a`, then exponential to −60 dB at a + d. */
const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp((-6.9 * (t - a)) / d));

/** One kit buffer: `sec` of a per-sample recipe over the white noise loop (variant v reads it from its own offset). */
type Recipe = (sr: number, nz: (i: number) => number) => (i: number) => number;
function kitPcm(name: string, sec: number, v: number, recipe: Recipe): Pcm {
  const white = whitePcm();
  return pcm(name, 1, sec, function* (out, sr) {
    yield* after(white);
    const w = white.data()[0]!, off = Math.floor((v * w.length) / VARIANTS);
    const o = out[0]!, f = recipe(sr, (i) => w[(off + i) % w.length]!);
    for (let i = 0; i < o.length; i++) { o[i] = f(i); if (tick(i)) yield; }
  });
}
const noiseHit = (type: 'bandpass' | 'highpass', f: number, q: number, a: number, d: number, peak: number): [number, Recipe] => [a + d + 0.01, (sr, nz) => {
  const flt = biquad(type, f, type === 'bandpass' ? q : qdb(q), sr);
  return (i) => flt(nz(i)) * env(i / sr, a, d) * peak;
}];

/** The kit recipes of an area (DESIGN §19.1 drum table and per-area kits). */
function recipes(a: AreaMusic): [keyof Kit, number, [number, Recipe]][] {
  const kick: [number, Recipe] = [a.kick.decay + 0.02, (sr, nz) => {
    const hp = biquad('highpass', KICK.clickHp, qdb(0.7), sr);
    let ph = 0;
    return (i) => {
      const t = i / sr;
      const f = a.kick.f0 * Math.pow(KICK.f1 / a.kick.f0, Math.min(t, KICK.sweep) / KICK.sweep);
      ph += (2 * Math.PI * f) / sr;
      const click = t < 0.006 ? hp(nz(i)) * env(t, 0.0005, KICK.clickMs / 1000) * KICK.clickGain : 0;
      return Math.sin(ph) * env(t, KICK.attack, a.kick.decay) * KICK.gain + click;
    };
  }];
  const snare: [number, Recipe] = a.snare === 'brush'
    ? noiseHit('bandpass', BRUSH.bpHz, BRUSH.bpQ, BRUSH.attack, BRUSH.decay, BRUSH.gain * 1.6)
    : [Math.max(SNARE.decay, METAL_RING.decay) + 0.02, (sr, nz) => {
      const bp = biquad('bandpass', SNARE.bpHz, SNARE.bpQ, sr);
      let tph = 0;
      return (i) => {
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
        return x;
      };
    }];
  const clap: [number, Recipe] = [CLAP.spacing * CLAP.bursts + CLAP.tail + 0.02, (sr, nz) => {
    const bp = biquad('bandpass', CLAP.bpHz, CLAP.bpQ, sr);
    return (i) => {
      const t = i / sr;
      let e = 0;
      for (let k = 0; k < CLAP.bursts; k++) {
        const tk = t - k * CLAP.spacing;
        if (tk >= 0) e += (k === CLAP.bursts - 1 ? 1 : 0.7) * env(tk, 0.0008, k === CLAP.bursts - 1 ? CLAP.tail : 0.012);
      }
      return bp(nz(i)) * e * CLAP.gain;
    };
  }];
  return [
    ['kick', 1, kick],
    ['snare', VARIANTS, snare],
    ['rim', VARIANTS, noiseHit('bandpass', RIM.bpHz, RIM.bpQ, 0.0005, RIM.decay, RIM.gain * 2)],
    ['hatC', VARIANTS, noiseHit('highpass', a.hats.hpHz, 0.7, 0.0008, a.hats.closed, HATS.gain)],
    ['hatO', 2, noiseHit('highpass', a.hats.hpHz, 0.7, 0.002, HATS.open, HATS.gain)],
    ['shaker', VARIANTS, noiseHit('bandpass', SHAKER.bpHz, SHAKER.bpQ, 0.004, SHAKER.decay, SHAKER.gain * 4)],
    ['clap', a.clap ? 2 : 0, clap],
  ];
}

/** Registers an area's kit with the bank (built in idle time from boot; `kit:<area>:` names). */
export function registerKit(area: MusicArea): KitPcm {
  let k = kitPcms.get(area);
  if (k) return k;
  const a = AREA_MUSIC[area];
  k = { kick: [], snare: [], rim: [], hatC: [], hatO: [], shaker: [], clap: [] };
  for (const [field, count, [sec, recipe]] of recipes(a)) for (let v = 0; v < count; v++) k[field].push(kitPcm(`kit:${area}:${field}${v}`, sec, v, recipe));
  kitPcms.set(area, k);
  return k;
}
/** An area's kit as AudioBuffers (any buffer the idle build has not reached yet is finished now). */
export function kitFor(g: Graph, area: MusicArea): Kit {
  let kit = kitBufs.get(area);
  if (kit) return kit;
  const k = registerKit(area);
  const b = (l: Pcm[]) => l.map((p) => p.buffer(g.ctx));
  kit = { kick: b(k.kick), snare: b(k.snare), rim: b(k.rim), hatC: b(k.hatC), hatO: b(k.hatO), shaker: b(k.shaker), clap: b(k.clap) };
  kitBufs.set(area, kit);
  return kit;
}
/** True once every buffer of the area's kit is built. */
export function kitReady(area: MusicArea): boolean {
  const k = kitPcms.get(area);
  return !!k && Object.values(k).every((l: Pcm[]) => l.every((p) => p.complete));
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

export function playDrum(g: Graph, inst: Inst, t: number, vel: number, area: MusicArea): void {
  const kit = kitFor(g, area);
  const n = (rr.get(g) ?? 0) + 1;
  rr.set(g, n);
  const pick = (l: AudioBuffer[]) => l[n % l.length]!;
  switch (inst) {
    case 'kick': hit(g, kit.kick[0]!, t, vel); if (vel > 0.6) sidechain(g, t, Math.min(1, vel)); return;
    case 'snare': hit(g, pick(kit.snare), t, vel); return;
    case 'rim': hit(g, pick(kit.rim), t, vel); return;
    case 'clap': if (kit.clap.length) hit(g, pick(kit.clap), t, vel); return;
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
