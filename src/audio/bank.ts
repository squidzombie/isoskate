// audio/bank.ts: every pre-rendered sample buffer (DESIGN §19.2 "noise buffers are pre-rendered at boot"): the white,
// pink and brown noise loops and the vinyl loop (sfx/noise.ts), the joint ticks (sfx/roll.ts) and the five drum kits
// (music/drums.ts). Seeded sample math at a fixed PREP.sr (buffer sources resample to the context rate), independent
// of any context or song seed, so one set serves the live context and every offline render, and renders stay
// deterministic.
//
// createAudio() registers them at boot and builds them in idle time (requestIdleCallback, else setTimeout), at most
// PREP.idleMs per callback, yielding every PREP.chunk samples, so the tap that unlocks audio only creates nodes. A
// buffer needed before its turn (a tap in the first moments after boot, or an offline render) is finished on the spot;
// that time is counted in `prepStats().forcedMs`.
import { PREP } from './mix.config';

type Fill = (out: readonly Float32Array[], sr: number) => Generator<void, void, void>;
type Ctor = new (o: { numberOfChannels: number; length: number; sampleRate: number }) => AudioBuffer;

const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** One pre-rendered buffer: sample math run in chunks; an AudioBuffer once complete. */
export class Pcm {
  private it: Generator<void, void, void> | null = null;
  private done = false;
  private buf: AudioBuffer | null = null;
  private readonly chans: Float32Array[];
  constructor(readonly name: string, readonly channels: number, readonly length: number, private readonly fill: Fill) {
    // Context-free AudioBuffer where the constructor exists (filled in place, no copy); plain arrays otherwise.
    const C = (globalThis as { AudioBuffer?: Ctor }).AudioBuffer;
    let b: AudioBuffer | null = null;
    if (typeof C === 'function') { try { b = new C({ numberOfChannels: channels, length, sampleRate: PREP.sr }); } catch { b = null; } }
    this.buf = b;
    this.chans = b ? Array.from({ length: channels }, (_, c) => b.getChannelData(c)) : Array.from({ length: channels }, () => new Float32Array(length));
  }
  get complete(): boolean { return this.done; }
  /** Runs one chunk; true when the buffer is complete. */
  step(): boolean {
    if (this.done) return true;
    this.it ??= this.fill(this.chans, PREP.sr);
    if (this.it.next().done) { this.done = true; this.it = null; }
    return this.done;
  }
  /** The finished samples (finishing them now if needed). */
  data(): readonly Float32Array[] {
    if (!this.done) {
      const t0 = clock();
      while (!this.step()) { /* finish */ }
      stats.forcedMs += clock() - t0;
    }
    return this.chans;
  }
  /** The AudioBuffer (an AudioBuffer may be used by any context, live or offline). */
  buffer(ctx: BaseAudioContext): AudioBuffer {
    const d = this.data();
    if (!this.buf) {
      const b = ctx.createBuffer(this.channels, this.length, PREP.sr);
      d.forEach((x, c) => b.getChannelData(c).set(x));
      this.buf = b;
    }
    return this.buf;
  }
}

/** Yields every PREP.chunk samples: `for (...) { ...; if (tick(i)) yield; }`. */
export const tick = (i: number): boolean => i % PREP.chunk === PREP.chunk - 1;
/** Inside a fill: builds another buffer first, chunk by chunk (so a dependency never runs as one long task). */
export function* after(p: Pcm): Generator<void, void, void> { while (!p.step()) yield; }
/** A buffer filled by a per-sample function (state lives in its closure). */
export function perSample(make: (sr: number) => (i: number) => number): Fill {
  return function* (out, sr) {
    const o = out[0]!, f = make(sr);
    for (let i = 0; i < o.length; i++) { o[i] = f(i); if (tick(i)) yield; }
  };
}

const all = new Map<string, Pcm>();
const queue: Pcm[] = [];
const stats = { idleMs: 0, slices: 0, maxSliceMs: 0, forcedMs: 0 };

/** The named buffer, registered (and queued for idle building) on first use. */
export function pcm(name: string, channels: number, sec: number, fill: Fill): Pcm {
  let p = all.get(name);
  if (!p) { p = new Pcm(name, channels, Math.max(1, Math.ceil(sec * PREP.sr)), fill); all.set(name, p); queue.push(p); }
  return p;
}
/** Moves the pending buffers whose name starts with `prefix` to the front of the idle queue. */
export function prioritize(prefix: string): void {
  const front = queue.filter((p) => p.name.startsWith(prefix)), rest = queue.filter((p) => !p.name.startsWith(prefix));
  queue.length = 0; queue.push(...front, ...rest);
}

type Ric = (cb: (d: { timeRemaining(): number; didTimeout: boolean }) => void, o?: { timeout: number }) => number;
let scheduled = false;
function schedule(): void {
  if (scheduled || !queue.length) return;
  scheduled = true;
  const ric = (globalThis as { requestIdleCallback?: Ric }).requestIdleCallback;
  if (typeof ric === 'function') ric((d) => pump(d.didTimeout ? PREP.idleMs : Math.min(PREP.idleMs, d.timeRemaining())), { timeout: PREP.timeoutMs });
  else setTimeout(() => pump(PREP.idleMs), 0);
}
function pump(budget: number): void {
  scheduled = false;
  const t0 = clock();
  while (queue.length) {
    if (queue[0]!.step()) queue.shift();
    if (clock() - t0 >= budget) break;
  }
  const d = clock() - t0;
  stats.idleMs += d; stats.slices++; stats.maxSliceMs = Math.max(stats.maxSliceMs, d);
  schedule();
}
/** Starts building every registered buffer in idle time (idempotent; live play only). */
export function startPrep(): void { schedule(); }

/** Calls `cb` once every registered buffer whose name starts with one of `prefixes` is built: at once if they are,
 *  else after building them first in PREP.idleMs tasks (setTimeout, not idle time: a context is waiting), so even a
 *  tap in the first moments after boot never runs the sample math as one long task. */
export function whenReady(prefixes: readonly string[], cb: () => void): void {
  const want = (p: Pcm) => prefixes.some((x) => p.name.startsWith(x));
  const missing = () => [...all.values()].filter((p) => want(p) && !p.complete);
  if (!missing().length) { cb(); return; }
  for (const x of prefixes) prioritize(x);
  const hurry = () => {
    const t0 = clock();
    let m = missing();
    while (m.length && clock() - t0 < PREP.idleMs) { if (m[0]!.step()) m = missing(); }
    const d = clock() - t0;
    stats.idleMs += d; stats.slices++; stats.maxSliceMs = Math.max(stats.maxSliceMs, d);
    if (m.length) setTimeout(hurry, 0); else cb();
  };
  setTimeout(hurry, 0);
}
export function prepStats(): { pending: number; total: number; idleMs: number; slices: number; maxSliceMs: number; forcedMs: number } {
  return { pending: queue.filter((p) => !p.complete).length, total: all.size, ...stats };
}
