// audio/graph.ts: the mix graph (DESIGN §19.1 lo-fi chain, §19.2 buses), built once per AudioContext (live or offline).
//
//  drums ─▶ drumBus ─▶ drumLp ─────────────────────────────┐
//  EP ─▶ epLp ─▶ tremolo/auto-pan ─┐                         │
//  pad ─▶ padLp(+LFO) ─▶ [chorus] ─┼▶ harmonic ─▶ comboLp ─▶ side ─┼▶ sum ─▶ formLp ─▶ tape ─▶ stop ─▶ duck ─▶ musicVol ─┐
//  mallet ─▶ (dry + 3/16 echo) ────┤               bass ───▶ side ─┘   ▲ vinyl                                          │
//  arp, clanks ────────────────────┘                                                                                    ▼
//  feedback notes ─▶ fb (+echo) ─▶ fbVol ───────────────────────────────────────────────────────────────▶ master: comp ▶ limiter ▶ out
//  SFX, roll, wind, grind ─▶ sfx ─▶ sfxVol ──────────────────────────────────────────────────────────────▲
//  ambience ─▶ amb ─▶ ambVol ─────────────────────────────────────────────────────────────────────────────┘
import { Sfc32 } from '../core/rng';
import {
  BUS, CLAP, COMBO_FILTER, DRUM_BUS_LP, DRUM_LEVEL, EP, HATS, MALLET, MASTER, MUD_CUT, PAD, RIM, SHAKER, SNARE, BRUSH, KICK,
} from './mix.config';
import { buildTape, type Tape } from './music/tape';
import { startVinyl } from './music/vinyl';
import { makeNoiseBank } from './sfx/noise';
import { filter, gain, lfo, osc, type Synth } from './synth';
import { VoicePool } from './voices';

export interface DrumFilters { click: BiquadFilterNode; snare: BiquadFilterNode; rim: BiquadFilterNode; brush: BiquadFilterNode;
  hat: BiquadFilterNode; shaker: BiquadFilterNode; clap: BiquadFilterNode }
export interface Graph extends Synth {
  master: GainNode; out: GainNode; comp: DynamicsCompressorNode; limiter: DynamicsCompressorNode;
  music: {
    sum: GainNode; formLp: BiquadFilterNode; tape: Tape; stop: GainNode; duck: GainNode; vol: GainNode;
    drumBus: GainNode; drumLp: BiquadFilterNode; drums: DrumFilters;
    harmonic: GainNode; comboLp: BiquadFilterNode; side: GainNode; bassIn: GainNode;
    ep: GainNode; epLp: BiquadFilterNode; pad: GainNode; padLp: BiquadFilterNode; padLfo: GainNode; chorusWet: GainNode;
    mallet: GainNode; echo: DelayNode; arp: GainNode; vinyl: GainNode;
  };
  fb: GainNode; fbEcho: DelayNode; fbVol: GainNode;
  sfx: GainNode; sfxVol: GainNode;
  amb: GainNode; ambVol: GainNode;
}

export function buildGraph(ctx: BaseAudioContext, seed: number): Graph {
  const noise = makeNoiseBank(ctx, seed);
  const voices = new VoicePool();
  const rng = new Sfc32(seed ^ 0x5fd1);

  // Master: glue compressor, then a fast limiter so pile-ups never clip.
  const out = gain(ctx, MASTER.out, ctx.destination);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = MASTER.limiter.threshold; limiter.ratio.value = MASTER.limiter.ratio; limiter.knee.value = MASTER.limiter.knee;
  limiter.attack.value = MASTER.limiter.attack; limiter.release.value = MASTER.limiter.release;
  limiter.connect(out);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = MASTER.comp.threshold; comp.ratio.value = MASTER.comp.ratio; comp.knee.value = MASTER.comp.knee;
  comp.attack.value = MASTER.comp.attack; comp.release.value = MASTER.comp.release;
  comp.connect(limiter);
  const dc = filter(ctx, 'highpass', MASTER.dcHz, 0.7, comp);
  const master = gain(ctx, MASTER.trim, dc);

  // Music bus.
  const vol = gain(ctx, BUS.music, master);
  const duck = gain(ctx, 1, vol);
  const stop = gain(ctx, 1, duck);
  const tape = buildTape(ctx);
  tape.output.connect(stop);
  const formLp = filter(ctx, 'lowpass', 18000, 0.5, tape.input);
  const mud = ctx.createBiquadFilter();
  mud.type = 'peaking'; mud.frequency.value = MUD_CUT.hz; mud.Q.value = MUD_CUT.q; mud.gain.value = MUD_CUT.db;
  mud.connect(formLp);
  const sum = gain(ctx, 1, mud);
  const side = gain(ctx, 1, sum);
  const comboLp = filter(ctx, 'lowpass', COMBO_FILTER.offRunHz, COMBO_FILTER.q, side);
  const harmonic = gain(ctx, 1, comboLp);
  const bassIn = gain(ctx, 1, side);
  const drumLp = filter(ctx, 'lowpass', DRUM_BUS_LP, 0.6, sum);
  const drumBus = gain(ctx, DRUM_LEVEL, drumLp);
  const drums: DrumFilters = {
    click: filter(ctx, 'highpass', KICK.clickHp, 0.7, drumBus),
    snare: filter(ctx, 'bandpass', SNARE.bpHz, SNARE.bpQ, drumBus),
    rim: filter(ctx, 'bandpass', RIM.bpHz, RIM.bpQ, drumBus),
    brush: filter(ctx, 'bandpass', BRUSH.bpHz, BRUSH.bpQ, drumBus),
    hat: filter(ctx, 'highpass', HATS.hpHz, 0.7, drumBus),
    shaker: filter(ctx, 'bandpass', SHAKER.bpHz, SHAKER.bpQ, drumBus),
    clap: filter(ctx, 'bandpass', CLAP.bpHz, CLAP.bpQ, drumBus),
  };

  // Electric piano: shared low-pass, 4.5 Hz tremolo and ±0.3 auto-pan.
  const epPan = ctx.createStereoPanner();
  epPan.connect(harmonic);
  const epTrem = gain(ctx, 1 - EP.tremDepth / 2, epPan);
  const epLp = filter(ctx, 'lowpass', EP.lpHz, 0.5, epTrem);
  const ep = gain(ctx, 1, filter(ctx, 'highpass', EP.hpHz, 0.7, epLp));   // the 1:1 FM ratio puts a sideband at 0 Hz
  {
    const o = osc(ctx, 'sine', EP.tremHz);
    o.start(0);
    const tremDepth = gain(ctx, EP.tremDepth / 2); o.connect(tremDepth); tremDepth.connect(epTrem.gain);
    const panDepth = gain(ctx, EP.pan); o.connect(panDepth); panDepth.connect(epPan.pan);
  }

  // Pad: low-pass 900 Hz ± 300 Hz at 0.07 Hz, optional chorus (Neon).
  const padLp = filter(ctx, 'lowpass', PAD.lpHz, 0.7, harmonic);
  const padLfo = lfo(ctx, PAD.lfoHz, PAD.lfoDepth, padLp.frequency).depth;
  const pad = gain(ctx, 1, padLp);
  const chorus = ctx.createDelay(0.05);
  chorus.delayTime.value = PAD.chorus.delay;
  lfo(ctx, PAD.chorus.hz, PAD.chorus.depth, chorus.delayTime);
  const chorusWet = gain(ctx, 0, harmonic);
  padLp.connect(chorus); chorus.connect(chorusWet);

  // Mallet melody with a 3/16 echo (feedback 0.3, low-passed 2.5 kHz).
  const mallet = gain(ctx, 1, harmonic);
  const echo = ctx.createDelay(2);
  echo.delayTime.value = 0.5;
  const echoLp = filter(ctx, 'lowpass', MALLET.echo.lpHz, 0.5, harmonic);
  const echoFb = gain(ctx, MALLET.echo.feedback, echo);
  mallet.connect(gain(ctx, MALLET.echo.send, echo));
  echo.connect(echoLp); echoLp.connect(echoFb);
  const arp = gain(ctx, 1, harmonic);
  const vinyl = gain(ctx, 1, sum);

  // Feedback (musical scoring notes, mallet timbre): dry, its own short echo; follows the music slider.
  const fbVol = gain(ctx, BUS.feedback, master);
  const fb = gain(ctx, 1, fbVol);
  const fbEcho = ctx.createDelay(2);
  fbEcho.delayTime.value = 0.4;
  const fbEchoLp = filter(ctx, 'lowpass', 2500, 0.5, fbVol);
  fb.connect(gain(ctx, 0.22, fbEcho));
  fbEcho.connect(fbEchoLp); fbEchoLp.connect(gain(ctx, 0.25, fbEcho));

  const sfxVol = gain(ctx, BUS.sfx, master);
  const sfx = gain(ctx, 1, sfxVol);
  const ambVol = gain(ctx, BUS.ambience, master);
  const amb = gain(ctx, 1, ambVol);

  const g: Graph = {
    ctx, noise, voices, rng, live: !('startRendering' in ctx), master, out, comp, limiter,
    music: { sum, formLp, tape, stop, duck, vol, drumBus, drumLp, drums, harmonic, comboLp, side, bassIn, ep, epLp, pad, padLp,
      padLfo, chorusWet, mallet, echo, arp, vinyl },
    fb, fbEcho, fbVol, sfx, sfxVol, amb, ambVol,
  };
  startVinyl(g, vinyl);
  return g;
}
