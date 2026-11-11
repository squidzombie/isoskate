// audio/music/patterns.ts: the three drum patterns of DESIGN §19.1 (K kick, S snare, H hat; x hit, g ghost, . rest),
// 16 steps per bar. Parsed once; the sequencer adds ghost 16ths, the open hat, fills and per-area layers on top.
import type { PatternId } from '../mix.config';

export interface PatternRows { K: string; S: string; H: string }
export const PATTERN_ROWS: Readonly<Record<PatternId, PatternRows>> = {
  A: { K: 'x......x..x.....', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.' },   // boom-bap
  B: { K: 'x........x.x....', S: '....x.......x..g', H: 'x.xgx.x.x.xgx.x.' },   // lazy
  C: { K: 'x.........x.....', S: '........x.......', H: 'x...x...x...x...' },   // half-time
};

export type HitKind = 'x' | 'g';
export interface Hit { step: number; kind: HitKind }
export interface Pattern { K: readonly Hit[]; S: readonly Hit[]; H: readonly Hit[] }

export function parseRow(row: string): Hit[] {
  if (row.length !== 16) throw new Error(`pattern row must have 16 steps: '${row}'`);
  const out: Hit[] = [];
  for (let i = 0; i < 16; i++) {
    const ch = row[i];
    if (ch === 'x' || ch === 'g') out.push({ step: i, kind: ch });
    else if (ch !== '.') throw new Error(`bad pattern symbol '${ch}'`);
  }
  return out;
}

const parse = (r: PatternRows): Pattern => ({ K: parseRow(r.K), S: parseRow(r.S), H: parseRow(r.H) });
export const PATTERNS: Readonly<Record<PatternId, Pattern>> = { A: parse(PATTERN_ROWS.A), B: parse(PATTERN_ROWS.B), C: parse(PATTERN_ROWS.C) };
