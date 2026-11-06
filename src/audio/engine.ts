// audio/engine.ts: the audio core shared by live play and the offline render. It owns the mix graph, the music
// director (song form, bar-line intensity, pivots and crossfades, tape stop, needle drop), the lookahead scheduler,
// the continuous layers and the one-shot player. Nothing here touches the DOM: index.ts gives it an AudioContext
// (on the first user gesture) or an OfflineAudioContext, and a millisecond clock for the perf counter.
import type { AreaId, EdgeMaterial, Surface } from '../core/ids';
import { hash32 } from '../core/rng';
import { barAt, barSec, barStart, beatSec, nextSixteenth, quantize, sixteenthSec, type SongClock } from './clock';
import { buildGraph, type Graph } from './graph';
import {
  AREA_MUSIC, BUS, COIN, COMBO_FILTER, DRUM_LEVEL, DUCK_TAU, FEEDBACK, FORM_BARS, INTENSITY, MALLET, NEEDLE_DROP_SEC, PAD,
  SCHED, SLIDER_CURVE, TAPE, TAPE_STOP, BREAK_SWEEP, type ChordSpec, type MusicArea,
} from './mix.config';
import { prioritize } from './bank';
import { playDrum } from './music/drums';
import { areaMallet, Bass, playArp, playClank, playEp, playMallet, playPad } from './music/instruments';
import { chordAt, feedbackMidi, pivotChord, tuneHz } from './music/progressions';
import { composeBar, drumLpFor, formAt, LAYERS, layersFor, progression, sectionStart, type Layer, type Level, type NoteEv } from './music/sequencer';
import { tapeReset, tapeStop } from './music/tape';
import { Ambience } from './sfx/ambience';
import { GrindLoop } from './sfx/grind';
import { playOneShot, type CueOpts, type KeyInfo } from './sfx/oneshots';
import { RollLoop } from './sfx/roll';
import { playUi } from './sfx/ui';
import { dbGain } from './synth';
import { PRI, type Voice } from './voices';

export type Scene = 'menu' | 'run' | 'paused' | 'results';
/** Every sound the bindings can ask for: the frozen SfxIds plus the internal cues (docs/core-requests.md § AU). */
export type Cue = import('../core/audio').SfxId | 'spin' | 'revert' | 'pickChime' | 'rewind' | 'needle' | 'grindSwitch';
const UI_CUES = new Set<string>(['uiTap', 'uiBack', 'uiToggle', 'uiError', 'purchase', 'levelUp', 'crateShake', 'crateOpen',
  'revealCommon', 'revealRare', 'revealEpic', 'revealLegendary']);

interface Song { area: MusicArea; seed: number; alt: boolean; clock: SongClock; bar: number; pivotBar: number; pivot: ChordSpec | null; pivotTo: MusicArea | null }
interface Queued { at: number; ev: NoteEv; area: MusicArea }
export interface CoreOptions { seed: number; nowMs?: () => number; offline?: boolean }
/** Main-thread audio cost per rendered frame since attach: `msPerFrame` and `p95` over every frame (p95 to 0.025 ms),
 *  `recent*` over the last 600; `attachMs` is building the graph (the unlocking gesture). */
export interface PerfStats {
  frames: number; msPerFrame: number; p95: number; recentMsPerFrame: number; recentP95: number; max: number; tickMs: number;
  attachMs: number; slowest: { ms: number; what: string };
}
const PERF_BIN_MS = 0.025, PERF_BINS = 400;

const START_A = sectionStart('A');
/** Gateways keep the song form going: the next area's song starts at the bar the old one would have played next
 *  (never in the intro; a finished form starts again at A), so a run walks A → B → A′ → break → A″ across areas. */
const CARRY_FORM = -1;
const carryBar = (bar: number) => (bar < START_A || bar >= FORM_BARS ? START_A : bar);
const clampLevel = (l: number): Level => (l <= 0 ? 0 : l >= 3 ? 3 : (Math.round(l) as Level));

export class AudioCore {
  g: Graph | null = null;
  scene: Scene = 'menu';
  private vol = { music: 1, sfx: 1 };
  /** Music slider at 0: the music keeps its time, form and harmony (bar lines, pivots, keyInfo) but creates no
   *  nodes, and feedback notes are skipped; both at 0 (muted, context suspended): one-shots are skipped too. */
  private musicOn = true; private sfxOn = true;
  private song: Song | null = null;
  private playing = false;
  private stopped = true;                 // tape-stopped or stopped: the next start is a needle drop
  private stoppedUntil = 0;
  private q: Queued[] = [];
  private qi = 0;
  /** A song change waiting for a bar line. startBar < 0: carry on from the old song's next form bar (gateways). */
  private pending: { to: MusicArea; stage: 'pivot' | 'cut'; startBar: number } | null = null;
  private runArea: AreaId = 'downtown';
  private songCount = 0;
  private levelBase: Level = 1;
  private mult = 1;
  private applied: Level = 0;
  private layerOn: Record<Layer, boolean> = { drums: false, ghost: false, shaker: false, bass: false, ep: false, pad: false, melody: false, arp: false, clank: false };
  private fadeIn: Partial<Record<Layer, readonly [number, number]>> = {};
  private bass: Bass | null = null;
  private rollLoop: RollLoop | null = null;
  private grindLoop: GrindLoop | null = null;
  private amb: Ambience | null = null;
  private loops: Voice[] = [];
  private coinN = 0; private lastCoinTick = -1e9;
  private lastVoicing: readonly number[] = [55, 59, 62, 65];
  // Perf counter (main-thread ms spent in audio code, per rendered frame, from attach on): whole-session sum and a
  // 0.025 ms histogram (average and p95 over every frame), plus the last 600 frames.
  private readonly nowMs: () => number;
  private acc = 0; private depth = 0; private t0 = 0;
  private readonly ring = new Float64Array(600); private ringN = 0; private frames = 0; private maxMs = 0; private tickAcc = 0; private ticks = 0;
  private sumMs = 0; private readonly hist = new Uint32Array(PERF_BINS + 1); private attachMs = 0;

  constructor(readonly opts: CoreOptions) { this.nowMs = opts.nowMs ?? (() => 0); }

  // ── perf ──────────────────────────────────────────────────────────────────────────────────────────────────────
  private label = ''; private sub = '';
  private slowest = { ms: 0, what: '' };
  begin(label: string, sub = ''): void { if (this.depth++ === 0) this.t0 = this.nowMs(); if (label) { this.label = label; this.sub = sub; } }
  end(): void {
    if (--this.depth !== 0) return;
    const d = this.nowMs() - this.t0;
    this.acc += d;
    if (d > this.slowest.ms) this.slowest = { ms: d, what: this.sub ? `${this.label}:${this.sub}` : this.label };
  }
  /** Frame boundary (called from roll(), which wiring calls every rendered frame). */
  private frame(): void {
    const a = this.acc;
    this.acc = 0;
    if (!this.g) return;
    this.ring[this.ringN++ % this.ring.length] = a;
    this.frames++;
    this.sumMs += a;
    this.hist[Math.min(PERF_BINS, Math.floor(a / PERF_BIN_MS))]!++;
    this.maxMs = Math.max(this.maxMs, a);
  }
  perf(): PerfStats {
    const n = Math.min(this.ringN, this.ring.length);
    const a = Array.from(this.ring.subarray(0, n)).sort((x, y) => x - y);
    const recent = a.reduce((s, x) => s + x, 0);
    let k = 0, p95 = 0;
    for (let i = 0; i <= PERF_BINS; i++) { k += this.hist[i]!; if (k >= this.frames * 0.95) { p95 = (i + 1) * PERF_BIN_MS; break; } }
    return {
      frames: this.frames, msPerFrame: this.frames ? this.sumMs / this.frames : 0, p95: this.frames ? p95 : 0,
      recentMsPerFrame: n ? recent / n : 0, recentP95: n ? a[Math.floor(n * 0.95)]! : 0,
      max: this.maxMs, tickMs: this.ticks ? this.tickAcc / this.ticks : 0, attachMs: this.attachMs, slowest: { ...this.slowest },
    };
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────────────────────────────────────────
  attach(ctx: BaseAudioContext): void {
    const t0 = this.nowMs();
    const g = buildGraph(ctx, this.opts.seed);
    this.g = g;
    this.bass = new Bass(g);
    this.rollLoop = new RollLoop(g);
    this.grindLoop = new GrindLoop(g);
    this.amb = new Ambience(g, this.opts.seed);
    const persistent = (): Voice => { const v: Voice = { end: Infinity, pri: PRI.loop, stop: () => undefined }; g.voices.add(v, ctx.currentTime); return v; };
    this.loops.push(persistent(), persistent());           // the bass voice and the vinyl loop
    this.setVolumes(this.vol);
    const now = ctx.currentTime;
    g.music.duck.gain.setValueAtTime(sceneGain(this.scene), now);
    // Unlocked by the tap that starts the first run: that run opens with the song's muffled intro (the beat drops
    // after 4 bars); unlocked anywhere else: the menu song.
    if (this.scene === 'run') this.resumeMusic(now, this.runArea, this.opts.offline ? START_A : 0);
    else this.resumeMusic(now, 'menu', 0);
    this.amb.setArea(this.scene === 'run' ? this.runArea : 'menu', now);
    this.attachMs = this.nowMs() - t0;
  }

  /** The area whose song attach() will start (its drum kit must be ready by then). */
  firstSongArea(): MusicArea { return this.scene === 'run' ? this.runArea : 'menu'; }

  setVolumes(v: { music: number; sfx: number }): void {
    this.vol = { music: clamp01(v.music), sfx: clamp01(v.sfx) };
    this.musicOn = this.vol.music > 0; this.sfxOn = this.vol.sfx > 0;
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime;
    const m = Math.pow(this.vol.music, SLIDER_CURVE), s = Math.pow(this.vol.sfx, SLIDER_CURVE);
    const st = this.stems;
    const set = (p: AudioParam, x: number) => { if (now <= 0) p.setValueAtTime(x, 0); else p.setTargetAtTime(x, now, 0.05); };
    set(g.music.vol.gain, BUS.music * m * +st.music);
    set(g.fbVol.gain, BUS.feedback * m * +st.fb);
    set(g.sfxVol.gain, BUS.sfx * s * +st.sfx);
    set(g.ambVol.gain, BUS.ambience * s * +st.amb);
    set(g.music.vinyl.gain, +st.vinyl);
  }

  setScene(s: Scene): void {
    const prev = this.scene;
    if (s === prev) return;
    this.scene = s;
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime, m = g.music;
    if (s !== 'run') {
      // Level 0 at once (not at the bar line): the muffle, and the bass, melody, ghosts, arp and shaker already
      // queued for this bar are dropped; only then is the music lifted to the scene level (level 0 lacks bass and
      // bright drums), more slowly than the layers leave, so leaving a run never makes the music louder.
      if (prev === 'run') this.dropToLevel0(now);
      m.drumLp.frequency.setTargetAtTime(INTENSITY.drumLp[0], now, INTENSITY.sceneFade / 3);
      m.drumBus.gain.setTargetAtTime(DRUM_LEVEL * INTENSITY.drumGain[0], now, INTENSITY.sceneFade / 3);
      m.duck.gain.setTargetAtTime(sceneGain(s), now, INTENSITY.sceneLift / 3);
    } else m.duck.gain.setTargetAtTime(sceneGain(s), now, 0.1);
    this.setComboFilter(this.mult);
    if (s === 'run') {
      if (this.stopped) this.resumeMusic(now, this.runArea, prev === 'menu' ? 0 : START_A);
      else if (this.song && this.song.area !== this.runArea) this.cutAtBeat(this.runArea, prev === 'menu' ? 0 : START_A);
      this.amb?.setArea(this.runArea, now);
    } else if (s === 'menu') {
      if (this.stopped) this.resumeMusic(now, 'menu', 0);
      else if (this.song && this.song.area !== 'menu') this.pending = { to: 'menu', stage: 'cut', startBar: 0 };
      this.amb?.setArea('menu', now);
    } else if (s === 'results') {
      if (this.stopped) this.resumeMusic(now, this.song?.area ?? this.runArea, START_A);
    }
  }

  // ── scheduler ─────────────────────────────────────────────────────────────────────────────────────────────────
  tick(): void {
    const g = this.g;
    if (!g) return;
    this.begin('tick');
    const a = this.nowMs();
    const now = g.ctx.currentTime, horizon = now + SCHED.lookahead;
    this.amb?.tick(now, horizon);
    if (this.playing && this.song) this.schedule(now, horizon);
    this.tickAcc += this.nowMs() - a; this.ticks++;
    this.end();
  }

  private schedule(now: number, horizon: number): void {
    let s = this.song!;
    if (barStart(s.clock, s.bar + 1) < now - SCHED.resyncAfter) {
      // The main thread stalled (or the context was suspended): skip ahead instead of bunching notes.
      s.clock = { ...s.clock, t0: now + 0.05, bar0: s.bar + 1 };
      this.q.length = 0; this.qi = 0;
    }
    for (let guard = 0; guard < 4; guard++) {
      s = this.song!;
      const nb = barStart(s.clock, s.bar + 1);
      if (nb - 0.03 >= horizon) break;
      this.advanceBar(nb);
    }
    while (this.qi < this.q.length && this.q[this.qi]!.at < horizon) { const it = this.q[this.qi++]!; if (this.musicOn) this.dispatch(it, now); }
    if (this.qi > 48) { this.q.splice(0, this.qi); this.qi = 0; }
  }

  private beginSong(area: MusicArea, t: number, startBar: number): void {
    const a = AREA_MUSIC[area];
    const n = this.songCount++;
    this.song = {
      area, seed: hash32(this.opts.seed, n, a.tonic, a.bpm), alt: n % 2 === 1,
      clock: { bpm: a.bpm, t0: t, bar0: startBar, swing: SCHED.swing }, bar: startBar - 1, pivotBar: -1, pivot: null, pivotTo: null,
    };
    this.applyArea(area, t);
  }

  private advanceBar(t: number): void {
    let s = this.song!;
    this.label = 'bar'; this.sub = s.area;
    const p = this.pending;
    if (p && p.stage === 'cut') {
      this.pending = null;
      this.dropQueueFrom(t);
      this.beginSong(p.to, t, p.startBar >= 0 ? p.startBar : carryBar(s.bar + 1));
      s = this.song!;
    } else if (p && p.stage === 'pivot') {
      s.pivotTo = p.to;
      s.pivot = pivotChord(AREA_MUSIC[p.to], this.lastVoicing);
      s.pivotBar = s.bar + 1;
      p.stage = 'cut';
    }
    let bar = s.bar + 1;
    if (bar >= FORM_BARS) {
      // Song over: a new seed (every 2nd song voice-led), straight into A while running, from the intro otherwise.
      this.beginSong(s.area, t, this.scene === 'run' ? START_A : 0);
      s = this.song!;
      bar = s.bar + 1;
    }
    s.bar = bar;
    const pivot = bar === s.pivotBar ? s.pivot : null;
    const pos = formAt(bar);
    this.applyBarLine(t, s, pos.section, pos.inSection, !!pivot);
    const approachTo = pivot && s.pivotTo ? progression(s.pivotTo, false)[0]![0]!.bass : null;
    const evs = composeBar({ area: s.area, seed: s.seed, alt: s.alt, bar, level: this.applied, pivot, approachTo });
    const start = this.q.length;
    for (const e of evs) this.q.push({ at: t + e.t, ev: e, area: s.area });
    if (start > this.qi) {
      const tail = this.q.splice(this.qi).sort((x, y) => x.at - y.at);
      for (const x of tail) this.q.push(x);
    }
    const ch = pivot ?? progression(s.area, s.alt)[bar % 4]![0]!;
    this.lastVoicing = ch.voicing;
  }

  /** Leaving the run: the queued events of layers that level 0 does not play are dropped and the bass released, so the
   *  rest of the bar already sounds like level 0. */
  private dropToLevel0(now: number): void {
    const s = this.song;
    if (!s || !this.playing) return;
    const L = layersFor(0, formAt(Math.max(0, s.bar)).section, AREA_MUSIC[s.area], false);
    let w = this.qi;
    for (let i = this.qi; i < this.q.length; i++) if (L[this.q[i]!.ev.layer]) this.q[w++] = this.q[i]!;
    this.q.length = w;
    this.bass?.silence(now);
    this.layerOn = L; this.applied = 0; this.fadeIn = {};
  }

  private dropQueueFrom(t: number): void {
    let w = this.qi;
    for (let i = this.qi; i < this.q.length; i++) if (this.q[i]!.at < t) this.q[w++] = this.q[i]!;
    this.q.length = w;
  }

  private effectiveLevel(): Level {
    if (this.scene !== 'run') return 0;
    const combo: Level = this.mult >= INTENSITY.comboL3 ? 3 : this.mult >= INTENSITY.comboL2 ? 2 : 1;
    return clampLevel(Math.max(this.levelBase, combo));
  }

  private applyBarLine(t: number, s: Song, section: ReturnType<typeof formAt>['section'], inSection: number, pivot: boolean): void {
    const g = this.g!, m = g.music, a = AREA_MUSIC[s.area];
    const target = this.effectiveLevel();
    const beat = beatSec(s.clock.bpm);
    const L = layersFor(target, section, a, pivot);
    for (const l of LAYERS) if (L[l] && !this.layerOn[l]) this.fadeIn[l] = [t, t + beat * INTENSITY.fadeBeats];
    this.layerOn = L;
    this.applied = target;
    const tau = (beat * INTENSITY.fadeBeats) / 3;
    m.drumLp.frequency.setTargetAtTime(drumLpFor(target, section), t, tau);
    m.drumBus.gain.setTargetAtTime(DRUM_LEVEL * INTENSITY.drumGain[target], t, tau);
    m.padLp.frequency.setTargetAtTime(PAD.lpHz + (target >= 3 ? INTENSITY.padLpBoost : 0), t, tau);
    if (section === 'break' && inSection === 0) {
      const f = m.formLp.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(BREAK_SWEEP.fromHz, t);
      f.exponentialRampToValueAtTime(BREAK_SWEEP.toHz, t + 4 * barSec(s.clock.bpm));
    }
  }

  private dispatch(item: Queued, now: number): void {
    let t = item.at;
    if (t < now - SCHED.lateDrop) return;
    if (t < now) t = now;
    const g = this.g!, e = item.ev, a = AREA_MUSIC[item.area];
    const fi = this.fadeIn[e.layer];
    let amp = 1;
    if (fi) {
      const u = (t - fi[0]) / (fi[1] - fi[0]);
      if (u >= 1) delete this.fadeIn[e.layer]; else amp = Math.max(0.3, u);
    }
    const vel = e.vel * amp;
    switch (e.inst) {
      case 'ep': playEp(g, t, e.midi, vel, e.dur); return;
      case 'pad': playPad(g, t, e.notes ?? [e.midi], vel, e.dur); return;
      case 'mallet': playMallet(g, g.music.mallet, t, e.midi, vel, areaMallet(a)); return;
      case 'arp': playArp(g, t, e.midi, vel, e.pan); return;
      case 'clank': playClank(g, t, e.midi, vel, e.pan); return;
      case 'bass': this.bass!.note(t, e.midi, vel, e.dur, true); return;
      default: playDrum(g, e.inst, t, vel, item.area);
    }
  }

  private applyArea(area: MusicArea, t: number): void {
    const g = this.g!, m = g.music, a = AREA_MUSIC[area];
    m.epLp.frequency.setTargetAtTime(a.epLp, t, 0.2);
    prioritize(`kit:${area}:`);                           // if the idle build is still going, this kit next
    m.chorusWet.gain.setTargetAtTime(a.chorus ? PAD_CHORUS_MIX : 0, t, 0.5);
    const echo = MALLET.echo.sixteenths * sixteenthSec(a.bpm);
    m.echo.delayTime.setTargetAtTime(echo, t, 0.08);
    g.fbEcho.delayTime.setTargetAtTime(echo, t, 0.08);
  }

  /** (Re)start the music with a needle drop at the next possible moment, continuing the song if it is the same area. */
  private resumeMusic(now: number, area: MusicArea, startBar: number): void {
    const g = this.g!, m = g.music;
    const t = Math.max(now + 0.06, this.stoppedUntil);
    this.q.length = 0; this.qi = 0; this.pending = null;
    if (this.song && this.song.area === area) {
      const s = this.song;
      s.clock = { ...s.clock, t0: t, bar0: s.bar + 1 };
      s.pivotBar = -1;
    } else this.beginSong(area, t, startBar);
    const sg = m.stop.gain;
    sg.cancelScheduledValues(now);
    sg.setValueAtTime(0, t);
    sg.linearRampToValueAtTime(1, t + 0.04);
    const f = m.formLp.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(TAPE_STOP.lpHz, t);
    f.exponentialRampToValueAtTime(BREAK_SWEEP.toHz, t + NEEDLE_DROP_SEC);
    this.layerOn = { drums: false, ghost: false, shaker: false, bass: false, ep: false, pad: false, melody: false, arp: false, clank: false };
    this.fadeIn = {};
    this.playing = true;
    this.stopped = false;
  }

  private cutAtBeat(area: MusicArea, startBar: number): void {
    const g = this.g!, s = this.song!;
    const now = g.ctx.currentTime;
    const beat = beatSec(s.clock.bpm);
    const into = (now + 0.05 - s.clock.t0) / beat;
    const t = s.clock.t0 + Math.ceil(into) * beat;
    this.dropQueueFrom(t);
    this.pending = null;
    this.beginSong(area, t, startBar);
  }

  // ── music API (AudioEngine.music) ─────────────────────────────────────────────────────────────────────────────
  start(area: MusicArea, seed?: number): void {
    if (area !== 'menu') this.runArea = area;
    const g = this.g;
    if (!g) return;
    this.song = null; this.stopped = true; this.stoppedUntil = 0;
    this.resumeMusic(g.ctx.currentTime, area, this.scene === 'run' ? START_A : 0);
    const song = this.song as Song | null;
    if (seed !== undefined && song) song.seed = seed >>> 0;
  }
  /** Gateway: one bar of the new key's V7 at the next bar line, then the new song at the following one, continuing the
   *  song form where the old song was. */
  setArea(area: AreaId, _gatewaySec: number): void {
    this.runArea = area;
    if (this.g && this.scene === 'run') this.amb?.setArea(area, this.g.ctx.currentTime);   // ambience crossfades over the gateway
    if (!this.g || !this.playing || !this.song || this.scene !== 'run') return;
    if (this.song.area === area || this.pending?.to === area || this.song.pivotTo === area) return;
    this.pending = { to: area, stage: 'pivot', startBar: CARRY_FORM };
  }
  setIntensity(level: number): void { this.levelBase = clampLevel(level); }
  setComboFilter(mult: number): void {
    this.mult = Math.max(1, mult);
    const g = this.g;
    if (!g) return;
    const C = COMBO_FILTER;
    const u = (Math.min(C.maxMult, Math.max(1, this.mult)) - 1) / (C.maxMult - 1);
    const f = this.scene === 'run' ? C.minHz * Math.pow(C.maxHz / C.minHz, u) : C.offRunHz;
    const p = g.music.comboLp.frequency;
    p.setTargetAtTime(f, g.ctx.currentTime, f >= p.value ? C.tauOpen : C.tauClose);
  }
  tapeStop(): void {
    const g = this.g;
    if (!g || !this.playing) return;
    const now = g.ctx.currentTime, m = g.music;
    this.playing = false; this.stopped = true;
    this.q.length = 0; this.qi = 0; this.pending = null;
    tapeStop(m.tape, now);
    const f = m.formLp.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(Math.max(TAPE_STOP.lpHz, Math.min(18000, f.value)), now);
    f.exponentialRampToValueAtTime(TAPE_STOP.lpHz, now + TAPE_STOP.sec);
    const sg = m.stop.gain;
    sg.cancelScheduledValues(now);
    sg.setValueAtTime(1, now);
    sg.linearRampToValueAtTime(TAPE_STOP.gainTo, now + TAPE_STOP.sec);
    sg.linearRampToValueAtTime(0, now + TAPE_STOP.sec + TAPE_STOP.outSec);
    this.bass?.silence(now + TAPE_STOP.sec);
    this.cue('needle', {}, now + TAPE_STOP.needleAt);
    tapeReset(m.tape, now + TAPE_STOP.sec + TAPE_STOP.outSec + 0.02);
    this.stoppedUntil = now + TAPE_STOP.sec + TAPE_STOP.outSec + 0.05;
  }
  duck(db: number, sec: number): void {
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime, p = g.music.duck.gain;
    const base = sceneGain(this.scene);
    p.setTargetAtTime(base * dbGain(-Math.abs(db)), now, DUCK_TAU);
    p.setTargetAtTime(base, now + Math.max(0.05, sec), 0.25);
  }
  stop(): void {
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime;
    this.playing = false; this.stopped = true;
    this.q.length = 0; this.qi = 0; this.pending = null;
    const sg = g.music.stop.gain;
    sg.cancelScheduledValues(now);
    sg.setTargetAtTime(0, now, 0.1);
    this.bass?.silence(now);
    this.stoppedUntil = now + 0.45;
  }
  clock(): { bpm: number; nextSixteenthAt: number } {
    const now = this.g?.ctx.currentTime ?? 0;
    const s = this.song;
    return { bpm: s?.clock.bpm ?? AREA_MUSIC[this.runArea].bpm, nextSixteenthAt: s && this.playing ? nextSixteenth(s.clock, now) : now };
  }

  // ── continuous layers ─────────────────────────────────────────────────────────────────────────────────────────
  roll(speed01: number, surface: Surface, airborne: boolean, manual: boolean): void {
    this.begin('roll');
    this.frame();
    if (this.g) {
      this.rollLoop!.update(this.g.ctx.currentTime, this.scene === 'run' ? speed01 : 0, surface, airborne, manual, this.tuneWhir);
      this.tick();
    }
    this.end();
  }
  grind(active: boolean, material: EdgeMaterial | null, slide: boolean): void {
    if (!this.g) return;
    this.begin('grind');
    this.grindLoop!.update(this.g.ctx.currentTime, active && this.scene === 'run', material, slide);
    this.end();
  }

  // ── one-shots and feedback ────────────────────────────────────────────────────────────────────────────────────
  private readonly tuneWhir = (hz: number): number => { const k = this.keyInfo(this.now()); return tuneHz(k.area, k.chord, hz); };
  /** The key and chord sounding at time t (for pitched one-shots). */
  keyInfo(t: number): KeyInfo {
    const s = this.song;
    if (!s || !this.playing) return { area: AREA_MUSIC[this.scene === 'run' ? this.runArea : s?.area ?? 'menu'], chord: null };
    const bar = barAt(s.clock, t);
    const keyArea = bar === s.pivotBar && s.pivotTo ? s.pivotTo : s.area;
    if (bar === s.pivotBar && s.pivot) return { area: AREA_MUSIC[keyArea], chord: s.pivot };
    const beat = Math.floor((t - barStart(s.clock, bar)) / beatSec(s.clock.bpm));
    const prog = progression(s.area, s.alt);
    return { area: AREA_MUSIC[keyArea], chord: chordAt(prog[((bar % 4) + 4) % 4]!, Math.max(0, Math.min(3, beat))) };
  }
  cue(id: Cue, o: CueOpts = {}, at?: number): void {
    const g = this.g;
    if (!g || (!this.sfxOn && !this.musicOn)) return;   // muted (the context is suspended): nothing piles up
    this.begin('cue', id);
    const t = Math.max(at ?? 0, g.ctx.currentTime);
    if (UI_CUES.has(id)) playUi(g, id, t, o, this.keyInfo(t));
    else playOneShot(g, id, t, o, this.keyInfo(t));
    this.end();
  }
  /** Musical feedback (§9): degree `seq` of the pentatonic, fitted to the chord, quantized to the next 16th ≤ 40 ms
   *  away, delayed by the tape latency so it lands with the beat the player hears. */
  note(seq: number, o: { gain?: number; degreeOffset?: number } = {}): void {
    const g = this.g;
    if (!g || !this.musicOn) return;                    // the feedback bus follows the music slider
    this.begin('note');
    const now = g.ctx.currentTime;
    const s = this.song;
    const t = (s && this.playing ? quantize(s.clock, now) : now) + (this.playing ? TAPE.delay : 0);
    const k = this.keyInfo(t);
    const midi = feedbackMidi(k.area, k.chord, seq + (o.degreeOffset ?? 0), FEEDBACK.octave, FEEDBACK.maxDegrees);
    playMallet(g, g.fb, t, midi, 1, { gain: o.gain ?? FEEDBACK.gain, decay: FEEDBACK.decay, pri: PRI.feedback });
    this.end();
  }
  /** Coin chime with the pentatonic climb: one degree per coin within 1.5 s (90 ticks) of the last, reset after a gap. */
  coin(tick: number, value: number): void {
    const within = tick > this.lastCoinTick && tick - this.lastCoinTick <= COIN.windowSec * 60;
    this.coinN = within ? Math.min(COIN.maxDegrees, this.coinN + 1) : 0;
    this.lastCoinTick = tick;
    this.cue('coin', { n: this.coinN, variant: value >= 10 ? 'big' : '' });
  }
  /** A new run: start area, speed level, combo filter and coin climb reset; the music comes back after a tape stop. */
  runStart(): void {
    this.runArea = 'downtown';
    this.levelBase = 1;
    this.lastCoinTick = -1e9; this.coinN = 0;
    this.setComboFilter(1);
    const g = this.g;
    if (!g || this.scene !== 'run') return;
    this.amb?.setArea(this.runArea, g.ctx.currentTime);
    if (this.stopped) this.resumeMusic(g.ctx.currentTime, this.runArea, START_A);
    else if (this.song && this.song.area !== this.runArea && this.song.area !== 'menu') this.cutAtBeat(this.runArea, START_A);
  }
  areaEnter(area: AreaId): void {
    if (this.song?.area === area && this.runArea === area) return;
    this.setArea(area, 0);
  }

  stats(): { voices: number; scene: string; intensity: number; playing: boolean; song: string; bar: number; bpm: number } {
    const g = this.g;
    return {
      voices: g ? g.voices.count(g.ctx.currentTime) : 0, scene: this.scene, intensity: this.applied, playing: this.playing,
      song: this.song?.area ?? 'none', bar: this.song?.bar ?? -1, bpm: this.song?.clock.bpm ?? 0,
    };
  }
  voiceStats(): { peak: number; stolen: number; dropped: number } {
    const v = this.g?.voices;
    return { peak: v?.peak ?? 0, stolen: v?.stolen ?? 0, dropped: v?.dropped ?? 0 };
  }
  now(): number { return this.g?.ctx.currentTime ?? 0; }
  /** Offline stems: mute buses (multiplies the user volumes). */
  stems: { music: boolean; sfx: boolean; amb: boolean; fb: boolean; vinyl: boolean } = { music: true, sfx: true, amb: true, fb: true, vinyl: true };
  /** Start area for the next song (offline renders set it before attach). */
  setRunArea(a: AreaId): void { this.runArea = a; }
  dispose(): void {
    const g = this.g;
    if (!g) return;
    try { g.out.disconnect(); } catch { /* gone */ }
    this.g = null;
  }
}

const PAD_CHORUS_MIX = PAD.chorus.mix;
/** Music level per scene: level 0 (no bass, muffled drums) is lifted on menus and results, a little less on pause. */
const sceneGain = (s: Scene) => dbGain(s === 'run' ? 0 : s === 'paused' ? INTENSITY.pauseDb : INTENSITY.menuDb);
function clamp01(x: number): number { return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 1; }
