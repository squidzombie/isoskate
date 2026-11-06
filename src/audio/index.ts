// audio/: procedural lo-fi music and SFX (AU). Public surface (TECH §4.13).
// M0 stub: a silent engine with the real unlock path (TECH §10.3): the first user-activation gesture
// (pointerup / touchend / click / keydown, wired by game/wiring.ts through input.onAnyInput) creates and resumes
// the AudioContext and plays a 1-sample buffer; callers retry on every gesture until the context is running.
// TODO(AU): DESIGN §19 music, mix and SFX; bindings in attach().
import type { AreaId, EdgeMaterial, Surface } from '../core/ids';
import type { AudioEngine, SfxId } from '../core/audio';
import type { Bus } from '../core/bus';
import type { AppEvent, GameEvent } from '../core/events';

type AudioCtor = typeof AudioContext;

/** shots --audio hook (TECH §11.4): renders `sec` seconds of `area` (music + roll bed at plateau speed) in an
 *  OfflineAudioContext, independent of any live engine. `__skate.renderAudio` encodes the result as WAV.
 *  M0 stub: null (nothing to render). TODO(AU): the real offline render. */
export function renderOffline(_area: AreaId, _sec: number): Promise<AudioBuffer | null> {
  return Promise.resolve(null);
}

export function createAudio(): AudioEngine {
  let ctx: AudioContext | null = null;
  let scene: 'menu' | 'run' | 'paused' | 'results' = 'menu';
  let intensity = 0;
  let wantSuspended = false;

  const engine: AudioEngine = {
    get unlocked() { return ctx?.state === 'running'; },
    async unlock(): Promise<boolean> {
      try {
        if (!ctx) {
          const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
          const Ctor = w.AudioContext ?? w.webkitAudioContext;
          if (!Ctor) return false;
          ctx = new Ctor();
          const nav = navigator as Navigator & { audioSession?: { type: string } };
          if (nav.audioSession) { try { nav.audioSession.type = 'ambient'; } catch { /* read-only on some builds */ } }
        }
        // Everything up to the first await runs inside the user-activation handler (required by iOS).
        const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.connect(ctx.destination); src.start(0);
        if (ctx.state !== 'running') await ctx.resume();
        if (wantSuspended) await ctx.suspend();
        return ctx.state === 'running';
      } catch {
        return false;
      }
    },
    suspend() { wantSuspended = true; void ctx?.suspend().catch(() => undefined); },
    resume() { wantSuspended = false; void ctx?.resume().catch(() => undefined); },
    setVolumes(_v: { music: number; sfx: number }) { /* silent */ },
    setScene(s) { scene = s; },
    music: {
      start(_area: AreaId, _seed: number) { /* silent */ },
      setArea(_a: AreaId, _gatewaySec: number) { /* silent */ },
      setIntensity(level: 0 | 1 | 2 | 3) { intensity = level; },
      setComboFilter(_mult: number) { /* silent */ },
      tapeStop() { /* silent */ }, duck(_db: number, _sec: number) { /* silent */ }, stop() { /* silent */ },
      clock() { return { bpm: 84, nextSixteenthAt: ctx ? ctx.currentTime : 0 }; },
    },
    roll(_speed01: number, _surface: Surface, _airborne: boolean, _manual: boolean) { /* silent */ },
    grind(_active: boolean, _material: EdgeMaterial | null, _slide: boolean) { /* silent */ },
    sfx(_id: SfxId, _o?: { pan?: number; pitch?: number; gain?: number; intensity?: number }) { /* silent */ },
    note(_seq: number) { /* silent */ },
    attach(game: Bus<GameEvent>, _app: Bus<AppEvent>) {
      const offs = [game.on('speedTier', (e) => engine.music.setIntensity(e.tier))];
      return () => { for (const off of offs) off(); };
    },
    stats() { return { voices: 0, contextState: ctx?.state ?? 'none', scene, intensity }; },
  };
  return engine;
}
