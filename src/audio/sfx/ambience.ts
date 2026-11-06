// audio/sfx/ambience.ts: the per-area ambience (DESIGN §19.1 "Per-area variations"), on the ambience bus (0.25):
//   Downtown: distant traffic (brown noise low-passed at 300 Hz) and pigeon flutters.
//   Suburbs: bird chirps (sine glides 3–5 kHz) and sprinkler ticks.
//   Docks: lapping water (band-passed brown noise with slow AM), gulls and a low foghorn.
//   Neon: city hum, vending-machine buzz and a maglev pass with Doppler.
// One bed per area (crossfaded on area changes) and seeded Poisson events scheduled by the music tick.
import { Sfc32 } from '../../core/rng';
import { AMBIENCE, AREA_MUSIC, type MusicArea } from '../mix.config';
import type { Graph } from '../graph';
import { midiHz } from '../music/progressions';
import { filter, gain, noiseSrc, osc, voice, type VoiceOut } from '../synth';
import { PRI } from '../voices';
import { nz, tn } from './oneshots';

type Kind = 'traffic' | 'suburb' | 'harbor' | 'city' | 'none';
interface Bed { v: VoiceOut; kind: Kind }
interface Ev { name: string; every: readonly [number, number]; next: number }

export class Ambience {
  private bed: Bed | null = null;
  private kind: Kind = 'none';
  private evs: Ev[] = [];
  private readonly r: Sfc32;
  constructor(private readonly g: Graph, seed: number) { this.r = new Sfc32(seed ^ 0xa3b1); }

  setArea(area: MusicArea, t: number): void {
    const kind = AREA_MUSIC[area].ambience;
    if (kind === this.kind) return;
    this.kind = kind;
    if (this.bed) {
      const b = this.bed.v;
      b.out.gain.setTargetAtTime(0, t, AMBIENCE.fade / 4);
      b.kill(t + AMBIENCE.fade);
      this.bed = null;
    }
    this.evs = [];
    if (kind === 'none') return;
    const bed = this.makeBed(kind, t);
    this.bed = bed ? { v: bed, kind } : null;
    const A = AMBIENCE;
    const add = (name: string, every: readonly [number, number]) => this.evs.push({ name, every, next: t + this.r.range(every[0] * 0.3, every[1]) });
    if (kind === 'traffic') add('pigeons', A.traffic.pigeonEvery);
    if (kind === 'suburb') { add('birds', A.suburb.birdEvery); add('sprinkler', A.suburb.sprinklerEvery); }
    if (kind === 'harbor') { add('gull', A.harbor.gullEvery); add('horn', A.harbor.hornEvery); }
    if (kind === 'city') { add('buzz', A.city.buzzEvery); add('maglev', A.city.maglevEvery); }
  }

  private makeBed(kind: Exclude<Kind, 'none'>, t: number): VoiceOut | null {
    const g = this.g, ctx = g.ctx, A = AMBIENCE;
    const v = voice(g, g.amb, t, Infinity, PRI.loop - 1);
    if (!v) return null;
    const out = v.out;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(A.level, t + A.fade);
    const forever = t + 36000;
    if (kind === 'traffic') {
      v.src(noiseSrc(g, 'brown', filter(ctx, 'lowpass', A.traffic.lpHz, 0.7, gain(ctx, A.traffic.gain * 2.5, out))), t, forever);
    } else if (kind === 'suburb') {
      v.src(noiseSrc(g, 'pink', filter(ctx, 'bandpass', 2500, 0.5, gain(ctx, A.suburb.bedGain, out))), t, forever);
    } else if (kind === 'harbor') {
      const am = gain(ctx, 0.6, out);
      const l = osc(ctx, 'sine', 0.23), ld = gain(ctx, 0.35);
      l.connect(ld); ld.connect(am.gain);
      v.src(l, t, forever);
      v.src(noiseSrc(g, 'brown', filter(ctx, 'bandpass', A.harbor.waterBp, 0.8, gain(ctx, A.harbor.waterGain * 3, am))), t, forever);
    } else {
      const hum = gain(ctx, A.city.humGain, out);
      for (const [f, a] of [[60, 1], [120, 0.5], [180, 0.25]] as const) v.src(osc(ctx, 'sine', f, gain(ctx, a, hum)), t, forever);
      v.src(noiseSrc(g, 'brown', filter(ctx, 'lowpass', 400, 0.7, gain(ctx, 0.12, out))), t, forever);
    }
    return v;
  }

  /** Schedules ambience events that fall before `horizon`. */
  tick(now: number, horizon: number): void {
    if (this.kind === 'none') return;
    for (const e of this.evs) {
      if (e.next < now - 1) e.next = now + this.r.range(e.every[0], e.every[1]);
      if (e.next >= horizon) continue;
      this.play(e.name, Math.max(now, e.next));
      e.next += this.r.range(e.every[0], e.every[1]);
    }
  }

  private play(name: string, t: number): void {
    const g = this.g, ctx = g.ctx, r = this.r;
    const ev = (len: number, lvl: number, pan = 0) => {
      const v = voice(g, g.amb, t, t + len + 0.05, PRI.ambience);
      if (!v) return null;
      v.out.gain.value = lvl;
      if (!pan) return { v, d: v.out as AudioNode };
      const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(v.out);
      return { v, d: p as AudioNode };
    };
    switch (name) {
      case 'pigeons': {
        const n = r.int(6, 11), s = ev(n * 0.08 + 0.1, 0.5, r.range(-0.7, 0.7)); if (!s) return;
        for (let i = 0; i < n; i++) nz(g, s.v, s.d, t + i * 0.075 + r.range(0, 0.01), 0.03, 'bandpass', 1300 + r.range(-200, 300), 1.2, 0.5 * (1 - i / (n + 2)));
        return;
      }
      case 'birds': {
        const n = r.int(2, 4), s = ev(n * 0.15 + 0.1, 0.22, r.range(-0.8, 0.8)); if (!s) return;
        for (let i = 0; i < n; i++) {
          const up = r.chance(0.6), f0 = up ? r.range(3000, 3600) : r.range(4400, 5000), f1 = up ? r.range(4300, 5000) : r.range(3000, 3500);
          tn(g, s.v, s.d, t + i * r.range(0.11, 0.16), r.range(0.05, 0.09), 'sine', f0, 0.5, 0.005, f1);
        }
        return;
      }
      case 'sprinkler': {
        const n = r.int(10, 18), s = ev(n * 0.14 + 0.1, 0.18, r.range(-0.6, 0.6)); if (!s) return;
        for (let i = 0; i < n; i++) nz(g, s.v, s.d, t + i * 0.13, 0.012, 'highpass', 3500, 0.7, 0.6);
        return;
      }
      case 'gull': {
        const n = r.int(1, 3), s = ev(n * 0.45 + 0.2, 0.16, r.range(-0.8, 0.8)); if (!s) return;
        for (let i = 0; i < n; i++) {
          const at = t + i * r.range(0.35, 0.5);
          const o = tn(g, s.v, s.d, at, 0.32, 'triangle', r.range(1700, 2000), 0.45, 0.03, r.range(1150, 1300), 0.3);
          const vib = osc(ctx, 'sine', 11), vd = gain(ctx, 40); vib.connect(vd); vd.connect(o.frequency);
          s.v.src(vib, at, at + 0.36);
        }
        return;
      }
      case 'horn': {
        // Low foghorn on the key's tonic (C2 in C minor) with a fifth, a slow 2.5 s swell.
        const s = ev(3, 0.3, r.range(-0.5, 0.5)); if (!s) return;
        const f = midiHz(36 + AREA_MUSIC.docks.tonic);
        const lp = filter(ctx, 'lowpass', 320, 0.7, s.d);
        const eg = gain(ctx, 0, lp);
        for (const k of [1, 1.5]) s.v.src(osc(ctx, 'sawtooth', f * k, gain(ctx, k === 1 ? 0.5 : 0.25, eg)), t, t + 2.9);
        eg.gain.setValueAtTime(0, t); eg.gain.linearRampToValueAtTime(0.5, t + 0.8); eg.gain.setValueAtTime(0.5, t + 1.8); eg.gain.linearRampToValueAtTime(0, t + 2.8);
        return;
      }
      case 'buzz': {
        const len = r.range(3, 6), s = ev(len, 0.1, r.range(-0.5, 0.5)); if (!s) return;
        const eg = gain(ctx, 0, filter(ctx, 'bandpass', 240, 4, s.d));
        s.v.src(osc(ctx, 'square', 120, eg), t, t + len);
        eg.gain.setValueAtTime(0, t); eg.gain.linearRampToValueAtTime(0.5, t + 1); eg.gain.setValueAtTime(0.5, t + len - 1); eg.gain.linearRampToValueAtTime(0, t + len - 0.02);
        return;
      }
      case 'maglev': {
        // A pass with Doppler: pitch 1.06 → 0.94, gain swell, pan sweep across.
        const len = 2.6, s = ev(len, 0.22); if (!s) return;
        const p = ctx.createStereoPanner(); p.connect(s.v.out);
        const dir = r.chance(0.5) ? 1 : -1;
        p.pan.setValueAtTime(-0.85 * dir, t); p.pan.linearRampToValueAtTime(0.85 * dir, t + len);
        const eg = gain(ctx, 0, filter(ctx, 'lowpass', 2200, 0.7, p));
        const o = osc(ctx, 'sawtooth', 220 * 1.06, eg);
        o.frequency.setValueAtTime(220 * 1.06, t); o.frequency.setTargetAtTime(220 * 0.94, t + len * 0.45, 0.15);
        s.v.src(o, t, t + len);
        const nsrc = noiseSrc(g, 'pink', filter(ctx, 'bandpass', 900, 0.8, eg));
        s.v.src(nsrc, t, t + len);
        eg.gain.setValueAtTime(0, t); eg.gain.linearRampToValueAtTime(0.4, t + len * 0.45); eg.gain.linearRampToValueAtTime(0, t + len);
        return;
      }
      default: return;
    }
  }
}
