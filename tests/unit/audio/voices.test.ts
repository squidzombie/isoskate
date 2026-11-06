// The 32-voice cap (DESIGN §19.2): admission, stealing the lowest-priority soonest-ending voice, loops never stolen.
import { describe, expect, it } from 'vitest';
import { PRI, VoicePool, type Voice } from '../../../src/audio/voices';
import { VOICE_CAP } from '../../../src/audio/mix.config';

const mk = (end: number, pri: number, log: string[], name: string): Voice => ({ end, pri, stop: () => { log.push(name); } });

describe('VoicePool', () => {
  it('caps at 32 and steals the lowest priority, soonest-ending voice', () => {
    expect(VOICE_CAP).toBe(32);
    const p = new VoicePool(), log: string[] = [];
    for (let i = 0; i < 32; i++) { expect(p.admit(0, PRI.music)).toBe(true); p.add(mk(1 + i, i === 5 ? PRI.ambience : PRI.music, log, `m${i}`), 0); }
    expect(p.count(0)).toBe(32);
    expect(p.admit(0, PRI.sfx)).toBe(true);          // steals the ambience voice first
    expect(log).toEqual(['m5']);
    p.add(mk(9, PRI.sfx, log, 's'), 0);
    expect(p.admit(0, PRI.music)).toBe(true);        // then the music voice ending soonest
    expect(log).toEqual(['m5', 'm0']);
    expect(p.count(0)).toBe(31);
    expect(p.peak).toBe(32);
  });

  it('never steals a loop or a higher-priority voice; drops the newcomer instead', () => {
    const p = new VoicePool(4), log: string[] = [];
    p.add(mk(Infinity, PRI.loop, log, 'loop'), 0);
    for (let i = 0; i < 3; i++) p.add(mk(5, PRI.sfx, log, `s${i}`), 0);
    expect(p.admit(0, PRI.music)).toBe(false);
    expect(p.dropped).toBe(1);
    expect(p.admit(0, PRI.sfx)).toBe(true);
    expect(log).toEqual(['s0']);
  });

  it('ended voices free their slot', () => {
    const p = new VoicePool(2), log: string[] = [];
    p.add(mk(1, PRI.music, log, 'a'), 0); p.add(mk(2, PRI.music, log, 'b'), 0);
    expect(p.count(1.5)).toBe(1);
    expect(p.admit(1.5, PRI.ambience)).toBe(true);
    expect(log).toEqual([]);
  });
});
