// game/app.ts: the screen state machine for the whole DESIGN §17.1 flow (TECH §9 "integrator-owned UI pieces").
//   Boot → Title ──tap──▶ Run ──crash──▶ Crash overlay ──(fresh touch ≥ 0.6 s)──▶ Run   (instant retry)
//                                              └──(1.2 s, no fresh touch)──▶ Results ──ROLL AGAIN──▶ Run | Home
//   Run ⇄ Pause (pause button, Esc, back gesture, landscape rotation, visibilitychange / pagehide / blur)
//   Title / Results ──open──▶ Locker | Shop (skater 'showcase', camera 'locker', try-on loadouts) ──home──▶ Title
//   Title ──TAP TO ROLL──▶ dive (game/dive.ts: ~1.45 s into the Earth, any tap skips; 0.3 s fade with reduced motion)
//         ──hand-over──▶ Run. Instant retry, ROLL AGAIN, Restart, debug and every other start skip the dive.
// UI raises intents; this file decides what happens. Nothing here is deterministic gameplay.
import type { AudioEngine } from '../core/audio';
import type { Loadout } from '../core/cosmetics';
import type { Bus } from '../core/bus';
import type { AppEvent, GameEvent } from '../core/events';
import type { InputSource } from '../core/input';
import type { MetaApi, RunRewards } from '../core/meta';
import type { Analytics } from '../core/platform';
import type { SaveStore } from '../core/save';
import type { ItemId, ScreenId } from '../core/ids';
import type { RunResult, Sim } from '../core/sim';
import type { UiApi, UiIntent } from '../core/ui';
import type { CameraMode, CameraRig, SkaterView, Vfx, Viewport, WorldView } from '../core/view';
import { blurActive, createBackGuard, createWakeLock, onHide, type BackGuard } from '../platform';
import { DiveClock, type DiveView } from './dive';
import type { GameLoop } from './loop';
import type { RunSession, StartOptions } from './runSession';

export const RETRY_MIN_MS = 600, RESULTS_AFTER_MS = 1200;

export interface AppDeps {
  root: HTMLElement; play: HTMLElement;
  sim: Sim; loop: GameLoop; input: InputSource; ui: UiApi; meta: MetaApi; save: SaveStore; audio: AudioEngine;
  analytics: Analytics; worldView: WorldView; skater: SkaterView; cameraRig: CameraRig; vfx: Vfx;
  gameBus: Bus<GameEvent>; appBus: Bus<AppEvent>; session: RunSession; viewport(): Viewport;
  /** Pushes save.data.settings into the modules (input, audio, haptics, loop, camera, quality). */
  applySettings(): void;
  /** First-runs hints (game/onboarding.ts), armed at every run start. */
  hints?: { start(runsStarted: number, startT: number, god: boolean): void };
  /** The dive plays as a 0.3 s fade (prefers-reduced-motion, Settings › Reduce motion or Reduce effects). */
  reducedMotion?(): boolean;
  /** Wall clock (ms) for the dive (the loop's frame dt is clamped to 0.1 s; a cinematic keeps to real time). */
  now?(): number;
  /** DESIGN §21 run_end properties (meta/index.ts runEndProps, passed in by wiring so App imports no module). */
  runEndProps?(r: RunResult, w: RunRewards | null, retryKind: 'instant' | 'results'): Record<string, string | number | boolean>;
}

type UiParams = NonNullable<Parameters<UiApi['show']>[1]>;
/** `App.open` params (debug `__skate.ui(screen, params)`, shots). Unknown keys are ignored. */
export interface OpenParams extends UiParams {
  /** Locker / Shop: slots merged over the equipped loadout on the turntable (shots --cosmetics: the 6 loadouts). */
  loadout?: Partial<Loadout>;
  /** Locker / Shop: try one catalog item on, over the equipped loadout (shots --cosmetics: the contact sheet). */
  preview?: ItemId | null;
  /** Locker / Shop: absolute turntable yaw in degrees (SkaterView.setTurntable). */
  yaw?: number;
}
const SHOWCASE: ReadonlySet<ScreenId> = new Set<ScreenId>(['locker', 'shop']);
/** Menu screens that may open another menu directly (DESIGN §17.1: Locker "Get more" → Shop, Shop ⇄ Crates, the
 *  Results reward rows; MU request). Settings counts only when it was not opened over Pause. */
const MENUS: ReadonlySet<ScreenId> = new Set<ScreenId>(['locker', 'shop', 'crates', 'stats', 'rewards', 'settings']);
/** Screens drawn over the run (or the frozen run): the run camera stays. */
const RUN_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>(['run', 'pause', 'crash']);

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
  private rotateCard = false;
  private camMode: CameraMode = 'run';
  private turnYaw = 0;
  /** Settings opened from Pause (DESIGN §17.2): Back / Esc return to the frozen run's Pause instead of Home. */
  private settingsOverPause = false;
  /** The sim holds the Title preview (seed 1 at t = 0, the rider idling at the start), not a run. */
  private previewing = false;
  /** The ended run's run_end, sent once its retry kind is known (instant retry, or once Results show). */
  private runEnd: { result: RunResult; rewards: RunRewards | null } | null = null;
  /** The Title → run dive in progress (the run is prepared, the sim and input wait for the hand-over). */
  private dive: DiveClock | null = null;
  private diveLastMs = -1;
  /** How the last dive ended (tools: title.spec): skipped by a tap or key, and at what dive time. */
  lastDive: { skipped: boolean; t: number } | null = null;
  /** A tap that skipped the dive must not also press what appears under it (the HUD's pause button). */
  private swallowClickUntil = -1;

  constructor(private readonly d: AppDeps) {
    this.back = createBackGuard((during) => {
      if (this.backToPause()) return;               // Settings opened from Pause: back returns to Pause
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
      if (this.dive?.active) {
        // Any tap during the dive skips to the run; the touch itself never reaches the run's input.
        e.stopPropagation();
        this.swallowClickUntil = e.timeStamp + 600;
        this.skipDive();
        return;
      }
      if (this.screen === 'crash' && e.timeStamp - this.crashAtMs >= RETRY_MIN_MS) this.retryArmed = true;
    };
    const click = (e: MouseEvent) => {
      if (e.timeStamp < this.swallowClickUntil) { e.stopPropagation(); e.preventDefault(); this.swallowClickUntil = -1; }
    };
    const up = () => { if (this.screen === 'crash' && this.retryArmed) this.retry(); };
    const key = (e: KeyboardEvent) => this.onKey(e);
    d.root.addEventListener('pointerdown', down, true);
    d.root.addEventListener('pointerup', up, true);
    d.root.addEventListener('click', click, true);
    window.addEventListener('keydown', key);
    this.offs.push(() => {
      d.root.removeEventListener('pointerdown', down, true);
      d.root.removeEventListener('pointerup', up, true);
      d.root.removeEventListener('click', click, true);
      window.removeEventListener('keydown', key);
    });
  }

  get current(): ScreenId { return this.screen; }
  /** True while the Title → run dive plays (screen 'run', the sim not yet stepping). */
  get diving(): boolean { return !!this.dive?.active; }
  /** What the canvas shows: the Title's space scene (Title and the menus opened from it), the dive, or the world. */
  get backdrop(): 'space' | 'dive' | 'world' { return this.dive?.active ? 'dive' : this.camMode === 'title' ? 'space' : 'world'; }
  /** The dive's timeline at this frame (null when no dive plays). */
  get diveView(): DiveView | null { return this.dive?.active ? this.dive.shape() : null; }

  /** Tools: freeze the dive at `t` seconds (null: let it run on). */
  holdDive(t: number | null): void { if (this.dive?.active) { this.dive.hold = t; this.dive.tick(0); } }
  /** Once per rendered frame, before drawing (real seconds): advances the dive; its end hands over to the run. */
  frame(dt: number): void {
    if (!this.dive?.active) return;
    const now = this.d.now?.();
    if (now === undefined) { this.dive.tick(dt); return; }
    this.dive.tick(this.diveLastMs < 0 ? 0 : (now - this.diveLastMs) / 1000);
    this.diveLastMs = now;
  }

  /** Boot → Title: the static diorama (DESIGN §18.7): the start street, the rider idling, the 'title' camera. */
  boot(): void {
    const d = this.d;
    this.preview();
    d.cameraRig.setMode('title'); this.camMode = 'title';
    d.loop.start();
    this.home();
  }

  /** The Title diorama's street: seed 1 at t = 0 (the Roll-out, identical on every run) with the equipped loadout. */
  private preview(): void {
    const d = this.d;
    d.sim.reset(d.session.next({ seed: 1 }));
    d.loop.resetRun();
    d.worldView.attach(d.sim.gen);
    d.vfx.clear();
    d.skater.setLoadout(d.meta.loadout());
    this.previewing = true;
  }

  /** Title / instant retry / ROLL AGAIN / debug start: a fresh run (no loading; the world regenerates lazily).
   *  `dive` (TAP TO ROLL on the Title only): the run is prepared now and goes live when the dive hands over; its
   *  first chunks are built during the dive (TECH §8.6 first-frame exception). */
  startRun(o: StartOptions = {}, dive = false): void {
    const d = this.d;
    this.stopDive();
    this.clearCrashTimers();
    this.sendRunEnd('results');                          // a run left from Results / Home without a retry tap
    const cfg = d.session.next(o);
    this.previewing = false;
    d.sim.reset(cfg);
    d.loop.resetRun();
    d.worldView.attach(d.sim.gen);
    d.vfx.clear();
    d.skater.setLoadout(d.meta.loadout());
    d.skater.setMode('run');
    d.cameraRig.setMode('run'); this.camMode = 'run';   // always: a new run re-snaps the framing
    d.save.mutate((s) => { s.onboarding.runsStarted++; });
    d.hints?.start(d.save.data.onboarding.runsStarted, cfg.startT ?? 0, !!cfg.god);
    d.analytics.track('run_start', { seed: cfg.seed, runIndex: d.save.data.onboarding.runsStarted, lesson: cfg.mode === 'lesson' });
    blurActive();
    d.play.classList.add('run');
    this.back.armRun();
    this.wake.request();
    d.audio.setScene('run');                            // the music moves to the run song during the dive
    this.setScreen('run');
    if (dive) {
      d.input.setEnabled(false);
      d.loop.setRunning(false);
      d.ui.hud.show(false);
      this.lastDive = null;
      this.dive = new DiveClock(!!d.reducedMotion?.(), () => { this.lastDive ??= { skipped: false, t: this.dive?.t ?? 0 }; this.goLive(); });
      this.diveLastMs = d.now?.() ?? -1;
      d.loop.fast = true;                               // the dive renders at the run's 60 fps cap
      d.audio.sfx('dive');
      return;
    }
    this.goLive();
  }

  /** The run goes live: input, the sim, the HUD (straight from startRun, or at the dive's hand-over, once). */
  private goLive(): void {
    const d = this.d;
    d.loop.fast = false;
    d.input.setEnabled(true);
    d.loop.setRunning(true);
    d.ui.hud.show(true);
    this.checkRotate(d.sim.cur.vel.s);  // a phone already in landscape starts paused on the rotate card (DESIGN §8)
  }

  private skipDive(): void {
    const dv = this.dive;
    if (!dv?.active) return;
    const t = dv.t;
    dv.skip();
    this.lastDive = { skipped: true, t };
  }

  /** Leaves a dive without its hand-over (another screen or another run start took over). */
  private stopDive(): void {
    if (!this.dive) return;
    this.dive.cancel();
    this.dive = null;
    this.d.loop.fast = false;
  }

  pause(rotate: boolean): void {
    if (this.screen !== 'run') return;
    if (this.dive?.active) this.dive.skip();           // hidden tab / back gesture mid-dive: pause the live run
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
    if (this.rotateNeeded()) { this.setScreen('pause', { rotate: true }); return; }   // still landscape: stay paused
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
    this.stopDive();
    this.clearCrashTimers();
    this.sendRunEnd('results');
    if (!this.previewing) this.preview();               // the Title shows the start street, not the crash site
    d.loop.setRunning(false);
    d.input.setEnabled(false);
    d.play.classList.remove('run');
    this.back.disarm();
    this.wake.release();
    d.audio.setScene('menu');
    d.ui.hud.show(false);
    this.setScreen('title');
  }

  /** Landscape phone during a run → pause with the rotate card (TECH §10.1). On Pause, the card follows the
   *  orientation (rotating back to portrait shows the normal Pause; runs never auto-resume, TECH §10.2). */
  checkRotate(speed: number): void {
    const rotate = this.rotateNeeded(speed);
    if (this.screen === 'run' && rotate) this.pause(true);
    else if (this.screen === 'pause' && rotate !== this.rotateCard) this.setScreen('pause', { rotate });
  }

  /** Opens any screen directly (debug `__skate.ui()`, shots), keeping App and UI in step. 'title' goes Home,
   *  'run' starts a run, 'pause' during a run pauses it; anything else freezes the run (no results are applied). */
  open(screen: ScreenId, params: object = {}): void {
    const p = params as OpenParams;
    if (screen === 'title' || screen === 'boot') { this.home(); return; }
    if (screen === 'run') { this.startRun(); return; }
    if (screen === 'pause' && this.screen === 'run') { this.pause(!!p.rotate); return; }
    const d = this.d;
    this.stopDive();
    this.clearCrashTimers();
    d.loop.setRunning(false);
    d.input.setEnabled(false);
    this.back.disarm();
    this.wake.release();
    const overlay = screen === 'pause' || screen === 'crash';      // drawn over the frozen run and its HUD
    if (!overlay) { d.play.classList.remove('run'); d.ui.hud.show(false); }
    d.audio.setScene(screen === 'results' ? 'results' : overlay ? 'paused' : 'menu');
    const ui: UiParams = {};
    if (screen === 'settings') ui.settings = d.save.data.settings;   // the screen shows the current values
    if (p.result) ui.result = p.result;
    if (p.rewards) ui.rewards = p.rewards;
    if (p.rotate !== undefined) ui.rotate = p.rotate;
    this.setScreen(screen, ui);
    if (SHOWCASE.has(screen)) this.showcase(p);
  }

  dispose(): void { this.stopDive(); for (const off of this.offs) off(); this.back.dispose(); this.d.loop.stop(); }

  // ── internals ─────────────────────────────────────────────────────────────────────────────────────────────────
  private setScreen(screen: ScreenId, params?: UiParams): void {
    const from = this.screen;
    this.screen = screen;
    if (screen !== 'settings') this.settingsOverPause = false;
    this.rotateCard = screen === 'pause' && !!params?.rotate;
    const d = this.d;
    // Locker / Shop: skater turntable and the locker camera; leaving them restores the equipped loadout. Other
    // menus sit on the Title diorama ('title' camera) when the sim holds the preview, else on the frozen run.
    const show = SHOWCASE.has(screen), was = SHOWCASE.has(from);
    if (show !== was) {
      d.skater.setMode(show ? 'showcase' : 'run');
      if (show) { this.turnYaw = 0; d.skater.setTurntable?.(0); } else d.skater.setLoadout(d.meta.loadout());
    }
    this.setCamera(show ? 'locker' : RUN_SCREENS.has(screen) || !this.previewing ? 'run' : 'title');
    d.ui.show(screen, params);
    if (from !== screen) d.appBus.emit({ t: 'screen', screen, from });
  }

  private setCamera(m: CameraMode): void {
    if (m !== this.camMode) { this.camMode = m; this.d.cameraRig.setMode(m); }
  }

  private rotateNeeded(speed = this.d.sim.cur.vel.s): boolean {
    return this.d.cameraRig.solve(speed, this.d.viewport()).rotate;
  }

  /** Turntable loadout: equipped, then `loadout` slots, then the `preview` item; `yaw` sets the turntable. */
  private showcase(p: OpenParams): void {
    const d = this.d;
    let l: Loadout = { ...d.meta.loadout(), ...(p.loadout ?? {}) };
    const item = p.preview ? d.meta.catalog().find((c) => c.id === p.preview) : undefined;
    if (item) l = { ...l, [item.slot]: item.look } as Loadout;
    d.skater.setLoadout(l);
    if (typeof p.yaw === 'number') { this.turnYaw = p.yaw; d.skater.setTurntable?.(p.yaw); }
  }

  /** Settings intent: writes one known key of save.settings (same type as its current value), then applies it. */
  private setSetting(key: string, value: unknown): void {
    const cur = this.d.save.data.settings as Readonly<Record<string, unknown>>;
    if (!(key in cur) || typeof cur[key] !== typeof value) return;   // MU's Settings screen validates ranges
    this.d.save.mutate((s) => { (s.settings as unknown as Record<string, unknown>)[key] = value; });
    this.d.applySettings();
  }

  private onIntent(i: UiIntent): void {
    switch (i.k) {
      case 'play': if (this.screen === 'title') this.startRun(i.startArea ? { startArea: i.startArea } : {}, true); break;
      case 'retry': if (this.screen === 'crash' || this.screen === 'results') this.retry(); break;
      case 'restart': if (this.screen === 'pause' || this.screen === 'results') this.startRun(); break;
      case 'pause': this.pause(false); break;
      case 'resume': this.resume(); break;
      case 'home': if (!this.backToPause()) this.home(); break;
      case 'open':
        if (i.screen === 'settings' && this.screen === 'pause') this.settingsFromPause();
        else if (this.screen === 'title' || this.screen === 'results'
          || (MENUS.has(this.screen) && !this.settingsOverPause && i.screen !== this.screen)) this.open(i.screen);
        break;
      case 'preview': if (SHOWCASE.has(this.screen)) this.showcase({ preview: i.id }); break;
      case 'turntable': if (SHOWCASE.has(this.screen)) { this.turnYaw += i.dYaw; this.d.skater.setTurntable?.(this.turnYaw); } break;
      case 'settings': this.setSetting(i.key, i.value); break;
      default: break;                 // rewarded / backup / restore: done by the UI itself (MU; core-requests MU)
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (this.dive?.active) {                           // any key skips the dive (browser shortcuts still work)
      if (e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Arrow')) e.preventDefault();
      this.skipDive();
      return;
    }
    const s = this.screen;
    if (e.code === 'Escape') {
      if (this.backToPause()) return;
      if (s === 'run') this.pause(false);
      else if (s === 'pause') this.resume();
      else if (s !== 'title' && s !== 'crash') this.home();
      return;
    }
    const retryKey = e.code === 'Enter' || e.code === 'KeyR';
    if (s === 'title' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); this.startRun({}, true); }
    else if (retryKey && s === 'pause') { e.preventDefault(); this.startRun(); }
    else if (retryKey && s === 'results') { e.preventDefault(); this.retry(); }
    else if (retryKey && s === 'crash' && e.timeStamp - this.crashAtMs >= RETRY_MIN_MS) { e.preventDefault(); this.retry(); }
    // Enter/R are ignored during a run (TECH §7.3).
  }

  /** Pause → Settings over the frozen run: the loop, input, wake lock and back guard stay as Pause left them. */
  private settingsFromPause(): void {
    this.setScreen('settings', { settings: this.d.save.data.settings });
    this.settingsOverPause = true;
  }

  /** Settings opened from Pause: Back / Esc return to Pause (with the rotate card if still landscape). */
  private backToPause(): boolean {
    if (this.screen !== 'settings' || !this.settingsOverPause) return false;
    const rotate = this.rotateNeeded();
    this.setScreen('pause', { rotate });
    return true;
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
    this.runEnd = { result: this.lastResult, rewards: this.lastRewards };   // run_end goes once its retry kind is known
    this.setScreen('crash', { result: this.lastResult });
    this.resultsTimer = setTimeout(() => {
      this.resultsTimer = null;
      if (this.screen === 'crash' && !this.retryArmed) this.showResults();
    }, RESULTS_AFTER_MS);
  }

  private showResults(): void {
    const d = this.d;
    this.sendRunEnd('results');
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
    if (this.screen === 'crash') this.sendRunEnd('instant');
    this.startRun();
  }

  /** run_end with the DESIGN §21 properties (MU's runEndProps), once per ended run. */
  private sendRunEnd(kind: 'instant' | 'results'): void {
    const r = this.runEnd;
    if (!r) return;
    this.runEnd = null;
    const props = this.d.runEndProps?.(r.result, r.rewards, kind)
      ?? { score: r.result.score, distance_m: Math.round(r.result.distance), retry_kind: kind };
    this.d.analytics.track('run_end', props);
  }

  private clearCrashTimers(): void {
    if (this.resultsTimer) { clearTimeout(this.resultsTimer); this.resultsTimer = null; }
    this.retryArmed = false;
  }
}
