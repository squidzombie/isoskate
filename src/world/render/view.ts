// world/render/view.ts: M0 grey-box world view. Streams chunk meshes around the player with origin rebasing:
// street slab and verges, sidewalks and curbs from slabs, solids as boxes coloured by height class, grind edges as
// cream over an ink underline, coins (instanced, hidden on pickup), simple building/lamp decor, a contact shadow and
// a sun that follows the skater.
// TODO(WA): kits per PropKind and area, every DECOR_KINDS entry, palette blends, the 5-mesh chunk layout and pools,
// x-ray cap, decals, glow, quality tiers, context-loss rebuild, roll-out cache (TECH §8.6–8.9).
import {
  CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry,
  Quaternion, Vector3, type BufferGeometry,
} from 'three';
import type { QualityTier } from '../../core/ids';
import { lerp } from '../../core/math';
import { CHUNK_LEN, CHUNK_WINDOW, HEIGHT } from '../../core/tuning';
import type { GfxContext, RenderFrame, WorldView } from '../../core/view';
import type { Chunk, Obstacle, WorldGen } from '../../core/world';
import { colorBox, getSun, mergeAll, originOf, setGfxQuality } from '../../gfx';
import { yawForAspect } from './camera';

export const COLORS = {
  asphalt: 0x6b6478, concrete: 0xd9c3ae, curbTop: 0xe8d6c2, granite: 0xb9a9a0, paint: 0xede3d3, verge: 0xcdb8a3,
  bump: 0xcfc3b8, lowLandable: 0xa99cc0, lowCrash: 0x2b2140, chevron: 0xf2b630, knock: 0xff8a5b,
  forbidden: 0xff00ff, tall: 0x2b2140, tallTop: 0x4a3b6b, tallAccent: 0xd9765a, edgeCream: 0xfff1d6, ink: 0x2b2140, coin: 0xffc94a,
  building: [0xd9765a, 0xc9a15a, 0xf3e3c3, 0x3e8e8a, 0xb5645a, 0xe8b38f, 0x9c7bb0, 0xc4473d],
} as const;

/** Height class of a solid relative to its local ground (DESIGN §5.5). */
export function heightClass(top: number, ground: number): 'bump' | 'low' | 'forbidden' | 'tall' {
  const h = top - ground;
  if (h <= HEIGHT.bumpMax) return 'bump';
  if (h <= HEIGHT.lowMax) return 'low';
  if (h < HEIGHT.tallMin) return 'forbidden';
  return 'tall';
}

interface ChunkMesh { index: number; s0: number; group: Group; coinIds: number[]; coins: InstancedMesh | null; nearSide: Mesh | null }

const BUILD_BUDGET_MS = 4;

class GreyboxWorldView implements WorldView {
  private gen: WorldGen | null = null;
  private readonly root = new Group();
  private readonly chunks = new Map<number, ChunkMesh>();
  private readonly mat = new MeshLambertMaterial({ vertexColors: true });
  /** Shadow-only material for buildings on the camera side when ψ > 0 (they would cover the corridor). */
  private readonly shadowOnly = new MeshLambertMaterial({ vertexColors: true, colorWrite: false, depthWrite: false });
  private nearHidden = false;
  private readonly coinMat = new MeshLambertMaterial({ color: COLORS.coin, emissive: 0x8a5a00 });
  private readonly coinGeo = new CylinderGeometry(0.16, 0.16, 0.05, 8).rotateX(Math.PI / 2);
  private readonly shadow: Mesh;
  private readonly collected = new Set<number>();
  private originS = 0;
  private built = 0;
  private buildMs: number[] = [];
  private readonly m4 = new Matrix4();
  private readonly zero = new Matrix4().makeScale(0, 0, 0);

  constructor(private readonly ctx: GfxContext) {
    this.root.name = 'world';
    ctx.scene.add(this.root);
    const tex = ctx.canvasTexture('contactShadow', 64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(43,33,64,1)'); g.addColorStop(0.6, 'rgba(43,33,64,0.5)'); g.addColorStop(1, 'rgba(43,33,64,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
    this.shadow = new Mesh(new PlaneGeometry(0.9, 1.1).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.6, side: DoubleSide }));
    this.shadow.renderOrder = 1;
    this.shadow.name = 'contactShadow';
    ctx.scene.add(this.shadow);
  }

  attach(gen: WorldGen): void {
    this.clear();
    this.gen = gen;
    this.collected.clear();
  }

  update(f: RenderFrame): void {
    if (!this.gen) return;
    for (const e of f.events) if (e.t === 'coin') this.hideCoin(e.id);
    const origin = originOf(f.playerS);
    if (origin !== this.originS) {
      this.originS = origin;
      for (const c of this.chunks.values()) c.group.position.z = -(c.s0 - origin);
    }
    const ci = Math.floor(f.playerS / CHUNK_LEN);
    const lo = ci - CHUNK_WINDOW.behind, hi = ci + CHUNK_WINDOW.ahead;
    for (const [i, c] of this.chunks) if (i < lo || i > hi) { this.disposeChunk(c); this.chunks.delete(i); }
    this.nearHidden = yawForAspect(f.viewport.aspect) > 0;
    for (const c of this.chunks.values()) if (c.nearSide) c.nearSide.material = this.nearHidden ? this.shadowOnly : this.mat;
    for (let i = lo; i <= hi; i++) {                     // at most one chunk build per frame (TECH §8.6)
      if (this.chunks.has(i)) continue;
      const t0 = performance.now();
      this.buildChunk(this.gen.chunk(i));
      this.recordBuild(performance.now() - t0);
      break;
    }
    // Contact shadow (always drawn) and the sun box following the skater.
    const s = f.playerS, x = lerp(f.prev.p.x, f.cur.p.x, f.alpha), y = lerp(f.prev.p.y, f.cur.p.y, f.alpha);
    const gy = lerp(f.prev.groundY, f.cur.groundY, f.alpha);
    const hgt = Math.max(0, y - gy);
    this.shadow.position.set(x, gy + 0.012, -(s - origin));
    (this.shadow.material as MeshBasicMaterial).opacity = lerp(0.6, 0.25, Math.min(1, hgt / 2));
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

  setQuality(q: QualityTier): void { setGfxQuality(this.ctx, q); }
  rebuildGPU(): void { const g = this.gen; this.clear(); this.gen = g; }
  stats() {
    const sorted = [...this.buildMs].sort((a, b) => a - b);
    return { chunksBuilt: this.built, buildMsP95: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] ?? 0 : 0,
      drawCalls: this.ctx.renderer.info.render.calls };
  }
  dispose(): void {
    this.clear();
    this.ctx.scene.remove(this.root, this.shadow);
    this.mat.dispose(); this.shadowOnly.dispose(); this.coinMat.dispose(); this.coinGeo.dispose();
  }

  // ── internals ─────────────────────────────────────────────────────────────────────────────────────────────────
  private recordBuild(ms: number): void {
    this.buildMs.push(ms);
    if (this.buildMs.length > 120) this.buildMs.shift();
    if (ms > BUILD_BUDGET_MS * 4) console.debug(`[world] chunk build ${ms.toFixed(1)} ms`);
  }

  private clear(): void {
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
  }

  private disposeChunk(c: ChunkMesh): void {
    this.root.remove(c.group);
    c.group.traverse((o) => { if (o instanceof Mesh && o.geometry !== this.coinGeo) o.geometry.dispose(); });
    c.coins?.dispose();
  }

  private hideCoin(id: number): void {
    this.collected.add(id);
    for (const c of this.chunks.values()) {
      const k = c.coinIds.indexOf(id);
      if (k >= 0 && c.coins) { c.coins.setMatrixAt(k, this.zero); c.coins.instanceMatrix.needsUpdate = true; }
    }
  }

  private buildChunk(ch: Chunk): void {
    const s0 = ch.s0;
    const z = (s: number) => -(s - s0);                 // chunk-local z of track s
    const parts: BufferGeometry[] = [];
    // Street slab across the corridor and wide verges for the backdrop.
    parts.push(colorBox(-3.0, -0.3, z(s0 + ch.len), 3.0, 0, z(s0), COLORS.asphalt));
    parts.push(colorBox(-16, -0.3, z(s0 + ch.len), -4.5, 0.15, z(s0), COLORS.verge));
    parts.push(colorBox(4.5, -0.3, z(s0 + ch.len), 16, 0.15, z(s0), COLORS.verge));
    for (const ob of ch.obstacles) this.obstacleParts(ob, ch, z, parts);
    const near: BufferGeometry[] = [];                 // buildings on the +x side (the camera side when ψ > 0)
    for (const d of ch.decor) {
      if (d.kind === 'building') {
        const w = d.params?.w ?? 8, dd = d.params?.d ?? 12, h = d.params?.h ?? 12;
        const xIn = d.x, xOut = d.x + Math.sign(d.x || 1) * w;
        (d.x > 0 ? near : parts).push(colorBox(Math.min(xIn, xOut), d.y, z(d.s + dd), Math.max(xIn, xOut), d.y + h, z(d.s),
          COLORS.building[d.variant % COLORS.building.length]!));
      } else if (d.kind === 'street_lamp') {
        const h = d.params?.h ?? 5;
        parts.push(colorBox(d.x - 0.06, d.y, z(d.s) - 0.06, d.x + 0.06, d.y + h, z(d.s) + 0.06, COLORS.ink));
        parts.push(colorBox(d.x - 0.18, d.y + h - 0.2, z(d.s) - 0.18, d.x + 0.18, d.y + h + 0.05, z(d.s) + 0.18, COLORS.edgeCream));
      }
      // Other DECOR_KINDS render as nothing in M0 (TODO(WA)).
    }
    const group = new Group();
    group.name = `chunk${ch.index}`;
    const geo = mergeAll(parts);
    if (geo) {
      const mesh = new Mesh(geo, this.mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    let nearSide: Mesh | null = null;
    const nearGeo = mergeAll(near);
    if (nearGeo) {
      nearSide = new Mesh(nearGeo, this.nearHidden ? this.shadowOnly : this.mat);
      nearSide.castShadow = true; nearSide.receiveShadow = true;
      group.add(nearSide);
    }
    // Coins: one instanced mesh per chunk; collected ones are hidden by matrix.
    let coins: InstancedMesh | null = null;
    const coinIds: number[] = [];
    if (ch.coins.length) {
      coins = new InstancedMesh(this.coinGeo, this.coinMat, ch.coins.length);
      const q = new Quaternion(), sc = new Vector3(1, 1, 1), pos = new Vector3();
      ch.coins.forEach((c, k) => {
        coinIds.push(c.id);
        if (this.collected.has(c.id)) coins!.setMatrixAt(k, this.zero);
        else coins!.setMatrixAt(k, this.m4.compose(pos.set(c.p.x, c.p.y, z(c.p.s)), q, sc));
      });
      coins.castShadow = false;
      group.add(coins);
    }
    group.position.z = -(s0 - this.originS);
    this.root.add(group);
    this.chunks.set(ch.index, { index: ch.index, s0, group, coinIds, coins, nearSide });
    this.built++;
  }

  /** Obstacles are listed in every chunk they overlap; geometry is clipped to this chunk's s-range. */
  private obstacleParts(ob: Obstacle, ch: Chunk, z: (s: number) => number, parts: BufferGeometry[]): void {
    const c0 = ch.s0, c1 = ch.s0 + ch.len;
    const clipS = (a: number, b: number): [number, number] | null => {
      const lo = Math.max(a, c0), hi = Math.min(b, c1);
      return hi > lo ? [lo, hi] : null;
    };
    for (const sl of ob.slabs) {
      if (ob.solids.length) break;                       // the solid body already draws a landable top
      const r = clipS(sl.s0, sl.s1);
      if (!r) continue;
      const top = Math.max(sl.y0, sl.y1);
      parts.push(colorBox(sl.x0, 0, z(r[1]), sl.x1, top, z(r[0]), ob.kind === 'curb' ? COLORS.concrete : COLORS.granite));
    }
    for (const so of ob.solids) {
      const b = so.box;
      const r = clipS(b.s0, b.s1);
      if (!r) continue;
      const cls = heightClass(b.y1, b.y0);
      const color = so.top === 'knock' ? COLORS.knock
        : cls === 'bump' ? COLORS.bump
        : cls === 'forbidden' ? COLORS.forbidden
        : cls === 'tall' ? COLORS.tall
        : so.top === 'landable' ? COLORS.lowLandable : COLORS.lowCrash;
      parts.push(colorBox(b.x0, b.y0, z(r[1]), b.x1, b.y1, z(r[0]), color));
      if (cls === 'tall') {
        // Dark ink body, a slightly lighter top and one saturated accent band on the camera-facing front face.
        parts.push(colorBox(b.x0 + 0.02, b.y1, z(r[1]) + 0.02, b.x1 - 0.02, b.y1 + 0.01, z(r[0]) - 0.02, COLORS.tallTop));
        if (r[0] === b.s0) parts.push(colorBox(b.x0, b.y1 - 0.16, z(r[0]), b.x1, b.y1 - 0.06, z(r[0]) + 0.01, COLORS.tallAccent));
      }
      if (cls === 'low' && so.top === 'crash' && b.x1 - b.x0 > 6) {
        // Full-width hazard: amber/ink chevron blocks on the front face.
        for (let x = b.x0; x < b.x1 - 0.3; x += 0.9) parts.push(colorBox(x, b.y0 + 0.05, z(r[0]) - 0.005, x + 0.45, b.y1 - 0.05, z(r[0]) + 0.02, COLORS.chevron));
      }
    }
    for (const e of ob.edges) {
      const r = clipS(e.a.s, e.b.s);
      if (!r) continue;
      const u0 = (r[0] - e.a.s) / Math.max(1e-6, e.b.s - e.a.s), u1 = (r[1] - e.a.s) / Math.max(1e-6, e.b.s - e.a.s);
      const xa = lerp(e.a.x, e.b.x, u0), xb = lerp(e.a.x, e.b.x, u1);
      const y = Math.max(lerp(e.a.y, e.b.y, u0), lerp(e.a.y, e.b.y, u1));
      const xm = (xa + xb) / 2;
      // Cream top edge (0.06 wide) over a 0.02 m ink underline (DESIGN §18.4).
      parts.push(colorBox(xm - 0.04, y - 0.05, z(r[1]), xm + 0.04, y - 0.015, z(r[0]), COLORS.ink));
      parts.push(colorBox(xm - 0.03, y - 0.015, z(r[1]), xm + 0.03, y + 0.012, z(r[0]), COLORS.edgeCream));
    }
  }
}

export function createGreyboxWorldView(ctx: GfxContext): WorldView {
  return new GreyboxWorldView(ctx);
}
