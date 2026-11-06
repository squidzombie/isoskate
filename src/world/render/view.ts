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
import type { Chunk, Coin, Obstacle, WorldGen } from '../../core/world';
import { getSun, originOf, setGfxQuality } from '../../gfx';
import { solveFraming, yawForAspect } from './camera';
import { buildChunk, COLORS, DEFAULT_BUILD, GeoWriter, type BuildOptions } from './chunkBuilder';
import { GeoPool, type PooledGeo } from './pools';

export const VIEW = {
  buildBudgetMs: 4,          // TECH §8.6 (warn when a build takes 4× this)
  coinCapacity: 256,         // global coin instances
  coinDiameter: 0.32,        // m, the coin mesh
  shadowSize: [0.9, 1.1],    // contact shadow quad, m (x, s)
  shadowOpacity: [0.6, 0.25] as const,   // on the ground → at 2 m height (DESIGN §8)
  glowOpacity: 0.5,          // additive cyan contact glow on dark ground
  rebuildFrac: 0.1,          // rebuild chunks when the minimum edge width changes by more than this
} as const;

type Role = 'main' | 'near' | 'casters';
interface Part { mesh: Mesh; geo: PooledGeo }
interface LiveChunk { index: number; s0: number; group: Group; parts: Partial<Record<Role, Part>>; slots: number[]; key: number }

/** Edge stripe width so a grind edge stays ≥ CAMERA.minEdgePx wide at this viewport's widest run framing. */
export function buildOptionsFor(vp: Viewport): BuildOptions {
  const mPerPx = solveFraming(V_MAX, vp).H / Math.max(1, vp.hCss);
  const hw = Math.max(DEFAULT_BUILD.edgeHalfW, (CAMERA.minEdgePx * mPerPx) / 2);
  return { edgeHalfW: hw, inkPad: Math.max(DEFAULT_BUILD.inkPad, 0.8 * mPerPx) };
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
  // Coins: one global instanced layer (TECH §8.6).
  private readonly coinGeo = new CylinderGeometry(VIEW.coinDiameter / 2, VIEW.coinDiameter / 2, 0.05, 12).rotateX(Math.PI / 2 - (CAMERA.pitchDeg * Math.PI) / 180);
  private readonly coinMat = new MeshLambertMaterial({ color: COLORS.coin, emissive: 0x8a5a00 });
  private readonly coins = new InstancedMesh(this.coinGeo, this.coinMat, VIEW.coinCapacity);
  private readonly slotCoin: (Coin | null)[] = new Array<Coin | null>(VIEW.coinCapacity).fill(null);
  private readonly freeSlots: number[] = [];
  private readonly collected = new Set<number>();
  private coinScale = 1;
  // Contact shadow / glow.
  private readonly blob: Mesh;
  private readonly glow: Mesh;
  private originS = 0;
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
    this.blob = new Mesh(quad, new MeshBasicMaterial({ map: ctx.canvasTexture('contactShadow', 64, 64, radial('43,33,64')),
      transparent: true, depthWrite: false, opacity: VIEW.shadowOpacity[0], side: DoubleSide }));
    this.glow = new Mesh(quad, new MeshBasicMaterial({ map: ctx.canvasTexture('contactGlow', 64, 64, radial('255,255,255')),
      color: 0x3ff2ff, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: VIEW.glowOpacity, side: DoubleSide }));
    this.blob.name = 'contactShadow'; this.glow.name = 'contactGlow';
    this.blob.renderOrder = 1; this.glow.renderOrder = 1;
    this.glow.visible = false;
    ctx.scene.add(this.blob, this.glow);
  }

  attach(gen: WorldGen): void {
    this.releaseAll();
    this.gen = gen;
    this.collected.clear();
  }

  update(f: RenderFrame): void {
    for (const e of f.events) if (e.t === 'coin') this.hideCoin(e.id);
    if (!this.gen) return;
    const origin = originOf(f.playerS);
    if (origin !== this.originS) {
      this.originS = origin;
      for (const c of this.chunks.values()) c.group.position.z = -(c.s0 - origin);
      this.writeAllCoins();
    }
    // Build options follow the viewport (edge widths); stale chunks are rebuilt progressively.
    const want = buildOptionsFor(f.viewport);
    if (Math.abs(want.edgeHalfW - this.opts.edgeHalfW) > VIEW.rebuildFrac * this.opts.edgeHalfW || this.optsKey === 0) {
      this.opts = want; this.optsKey++;
    }
    const ci = Math.floor(f.playerS / CHUNK_LEN);
    const lo = ci - CHUNK_WINDOW.behind, hi = ci + CHUNK_WINDOW.ahead;
    for (const [i, c] of this.chunks) if (i < lo || i > hi) this.release(c);
    const hide = yawForAspect(f.viewport.aspect) > 0;
    if (hide !== this.nearHidden) {
      this.nearHidden = hide;
      for (const c of this.chunks.values()) if (c.parts.near) c.parts.near.mesh.material = hide ? this.shadowOnly : this.mat;
    }
    // At most one chunk build per frame (TECH §8.6): missing chunks nearest-first ahead, then behind, then stale ones.
    let target: number | null = null;                    // chunk indices can be negative (behind the start)
    for (let i = ci; i <= hi && target === null; i++) if (!this.chunks.has(i)) target = i;
    if (target === null && !this.chunks.has(lo)) target = lo;
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
  stats() {
    const sorted = [...this.buildMs].sort((a, b) => a - b);
    return { chunksBuilt: this.built, buildMsP95: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]! : 0,
      drawCalls: this.ctx.renderer.info.render.calls };
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
    // Behind the run start there is no generated content: an empty street chunk keeps the frame filled.
    const ch: Chunk = index >= 0 ? this.gen!.chunk(index) : emptyChunk(index);
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
  /** Coins stay ≥ CAMERA.minCoinPx on screen however far the camera zooms out (DESIGN §8). */
  private updateCoinScale(f: RenderFrame): void {
    const H = solveFraming(Math.max(f.speed, speedAt(f.cur.t + CAMERA.zoomTau)), f.viewport).H;
    const s = Math.max(1, (CAMERA.minCoinPx * H) / Math.max(1, f.viewport.hCss) / VIEW.coinDiameter);
    if (Math.abs(s - this.coinScale) > 0.02) { this.coinScale = s; this.writeAllCoins(); }
  }

  private updateShadow(f: RenderFrame, origin: number): void {
    const s = f.playerS, x = lerp(f.prev.p.x, f.cur.p.x, f.alpha), y = lerp(f.prev.p.y, f.cur.p.y, f.alpha);
    const gy = lerp(f.prev.groundY, f.cur.groundY, f.alpha);
    const u = Math.min(1, Math.max(0, y - gy) / 2);
    const dark = f.cur.surface === 'wetAsphalt' || f.area === 'neon';    // low ground luminance: cyan glow instead
    for (const m of [this.blob, this.glow]) m.position.set(x, gy + 0.012, -(s - origin));
    this.blob.visible = !dark; this.glow.visible = dark;
    (this.blob.material as MeshBasicMaterial).opacity = lerp(VIEW.shadowOpacity[0], VIEW.shadowOpacity[1], u);
    (this.glow.material as MeshBasicMaterial).opacity = VIEW.glowOpacity * (1 - 0.5 * u);
    const sun = getSun(this.ctx);
    if (sun) {
      const p = this.ctx.palette(f.area, f.blend);
      const elev = (p.sunElevDeg * Math.PI) / 180, az = (35 * Math.PI) / 180;
      const tz = -(s + 14 - origin);
      sun.target.position.set(0, 0, tz);
      sun.position.set(-Math.sin(az) * Math.cos(elev) * 60, Math.sin(elev) * 60, tz + Math.cos(az) * Math.cos(elev) * 60);
      sun.target.updateMatrixWorld();
    }
  }

  private recordBuild(ms: number): void {
    this.buildMs.push(ms);
    if (this.buildMs.length > 120) this.buildMs.shift();
    if (ms > VIEW.buildBudgetMs * 4) console.debug(`[world] chunk build ${ms.toFixed(1)} ms`);
  }
}

/** Street behind the run start (no generated content): road plus the sidewalks at +0.15 on both sides. */
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
