// RECLAIM ambience (theme §8, T5): no traffic anywhere, each area's bed and events, the gateway moments, the vehicle
// thunk, the bird flutter and the reversing chirp, all with valid automation on the fake context (it throws on what a
// browser would reject) and within the voice cap.
import { describe, expect, it } from 'vitest';
import { createBus } from '../../../src/core/bus';
import type { AppEvent, GameEvent } from '../../../src/core/events';
import type { AreaId, GatewayId } from '../../../src/core/ids';
import { bindAll } from '../../../src/audio/bindings';
import { AudioCore } from '../../../src/audio/engine';
import { AMBIENCE, AREA_MUSIC, THUNK_KINDS, VOICE_CAP } from '../../../src/audio/mix.config';
import { asCtx, FakeContext } from './fakeAudio';

function harness() {
  const ctx = new FakeContext();
  const core = new AudioCore({ seed: 3 });
  core.attach(asCtx(ctx));
  const game = createBus<GameEvent>(), app = createBus<AppEvent>();
  bindAll(game, app, core);
  let t = 0, maxVoices = 0;
  const run = (sec: number) => {
    for (let i = 0; i < sec * 60; i++) {
      t += 1 / 60; ctx.currentTime = t;
      core.roll(0.6, 'asphalt', false, false);
      maxVoices = Math.max(maxVoices, core.stats().voices);
    }
  };
  return { ctx, core, game, run, get maxVoices() { return maxVoices; } };
}

describe('RECLAIM ambience (theme §8)', () => {
  it('no area plays traffic; Downtown is the quiet plaza', () => {
    for (const a of ['downtown', 'suburbs', 'docks', 'neon'] as const) expect(AREA_MUSIC[a].ambience).not.toBe('traffic' as never);
    expect(AREA_MUSIC.downtown.ambience).toBe('plaza');
    expect(Object.keys(AMBIENCE)).not.toContain('traffic');
    expect(AMBIENCE.city.maglevEvery[0]).toBeGreaterThanOrEqual(40);
    expect(AMBIENCE.suburb.birdEvery).toEqual([2, 6]);
  });

  it('every area bed and its events, every gateway moment: valid automation, ≤ voice cap', () => {
    const h = harness();
    h.core.setScene('run');
    h.game.emit({ t: 'runStart', tick: 1, seed: 1, mode: 'normal' });
    const order: [AreaId, GatewayId][] = [['downtown', 'greenway'], ['suburbs', 'levelCrossing'], ['docks', 'harborBridge'], ['neon', 'underpass']];
    for (const [area, gw] of order) {
      h.game.emit({ t: 'areaEnter', tick: 2, area, firstThisRun: true });
      const n0 = h.ctx.nodes;
      h.run(95);                                       // long enough for the rarest event (woodpecker ≤ 90 s, bell ≤ 50 s)
      expect(h.ctx.nodes - n0, `${area}: events built nodes`).toBeGreaterThan(20);
      h.game.emit({ t: 'gatewayEnter', tick: 3, gateway: gw });
      h.run(6);
    }
    expect(h.maxVoices).toBeLessThanOrEqual(VOICE_CAP);
  });

  it('a crash into a vehicle adds the body-panel thunk; bird flutter and reversing chirp play', () => {
    const h = harness();
    h.core.setScene('run');
    h.game.emit({ t: 'runStart', tick: 1, seed: 1, mode: 'normal' });
    h.run(1);
    const crash = (kind: 'parked_car' | 'trash_can') => {
      const o0 = h.ctx.created.osc ?? 0;
      h.game.emit({ t: 'crash', tick: 9, cause: 'slam', obstacleId: 1, kind, speed: 8, state: 'roll', flipProgress: 0, spinProgress: 0, god: false } as GameEvent);
      return (h.ctx.created.osc ?? 0) - o0;
    };
    expect(THUNK_KINDS.has('parked_car')).toBe(true);
    const plain = crash('trash_can');
    h.run(3);
    const car = crash('parked_car');
    expect(car, 'the thunk adds its tom body and overtone').toBeGreaterThanOrEqual(plain + 2);
    h.run(3);
    const n0 = h.ctx.nodes;
    h.core.cue('birdFlutter', { pan: -0.4 });
    h.core.cue('reverseChirp', {});
    expect(h.ctx.nodes - n0).toBeGreaterThan(4);
    h.run(1);
  });
});
