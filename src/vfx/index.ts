// vfx/: particles, rings and speed lines (WA, DESIGN §9 / §18.8, TECH §8.8). Public surface (TECH §4.13): createVfx.
// Everything is driven by RenderFrame (state + this frame's GameEvents) and the world view's ambient emitters:
//   - grind sparks (warm on metal, cyan on neon, 40/s), dust on concrete / stone (12/s), wood flecks (8/s), triple
//     sparks on a Perfect Lock;  - the pop dust puff (6) and the landing dust ring (10 puffs, scales with the drop),
//     the golden Perfect ring;  - coin pops (6-star burst);  - the crash star ring around the head;
//   - speed lines from 9.0 m/s outside the corridor only (alpha ≤ 0.15) and parallax streaks on the side dressing;
//   - the world-space bank-timer arc;  - ambient petals (Neon) and leaves (Suburbs), steam vents, sprinklers;
//   - legendary emitters for skater/ (Vfx.emit: steam, leaves, petals, glyphs, light trail).
// Particles in the upper two-thirds of the screen (the look-ahead zone) stay ≤ 25% alpha (DESIGN §18.4). Reduced
// motion (prefers-reduced-motion or setReducedMotion) stops petals, leaves and speed lines.
import { CAMERA, CORRIDOR_HALF } from '../core/tuning';
import type { EdgeMaterial, QualityTier } from '../core/ids';
import { lerp } from '../core/math';
import { Sfc32 } from '../core/rng';
import type { GfxContext, RenderFrame, Vfx } from '../core/view';
import { originOf } from '../gfx';
import { RIG_STATE, RIG_UNIFORMS, SURFACE_COLOR, worldAmbient, type AmbientRec } from '../world/render';
import { CRIT, Critters } from './critters';
import { Particles, SHAPE } from './particles';
import { Rings } from './rings';
import { VFX } from './vfx.config';

const lighten = (hex: number, k: number) => {
  const ch = (sh: number) => Math.round(((hex >> sh) & 255) + (255 - ((hex >> sh) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export type VfxExt = Vfx & {
  setReducedMotion(on: boolean): void; debug(): { alive: number; cap: number; critters: number };
  /** RECLAIM: called when perched birds take off (pan −1..1); the game plays the bird flutter (audio 'birdFlutter'). */
  onFlutter: ((pan: number) => void) | null;
};

class VfxImpl implements VfxExt {
  private readonly parts: Particles;
  private readonly rings = new Rings();
  private readonly crit: Critters;
  /** Perched-bird spans that have flown this run (by place), the last landing's s, the active critter species. */
  private readonly flown = new Set<number>();
  private landS = -1e9;
  private critSpecies = -1;
  onFlutter: ((pan: number) => void) | null = null;
  // A fixed-seed stream: VFX randomness never touches the sim (and screenshots are repeatable).
  private readonly r = new Sfc32(0x5eed);
  private material: EdgeMaterial | null = null;
  private readonly acc = { spark: 0, speed: 0, ambient: 0, steam: 0, crit: 0, drip: 0, ripple: 0 };
  private crashT = -1;
  private crashAt = { s: 0, x: 0, y: 0 };
  private reduced = false;
  private readonly mq: MediaQueryList | null;
  private lastQ: QualityTier | null = null;
  private time = 0;

  constructor(private readonly ctx: GfxContext) {
    this.parts = new Particles(ctx, VFX.cap.high);
    this.parts.setCap(VFX.cap[ctx.quality]);
    this.crit = new Critters(ctx);
    ctx.scene.add(this.parts.mesh, this.rings.arc, this.rings.perfect, this.crit.mesh);
    let mq: MediaQueryList | null = null;
    try { mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null; } catch { mq = null; }
    this.mq = mq;
  }

  // (The low tier drops the critters, theme §11.)
  setQuality(q: QualityTier): void { this.parts.setCap(VFX.cap[q]); this.crit.mesh.visible = q !== 'low'; }
  setReducedMotion(on: boolean): void { this.reduced = on; }
  clear(): void { this.parts.clear(); this.rings.clear(); this.crit.clear(); this.crashT = -1; this.material = null; }
  debug() { return { alive: this.parts.alive, cap: this.parts.cap, critters: this.crit.alive }; }

  emit(kind: 'steam' | 'leaves' | 'petals' | 'glyphs' | 'lightTrail', p: { s: number; x: number; y: number }, n = 1): void {
    const r = this.r;
    for (let i = 0; i < n; i++) {
      if (kind === 'steam') this.parts.spawn({ s: p.s, x: p.x + r.range(-0.1, 0.1), y: p.y, vs: r.range(-0.2, 0.2), vx: r.range(-0.2, 0.2), vy: r.range(0.5, 0.9), life: 0.9, size: 0.18, size1: 0.5, color: 0xfff4e3, alpha: 0.3, shape: SHAPE.puff, drag: 1 });
      else if (kind === 'leaves' || kind === 'petals') this.flake(p.s, p.x, p.y, kind === 'petals');
      else if (kind === 'glyphs') this.parts.spawn({ s: p.s, x: p.x + r.range(-0.15, 0.15), y: p.y + r.range(0, 0.3), vs: -0.5, vx: 0, vy: 0.3, life: 0.6, size: 0.1, color: 0x3ff2ff, alpha: 0.7, shape: SHAPE.star });
      else this.parts.spawn({ s: p.s, x: p.x, y: p.y, vs: -1.5, vx: 0, vy: 0, life: 0.4, size: 0.12, color: 0xffc94a, color1: 0xff8a3d, alpha: 0.6, shape: SHAPE.streak, stretch: 3 });
    }
  }

  update(f: RenderFrame): void {
    const dt = Math.max(0, f.dt);
    this.time += dt;
    if (this.ctx.quality !== this.lastQ) { this.lastQ = this.ctx.quality; this.setQuality(this.ctx.quality); }
    const reduced = this.reduced || !!this.mq?.matches;
    const c = f.cur, s = f.playerS;
    const x = lerp(f.prev.p.x, c.p.x, f.alpha), y = lerp(f.prev.p.y, c.p.y, f.alpha), gy = lerp(f.prev.groundY, c.groundY, f.alpha);
    for (const e of f.events) {
      switch (e.t) {
        case 'ollie': {
          const col = lighten(SURFACE_COLOR[c.surface] ?? 0xd9c3ae, 0.2);
          for (let i = 0; i < VFX.pop.puffs; i++) this.puff(s - 0.35, x + this.r.range(-0.15, 0.15), gy + 0.03, col, VFX.pop.alpha, VFX.pop.life, 0.12, 0.3);
          break;
        }
        case 'land': {
          const k = Math.min(2, 1 + Math.max(0, e.dropH) * 0.5);
          const col = lighten(SURFACE_COLOR[e.surface] ?? 0xd9c3ae, 0.2);
          const sp = ((VFX.land.r1 - VFX.land.r0) / VFX.land.life) * k;
          for (let i = 0; i < VFX.land.puffs; i++) {
            const a = (i / VFX.land.puffs) * Math.PI * 2;
            this.parts.spawn({ s: s + Math.sin(a) * VFX.land.r0, x: x + Math.cos(a) * VFX.land.r0, y: gy + 0.04, vs: Math.sin(a) * sp, vx: Math.cos(a) * sp, vy: 0.2,
              life: VFX.land.life, size: 0.16 * k, size1: 0.3 * k, color: col, alpha: VFX.land.alpha, shape: SHAPE.puff, drag: 2 });
          }
          if (e.quality === 'perfect') this.rings.triggerPerfect();
          this.landS = s;
          // Butterflies nearby lift off on a landing (theme §4), in the side band on the skater's side.
          if (this.critSpecies === 0 && !reduced) for (let i = 0; i < 2; i++) this.butterfly(s + this.r.range(-1.5, 3), (Math.sign(x) || 1) * this.r.range(4.8, 5.4), 0.3, 1.0);
          break;
        }
        case 'grindStart':
          this.material = e.material;
          if (e.perfect) for (let i = 0; i < 18; i++) this.spark(s, x, y, e.material);
          break;
        case 'grindEnd': this.material = null; break;
        case 'coin':
          for (let i = 0; i < VFX.coin.stars; i++) {
            const a = (i / VFX.coin.stars) * Math.PI * 2;
            this.parts.spawn({ s: e.p.s, x: e.p.x + Math.cos(a) * 0.05, y: e.p.y + Math.sin(a) * 0.05, vs: 0, vx: Math.cos(a) * VFX.coin.speed, vy: Math.sin(a) * VFX.coin.speed,
              life: VFX.coin.life, size: 0.16, size1: 0.05, color: VFX.coin.color, alpha: 1, shape: SHAPE.star, drag: 4, spin: 4 });
          }
          break;
        case 'crash': if (!e.god) { this.crashT = 0; this.crashAt = { s, x, y }; this.material = null; } break;
        case 'runStart': this.clear(); this.flown.clear(); break;
        default: break;
      }
    }
    // Continuous grind effects by material.
    if (c.grind && this.material && c.mode === 'grind') {
      const m = this.material, metal = m === 'metal' || m === 'neon';
      this.acc.spark += (metal ? VFX.sparks.rate : m === 'wood' ? VFX.dust.woodRate : VFX.dust.ledgeRate) * dt;
      while (this.acc.spark >= 1) {
        this.acc.spark -= 1;
        if (metal) this.spark(s, x, y, m);
        else this.puff(s - 0.1, x + this.r.range(-0.1, 0.1), y + 0.02, m === 'wood' ? VFX.dust.wood : VFX.dust.ledge, 0.5, 0.35, 0.06, 0.16);
      }
    } else this.acc.spark = 0;
    // Crash: a ring of stars circling the head.
    if (this.crashT >= 0) {
      this.crashT += dt;
      if (this.crashT > VFX.crashStars.life) this.crashT = -1;
      else for (let k = 0; k < VFX.crashStars.n; k++) {
        const a = this.crashT * 7 + (k / VFX.crashStars.n) * Math.PI * 2;
        this.parts.spawn({ s: this.crashAt.s + Math.sin(a) * VFX.crashStars.r * 0.6, x: this.crashAt.x + Math.cos(a) * VFX.crashStars.r, y: this.crashAt.y + 1.25,
          vs: 0, vx: 0, vy: 0, life: 0.05, size: 0.14, color: VFX.crashStars.color, alpha: 1, shape: SHAPE.star });
      }
    }
    // Speed lines and side-dressing streaks: from 9.0 m/s, outside the corridor only.
    if (!reduced && f.speed >= VFX.speedLines.from && c.mode !== 'crashed' && !RIG_STATE.menu) {
      const k = Math.min(1, (f.speed - VFX.speedLines.from) / 1.5);
      this.acc.speed += VFX.speedLines.rate * (0.4 + 0.6 * k) * dt;
      while (this.acc.speed >= 1) {
        this.acc.speed -= 1;
        const side = this.r.chance(0.5) ? -1 : 1, far = this.r.chance(0.35);
        const lx = side * (far ? this.r.range(5.6, VFX.speedLines.xMax) : this.r.range(VFX.speedLines.xMin, 5.6));
        const len = this.r.range(VFX.speedLines.len[0], VFX.speedLines.len[1]);
        // Camera side: below the camera-side cut plane (world/render camera.ts uCut), so a streak never lies over the
        // corridor on screen whatever the yaw and camera distance (DESIGN §18.4: speed lines outside the corridor).
        const cut = RIG_UNIFORMS.uCut.value, yMax = side > 0 && cut.w > 0.5 ? Math.max(0.15, (lx - cut.x) * cut.z * 0.9) : Infinity;
        this.parts.spawn({ s: s + this.r.range(-2, 20), x: lx, y: Math.min(yMax, this.r.range(0.2, far ? 4 : 2.2)), vs: -f.speed * (far ? 0.6 : 1.4), vx: 0, vy: 0,
          life: 0.35, size: 0.05, color: VFX.speedLines.color, alpha: VFX.speedLines.alpha * (0.5 + 0.5 * k), shape: SHAPE.streak, stretch: len / 0.05 });
      }
    }
    // Ambient: the live chunks' emitters (petals, leaves, steam, sprinklers); area defaults when there are none.
    if (!reduced) this.ambient(f, s, dt);
    this.critters(s, gy, dt, reduced);
    this.landS = -1e9;
    // Rings: the bank-timer arc around the contact shadow and the Perfect ring.
    const origin = originOf(s), z = -(s - origin);
    const combo = f.score.combo;
    this.rings.updateArc(combo.active && c.mode !== 'crashed' && !RIG_STATE.menu, combo.bankIn, x, gy, z, dt);
    this.rings.updatePerfect(x, gy, z, dt);
    // Integrate and write (alpha ≤ 25% in the look-ahead zone, the upper two-thirds of the screen).
    const H = RIG_STATE.menu ? 0 : RIG_STATE.H;
    const limitY = (CAMERA.anchorFromTop - 2 / 3) * H;   // screen metres above the skater where the zone starts
    const cap = this.parts.cap0;
    cap.s = s; cap.y = gy; cap.limit = limitY; cap.sin = Math.sin((RIG_STATE.pitchDeg * Math.PI) / 180); cap.cos = Math.cos((RIG_STATE.pitchDeg * Math.PI) / 180); cap.alpha = H > 0 ? VFX.lookAheadAlpha : 1;
    this.parts.update(dt, origin);
    this.crit.update(dt, this.time, origin, RIG_STATE.menu ? null : RIG_STATE.camera, RIG_UNIFORMS.uCut.value);
  }

  /** RECLAIM critters (theme §4): perched birds (they take off outward when the skater passes under them or lands
   *  within 6 m, with the bird flutter), the area's butterflies / seeds / moths / dragonflies in the side bands, and
   *  Neon's after-rain drips with ripple rings. Reduced motion keeps the birds perched and spawns nothing. */
  private critters(s: number, gy: number, dt: number, reduced: boolean): void {
    const C = this.crit, r = this.r, K = VFX.critters;
    let rate = 0, species = -1, drips = 0, puddle: AmbientRec | null = null, np = 0;
    for (const a of worldAmbient(this.ctx)) {
      if (a.kind === 'birds') {
        if (a.s < s - 8 || a.s > s + 45) continue;
        const key = Math.round(a.s * 100) * 64 + Math.round(a.x * 10);
        if (this.flown.has(key)) continue;
        const sp = Math.max(0, Math.min(2, a.p.species ?? 0)), size = K.bird.size[sp]!, col = K.bird.color[sp]!, n = Math.max(1, a.rate | 0);
        const x0 = a.p.x0 ?? a.x, x1 = a.p.x1 ?? a.x;
        const go = !reduced && !RIG_STATE.menu && (s >= a.s - K.birdPass || Math.abs(this.landS - a.s) < K.birdLand);
        for (let i = 0; i < n; i++) {
          const bx = x0 + ((x1 - x0) * (i + 0.5)) / n, bs = a.s + (i % 2 ? 0.12 : -0.12);
          if (go) C.spawn({ s: bs, x: bx, y: a.y + size * 0.5, vs: r.range(0.5, 2.5), vx: (Math.sign(bx) || 1) * r.range(1.6, 2.8), vy: r.range(1.0, 2.0), life: 2.2, size: size * 1.4, shape: CRIT.flying, color: col, alpha: 1 });
          else C.perched(bs, bx, a.y + size * 0.42, size, col, i % 2 ? 1 : -1);
        }
        if (go) { this.flown.add(key); this.onFlutter?.((Math.sign(a.x) || 1) * 0.6); }
      } else if (a.kind === 'critters' && s >= a.s - 2 && s < a.s + a.len) { rate = a.rate; species = a.p.species ?? 0; }
      else if (a.kind === 'drips' && s >= a.s - 2 && s < a.s + a.len) drips = Math.max(drips, a.rate);
      else if (a.kind === 'puddle' && a.s > s && a.s < s + 14 && r.float() * ++np < 1) puddle = a;
    }
    this.critSpecies = species;
    if (reduced || RIG_STATE.menu) return;
    if (rate > 0 && C.alive < K.cap) {
      this.acc.crit += rate * dt;
      while (this.acc.crit >= 1) {
        this.acc.crit -= 1;
        const side = r.chance(0.5) ? -1 : 1, ss = s + r.range(-1, 10);
        if (species === 0) this.butterfly(ss, side * r.range(4.8, 6.0), r.range(0.4, 1.6), 0);
        else if (species === 1) C.spawn({ s: ss, x: side * r.range(4.8, 6.0), y: r.range(0.8, 2.2), vs: -0.4, vx: side * 0.15, vy: 0, life: 6, size: 0.09, shape: CRIT.seed, color: K.seed, alpha: K.seedAlpha, wander: 0.2 });
        else if (species === 2) C.spawn({ s: ss, x: side * r.range(4.8, 5.6), y: r.range(2.6, 4.2), vs: 0, vx: 0, vy: 0, life: 3, size: 0.09, shape: CRIT.butterfly, color: K.moth, alpha: 0.85, wander: 1.2 });
        else C.spawn({ s: ss, x: side * r.range(4.8, 6.0), y: r.range(0.6, 1.3), vs: r.range(-1.5, 1.5), vx: side * r.range(-0.2, 0.6), vy: 0, life: 3, size: 0.2, shape: CRIT.dragonfly, color: K.dragonfly, alpha: 0.9, wander: 1.0 });
      }
    } else this.acc.crit = 0;
    if (drips <= 0) { this.acc.drip = 0; return; }
    // "It just rained": drips fall from awning and sign edges in the side bands; each lands in a ripple ring.
    this.acc.drip += drips * dt;
    while (this.acc.drip >= 1 && this.parts.alive < this.parts.cap - 20) {
      this.acc.drip -= 1;
      const x = (r.chance(0.5) ? -1 : 1) * r.range(4.7, 5.3), y = r.range(2.3, 2.9), ss = s + r.range(-1, 12), t = Math.sqrt((2 * (y - 0.15)) / 9.8);
      this.parts.spawn({ s: ss, x, y: gy + y, vs: 0, vx: 0, vy: -0.5, life: t, size: 0.025, color: K.drip, alpha: 0.5, shape: SHAPE.streak, gravity: 9.8, stretch: 4 });
      C.spawn({ s: ss, x, y: gy + 0.17, vs: 0, vx: 0, vy: 0, life: 0.7, size: 0.25, size1: 0.7, shape: CRIT.ripple, color: K.ripple, alpha: 0.3, delay: t });
    }
    // Ripples on the Neon puddles ahead (≤ 25% alpha: they lie in the street).
    this.acc.ripple += drips * 0.4 * dt;
    if (this.acc.ripple >= 1 && puddle) {
      this.acc.ripple -= 1;
      C.spawn({ s: puddle.s + r.range(-0.4, 0.4), x: puddle.x + r.range(-0.25, 0.25), y: gy + 0.02, vs: 0, vx: 0, vy: 0, life: 0.8, size: 0.2, size1: 0.6, shape: CRIT.ripple, color: K.ripple, alpha: 0.25 });
    } else if (this.acc.ripple >= 1) this.acc.ripple = 0;
  }
  private butterfly(s: number, x: number, y: number, vy: number): void {
    const r = this.r, K = VFX.critters;
    this.crit.spawn({ s, x, y, vs: r.range(-0.3, 0.3), vx: (Math.sign(x) || 1) * r.range(0, 0.3), vy, life: 5, size: 0.2, shape: CRIT.butterfly, color: K.butterfly[r.int(0, 1)]!, alpha: 0.95, wander: 0.6 });
  }

  private spark(s: number, x: number, y: number, m: EdgeMaterial): void {
    const r = this.r, cols = m === 'neon' ? VFX.sparks.neon : VFX.sparks.metal, sp = r.range(VFX.sparks.speed[0], VFX.sparks.speed[1]);
    this.parts.spawn({ s, x: x + r.range(-0.08, 0.08), y: y + 0.02, vs: -sp * r.range(0.6, 1), vx: r.range(-1, 1), vy: sp * r.range(0.3, 0.8),
      life: r.range(VFX.sparks.life[0], VFX.sparks.life[1]), size: 0.045, color: cols[0], color1: cols[1], alpha: 1, shape: SHAPE.streak,
      gravity: VFX.sparks.gravity, stretch: 1.8 });
  }
  private puff(s: number, x: number, y: number, col: number, alpha: number, life: number, size: number, size1: number): void {
    const r = this.r;
    this.parts.spawn({ s: s + r.range(-0.1, 0.1), x, y, vs: r.range(-0.5, 0.2), vx: r.range(-0.4, 0.4), vy: r.range(0.2, 0.6), life, size, size1, color: col, alpha, shape: SHAPE.puff, drag: 2.5 });
  }
  private flake(s: number, x: number, y: number, petal: boolean): void {
    const r = this.r;
    const col = petal ? VFX.ambient.petal : VFX.ambient.leaf[r.int(0, VFX.ambient.leaf.length - 1)]!;
    this.parts.spawn({ s, x, y, vs: r.range(-1.2, -0.3), vx: r.range(-0.6, 0.6), vy: r.range(-0.6, -0.25), life: r.range(2.5, 4), size: petal ? 0.07 : 0.1,
      color: col, alpha: 0.9, shape: SHAPE.flake, spin: r.range(-3, 3), drag: 0.1 });
  }
  private ambient(f: RenderFrame, s: number, dt: number): void {
    const list = worldAmbient(this.ctx);
    let petals = 0, leaves = 0;
    for (const a of list) {
      if (a.kind === 'petals' && Math.abs(a.s - s) < 40) petals = Math.max(petals, a.rate);
      else if (a.kind === 'leaves' && Math.abs(a.s - s) < 40) leaves = Math.max(leaves, a.rate);
      else if (a.kind === 'steam' && a.s > s - 8 && a.s < s + 30) {
        this.acc.steam += a.rate * dt;
        if (this.acc.steam >= 1) { this.acc.steam -= 1; this.emit('steam', { s: a.s, x: a.x, y: a.y + 0.05 }); }
      } else if (a.kind === 'sprinkler' && a.s > s - 6 && a.s < s + 30 && this.r.chance(dt * 30)) {
        const ang = Math.sin(this.time * (a.rate || 0.3) * Math.PI * 2) * 1.2;
        this.parts.spawn({ s: a.s, x: a.x, y: a.y + 0.15, vs: Math.cos(ang) * 2, vx: Math.sin(ang) * 2 * -Math.sign(a.x || 1), vy: 2.2, life: 0.6, size: 0.04,
          color: 0xd8ecf2, alpha: 0.6, shape: SHAPE.puff, gravity: 9.8 });
      }
    }
    if (!petals && !leaves && !RIG_STATE.menu) { if (f.area === 'neon') petals = VFX.ambient.rate * 0.5; else if (f.area === 'suburbs') leaves = VFX.ambient.rate * 0.35; }
    const rate = petals || leaves;
    if (!rate) { this.acc.ambient = 0; return; }
    this.acc.ambient += rate * dt;
    while (this.acc.ambient >= 1) {
      this.acc.ambient -= 1;
      this.flake(s + this.r.range(-4, 22), this.r.range(-CORRIDOR_HALF - 1, CORRIDOR_HALF + 1), this.r.range(1.5, 4.5), petals > 0);
    }
  }
}

export function createVfx(ctx: GfxContext): Vfx {
  return new VfxImpl(ctx);
}
/** RECLAIM: route the perched birds' take-off to a sound (game/wiring.ts: audio 'birdFlutter'). */
export function onBirdFlutter(vfx: Vfx, fn: (pan: number) => void): void { if (vfx instanceof VfxImpl) vfx.onFlutter = fn; }
export { VFX } from './vfx.config';
