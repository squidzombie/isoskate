// audio/sfx/grind.ts: the grind loop driven every frame by audio.grind() (DESIGN §19.3 grind table): metal rail
// (three resonant band-passes + gritty 95 Hz saw, ±5% drift at 3 Hz), concrete/stone (900 Hz band, 20 Hz grain),
// wood (600 Hz band into a 4 ms comb, occasional creak), neon (metal + 60 Hz hum), and the 50% deck scrape on slides.
// Built when a grind starts, released (60 ms) and stopped when it ends: no idle cost between grinds.
import type { EdgeMaterial } from '../../core/ids';
import { GRIND_LOOP, GRIND_MATERIAL } from '../mix.config';
import type { Graph } from '../graph';
import { filter, gain, noiseSrc, osc, voice, type VoiceOut } from '../synth';
import { PRI } from '../voices';

const L = GRIND_LOOP;

export class GrindLoop {
  private cur: { v: VoiceOut; key: string; creak: OscillatorNode | null; creakGain: GainNode | null; nextCreak: number } | null = null;
  constructor(private readonly g: Graph) {}

  update(now: number, active: boolean, material: EdgeMaterial | null, slide: boolean): void {
    const key = active && material ? `${GRIND_MATERIAL[material]}${slide ? '+s' : ''}` : '';
    if (this.cur && this.cur.key !== key) this.release(now);
    if (!key || this.cur) { if (this.cur) this.creak(now); return; }
    this.start(now, GRIND_MATERIAL[material!], slide, key);
  }

  private release(now: number): void {
    const c = this.cur!;
    this.cur = null;
    const p = c.v.out.gain;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(0, now, L.release / 4);
    c.v.kill(now + L.release);
    c.v.v.end = now + L.release + 0.05;
  }

  private start(now: number, kind: 'metal' | 'concrete' | 'wood' | 'neon', slide: boolean, key: string): void {
    const g = this.g, ctx = g.ctx;
    const v = voice(g, g.sfx, now, Infinity, PRI.loop - 1);
    if (!v) return;
    const forever = now + 3600;
    const mix = gain(ctx, L.level, v.out);
    let creak: OscillatorNode | null = null, creakGain: GainNode | null = null;
    if (kind === 'metal' || kind === 'neon') {
      const m = L.metal;
      const sum = gain(ctx, m.gain * m.makeup, mix);
      const src = noiseSrc(g, 'white');
      const drift = osc(ctx, 'sine', m.driftHz);
      const driftDepth = gain(ctx, m.driftCents);
      drift.connect(driftDepth);
      for (const [f, q] of m.bp) {
        const b = filter(ctx, 'bandpass', f, q, sum);
        driftDepth.connect(b.detune);
        src.connect(b);
      }
      v.src(drift, now, forever);
      v.src(src, now, forever);
      // Grit: a 95 Hz saw amplitude-modulated by noise, low-passed at 1.2 kHz.
      const grit = gain(ctx, 0, filter(ctx, 'lowpass', m.gritLp, 0.7, gain(ctx, m.gritGain * 3, mix)));
      v.src(osc(ctx, 'sawtooth', m.gritHz, grit), now, forever);
      const am = noiseSrc(g, 'brown');
      am.connect(grit.gain);
      if (kind === 'neon') {
        const n = L.neon;
        const hum = filter(ctx, 'bandpass', n.humBp, n.humQ, gain(ctx, n.humGain * 4, mix));
        v.src(osc(ctx, 'square', n.humHz, hum), now, forever);
      }
      v.src(am, now, forever);
    } else if (kind === 'concrete') {
      const c = L.concrete;
      const amg = gain(ctx, 0.6, gain(ctx, c.gain * 3, mix));
      const lp = filter(ctx, 'lowpass', c.lpHz, 0.7, amg);
      v.src(noiseSrc(g, 'white', filter(ctx, 'bandpass', c.bpHz, c.q, lp)), now, forever);
      // Grainy random AM: brown noise slowed down so its energy sits below ~20 Hz.
      const grain = gain(ctx, 0.5);
      grain.connect(amg.gain);
      v.src(noiseSrc(g, 'brown', grain, c.amHz / 250), now, forever);
    } else {
      const w = L.wood;
      const out = gain(ctx, w.gain * 3, mix);
      const comb = ctx.createDelay(0.05);
      comb.delayTime.value = w.comb;
      const fb = gain(ctx, w.fb, comb);
      comb.connect(fb); comb.connect(out);
      const bp = filter(ctx, 'bandpass', w.bpHz, w.q, out);
      bp.connect(comb);
      v.src(noiseSrc(g, 'white', bp), now, forever);
      creakGain = gain(ctx, 0, out);
      creak = osc(ctx, 'triangle', w.creakHz, creakGain);
      const vib = osc(ctx, 'sine', 5);
      const vd = gain(ctx, 8); vib.connect(vd); vd.connect(creak.frequency);
      v.src(creak, now, forever); v.src(vib, now, forever);
    }
    if (slide) {
      const s = L.slide;
      v.src(noiseSrc(g, 'white', filter(ctx, 'bandpass', s.bpHz, s.q, gain(ctx, s.mix * 2, mix))), now, forever);
    }
    const p = v.out.gain;
    p.setValueAtTime(0, now);
    p.linearRampToValueAtTime(1, now + L.attack);
    this.cur = { v, key, creak, creakGain, nextCreak: now + 0.4 + g.rng.float() };
  }

  /** Wood: an occasional creak (220 Hz with vibrato) while the grind lasts. */
  private creak(now: number): void {
    const c = this.cur;
    if (!c || !c.creakGain || now < c.nextCreak) return;
    const p = c.creakGain.gain;
    p.setValueAtTime(0, now);
    p.linearRampToValueAtTime(0.05, now + 0.06);
    p.linearRampToValueAtTime(0, now + 0.28);
    c.creak!.frequency.setValueAtTime(L.wood.creakHz * (0.9 + 0.2 * this.g.rng.float()), now);
    c.nextCreak = now + 0.6 + this.g.rng.float() * 1.2;
  }

  stop(now: number): void { if (this.cur) this.release(now); }
}
