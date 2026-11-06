// audio/voices.ts: the 32-voice cap (DESIGN §19.2). A voice is one sounding instance (a note, a one-shot, a loop)
// with one output gain. Before building nodes a caller asks `admit`; at the cap the lowest-priority, soonest-ending
// voice of equal or lower priority is stolen (10 ms fade), otherwise the new sound is dropped. Loops are permanent
// until released. Pure bookkeeping (no WebAudio), unit-tested.
import { VOICE_CAP } from './mix.config';

export const PRI = { ambience: 0, music: 1, feedback: 2, sfx: 3, loop: 9 } as const;
export interface Voice { end: number; pri: number; stop(at: number): void }

export class VoicePool {
  private readonly list: Voice[] = [];
  peak = 0;
  dropped = 0;
  stolen = 0;
  constructor(readonly cap = VOICE_CAP) {}

  private prune(now: number): void {
    const l = this.list;
    let w = 0;
    for (let i = 0; i < l.length; i++) if (l[i]!.end > now) l[w++] = l[i]!;
    l.length = w;
  }
  count(now: number): number { this.prune(now); return this.list.length; }

  /** True if a voice of priority `pri` may start now (possibly after stealing one). */
  admit(now: number, pri: number): boolean {
    this.prune(now);
    if (this.list.length < this.cap) return true;
    let vi = -1;
    for (let i = 0; i < this.list.length; i++) {
      const v = this.list[i]!;
      if (v.pri > pri || v.pri >= PRI.loop) continue;
      const b = vi < 0 ? null : this.list[vi]!;
      if (!b || v.pri < b.pri || (v.pri === b.pri && v.end < b.end)) vi = i;
    }
    if (vi < 0) { this.dropped++; return false; }
    const victim = this.list[vi]!;
    this.list.splice(vi, 1);
    this.stolen++;
    try { victim.stop(now); } catch { /* already stopped */ }
    return true;
  }
  add(v: Voice, now: number): Voice {
    this.list.push(v);
    this.peak = Math.max(this.peak, this.count(now));
    return v;
  }
  remove(v: Voice): void {
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
  }
  /** Shortens a voice's lifetime (a loop that is releasing). */
  endAt(v: Voice, t: number): void { v.end = t; }
}
