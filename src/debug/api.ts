// debug/api.ts: window.__skate (TECH §4.11), installed in dev builds or with ?debug=1.
// Every DebugAPI method exists. Methods not yet backed by their package return sane defaults and are marked
// TODO(M0-sim) / TODO(M0-io).
import { BUILD, type AreaId, type QualityTier, type ScreenId } from '../core/ids';
import type { AudioEngine } from '../core/audio';
import type { Bus } from '../core/bus';
import type { DebugAPI, DebugSnapshot } from '../core/debug';
import type { AppEvent, GameEvent } from '../core/events';
import { EMPTY_FRAME, type InputFrame, type InputSource } from '../core/input';
import type { MetaApi } from '../core/meta';
import type { SaveStore, SaveV1 } from '../core/save';
import type { Sim } from '../core/sim';
import type { UiApi } from '../core/ui';
import type { CameraRig, GfxContext, SkaterView, Vfx, WorldView } from '../core/view';
import type { Dir8 } from '../core/ids';
import { BOTS, type Bot, type BotKind } from './bots';

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

export function installDebugApiImpl(host: DebugHost): DebugAPI {
  const ring: GameEvent[] = [];
  host.gameBus.onAny((e) => {
    if (e.t === 'runStart') ring.length = 0;
    ring.push(e);
    if (ring.length > 1024) ring.shift();
  });
  const held: Partial<InputFrame> = {};
  let bot: Bot | null = null;
  let warnedPointer = false;
  host.loop.setExtraInput((sim) => {
    const b = bot ? bot.frame(sim) : null;
    return b || Object.keys(held).length ? { ...held, ...b } : null;
  });

  const snapshot = (): DebugSnapshot => {
    const sim = host.sim(), c = sim.cur, sc = sim.score;
    const s = c.p.s;
    const safe = [];
    for (let i = Math.floor(s / 32); i <= Math.floor((s + 40) / 32); i++) {
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

  const api: DebugAPI = {
    version: `${BUILD.version}+${BUILD.hash} (${BUILD.mode})`,
    start(o) { host.startRun(o ?? {}); },
    manual(on) { host.loop.manual = on; },
    step(n, input) {
      const count = Math.max(0, Math.floor(n));
      for (let i = 0; i < count; i++) {
        const per = Array.isArray(input) ? input[i] : input;
        host.loop.step({ ...EMPTY_FRAME, ...per });
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
      if (!make) { console.warn(`[__skate] bot '${kind}' is not implemented yet (TODO(M0-sim))`); bot = null; return; }
      bot = make({ ...opts, seed: host.sim().gen.seed });
    },
    pointer(_samples) {
      // TODO(M0-io): feed synthetic traces through the real recognizer + frames pipeline (thumb-bot style).
      if (!warnedPointer) { console.warn('[__skate] pointer() is not implemented yet (TODO(M0-io))'); warnedPointer = true; }
    },
    gen() { return host.sim().gen.stats(); },
    previewArea(area, blend) {
      // M0: start a god-mode run at that area (mid-visit, or inside the gateway into it for a blend in 0..1).
      const t = blend === undefined ? ARRIVAL[area] + 10 : ARRIVAL[area] - 6 + 8 * Math.min(1, Math.max(0, blend));
      host.startRun({ startT: area === 'downtown' && blend === undefined ? 10 : t, god: true });
      host.loop.manual = true;
      api.step(1);
    },
    contrast() {
      return { hazard: 0, edge: 0, worst: null };    // TODO(M0-io/WA): DESIGN §18.4 pixel gate (shots --contrast)
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
