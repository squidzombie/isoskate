// The audio core on a fake AudioContext (node): a scripted 2-minute run through the real bindings exercises the
// director, scheduler, every layer and SFX, and checks automation validity, the voice cap, intensity, gateway pivot
// and crossfade, tape stop / needle drop, scenes, and the feedback quantization.
import { describe, expect, it } from 'vitest';
import { createBus } from '../../../src/core/bus';
import type { AppEvent, GameEvent } from '../../../src/core/events';
import { bindAll } from '../../../src/audio/bindings';
import { AudioCore } from '../../../src/audio/engine';
import { TAPE, VOICE_CAP } from '../../../src/audio/mix.config';
import { asCtx, FakeContext } from './fakeAudio';

const p = { s: 0, x: 0, y: 0 };

function harness() {
  const ctx = new FakeContext();
  const core = new AudioCore({ seed: 1 });
  core.attach(asCtx(ctx));
  const game = createBus<GameEvent>(), app = createBus<AppEvent>();
  bindAll(game, app, core);
  let t = 0, tick = 0, maxVoices = 0;
  const frame = (speed01: number, air = false, grind: 'metal' | 'wood' | null = null) => {
    t += 1 / 60; tick++;
    ctx.currentTime = t;
    core.roll(speed01, 'concrete', air, false);
    core.grind(!!grind, grind, false);
    maxVoices = Math.max(maxVoices, core.stats().voices);
  };
  return { ctx, core, game, app, frame, get t() { return t; }, get tick() { return tick; }, get maxVoices() { return maxVoices; } };
}

describe('AudioCore (fake context)', () => {
  it('menu → run → tricks, coins, grinds, gateway, crash, retry, pause, results: valid automation and ≤ 32 voices', () => {
    const h = harness();
    expect(h.core.stats()).toMatchObject({ playing: true, song: 'menu', bpm: 76 });
    for (let i = 0; i < 60; i++) h.frame(0);
    h.core.setScene('run');
    h.game.emit({ t: 'runStart', tick: 1, seed: 1, mode: 'normal' });
    expect(h.core.stats().song).toBe('downtown');
    let links = 0, seq = 0;
    let sawLevel3 = false, sawSuburbs = false;
    const run = (sec: number) => {
      const end = h.t + sec;
      while (h.t < end) {
        const ph = (h.t % 2.4);
        const air = ph > 0.2 && ph < 0.8;
        const grind: 'metal' | 'wood' | null = ph > 1.0 && ph < 1.6 ? (Math.floor(h.t) % 2 ? 'metal' : 'wood') : null;
        h.frame(0.9, air, grind);
        const k = h.tick;
        if (k % 144 === 12) { h.game.emit({ t: 'ollie', tick: k, from: 'roll', linked: true }); h.game.emit({ t: 'flipStart', tick: k, id: 'treFlip', dur: 0.42 }); }
        if (k % 144 === 48) { h.game.emit({ t: 'land', tick: k, airT: 0.6, dropH: 0.3, quality: k % 3 ? 'clean' : 'perfect', surface: 'concrete' }); h.game.emit({ t: 'trickScored', tick: k, id: 'treFlip', pts: 500, factor: 1, link: true, comboPts: 0, links: ++links, seq: seq++ }); }
        if (k % 144 === 60) h.game.emit({ t: 'grindStart', tick: k, id: 'fiftyFifty', edgeId: 1, material: 'metal', perfect: true, transfer: false });
        if (k % 144 === 96) h.game.emit({ t: 'grindEnd', tick: k, id: 'fiftyFifty', dur: 0.6, exit: 'end' });
        if (k % 20 === 0) h.game.emit({ t: 'coin', tick: k, id: k, value: k % 200 === 0 ? 10 : 1, p, chain: 0 });
        if (k % 90 === 30) h.game.emit({ t: 'nearMiss', tick: k, obstacleId: 1, side: k % 180 ? 1 : -1 });
        if (k % 300 === 7) h.game.emit({ t: 'hazardWarn', tick: k, obstacleId: 2, kind: 'cone', inSec: 1.6 });
        if (k % 300 === 100) h.game.emit({ t: 'spinStart', tick: k, id: 'bs360', dur: 0.6, out: false });
        if (k % 1500 === 1400) { h.game.emit({ t: 'comboBanked', tick: k, total: 999, links, variety: 0, coins: 0, reason: 'heat', durSec: 5 }); links = 0; seq = 0; }
        if (h.core.stats().intensity === 3) sawLevel3 = true;
        if (h.core.stats().song === 'suburbs') sawSuburbs = true;
      }
    };
    run(20);
    h.game.emit({ t: 'speedTier', tick: h.tick, tier: 2 });
    run(20);
    h.game.emit({ t: 'gatewayEnter', tick: h.tick, gateway: 'greenway' });
    run(4);
    h.game.emit({ t: 'areaEnter', tick: h.tick, area: 'suburbs', firstThisRun: true });
    run(40);
    expect(sawLevel3).toBe(true);
    expect(sawSuburbs).toBe(true);
    expect(h.core.stats()).toMatchObject({ song: 'suburbs', bpm: 80, playing: true });
    // Crash: tape stop, then an instant retry brings the music back with a needle drop.
    h.game.emit({ t: 'crash', tick: h.tick, cause: 'slam', obstacleId: 1, kind: 'cone', speed: 9.5, state: 'roll', flipProgress: 0, spinProgress: 0 });
    expect(h.core.stats().playing).toBe(false);
    for (let i = 0; i < 40; i++) h.frame(0);
    h.game.emit({ t: 'runStart', tick: 1, seed: 2, mode: 'normal' });
    expect(h.core.stats().playing).toBe(true);
    run(10);
    expect(h.core.stats().song).toBe('downtown');
    h.core.setScene('paused');
    for (let i = 0; i < 300; i++) h.frame(0);
    expect(h.core.stats().intensity).toBe(0);
    h.core.setScene('run');
    run(5);
    h.game.emit({ t: 'crash', tick: h.tick, cause: 'fall', obstacleId: null, kind: null, speed: 8, state: 'air', flipProgress: 0.5, spinProgress: 0 });
    for (let i = 0; i < 70; i++) h.frame(0);
    h.core.setScene('results');
    for (let i = 0; i < 300; i++) h.frame(0);
    expect(h.core.stats()).toMatchObject({ playing: true, intensity: 0 });
    h.app.emit({ t: 'levelUp', level: 3 });
    h.app.emit({ t: 'crateShake', n: 2 });
    h.app.emit({ t: 'crateReveal', tier: 'pro', rarity: 'legendary', dup: false });
    h.app.emit({ t: 'ui', sfx: 'toggle' });
    h.core.setScene('menu');
    for (let i = 0; i < 600; i++) h.frame(0);
    expect(h.core.stats().song).toBe('menu');
    expect(h.maxVoices).toBeLessThanOrEqual(VOICE_CAP);
    expect(h.maxVoices).toBeGreaterThan(10);
    expect(h.ctx.created.osc ?? 0).toBeGreaterThan(2000);
  });

  it('gateways carry the song form on: the next area starts at the bar after the pivot, so a run reaches B and A′', () => {
    const h = harness();
    h.core.setScene('run');
    h.game.emit({ t: 'runStart', tick: 1, seed: 1, mode: 'normal' });
    h.core.setIntensity(2);
    const gates = [['greenway', 'suburbs'], ['levelCrossing', 'docks'], ['harborBridge', 'neon'], ['underpass', 'downtown']] as const;
    const seen: { song: string; bar: number }[] = [];
    const step = (sec: number) => {
      const end = h.t + sec;
      while (h.t < end) {
        h.frame(0.9);
        const s = h.core.stats(), last = seen[seen.length - 1];
        if (!last || last.song !== s.song || last.bar !== s.bar) seen.push({ song: s.song, bar: s.bar });
      }
    };
    step(30);
    for (const [gw, area] of gates) {
      const before = h.core.stats();
      h.game.emit({ t: 'gatewayEnter', tick: h.tick, gateway: gw });
      step(4);
      h.game.emit({ t: 'areaEnter', tick: h.tick, area, firstThisRun: true });
      step(8);
      const i = seen.findIndex((x, k) => k > 0 && x.song === area && seen[k - 1]!.song !== area);
      expect(i, `${gw} → ${area}`).toBeGreaterThan(0);
      // The old song played its next bar as the V7 pivot; the new one picks up right after it.
      expect(seen[i]!.bar).toBe(seen[i - 1]!.bar + 1);
      expect(seen[i - 1]!.bar).toBeGreaterThanOrEqual(before.bar);
      step(26);
    }
    const bars = seen.map((x) => x.bar);
    expect(Math.max(...bars)).toBeGreaterThanOrEqual(36);      // B (20–27) and into A′ (28–43) within one run
    expect(bars.filter((b) => b >= 20 && b < 28).length).toBeGreaterThanOrEqual(8);
  });

  it('leaving the run drops the queued layers that level 0 does not play and releases the bass at once', () => {
    const h = harness();
    h.core.setScene('run');
    h.game.emit({ t: 'runStart', tick: 1, seed: 1, mode: 'normal' });
    h.core.setIntensity(2);
    for (let i = 0; i < 60 * 14; i++) h.frame(0.9);
    for (const to of ['paused', 'menu'] as const) {
      h.core.setScene('run');
      for (let i = 0; i < 60 * 6; i++) h.frame(0.9);
      const q = h.core as unknown as { q: { ev: { layer: string } }[]; qi: number; bass: { env: GainNode } };
      expect(q.q.slice(q.qi).some((x) => !['drums', 'ep', 'pad'].includes(x.ev.layer))).toBe(true);
      h.core.setScene(to);
      expect(q.q.slice(q.qi).every((x) => ['drums', 'ep', 'pad'].includes(x.ev.layer))).toBe(true);
      const ev = (q.bass.env.gain as unknown as { events: { kind: string; t: number; v: number }[] }).events;
      expect(ev[ev.length - 1]).toMatchObject({ kind: 'target', v: 0 });
      expect(ev.every((e) => e.t <= h.ctx.currentTime + 1e-9)).toBe(true);   // nothing of a queued note survives
      expect(h.core.stats().intensity).toBe(0);
    }
  });

  it('a 2-minute storm of simultaneous SFX never exceeds the voice cap', () => {
    const h = harness();
    h.core.setScene('run');
    h.core.setIntensity(3);
    h.core.setComboFilter(12);
    for (let i = 0; i < 7200; i++) {
      h.frame(1, i % 50 < 20, i % 300 < 100 ? 'metal' : null);
      for (const id of ['pop', 'whoosh', 'land', 'coin', 'knock', 'perfectLock', 'comboBank'] as const) if ((i + id.length) % 7 === 0) h.core.cue(id, { n: i % 12 });
      if (i % 5 === 0) h.core.note(i % 11);
    }
    expect(h.maxVoices).toBeLessThanOrEqual(VOICE_CAP);
    expect(h.core.g!.voices.stolen + h.core.g!.voices.dropped).toBeGreaterThan(0);
  });

  it('feedback notes are quantized to the next 16th when it is ≤ 40 ms away (plus the tape latency)', () => {
    const h = harness();
    h.core.setScene('run');
    for (let i = 0; i < 120; i++) h.frame(0.5);
    let quantized = 0;
    for (let i = 0; i < 200; i++) {
      for (let k = 0; k < 3; k++) h.frame(0.5);
      const now = h.ctx.currentTime;
      const n16 = h.core.clock().nextSixteenthAt;
      const before = h.ctx.oscs.length;
      h.core.note(i % 8);
      const o = h.ctx.oscs[before]!;
      const d = o.startT - now - TAPE.delay;
      expect(d).toBeGreaterThanOrEqual(-1e-9);
      expect(d).toBeLessThanOrEqual(0.04 + 1e-9);
      if (n16 - now <= 0.04) { expect(o.startT).toBeCloseTo(n16 + TAPE.delay, 9); quantized++; }
    }
    expect(quantized).toBeGreaterThan(20);
  });
});
