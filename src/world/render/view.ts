// world/render/view.ts: the WorldView (TECH §8.6–8.10). Streams chunk meshes around the player (CHUNK_WINDOW: 1 behind,
// 3 ahead; a chunk whose drawn content still reaches the screen is kept a little longer) with origin rebasing
// (TECH §8.2), builds at most one chunk per frame into pooled buffers, five meshes per chunk (opaque, x-ray,
// emissive, glow cards, buildings + casters), keeps the global instanced layers (decals, lantern spheres, coins),
// and every frame applies the palette (DESIGN §18.1, 8 s blends): hemisphere + sun colours and intensities, the sun
// and its texel-snapped shadow box, exposure, haze, window-lit ratio, neon glow, the sky (menus) and the HUD-band sky
// glow (run). Also: the always-on contact shadow (dark blob on light ground, cyan glow on dark ground), the crash
// grading (uDesat 0.4) and coral outline flash on the obstacle that caused it, the full-width hazard warning flash,
// the maglev train pass, quality tiers with work-time auto-adjust, the Roll-out chunk cache and context-loss rebuild.
import {
  AdditiveBlending, BackSide, BoxGeometry, Color, DoubleSide, Group, LinearFilter, LinearSRGBColorSpace, Mesh, MeshBasicMaterial,
  NoColorSpace, PlaneGeometry, Vector3, type Material, type Texture,
} from 'three';
import type { AreaId, QualityTier } from '../../core/ids';
import { clamp, lerp } from '../../core/math';
import { CAMERA, CHUNK_LEN, CHUNK_WINDOW, V_MAX, speedAt } from '../../core/tuning';
import type { GfxContext, PaletteSample, RenderFrame, Viewport, WorldView } from '../../core/view';
import type { Chunk, Coin, Decor, Obstacle, WorldGen } from '../../core/world';
import { LIGHT_SCALE, getHemi, getSun, originOf, setGfxQuality, setPaletteSource, sharedUniforms, type SharedUniforms } from '../../gfx';
import { RIG_STATE, solveFraming, yawForAspect } from './camera';
import { buildChunk, chunkHash, type AreaSource } from './chunkBuilder';
import { DEFAULT_BUILD, type BuildOptions, type DecalRec, type LanternRec } from './kits/common';
import type { AmbientRec } from './kits/decor';
import { COIN, CoinLayer, DecalLayer, LanternLayer } from './layers';
import { createWorldMaterials, type WorldMaterials } from './materials';
import { CONTACT, COLORS, SURFACE_COLOR, sampleLook, samplePalette } from './palette';
import { AutoQuality } from './quality';
import { CONTACT_SHADOW, CRASH_LOOK, QUALITY, RENDER, STREAM } from './render.config';
import { Sky } from './sky';
import { drawDecalAtlas, DECAL_ATLAS_SIZE } from './textures/decals';
import { drawGroundAtlas, GROUND_ATLAS_SIZE } from './textures/ground';
import { drawSignAtlas, SIGN_ATLAS } from './textures/signs';
import { GeoPool, type PooledGeo } from './pools';
import { GeoWriter, srgbToLinear, type KitTargets } from './writer';

export const VIEW = {
  coinCapacity: COIN.capacity, coinDiameter: COIN.diameter,
  inkPadPx: 1.6,             // the ink underline shows ≥ this many CSS px beside the cream stripe (reads on light tops)
} as const;

type Target = keyof KitTargets;
const TARGETS: readonly Target[] = ['o', 'x', 'e', 'g', 'b'];
interface Part { mesh: Mesh; geo: PooledGeo }
interface LiveChunk {
  index: number; s0: number; group: Group; parts: Partial<Record<Target, Part>>;
  coinSlots: number[]; decalSlots: number[]; lanternSlots: number[];
  decals: DecalRec[]; lanterns: LanternRec[]; ambient: AmbientRec[]; far: number;
  key: number; hash: number; chunk: Chunk; tris: number;
}

/** Edge stripe width so a grind edge stays ≥ CAMERA.minEdgePx wide at this viewport's widest run framing. */
export function buildOptionsFor(vp: Viewport): BuildOptions {
  const mPerPx = solveFraming(V_MAX, vp).H / Math.max(1, vp.hCss);
  const hw = Math.max(DEFAULT_BUILD.edgeHalfW, (CAMERA.minEdgePx * mPerPx) / 2);
  return { edgeHalfW: hw, inkPad: Math.max(DEFAULT_BUILD.inkPad, VIEW.inkPadPx * mPerPx) };
}

/** Ambient emitters of the live chunks, per context (vfx/ reads them through world/render's index). */
const AMBIENT = new WeakMap<GfxContext, AmbientRec[]>();
export function worldAmbient(ctx: GfxContext): readonly AmbientRec[] { return AMBIENT.get(ctx) ?? []; }

const relLum = (hex: number) => 0.2126 * srgbToLinear(((hex >> 16) & 255) / 255) + 0.7152 * srgbToLinear(((hex >> 8) & 255) / 255)
  + 0.0722 * srgbToLinear((hex & 255) / 255);
const GROUND_LUM: Readonly<Record<string, number>> = Object.fromEntries(Object.entries(SURFACE_COLOR).map(([k, v]) => [k, relLum(v)]));

/** document.timeline.currentTime is the rAF frame time inside a frame callback (the start of this frame's work). */
function frameStartMs(): number | null {
  try {
    const t = (globalThis as { document?: { timeline?: { currentTime?: unknown } } }).document?.timeline?.currentTime;
    return typeof t === 'number' ? t : null;
  } catch { return null; }
}
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : 0);

class WorldViewImpl implements WorldView {
  private gen: WorldGen | null = null;
  private readonly root = new Group();
  private readonly chunks = new Map<number, LiveChunk>();
  /** Roll-out cache (TECH §8.6): released chunks −1, 0, 1 keep their meshes for the next run (content-hashed). */
  private readonly cache = new Map<number, LiveChunk>();
  private readonly pools: Record<Target, GeoPool> = { o: new GeoPool(8192), x: new GeoPool(1024), e: new GeoPool(2048), g: new GeoPool(256), b: new GeoPool(4096) };
  private readonly meshPool: Mesh[] = [];
  private readonly groupPool: Group[] = [];
  private readonly writers: KitTargets = { o: new GeoWriter(), x: new GeoWriter(), e: new GeoWriter(), g: new GeoWriter(), b: new GeoWriter() };
  private readonly tex: { ground: Texture; signs: Texture; decals: Texture };
  private readonly mats: WorldMaterials;
  private readonly matOf: Record<Target, Material>;
  private readonly u: SharedUniforms;
  private readonly decals: DecalLayer;
  private readonly lanterns: LanternLayer;
  private readonly coins: CoinLayer;
  private readonly sky: Sky;
  private opts: BuildOptions = DEFAULT_BUILD;
  private optsKey = 0;
  private readonly optsVp = { w: -1, h: -1, safeTop: -1, aspect: -1 };
  private readonly coinVp = { w: -1, h: -1, safeTop: -1, aspect: -1, speedQ: -1 };
  private buildP95 = 0;
  private readonly buildMs: number[] = [];
  private readonly st = { chunksBuilt: 0, buildMsP95: 0, drawCalls: 0 };
  private built = 0;
  private cacheHits = 0;
  private originS = 0;
  private startS: number | null = null;
  private behind: StreetTemplate | null = null;
  private firstIndex: number | null = null;
  private readonly areaSrc: AreaSource = { areaAt: (s) => (this.gen ? this.gen.areaAt(s) : { area: 'downtown' as AreaId, blend: null }) };
  // Contact shadow / glow under the board.
  private readonly blob: Mesh;
  private readonly glow: Mesh;
  // Crash grading and the coral outline flash.
  private desatTarget = 0;
  private flash: Group | null = null;
  private flashT = 0;
  private readonly flashMat = new MeshBasicMaterial({ color: COLORS.coral, side: BackSide, toneMapped: false });
  // Full-width hazard warning flash (≤ 2 Hz over the 1.6 s before contact).
  private warnT = 0;
  // Maglev train pass.
  private readonly train: Mesh;
  private trainClock = 0;
  // Draw-call split (main vs shadow pass), measured by a probe drawn first in the main pass.
  private readonly probe: Mesh;
  private shadowCalls = 0;
  private mainCalls = 0;
  // Quality.
  private readonly auto: AutoQuality;
  private autoOn: boolean;
  private lastFrameStart = -1;
  private workMs = 0;
  private time = 0;
  private readonly pal: PaletteSample = { ...samplePalette('downtown', null) };
  private readonly v1 = new Vector3(); private readonly v2 = new Vector3(); private readonly v3 = new Vector3();
  private readonly yAxis = new Vector3(0, 1, 0);

  constructor(private readonly ctx: GfxContext) {
    this.root.name = 'world';
    ctx.scene.add(this.root);
    this.u = sharedUniforms(ctx);
    setPaletteSource(ctx, (a, b) => samplePalette(a, b));
    const ground = ctx.canvasTexture('wa:ground', GROUND_ATLAS_SIZE, GROUND_ATLAS_SIZE, drawGroundAtlas);
    ground.colorSpace = NoColorSpace; ground.flipY = false; ground.generateMipmaps = false;
    ground.minFilter = LinearFilter; ground.needsUpdate = true;       // magnified in the run view: no mips, no seams
    const signs = ctx.canvasTexture('wa:signs', SIGN_ATLAS, SIGN_ATLAS, drawSignAtlas);
    const decals = ctx.canvasTexture('wa:decals', DECAL_ATLAS_SIZE, DECAL_ATLAS_SIZE, drawDecalAtlas);
    this.tex = { ground, signs, decals };
    // Brand signs use the game fonts: redraw the sign atlas once they have loaded.
    try {
      const ready = (globalThis as { document?: { fonts?: { ready?: Promise<unknown> } } }).document?.fonts?.ready;
      void ready?.then(() => {
        const cv = (signs as Texture & { image?: HTMLCanvasElement }).image;
        const c2 = cv?.getContext?.('2d');
        if (c2) { drawSignAtlas(c2); signs.needsUpdate = true; }
      });
    } catch { /* no DOM (node tests) */ }
    this.mats = createWorldMaterials(ctx, { ground, signs });
    this.matOf = { o: this.mats.opaque, x: this.mats.xray, e: this.mats.emissive, g: this.mats.glow, b: this.mats.opaque };
    this.decals = new DecalLayer(ctx, decals);
    this.lanterns = new LanternLayer(ctx);
    this.coins = new CoinLayer(ctx);
    ctx.scene.add(this.decals.mesh, this.lanterns.mesh, this.coins.mesh);
    this.sky = new Sky(ctx);
    this.sky.addTo(ctx.scene);
    // Contact shadow (dark radial blob) and the additive cyan contact glow (DESIGN §8).
    const radial = (rgb: string) => (c: CanvasRenderingContext2D) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.6, `rgba(${rgb},0.5)`); g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    };
    const quad = new PlaneGeometry(CONTACT_SHADOW.size[0], CONTACT_SHADOW.size[1]).rotateX(-Math.PI / 2);
    this.blob = new Mesh(quad, new MeshBasicMaterial({ map: ctx.canvasTexture('contactShadow', 64, 64, radial(CONTACT.shadowRgb)),
      transparent: true, depthWrite: false, opacity: CONTACT_SHADOW.opacity[0], side: DoubleSide }));
    this.glow = new Mesh(quad, new MeshBasicMaterial({ map: ctx.canvasTexture('contactGlow', 64, 64, radial('255,255,255')),
      color: CONTACT.glow, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: CONTACT_SHADOW.glowOpacity, side: DoubleSide }));
    this.blob.name = 'contactShadow'; this.glow.name = 'contactGlow';
    this.blob.renderOrder = 2; this.glow.renderOrder = 2;
    this.glow.visible = false;
    ctx.scene.add(this.blob, this.glow);
    // Maglev train: a long light streak (additive) along the guideway.
    this.train = new Mesh(new BoxGeometry(0.5, 0.45, 1), new MeshBasicMaterial({ color: 0xbff9ff, transparent: true, opacity: 0.9,
      blending: AdditiveBlending, depthWrite: false }));
    this.train.name = 'maglevTrain'; this.train.visible = false; this.train.frustumCulled = false;
    ctx.scene.add(this.train);
    // Probe: drawn first in the main pass (empty draw range), records the shadow pass's draw calls.
    this.probe = new Mesh(new PlaneGeometry(0.01, 0.01), new MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    this.probe.geometry.setDrawRange(0, 0);
    this.probe.frustumCulled = false; this.probe.renderOrder = -1e9; this.probe.name = 'callProbe';
    this.probe.onBeforeRender = (r) => { this.shadowCalls = r.info.render.calls; };
    ctx.scene.add(this.probe);
    ctx.scene.onAfterRender = (r) => {
      this.mainCalls = r.info.render.calls - this.shadowCalls;
      if (this.lastFrameStart >= 0) this.workMs = Math.max(0, nowMs() - this.lastFrameStart);
    };
    this.auto = new AutoQuality(ctx.quality);
    this.autoOn = autoAllowed();
  }

  attach(gen: WorldGen): void {
    // Roll-out chunks (−1..1) go to the cache for the new run; the rest are released.
    for (const c of [...this.chunks.values()]) this.release(c);
    this.gen = gen;
    this.coins.clearCollected();
    this.startS = null; this.behind = null; this.firstIndex = null;
    this.desatTarget = 0; this.u.uDesat.value = 0;
    this.clearFlash();
    this.warnT = 0;
    this.auto.resetRun();
  }

  update(f: RenderFrame): void {
    const fs = frameStartMs();
    // Auto quality: last frame's work (frame start → end of render submit) against the frame interval.
    if (fs !== null) {
      if (this.lastFrameStart >= 0 && this.autoOn && this.workMs > 0 && fs > this.lastFrameStart) {
        const next = this.auto.frame(this.workMs, fs - this.lastFrameStart);
        if (next) this.applyTier(next);
      }
      this.lastFrameStart = fs;
    } else this.lastFrameStart = nowMs();
    this.time = (this.time + Math.max(0, f.dt)) % 600;
    this.u.uTime.value = this.time;
    for (const e of f.events) {
      if (e.t === 'coin') this.coins.hide(e.id);
      else if (e.t === 'crash' && !e.god) { this.desatTarget = CRASH_LOOK.desat; if (e.obstacleId !== null) this.startFlash(e.obstacleId); }
      else if (e.t === 'hazardWarn') this.warnT = Math.max(this.warnT, e.inSec);
      else if (e.t === 'runStart') { this.desatTarget = 0; this.u.uDesat.value = 0; }
    }
    this.updateGrading(f);
    if (!this.gen) { this.applyPalette(f); return; }
    const fresh = this.startS === null;                  // first frame of a run (or the Title preview)
    if (fresh) this.startS = f.playerS;
    const origin = originOf(f.playerS);
    if (origin !== this.originS) {
      this.originS = origin;
      for (const c of this.chunks.values()) c.group.position.z = -(c.s0 - origin);
      this.coins.rebase(origin); this.decals.rebase(origin); this.lanterns.rebase(origin);
    }
    const vp = f.viewport, ov = this.optsVp;
    if (vp.wCss !== ov.w || vp.hCss !== ov.h || vp.safeTop !== ov.safeTop || vp.aspect !== ov.aspect) {
      ov.w = vp.wCss; ov.h = vp.hCss; ov.safeTop = vp.safeTop; ov.aspect = vp.aspect;
      const want = buildOptionsFor(vp);
      if (Math.abs(want.edgeHalfW - this.opts.edgeHalfW) > STREAM.rebuildFrac * this.opts.edgeHalfW || this.optsKey === 0) {
        this.opts = want; this.optsKey++;
      }
    }
    const ci = Math.floor(f.playerS / CHUNK_LEN);
    const lo = ci - CHUNK_WINDOW.behind, hi = ci + CHUNK_WINDOW.ahead;
    for (const c of [...this.chunks.values()]) {
      if (c.index > hi || (c.index < lo && (c.far < f.playerS - STREAM.keepBehindM || c.index < ci - STREAM.maxBehind))) this.release(c);
    }
    if (fresh) {
      // The first frame of a run makes the three chunks the camera sees available (the one under the skater, the one
      // behind it, the next ahead) and nothing else (TECH §8.6 exception); a retry restores them from the cache.
      this.firstIndex = lo;
      for (const i of [ci, lo, ci + 1]) if (!this.chunks.has(i)) this.recordBuild(this.build(i));
    } else {
      // Then at most one chunk build per frame: the current one, the one behind, the missing ones ahead nearest-first,
      // then stale ones (edge widths changed with the viewport).
      let target: number | null = null;
      if (!this.chunks.has(ci)) target = ci;
      else if (!this.chunks.has(lo)) target = lo;
      for (let i = ci + 1; i <= hi && target === null; i++) if (!this.chunks.has(i)) target = i;
      if (target === null) for (let i = ci; i <= hi && target === null; i++) { const c = this.chunks.get(i); if (c && c.key !== this.optsKey) target = i; }
      if (target !== null) {
        const old = this.chunks.get(target);
        if (old) this.release(old, true);
        this.recordBuild(this.build(target));
      }
    }
    this.updateCoinScale(f);
    this.applyPalette(f);
    this.updateShadow(f, origin);
    this.updateTrain(f, origin);
    this.updateFlash(f, origin);
  }

  setQuality(q: QualityTier): void { this.autoOn = false; this.applyTier(q); }
  /** After a context restore: every chunk is rebuilt from the generator (deterministic) with the collected coins. */
  rebuildGPU(): void {
    const g = this.gen, got = [...this.coins.collectedIds];
    for (const c of [...this.chunks.values()]) this.release(c, true);
    for (const c of [...this.cache.values()]) this.freeChunk(c);
    this.cache.clear();
    for (const t of [this.tex.ground, this.tex.signs, this.tex.decals]) t.needsUpdate = true;
    this.gen = g; this.startS = null; this.behind = null; this.firstIndex = null;
    this.coins.setCollected(got);
  }
  stats() {
    const st = this.st;
    st.chunksBuilt = this.built; st.buildMsP95 = this.buildP95; st.drawCalls = this.ctx.renderer.info.render.calls;
    return st;
  }
  dispose(): void {
    for (const c of [...this.chunks.values()]) this.release(c, true);
    for (const c of [...this.cache.values()]) this.freeChunk(c);
    this.cache.clear();
    this.clearFlash();
    this.ctx.scene.remove(this.root, this.blob, this.glow, this.train, this.probe, this.decals.mesh, this.lanterns.mesh, this.coins.mesh);
    for (const p of Object.values(this.pools)) p.dispose();
    this.mats.dispose(); this.decals.dispose(); this.lanterns.dispose(); this.coins.dispose(); this.sky.dispose();
    setPaletteSource(this.ctx, null);
  }

  /** Debug and tests: live chunks, pool usage, layer usage, draw-call split, cache hits, quality. */
  debugInfo() {
    let verts = 0, tris = 0, maxChunkTris = 0;
    for (const c of this.chunks.values()) {
      tris += c.tris; maxChunkTris = Math.max(maxChunkTris, c.tris);
      for (const p of Object.values(c.parts)) verts += p?.geo.count ?? 0;
    }
    let geosCreated = 0, geosIdle = 0;
    for (const p of Object.values(this.pools)) { geosCreated += p.created; geosIdle += p.idle; }
    return { chunks: [...this.chunks.keys()].sort((a, b) => a - b), cached: [...this.cache.keys()].sort((a, b) => a - b), geosCreated, geosIdle,
      verts, chunkTris: tris, maxChunkTris, coinSlotsUsed: this.coins.used, decalsUsed: this.decals.used, lanternsUsed: this.lanterns.used,
      originS: this.originS, edgeHalfW: this.opts.edgeHalfW, mainCalls: this.mainCalls, shadowCalls: this.shadowCalls,
      chunksBuilt: this.built, cacheHits: this.cacheHits, buildMsP95: this.buildP95, quality: this.ctx.quality, autoQuality: this.autoOn,
      bench: (n?: number) => this.benchBuild(n) };
  }

  /** Debug / wa.spec: rebuilds the live chunk under `index` (default: the nearest ahead) n times into scratch buffers
   *  and returns the build-time distribution (ms). The live chunk is untouched. */
  benchBuild(n = 40, index?: number): { p50: number; p95: number; max: number; tris: number } {
    const idx = index ?? Math.max(...this.chunks.keys());
    const ch = this.chunks.get(idx)?.chunk;
    if (!ch) return { p50: 0, p95: 0, max: 0, tris: 0 };
    const w = this.writers, t: number[] = [];
    let tris = 0;
    for (let k = 0; k < n; k++) {
      for (const tg of TARGETS) w[tg].begin(this.pools[tg].acquire());
      const t0 = nowMs();
      buildChunk(ch, w, this.areaSrc, this.opts, QUALITY[this.ctx.quality].glowCards);
      t.push(nowMs() - t0);
      tris = 0;
      for (const tg of TARGETS) { tris += w[tg].tris; this.pools[tg].release(w[tg].end()); }
    }
    t.sort((a, b) => a - b);
    return { p50: t[Math.floor(n / 2)]!, p95: t[Math.min(n - 1, Math.floor(n * 0.95))]!, max: t[n - 1]!, tris };
  }

  // ── internals ─────────────────────────────────────────────────────────────────────────────────────────────────
  private applyTier(q: QualityTier): void {
    setGfxQuality(this.ctx, q);
    this.auto.tier = q;
  }

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

  /** Builds (or restores from the cache) one chunk; returns the render-side build time in ms (−1 for a cache hit). */
  private build(index: number): number {
    const ch = this.chunkFor(index);
    const t0 = nowMs();
    const glowCards = QUALITY[this.ctx.quality].glowCards;
    // Only Roll-out chunks (−1..1) can be cached: the content hash is computed for those alone.
    const hash = index <= 1 ? chunkHash(ch, this.areaSrc, this.optsKey * 97 + glowCards + (index === this.firstIndex ? 7 : 0)) : 0;
    const cached = this.cache.get(index);
    if (cached && cached.hash === hash) {
      this.cache.delete(index);
      cached.chunk = ch;
      cached.group.position.z = -(cached.s0 - this.originS);
      this.root.add(cached.group);
      this.claimLayers(cached, ch.coins);
      this.chunks.set(index, cached);
      this.cacheHits++;
      this.refreshAmbient();
      return -1;
    }
    if (cached) { this.cache.delete(index); this.freeChunk(cached); }
    const w = this.writers;
    for (const t of TARGETS) w[t].begin(this.pools[t].acquire());
    const out = buildChunk(ch, w, this.areaSrc, this.opts, glowCards, index === this.firstIndex);
    const group = this.groupPool.pop() ?? new Group();
    group.name = `chunk${index}`;
    group.position.z = -(ch.s0 - this.originS);
    const parts: LiveChunk['parts'] = {};
    let tris = 0;
    for (const t of TARGETS) {
      tris += w[t].tris;
      const geo = w[t].end();
      if (geo.count === 0) { this.pools[t].release(geo); continue; }
      const mesh = this.meshPool.pop() ?? new Mesh();
      mesh.geometry = geo.geo;
      mesh.material = this.matOf[t];
      mesh.castShadow = t === 'o' || t === 'x' || t === 'b';
      mesh.receiveShadow = t === 'o' || t === 'x' || t === 'b';
      mesh.renderOrder = t === 'g' ? 3 : 0;
      mesh.name = `chunk${index}:${t}`;
      group.add(mesh);
      parts[t] = { mesh, geo };
    }
    const lc: LiveChunk = { index, s0: ch.s0, group, parts, coinSlots: [], decalSlots: [], lanternSlots: [], decals: out.decals,
      lanterns: out.lanterns, ambient: out.ambient, far: out.far, key: this.optsKey, hash, chunk: ch, tris };
    this.claimLayers(lc, ch.coins);
    this.root.add(group);
    this.chunks.set(index, lc);
    this.built++;
    this.refreshAmbient();
    return nowMs() - t0;
  }

  private claimLayers(c: LiveChunk, coins: readonly Coin[]): void {
    c.coinSlots.length = 0; c.decalSlots.length = 0; c.lanternSlots.length = 0;
    for (const coin of coins) { const k = this.coins.add(coin); if (k >= 0) c.coinSlots.push(k); }
    for (const d of c.decals) { const k = this.decals.add(d); if (k >= 0) c.decalSlots.push(k); }
    for (const l of c.lanterns) { const k = this.lanterns.add(l); if (k >= 0) c.lanternSlots.push(k); }
  }
  private freeLayers(c: LiveChunk): void {
    for (const k of c.coinSlots) this.coins.remove(k);
    for (const k of c.decalSlots) this.decals.remove(k);
    for (const k of c.lanternSlots) this.lanterns.remove(k);
    c.coinSlots.length = 0; c.decalSlots.length = 0; c.lanternSlots.length = 0;
  }

  /** Releases a live chunk: Roll-out chunks (−1, 0, 1) of the current build key go to the cache, the rest back to
   *  the pools. `noCache` forces a free (stale rebuilds, context restore). */
  private release(c: LiveChunk, noCache = false): void {
    this.root.remove(c.group);
    this.freeLayers(c);
    this.chunks.delete(c.index);
    if (!noCache && c.index >= -1 && c.index <= 1 && c.key === this.optsKey) {
      const old = this.cache.get(c.index);
      if (old && old !== c) this.freeChunk(old);
      this.cache.set(c.index, c);
    } else this.freeChunk(c);
    this.refreshAmbient();
  }
  private freeChunk(c: LiveChunk): void {
    for (const t of TARGETS) {
      const p = c.parts[t];
      if (!p) continue;
      c.group.remove(p.mesh);
      this.pools[t].release(p.geo);
      this.meshPool.push(p.mesh);
    }
    c.parts = {};
    this.groupPool.push(c.group);
  }
  private refreshAmbient(): void {
    const list: AmbientRec[] = [];
    for (const c of this.chunks.values()) for (const a of c.ambient) list.push(a);
    AMBIENT.set(this.ctx, list);
  }

  /** Coins stay ≥ CAMERA.minCoinPx on screen however far the camera zooms out (DESIGN §8). */
  private updateCoinScale(f: RenderFrame): void {
    const vp = f.viewport, cv = this.coinVp;
    const lead = Math.max(f.speed, speedAt(f.cur.t + CAMERA.zoomTau));
    const speedQ = Math.round(lead * 20);
    if (vp.wCss === cv.w && vp.hCss === cv.h && vp.safeTop === cv.safeTop && vp.aspect === cv.aspect && speedQ === cv.speedQ) return;
    cv.w = vp.wCss; cv.h = vp.hCss; cv.safeTop = vp.safeTop; cv.aspect = vp.aspect; cv.speedQ = speedQ;
    const H = solveFraming(speedQ / 20, vp).H;
    this.coins.setScale(Math.max(1, (CAMERA.minCoinPx * H) / Math.max(1, vp.hCss) / COIN.diameter));
  }

  /** Palette → lights, exposure, background, haze, emissive / glow / window-lit uniforms, sky (DESIGN §18.1–18.3). */
  private applyPalette(f: RenderFrame): void {
    const p = samplePalette(f.area, f.blend, this.pal), look = sampleLook(f.area, f.blend);
    const u = this.u, menu = RIG_STATE.menu;
    const hemi = getHemi(this.ctx), sun = getSun(this.ctx);
    if (hemi) { hemi.color.setHex(p.hemiSky); hemi.groundColor.setHex(p.hemiGround); hemi.intensity = LIGHT_SCALE * look.hemiK; }
    if (sun) { sun.color.setHex(p.sunColor); sun.intensity = p.sunIntensity * LIGHT_SCALE * look.sunK; }
    this.ctx.renderer.toneMappingExposure = p.exposure;
    const bg = this.ctx.scene.background;
    if (bg instanceof Color) bg.setHex(menu ? p.horizon : p.fog);
    u.uHaze.value.setHex(menu ? p.horizon : p.fog, LinearSRGBColorSpace);   // mixed in output space: the raw sRGB values
    u.uHazeAmt.value = menu ? RENDER.hazeMenuAmt : look.haze;
    u.uHazeMode.value = menu ? 1 : 0;
    u.uHazeY0.value = RENDER.hazeY0; u.uHazeNear.value = RENDER.hazeMenuNear; u.uHazeFar.value = RENDER.hazeMenuFar;
    const el = this.ctx.renderer.domElement;
    u.uRes.value.set(el.width || f.viewport.wCss, el.height || f.viewport.hCss);
    const ng = clamp(p.neonGlow, 0, 1);
    u.uEmis.value = lerp(RENDER.emisMin, RENDER.emisMax, ng);
    u.uGlow.value = lerp(RENDER.glowMin, RENDER.glowMax, ng);
    u.uWindowLit.value = p.windowLit;
    u.uSkyZenith.value.setHex(p.zenith); u.uSkyMid.value.setHex(p.mid); u.uSkyHorizon.value.setHex(p.horizon);
    u.uHideNear.value = !menu && yawForAspect(f.viewport.aspect) > 0 ? 1 : 0;
    // Warning flash: ≤ 2 Hz while the 1.6 s warning runs (DESIGN §9).
    if (this.warnT > 0) { this.warnT = Math.max(0, this.warnT - Math.max(0, f.dt)); u.uWarn.value = 0.5 + 0.5 * Math.sin(this.time * Math.PI * 4); }
    else u.uWarn.value = 0;
    const cam = RIG_STATE.camera;
    if (cam) this.sky.update(p, look.sunDisc, cam, Math.max(0, f.dt), RIG_STATE.hudTop, look.skyGlow, ng, menu);
  }

  private updateGrading(f: RenderFrame): void {
    const d = this.u.uDesat;
    const k = 1 - Math.exp(-Math.max(0, f.dt) / CRASH_LOOK.easeIn);
    d.value += (this.desatTarget - d.value) * (this.desatTarget > d.value ? k : 1);
  }

  /** The coral inverted-hull outline flash on the obstacle that caused a crash (0.6 s, DESIGN §9 / TECH §8.6). */
  private startFlash(id: number): void {
    let ob: Obstacle | undefined;
    for (const c of this.chunks.values()) { ob = c.chunk.obstacles.find((o) => o.id === id); if (ob) break; }
    if (!ob || !ob.solids.length) return;
    this.clearFlash();
    const g = new Group();
    const o = CRASH_LOOK.outline;
    for (const so of ob.solids) {
      const b = so.box;
      const m = new Mesh(new BoxGeometry(b.x1 - b.x0 + 2 * o, b.y1 - b.y0 + 2 * o, b.s1 - b.s0 + 2 * o), this.flashMat);
      m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, -((b.s0 + b.s1) / 2));
      g.add(m);
    }
    g.name = 'crashFlash';
    this.flash = g;
    this.flashT = CRASH_LOOK.flashSec;
    this.ctx.scene.add(g);
  }
  private updateFlash(f: RenderFrame, origin: number): void {
    if (!this.flash) return;
    this.flashT -= Math.max(0, f.dt);
    if (this.flashT <= 0) { this.clearFlash(); return; }
    this.flash.position.z = origin;
    this.flash.visible = this.flashT > CRASH_LOOK.flashSec * 0.5 || Math.floor(this.flashT * 12) % 2 === 0;
  }
  private clearFlash(): void {
    if (!this.flash) return;
    this.ctx.scene.remove(this.flash);
    this.flash.traverse((m) => { const mm = m as Mesh; if (mm.isMesh) mm.geometry.dispose(); });
    this.flash = null;
  }

  /** Sora Line pass: a light streak along the guideway every ~20 s while a maglev beam is in view. */
  private updateTrain(f: RenderFrame, origin: number): void {
    let beam: Decor | null = null;
    for (const c of this.chunks.values()) { for (const d of c.chunk.decor) if (d.kind === 'maglev_beam') { beam = d; break; } if (beam) break; }
    if (!beam) { this.train.visible = false; return; }
    let period = 20, len = 40, speed = 45;
    for (const c of this.chunks.values()) for (const a of c.ambient) if (a.kind === 'train') { period = a.rate; len = a.len; speed = a.p.speed ?? 45; }
    this.trainClock = (this.trainClock + Math.max(0, f.dt)) % Math.max(4, period);
    const run = this.trainClock * speed;
    const s = f.playerS + 70 - run;
    this.train.visible = run < 160;
    this.train.scale.set(1, 1, len);
    this.train.position.set(beam.x, Math.max(7, beam.y) + 0.55, -(s - origin));
  }

  private updateShadow(f: RenderFrame, origin: number): void {
    const s = f.playerS, x = lerp(f.prev.p.x, f.cur.p.x, f.alpha), y = lerp(f.prev.p.y, f.cur.p.y, f.alpha);
    const gy = lerp(f.prev.groundY, f.cur.groundY, f.alpha);
    const u = Math.min(1, Math.max(0, y - gy) / CONTACT_SHADOW.fadeHeight);
    const p = this.pal;
    const dark = (GROUND_LUM[f.cur.surface] ?? 1) < CONTACT_SHADOW.glowGroundLum || p.neonGlow >= 0.5;
    this.blob.position.set(x, gy + 0.012, -(s - origin));
    this.glow.position.copy(this.blob.position);
    this.blob.visible = !dark && !RIG_STATE.menu; this.glow.visible = dark && !RIG_STATE.menu;
    (this.blob.material as MeshBasicMaterial).opacity = lerp(CONTACT_SHADOW.opacity[0], CONTACT_SHADOW.opacity[1], u);
    (this.glow.material as MeshBasicMaterial).opacity = CONTACT_SHADOW.glowOpacity * (1 - 0.5 * u);
    const sun = getSun(this.ctx);
    if (!sun) return;
    // Sun behind the camera and to the left (azimuth 35°), elevation from the palette. The shadow box covers about
    // x ±10, s ∈ [s_p − 6, s_p + 34] (DESIGN §18.2) and snaps to its texel grid in light space, so shadows never crawl.
    const elev = (p.sunElevDeg * Math.PI) / 180, az = (35 * Math.PI) / 180;
    const dir = this.v1.set(-Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev)).normalize();
    const right = this.v2.crossVectors(this.yAxis, dir).normalize();
    const up = this.v3.crossVectors(dir, right).normalize();
    const half = 24, map = sun.shadow.mapSize.x || 1024, texel = (2 * half) / map;
    const cz = -(s + 14 - origin);
    const r0 = Math.round((cz * right.z) / texel) * texel, u0 = Math.round((cz * up.z) / texel) * texel, d0 = cz * dir.z;
    sun.target.position.set(right.x * r0 + up.x * u0 + dir.x * d0, right.y * r0 + up.y * u0 + dir.y * d0, right.z * r0 + up.z * u0 + dir.z * d0);
    sun.position.copy(sun.target.position).addScaledVector(dir, 90);
    const cam = sun.shadow.camera;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 1; cam.far = 200;
    cam.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
  }

  /** Keeps the last 120 build times and their p95 (cache restores are not builds). */
  private recordBuild(ms: number): void {
    if (ms < 0) return;
    this.buildMs.push(ms);
    if (this.buildMs.length > 120) this.buildMs.shift();
    const sorted = this.buildMs.slice().sort((a, b) => a - b);
    this.buildP95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
    if (ms > STREAM.buildBudgetMs * 4) console.debug(`[world] chunk build ${ms.toFixed(1)} ms`);
  }
}

/** Auto quality is on unless the URL forces a tier, the saved setting is not 'auto' (read-only; a G2 request asks for
 *  a WorldView hook instead, docs/core-requests.md) or the page is automated (navigator.webdriver). */
function autoAllowed(): boolean {
  try {
    const g = globalThis as { location?: { search?: string }; localStorage?: Storage; navigator?: { webdriver?: boolean } };
    if (typeof g.location === 'undefined') return false;
    // Under automation (e2e, shots) frame timings are meaningless (SwiftShader): the tier stays where it started.
    if (g.navigator?.webdriver) return false;
    if (g.location.search && /[?&]quality=/.test(g.location.search)) return false;
    const raw = g.localStorage?.getItem('dusklane.save');
    if (raw) { const q = (JSON.parse(raw) as { settings?: { quality?: string } }).settings?.quality; if (q && q !== 'auto') return false; }
    return true;
  } catch { return false; }
}

/** The street cross-section where generated content begins (the run's start), to continue it backward: the
 *  solid-free ground obstacles crossing that point (sidewalks and their curb edges) and one chunk length of decor. */
interface StreetTemplate { s: number; ground: Obstacle[]; decor: Decor[] }

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

export type WorldViewDebug = WorldView & { debugInfo(): ReturnType<WorldViewImpl['debugInfo']>; benchBuild: WorldViewImpl['benchBuild'] };
export function createWorldViewImpl(ctx: GfxContext): WorldViewDebug { return new WorldViewImpl(ctx); }
