// game/loop.ts: fixed 60 Hz sim with an accumulator, ≤ 4 steps per frame, render interpolation, time scale,
// input binning by tick due time and the 60 fps render cap (TECH §6.1).
import type { Bus } from '../core/bus';
import type { GameEvent } from '../core/events';
import type { InputFrame, InputSource } from '../core/input';
import { lerp } from '../core/math';
import type { Sim } from '../core/sim';
import { DT } from '../core/tuning';
import type { RenderFrame, Viewport } from '../core/view';

export interface LoopDeps {
  input: InputSource;
  gameBus: Bus<GameEvent>;
  sim(): Sim;
  viewport(): Viewport;
  /** Draws one frame. `catchUp` (renderNow / debug) lets the world view build every chunk it needs.
   *  Returns true when a chunk was built this frame (then no segment generation runs, TECH §5.2). */
  render(f: RenderFrame, catchUp: boolean): boolean;
  /** Called after rendering with the frame time left (ms); runs at most one segment of generation. */
  idle?(budgetMs: number, builtChunk: boolean): void;
}

const MAX_STEPS = 4;
const FRAME_MS = 1000 / 60;

export class GameLoop {
  /** true: rAF no longer advances the sim (debug `manual(true)`). */
  manual = false;
  /** Loop time scale (Lesson assist 0.5): slows the loop, the sim still runs exact ticks. */
  timeScale = 1;
  /** Render-only time scale (crash slow-mo); never affects the sim. */
  renderScale = 1;
  /** Battery saver: 30 fps cap everywhere. */
  batterySaver = false;
  private running = false;
  private acc = 0;
  private lastFrameMs = -1;
  private lastRenderMs = -1;
  private raf = 0;
  private readonly frameEvents: GameEvent[] = [];
  private readonly pending: Partial<InputFrame>[] = [];
  private extra: ((sim: Sim) => Partial<InputFrame> | null) | null = null;
  private readonly intervals: number[] = [];
  private readonly simMs: number[] = [];
  private simAcc = 0;

  constructor(private readonly deps: LoopDeps) {}

  get isRunning(): boolean { return this.running; }

  start(): void {
    if (this.raf) return;
    const frame = (now: number) => { this.raf = requestAnimationFrame(frame); this.onFrame(now); };
    this.raf = requestAnimationFrame(frame);
  }
  stop(): void { cancelAnimationFrame(this.raf); this.raf = 0; }

  /** Sim stepping on/off (run vs paused/menus). Rendering continues either way. */
  setRunning(on: boolean): void {
    if (on !== this.running) { this.acc = 0; this.lastFrameMs = -1; }
    this.running = on;
  }

  /** New run: forget the previous run's pending frame events and queued edges. */
  resetRun(): void {
    this.frameEvents.length = 0;
    this.pending.length = 0;
    this.acc = 0;
  }

  queue(f: Partial<InputFrame>): void { this.pending.push(f); }
  setExtraInput(f: ((sim: Sim) => Partial<InputFrame> | null) | null): void { this.extra = f; }

  /** Exactly one sim tick: `base` merged with extra input (bots, held debug levels) and queued edges.
   *  Events are copied into the frame's list, then emitted on the game bus in order. */
  step(base: InputFrame): readonly GameEvent[] {
    const sim = this.deps.sim();
    let f = base;
    const ex = this.extra?.(sim);
    if (ex) f = { ...f, ...ex };
    if (this.pending.length) {
      f = { ...f };
      for (const p of this.pending) Object.assign(f, p);
      this.pending.length = 0;
    }
    const t0 = performance.now();
    const events = sim.step(f);
    this.simAcc += performance.now() - t0;
    const n = events.length;
    if (!n) return events;
    const copy = events.slice();
    for (let i = 0; i < n; i++) this.frameEvents.push(copy[i]!);
    for (let i = 0; i < n; i++) this.deps.gameBus.emit(copy[i]!);
    return copy;
  }

  /** Render immediately (debug renderNow / step): alpha 1, no time passes, all needed chunks are built. */
  renderNow(): void { this.draw(1, 0, true); }

  perf(): { fps: number; p50: number; p95: number; simMs: number } {
    const iv = [...this.intervals].sort((a, b) => a - b);
    const pick = (q: number) => (iv.length ? iv[Math.min(iv.length - 1, Math.floor(q * iv.length))]! : 0);
    const mean = iv.length ? iv.reduce((a, b) => a + b, 0) / iv.length : 0;
    const sm = this.simMs.length ? this.simMs.reduce((a, b) => a + b, 0) / this.simMs.length : 0;
    return { fps: mean > 0 ? 1000 / mean : 0, p50: pick(0.5), p95: pick(0.95), simMs: sm };
  }

  private onFrame(now: number): void {
    // Frame cap: 60 fps in runs (skip callbacks < 14 ms after the last render), 30 fps on menus or battery saver.
    const capMs = this.running && !this.batterySaver ? 14 : 30;
    if (this.lastRenderMs >= 0 && now - this.lastRenderMs < capMs) return;
    const dt = this.lastFrameMs < 0 ? 1 / 60 : Math.min(0.1, (now - this.lastFrameMs) / 1000);
    if (this.lastRenderMs >= 0) { this.intervals.push(now - this.lastRenderMs); if (this.intervals.length > 120) this.intervals.shift(); }
    this.lastFrameMs = now;
    this.lastRenderMs = now;
    const work0 = performance.now();
    this.simAcc = 0;
    let alpha = 1;
    if (this.running && !this.manual) {
      const scale = Math.max(0, this.timeScale);
      this.acc += dt * scale;
      let steps = 0;
      while (this.acc >= DT && steps < MAX_STEPS) {
        // Due time of this tick in performance.now() space: the moment the accumulator passed its end.
        const due = scale > 0 ? now - ((this.acc - DT) / scale) * 1000 : now;
        this.step(this.deps.input.frame(due));
        this.acc -= DT;
        steps++;
      }
      if (this.acc >= DT) this.acc %= DT;                // drop excess: slow down instead of spiralling
      alpha = this.acc / DT;
    }
    this.simMs.push(this.simAcc); if (this.simMs.length > 60) this.simMs.shift();
    const built = this.draw(alpha, dt * this.renderScale, false);
    this.deps.idle?.(FRAME_MS - (performance.now() - work0), built);
  }

  private draw(alpha: number, dt: number, catchUp: boolean): boolean {
    const sim = this.deps.sim();
    const prev = sim.prev, cur = sim.cur;
    const playerS = lerp(prev.p.s, cur.p.s, alpha);
    const a = sim.gen.areaAt(playerS);
    const f: RenderFrame = {
      alpha, dt, timeScale: this.timeScale * this.renderScale, prev, cur, pose: sim.pose(), score: sim.score,
      events: this.frameEvents, playerS, speed: cur.vel.s, area: a.area, blend: a.blend, viewport: this.deps.viewport(),
    };
    const built = this.deps.render(f, catchUp);
    this.frameEvents.length = 0;
    return built;
  }
}

