// world/render/view.ts: the M0 grey-box WorldView. Streams chunk meshes around the player (CHUNK_WINDOW: 1 behind,
// 3 ahead) with origin rebasing (TECH §8.2), builds at most one chunk per frame into pooled buffers (chunkBuilder.ts,
// pools.ts), keeps coins in one global InstancedMesh (hidden on pickup, kept ≥ 12 px on screen), draws the always-on
// contact shadow (dark blob on light ground, additive cyan glow on dark ground) and points the sun at the skater.
// TODO(WA): kits per PropKind and area, every DECOR_KINDS entry, palette blends, the 5-mesh chunk layout, x-ray cap,
// decals, glow cards, quality tiers with auto-adjust, the Roll-out chunk cache (TECH §8.6–8.9).
import {
  AdditiveBlending, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, PlaneGeometry, Quaternion, Vector3,
} from 'three';
import type { QualityTier } from '../../core/ids';
import { lerp } from '../../core/math';
import { CAMERA, CHUNK_LEN, CHUNK_WINDOW, V_MAX, speedAt } from '../../core/tuning';
import type { GfxContext, RenderFrame, Viewport, WorldView } from '../../core/view';
import type { Chunk, Coin, Decor, Obstacle, WorldGen } from '../../core/world';
import { getSun, originOf, setGfxQuality } from '../../gfx';
import { solveFraming, yawForAspect } from './camera';
import { buildChunk, DEFAULT_BUILD, GeoWriter, srgbToLinear, type BuildOptions } from './chunkBuilder';
import { COLORS, CONTACT, SURFACE_COLOR } from './palette';
import { GeoPool, type PooledGeo } from './pools';

export const VIEW = {
  buildBudgetMs: 4,          // TECH §8.6 (warn when a build takes 4× this)
  coinCapacity: 256,         // global coin instances
  coinDiameter: 0.32,        // m, the coin mesh
  shadowSize: [0.9, 1.1],    // contact shadow quad, m (x, s)
  shadowOpacity: [0.6, 0.25] as const,   // on the ground → at 2 m height (DESIGN §8)
  glowOpacity: 0.5,          // additive cyan contact glow on dark ground
  glowGroundLum: 0.06,       // ground relative luminance below which the glow replaces the dark blob (wet asphalt 0.03)
  rebuildFrac: 0.1,          // rebuild chunks when the minimum edge width changes by more than this
  inkPadPx: 1.6,             // the ink underline shows ≥ this many CSS px beside the cream stripe (reads on light tops)
} as const;

type Role = 'main' | 'near' | 'casters';
interface Part { mesh: Mesh; geo: PooledGeo }
interface LiveChunk { index: number; s0: number; group: Group; parts: Partial<Record<Role, Part>>; slots: number[]; key: number }

/** Edge stripe width so a grind edge stays ≥ CAMERA.minEdgePx wide at this viewport's widest run framing. */
export function buildOptionsFor(vp: Viewport): BuildOptions {
  const mPerPx = solveFraming(V_MAX, vp).H / Math.max(1, vp.hCss);
  const hw = Math.max(DEFAULT_BUILD.edgeHalfW, (CAMERA.minEdgePx * mPerPx) / 2);
  return { edgeHalfW: hw, inkPad: Math.max(DEFAULT_BUILD.inkPad, VIEW.inkPadPx * mPerPx) };
}

class GreyboxWorldView implements WorldView {
  private gen: WorldGen | null = null;
  private readonly root = new Group();
  private readonly chunks = new Map<number, LiveChunk>();
  private readonly pool = new GeoPool(4096);
  private readonly meshPool: Mesh[] = [];
  private readonly groupPool: Group[] = [];
  private readonly writers: Record<Role, GeoWriter> = { main: new GeoWriter(), near: new GeoWriter(), casters: new GeoWriter() };
  private readonly mat = new MeshLambertMaterial({ vertexColors: true });
  /** Shadow-only: drawn into the shadow map, invisible in the main pass (camera-side decor when ψ > 0, casters). */
  private readonly shadowOnly = new MeshLambertMaterial({ vertexColors: true, colorWrite: false, depthWrite: false });
  private nearHidden = false;
  private opts: BuildOptions = DEFAULT_BUILD;
  private optsKey = 0;
  // Per-frame caches (TECH §8.4: no allocations in steady-state frames): the build options per viewport, the coin
  // framing per viewport and quantized speed, and the stats object.
  private optsVp = { w: -1, h: -1, safeTop: -1, aspect: -1 };
  private coinVp = { w: -1, h: -1, safeTop: -1, aspect: -1, speedQ: -1 };
  private buildP95 = 0;
  private readonly st = { chunksBuilt: 0, buildMsP95: 0, drawCalls: 0 };
  // Coins: one global instanced layer (TECH §8.6).
  // 8-sided, facing the camera, emissive gold (DESIGN §18.8): unlit and not tone-mapped so it stays #FFC94A.
  private readonly coinGeo = new CylinderGeometry(VIEW.coinDiameter / 2, VIEW.coinDiameter / 2, 0.05, 8).rotateX(Math.PI / 2 - (CAMERA.pitchDeg * Math.PI) / 180);
  private readonly coinMat = new MeshBasicMaterial({ color: COLORS.coin, toneMapped: false });
  private readonly coins = new InstancedMesh(this.coinGeo, this.coinMat, VIEW.coinCapacity);
  private readonly slotCoin: (Coin | null)[] = new Array<Coin | null>(VIEW.coinCapacity).fill(null);
  private readonly freeSlots: number[] = [];
  private readonly collected = new Set<number>();
  private coinScale = 1;
  // Contact shadow / glow.
  private readonly blob: Mesh;
  private readonly glow: Mesh;
  private originS = 0;
  /** Where this run started (the first update after attach) and the street cross-section that fills in behind it. */
  private startS: number | null = null;
  private behind: StreetTemplate | null = null;
  private built = 0;
  private readonly buildMs: number[] = [];
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly sc = new Vector3();
  private readonly zero = new Matrix4().makeScale(0, 0, 0);

  constructor(private readonly ctx: GfxContext) {
    this.root.name = 'world';
    ctx.scene.add(this.root);
    for (let i = VIEW.coinCapacity - 1; i >= 0; i--) { this.freeSlots.push(i); this.coins.setMatrixAt(i, this.zero); }
    this.coins.name = 'coins';
    this.coins.castShadow = false;
    this.coins.frustumCulled = false;
    this.coins.count = 0;
    ctx.scene.add(this.coins);
    const radial = (rgb: string) => (c: CanvasRenderingContext2D) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.6, `rgba(${rgb},0.5)`); g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    };
    const quad = new PlaneGeometry(VIEW.shadowSize[0], VIEW.shadowSize[1]).rotateX(-Math.PI / 2);
    this.blob = new Mesh(quad, new MeshBasicMaterial({ map: ctx.canvasTexture('contactShadow', 64, 64, radial(CONTACT.shadowRgb)),
      transparent: true, depthWrite: false, opacity: VIEW.shadowOpacity[0], side: DoubleSide }));
    this.glow = new Mesh(quad, new MeshBasicMaterial({ map: ctx.canvasTexture('contactGlow', 64, 64, radial('255,255,255')),
      color: CONTACT.glow, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: VIEW.glowOpacity, side: DoubleSide }));
    this.blob.name = 'contactShadow'; this.glow.name = 'contactGlow';
    this.blob.renderOrder = 1; this.glow.renderOrder = 1;
    this.glow.visible = false;
    ctx.scene.add(this.blob, this.glow);
  }

  attach(gen: WorldGen): void {
    this.releaseAll();
    this.gen = gen;
    this.collected.clear();
    this.startS = null; this.behind = null;
  }

  update(f: RenderFrame): void {
    for (const e of f.events) if (e.t === 'coin') this.hideCoin(e.id);
    if (!this.gen) return;
    const fresh = this.startS === null;                  // first frame of a run (or the Title preview)
    if (fresh) this.startS = f.playerS;
    const origin = originOf(f.playerS);
    if (origin !== this.originS) {
      this.originS = origin;
      for (const c of this.chunks.values()) c.group.position.z = -(c.s0 - origin);
      this.writeAllCoins();
    }
    // Build options follow the viewport (edge widths); stale chunks are rebuilt progressively.
    const vp = f.viewport, ov = this.optsVp;
    if (vp.wCss !== ov.w || vp.hCss !== ov.h || vp.safeTop !== ov.safeTop || vp.aspect !== ov.aspect) {
      ov.w = vp.wCss; ov.h = vp.hCss; ov.safeTop = vp.safeTop; ov.aspect = vp.aspect;
      const want = buildOptionsFor(vp);
      if (Math.abs(want.edgeHalfW - this.opts.edgeHalfW) > VIEW.rebuildFrac * this.opts.edgeHalfW || this.optsKey === 0) {
        this.opts = want; this.optsKey++;
      }
    }
    const ci = Math.floor(f.playerS / CHUNK_LEN);
    const lo = ci - CHUNK_WINDOW.behind, hi = ci + CHUNK_WINDOW.ahead;
    for (const c of this.chunks.values()) if (c.index < lo || c.index > hi) this.release(c);
    const hide = yawForAspect(f.viewport.aspect) > 0;
    if (hide !== this.nearHidden) {
      this.nearHidden = hide;
      for (const c of this.chunks.values()) if (c.parts.near) c.parts.near.mesh.material = hide ? this.shadowOnly : this.mat;
    }
    // The first frame of a run builds everything the camera sees at once (the chunk under the skater, the one behind
    // it at the bottom of the screen, the next one ahead), so a retry never shows the empty fog behind the start.
    // That frame builds those three and nothing else (TECH §8.6 exception); the scheduler resumes next frame.
    if (fresh) {
      for (const i of [ci, lo, ci + 1]) if (!this.chunks.has(i)) this.recordBuild(this.build(i));
      this.updateCoinScale(f);
      this.updateShadow(f, origin);
      return;
    }
    // Then at most one chunk build per frame (TECH §8.6): the current one, the one behind (always on screen), then
    // the missing ones ahead nearest-first, then stale ones.
    let target: number | null = null;                    // chunk indices can be negative (behind the start)
    if (!this.chunks.has(ci)) target = ci;
    else if (!this.chunks.has(lo)) target = lo;
    for (let i = ci + 1; i <= hi && target === null; i++) if (!this.chunks.has(i)) target = i;
    if (target === null) for (let i = ci; i <= hi && target === null; i++) { const c = this.chunks.get(i); if (c && c.key !== this.optsKey) target = i; }
    if (target !== null) {
      const old = this.chunks.get(target);
      if (old) this.release(old);
      this.recordBuild(this.build(target));
    }
    this.updateCoinScale(f);
    this.updateShadow(f, origin);
  }

  setQuality(q: QualityTier): void { setGfxQuality(this.ctx, q); }
  /** After a context restore: rebuild every chunk from the generator (deterministic) and the collected-coin set. */
  rebuildGPU(): void { const g = this.gen; const got = new Set(this.collected); this.releaseAll(); this.gen = g; for (const id of got) this.collected.add(id); }

  /** The chunk to draw: generated, or, up to the run's start, the street filled in behind the first content. */
  private chunkFor(index: number): Chunk {
    const gen = this.gen!;
    const startIdx = Math.floor((this.startS ?? 0) / CHUNK_LEN);
    if (index > startIdx) return gen.chunk(index);
    const ch = index >= 0 ? gen.chunk(index) : null;
    const s0 = index * CHUNK_LEN;
    const contentS = ch ? firstContentS(ch) : Infinity;
    if (contentS <= s0 + 0.05) return ch!;
    this.behind ??= streetTemplate(gen, Math.max(0, startIdx));
    return fillBehind(index, ch, Math.min(contentS, s0 + CHUNK_LEN), this.behind);
  }
  /** The same object every call (read it, don't keep it): called several times per frame by the loop. */
  stats() {
    const st = this.st;
    st.chunksBuilt = this.built; st.buildMsP95 = this.buildP95; st.drawCalls = this.ctx.renderer.info.render.calls;
    return st;
  }
  dispose(): void {
    this.releaseAll();
    this.ctx.scene.remove(this.root, this.coins, this.blob, this.glow);
    this.pool.dispose();
    this.mat.dispose(); this.shadowOnly.dispose(); this.coinMat.dispose(); this.coinGeo.dispose(); this.coins.dispose();
  }

  /** Debug and tests: live chunk indices, pool usage and coin slots. */
  debugInfo() {
    let verts = 0;
    for (const c of this.chunks.values()) for (const p of Object.values(c.parts)) verts += p?.geo.count ?? 0;
    return { chunks: [...this.chunks.keys()].sort((a, b) => a - b), geosCreated: this.pool.created, geosIdle: this.pool.idle,
      verts, coinSlotsUsed: VIEW.coinCapacity - this.freeSlots.length, originS: this.originS, edgeHalfW: this.opts.edgeHalfW };
  }

  // ── internals ─────────────────────────────────────────────────────────────────────────────────────────────────
  /** Builds one chunk; returns the render-side build time in ms (generation inside gen.chunk() is WG's budget). */
  private build(index: number): number {
    // Behind the run start there is no generated content: the start's street is continued backward.
    const ch = this.chunkFor(index);
    const t0 = performance.now();
    const w = this.writers;
    w.main.begin(this.pool.acquire()); w.near.begin(this.pool.acquire()); w.casters.begin(this.pool.acquire());
    buildChunk(ch, w.main, w.near, this.opts);
    const group = this.groupPool.pop() ?? new Group();
    group.name = `chunk${index}`;
    group.position.z = -(ch.s0 - this.originS);
    const parts: LiveChunk['parts'] = {};
    for (const role of ['main', 'near', 'casters'] as const) {
      const geo = w[role].end();
      if (geo.count === 0) { this.pool.release(geo); continue; }
      const mesh = this.meshPool.pop() ?? new Mesh();
      mesh.geometry = geo.geo;
      mesh.material = role === 'main' || (role === 'near' && !this.nearHidden) ? this.mat : this.shadowOnly;
      mesh.castShadow = true; mesh.receiveShadow = role !== 'casters';
      group.add(mesh);
      parts[role] = { mesh, geo };
    }
    const slots: number[] = [];
    for (const c of ch.coins) {
      const k = this.freeSlots.pop();
      if (k === undefined) break;                     // capacity reached: the rest of this chunk's coins are not drawn
      this.slotCoin[k] = c;
      slots.push(k);
      this.writeCoin(k);
      if (k + 1 > this.coins.count) this.coins.count = k + 1;
    }
    this.coins.instanceMatrix.needsUpdate = true;
    this.root.add(group);
    this.chunks.set(index, { index, s0: ch.s0, group, parts, slots, key: this.optsKey });
    this.built++;
    return performance.now() - t0;
  }

  private release(c: LiveChunk): void {
    this.root.remove(c.group);
    for (const p of Object.values(c.parts)) {
      if (!p) continue;
      c.group.remove(p.mesh);
      this.pool.release(p.geo);
      this.meshPool.push(p.mesh);
    }
    this.groupPool.push(c.group);
    for (const k of c.slots) { this.slotCoin[k] = null; this.coins.setMatrixAt(k, this.zero); this.freeSlots.push(k); }
    if (c.slots.length) this.coins.instanceMatrix.needsUpdate = true;
    this.chunks.delete(c.index);
  }

  private releaseAll(): void { for (const c of [...this.chunks.values()]) this.release(c); }

  private writeCoin(k: number): void {
    const c = this.slotCoin[k];
    if (!c || this.collected.has(c.id)) { this.coins.setMatrixAt(k, this.zero); return; }
    this.sc.setScalar(this.coinScale);
    this.coins.setMatrixAt(k, this.m4.compose(this.v.set(c.p.x, c.p.y, -(c.p.s - this.originS)), this.q, this.sc));
  }
  private writeAllCoins(): void {
    for (let k = 0; k < this.coins.count; k++) this.writeCoin(k);
    this.coins.instanceMatrix.needsUpdate = true;
  }
  private hideCoin(id: number): void {
    this.collected.add(id);
    for (let k = 0; k < this.coins.count; k++) {
      if (this.slotCoin[k]?.id === id) { this.coins.setMatrixAt(k, this.zero); this.coins.instanceMatrix.needsUpdate = true; }
    }
  }
  /** Coins stay ≥ CAMERA.minCoinPx on screen however far the camera zooms out (DESIGN §8). The framing is solved
   *  again only when the viewport or the lead speed (quantized to 0.05 m/s) changes. */
  private updateCoinScale(f: RenderFrame): void {
    const vp = f.viewport, cv = this.coinVp;
    const lead = Math.max(f.speed, speedAt(f.cur.t + CAMERA.zoomTau));
    const speedQ = Math.round(lead * 20);
    if (vp.wCss === cv.w && vp.hCss === cv.h && vp.safeTop === cv.safeTop && vp.aspect === cv.aspect && speedQ === cv.speedQ) return;
    cv.w = vp.wCss; cv.h = vp.hCss; cv.safeTop = vp.safeTop; cv.aspect = vp.aspect; cv.speedQ = speedQ;
    const H = solveFraming(speedQ / 20, vp).H;
    const s = Math.max(1, (CAMERA.minCoinPx * H) / Math.max(1, vp.hCss) / VIEW.coinDiameter);
    if (Math.abs(s - this.coinScale) > 0.02) { this.coinScale = s; this.writeAllCoins(); }
  }

  private updateShadow(f: RenderFrame, origin: number): void {
    const s = f.playerS, x = lerp(f.prev.p.x, f.cur.p.x, f.alpha), y = lerp(f.prev.p.y, f.cur.p.y, f.alpha);
    const gy = lerp(f.prev.groundY, f.cur.groundY, f.alpha);
    const u = Math.min(1, Math.max(0, y - gy) / 2);
    // Dark ground (by the surface colour under the board, or a neon-lit palette): the cyan glow instead of the blob.
    const p = this.ctx.palette(f.area, f.blend);
    const dark = (GROUND_LUM[f.cur.surface] ?? 1) < VIEW.glowGroundLum || p.neonGlow >= 0.5;
    this.blob.position.set(x, gy + 0.012, -(s - origin));
    this.glow.position.copy(this.blob.position);
    this.blob.visible = !dark; this.glow.visible = dark;
    (this.blob.material as MeshBasicMaterial).opacity = lerp(VIEW.shadowOpacity[0], VIEW.shadowOpacity[1], u);
    (this.glow.material as MeshBasicMaterial).opacity = VIEW.glowOpacity * (1 - 0.5 * u);
    const sun = getSun(this.ctx);
    if (sun) {
      const elev = (p.sunElevDeg * Math.PI) / 180, az = (35 * Math.PI) / 180;
      const tz = -(s + 14 - origin);
      sun.target.position.set(0, 0, tz);
      sun.position.set(-Math.sin(az) * Math.cos(elev) * 60, Math.sin(elev) * 60, tz + Math.cos(az) * Math.cos(elev) * 60);
      sun.target.updateMatrixWorld();
    }
  }

  /** Keeps the last 120 build times and their p95 (sorted here, at most once per frame, not in stats()). */
  private recordBuild(ms: number): void {
    this.buildMs.push(ms);
    if (this.buildMs.length > 120) this.buildMs.shift();
    const sorted = this.buildMs.slice().sort((a, b) => a - b);
    this.buildP95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
    if (ms > VIEW.buildBudgetMs * 4) console.debug(`[world] chunk build ${ms.toFixed(1)} ms`);
  }
}

const relLum = (hex: number) => 0.2126 * srgbToLinear(((hex >> 16) & 255) / 255) + 0.7152 * srgbToLinear(((hex >> 8) & 255) / 255)
  + 0.0722 * srgbToLinear((hex & 255) / 255);
const GROUND_LUM: Readonly<Record<string, number>> = Object.fromEntries(Object.entries(SURFACE_COLOR).map(([k, v]) => [k, relLum(v)]));

/** The street cross-section where generated content begins (the run's start), to continue it backward: the
 *  solid-free ground obstacles crossing that point (sidewalks and their curb edges) and one chunk length of decor. */
interface StreetTemplate { s: number; ground: Obstacle[]; decor: Decor[] }

/** Where generated content begins in a chunk (its earliest obstacle; obstacles that started earlier count from
 *  before the chunk). Infinity for a chunk with none. */
function firstContentS(ch: Chunk): number {
  let m = Infinity;
  for (const o of ch.obstacles) m = Math.min(m, o.s);
  return m;
}

function streetTemplate(gen: WorldGen, fromIdx: number): StreetTemplate | null {
  for (let i = fromIdx; i <= fromIdx + 2; i++) {
    const ch = gen.chunk(i);
    const s = firstContentS(ch);
    if (!Number.isFinite(s)) continue;
    const at = s + 0.05;
    const ground = ch.obstacles.filter((o) => !o.solids.length && !o.pits.length && o.slabs.length > 0 &&
      o.slabs.every((sl) => sl.kind === 'flat') && o.slabs.some((sl) => sl.s0 <= at && sl.s1 > at));
    const next = gen.chunk(i + 1);
    const decor = [...ch.decor, ...next.decor].filter((d) => d.s >= s && d.s < s + CHUNK_LEN);
    return { s, ground, decor };
  }
  return null;
}

/** Chunk `index` with [s0, sEnd) filled by the template street (the generated part, if any, is kept). */
function fillBehind(index: number, ch: Chunk | null, sEnd: number, t: StreetTemplate | null): Chunk {
  if (!t) return ch ?? emptyChunk(index);
  const s0 = index * CHUNK_LEN, at = t.s + 0.05;
  const obstacles: Obstacle[] = ch ? [...ch.obstacles] : [];
  const decor: Decor[] = ch ? [...ch.decor] : [];
  let id = -1 - (index + 1024) * 64;
  for (const o of t.ground) {
    obstacles.push({ ...o, id: id--, segment: -1, s: s0, len: sEnd - s0, solids: [], pits: [],
      slabs: o.slabs.filter((sl) => sl.s0 <= at && sl.s1 > at).map((sl) => ({ ...sl, s0, s1: sEnd })),
      edges: o.edges.filter((e) => e.a.s <= at && e.b.s > at).map((e) => {
        const u = (at - e.a.s) / Math.max(1e-6, e.b.s - e.a.s);
        const x = lerp(e.a.x, e.b.x, u), y = lerp(e.a.y, e.b.y, u);
        return { ...e, id: id--, a: { s: s0, x, y }, b: { s: sEnd, x, y } };
      }) });
  }
  // The template's decor repeated every chunk length backward; a backdrop never reaches into the generated street.
  const limit = sEnd < s0 + CHUNK_LEN - 1e-6 ? sEnd : Math.max(sEnd, t.s);
  for (const d of t.decor) {
    for (let k = Math.ceil((d.s - sEnd) / CHUNK_LEN + 1e-9); ; k++) {
      const s = d.s - k * CHUNK_LEN;
      if (s < s0) break;
      if (s >= sEnd) continue;
      const depth = d.params?.d;
      decor.push(depth === undefined ? { ...d, s } : { ...d, s, params: { ...d.params, d: Math.min(depth, limit - s) } });
    }
  }
  return { index, s0, len: CHUNK_LEN, area: ch?.area ?? 'downtown', blend: ch?.blend ?? null, obstacles, decor,
    coins: ch?.coins ?? [], safe: ch?.safe ?? [], segments: ch?.segments ?? [] };
}

/** Street behind the run start when nothing is generated at all: road plus the sidewalks at +0.15 on both sides. */
function emptyChunk(index: number): Chunk {
  const s0 = index * CHUNK_LEN, s1 = s0 + CHUNK_LEN;
  const walk = (x0: number, x1: number): Obstacle => ({ id: -1 - index * 2 - (x0 > 0 ? 1 : 0), kind: 'curb', area: 'downtown', segment: -1,
    s: s0, x: (x0 + x1) / 2, len: CHUNK_LEN, wid: x1 - x0, hgt: 0.15, rotY: 0, mirror: false, variant: 0, solids: [], pits: [], edges: [], tags: 0,
    slabs: [{ s0, s1, x0, x1, y0: 0.15, y1: 0.15, layer: 0, surface: 'concrete', kind: 'flat' }] });
  return { index, s0, len: CHUNK_LEN, area: 'downtown', blend: null, obstacles: [walk(-4.5, -3), walk(3, 4.5)], coins: [], decor: [],
    safe: [], segments: [] };
}

export type GreyboxView = WorldView & { debugInfo(): ReturnType<GreyboxWorldView['debugInfo']> };

export function createGreyboxWorldView(ctx: GfxContext): GreyboxView {
  return new GreyboxWorldView(ctx);
}
