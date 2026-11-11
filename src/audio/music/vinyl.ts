// audio/music/vinyl.ts: the vinyl layer of the lo-fi chain (DESIGN §19.1): the 4 s hiss + pops buffer rendered at
// boot (sfx/noise.ts vinylSamples) looped under the music, before the tape stage, so a tape stop drags it down too.
import { VINYL } from '../mix.config';
import { gain, type Synth } from '../synth';

export function startVinyl(s: Synth, dest: AudioNode): { src: AudioBufferSourceNode; level: GainNode } {
  const src = s.ctx.createBufferSource();
  src.buffer = s.noise.vinyl;
  src.loop = true;
  const level = gain(s.ctx, VINYL.level, dest);
  src.connect(level);
  src.start(0);
  return { src, level };
}
