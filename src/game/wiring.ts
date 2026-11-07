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
import { createHeroBoard, createSkaterView } from '../skater';
import { TRICKS } from '../tricks';
import { createUi } from '../ui';
import { createVfx } from '../vfx';
import { createCameraRig, createWorldView, TitleScene, type TitleBand } from '../world/render';
import { App } from './app';
import { GameLoop } from './loop';
import { FirstRunHints } from './onboarding';
import { boardFollower } from './titleBoard';
import { createRunSession } from './runSession';

export interface Game { app: App; loop: GameLoop }

export function wire(root: HTMLElement): Game {
  const flags = readFlags();
  const canvas = root.querySelector<HTMLCanvasElement>('#gl')!;
  const play = root.querySelector<HTMLElement>('#play')!;

  // Platform and persistence.
  const save = createSaveStore();
  if (flags.reset && window.confirm('Reset all Isoskate progress on this device?')) save.reset();
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
  // The Title backdrop (owner request): the Earth in space and the equipped board floating in front of it. The full
  // Earth maps bake in idle slices from here on; the free band of the Title UI is re-measured at most twice a second.
  const hero = createHeroBoard(gfx);
  let bandAt = -1e9, bandVal: TitleBand | null = null;
  const titleBand = (): TitleBand | null => {
    const t = performance.now();
    if (t - bandAt < 500) return bandVal;
    bandAt = t;
    const q = (sel: string) => root.querySelector<HTMLElement>(`#screens [data-screen="title"] ${sel}`)?.getBoundingClientRect() ?? null;
    const logo = q('.logo'), tap = q('.tap'), best = q('.title-best'), keys = q('.title-keys'), tabs = q('.tabs'), top = q('.title-top');
    const block = q('.title-hero') ?? logo;              // logo + tagline: the scene darkens softly behind it
    if (!logo || !tap || !tabs) { bandVal = null; return null; }
    const under = Math.max(tap.bottom, best?.height ? best.bottom : 0, keys?.height ? keys.bottom : 0);
    const colR = Math.max(logo.right, block?.width ? block.right : 0, tap.right, best?.width ? best.right : 0, keys?.width ? keys.right : 0);
    // Landscape places the board in the side region right of the hero column (TitleScene.layout), so a short band is fine.
    const W = viewport.wCss, H = Math.max(1, viewport.hCss), side = W / H >= 0.85 && W - (colR + 16) > 0.24 * W;
    bandVal = tabs.top - under > 60 || side
      ? { top: under + 10, bottom: tabs.top - 10, heroTop: logo.top, heroBottom: tap.bottom, colR: colR + 16, sideTop: (top?.bottom ?? 0) + 16,
        scrimX: block ? (block.left + block.right) / 2 : 0, scrimY: block ? (block.top + block.bottom) / 2 : 0,
        scrimRx: block?.width ? block.width / 2 : 0, scrimRy: block?.height ? block.height / 2 : 0 } : null;
    return bandVal;
  };
  const title = new TitleScene(titleBand);
  // The board's spin runs on the wall clock (the frame dt is capped at 0.1 s for the sim), so it never slows on a slow frame.
  let titleWallMs = -1;
  const titleWall = (dt: number): number => { const now = performance.now(), s = titleWallMs < 0 ? dt : (now - titleWallMs) / 1000; titleWallMs = now; return s; };
  title.boardSlot.add(hero.object3d);
  let spaceUp = false;                                  // the bake runs only while the space backdrop is drawn
  title.startBake(() => spaceUp);

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
  ui.attach(gameBus, appBus, meta);
  bindHaptics(gameBus, haptics, () => save.data.settings.haptics);
  const session = createRunSession(save, flags.seed);
  const hints = new FirstRunHints(ui.hud, gameBus);

  // Slides (boardslide family) vs grinds (truck locks), for the grind sound; precomputed so render() never allocates.
  const SLIDE_GRINDS: ReadonlySet<string> = new Set(TRICKS.grinds.filter((d) => d.slide).map((d) => d.id));
  // The Title's floating board follows the equipped board (an id compare per frame: no allocation).
  const syncHero = boardFollower(() => save.data.equipped.board, () => meta.loadout().board, hero);
  // The world is first drawn by the dive (or a run started another way): from the Title's third frame, build the
  // Roll-out chunks and compile the world's programs (off the main thread where KHR_parallel_shader_compile exists),
  // then draw the world once into a 1-pixel scissor (uploads its buffers and textures, compiles the shadow programs)
  // under a space frame, so none of it lands in a dive or run frame (the old diorama paid all of it in the first
  // frame). 0 = pending, 1 = compiling, 2 = compiled, 3 = done.
  let worldWarm = 0, spaceFrames = 0, uploadNext = false;
  const warmWorld = (f: RenderFrame) => {
    const r = gfx.renderer;
    if (worldWarm === 0) {
      worldWarm = 1;
      worldView.update(f); skater.update(f); vfx.update(f); cameraRig.update(f);
      title.precompile(r);
      const ra = r as typeof r & { compileAsync?: (s: unknown, c: unknown) => Promise<unknown> };
      const done = () => { worldWarm = 2; };
      // Without parallel compiles (KHR_parallel_shader_compile) an async compile is a sync one plus a wait: go
      // straight to the 1-pixel draws (this frame then costs what the old diorama's first frame did).
      const parallel = !!r.extensions?.has?.('KHR_parallel_shader_compile');
      if (!parallel || !ra.compileAsync) { worldWarm = 2; warmWorld(f); return; }
      try { ra.compileAsync(gfx.scene, cameraRig.camera).then(done, done); } catch { done(); }
    } else if (worldWarm === 2) {
      worldWarm = 3;
      TitleScene.warm(r, gfx.scene, cameraRig.camera);
      title.precompile(r, true);
      // Once more as the run draws it (the run camera, run-only layers such as the contact shadow), then back to the
      // Title's camera mode: the App's camera mode never sees the change, and the space backdrop draws no world.
      cameraRig.setMode('run'); cameraRig.update(f); worldView.update(f);
      TitleScene.warm(r, gfx.scene, cameraRig.camera);
      cameraRig.setMode('title'); cameraRig.update(f);
    }
  };
  /** Longest dive frame (work in the render callback, and the interval between dive frames), for the debug API. */
  const diveStats = { frames: 0, maxWorkMs: 0, maxIntervalMs: 0, last: -1, startedAt: -1, liveAt: -1 };
  const diveWorks: number[] = [];                       // ?debug=1 only: every dive frame's work (ms)
  const render = (f: RenderFrame, catchUp: boolean): boolean => {
    const w0 = performance.now();
    app.frame(f.dt);
    const bd = app.backdrop;
    spaceUp = bd === 'space';
    if (bd !== 'dive' && diveStats.startedAt >= 0 && diveStats.liveAt < 0) diveStats.liveAt = w0;
    if (bd === 'space') {
      title.endDive();
      syncHero();
      hero.update(f.dt);
      title.update(f.dt, viewport, titleWall(f.dt));
      if (worldWarm !== 1 && worldWarm < 3 && ++spaceFrames > 1) warmWorld(f);
      title.render(gfx.renderer);
      return false;
    }
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
    const c = f.cur, g = c.grind, live = app.current === 'run' && !app.diving && c.mode !== 'crashed';
    audio.roll(live ? clamp(f.speed / V_MAX, 0, 1) : 0, c.surface, c.mode === 'air', c.mode === 'manual');
    audio.grind(live && !!g, g ? sim.world.edge(g.edgeId)?.material ?? null : null,
      !!g && SLIDE_GRINDS.has(g.id));
    cameraRig.update(f);
    const dv = bd === 'dive' ? app.diveView : null;
    if (dv) {
      if (diveStats.startedAt < 0 || diveStats.liveAt >= 0) {
        Object.assign(diveStats, { frames: 0, maxWorkMs: 0, maxIntervalMs: 0, last: -1, startedAt: w0, liveAt: -1 });
        diveWorks.length = 0;
      }
      hero.update(f.dt);
      title.update(f.dt, viewport, titleWall(f.dt));
      const diveFocus = title.worldPos(skater.object3d);  // world space, whatever the rider is parented to
      // A chunk built during the space phase is uploaded the frame after (a 1-pixel draw from high above), so the
      // first world frame of the dive does not upload them all at once.
      if (dv.phase === 'space' && uploadNext) {
        uploadNext = false;
        TitleScene.warm(gfx.renderer, gfx.scene, title.handover.at(0, cameraRig.camera, diveFocus, viewport.aspect));
      }
      if (dv.phase === 'space' && worldView.stats().chunksBuilt !== before) uploadNext = true;
      title.renderDive(gfx.renderer, dv, viewport, { scene: gfx.scene, camera: cameraRig.camera, focus: diveFocus });
    } else {
      title.endDive();
      gfx.renderer.render(gfx.scene, cameraRig.camera);
    }
    // Work-time auto-adjust (world/render) may step the tier mid-run: tell the UI overlay and analytics (WA request).
    if (gfx.quality !== shownTier) { shownTier = gfx.quality; appBus.emit({ t: 'quality', tier: shownTier }); }
    if (app.current === 'run' || app.current === 'crash') ui.hud.update(f.score, f.cur, f.dt, cameraRig.project(f.cur.p));
    if (app.current === 'run' && !app.diving) hints.update(f.cur.t, f.cur);
    if (dv) {
      const t1 = performance.now();
      diveStats.frames++;
      diveStats.maxWorkMs = Math.max(diveStats.maxWorkMs, t1 - w0);
      if (flags.debug && diveWorks.length < 240) diveWorks.push(Math.round((t1 - w0) * 10) / 10);
      if (diveStats.last >= 0) diveStats.maxIntervalMs = Math.max(diveStats.maxIntervalMs, w0 - diveStats.last);
      diveStats.last = w0;
    }
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

  let motionQuery: MediaQueryList | null = null;
  try { motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null; } catch { motionQuery = null; }
  const reducedMotion = () => !!motionQuery?.matches || save.data.settings.reducedMotion || !save.data.settings.effects;
  const app = new App({ root, play, sim, loop, input, ui, meta, save, audio, analytics, worldView, skater, cameraRig, vfx,
    gameBus, appBus, session, viewport: () => viewport, applySettings, hints, runEndProps, reducedMotion, now: () => performance.now() });

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
    title.rebuildGPU();
    hero.rebuildGPU();
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
    // Title tooling (e2e title.spec, shots): the space scene's stats, the bake, the dive's frame times.
    (window as unknown as { __skateTitle?: unknown }).__skateTitle = {
      stats: () => ({ ...title.stats(), hero: hero.stats(), backdrop: app.backdrop, diving: app.diving, worldWarm }),
      dive: () => ({ ...diveStats, works: diveWorks.slice(), skipped: app.lastDive?.skipped ?? null }),
      hold: (t: number | null) => app.holdDive(t),
      bakeDone: () => title.bake.done,
      scene: title,
    };
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
