// world/gen/generator.ts: M0 stub generator. Flat Downtown street, a handful of grey-box templates, coins,
// SafeKeys and a little decor, in the exact data shapes of core/world.ts.
// TODO(M0-sim): real templates (Roll-out, S_OPEN, S_BARRIER, S_TRENCH, S_GATE, DT_LEDGE, DT_BENCHES), the simple
// validator (height bands, R_MIN along SafeKeys, A3), coin rules. TODO(WG): everything in TECH §5.
import type { AreaId } from '../../core/ids';
import { round1cm } from '../../core/math';
import { Sfc32, streamSeed } from '../../core/rng';
import { CHUNK_LEN, ROLLOUT_SEC, sAt, speedAt, tAt } from '../../core/tuning';
import type { Chunk, Coin, Decor, GenStats, GrindEdge, Obstacle, SafeKey, Segment, WorldGen, WorldGenConfig } from '../../core/world';
import { ObTag } from '../../core/world';
import { areaAtTime } from './areas';
import { buildCurb, buildProp, type IdCounters } from './props';

type TemplateId = 'ROLLOUT' | 'S_OPEN' | 'S_BARRIER' | 'S_GATE' | 'DT_LEDGE' | 'DT_BENCHES';
const TEMPLATE_SEC: Readonly<Record<TemplateId, number>> = {
  ROLLOUT: ROLLOUT_SEC, S_OPEN: 3, S_BARRIER: 1.8, S_GATE: 1.5, DT_LEDGE: 2.5, DT_BENCHES: 2.5,
};
const BARRIER_EVERY_SEC = 12;            // A3 stand-in: a full-width hazard at least every 12 s

/** Internal state shared with world/gen/query.ts (not part of the contract). */
export interface GenInternals {
  obstacleById: Map<number, Obstacle>;
  edgeById: Map<number, GrindEdge>;
}
export const GEN_INTERNALS = new WeakMap<WorldGen, GenInternals>();

interface Out { obstacles: Obstacle[]; coins: Coin[]; decor: Decor[]; safe: SafeKey[] }

export class StubWorldGen implements WorldGen {
  readonly seed: number;
  readonly mode: 'lesson' | 'normal';
  private readonly startT: number;
  private readonly startArea: AreaId;
  private readonly segs: Segment[] = [];
  private readonly chunks = new Map<number, Chunk>();
  private released = -1;                  // chunks with index < released+1 are gone for good
  private t: number;                      // generation cursor (run time)
  private s: number;
  private segIndex = 0;
  private lastBarrierT: number;
  private safeX = 0;
  private readonly ids: IdCounters = { ob: 0, coin: 0, edge: 0 };
  private coinsTotal = 0;
  private coinsTrick = 0;
  readonly internals: GenInternals = { obstacleById: new Map(), edgeById: new Map() };

  constructor(cfg: WorldGenConfig) {
    this.seed = cfg.seed >>> 0;
    this.mode = cfg.mode;
    this.startT = cfg.startT ?? 0;
    this.startArea = cfg.startArea ?? 'downtown';
    this.t = this.startT;
    this.s = sAt(this.startT);
    this.lastBarrierT = this.startT;
    GEN_INTERNALS.set(this, this.internals);
  }

  /** Coverage: the s up to which segments exist. */
  get coverage(): number { return this.s; }

  ensure(sAhead: number, maxSegments = Infinity): boolean {
    let n = 0;
    while (this.s < sAhead && n < maxSegments) { this.generateSegment(); n++; }
    return this.s >= sAhead;
  }

  chunk(i: number): Chunk {
    if (i > this.released) {
      const end = (i + 1) * CHUNK_LEN;
      while (this.s < end) this.generateSegment();
    }
    return this.bucket(i);
  }

  release(beforeIndex: number): void {
    for (const [i, c] of this.chunks) {
      if (i >= beforeIndex) continue;
      for (const ob of c.obstacles) {
        if (ob.s + ob.len < beforeIndex * CHUNK_LEN) {
          this.internals.obstacleById.delete(ob.id);
          for (const e of ob.edges) this.internals.edgeById.delete(e.id);
        }
      }
      this.chunks.delete(i);
    }
    this.released = Math.max(this.released, beforeIndex - 1);
    while (this.segs.length > 1 && this.segs[0]!.s1 < beforeIndex * CHUNK_LEN) this.segs.shift();
  }

  segments(): readonly Segment[] { return this.segs; }

  areaAt(s: number) {
    const a = areaAtTime(tAt(s), this.startArea);
    return { area: a.area, blend: a.blend, gateway: a.gateway, first: a.first };
  }

  stats(): GenStats {
    return {
      segments: this.segIndex, rerolls: 0, fallbacks: 0, rejections: {},
      trickCoinShare: this.coinsTotal ? this.coinsTrick / this.coinsTotal : 1, msPerSegment: 0,
    };
  }

  // ── internals ────────────────────────────────────────────────────────────────────────────────────────────────

  private bucket(i: number): Chunk {
    let c = this.chunks.get(i);
    if (!c) {
      const s0 = i * CHUNK_LEN;
      const a = this.areaAt(s0 + CHUNK_LEN / 2);
      c = { index: i, s0, len: CHUNK_LEN, area: a.area, blend: a.blend, obstacles: [], coins: [], decor: [], safe: [], segments: [] };
      this.chunks.set(i, c);
    }
    return c;
  }

  private pickTemplate(index: number, rng: Sfc32): TemplateId {
    if (index === 0 && this.startT === 0) return 'ROLLOUT';
    if (this.t - this.lastBarrierT >= BARRIER_EVERY_SEC - 2) return 'S_BARRIER';
    return rng.weighted<TemplateId>([['S_OPEN', 1], ['S_GATE', 2], ['DT_LEDGE', 3], ['DT_BENCHES', 2], ['S_BARRIER', 1]]);
  }

  private generateSegment(): void {
    const index = this.segIndex++;
    const rng = new Sfc32(streamSeed(this.seed, index, 'layout'));
    const coinRng = new Sfc32(streamSeed(this.seed, index, 'coins'));
    const decorRng = new Sfc32(streamSeed(this.seed, index, 'decor'));
    const templateId = this.pickTemplate(index, rng);
    const t0 = this.t, t1 = t0 + TEMPLATE_SEC[templateId];
    const s0 = this.s, s1 = sAt(t1);
    const area = this.areaAt(s0).area;
    const out: Out = { obstacles: [], coins: [], decor: [], safe: [] };
    const at = (tau: number) => sAt(t0 + tau);           // template element time → s
    const v = speedAt(t0);

    out.obstacles.push(buildCurb(-1, s0, s1, area, index, this.ids), buildCurb(1, s0, s1, area, index, this.ids));

    switch (templateId) {
      case 'ROLLOUT': {
        // Coin S-curve 0–3 s, full-width low chain at 3.5 s, granite ledge at x = +2 from 6 s (DESIGN §12.4).
        for (let k = 0; k < 8; k++) this.coin(out, at(0.6 + k * 0.3), 1.6 * Math.sin(k * 0.8), 0.6, 'breather');
        this.barrier(out, area, index, at(3.5), 0.35, v);
        const ledge = buildProp({ kind: 'granite_ledge', area, segment: index, s: at(6), x: 2, len: at(8.6) - at(6), wid: 0.6,
          hgt: 0.45, tags: ObTag.TrickLine, edges: [{ side: -1, kind: 'ledge', material: 'stone' }, { side: 1, kind: 'ledge', material: 'stone' }] }, this.ids);
        out.obstacles.push(ledge);
        this.coinString(out, ledge.s + 1, ledge.s + ledge.len - 0.5, 2, 0.45 + 0.35, v);
        this.safeKeys(out, t0, t1, -1.5);
        break;
      }
      case 'S_OPEN': {
        for (let k = 0; k < 6; k++) this.coin(out, at(0.5 + k * 0.35), 2 * Math.sin(k * 0.9 + coinRng.float() * 6), 0.6, 'breather');
        this.safeKeys(out, t0, t1, this.safeX);
        break;
      }
      case 'S_BARRIER': {
        this.barrier(out, area, index, at(0.9), 0.5, v);
        this.safeKeys(out, t0, t1, this.safeX);
        break;
      }
      case 'S_GATE': {
        // A row of tall bins with one ~2.4 m opening 1.5–3 m sideways from the previous safe x (a forced wander).
        const off = rng.range(1.5, 3) * (rng.chance(0.5) ? -1 : 1);
        let gapX = this.safeX + off;
        if (gapX > 3 || gapX < -3) gapX = this.safeX - off;
        gapX = round1cm(Math.max(-3, Math.min(3, gapX)));
        const sRow = at(0.75);
        for (let x = -4.2; x <= 4.21; x += 0.7) {
          if (Math.abs(x - gapX) < 1.2 + 0.35) continue;
          out.obstacles.push(buildProp({ kind: 'trash_can', area, segment: index, s: sRow, x, len: 0.6, wid: 0.6, hgt: 1.15,
            ground: Math.abs(x) > 3 ? 0.15 : 0 }, this.ids));
        }
        this.safeX = gapX;
        this.safeKeys(out, t0, t1, gapX);
        break;
      }
      case 'DT_LEDGE': {
        const side = rng.chance(0.5) ? -1 : 1;
        const x = side * round1cm(rng.range(1.8, 2.4));
        const len = round1cm(v * rng.range(1.2, 2.0));
        const ledge = buildProp({ kind: 'granite_ledge', area, segment: index, s: at(0.4), x, len, wid: 0.6, hgt: 0.45,
          tags: ObTag.TrickLine, edges: [{ side: -1, kind: 'ledge', material: 'stone' }, { side: 1, kind: 'ledge', material: 'stone' }] }, this.ids);
        out.obstacles.push(ledge);
        out.obstacles.push(buildProp({ kind: 'parked_car', area, segment: index, s: at(1.2), x: -side * 2.5, len: 4.4, wid: 1.8, hgt: 1.4 }, this.ids));
        this.coinString(out, ledge.s + 0.5, ledge.s + ledge.len - 0.5, x, 0.45 + 0.35, v);
        this.safeX = -side * 0.5;
        this.safeKeys(out, t0, t1, this.safeX);
        break;
      }
      case 'DT_BENCHES': {
        const side = rng.chance(0.5) ? -1 : 1;
        const x = side * 2.2;
        for (let k = 0; k < 3; k++) {
          out.obstacles.push(buildProp({ kind: 'bench', area, segment: index, s: at(0.5 + k * 0.6), x, len: 2.0, wid: 0.5, hgt: 0.45,
            tags: ObTag.TrickLine, edges: [{ side: -1, kind: 'bench', material: 'stone' }, { side: 1, kind: 'bench', material: 'stone' }] }, this.ids));
        }
        out.obstacles.push(buildProp({ kind: 'cone', area, segment: index, s: at(1.4), x: -side * 1.2, len: 0.3, wid: 0.3, hgt: 0.5 }, this.ids));
        this.coinString(out, at(0.5) + 0.3, at(1.7) + 1.7, x, 0.45 + 0.35, v);
        this.safeX = -side * 2.4;
        this.safeKeys(out, t0, t1, this.safeX);
        break;
      }
    }
    this.decor(out, s0, s1, decorRng);

    const seg: Segment = {
      index, templateId, area, tier: templateId === 'ROLLOUT' || templateId === 'S_OPEN' ? 0 : templateId === 'S_GATE' ? 2 : 1,
      t0, t1, s0, s1, mirror: false, rerolls: 0, fallback: false,
    };
    this.segs.push(seg);
    this.commit(seg, out);
    this.t = t1;
    this.s = s1;
  }

  private barrier(out: Out, area: AreaId, segment: number, s: number, hgt: number, v: number): void {
    const ob = buildProp({ kind: 'barrier_low', area, segment, s, x: 0, len: 0.6, wid: 9.0, hgt,
      tags: ObTag.FullWidth | ObTag.Required, warnAtS: s - 1.6 * v }, this.ids);
    out.obstacles.push(ob);
    // Coin arc over it, on the flat-ollie parabola + 0.25 m, taking off 0.3 s before the middle.
    const sMid = s + 0.3, tTake = tAt(sMid) - 0.3;
    for (let k = 1; k <= 5; k++) {
      const ta = k * 0.1;
      this.coin(out, sAt(tTake + ta), 0, 6.6 * ta - 11 * ta * ta + 0.25, 'trick');
    }
    out.safe.push({ t: tTake, s: sAt(tTake), x: this.safeX, action: 'ollie' });
    this.lastBarrierT = tAt(s);
  }

  private coin(out: Out, s: number, x: number, y: number, line: Coin['line'], value: 1 | 10 = 1): void {
    out.coins.push({ id: ++this.ids.coin, p: { s: round1cm(s), x: round1cm(x), y: round1cm(y) }, value, line });
    this.coinsTotal++;
    if (line === 'trick') this.coinsTrick++;
  }

  private coinString(out: Out, sA: number, sB: number, x: number, y: number, v: number): void {
    const step = 0.12 * v;
    const n = Math.max(1, Math.min(8, Math.floor((sB - sA) / step)));
    for (let k = 0; k < n; k++) this.coin(out, sA + k * step, x, y, 'trick');
  }

  private safeKeys(out: Out, t0: number, t1: number, x: number): void {
    for (let t = t0; t < t1 - 1e-9; t += 0.5) out.safe.push({ t, s: round1cm(sAt(t)), x: round1cm(x) });
  }

  private decor(out: Out, s0: number, s1: number, rng: Sfc32): void {
    // Buildings both sides (backdrop and shadow casters) and street lamps on the sidewalk band.
    for (const side of [-1, 1] as const) {
      let s = s0;
      while (s < s1) {
        const d = round1cm(rng.range(8, 16));
        const h = round1cm(rng.range(8, 22));
        out.decor.push({ kind: 'building', s: round1cm(s), x: side * 5.2, y: 0.15, rotY: 0, scale: 1, variant: rng.int(0, 7),
          castShadow: true, params: { w: round1cm(rng.range(6, 10)), d: Math.min(d, round1cm(s1 - s)), h } });
        s += d + round1cm(rng.range(0, 3));
      }
      for (let s2 = Math.ceil(s0 / 14) * 14; s2 < s1; s2 += 14) {
        out.decor.push({ kind: 'street_lamp', s: s2, x: side * 4.75, y: 0.15, rotY: 0, scale: 1, variant: 0, castShadow: true, params: { h: 5 } });
      }
    }
  }

  private commit(seg: Segment, out: Out): void {
    const ci = (s: number) => Math.floor(s / CHUNK_LEN);
    for (let i = ci(seg.s0); i <= ci(Math.max(seg.s0, seg.s1 - 1e-6)); i++) this.bucket(i).segments.push(seg.index);
    for (const ob of out.obstacles) {
      this.internals.obstacleById.set(ob.id, ob);
      for (const e of ob.edges) this.internals.edgeById.set(e.id, e);
      for (let i = ci(ob.s); i <= ci(ob.s + Math.max(0, ob.len - 1e-6)); i++) {
        const c = this.bucket(i);
        c.obstacles.push(ob);
      }
    }
    for (const c of out.coins) this.bucket(ci(c.p.s)).coins.push(c);
    for (const d of out.decor) this.bucket(ci(d.s)).decor.push(d);
    for (const k of out.safe) this.bucket(ci(k.s)).safe.push(k);
    for (const i of new Set(out.obstacles.flatMap((o) => [ci(o.s), ci(o.s + o.len)]))) {
      this.chunks.get(i)?.obstacles.sort((a, b) => a.s - b.s);
    }
  }
}
