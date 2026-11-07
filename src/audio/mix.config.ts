// audio/mix.config.ts: every audio tunable (DESIGN §19, §22). Buses, scheduler, BPMs, progressions, instrument and
// drum recipes, SFX levels. Numbers quoted from DESIGN §19 keep their names; `level` / `trim` values are the mix
// calibration measured by tests/unit/audio/render-check.mjs (offline renders, see docs/core-requests.md § AU).
import type { AreaId, EdgeMaterial, Surface } from '../core/ids';

export type MusicArea = AreaId | 'menu';

// ── Buses and master (§19.2) ──────────────────────────────────────────────────────────────────────────────────────
/** Bus gains before the user sliders. music + feedback follow the Music slider, sfx + ambience the SFX slider. */
export const BUS = { music: 0.55, sfx: 0.8, ambience: 0.25, feedback: 0.5 } as const;
/** Master glue compressor (§19.1 "Master") then a brick-wall-ish limiter, so a pile-up never clips. */
export const MASTER = {
  comp: { threshold: -14, ratio: 3, knee: 10, attack: 0.012, release: 0.25 },
  limiter: { threshold: -4, ratio: 20, knee: 0, attack: 0.001, release: 0.09 },
  /** Input trim before the compressor (gain staging) and the final output gain. */
  trim: 0.7, out: 0.9,
  /** DC blocker / sub-rumble high-pass at the master input (FM electric piano 1:1 ratio makes DC). */
  dcHz: 22,
} as const;
/** Music-bus EQ: a gentle dip in the 200–400 Hz "mud" band where EP, pad, snare body and the bass octave overlap. */
export const MUD_CUT = { hz: 260, q: 0.8, db: -4.5 } as const;
/** Slider value v ∈ [0, 1] → gain v^curve (perceptual). */
export const SLIDER_CURVE = 2;
export const VOICE_CAP = 32;
/** Per one-shot random variation from a non-sim RNG (§19.2). */
export const VARIATION = { pitch: 0.03, db: 1.5 } as const;

// ── Scheduler and groove (§19.1) ──────────────────────────────────────────────────────────────────────────────────
export const SCHED = {
  lookahead: 0.12,          // s ahead on the AudioContext clock
  tickMs: 25,               // timer period (also ticked from every rendered frame)
  stepsPerBar: 16,
  swing: 0.58,              // 58%: odd 16ths are delayed by (0.58 − 0.5) · 0.5 beat = 0.04 beat
  humanizeSec: 0.008,       // ±8 ms
  humanizeVel: 0.10,        // ±10%
  lateDrop: 0.05,           // an event more than 50 ms late (stalled main thread) is dropped, never bunched
  resyncAfter: 0.5,         // the song clock jumps forward if the scheduler fell this far behind
} as const;
/** Pre-rendered sample buffers (noise loops, vinyl, drum kits, joint ticks; audio/bank.ts): built at boot, before any
 *  gesture, in idle time, so the unlocking tap only creates nodes. Fixed rate (buffer sources resample to the context). */
export const PREP = {
  sr: 48000,
  chunk: 1024,              // samples of sample math between yield points (≈ 0.1–0.6 ms on a phone)
  idleMs: 4,                // at most this much work per idle callback (setTimeout fallback where there is no rIC)
  timeoutMs: 1500,          // requestIdleCallback timeout: a busy boot still makes progress
} as const;
/** Feedback / quantized notes snap to the next 16th only if it is at most this far away (§9). */
export const QUANTIZE_MAX = 0.04;

// ── Song form (§19.1) ─────────────────────────────────────────────────────────────────────────────────────────────
export type Section = 'intro' | 'A' | 'B' | 'A2' | 'break' | 'A3';
export const FORM: readonly { s: Section; bars: number }[] = [
  { s: 'intro', bars: 4 }, { s: 'A', bars: 16 }, { s: 'B', bars: 8 }, { s: 'A2', bars: 16 }, { s: 'break', bars: 4 }, { s: 'A3', bars: 16 },
];
export const FORM_BARS = FORM.reduce((a, f) => a + f.bars, 0);   // 64
export const FILL = { phraseBars: 4, chance: 0.5, rollChance: 0.5 } as const;   // bar 4 of each phrase: roll or kick drop
export const BREAK_SWEEP = { fromHz: 600, toHz: 18000 } as const;
export const INTRO_DRUM_LP = 1200;

// ── Intensity (§19.1) ─────────────────────────────────────────────────────────────────────────────────────────────
export const INTENSITY = {
  fadeBeats: 1,
  flowTier: 2,              // speed tier ≥ 2 (9.0 m/s) → level 2
  comboL2: 3, comboL3: 6,   // combo ×3 → level 2, ×6 → level 3
  drumLp: [1200, 9000, 9000, 12000] as const,    // per level (0 = muffled)
  drumGain: [0.32, 1, 1, 1] as const,  // level 0: × the menu lift (+10 dB) ≈ the run's drum level, never above
  padLpBoost: 600,          // level 3
  sceneFade: 0.35,          // pause / menu: the level-0 muffle is applied at once, not at the bar line
  sceneLift: 1.2,           // ... and the scene lift below comes in over this (s, ~95%), after the layers have gone
  menuDb: 10, pauseDb: 4,    // level 0 lacks bass and bright drums: lifted on menus / results, less on pause (net: the
                            // pause sits ~6 dB under the run, menus close to it)
} as const;
/** Combo filter (§19.1): low-pass on the harmonic bus (EP, pad, melody, arp; drums and bass stay crisp).
 *  800 Hz at ×1 → 8 kHz at ×10+, exponential. Off the run screen it rests at `offRunHz`. */
export const COMBO_FILTER = { minHz: 800, maxHz: 8000, maxMult: 10, offRunHz: 7000, q: 0.5, tauOpen: 0.12, tauClose: 0.9 } as const;

// ── Lo-fi chain (§19.1) ───────────────────────────────────────────────────────────────────────────────────────────
export const TAPE = { delay: 0.012, wowHz: 0.5, wowDepth: 0.0015, flutterHz: 6, flutterDepth: 0.0002, drive: 1.4, lpHz: 7500 } as const;
export const TAPE_STOP = { sec: 0.5, lpHz: 400, pitchTo: 0.3, gainTo: 0.3, wowMul: 4, outSec: 0.1, needleAt: 0.56 } as const;
/** After a tape stop the music comes back with a needle drop: low-pass from 400 Hz open over this time. */
export const NEEDLE_DROP_SEC = 0.45;
export const VINYL = { sec: 4, hissHz: 3000, hissQ: 0.7, hissGain: 0.012, popsPerSec: 6, popHpHz: 1000, popAmp: [0.04, 0.16] as const, level: 1 } as const;
export const SIDECHAIN = { depth: 0.55, attack: 0.01, tau: 0.07 } as const;
export const DUCK_TAU = 0.04;

// ── Drums (§19.1) ─────────────────────────────────────────────────────────────────────────────────────────────────
export const DRUM_BUS_LP = 9000;
export const KICK = { f0: 120, f1: 45, sweep: 0.12, attack: 0.002, decay: 0.35, gain: 1.0, clickMs: 3, clickHp: 2000, clickGain: 0.2 } as const;
export const SNARE = { bpHz: 1800, bpQ: 0.8, decay: 0.18, gain: 0.7, toneHz: 185, toneDecay: 0.08, toneGain: 0.4 } as const;
export const RIM = { bpHz: 3500, bpQ: 1.2, decay: 0.03, gain: 0.5 } as const;
export const BRUSH = { bpHz: 1500, bpQ: 0.6, attack: 0.012, decay: 0.3, gain: 0.5 } as const;
export const HATS = { hpHz: 7000, closed: 0.04, open: 0.25, velLo: 0.3, velHi: 0.5, ghostVel: [0.14, 0.24] as const, gain: 0.5 } as const;
export const SHAKER = { bpHz: 5000, bpQ: 1.0, decay: 0.06, gain: 0.08 } as const;
export const CLAP = { bpHz: 1300, bpQ: 1.0, bursts: 3, spacing: 0.009, tail: 0.12, gain: 0.32 } as const;
export const METAL_RING = { f: [540, 800] as const, decay: 0.06, gain: 0.05 } as const;
/** Drum bus trim (calibration). */
export const DRUM_LEVEL = 0.62;

// ── Instruments (§19.1) ───────────────────────────────────────────────────────────────────────────────────────────
export const EP = {
  modRatio: 1, index0: 1.6, index1: 0.3, indexSec: 0.8, tineRatio: 14, tineIndex: 0.4, tineSec: 0.05,
  a: 0.005, d: 1.6, s: 0.25, r: 0.6, tremHz: 4.5, tremDepth: 0.12, pan: 0.3, lpHz: 2800, lpNeonHz: 4000,
  strumMs: [12, 25] as const, gain: 0.16, hpHz: 120,
  /** Comping rhythms (16th steps) with weights; [0, 6] = beat 1 and the "and" of 2 (§19.1). */
  comps: [[[0, 6], 5], [[0, 6, 10], 2], [[0, 10], 2], [[0, 6, 14], 1]] as readonly (readonly [readonly number[], number])[],
  splitComp: [0, 8] as const,     // bars with two chords
} as const;
export const BASS = { triGain: 0.3, drive: 1.7, lpHz: 600, a: 0.008, d: 0.4, s: 0.6, r: 0.12, glide: 0.03, approachChance: 0.3,
  fifthChance: 0.6, gain: 0.42 } as const;
export const PAD = { detuneCents: 7, lpHz: 900, lfoHz: 0.07, lfoDepth: 300, a: 1.2, r: 2.0, gain: 0.1, octave: 12,
  bSectionDb: 4, chorus: { delay: 0.015, depth: 0.003, hz: 0.8, mix: 0.5 } } as const;
export const MALLET = { partial: 4, partialGain: 0.25, partialSec: 0.12, decay: 0.7, gain: 0.2,
  restChance: 0.35, mutate: 0.25, lo: 67, hi: 84,
  echo: { sixteenths: 3, feedback: 0.3, lpHz: 2500, send: 0.35 } } as const;
export const PLUCKY = { decay: 0.35, partialGain: 0.4 } as const;    // Suburbs mallet
export const ARP = { decay: 0.09, gain: 0.06, octave: 12, pan: 0.25 } as const;
export const CLANK = { ratio: 1.41, index: 3, sec: 0.35, gain: 0.05, chance: 0.45 } as const;   // Docks off-beat FM clanks

// ── Areas (§19.1 progressions + per-area variations) ──────────────────────────────────────────────────────────────
export interface ChordSpec { name: string; bass: number; voicing: readonly number[]; beats: number }
export interface AreaMusic {
  /** Pitch class of the tonic and the mode; minor keys use the relative major's pentatonic (§9). */
  tonic: number; mode: 'major' | 'minor'; bpm: number;
  /** 4 bars; a bar is one chord (4 beats) or two chords of 2 beats. */
  bars: readonly (readonly ChordSpec[])[];
  patterns: { main: PatternId; alt: PatternId };
  kick: { f0: number; decay: number };
  snare: 'classic' | 'brush' | 'metal';
  ghost: 'rim' | 'snare';
  hats: { hpHz: number; closed: number };
  clap: boolean;
  epLp: number;
  mallet: 'mallet' | 'plucky';
  chorus: boolean;
  clanks: boolean;
  /** Level from which the triangle arp plays (Neon brings it in early). */
  arpLevel: 2 | 3;
  ambience: 'plaza' | 'suburb' | 'harbor' | 'city' | 'none';
  /** Road surface used by renderOffline's plateau-speed roll bed. */
  demoSurface: Surface;
  /** Music-bus mud dip (dB at MUD_CUT.hz) when it differs from MUD_CUT.db: deeper for the close, low voicings
   *  (Neon's F♯3–D4 Gmaj9, Docks) and the bass-less menu. */
  mudDb?: number;
  /** Level-0 drum gain when it differs from INTENSITY.drumGain[0] (the menu song's soft kit is meant to be heard). */
  level0Drums?: number;
}
export type PatternId = 'A' | 'B' | 'C';
const c = (name: string, bass: number, voicing: readonly number[], beats = 4): ChordSpec => ({ name, bass, voicing, beats });

export const AREA_MUSIC: Readonly<Record<MusicArea, AreaMusic>> = {
  downtown: {
    tonic: 5, mode: 'major', bpm: 84,
    bars: [[c('Gm9', 43, [58, 62, 65, 69])], [c('C9', 48, [58, 62, 64, 67])], [c('Fmaj9', 41, [57, 60, 64, 67])], [c('Dm9', 38, [53, 57, 60, 64])]],
    patterns: { main: 'A', alt: 'B' }, kick: { f0: 120, decay: 0.35 }, snare: 'classic', ghost: 'rim',
    hats: { hpHz: 7000, closed: 0.04 }, clap: false, epLp: 2800, mallet: 'mallet', chorus: false, clanks: false, arpLevel: 3,
    ambience: 'plaza', demoSurface: 'asphalt',
  },
  suburbs: {
    tonic: 9, mode: 'minor', bpm: 80,
    bars: [[c('Fmaj7', 41, [57, 60, 64, 67])], [c('E7b9', 40, [56, 59, 62, 65])], [c('Am9', 45, [55, 59, 60, 64])],
      [c('Gm9', 43, [58, 62, 65, 69], 2), c('C9', 48, [58, 62, 64, 67], 2)]],
    patterns: { main: 'B', alt: 'C' }, kick: { f0: 120, decay: 0.25 }, snare: 'brush', ghost: 'snare',
    hats: { hpHz: 7000, closed: 0.04 }, clap: false, epLp: 2800, mallet: 'plucky', chorus: false, clanks: false, arpLevel: 3,
    ambience: 'suburb', demoSurface: 'asphalt',
  },
  docks: {
    tonic: 0, mode: 'minor', bpm: 78,
    bars: [[c('Cm9', 36, [51, 55, 58, 62])], [c('Abmaj9', 44, [60, 63, 67, 70])], [c('Fm9', 41, [56, 60, 63, 67])], [c('G7alt', 43, [53, 59, 63, 70])]],
    patterns: { main: 'A', alt: 'C' }, kick: { f0: 140, decay: 0.35 }, snare: 'metal', ghost: 'snare',
    hats: { hpHz: 7000, closed: 0.04 }, clap: false, epLp: 2800, mallet: 'mallet', chorus: false, clanks: true, arpLevel: 3,
    ambience: 'harbor', demoSurface: 'concrete', mudDb: -5.5,
  },
  neon: {
    tonic: 2, mode: 'major', bpm: 88,
    bars: [[c('Gmaj9', 43, [54, 57, 59, 62])], [c('A13', 45, [55, 59, 61, 66])], [c('F#m7', 42, [52, 57, 61, 64])], [c('Bm9', 47, [57, 61, 62, 66])]],
    patterns: { main: 'A', alt: 'B' }, kick: { f0: 120, decay: 0.3 }, snare: 'classic', ghost: 'snare',
    hats: { hpHz: 8500, closed: 0.03 }, clap: true, epLp: 4000, mallet: 'mallet', chorus: true, clanks: false, arpLevel: 2,
    ambience: 'city', demoSurface: 'wetAsphalt', mudDb: -6.5,
  },
  menu: {
    tonic: 3, mode: 'major', bpm: 76,
    // Voiced above the mud (G3–F4) with G as a common tone: Ebmaj9 (3 5 7 9) – Cm9 (5 b7 9 b3) – Fm9 (9 b3 5 b7)
    // – Bb13 (13 b7 9 3), the top voice falling F – Eb – Eb – D back to F.
    bars: [[c('Ebmaj9', 39, [55, 58, 62, 65])], [c('Cm9', 36, [55, 58, 62, 63])], [c('Fm9', 41, [55, 56, 60, 63])], [c('Bb13', 46, [55, 56, 60, 62])]],
    patterns: { main: 'B', alt: 'C' }, kick: { f0: 110, decay: 0.3 }, snare: 'brush', ghost: 'snare',
    hats: { hpHz: 7000, closed: 0.04 }, clap: false, epLp: 2800, mallet: 'mallet', chorus: false, clanks: false, arpLevel: 3,
    ambience: 'none', demoSurface: 'asphalt', mudDb: -6.5, level0Drums: 0.5,
  },
};
/** EP voicing range for the alternate (voice-led) set used by every 2nd song. */
export const VOICING_RANGE = { lo: 50, hi: 76 } as const;
/** The gateway out of each area leads into the next one (DESIGN §12.1). */
export const GATEWAY_TO = { greenway: 'suburbs', levelCrossing: 'docks', harborBridge: 'neon', underpass: 'downtown' } as const;

// ── Musical feedback, coins (§9, §19.3) ───────────────────────────────────────────────────────────────────────────
export const FEEDBACK = { octave: 4, maxDegrees: 10, gain: 0.32, decay: 0.55, graceGain: 0.16 } as const;
export const COIN = { octave: 5, maxDegrees: 10, windowSec: 1.5, decay: 0.18, partialGain: 0.3, fifthGain: 0.6, fifthDelay: 0.06,
  gain: 0.22, bigGain: 0.28, highRolloffDbPerOct: 3 } as const;

// ── Continuous layers (§19.3) ─────────────────────────────────────────────────────────────────────────────────────
export interface SurfaceRoll { q: number; gain: number; rumble: number; joint: number | null; thumpHz: number;
  ring: number; hiss: number; lpHz: number; woodRes: number }
const sr = (o: Partial<SurfaceRoll>): SurfaceRoll => ({ q: 0.5, gain: 1, rumble: 0.6, joint: null, thumpHz: 90, ring: 0, hiss: 0, lpHz: 18000, woodRes: 0, ...o });
export const ROLL = {
  bpBase: 300, bpSpan: 900, gainLo: 0.05, gainHi: 0.12, rumbleLp: 180, level: 0.32,
  airFade: 0.04, whirHz: 900, whirGain: 0.035, whirFade: 0.4, manualGain: 0.8, manualBp: 1.15,
  jointGain: 0.5, jointMs: 8, jointHp: 1500, tau: 0.05,
  surfaces: {
    asphalt: sr({ q: 0.5, rumble: 0.6 }),
    wetAsphalt: sr({ q: 0.5, rumble: 0.6, hiss: 0.3 }),
    concrete: sr({ q: 1.2, gain: 0.7, joint: 1.5 }),
    tile: sr({ q: 1.2, gain: 0.7, joint: 1.5 }),
    granite: sr({ q: 1.2, gain: 0.7, joint: 1.2 }),
    wood: sr({ q: 1.2, gain: 0.8, joint: 0.3, thumpHz: 140, woodRes: 0.5 }),
    metal: sr({ q: 1.0, gain: 0.8, ring: 0.5 }),
    grass: sr({ q: 0.5, gain: 0.5, rumble: 0.4, lpHz: 800 }),
  } satisfies Record<Surface, SurfaceRoll>,
} as const;
export const WIND = { bpHz: 600, q: 0.7, fromMs: 8.0, fullMs: 10.5, gain: 0.04, panHz: 0.05, pan: 0.5, level: 1.2 } as const;
export const GRIND_LOOP = {
  level: 0.5, attack: 0.012, release: 0.06,
  metal: { bp: [[2100, 12], [3400, 10], [5600, 8]] as const, makeup: 6, gritHz: 95, gritLp: 1200, gritGain: 0.1, driftHz: 3, driftCents: 85, gain: 0.35 },
  concrete: { bpHz: 900, q: 0.8, lpHz: 2000, amHz: 20, gain: 0.3 },
  wood: { bpHz: 600, q: 1.5, comb: 0.004, fb: 0.5, creakHz: 220, gain: 0.3 },
  neon: { humHz: 60, humBp: 120, humQ: 4, humGain: 0.05 },
  slide: { bpHz: 500, q: 1, mix: 0.5 },
} satisfies Record<string, unknown>;
export const GRIND_MATERIAL: Readonly<Record<EdgeMaterial, 'metal' | 'concrete' | 'wood' | 'neon'>> =
  { metal: 'metal', neon: 'neon', concrete: 'concrete', stone: 'concrete', wood: 'wood' };

// ── One-shot levels (relative, before the SFX bus; calibrated so every one-shot sits under the music) ─────────────
export const SFX_LEVEL = {
  pop: 0.55, whoosh: 1.3, catch: 0.6, land: 0.6, sketchy: 0.45, perfect: 0.42, perfectLock: 0.22, stair: 0.7,
  bump: 0.7, knock: 0.55, nearMiss: 1.1, hazardTick: 0.9, crash: 0.34, grindEntry: 0.45, grindExit: 0.8,
  spin: 1.6, revert: 1.5, pickChime: 0.22, rewind: 0.55, needle: 0.45, newBest: 0.22, newArea: 0.18, birdFlutter: 0.5, reverseChirp: 1,
  ui: 1.8, purchase: 1.1, crate: 0.5, crateOpen: 0.9, reveal: 0.26, levelUp: 0.3, dive: 0.5,
} as const;
/** The Title → run dive (1.45 s): a rising band-pass whoosh that peaks as the camera breaks through the clouds, and a
 *  soft pad swell on the key's Maj9 under it, released as the run begins. */
export const DIVE_CUE = { sec: 1.45, whooshHz: [260, 3400] as const, padAttack: 0.85, padRelease: 0.7, padGain: 0.07, padLpHz: [500, 2600] as const } as const;
export const LEVEL_UP = { noteMs: 70, holdSec: 1.2, shimmerHz: 6000, shimmerSec: 0.6, duckDb: 3, duckSec: 1.6, epGain: 0.5 } as const;
export const COMBO_BANK = { noteMs: 50, gain: 0.26 } as const;

// ── Ambience (§19.1 per-area signatures; RECLAIM theme §8: no traffic anywhere, calm beds under the music) ─────────
/** Gains are the bed's own (before the ambience bus 0.25); `every` ranges are seconds between seeded events. */
export const AMBIENCE = {
  fade: 2.5, level: 1,
  /** Downtown "the quiet plaza": wind, a faint fountain trickle; leaf rustles, wood-pigeon coos, pigeon flutters. */
  plaza: { windBp: 500, windGain: 0.05, windLfoHz: 0.07, fountainBp: 1800, fountainGain: 0.02, leafEvery: [4, 10] as const,
    cooEvery: [12, 30] as const, coo: [450, 380] as const, pigeonEvery: [9, 22] as const },
  /** Suburbs "wildflower lanes": wind in grass, a cricket bed rising toward late gold; birds, a far woodpecker, a chime. */
  suburb: { birdEvery: [2, 6] as const, grassBp: 800, grassGain: 0.04, cricketHz: 4200, cricketAmHz: 30, cricketGain: 0.015,
    cricketRiseSec: 90, woodpeckerEvery: [40, 90] as const, woodpeckerHz: 16, woodpeckerBp: 1200, chimeEvery: [20, 45] as const },
  /** Docks "the seagrass harbor": lapping water and gulls; a buoy bell (FM 3.5), moored-boat knocks, halyard clinks, a chime. */
  harbor: { waterBp: 420, waterGain: 0.1, gullEvery: [9, 24] as const, bellEvery: [25, 50] as const, bellRatio: 3.5,
    knockEvery: [15, 35] as const, knockHz: 220, clinkEvery: [6, 14] as const, chimeEvery: [30, 60] as const },
  /** Neon "the night-owl lights": the live signs' hum, vending buzz, after-rain drips in key, a softer, rarer maglev. */
  city: { humGain: 0.03, buzzEvery: [10, 25] as const, dripEvery: [1, 4] as const, maglevEvery: [40, 80] as const, maglevGain: 0.14 },
  /** Gateway moments (≈ 4.5 s over the crossfade): Greenway meadow wind and bees, Level Crossing grass wind and the
   *  signal box's chime, Harbor Bridge gulls and wind, Underpass drips with a 0.4 s echo. */
  gateway: { sec: 4.5, echoSec: 0.4, echoFeedback: 0.35 },
} as const;
/** Crashes into these kinds add the hollow body-panel thunk (theme §8: cars, vans, the helper machines, containers and
 *  the box trucks and buses they become). No glass and no alarms. */
export const THUNK_KINDS: ReadonlySet<string> = new Set(['parked_car', 'parked_van', 'crosswalk_car', 'backout_car', 'forklift', 'container', 'van_across']);
export const THUNK = { hz: 110, toHz: 82, sec: 0.12, gain: 0.85 } as const;
/** Bird flutter (perched birds take off): noise bursts with 12 Hz AM over 0.35 s. Reversing chirp (`backout_car` while
 *  it moves): sine near 1.1 kHz in key, 80 ms, every 0.6 s, gain 0.04. */
export const FLUTTER = { amHz: 12, sec: 0.35, bp: 1400 } as const;
export const REVERSE_CHIRP = { hz: 1100, sec: 0.08, every: 0.6, gain: 0.04 } as const;
