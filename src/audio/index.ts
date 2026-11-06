// audio/: procedural lo-fi music and SFX, 100% WebAudio synthesis (DESIGN §19, AU). Public surface (TECH §4.13):
// createAudio() and renderOffline(). Everything else is internal.
//
// Live: the AudioContext is created and resumed on the first user-activation gesture (pointerup / touchend / click /
// keydown, wired by game/wiring.ts through input.onAnyInput), retried on every gesture until it runs (TECH §10.3);
// navigator.audioSession.type = 'ambient' where it exists; suspended on visibilitychange hidden / pagehide and resumed
// when visible. The scheduler ticks every 25 ms and on every rendered frame (audio.roll), 120 ms ahead.
// Offline: renderOffline builds the SAME AudioCore on an OfflineAudioContext and drives it with a scripted run, the
// scheduler ticking at the same 25 ms through OfflineAudioContext.suspend(), so a seed always renders the same audio.
//
// Map for the next agent:
//   mix.config.ts      every number (buses, BPMs, progressions, recipes, levels); calibrated by render-check.mjs
//   clock.ts           pure musical time (swing, lookahead window, quantize)         → tests/unit/audio/clock.test.ts
//   music/sequencer.ts pure composer: form, layers, patterns, comping, bass, motif   → sequencer.test.ts
//   music/progressions pure theory: pentatonic, avoid notes, voice leading, pivots   → theory.test.ts
//   engine.ts          AudioCore: director + scheduler + layers + cues (live and offline) → engine.test.ts (fake ctx)
//   graph.ts, synth.ts, voices.ts   the mix graph, node helpers, the 32-voice pool    → voices.test.ts
//   music/{instruments,drums,tape,vinyl}.ts, sfx/{roll,grind,oneshots,ui,ambience,noise}.ts   the sounds
//   bindings.ts        GameEvent / AppEvent → sound, exhaustive tables                → bindings.test.ts
// Listening without ears: PORT=5184 node tests/unit/audio/render-check.mjs (WAVs, spectrogram PNGs, report.json).
import type { AreaId, EdgeMaterial, Surface } from '../core/ids';
import type { AudioEngine, SfxId } from '../core/audio';
import type { Bus } from '../core/bus';
import type { AppEvent, GameEvent } from '../core/events';
import { hash32 } from '../core/rng';
import { readFlags } from '../platform';
import { bindAll, GAME_BINDINGS, type BindState } from './bindings';
import { AudioCore, type PerfStats, type Scene } from './engine';
import { AREA_MUSIC, SCHED, type MusicArea } from './mix.config';
import type { CueOpts } from './sfx/oneshots';

type AudioCtor = typeof AudioContext;
type OfflineCtor = typeof OfflineAudioContext;

/** Extra introspection beyond the frozen AudioEngine (debug, e2e, render-check). */
export interface AudioDebug {
  stats(): ReturnType<AudioCore['stats']> & { contextState: string; unlocked: boolean; peak: number };
  perf(): PerfStats;
  renderScene(o: SceneOptions): Promise<{ buffer: AudioBuffer; marks: { id: string; t: number }[] } | null>;
}
declare global { interface Window { __skateAudio?: AudioDebug } }

const LIVE_SEED = 0x64736b6c;
/** The save's default sliders (save/defaults.ts): offline renders use them so the analysis hears what players hear. */
const DEFAULT_VOLUMES = { music: 0.8, sfx: 0.9 } as const;

export function createAudio(): AudioEngine {
  const core = new AudioCore({ seed: LIVE_SEED, nowMs: () => performance.now() });
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const onVisibility = () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') void ctx.suspend().catch(() => undefined);
    else void ctx.resume().catch(() => undefined);
  };
  const create = (): AudioContext | null => {
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) { try { nav.audioSession.type = 'ambient'; } catch { /* read-only on some builds */ } }
    const c = new Ctor({ latencyHint: 'interactive' });
    core.attach(c);
    timer = setInterval(() => core.tick(), SCHED.tickMs);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onVisibility);
    return c;
  };

  const engine: AudioEngine & { debug: AudioDebug } = {
    get unlocked() { return ctx?.state === 'running'; },
    async unlock(): Promise<boolean> {
      try {
        if (!ctx) ctx = create();
        if (!ctx) return false;
        // Everything up to the first await runs inside the user-activation handler (required by iOS).
        const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.connect(ctx.destination); src.start(0);
        if (ctx.state !== 'running') await ctx.resume();
        return ctx.state === 'running';
      } catch {
        return false;
      }
    },
    suspend() { void ctx?.suspend().catch(() => undefined); },
    resume() { void ctx?.resume().catch(() => undefined); },
    setVolumes(v) { core.setVolumes(v); },
    setScene(s: Scene) { core.setScene(s); },
    music: {
      start(area: AreaId, seed: number) { core.start(area, seed); },
      setArea(a: AreaId, gatewaySec: number) { core.setArea(a, gatewaySec); },
      setIntensity(level: 0 | 1 | 2 | 3) { core.setIntensity(level); },
      setComboFilter(mult: number) { core.setComboFilter(mult); },
      tapeStop() { core.tapeStop(); },
      duck(db: number, sec: number) { core.duck(db, sec); },
      stop() { core.stop(); },
      clock() { return core.clock(); },
    },
    roll(speed01: number, surface: Surface, airborne: boolean, manual: boolean) { core.roll(speed01, surface, airborne, manual); },
    grind(active: boolean, material: EdgeMaterial | null, slide: boolean) { core.grind(active, material, slide); },
    sfx(id: SfxId, o?: { pan?: number; pitch?: number; gain?: number; intensity?: number }) { core.cue(id, o ?? {}); },
    note(seq: number) { core.note(seq); },
    attach(game: Bus<GameEvent>, app: Bus<AppEvent>) { return bindAll(game, app, core); },
    stats() {
      const s = core.stats();
      return { voices: s.voices, contextState: ctx?.state ?? 'none', scene: s.scene, intensity: s.intensity };
    },
    debug: {
      stats: () => ({ ...core.stats(), contextState: ctx?.state ?? 'none', unlocked: ctx?.state === 'running', peak: core.voicePeak() }),
      perf: () => core.perf(),
      renderScene: (o) => renderScene(o),
    },
  };
  if (typeof window !== 'undefined' && readFlags().debug) window.__skateAudio = engine.debug;
  return engine;
}

// ── Offline render ──────────────────────────────────────────────────────────────────────────────────────────────
export interface SceneOptions {
  area: MusicArea; sec: number; seed?: number; sampleRate?: number;
  /** 'demo': plateau-speed run with a few tricks (the default listening render); 'music': music only;
   *  'sfxTour': every one-shot once, spaced out, no music; 'roll': only the roll bed and wind at plateau speed. */
  script?: 'demo' | 'music' | 'sfxTour' | 'roll';
  stems?: Partial<AudioCore['stems']>;
  level?: 0 | 1 | 2 | 3;
}
interface Step { t: number; run(c: AudioCore, st: BindState): void; mark?: string }

/** shots --audio (TECH §11.4): `sec` seconds of `area` at plateau speed (FLOW intensity, mid-song), with the roll bed,
 *  wind, ambience and a handful of tricks, on the live graph code. Deterministic per area. */
export function renderOffline(area: AreaId, sec: number): Promise<AudioBuffer | null> {
  return renderScene({ area, sec, script: 'demo' }).then((r) => r?.buffer ?? null);
}

export async function renderScene(o: SceneOptions): Promise<{ buffer: AudioBuffer; marks: { id: string; t: number }[] } | null> {
  const w = globalThis as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  const Ctor = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!Ctor || !(o.sec > 0)) return null;
  const sr = o.sampleRate ?? 44100;
  const ctx = new Ctor(2, Math.ceil(sr * o.sec), sr);
  const script = o.script ?? 'demo';
  const area = o.area;
  const core = new AudioCore({ seed: o.seed ?? hash32(0xa0d10, AREA_MUSIC[area].tonic, AREA_MUSIC[area].bpm), offline: true });
  const music = script !== 'sfxTour' && script !== 'roll';
  core.stems = { music, sfx: script !== 'music', amb: script === 'demo', fb: script !== 'roll', vinyl: true, ...o.stems } as AudioCore['stems'];
  if (area !== 'menu') { core.setRunArea(area); core.setScene('run'); }
  core.setIntensity(o.level ?? 2);
  core.setVolumes(DEFAULT_VOLUMES);                   // what a new player hears (save defaults)
  core.attach(ctx);
  if (!music) core.stop();
  const steps = scriptSteps(script, area, o.sec);
  const marks = steps.filter((s) => s.mark).map((s) => ({ id: s.mark!, t: s.t }));
  const st: BindState = { material: null, seq: 0 };
  const surface: Surface = area === 'menu' ? 'asphalt' : AREA_MUSIC[area].demoSurface;
  let si = 0, air = 0, grindUntil = -1, grindMat: EdgeMaterial = 'metal';
  const dt = SCHED.tickMs / 1000;
  const run = (t: number) => {
    while (si < steps.length && steps[si]!.t <= t + 1e-9) {
      const s = steps[si++]!;
      s.run(core, st);
      if (s.mark === 'air') air = t + 0.6;
      if (s.mark?.startsWith('grind:')) { grindMat = s.mark.slice(6) as EdgeMaterial; grindUntil = t + 1.2; }
    }
    const rolling = script === 'demo' || script === 'roll';
    core.roll(rolling ? 1 : 0, surface, t < air, false);
    core.grind(t < grindUntil, t < grindUntil ? grindMat : null, false);
  };
  run(0);
  for (let i = 1, t = dt; t < o.sec - dt; i++, t = i * dt) {
    const at = t;
    void ctx.suspend(at).then(() => { run(at); void ctx.resume(); });
  }
  const buffer = await ctx.startRendering();
  core.dispose();
  return { buffer, marks };
}

const ev = <K extends GameEvent['t']>(e: Extract<GameEvent, { t: K }>) => (c: AudioCore, st: BindState) => (GAME_BINDINGS[e.t] as { on(x: GameEvent, s: AudioCore, b: BindState): void }).on(e, c, st);
function scriptSteps(script: NonNullable<SceneOptions['script']>, area: MusicArea, sec: number): Step[] {
  const out: Step[] = [];
  if (script === 'music' || script === 'roll') return out;
  if (script === 'sfxTour') {
    const ids: (SfxId | 'spin' | 'revert' | 'pickChime' | 'rewind' | 'needle' | 'grindSwitch')[] = ['pop', 'whoosh', 'catch', 'land', 'sketchy', 'perfect',
      'perfectLock', 'stair', 'bump', 'knock', 'coin', 'nearMiss', 'hazardTick', 'comboBank', 'comboLost', 'crash', 'newBest', 'newArea',
      'grindEntry', 'grindExit', 'spin', 'revert', 'pickChime', 'rewind', 'needle', 'uiTap', 'uiBack', 'uiToggle', 'uiError', 'purchase',
      'levelUp', 'crateShake', 'crateOpen', 'revealCommon', 'revealRare', 'revealEpic', 'revealLegendary'];
    const gap = Math.max(0.4, (sec - 1) / ids.length);
    ids.forEach((id, i) => out.push({ t: 0.5 + i * gap, mark: id, run: (c) => c.cue(id, { n: 4, dur: 0.36, material: 'metal', side: 1 }) }));
    return out;
  }
  // 'demo': a little line every ~3 s, then a bank, so the render sounds like play (and exercises the bindings).
  let seq = 0;
  const trick = (t: number, links: number) => out.push({ t, run: ev({ t: 'trickScored', tick: 0, id: 'kickflip', pts: 100, factor: 1, link: true, comboPts: 0, links, seq: seq++ }) });
  for (let base = 1.5, k = 0; base < sec - 2; base += 3.2, k++) {
    out.push({ t: base, mark: 'air', run: ev({ t: 'ollie', tick: 0, from: 'roll', linked: k > 0 }) });
    if (k % 3 === 1) {
      out.push({ t: base + 0.3, mark: 'grind:metal', run: ev({ t: 'grindStart', tick: 0, id: 'fiftyFifty', edgeId: 1, material: 'metal', perfect: k % 2 === 0, transfer: false }) });
      out.push({ t: base + 1.5, run: ev({ t: 'grindEnd', tick: 0, id: 'fiftyFifty', dur: 1.2, exit: 'end' }) });
      trick(base + 1.5, k + 1);
    } else {
      out.push({ t: base + 0.06, run: ev({ t: 'flipStart', tick: 0, id: k % 2 ? 'heelflip' : 'kickflip', dur: 0.36 }) });
      out.push({ t: base + 0.6, run: ev({ t: 'land', tick: 0, airT: 0.6, dropH: 0, quality: k % 4 === 2 ? 'perfect' : 'clean', surface: 'asphalt' }) });
      trick(base + 0.6, k + 1);
    }
    for (let j = 0; j < 3; j++) out.push({ t: base + 1.9 + j * 0.22, run: ev({ t: 'coin', tick: Math.round((base + 1.9 + j * 0.22) * 60), id: j, value: 1, p: { s: 0, x: 0, y: 0 }, chain: j }) });
    if (k % 4 === 3) out.push({ t: base + 2.6, run: ev({ t: 'comboBanked', tick: 0, total: 1000, links: k + 1, variety: 0, coins: 0, reason: 'heat', durSec: 3 }) });
  }
  void area;
  return out.sort((a, b) => a.t - b.t);
}
