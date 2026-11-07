// world/render/layers.ts: the global instanced layers (TECH §8.6): ground decals (polygonOffset, the 512² atlas,
// puddles with the sky gradient and sign-colour smears, water glitter), lantern spheres (emissive, swaying at 0.5 Hz)
// and coins (8-sided, emissive #FFC94A, 3 rev/s, bob 0.1 m, kept ≥ 12 px on screen). Chunks claim instance slots
// when built and hand them back when released; origin rebasing rewrites the instance matrices.
import {
  type BufferAttribute, CylinderGeometry, DoubleSide, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial,
  MeshLambertMaterial, PlaneGeometry, Quaternion, Vector3, type Scene, type Texture,
} from 'three';
import { CAMERA } from '../../core/tuning';
import type { GfxContext } from '../../core/view';
import type { Coin } from '../../core/world';
import { GRADING_PARS, sharedUniforms } from '../../gfx';
import type { DecalRec, LanternRec } from './kits/common';
import { COLORS } from './palette';
import { DECAL_GRID } from './textures/decals';
import { srgbToLinear } from './writer';

const ZERO = new Matrix4().makeScale(0, 0, 0);
const lin = (hex: number, o: Float32Array, i: number) => {
  o[i] = srgbToLinear(((hex >> 16) & 255) / 255); o[i + 1] = srgbToLinear(((hex >> 8) & 255) / 255); o[i + 2] = srgbToLinear((hex & 255) / 255);
};

/** Marks instance slot k of an instanced attribute for upload: one merged range per frame (the renderer uploads the
 *  ranges and clears them), so a chunk claiming its decals does not re-upload the whole layer. */
function touch(a: BufferAttribute, k: number): void {
  const n = a.itemSize, r = a.updateRanges;
  if (r.length === 0) a.addUpdateRange(k * n, n);
  else { const g = r[0]!, lo = Math.min(g.start, k * n), hi = Math.max(g.start + g.count, (k + 1) * n); g.start = lo; g.count = hi - lo; }
  a.needsUpdate = true;
}
/** A full upload (origin rebase, scale change). */
function touchAll(a: BufferAttribute): void { a.clearUpdateRanges(); a.needsUpdate = true; }

/** Slot bookkeeping shared by the layers: a free list and a per-slot track-space record. */
class Slots<T> {
  readonly rec: (T | null)[];
  private readonly free: number[] = [];
  used = 0;
  constructor(readonly cap: number) {
    this.rec = new Array<T | null>(cap).fill(null);
    for (let i = cap - 1; i >= 0; i--) this.free.push(i);
  }
  take(r: T): number { const k = this.free.pop(); if (k === undefined) return -1; this.rec[k] = r; this.used++; return k; }
  give(k: number): void { if (this.rec[k] === null) return; this.rec[k] = null; this.free.push(k); this.used--; }
  get high(): number { let h = 0; for (let i = 0; i < this.cap; i++) if (this.rec[i]) h = i + 1; return h; }
}

// ── decals ──────────────────────────────────────────────────────────────────────────────────────────────────────
export class DecalLayer {
  readonly mesh: InstancedMesh;
  private readonly slots: Slots<DecalRec>;
  private readonly rect: Float32Array; private readonly tint: Float32Array; private readonly kind: Float32Array;
  private readonly m = new Matrix4(); private readonly q = new Quaternion(); private readonly v = new Vector3(); private readonly sc = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private originS = 0;

  constructor(ctx: GfxContext, atlas: Texture, cap = 1024) {
    const u = sharedUniforms(ctx);
    const geo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.rect = new Float32Array(cap * 4); this.tint = new Float32Array(cap * 4); this.kind = new Float32Array(cap);
    geo.setAttribute('aRect', new InstancedBufferAttribute(this.rect, 4));
    geo.setAttribute('aTint', new InstancedBufferAttribute(this.tint, 4));
    geo.setAttribute('aKind', new InstancedBufferAttribute(this.kind, 1));
    const mat = new MeshLambertMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const tex = { value: atlas };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uDecals: tex, uTime: u.uTime, uDesat: u.uDesat, uHaze: u.uHaze, uHazeAmt: u.uHazeAmt, uHazeY0: u.uHazeY0,
        uHazeMode: u.uHazeMode, uHazeNear: u.uHazeNear, uHazeFar: u.uHazeFar, uRes: u.uRes, uSkyZenith: u.uSkyZenith, uSkyMid: u.uSkyMid,
        uSkyHorizon: u.uSkyHorizon, uGlowK: u.uGlow });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aRect;\nattribute vec4 aTint;\nattribute float aKind;\nvarying vec4 vRect;\nvarying vec4 vTint;\nvarying float vKind;\nvarying vec2 vDuv;\nvarying vec3 vWp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRect = aRect; vTint = aTint; vKind = aKind; vDuv = uv;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D uDecals;
uniform float uTime;
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform float uGlowK;
varying vec4 vRect;
varying vec4 vTint;
varying float vKind;
varying vec2 vDuv;
varying vec3 vWp;
${GRADING_PARS}
float dlHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
vec3 decalEmit = vec3(0.0);
vec2 duv = vDuv;
if (vKind > 0.5 && vKind < 1.5) duv += vec2(sin(uTime * 1.7 + vDuv.y * 18.0), cos(uTime * 1.3 + vDuv.x * 15.0)) * 0.006;
vec4 tx = texture2D(uDecals, vRect.xy + clamp(duv, 0.01, 0.99) * vRect.zw);
diffuseColor = vec4(vTint.rgb * tx.rgb, tx.a * vTint.a);
if (vKind > 0.5 && vKind < 1.5) {
  // Puddle: the sky-horizon gradient, vertical smears of nearby sign colours, a UV ripple (no real reflection).
  vec3 sky = mix(uSkyHorizon, uSkyMid, smoothstep(0.15, 0.95, duv.y));
  float smear = smoothstep(0.7, 1.0, sin(duv.x * 13.0 + 1.3) * 0.5 + 0.5) * smoothstep(0.1, 0.7, duv.y) * (0.6 + 0.4 * sin(uTime * 0.8 + duv.x * 5.0));
  float rim = smoothstep(0.0, 0.35, tx.a);
  decalEmit = (sky * 0.32 + vTint.rgb * smear * (0.06 + 0.5 * uGlowK)) * rim;
  diffuseColor.rgb = vec3(0.015, 0.012, 0.03);
  diffuseColor.a = tx.a * 0.62;
} else if (vKind > 1.5) {
  // Water: sky-gradient plane with sun-glitter sparkles.
  vec2 cell = floor(vWp.xz * 2.5);
  float tw = step(0.965, dlHash(cell + floor(uTime * 3.0)));
  decalEmit = mix(uSkyMid, uSkyHorizon, 0.5) * 0.35 + vec3(1.0, 0.92, 0.75) * tw * vTint.a * 1.5;
  diffuseColor = vec4(vec3(0.05, 0.07, 0.12), 0.55 + 0.35 * tw);
}`)
        .replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
          'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance + decalEmit;')
        .replace('#include <colorspace_fragment>', '#include <colorspace_fragment>\ngl_FragColor.rgb = dlGrade(gl_FragColor.rgb, 0.0, length(vViewPosition));');
    };
    mat.customProgramCacheKey = () => 'dl-decals';
    this.mesh = new InstancedMesh(geo, mat, cap);
    this.mesh.name = 'decals';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = 1;
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.count = 0;
    this.slots = new Slots<DecalRec>(cap);
  }

  add(d: DecalRec): number {
    const k = this.slots.take(d);
    if (k < 0) return -1;
    const g = 1 / DECAL_GRID, col = d.id % DECAL_GRID, row = Math.floor(d.id / DECAL_GRID);
    // The canvas texture is flipped: atlas row 0 is the top of the canvas → v from 1 − (row + 1)·g.
    this.rect[k * 4] = col * g; this.rect[k * 4 + 1] = 1 - (row + 1) * g; this.rect[k * 4 + 2] = g; this.rect[k * 4 + 3] = g;
    lin(d.color, this.tint, k * 4); this.tint[k * 4 + 3] = d.alpha;
    this.kind[k] = d.kind;
    this.write(k);
    if (k + 1 > this.mesh.count) this.mesh.count = k + 1;
    this.dirty(k);
    return k;
  }
  remove(k: number): void { this.slots.give(k); this.mesh.setMatrixAt(k, ZERO); touch(this.mesh.instanceMatrix, k); }
  rebase(originS: number): void {
    this.originS = originS;
    for (let k = 0; k < this.mesh.count; k++) this.write(k);
    touchAll(this.mesh.instanceMatrix);
  }
  get used(): number { return this.slots.used; }
  private write(k: number): void {
    const d = this.slots.rec[k];
    if (!d) { this.mesh.setMatrixAt(k, ZERO); return; }
    if (d.e) {
      // Parallelogram: local u (x) → e1, local plane z (−v, s backward) → −e2 (track s runs along −z).
      // (e1 is negated when e1 × e2 < 0, so the quad keeps facing up: same parallelogram, u mirrored.)
      const [ex, es, bx, bs] = d.e, sg = ex * bs - es * bx < 0 ? -1 : 1, ax = ex * sg, as = es * sg;
      this.m.set(ax, 0, -bx, d.x, 0, 1, 0, d.y, -as, 0, bs, -(d.s - this.originS), 0, 0, 0, 1);
      this.mesh.setMatrixAt(k, this.m);
      return;
    }
    this.q.setFromAxisAngle(this.up, d.rot);
    this.mesh.setMatrixAt(k, this.m.compose(this.v.set(d.x, d.y, -(d.s - this.originS)), this.q, this.sc.set(d.w, 1, d.len)));
  }
  private dirty(k: number): void {
    touch(this.mesh.instanceMatrix, k);
    const g = this.mesh.geometry;
    touch(g.getAttribute('aRect') as InstancedBufferAttribute, k); touch(g.getAttribute('aTint') as InstancedBufferAttribute, k);
    touch(g.getAttribute('aKind') as InstancedBufferAttribute, k);
  }
  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as MeshLambertMaterial).dispose(); this.mesh.dispose(); }
}

// ── lanterns ────────────────────────────────────────────────────────────────────────────────────────────────────
export class LanternLayer {
  readonly mesh: InstancedMesh;
  private readonly slots: Slots<LanternRec>;
  private readonly col: Float32Array; private readonly phase: Float32Array;
  private readonly m = new Matrix4(); private readonly q = new Quaternion(); private readonly v = new Vector3(); private readonly sc = new Vector3();
  private originS = 0;
  constructor(ctx: GfxContext, cap = 512) {
    const u = sharedUniforms(ctx);
    const geo = new IcosahedronGeometry(1, 0);
    geo.scale(1, 1.25, 1);
    this.col = new Float32Array(cap * 4); this.phase = new Float32Array(cap);
    geo.setAttribute('aCol', new InstancedBufferAttribute(this.col, 4));
    geo.setAttribute('aPhase', new InstancedBufferAttribute(this.phase, 1));
    const mat = new MeshBasicMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uTime: u.uTime, uDesat: u.uDesat, uEmis: u.uEmis, uHaze: u.uHaze, uHazeAmt: u.uHazeAmt, uHazeY0: u.uHazeY0,
        uHazeMode: u.uHazeMode, uHazeNear: u.uHazeNear, uHazeFar: u.uHazeFar, uRes: u.uRes });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aCol;\nattribute float aPhase;\nuniform float uTime;\nvarying vec4 vCol;\nvarying vec3 vViewPosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCol = aCol;\ntransformed.y += 0.0;')
        .replace('#include <project_vertex>', `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition.x += 0.06 * sin(uTime * 3.14159 + aPhase);
mvPosition.z += 0.03 * cos(uTime * 3.14159 + aPhase);
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
vViewPosition = - mvPosition.xyz;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uEmis;\nvarying vec4 vCol;\nvarying vec3 vViewPosition;\n${GRADING_PARS}`)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vCol.rgb * vCol.a * uEmis;')
        .replace('#include <colorspace_fragment>', '#include <colorspace_fragment>\ngl_FragColor.rgb = dlGrade(gl_FragColor.rgb, 0.0, length(vViewPosition));');
    };
    mat.customProgramCacheKey = () => 'dl-lanterns';
    this.mesh = new InstancedMesh(geo, mat, cap);
    this.mesh.name = 'lanterns';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.count = 0;
    this.slots = new Slots<LanternRec>(cap);
  }
  add(l: LanternRec): number {
    const k = this.slots.take(l);
    if (k < 0) return -1;
    lin(l.color, this.col, k * 4); this.col[k * 4 + 3] = l.glow;
    this.phase[k] = l.phase;
    this.write(k);
    if (k + 1 > this.mesh.count) this.mesh.count = k + 1;
    touch(this.mesh.instanceMatrix, k);
    touch(this.mesh.geometry.getAttribute('aCol') as InstancedBufferAttribute, k);
    touch(this.mesh.geometry.getAttribute('aPhase') as InstancedBufferAttribute, k);
    return k;
  }
  remove(k: number): void { this.slots.give(k); this.mesh.setMatrixAt(k, ZERO); touch(this.mesh.instanceMatrix, k); }
  rebase(originS: number): void { this.originS = originS; for (let k = 0; k < this.mesh.count; k++) this.write(k); touchAll(this.mesh.instanceMatrix); }
  get used(): number { return this.slots.used; }
  private write(k: number): void {
    const l = this.slots.rec[k];
    if (!l) { this.mesh.setMatrixAt(k, ZERO); return; }
    this.mesh.setMatrixAt(k, this.m.compose(this.v.set(l.x, l.y, -(l.s - this.originS)), this.q, this.sc.setScalar(l.r)));
  }
  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as MeshBasicMaterial).dispose(); this.mesh.dispose(); }
}

// ── coins ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const COIN = { capacity: 256, diameter: 0.32, spinHz: 3, bob: 0.1, minWidth: 0.35 } as const;

export class CoinLayer {
  readonly mesh: InstancedMesh;
  private readonly slots = new Slots<Coin>(COIN.capacity);
  private readonly collected = new Set<number>();
  private readonly m = new Matrix4(); private readonly q = new Quaternion(); private readonly v = new Vector3(); private readonly sc = new Vector3();
  private originS = 0;
  scale = 1;
  constructor(ctx: GfxContext) {
    const u = sharedUniforms(ctx);
    // 8-sided, standing upright facing the camera (tilted back by the pitch); the shader spins it about y.
    const geo = new CylinderGeometry(COIN.diameter / 2, COIN.diameter / 2, 0.05, 8).rotateX(Math.PI / 2);
    const mat = new MeshBasicMaterial({ color: COLORS.coin, toneMapped: false, side: DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uTime: u.uTime, uDesat: u.uDesat });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vShade;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
float ph = uTime * ${(COIN.spinHz * Math.PI * 2).toFixed(4)};
#ifdef USE_INSTANCING
ph += instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 0.9;
#endif
float cs = cos(ph);
float w = sign(cs) * max(abs(cs), ${COIN.minWidth.toFixed(2)});
transformed.x *= w;
vShade = 0.78 + 0.22 * abs(cs);
float cp = cos(${((CAMERA.pitchDeg * Math.PI) / 180).toFixed(5)}), sp = sin(${((CAMERA.pitchDeg * Math.PI) / 180).toFixed(5)});
transformed = vec3(transformed.x, transformed.y * cp + transformed.z * sp, -transformed.y * sp + transformed.z * cp);
transformed.y += ${(COIN.bob / 2).toFixed(3)} * (1.0 + sin(ph * 0.3333));`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uDesat;\nvarying float vShade;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vShade;\nfloat dl = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(dl), uDesat);');
    };
    mat.customProgramCacheKey = () => 'dl-coins';
    this.mesh = new InstancedMesh(geo, mat, COIN.capacity);
    this.mesh.name = 'coins';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < COIN.capacity; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.count = 0;
  }
  add(c: Coin): number {
    const k = this.slots.take(c);
    if (k < 0) return -1;
    this.write(k);
    if (k + 1 > this.mesh.count) this.mesh.count = k + 1;
    touch(this.mesh.instanceMatrix, k);
    return k;
  }
  remove(k: number): void { this.slots.give(k); this.mesh.setMatrixAt(k, ZERO); touch(this.mesh.instanceMatrix, k); }
  hide(id: number): void {
    this.collected.add(id);
    for (let k = 0; k < this.mesh.count; k++) if (this.slots.rec[k]?.id === id) { this.mesh.setMatrixAt(k, ZERO); touch(this.mesh.instanceMatrix, k); }
  }
  clearCollected(): void { this.collected.clear(); }
  get collectedIds(): ReadonlySet<number> { return this.collected; }
  setCollected(ids: Iterable<number>): void { for (const id of ids) this.collected.add(id); }
  rebase(originS: number): void { this.originS = originS; this.writeAll(); }
  setScale(s: number): void { if (Math.abs(s - this.scale) > 0.02) { this.scale = s; this.writeAll(); } }
  get used(): number { return this.slots.used; }
  writeAll(): void { for (let k = 0; k < this.mesh.count; k++) this.write(k); touchAll(this.mesh.instanceMatrix); }
  private write(k: number): void {
    const c = this.slots.rec[k];
    if (!c || this.collected.has(c.id)) { this.mesh.setMatrixAt(k, ZERO); return; }
    this.mesh.setMatrixAt(k, this.m.compose(this.v.set(c.p.x, c.p.y, -(c.p.s - this.originS)), this.q, this.sc.setScalar(this.scale)));
  }
  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as MeshBasicMaterial).dispose(); this.mesh.dispose(); }
}

export function addLayers(scene: Scene, ...meshes: InstancedMesh[]): void { for (const m of meshes) scene.add(m); }
