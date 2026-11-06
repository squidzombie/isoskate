// game/wiring.ts: the ONLY place modules are instantiated (TECH §2.1). Builds every module through its factory,
// connects the buses, the loop, the app flow, platform glue and the debug API.
import { createBus } from '../core/bus';
import type { AppEvent, GameEvent } from '../core/events';
import type { QualityTier } from '../core/ids';
import { clamp } from '../core/math';
import { CHUNK_LEN, GEN_AHEAD_SEC, sAt, V_MAX } from '../core/tuning';
import type { RenderFrame, Viewport } from '../core/view';
import { createAudio, renderOffline } from '../audio';
import { CATALOG } from '../content';
import { installDebugApi, type DebugHost } from '../debug';
import { createGfx, onViewportChange, readViewport, redrawCanvasTextures, setGfxQuality } from '../gfx';
import { createInput } from '../input';
import { createAnalytics, createMeta } from '../meta';
import { createHaptics, createMonetization, installTouchHygiene, isTouchDevice, readFlags } from '../platform';
import { createSaveStore } from '../save';
import { createSim } from '../sim';
import { createSkaterView } from '../skater';
import { TRICKS } from '../tricks';
import { createUi } from '../ui';
import { createVfx } from '../vfx';
import { createCameraRig, createWorldView } from '../world/render';
import { App } from './app';
import { GameLoop } from './loop';
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

  // Rendering. Tier: ?quality flag, else the saved setting, else by device (auto-adjust is TODO(WA), TECH §8.9).
  const savedQ = save.data.settings.quality;
  const autoTier: QualityTier = isTouchDevice() ? 'med' : 'high';
  const startTier: QualityTier = flags.quality ?? (savedQ === 'auto' ? autoTier : savedQ);
  const gfx = createGfx(canvas, startTier);
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
  const input = createInput(play, { screenW: () => viewport.wCss, safeBottom: () => viewport.safeBottom });
  const audio = createAudio();
  input.onAnyInput(() => { if (!audio.unlocked) void audio.unlock(); });   // retried on every gesture until running
  const meta = createMeta(save, CATALOG);
  const ui = createUi(root);
  const gameBus = createBus<GameEvent>();
  const appBus = createBus<AppEvent>();
  audio.attach(gameBus, appBus);
  ui.attach(gameBus, appBus, meta);
  const session = createRunSession(save, flags.seed);

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
      !!g && !!TRICKS.grinds.find((d) => d.id === g.id)?.slide);
    cameraRig.update(f);
    gfx.renderer.render(gfx.scene, cameraRig.camera);
    if (app.current === 'run' || app.current === 'crash') ui.hud.update(f.score, f.cur, f.dt, cameraRig.project(f.cur.p));
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

  const setQuality = (tier: QualityTier) => {
    setGfxQuality(gfx, tier);
    worldView.setQuality(tier);
    vfx.setQuality(tier);
    applyViewport();
    appBus.emit({ t: 'quality', tier });
  };
  /** save.data.settings → modules. Called at boot and after every Settings intent (game/app.ts). */
  let tier = startTier;
  const applySettings = () => {
    const st = save.data.settings;
    input.setSensitivity(st.steerSensitivity);
    input.setPreset(st.keyPreset);
    input.setSimpleTricks?.(st.simpleTricks);
    audio.setVolumes({ music: st.music, sfx: st.sfx });
    haptics.enabled = st.haptics !== 'off';
    loop.batterySaver = st.batterySaver;
    cameraRig.setReducedMotion(st.reducedMotion || !st.shake);
    analytics.setOptOut(st.analyticsOptOut);
    const want: QualityTier = flags.quality ?? (st.quality === 'auto' ? autoTier : st.quality);
    if (want !== tier) { tier = want; setQuality(want); }
  };
  applySettings();

  const app = new App({ root, play, sim, loop, input, ui, meta, save, audio, analytics, worldView, skater, cameraRig, vfx,
    gameBus, appBus, session, viewport: () => viewport, applySettings });

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
    installDebugApi(host);
  }

  app.boot();
  if (flags.bot && window.__skate) { app.startRun(); window.__skate.bot(flags.bot as Parameters<NonNullable<Window['__skate']>['bot']>[0]); }
  analytics.track('session_start', { installDay: save.data.installDay, runsTotal: save.data.stats.runs, platform: 'web', quality: startTier });
  return { app, loop };
}
