// audio/sfx/roll.ts: the continuous layers driven every frame by audio.roll() (DESIGN §19.3): the rolling loop with
// surface variants and joint ticks, the airborne wheel whir, and the wind bed. Parameters move with setTargetAtTime
// and only when they change, so a frame costs a few comparisons.
import type { Surface } from '../../core/ids';
import { V_MAX } from '../../core/tuning';
import { ROLL, WIND, type SurfaceRoll } from '../mix.config';
import type { Graph } from '../graph';
import { after, pcm, tick, type Pcm } from '../bank';
import { biquad, whitePcm } from './noise';
import { filter, gain, lfo, noiseOffset, noiseSrc, osc, voice } from '../synth';
import { PRI, type Voice } from '../voices';

export class RollLoop {
  private readonly bp: BiquadFilterNode; private readonly lp: BiquadFilterNode; private readonly base: GainNode;
  private readonly rumble: GainNode; private readonly ring: GainNode; private readonly hiss: GainNode; private readonly wood: GainNode;
  private readonly out: GainNode; private readonly whir: GainNode; private readonly whirOsc: OscillatorNode;
  private readonly wind: GainNode;
  private readonly key = { gain: -1, f: -1, q: -1, rumble: -1, ring: -1, hiss: -1, wood: -1, lp: -1, out: -1, wind: -1 };
  private lastT = -1; private dist = 0; private wasAir = false; private surface: Surface = 'asphalt';
  readonly voices: Voice[] = [];

  constructor(private readonly g: Graph) {
    const ctx = g.ctx;
    this.out = gain(ctx, 0, g.sfx);
    const level = gain(ctx, ROLL.level, this.out);
    this.lp = filter(ctx, 'lowpass', 18000, 0.5, level);
    this.base = gain(ctx, 0, this.lp);
    this.bp = filter(ctx, 'bandpass', ROLL.bpBase, 0.5, this.base);
    const white = noiseSrc(g, 'white', this.bp);
    this.rumble = gain(ctx, 0, this.lp);
    const brown = noiseSrc(g, 'brown', filter(ctx, 'lowpass', ROLL.rumbleLp, 0.7, this.rumble));
    this.ring = gain(ctx, 0, this.lp);
    white.connect(filter(ctx, 'bandpass', 1200, 8, this.ring));
    this.hiss = gain(ctx, 0, this.lp);
    white.connect(filter(ctx, 'highpass', 4000, 0.7, this.hiss));
    this.wood = gain(ctx, 0, this.lp);
    white.connect(filter(ctx, 'bandpass', 400, 4, this.wood));
    white.start(0, noiseOffset(g)); brown.start(0, noiseOffset(g));
    // Airborne wheel whir (about 900 Hz, tuned to the nearest chord tone at take-off; fades over 0.4 s).
    this.whir = gain(ctx, 0, g.sfx);
    this.whirOsc = osc(ctx, 'triangle', ROLL.whirHz, this.whir);
    this.whirOsc.start(0);
    // Wind bed: pink noise band-passed at 600 Hz (Q 0.7), slowly panned; fades in from 8.0 m/s.
    const pan = ctx.createStereoPanner();
    pan.connect(g.sfx);
    lfo(ctx, WIND.panHz, WIND.pan, pan.pan);
    this.wind = gain(ctx, 0, pan);
    noiseSrc(g, 'pink', filter(ctx, 'bandpass', WIND.bpHz, WIND.q, this.wind)).start(0, noiseOffset(g));
    for (let i = 0; i < 2; i++) { const v: Voice = { end: Infinity, pri: PRI.loop, stop: () => undefined }; g.voices.add(v, ctx.currentTime); this.voices.push(v); }
  }

  private set(p: AudioParam, k: keyof RollLoop["key"], v: number, now: number, tau: number = ROLL.tau, eps = 0.005): void {
    const old = this.key[k];
    if (Math.abs(old - v) <= eps * Math.max(1, Math.abs(v))) return;
    this.key[k] = v;
    p.setTargetAtTime(v, now, tau);
  }

  /** `tune` maps the whir's nominal frequency to the nearest chord tone (called at take-off only). */
  update(now: number, speed01: number, surface: Surface, airborne: boolean, manual: boolean, tune?: (hz: number) => number): void {
    const dt = this.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, now - this.lastT));
    this.lastT = now;
    const sf: SurfaceRoll = ROLL.surfaces[surface] ?? ROLL.surfaces.asphalt;
    const rolling = speed01 > 0.01 && !airborne;
    const s = Math.min(1, Math.max(0, speed01));
    const bpF = (ROLL.bpBase + ROLL.bpSpan * s) * (manual ? ROLL.manualBp : 1);
    const g0 = (ROLL.gainLo + (ROLL.gainHi - ROLL.gainLo) * s) * sf.gain * (manual ? ROLL.manualGain : 1);
    const tau = airborne ? ROLL.airFade / 3 : ROLL.tau;
    this.set(this.out.gain, 'out', rolling ? 1 : 0, now, tau);
    this.set(this.base.gain, 'gain', g0 * 6, now);
    this.set(this.bp.frequency, 'f', bpF, now);
    this.set(this.bp.Q, 'q', sf.q, now, 0.05);
    this.set(this.rumble.gain, 'rumble', g0 * sf.rumble * 1.5, now);
    this.set(this.ring.gain, 'ring', g0 * sf.ring * 10, now);
    this.set(this.hiss.gain, 'hiss', g0 * sf.hiss * 3, now);
    this.set(this.wood.gain, 'wood', g0 * sf.woodRes * 6, now);
    this.set(this.lp.frequency, 'lp', sf.lpHz, now, 0.08);
    // Wind: 0 below 8.0 m/s, `gain` at 10.5 m/s; off-run speed01 is 0.
    const v = s * V_MAX;
    const w = Math.min(1, Math.max(0, (v - WIND.fromMs) / (WIND.fullMs - WIND.fromMs)));
    this.set(this.wind.gain, 'wind', WIND.gain * WIND.level * w * w, now, 0.4);
    // Airborne: the whir starts at take-off and fades over 0.4 s.
    if (airborne && !this.wasAir && s > 0.01) {
      const p = this.whir.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(ROLL.whirGain * (0.6 + 0.4 * s), now);
      p.setTargetAtTime(0, now, ROLL.whirFade / 4);
      const hz = ROLL.whirHz * (0.9 + 0.2 * s);
      this.whirOsc.frequency.setValueAtTime(tune ? tune(hz) : hz, now);
    } else if (!airborne && this.wasAir) this.whir.gain.setTargetAtTime(0, now, 0.01);
    this.wasAir = airborne;
    // Joint ticks by distance travelled (concrete 1.5 m, wood planks 0.3 m).
    if (surface !== this.surface) { this.surface = surface; this.dist = 0; }
    if (rolling && sf.joint) {
      const speed = s * V_MAX;
      const d0 = this.dist;
      this.dist += speed * dt;
      let n = Math.floor(this.dist / sf.joint) - Math.floor(d0 / sf.joint);
      let k = Math.floor(d0 / sf.joint) + 1;
      while (n-- > 0 && speed > 0.1) {
        const at = now + 0.03 + (k * sf.joint - d0) / speed - dt;
        this.joint(Math.max(now, at), sf, g0);
        k++;
      }
    }
  }

  /** A joint tick: 8 ms of noise high-passed at 1.5 kHz plus a short thump, pre-rendered per thump pitch (bank). */
  private joint(t: number, sf: SurfaceRoll, g0: number): void {
    const g = this.g;
    const b = jointPcm(sf.thumpHz).buffer(g.ctx);
    const v = voice(g, this.lp, t, t + b.duration, PRI.sfx);
    if (!v) return;
    v.out.gain.value = g0 * ROLL.jointGain * 8;
    const src = g.ctx.createBufferSource();
    src.buffer = b;
    src.connect(v.out);
    v.src(src, t, t + b.duration);
  }
}

/** The joint tick buffer for a thump pitch (registered at boot for every surface's pitch). */
export function jointPcm(thumpHz: number): Pcm {
  const white = whitePcm();
  return pcm(`joint:${thumpHz}`, 1, 0.05, function* (out, sr) {
    yield* after(white);
    const o = out[0]!, w = white.data()[0]!;
    const hp = biquad('highpass', ROLL.jointHp, Math.pow(10, 0.7 / 20), sr);
    const jd = ROLL.jointMs / 1000;
    for (let i = 0; i < o.length; i++) {
      const t = i / sr;
      const e = (a: number, d: number) => (t < a ? t / a : Math.exp((-6.9 * (t - a)) / d));
      o[i] = hp(w[i]!) * e(0.0005, jd) + Math.sin(2 * Math.PI * thumpHz * t) * 1.6 * e(0.001, 0.04);
      if (tick(i)) yield;
    }
  });
}
export function registerJoints(): void {
  for (const sf of Object.values(ROLL.surfaces) as SurfaceRoll[]) if (sf.joint) jointPcm(sf.thumpHz);
}
