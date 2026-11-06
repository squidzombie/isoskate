// debug/api.ts: window.__skate (TECH §4.11), installed in dev builds or with ?debug=1. Every DebugAPI method is backed
// by the live modules through the DebugHost that game/wiring.ts builds (frozen at m0-core, docs/core-requests.md).
//   - Manual stepping (`manual(true)` + `step(n)`) runs exact ticks on a synthetic 60 Hz clock, so `pointer()` traces
//     go through the real recognizer, keyboard and frame binning (input/pipeline.ts) exactly as a thumb would.
//   - In rAF mode `pointer()` schedules the trace on the live input source (first sample = now).
//   - `contrast()` is the DESIGN §18.4 pixel gate on the rendered frame (debug/contrast.ts).
//   - `ext` (DebugExt) holds the tooling hooks shots.mjs and the e2e specs use: overlays, perf HUD, tuning panel,
//     canvas capture around the skater, the cosmetic catalog, a HUD layout preview and world-view stats.
import { Box3, Vector3 } from 'three';
import { BUILD, type AreaId, type QualityTier, type ScreenId } from '../core/ids';
import type { AudioEngine } from '../core/audio';
import type { Bus } from '../core/bus';
import type { DebugAPI, DebugSnapshot } from '../core/debug';
import type { AppEvent, GameEvent } from '../core/events';
import { EMPTY_FRAME, type InputFrame, type InputSource, type PointerSample } from '../core/input';
import type { MetaApi } from '../core/meta';
import type { SaveStore, SaveV1 } from '../core/save';
import type { Sim } from '../core/sim';
import type { UiApi } from '../core/ui';
import type { CameraRig, GfxContext, SkaterView, Vfx, WorldView } from '../core/view';
import type { Dir8 } from '../core/ids';
import type { ScoreState, SkaterState } from '../core/sim';
import { DT } from '../core/tuning';
import { CATALOG } from '../content';
import { InputPipeline, isInjectable, kForWidth } from '../input';
import { BOTS, type Bot, type BotKind } from './bots';
import { measureContrast, type ContrastReport } from './contrast';

export type StartOptions = Parameters<DebugAPI['start']>[0];

/** What the game gives the debug API (game/wiring.ts builds it). */
export interface DebugHost {
  sim(): Sim;
  loop: {
    manual: boolean;
    timeScale: number;
    /** One sim tick: `f` merged with the extra input and the queued edges; events go out on the game bus. */
    step(f: InputFrame): readonly GameEvent[];
    /** Merged into the next tick's frame (also in rAF mode). */
    queue(f: Partial<InputFrame>): void;
    /** Extra per-tick input (held debug levels, bots). */
    setExtraInput(f: ((sim: Sim) => Partial<InputFrame> | null) | null): void;
    renderNow(): void;
    perf(): { fps: number; p50: number; p95: number; simMs: number };
  };
  startRun(o: StartOptions): void;
  /** The eased framing actually used this frame (falls back to the solver). */
  camera(): { H: number; yawDeg: number; lookAheadSec: number; aspect: number };
  gfx: GfxContext; worldView: WorldView; save: SaveStore; ui: UiApi; audio: AudioEngine;
  gameBus: Bus<GameEvent>; appBus: Bus<AppEvent>;
  // The live modules (read them; drive the flow through `app`). cameraRig.project → contrast() and the overlay.
  input: InputSource; cameraRig: CameraRig; skater: SkaterView; vfx: Vfx; meta: MetaApi;
  /** The screen state machine (game/app.ts). `open(screen, params)`: 'title' goes Home, 'run' starts a run, anything
   *  else leaves the run. Params: { result?, rewards?, rotate?, loadout?: Partial<Loadout>, preview?: ItemId, yaw? }
   *  (loadout / preview / yaw drive the Locker / Shop turntable: shots --cosmetics). */
  app: { readonly current: ScreenId; open(screen: ScreenId, params?: object): void };
  /** shots --audio: audio/index.ts renderOffline (null until AU ships it). */
  renderAudio(area: AreaId, sec: number): Promise<AudioBuffer | null>;
  setQuality(q: QualityTier | 'auto'): void;
}

/** 16-bit PCM WAV (stereo; mono buffers are duplicated) as base64, plus the absolute peak. */
export function encodeWav(buf: { numberOfChannels: number; length: number; sampleRate: number; getChannelData(c: number): Float32Array }):
  { wavBase64: string; peak: number } {
  const n = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(Math.min(1, buf.numberOfChannels - 1))];
  const bytes = new Uint8Array(44 + n * 4);
  const v = new DataView(bytes.buffer);
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 4, true);
  let peak = 0;
  for (let i = 0, o = 44; i < n; i++) {
    for (const c of ch) {
      const x = c[i]!;
      peak = Math.max(peak, Math.abs(x));
      const q = Math.max(-1, Math.min(1, x));
      v.setInt16(o, q < 0 ? q * 0x8000 : q * 0x7fff, true); o += 2;
    }
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { wavBase64: btoa(bin), peak };
}

/** Run time at which each area is first reached (DESIGN §12.1), for previewArea. */
const ARRIVAL: Readonly<Record<AreaId, number>> = { downtown: 161, suburbs: 44, docks: 83, neon: 122 };

/** A toggleable debug tool (overlay, perf HUD, tuning panel): debug/index.ts installs them. */
export interface DebugTool { set(on: boolean): void; readonly on: boolean }
export interface DebugTools { overlay?: DebugTool; perf?: DebugTool; tuning?: DebugTool }

/** HUD layout preview values (shots --hud): replaces the live numbers until cleared with null. */
export interface HudPreview { score?: number; dist?: number; speed?: number; combo?: number; links?: number; coins?: number; trick?: string }

/** Tooling hooks beyond the frozen DebugAPI (`window.__skate.ext`), used by scripts/shots.mjs and the e2e specs. */
export interface DebugExt {
  overlay(on?: boolean): boolean;
  perfHud(on?: boolean): boolean;
  tuning(on?: boolean): boolean;
  /** The full contrast report (every measured hazard and edge) of the current frame. */
  contrastReport(): ContrastReport;
  /** Renders now and returns a PNG data URL: the whole canvas, or a square crop around the skater (cosmetics sheet). */
  capture(o?: { target?: 'canvas' | 'skater'; size?: number; pad?: number; bg?: string }):
    { dataUrl: string; rect: { x: number; y: number; w: number; h: number } | null };
  /** The cosmetic catalog (content/ CATALOG): what shots --cosmetics iterates. */
  catalog(): { id: string; slot: string; name: string; rarity: string; source: string; theme?: string; look: unknown }[];
  /** HUD layout preview with fake values (null = live values again). */
  hud(v: HudPreview | null): void;
  /** World-view internals when available (chunks, pools, coin slots). */
  world(): unknown;
  /** The synthetic clock used by manual stepping (ms; one tick = 1000/60). */
  readonly clockMs: number;
}
export type DebugApiWithExt = DebugAPI & { ext: DebugExt };

export function installDebugApiImpl(host: DebugHost, tools: DebugTools = {}): DebugApiWithExt {
  const ring: GameEvent[] = [];
  host.gameBus.onAny((e) => {
    if (e.t === 'runStart') ring.length = 0;
    ring.push(e);
    if (ring.length > 1024) ring.shift();
  });
  const held: Partial<InputFrame> = {};
  let bot: Bot | null = null;
  host.loop.setExtraInput((sim) => {
    const b = bot ? bot.frame(sim) : null;
    return b || Object.keys(held).length ? { ...held, ...b } : null;
  });

  // Manual stepping runs on a synthetic clock: tick k is due at clock + k·DT. Pointer traces given in manual mode go
  // through this pipeline (the real recognizer + frames), with the screen metrics of the live viewport.
  let clock = 0;
  const screenW = () => Math.max(1, window.innerWidth);
  const synth = new InputPipeline(screenW);
  const syncSynth = () => {
    const c = synth.rec.config, live = isInjectable(host.input) ? host.input.pipeline : null;
    c.k = kForWidth(screenW()); c.screenW = screenW(); c.screenH = window.innerHeight;
    c.deadZoneBottomPx = live?.rec.config.deadZoneBottomPx ?? 12;
    c.simpleTricks = live?.rec.config.simpleTricks ?? false;
    synth.frames.sensitivity = live?.frames.sensitivity ?? 1;
  };

  const snapshot = (): DebugSnapshot => {
    const sim = host.sim(), c = sim.cur, sc = sim.score;
    const s = c.p.s;
    const safe = [];
    for (let i = Math.max(0, Math.floor(s / 32)); i <= Math.floor((s + 40) / 32); i++) {
      for (const k of sim.gen.chunk(i).safe) if (k.s >= s && k.s <= s + 40) safe.push(k);
    }
    return {
      tick: c.tick, t: c.t, mode: c.mode, p: { ...c.p }, vel: { ...c.vel }, speed: c.vel.s,
      area: sim.gen.areaAt(s).area, layer: c.layer, alive: c.mode !== 'crashed',
      score: sc.total, combo: { pts: sc.combo.pending, links: sc.combo.links, window: sc.combo.window }, coins: sc.coins,
      crash: c.crash ? { cause: c.crash.cause, kind: c.crash.obstacleKind } : null,
      nextObstacles: sim.world.obstacles(s, s + 40).filter((o) => o.kind !== 'curb')
        .map((o) => ({ id: o.id, kind: o.kind, s: o.s, x: o.x, dist: o.s - s, tags: o.tags })),
      safe,
    };
  };

  const toggle = (t: DebugTool | undefined, on?: boolean) => { if (!t) return false; t.set(on ?? !t.on); return t.on; };

  const ext: DebugExt = {
    overlay: (on) => toggle(tools.overlay, on),
    perfHud: (on) => toggle(tools.perf, on),
    tuning: (on) => toggle(tools.tuning, on),
    contrastReport: () => measureContrast(host),
    capture(o = {}) {
      host.loop.renderNow();
      const gl = host.gfx.renderer.domElement;
      const W = gl.width, H = gl.height, size = o.size ?? 256;
      let rect: { x: number; y: number; w: number; h: number } | null = null;
      if (o.target === 'skater') {
        const box = new Box3().setFromObject(host.skater.object3d);
        if (!box.isEmpty()) {
          const cam = host.cameraRig.camera, v = new Vector3();
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (let i = 0; i < 8; i++) {
            v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
            const px = ((v.x + 1) / 2) * W, py = ((1 - v.y) / 2) * H;
            x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
          }
          const side = Math.max(x1 - x0, y1 - y0) * (1 + (o.pad ?? 0.35));
          rect = { x: (x0 + x1) / 2 - side / 2, y: (y0 + y1) / 2 - side / 2, w: side, h: side };
        }
      }
      const r = rect ?? { x: 0, y: 0, w: W, h: H };
      const out = document.createElement('canvas');
      const scale = Math.min(size / r.w, size / r.h);
      out.width = rect ? size : Math.round(W * Math.min(1, scale * 4));
      out.height = rect ? size : Math.round(H * Math.min(1, scale * 4));
      const c = out.getContext('2d')!;
      c.fillStyle = o.bg ?? '#2b2140';
      c.fillRect(0, 0, out.width, out.height);
      c.drawImage(gl, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);   // same task as the render
      return { dataUrl: out.toDataURL('image/png'), rect };
    },
    catalog: () => CATALOG.map((c) => ({ id: c.id, slot: c.slot, name: c.name, rarity: c.rarity, source: c.source,
      ...(c.theme ? { theme: c.theme } : {}), look: c.look })),
    hud(v) {
      const hud = host.ui.hud as typeof host.ui.hud & { preview?(p: HudPreview | null): void };
      hud.preview?.(v);
      if (v) {
        const sim = host.sim();
        hud.update(previewScore(sim.score, v), previewCur(sim.cur, v), 1, { x: 0, y: 0 });
      }
    },
    world: () => (host.worldView as { debugInfo?(): unknown }).debugInfo?.() ?? null,
    get clockMs() { return clock; },
  };

  const api: DebugApiWithExt = {
    version: `${BUILD.version}+${BUILD.hash} (${BUILD.mode})`,
    ext,
    start(o) { synth.reset(); host.startRun(o ?? {}); },
    manual(on) { host.loop.manual = on; if (!on) synth.reset(); },
    step(n, input) {
      const count = Math.max(0, Math.floor(n));
      for (let i = 0; i < count; i++) {
        const per = Array.isArray(input) ? input[i] : input;
        clock += DT * 1000;
        host.loop.step({ ...synth.frame(clock), ...per });   // EMPTY_FRAME unless a pointer trace is under way
      }
      host.loop.renderNow();
      return snapshot();
    },
    queue(f) { host.loop.queue(f); },
    gesture(g) {
      if (g === 'tap') host.loop.queue({ tap: true });
      else if (g === 'holdStart') { held.hold = true; held.press = true; }
      else if (g === 'holdEnd') { delete held.hold; delete held.press; }
      else if ('swipe' in g) host.loop.queue({ swipe: g.swipe as Dir8, swipeFast: true });
      else host.loop.queue({ steerDx: g.steerDx });
    },
    snapshot,
    events(sinceTick = 0) { return ring.filter((e) => e.tick >= sinceTick); },
    bot(kind, opts) {
      if (kind === 'off') { bot = null; return; }
      const make = BOTS[kind as BotKind];
      if (!make) { console.warn(`[__skate] bot '${kind}' is not implemented yet`); bot = null; return; }
      bot = make({ ...opts, seed: host.sim().gen.seed });
    },
    pointer(samples) {
      if (!samples.length) return;
      const list = samples.map((p): PointerSample => ({ id: p.id, tMs: p.tMs, x: p.x, y: p.y, phase: p.phase }));
      if (host.loop.manual) {
        // Manual mode: the trace starts at the next tick's start on the synthetic clock.
        syncSynth();
        synth.schedule(list, clock - list[0]!.tMs);
      } else if (isInjectable(host.input)) host.input.inject(list);
      else console.warn('[__skate] pointer(): the input source does not accept synthetic traces');
    },
    gen() { return host.sim().gen.stats(); },
    previewArea(area, blend) {
      // Start a god-mode run at that area (mid-visit, or across the 8 s gateway blend into it for blend in 0..1).
      const t = blend === undefined ? ARRIVAL[area] + 10 : ARRIVAL[area] - 6 + 8 * Math.min(1, Math.max(0, blend));
      api.start({ startT: area === 'downtown' && blend === undefined ? 10 : t, god: true });
      host.loop.manual = true;
      api.step(1);
    },
    contrast() {
      const r = measureContrast(host);
      return { hazard: r.hazard, edge: r.edge, worst: r.worst };
    },
    timeScale(x) { host.loop.timeScale = Math.max(0, x); },
    renderNow() { host.loop.renderNow(); },
    camera() { return host.camera(); },
    perf() {
      const p = host.loop.perf();
      const info = host.gfx.renderer.info;
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      return { fps: p.fps, p50: p.p50, p95: p.p95, calls: info.render.calls, tris: info.render.triangles,
        geoms: info.memory.geometries, textures: info.memory.textures, simMs: p.simMs,
        buildMs: host.worldView.stats().buildMsP95, heapMB: mem ? mem.usedJSHeapSize / 1048576 : null };
    },
    quality(q) { host.setQuality(q); },
    save: {
      get: () => structuredClone(host.save.data) as SaveV1,
      set: (s) => { host.save.import(JSON.stringify(s)); },
      reset: () => host.save.reset(),
    },
    ui(screen: ScreenId, params?: object) { host.app.open(screen, params ?? {}); },
    audio() { const s = host.audio.stats(); return { unlocked: host.audio.unlocked, voices: s.voices, scene: s.scene, intensity: s.intensity }; },
    async renderAudio(area, sec) {
      const buf = await host.renderAudio(area, sec);
      return buf ? { ...encodeWav(buf), sampleRate: buf.sampleRate, sec: buf.length / buf.sampleRate } : null;
    },
  };
  return api;
}

/** Fake score / skater state for the HUD preview (only the fields the HUD reads are meaningful). */
function previewScore(live: Readonly<ScoreState>, v: HudPreview): ScoreState {
  return { ...live, total: v.score ?? live.total, distancePts: v.dist ?? live.distancePts, coins: v.coins ?? live.coins,
    combo: { ...live.combo, active: (v.combo ?? 0) > 0, pending: v.combo ?? 0, links: v.links ?? 0 } };
}
function previewCur(live: Readonly<SkaterState>, v: HudPreview): SkaterState {
  return { ...live, vel: { ...live.vel, s: v.speed ?? live.vel.s } } as SkaterState;
}
