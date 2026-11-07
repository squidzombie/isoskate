// game/wiring.ts: the ONLY place modules are instantiated (TECH §2.1). Builds every module through its factory,
// connects the buses, the loop, the app flow, platform glue and the debug API.
import { createBus, type Bus } from '../core/bus';
import type { AppEvent, GameEvent } from '../core/events';
import type { QualityTier } from '../core/ids';
import type { Haptics } from '../core/platform';
import { clamp } from '../core/math';
import { CHUNK_LEN, GEN_AHEAD_SEC, sAt, V_MAX } from '../core/tuning';
import type { RenderFrame, Viewport } from '../core/view';
import { createAudio, renderOffline } from '../audio';
import { CATALOG } from '../content';
import type { DebugHost } from '../debug';
import { createGfx, onViewportChange, readViewport, redrawCanvasTextures, setGfxQuality } from '../gfx';
import { createInput } from '../input';
import { createAnalytics, createMeta, runEndProps } from '../meta';
import { createHaptics, createMonetization, installTouchHygiene, isTouchDevice, readFlags } from '../platform';
import { createSaveStore } from '../save';
import { createSim } from '../sim';
import { createSkaterView } from '../skater';
import { TRICKS } from '../tricks';
import { createUi } from '../ui';
import { createVfx, onBirdFlutter } from '../vfx';
import { createCameraRig, createWorldView, setCamVariant } from '../world/render';
import { App } from './app';
import { GameLoop } from './loop';
import { FirstRunHints } from './onboarding';
import { createRunSession } from './runSession';

export interface Game { app: App; loop: GameLoop }

export function wire(root: HTMLElement): Game {
  const flags = readFlags();
  const canvas = root.querySelector<HTMLCanvasElement>('#gl')!;
  const play = root.querySelector<HTMLElement>('#play')!;

  // Platform and persistence.
  const save = createSaveStore();
  if (flags.reset && window.confirm('Reset all Dusklane progress on this device?')) save.reset();
  const analytics = createAnalytics(save);
  const monetization = createMonetization({ fakeAds: flags.fakeAds });
  void monetization.init();
  const haptics = createHaptics();
  haptics.enabled = save.data.settings.haptics !== 'off';
  installTouchHygiene(play);

  // Rendering. Tier: ?quality flag, else the saved setting, else by device; 'auto' also lets world/render step the
  // tier on measured frame time (TECH §8.9, setAutoQuality in applySettings).
  const savedQ = save.data.settings.quality;
  const autoTier: QualityTier = isTouchDevice() ? 'med' : 'high';
  const startTier: QualityTier = flags.quality ?? (savedQ === 'auto' ? autoTier : savedQ);
  const gfx = createGfx(canvas, startTier);
  // Debug camera variants (world/render/camVariants.ts): chosen before any world material compiles; production keeps A.
  if (flags.debug && flags.cam && !setCamVariant(flags.cam)) console.warn(`[camera] unknown ?cam=${flags.cam}; using the default`);
  const worldView = createWorldView(gfx);
  const cameraRig = createCameraRig();
  const vfx = createVfx(gfx);
  const skater = createSkaterView(gfx);
  gfx.scene.add(skater.object3d);
  let viewport: Viewport = readViewport(gfx.renderer.getPixelRatio());
  const applyViewport = () => {
    viewport = readViewport(gfx.renderer.getPixelRatio());
    gfx.renderer.setSize(viewport.wCss, viewport.hCss, false);
    root.style.setProperty('--k', String(clamp(viewport.wCss / 390, 0.85, 1.3)));
  };
  applyViewport();

  // Simulation, input, audio, meta, UI.
  const sim = createSim(TRICKS);
  const input = createInput(play, { screenW: () => viewport.wCss, safeBottom: () => viewport.safeBottom, screenH: () => viewport.hCss });
  const audio = createAudio();
  input.onAnyInput(() => { if (!audio.unlocked) void audio.unlock(); });   // retried on every gesture until running
  const meta = createMeta(save, CATALOG);
  const ui = createUi(root);
  ui.setMonetization?.(monetization);                    // the shared provider (NullProvider; FakeProvider with ?fakeads=1)
  const gameBus = createBus<GameEvent>();
  const appBus = createBus<AppEvent>();
  audio.attach(gameBus, appBus);
  onBirdFlutter(vfx, (pan) => audio.sfx('birdFlutter', { pan }));   // RECLAIM: perched birds take off (vfx/critters.ts)
  ui.attach(gameBus, appBus, meta);
  bindHaptics(gameBus, haptics, () => save.data.settings.haptics);
  const session = createRunSession(save, flags.seed);
  const hints = new FirstRunHints(ui.hud, gameBus, {
    save, touch: () => typeof matchMedia !== 'function' || matchMedia('(pointer: coarse)').matches,   // the UI's `coarse`
  });

  // Slides (boardslide family) vs grinds (truck locks), for the grind sound; precomputed so render() never allocates.
  const SLIDE_GRINDS: ReadonlySet<string> = new Set(TRICKS.grinds.filter((d) => d.slide).map((d) => d.id));
  const render = (f: RenderFrame, catchUp: boolean): boolean => {
    const before = worldView.stats().chunksBuilt;
    worldView.update(f);
    if (catchUp) {
      const g = { ...f, events: [] };
      for (let i = 0; i < 8; i++) {
        const b = worldView.stats().chunksBuilt;
        worldView.update(g);
        if (worldView.stats().chunksBuilt === b) break;
      }
    }
    skater.update(f);
    vfx.update(f);
    // Continuous audio layers, every frame (TECH §4.10). speed01 = speed / V_MAX; silent off-run and after a crash.
    const c = f.cur, g = c.grind, live = app.current === 'run' && c.mode !== 'crashed';
    audio.roll(live ? clamp(f.speed / V_MAX, 0, 1) : 0, c.surface, c.mode === 'air', c.mode === 'manual');
    audio.grind(live && !!g, g ? sim.world.edge(g.edgeId)?.material ?? null : null,
      !!g && SLIDE_GRINDS.has(g.id));
    cameraRig.update(f);
    gfx.renderer.render(gfx.scene, cameraRig.camera);
    // Work-time auto-adjust (world/render) may step the tier mid-run: tell the UI overlay and analytics (WA request).
    if (gfx.quality !== shownTier) { shownTier = gfx.quality; appBus.emit({ t: 'quality', tier: shownTier }); }
    if (app.current === 'run' || app.current === 'crash') ui.hud.update(f.score, f.cur, f.dt, cameraRig.project(f.cur.p));
    if (app.current === 'run') hints.update(f.cur.t, f.cur);
    return worldView.stats().chunksBuilt !== before;
  };
  const loop = new GameLoop({
    input, gameBus, sim: () => sim, viewport: () => viewport, render,
    idle(budgetMs, builtChunk) {
      // At most one of {chunk build, segment generation} per frame, only with ≥ 3 ms left (TECH §5.2).
      if (!builtChunk && budgetMs >= 3) sim.gen.ensure(sAt(sim.cur.t + GEN_AHEAD_SEC), 1);
      sim.gen.release(Math.floor(sim.cur.p.s / CHUNK_LEN) - 2);
    },
  });

  let shownTier: QualityTier = startTier;               // the tier the 'quality' app event last reported
  const setQuality = (tier: QualityTier) => {
    setGfxQuality(gfx, tier);
    worldView.setQuality(tier);
    vfx.setQuality(tier);
    applyViewport();
    shownTier = tier;
    appBus.emit({ t: 'quality', tier });
  };
  /** save.data.settings → modules. Called at boot and after every Settings intent (game/app.ts). */
  let tier = startTier;
  const applySettings = () => {
    const st = save.data.settings;
    input.setSensitivity(st.steerSensitivity);
    input.setPreset(st.keyPreset);
    input.setSimpleTricks?.(st.simpleTricks);
    input.setControls?.(st.controls ?? 'two', st.swapSides ?? false);   // two-thumb controls (owner playtest, DESIGN §4.1)
    audio.setVolumes({ music: st.music, sfx: st.sfx });
    haptics.enabled = st.haptics !== 'off';
    loop.batterySaver = st.batterySaver;
    cameraRig.setReducedMotion(st.reducedMotion || !st.shake);
    vfx.setReducedMotion?.(st.reducedMotion || !st.effects);   // "Reduce effects" also stops speed lines (DESIGN §17.2)
    analytics.setOptOut(st.analyticsOptOut);
    const want: QualityTier = flags.quality ?? (st.quality === 'auto' ? autoTier : st.quality);
    if (want !== tier) { tier = want; setQuality(want); }
    worldView.setAutoQuality?.(st.quality === 'auto' && !flags.quality);
  };
  applySettings();

  const app = new App({ root, play, sim, loop, input, ui, meta, save, audio, analytics, worldView, skater, cameraRig, vfx,
    gameBus, appBus, session, viewport: () => viewport, applySettings, hints, runEndProps });

  onViewportChange(() => { applyViewport(); app.checkRotate(sim.cur.vel.s); });
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    appBus.emit({ t: 'contextLost' });
    app.pause(false);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    redrawCanvasTextures(gfx);
    worldView.rebuildGPU();
    skater.rebuildGPU();
    appBus.emit({ t: 'contextRestored' });
  });

  if (flags.debug) {
    const host: DebugHost = {
      sim: () => sim,
      loop,
      startRun: (o) => app.startRun(o ?? {}),
      camera: () => {
        // The world/render rig exposes `last`: the framing actually used this frame (eased H). Fallback: the solver.
        const f = (cameraRig as { last?: { H: number; yawDeg: number; lookAheadSec: number } }).last
          ?? cameraRig.solve(sim.cur.vel.s, viewport);
        return { H: f.H, yawDeg: f.yawDeg, lookAheadSec: f.lookAheadSec, aspect: viewport.aspect };
      },
      gfx, worldView, save, ui, audio, gameBus, appBus,
      input, cameraRig, skater, vfx, meta, app,
      renderAudio: renderOffline,
      setQuality: (q) => { tier = q === 'auto' ? autoTier : q; setQuality(tier); },
    };
    // (G1 bundle) The debug API and the bots load only with ?debug=1: a separate chunk, not in the game's bundle.
    void import('../debug').then(({ installDebugApi }) => {
      installDebugApi(host);
      if (flags.bot && window.__skate) { app.startRun(); window.__skate.bot(flags.bot as Parameters<NonNullable<Window['__skate']>['bot']>[0]); }
    });
  }

  app.boot();
  analytics.track('session_start', { installDay: save.data.installDay, runsTotal: save.data.stats.runs, platform: 'web', quality: startTier });
  return { app, loop };
}

/** DESIGN §9 haptic column: Settings › Haptics Off / Key moments / All. "Key" rows pulse unless Off, "All" rows only on
 *  All; platform/haptics enforces the 15 ms floor and the 120 ms gap. God-mode crashes and replays never pulse. */
export function bindHaptics(bus: Bus<GameEvent>, h: Haptics, level: () => 'off' | 'key' | 'all'): () => void {
  const KEY2: number[] = [15, 40, 15];
  return bus.onAny((e) => {
    const lv = level();
    if (lv === 'off') return;
    const all = lv === 'all';
    switch (e.t) {
      case 'ollie': if (all) h.pulse(15); break;
      case 'land': if (e.quality === 'perfect') h.pulse(KEY2); else if (all) h.pulse(15); break;
      case 'pickWindow': if (all && e.open) h.pulse(15); break;
      case 'grindStart': if (e.perfect) h.pulse(KEY2); else if (all) h.pulse(15); break;
      case 'comboBanked': h.pulse(15); break;
      case 'bestPassed': h.pulse(20); break;
      case 'areaEnter': if (e.firstThisRun) h.pulse(15); break;
      default: break;
    }
  });
}
