// The pre-rendered buffer bank (audio/bank.ts): chunked building, on-demand finishing, whenReady, and the content of
// every registered buffer (finite, bounded, the noise loops centred and seamless).
import { describe, expect, it } from 'vitest';
import { pcm, perSample, prepStats, whenReady } from '../../../src/audio/bank';
import { PREP, ROLL } from '../../../src/audio/mix.config';
import { registerKit } from '../../../src/audio/music/drums';
import { brownPcm, pinkPcm, registerNoise, vinylPcm, whitePcm } from '../../../src/audio/sfx/noise';
import { jointPcm, registerJoints } from '../../../src/audio/sfx/roll';

describe('audio bank', () => {
  it('builds in chunks of PREP.chunk samples, and stepping gives the same samples as finishing at once', () => {
    let calls = 0;
    const make = () => perSample(() => { let ph = 0; return () => { calls++; ph += 0.01; return Math.sin(ph); }; });
    const a = pcm('test:a', 1, 0.5, make()), b = pcm('test:b', 1, 0.5, make());
    let steps = 0;
    while (!a.step()) {
      steps++;
      expect(calls).toBeLessThanOrEqual(steps * PREP.chunk);
    }
    expect(a.complete).toBe(true);
    expect(steps).toBeGreaterThanOrEqual(Math.floor(a.length / PREP.chunk) - 1);
    expect(Array.from(b.data()[0]!)).toEqual(Array.from(a.data()[0]!));
    expect(prepStats().forcedMs).toBeGreaterThanOrEqual(0);
  });

  it('whenReady builds the named buffers in short tasks, then calls back', async () => {
    const p = pcm('ready:x', 1, 1, perSample(() => (i) => (i % 100) / 100));
    expect(p.complete).toBe(false);
    const done = await new Promise<boolean>((res) => whenReady(['ready:'], () => res(p.complete)));
    expect(done).toBe(true);
    let sync = false;
    whenReady(['ready:'], () => { sync = true; });
    expect(sync).toBe(true);                       // already built: synchronous
  });

  it('every registered buffer is finite and bounded; the noise loops are centred and seamless', () => {
    registerNoise(); registerJoints();
    for (const area of ['menu', 'downtown', 'suburbs', 'docks', 'neon'] as const) {
      const k = registerKit(area);
      for (const list of Object.values(k)) for (const p of list) {
        const d = p.data()[0]!;
        let peak = 0, finite = true;
        for (const x of d) { finite &&= Number.isFinite(x); peak = Math.max(peak, Math.abs(x)); }
        expect(finite, p.name).toBe(true);
        expect(peak, p.name).toBeGreaterThan(0.005);
        expect(peak, p.name).toBeLessThan(4);
      }
      expect(k.clap.length).toBe(area === 'neon' ? 2 : 0);   // only Neon claps
    }
    for (const p of [whitePcm(), pinkPcm(), brownPcm(), vinylPcm()]) {
      for (const d of p.data()) {
        let mean = 0, peak = 0;
        for (const x of d) { mean += x; peak = Math.max(peak, Math.abs(x)); }
        mean /= d.length;
        expect(Math.abs(mean), p.name).toBeLessThan(0.01);
        expect(peak, p.name).toBeLessThanOrEqual(1);
        // Seamless: the step across the loop point is no larger than a typical step inside the loop.
        let step = 0;
        for (let i = 1; i < d.length; i++) step += Math.abs(d[i]! - d[i - 1]!);
        step /= d.length - 1;
        expect(Math.abs(d[0]! - d[d.length - 1]!), p.name).toBeLessThan(step * 6 + 0.02);
      }
    }
    for (const sf of Object.values(ROLL.surfaces)) if (sf.joint) expect(jointPcm(sf.thumpHz).data()[0]!.reduce((m, x) => Math.max(m, x), 0)).toBeGreaterThan(0.1);
    expect(prepStats().pending).toBe(0);
  });
});
