import { describe, expect, it } from 'vitest';
import { createBus } from '../../../src/core/bus';
import type { AppEvent, GameEvent } from '../../../src/core/events';

describe('createBus', () => {
  it('delivers typed events in subscription order, then onAny', () => {
    const bus = createBus<GameEvent>();
    const log: string[] = [];
    bus.on('ollie', (e) => log.push(`a${e.tick}`));
    bus.onAny((e) => log.push(`any:${e.t}`));
    bus.on('ollie', (e) => log.push(`b${e.tick}`));
    bus.on('coin', () => log.push('coin'));
    bus.emit({ t: 'ollie', tick: 1, from: 'roll', linked: false });
    bus.emit({ t: 'revert', tick: 2 });
    expect(log).toEqual(['a1', 'b1', 'any:ollie', 'any:revert']);
  });
  it('unsubscribes, including during an emit', () => {
    const bus = createBus<AppEvent>();
    const log: string[] = [];
    const off1 = bus.on('pause', () => { log.push('1'); off1(); });
    bus.on('pause', () => log.push('2'));
    const offAny = bus.onAny(() => log.push('any'));
    bus.emit({ t: 'pause' });
    offAny();
    bus.emit({ t: 'pause' });
    expect(log).toEqual(['1', '2', 'any', '2']);
  });
});
