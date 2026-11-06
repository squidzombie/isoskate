// audio/music/drums.ts: drum voices (DESIGN §19.1 drum table and per-area kits). Noise hits share one filter per
// drum type on the drum bus, so a hat costs two nodes. The kick also fires the sidechain duck.
import type { AreaMusic } from '../mix.config';
import { BRUSH, CLAP, HATS, KICK, METAL_RING, RIM, SHAKER, SIDECHAIN, SNARE } from '../mix.config';
import type { Graph } from '../graph';
import { noiseOffset, osc, perc, voice, type VoiceOut } from '../synth';
import { PRI } from '../voices';
import type { Inst } from './sequencer';

function noiseHit(g: Graph, dest: AudioNode, t: number, peak: number, attack: number, decay: number): VoiceOut | null {
  const v = voice(g, dest, t, t + attack + decay + 0.02, PRI.music);
  if (!v) return null;
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise.white;
  src.connect(v.out);
  perc(v.out.gain, t, peak, attack, decay);
  src.start(Math.max(t, 0), noiseOffset(g));
  src.stop(t + attack + decay + 0.02);
  if (g.live) src.onended = () => { try { v.out.disconnect(); } catch { /* gone */ } };
  return v;
}

function sidechain(g: Graph, t: number, amount: number): void {
  const p = g.music.side.gain;
  p.setTargetAtTime(1 - (1 - SIDECHAIN.depth) * amount, t, SIDECHAIN.attack / 3);
  p.setTargetAtTime(1, t + SIDECHAIN.attack, SIDECHAIN.tau);
}

/** The ringing open hat per graph, choked by the next closed hat. */
const openHats = new WeakMap<Graph, VoiceOut>();

export function playDrum(g: Graph, inst: Inst, t: number, vel: number, a: AreaMusic): void {
  const ctx = g.ctx, d = g.music.drums;
  switch (inst) {
    case 'kick': {
      const dec = a.kick.decay;
      const v = voice(g, g.music.drumBus, t, t + dec + 0.03, PRI.music);
      if (!v) return;
      const o = v.src(osc(ctx, 'sine', a.kick.f0, v.out), t, t + dec + 0.03);
      o.frequency.setValueAtTime(a.kick.f0, t);
      o.frequency.exponentialRampToValueAtTime(KICK.f1, t + KICK.sweep);
      perc(v.out.gain, t, KICK.gain * vel, KICK.attack, dec);
      noiseHit(g, d.click, t, KICK.clickGain * vel, 0.0005, KICK.clickMs / 1000);
      if (vel > 0.6) sidechain(g, t, Math.min(1, vel));
      return;
    }
    case 'snare': {
      if (a.snare === 'brush') {
        noiseHit(g, d.brush, t, BRUSH.gain * vel * 1.6, BRUSH.attack, BRUSH.decay);
        return;
      }
      noiseHit(g, d.snare, t, SNARE.gain * vel * 1.5, 0.001, SNARE.decay);
      const v = voice(g, g.music.drumBus, t, t + SNARE.toneDecay + 0.02, PRI.music);
      if (v) {
        v.src(osc(ctx, 'triangle', SNARE.toneHz, v.out), t, t + SNARE.toneDecay + 0.02);
        perc(v.out.gain, t, SNARE.toneGain * vel, 0.001, SNARE.toneDecay);
      }
      if (a.snare === 'metal' && vel > 0.5) {
        const r = voice(g, g.music.drumBus, t, t + METAL_RING.decay + 0.02, PRI.music);
        if (r) {
          for (const f of METAL_RING.f) r.src(osc(ctx, 'square', f, r.out), t, t + METAL_RING.decay + 0.02);
          perc(r.out.gain, t, METAL_RING.gain * vel, 0.001, METAL_RING.decay);
        }
      }
      return;
    }
    case 'rim': {
      noiseHit(g, d.rim, t, RIM.gain * vel * 2, 0.0005, RIM.decay);
      return;
    }
    case 'clap': {
      for (let i = 0; i < CLAP.bursts; i++) noiseHit(g, d.clap, t + i * CLAP.spacing, CLAP.gain * vel * (i === CLAP.bursts - 1 ? 1 : 0.7), 0.0008, i === CLAP.bursts - 1 ? CLAP.tail : 0.012);
      return;
    }
    case 'hatC': {
      const oh = openHats.get(g);
      if (oh && oh.v.end > t) { oh.kill(t); openHats.delete(g); }    // choke the open hat
      noiseHit(g, d.hat, t, HATS.gain * vel, 0.0008, a.hats.closed);
      return;
    }
    case 'hatO': {
      const v = noiseHit(g, d.hat, t, HATS.gain * vel, 0.002, HATS.open);
      if (v) openHats.set(g, v);
      return;
    }
    case 'shaker': {
      noiseHit(g, d.shaker, t, SHAKER.gain * vel * 4, 0.004, SHAKER.decay);
      return;
    }
    default: return;
  }
}
