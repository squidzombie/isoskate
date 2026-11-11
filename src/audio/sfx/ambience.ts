// audio/sfx/ambience.ts: the per-area ambience (DESIGN §19.1 "Per-area variations", RECLAIM theme §8), on the
// ambience bus (0.25). The city is quiet: no traffic anywhere, calm beds under the music.
//   Downtown `plaza`: wind (pink noise BP 500 Hz, slow LFO) and a faint fountain trickle; leaf rustles, wood-pigeon
//     coos and pigeon flutters.
//   Suburbs `suburb`: wind in grass and a cricket bed rising toward late gold; birds, a far-off woodpecker and a wind
//     chime in key (sprinkler ticks only near a sprinkler: `sprinkler()`).
//   Docks `harbor`: lapping water and gulls; a buoy bell (FM), moored-boat wood knocks, halyard clinks, a chime.
//   Neon `city`: the live signs' hum, vending buzz, after-rain drips in key and a softer, rarer maglev pass.
//   Gateways (`gateway()`): Greenway meadow wind and bees, Level Crossing grass wind and the signal box's chime,
//     Harbor Bridge gulls and wind, Underpass drips with a 0.4 s echo.
// One bed per area (crossfaded on area changes) and seeded Poisson events scheduled by the music tick.
import type { GatewayId } from '../../core/ids';
import { Sfc32 } from '../../core/rng';
import { AMBIENCE, AREA_MUSIC, type MusicArea } from '../mix.config';
import type { Graph } from '../graph';
import { midiHz, pentatonicNote } from '../music/progressions';
import { filter, gain, noiseSrc, osc, voice, type VoiceOut } from '../synth';
import { PRI } from '../voices';
import { nz, tn } from './oneshots';

type Kind = 'plaza' | 'suburb' | 'harbor' | 'city' | 'none';
interface Bed { v: VoiceOut; kind: Kind }
interface Ev { name: string; every: readonly [number, number]; next: number }

export class Ambience {
  private bed: Bed | null = null;
  private kind: Kind = 'none';
  private area: MusicArea = 'menu';
  private evs: Ev[] = [];
  private readonly r: Sfc32;
  constructor(private readonly g: Graph, seed: number) { this.r = new Sfc32(seed ^ 0xa3b1); }

  setArea(area: MusicArea, t: number): void {
    const kind = AREA_MUSIC[area].ambience;
    this.area = area;
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
    if (kind === 'plaza') { add('leaves', A.plaza.leafEvery); add('coo', A.plaza.cooEvery); add('pigeons', A.plaza.pigeonEvery); }
    if (kind === 'suburb') { add('birds', A.suburb.birdEvery); add('woodpecker', A.suburb.woodpeckerEvery); add('chime', A.suburb.chimeEvery); }
    if (kind === 'harbor') {
      add('gull', A.harbor.gullEvery); add('bell', A.harbor.bellEvery); add('knock', A.harbor.knockEvery);
      add('clink', A.harbor.clinkEvery); add('chime', A.harbor.chimeEvery);
    }
    if (kind === 'city') { add('buzz', A.city.buzzEvery); add('drip', A.city.dripEvery); add('maglev', A.city.maglevEvery); }
  }

  /** A noise bed band-passed at `hz`, its level breathing on a slow LFO (wind). */
  private wind(v: VoiceOut, out: AudioNode, t: number, forever: number, hz: number, level: number, lfoHz: number, q = 0.6): void {
    const ctx = this.g.ctx;
    const am = gain(ctx, level, out);
    const l = osc(ctx, 'sine', lfoHz), ld = gain(ctx, level * 0.5);
    l.connect(ld); ld.connect(am.gain);
    v.src(l, t, forever);
    v.src(noiseSrc(this.g, 'pink', filter(ctx, 'bandpass', hz, q, am)), t, forever);
  }

  private makeBed(kind: Exclude<Kind, 'none'>, t: number): VoiceOut | null {
    const g = this.g, ctx = g.ctx, A = AMBIENCE;
    const v = voice(g, g.amb, t, Infinity, PRI.loop - 1);
    if (!v) return null;
    const out = v.out;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(A.level, t + A.fade);
    const forever = t + 36000;
    // (Band-passed pink noise loses most of its energy: the makeup factors keep each bed's level where §8 sets it.)
    if (kind === 'plaza') {
      this.wind(v, out, t, forever, A.plaza.windBp, A.plaza.windGain * 4, A.plaza.windLfoHz);
      // The fountain: a brighter, faster-shimmering trickle, much quieter.
      const tr = gain(ctx, A.plaza.fountainGain * 5, out);
      const l = osc(ctx, 'sine', 3.1), ld = gain(ctx, A.plaza.fountainGain * 1.5); l.connect(ld); ld.connect(tr.gain);
      v.src(l, t, forever);
      v.src(noiseSrc(g, 'white', filter(ctx, 'bandpass', A.plaza.fountainBp, 1.2, tr)), t, forever);
    } else if (kind === 'suburb') {
      this.wind(v, out, t, forever, A.suburb.grassBp, A.suburb.grassGain * 4, 0.09);
      // Crickets: a 4.2 kHz tone chopped at 30 Hz, fading in toward late gold.
      const cr = gain(ctx, 0, out);
      cr.gain.setValueAtTime(0, t);
      cr.gain.linearRampToValueAtTime(A.suburb.cricketGain * 0.6, t + A.fade);
      cr.gain.linearRampToValueAtTime(A.suburb.cricketGain, t + A.suburb.cricketRiseSec);
      const chop = gain(ctx, 0.5, cr), am = osc(ctx, 'square', A.suburb.cricketAmHz), amd = gain(ctx, 0.5);
      am.connect(amd); amd.connect(chop.gain);
      v.src(am, t, forever);
      v.src(osc(ctx, 'sine', A.suburb.cricketHz, chop), t, forever);
    } else if (kind === 'harbor') {
      const am = gain(ctx, 0.6, out);
      const l = osc(ctx, 'sine', 0.23), ld = gain(ctx, 0.35);
      l.connect(ld); ld.connect(am.gain);
      v.src(l, t, forever);
      v.src(noiseSrc(g, 'brown', filter(ctx, 'bandpass', A.harbor.waterBp, 0.8, gain(ctx, A.harbor.waterGain * 3, am))), t, forever);
    } else {
      const hum = gain(ctx, A.city.humGain, out);
      for (const [f, a] of [[60, 1], [120, 0.5], [180, 0.25]] as const) v.src(osc(ctx, 'sine', f, gain(ctx, a, hum)), t, forever);
      v.src(noiseSrc(g, 'brown', filter(ctx, 'lowpass', 400, 0.7, gain(ctx, 0.08, out))), t, forever);
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

  /** Sprinkler ticks, for a sprinkler decor in earshot (the caller knows where they are; never scheduled at random). */
  sprinkler(t: number): void { if (this.kind !== 'none') this.play('sprinkler', t); }

  /** The gateway's own moment over the crossfade (RECLAIM theme §8). */
  gateway(id: GatewayId, t: number): void {
    const A = AMBIENCE.gateway, r = this.r;
    switch (id) {
      case 'greenway': this.play('gust', t); this.play('bees', t + 0.4); return;
      case 'levelCrossing': this.play('gust', t); this.play('chime', t + r.range(0.8, 1.6)); return;
      case 'harborBridge': this.play('gust', t); this.play('gull', t + r.range(0.3, 1)); this.play('gull', t + r.range(2, 3.2)); return;
      case 'underpass': for (let k = 0; k < 6; k++) this.play('echoDrip', t + (k / 6) * A.sec + r.range(0, 0.4)); return;
      default: return;
    }
  }

  /** A pentatonic note of the current area's key (minor keys use the relative major's pentatonic, §9). */
  private keyHz(deg: number, octave: number): number {
    return midiHz(pentatonicNote(AREA_MUSIC[this.area === 'menu' ? 'downtown' : this.area], deg, octave));
  }

  private play(name: string, t: number): void {
    const g = this.g, ctx = g.ctx, r = this.r, A = AMBIENCE;
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
      case 'leaves': {
        // A leaf rustle: high-passed noise swelling over 0.4 s, a few grains on top.
        const s = ev(0.5, 0.28, r.range(-0.8, 0.8)); if (!s) return;
        nz(g, s.v, s.d, t, 0.4, 'highpass', 2000, 0.6, 0.35, 0.002, undefined, 'swell');
        for (let i = 0; i < 4; i++) nz(g, s.v, s.d, t + 0.05 + r.range(0, 0.3), 0.02, 'bandpass', r.range(3000, 5200), 1.5, 0.2);
        return;
      }
      case 'coo': {
        // A wood pigeon far off: two soft sine pairs gliding 450 → 380 Hz, through a low-pass.
        const s = ev(1.6, 0.16, r.range(-0.7, 0.7)); if (!s) return;
        const lp = filter(ctx, 'lowpass', 1200, 0.7, s.d);
        const [f0, f1] = A.plaza.coo;
        for (let k = 0; k < 2; k++) {
          const at = t + k * 0.62;
          tn(g, s.v, lp, at, 0.22, 'sine', f0, 0.5, 0.04, f1, 0.2);
          tn(g, s.v, lp, at + 0.28, 0.26, 'sine', f0 * 0.97, 0.42, 0.05, f1 * 0.97, 0.24);
        }
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
      case 'woodpecker': {
        // A far woodpecker drum: noise bursts at 16 Hz for 0.5 s, band-passed at 1.2 kHz, wide in the stereo field.
        const s = ev(0.6, 0.2, (r.chance(0.5) ? -1 : 1) * r.range(0.7, 0.95)); if (!s) return;
        const n = Math.round(0.5 * A.suburb.woodpeckerHz);
        for (let i = 0; i < n; i++) nz(g, s.v, s.d, t + i / A.suburb.woodpeckerHz, 0.012, 'bandpass', A.suburb.woodpeckerBp, 3, 0.6 * (1 - (i / n) * 0.5));
        return;
      }
      case 'chime': {
        // A wind chime (Suburbs), the signal box (Level Crossing) or a mast chime (Docks): 3–5 pentatonic notes.
        const n = r.int(3, 5), s = ev(n * 0.3 + 1.6, 0.09, r.range(-0.6, 0.6)); if (!s) return;
        for (let i = 0; i < n; i++) {
          const f = this.keyHz(r.int(0, 4), r.chance(0.5) ? 6 : 5), at = t + i * r.range(0.12, 0.3);
          tn(g, s.v, s.d, at, 1.4, 'sine', f, 0.5, 0.003);
          tn(g, s.v, s.d, at, 0.6, 'sine', f * 2.76, 0.12, 0.002);
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
      case 'bell': {
        // A buoy bell out on the water: FM (modulator at 3.5× the carrier), the index and the level decaying together.
        const len = 3, s = ev(len, 0.12, r.range(-0.6, 0.6)); if (!s) return;
        const f = this.keyHz(0, 5), eg = gain(ctx, 0, filter(ctx, 'lowpass', 3200, 0.7, s.d));
        const car = osc(ctx, 'sine', f, eg), mod = osc(ctx, 'sine', f * A.harbor.bellRatio), idx = gain(ctx, f * 2.2);
        mod.connect(idx); idx.connect(car.frequency);
        idx.gain.setValueAtTime(f * 2.2, t); idx.gain.exponentialRampToValueAtTime(f * 0.15, t + len * 0.8);
        eg.gain.setValueAtTime(0, t); eg.gain.linearRampToValueAtTime(0.5, t + 0.004); eg.gain.exponentialRampToValueAtTime(0.001, t + len);
        s.v.src(car, t, t + len); s.v.src(mod, t, t + len);
        return;
      }
      case 'knock': {
        // Hollow wood knocks from moored boats: a pair of 220 Hz body thunks, 60 ms each, with a soft click.
        const s = ev(0.5, 0.2, r.range(-0.7, 0.7)); if (!s) return;
        for (let k = 0; k < 2; k++) {
          const at = t + k * r.range(0.16, 0.26), f = A.harbor.knockHz * r.range(0.95, 1.08);
          tn(g, s.v, s.d, at, 0.06, 'sine', f, 0.6, 0.002, f * 0.85, 0.06);
          nz(g, s.v, s.d, at, 0.015, 'bandpass', 1400, 1.2, 0.12);
        }
        return;
      }
      case 'clink': {
        // Halyards on the masts: 2–4 small metal pings, irregular.
        const n = r.int(2, 4), s = ev(n * 0.25 + 0.3, 0.07, r.range(-0.8, 0.8)); if (!s) return;
        for (let i = 0; i < n; i++) {
          const at = t + i * r.range(0.12, 0.3), f = r.range(2400, 3200);
          tn(g, s.v, s.d, at, 0.18, 'triangle', f, 0.4, 0.001);
          tn(g, s.v, s.d, at, 0.1, 'sine', f * 1.51, 0.15, 0.001);
        }
        return;
      }
      case 'buzz': {
        const len = r.range(3, 6), s = ev(len, 0.1, r.range(-0.5, 0.5)); if (!s) return;
        const eg = gain(ctx, 0, filter(ctx, 'bandpass', 240, 4, s.d));
        s.v.src(osc(ctx, 'square', 120, eg), t, t + len);
        eg.gain.setValueAtTime(0, t); eg.gain.linearRampToValueAtTime(0.5, t + 1); eg.gain.setValueAtTime(0.5, t + len - 1); eg.gain.linearRampToValueAtTime(0, t + len - 0.02);
        return;
      }
      case 'drip': case 'echoDrip': {
        // After-rain drips: short sine plinks in key, a small downward bend; the Underpass adds a 0.4 s echo.
        const echo = name === 'echoDrip', s = ev(echo ? 2 : 0.2, echo ? 0.1 : 0.08, r.range(-0.8, 0.8)); if (!s) return;
        let dest = s.d;
        if (echo) {
          const dl = ctx.createDelay(1); dl.delayTime.value = A.gateway.echoSec;
          const fb = gain(ctx, A.gateway.echoFeedback); dl.connect(fb); fb.connect(dl);
          dl.connect(gain(ctx, 0.5, s.d));
          const split = gain(ctx, 1, s.d); split.connect(dl);
          dest = split;
        }
        const f = this.keyHz(r.int(0, 4), 6);
        tn(g, s.v, dest, t, 0.06, 'sine', f, 0.5, 0.001, f * 0.95, 0.05);
        return;
      }
      case 'gust': {
        // A meadow or harbour gust over the gateway: band-passed noise swelling and falling.
        const len = A.gateway.sec, s = ev(len, 0.3); if (!s) return;
        nz(g, s.v, s.d, t, len, 'bandpass', 700, 0.5, 0.45, 0.002, 500, 'swell');
        return;
      }
      case 'bees': {
        // Bees in the Greenway's wild grass: a soft buzz wobbling at 5 Hz, drifting across.
        const len = 3.6, s = ev(len, 0.06); if (!s) return;
        const p = ctx.createStereoPanner(); p.connect(s.d);
        const dir = r.chance(0.5) ? 1 : -1;
        p.pan.setValueAtTime(-0.7 * dir, t); p.pan.linearRampToValueAtTime(0.7 * dir, t + len);
        const eg = gain(ctx, 0, filter(ctx, 'lowpass', 900, 0.7, p));
        const o = osc(ctx, 'sawtooth', r.range(205, 235), eg), wob = osc(ctx, 'sine', 5), wd = gain(ctx, 9);
        wob.connect(wd); wd.connect(o.frequency);
        eg.gain.setValueAtTime(0, t); eg.gain.linearRampToValueAtTime(0.4, t + 0.8); eg.gain.setValueAtTime(0.4, t + len - 1); eg.gain.linearRampToValueAtTime(0, t + len);
        s.v.src(o, t, t + len); s.v.src(wob, t, t + len);
        return;
      }
      case 'maglev': {
        // A softer pass with Doppler: pitch 1.06 → 0.94, gain swell, pan sweep across.
        const len = 2.6, s = ev(len, A.city.maglevGain); if (!s) return;
        const p = ctx.createStereoPanner(); p.connect(s.v.out);
        const dir = r.chance(0.5) ? 1 : -1;
        p.pan.setValueAtTime(-0.85 * dir, t); p.pan.linearRampToValueAtTime(0.85 * dir, t + len);
        const eg = gain(ctx, 0, filter(ctx, 'lowpass', 1600, 0.7, p));
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
