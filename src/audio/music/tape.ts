// audio/music/tape.ts: the tape stage of the lo-fi chain (DESIGN §19.1): a 12 ms delay line modulated by wow
// (0.5 Hz, ±1.5 ms) and flutter (6 Hz, ±0.2 ms), tanh warmth (drive 1.4), low-pass 7.5 kHz. The same delay line
// performs the crash "tape stop": its delay grows quadratically so pitch falls linearly 1 → 0.3 over 0.5 s.
import { TAPE, TAPE_STOP } from '../mix.config';
import { filter, lfo, tanhCurve } from '../synth';

export interface Tape { input: DelayNode; output: BiquadFilterNode; wow: GainNode; flutter: GainNode }

export function buildTape(ctx: BaseAudioContext): Tape {
  const input = ctx.createDelay(1.0);
  input.delayTime.value = TAPE.delay;
  const wow = lfo(ctx, TAPE.wowHz, TAPE.wowDepth, input.delayTime).depth;
  const flutter = lfo(ctx, TAPE.flutterHz, TAPE.flutterDepth, input.delayTime).depth;
  const shaper = ctx.createWaveShaper();
  shaper.curve = tanhCurve(TAPE.drive, false);
  shaper.oversample = '2x';
  const output = filter(ctx, 'lowpass', TAPE.lpHz, 0.6);
  input.connect(shaper); shaper.connect(output);
  return { input, output, wow, flutter };
}

/** Delay curve for a tape stop: pitch p(u) = 1 − (1 − pitchTo)·u over `sec` ⇒ d(t) = base + (1 − pitchTo)·t²/(2·sec). */
export function tapeStopCurve(points = 48): Float32Array<ArrayBuffer> {
  const c = new Float32Array(points);
  const k = (1 - TAPE_STOP.pitchTo) / (2 * TAPE_STOP.sec);
  for (let i = 0; i < points; i++) {
    const t = (i / (points - 1)) * TAPE_STOP.sec;
    c[i] = TAPE.delay + k * t * t;
  }
  return c;
}

export function tapeStop(tp: Tape, t: number): void {
  const d = tp.input.delayTime;
  d.cancelScheduledValues(t);
  d.setValueCurveAtTime(tapeStopCurve(), t, TAPE_STOP.sec);
  tp.wow.gain.cancelScheduledValues(t);
  tp.wow.gain.setValueAtTime(TAPE.wowDepth, t);
  tp.wow.gain.linearRampToValueAtTime(TAPE.wowDepth * TAPE_STOP.wowMul, t + TAPE_STOP.sec);
}
/** Back to rest once the music is silent (the delay jump is inaudible at zero gain). */
export function tapeReset(tp: Tape, t: number): void {
  const d = tp.input.delayTime;
  d.cancelScheduledValues(t);
  d.setValueAtTime(TAPE.delay, t);
  tp.wow.gain.cancelScheduledValues(t);
  tp.wow.gain.setValueAtTime(TAPE.wowDepth, t);
}
