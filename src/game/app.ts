// game/app.ts: the screen state machine for the whole DESIGN §17.1 flow (TECH §9 "integrator-owned UI pieces").
//   Boot → Title ──tap──▶ Run ──crash──▶ Crash overlay ──(fresh touch ≥ 0.6 s)──▶ Run   (instant retry)
//                                              └──(1.2 s, no fresh touch)──▶ Results ──ROLL AGAIN──▶ Run | Home
//   Run ⇄ Pause (pause button, Esc, back gesture, landscape rotation, visibilitychange / pagehide / blur)
// UI raises intents; this file decides what happens. Nothing here is deterministic gameplay.
import type { AudioEngine } from '../core/audio';
import type { Bus } from '../core/bus';
import type { AppEvent, GameEvent } from '../core/events';
import type { InputSource } from '../core/input';
import type { MetaApi, RunRewards } from '../core/meta';
import type { Analytics } from '../core/platform';
import type { SaveStore } from '../core/save';
import type { ScreenId } from '../core/ids';
import type { RunResult, Sim } from '../core/sim';
import type { UiApi, UiIntent } from '../core/ui';
import type { CameraRig, SkaterView, Vfx, Viewport, WorldView } from '../core/view';
import { blurActive, createBackGuard, createWakeLock, onHide, type BackGuard } from '../platform';
import type { GameLoop } from './loop';
import type { RunSession, StartOptions } from './runSession';

export const RETRY_MIN_MS = 600, RESULTS_AFTER_MS = 1200;

export interface AppDeps {
  root: HTMLElement; play: HTMLElement;
  sim: Sim; loop: GameLoop; input: InputSource; ui: UiApi; meta: MetaApi; save: SaveStore; audio: AudioEngine;
  analytics: Analytics; worldView: WorldView; skater: SkaterView; cameraRig: CameraRig; vfx: Vfx;
  gameBus: Bus<GameEvent>; appBus: Bus<AppEvent>; session: RunSession; viewport(): Viewport;
}

export class App {
  private screen: ScreenId = 'boot';
  private crashAtMs = 0;
  private retryArmed = false;
  private resultsTimer: ReturnType<typeof setTimeout> | null = null;
  private lastResult: RunResult | null = null;
  private lastRewards: RunRewards | null = null;
  private readonly back: BackGuard;
  private readonly wake = createWakeLock();
  private readonly offs: (() => void)[] = [];

  constructor(private readonly d: AppDeps) {
    this.back = createBackGuard((during) => {
      if (during === 'run') { if (this.screen === 'run') this.pause(false); }
      else if (this.screen !== 'title') this.home();
    });
    this.offs.push(
      d.ui.onIntent((i) => this.onIntent(i)),
      d.gameBus.on('crash', (e) => { if (!e.god) this.onCrash(); }),
      onHide(() => {
        if (this.screen === 'run') this.pause(false);
        d.audio.suspend();
        d.save.flush();
      }),
    );
    const down = (e: PointerEvent) => {
      if (this.screen === 'crash' && e.timeStamp - this.crashAtMs >= RETRY_MIN_MS) this.retryArmed = true;
    };
    const up = () => { if (this.screen === 'crash' && this.retryArmed) this.retry(); };
    const key = (e: KeyboardEvent) => this.onKey(e);
    d.root.addEventListener('pointerdown', down, true);
    d.root.addEventListener('pointerup', up, true);
    window.addEventListener('keydown', key);
    this.offs.push(() => {
      d.root.removeEventListener('pointerdown', down, true);
      d.root.removeEventListener('pointerup', up, true);
      window.removeEventListener('keydown', key);
    });
  }

  get current(): ScreenId { return this.screen; }

  /** Boot → Title: a still street preview behind the text-only title. */
  boot(): void {
    const d = this.d;
    d.sim.reset(d.session.next({ seed: 1 }));
    d.worldView.attach(d.sim.gen);
    d.skater.setLoadout(d.meta.loadout());
    d.cameraRig.setMode('run');      // TODO(WA): 'title' perspective diorama
    d.loop.start();
    this.home();
  }

  /** Title / instant retry / ROLL AGAIN / debug start: a fresh run (no loading; the world regenerates lazily). */
  startRun(o: StartOptions = {}): void {
    const d = this.d;
    this.clearCrashTimers();
    const cfg = d.session.next(o);
    d.sim.reset(cfg);
    d.loop.resetRun();
    d.worldView.attach(d.sim.gen);
    d.vfx.clear();
    d.skater.setLoadout(d.meta.loadout());
    d.cameraRig.setMode('run');
    d.save.mutate((s) => { s.onboarding.runsStarted++; });
    d.analytics.track('run_start', { seed: cfg.seed, runIndex: d.save.data.onboarding.runsStarted, lesson: cfg.mode === 'lesson' });
    blurActive();
    d.play.classList.add('run');
    d.input.setEnabled(true);
    d.loop.setRunning(true);
    this.back.armRun();
    this.wake.request();
    d.audio.setScene('run');
    this.setScreen('run');
    d.ui.hud.show(true);
  }

  pause(rotate: boolean): void {
    if (this.screen !== 'run') return;
    const d = this.d;
    d.loop.setRunning(false);
    d.input.setEnabled(false);
    this.wake.release();
    d.audio.setScene('paused');
    d.appBus.emit({ t: 'pause' });
    this.setScreen('pause', { rotate });
  }

  resume(): void {
    if (this.screen !== 'pause') return;
    const d = this.d;
    d.audio.resume();                 // inside the click handler: recovers iOS 'interrupted' (TECH §10.3)
    blurActive();
    d.input.setEnabled(true);
    d.loop.setRunning(true);          // TODO(M4): 3-2-1 count at 0.5 s per beat
    this.wake.request();
    d.audio.setScene('run');
    d.appBus.emit({ t: 'resume' });
    this.setScreen('run');
  }

  home(): void {
    const d = this.d;
    this.clearCrashTimers();
    d.loop.setRunning(false);
    d.input.setEnabled(false);
    d.play.classList.remove('run');
    this.back.disarm();
    this.wake.release();
    d.audio.setScene('menu');
    d.ui.hud.show(false);
    this.setScreen('title');
  }

  /** Landscape phone during a run → pause with the rotate card (TECH §10.1). */
  checkRotate(speed: number): void {
    if (this.screen === 'run' && this.d.cameraRig.solve(speed, this.d.viewport()).rotate) this.pause(true);
  }

  dispose(): void { for (const off of this.offs) off(); this.back.dispose(); this.d.loop.stop(); }

  // ── internals ─────────────────────────────────────────────────────────────────────────────────────────────────
  private setScreen(screen: ScreenId, params?: Parameters<UiApi['show']>[1]): void {
    const from = this.screen;
    this.screen = screen;
    this.d.ui.show(screen, params);
    if (from !== screen) this.d.appBus.emit({ t: 'screen', screen, from });
  }

  private onIntent(i: UiIntent): void {
    switch (i.k) {
      case 'play': if (this.screen === 'title') this.startRun(i.startArea ? { startArea: i.startArea } : {}); break;
      case 'retry': if (this.screen === 'crash' || this.screen === 'results') this.retry(); break;
      case 'restart': if (this.screen === 'pause' || this.screen === 'results') this.startRun(); break;
      case 'pause': this.pause(false); break;
      case 'resume': this.resume(); break;
      case 'home': this.home(); break;
      case 'open': if (this.screen === 'title' || this.screen === 'results') { this.d.ui.hud.show(false); this.setScreen(i.screen); } break;
      default: break;                 // settings / rewarded / preview / turntable / backup / restore: TODO(MU, G3)
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    const s = this.screen;
    if (e.code === 'Escape') {
      if (s === 'run') this.pause(false);
      else if (s === 'pause') this.resume();
      else if (s !== 'title' && s !== 'crash') this.home();
      return;
    }
    const retryKey = e.code === 'Enter' || e.code === 'KeyR';
    if (s === 'title' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); this.startRun(); }
    else if (retryKey && s === 'pause') { e.preventDefault(); this.startRun(); }
    else if (retryKey && s === 'results') { e.preventDefault(); this.retry(); }
    else if (retryKey && s === 'crash' && e.timeStamp - this.crashAtMs >= RETRY_MIN_MS) { e.preventDefault(); this.retry(); }
    // Enter/R are ignored during a run (TECH §7.3).
  }

  private onCrash(): void {
    if (this.screen !== 'run') return;
    const d = this.d;
    this.crashAtMs = performance.now();
    this.retryArmed = false;
    d.input.setEnabled(false);
    this.back.disarm();
    this.wake.release();
    this.lastResult = d.sim.result();
    this.lastRewards = d.meta.applyRun(this.lastResult);   // instant retry still grants everything
    d.save.flush();
    d.analytics.track('run_end', { score: this.lastResult.score, distance_m: Math.round(this.lastResult.distance) });
    this.setScreen('crash', { result: this.lastResult });
    this.resultsTimer = setTimeout(() => {
      this.resultsTimer = null;
      if (this.screen === 'crash' && !this.retryArmed) this.showResults();
    }, RESULTS_AFTER_MS);
  }

  private showResults(): void {
    const d = this.d;
    d.loop.setRunning(false);
    d.ui.hud.show(false);
    d.play.classList.remove('run');
    d.audio.setScene('results');
    const params: Parameters<UiApi['show']>[1] = {};
    if (this.lastResult) params.result = this.lastResult;
    if (this.lastRewards) params.rewards = this.lastRewards;
    this.setScreen('results', params);
  }

  private retry(): void {
    this.d.analytics.track('retry_tap', { ms_since_crash: Math.round(performance.now() - this.crashAtMs) });
    this.startRun();
  }

  private clearCrashTimers(): void {
    if (this.resultsTimer) { clearTimeout(this.resultsTimer); this.resultsTimer = null; }
    this.retryArmed = false;
  }
}
