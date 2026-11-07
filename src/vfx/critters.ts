// vfx/critters.ts: the RECLAIM critters (theme §4, §11; T4): perched birds that take off, butterflies, dandelion seeds,
// moths at the live Neon signs, dragonflies, and the after-rain ripple rings. One InstancedMesh of camera-facing quads
// in normal (alpha) blending, so birds can be grey and butterflies lilac against a bright street (the additive particle
// pool cannot draw anything darker than what is behind it): +1 draw call, capacity 64, no shadows (§11: the main pass
// keeps ≥ 3 calls of headroom under 70). Shapes are drawn analytically in the fragment shader.
// Placement rules: critters only in the side bands (|x| ≥ 4.6; camera side below the cut plane), never in the top
// third of the screen (they fade out at that line, HUD band included); never yellow, gold or white; no fireflies.
import {
  DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, NormalBlending, PlaneGeometry, ShaderMaterial, Vector3,
} from 'three';
import type { GfxContext } from '../core/view';
import { sharedUniforms } from '../gfx';

export const CRIT = { perched: 0, flying: 1, butterfly: 2, seed: 3, dragonfly: 4, ripple: 5 } as const;
const ATTRS = ['aPos', 'aCol', 'aMisc'] as const;
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export interface CritterSpawn {
  s: number; x: number; y: number; vs: number; vx: number; vy: number;
  life: number; size: number; size1?: number; shape: number; color: number; alpha: number;
  /** Seconds before it shows (a ripple waits for its drip to land). */
  delay?: number;
  /** Wander strength (m/s of sideways wobble); 0 = straight. */
  wander?: number;
}

export class Critters {
  readonly mesh: Mesh;
  private readonly geo: InstancedBufferGeometry;
  private readonly aPos: Float32Array; private readonly aCol: Float32Array; private readonly aMisc: Float32Array;
  private readonly st: Float32Array;   // per slot: s x y vs vx vy age life size0 size1 a0 shape wander phase r g b
  private static readonly W = 17;
  private head = 0;
  private readonly v = new Vector3();
  /** Perched birds are re-listed every frame (they stay put until they take off): x y s size colour facing. */
  private readonly perch = new Float32Array(32 * 6);
  private nPerch = 0;
  alive = 0;

  constructor(ctx: GfxContext, readonly cap = 64) {
    this.st = new Float32Array(cap * Critters.W);
    this.geo = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('uv', quad.getAttribute('uv'));
    this.aPos = new Float32Array(cap * 3); this.aCol = new Float32Array(cap * 4); this.aMisc = new Float32Array(cap * 4);
    for (const [name, arr, k] of [['aPos', this.aPos, 3], ['aCol', this.aCol, 4], ['aMisc', this.aMisc, 4]] as const) {
      const a = new InstancedBufferAttribute(arr, k); a.setUsage(DynamicDrawUsage); this.geo.setAttribute(name, a);
    }
    this.geo.instanceCount = 0;
    const u = sharedUniforms(ctx);
    const mat = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: NormalBlending, fog: false,
      uniforms: { uDesat: u.uDesat, uTime: u.uTime },
      vertexShader: /* glsl */`
        attribute vec3 aPos; attribute vec4 aCol; attribute vec4 aMisc;   // misc: size, shape, phase, facing (±1)
        varying vec4 vCol; varying vec2 vUv; varying vec3 vM;
        void main() {
          vCol = aCol; vUv = uv; vM = aMisc.yzw;
          vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
          mv.xy += position.xy * aMisc.x;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uDesat; uniform float uTime;
        varying vec4 vCol; varying vec2 vUv; varying vec3 vM;
        float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
        void main() {
          vec2 p = (vUv * 2.0 - 1.0) * vec2(vM.z, 1.0);
          float sh = vM.x, f = sin(uTime * 13.0 + vM.y * 6.283), a = 0.0;
          if (sh < 0.5) {            // perched: body, head, tail
            a = max(step(length((p - vec2(0.0, -0.15)) / vec2(0.55, 0.32)), 1.0), step(length(p - vec2(0.42, 0.18)), 0.2));
            a = max(a, step(seg(p, vec2(-0.5, -0.2), vec2(-0.85, -0.05)), 0.07));
          } else if (sh < 1.5) {     // flying: a flapping V
            vec2 w = vec2(0.85, 0.45 * f);
            a = step(min(seg(p, vec2(0.0), w), seg(p, vec2(0.0), vec2(-w.x, w.y))), 0.1);
          } else if (sh < 2.5) {     // butterfly: two pairs of lobes opening and closing
            float k = 0.3 + 0.7 * abs(f); vec2 q = vec2(abs(p.x) / k, p.y);
            a = max(step(length(q - vec2(0.42, 0.22)), 0.4), step(length(q - vec2(0.3, -0.3)), 0.28));
            a = max(a * step(0.04, abs(p.x)), step(abs(p.x), 0.05) * step(abs(p.y), 0.5));
          } else if (sh < 3.5) {     // seed: a soft tuft
            a = pow(max(0.0, 1.0 - dot(p, p)), 2.0);
          } else if (sh < 4.5) {     // dragonfly: a thin body and shimmering wings
            a = max(step(seg(p, vec2(-0.9, 0.0), vec2(0.7, 0.0)), 0.07), step(length((vec2(abs(p.x - 0.25), p.y) - vec2(0.0, 0.32)) / vec2(0.16, 0.36)), 1.0) * (0.6 + 0.4 * f));
          } else {                   // ripple: a thin ring lying on the ground
            float r = length(p * vec2(1.0, 1.8)); a = smoothstep(0.12, 0.0, abs(r - 0.8));
          }
          vec3 c = vCol.rgb; float l = dot(c, vec3(0.299, 0.587, 0.114));
          gl_FragColor = vec4(mix(c, vec3(l), uDesat), vCol.a * a);
          if (gl_FragColor.a < 0.01) discard;
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.name = 'critters';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  /** A perched bird for this frame only (drawn first, never overwritten by spawns). */
  perched(s: number, x: number, y: number, size: number, color: number, facing: number): void {
    if (this.nPerch >= 32) return;
    const o = this.nPerch++ * 6, P = this.perch;
    P[o] = x; P[o + 1] = y; P[o + 2] = s; P[o + 3] = size; P[o + 4] = color; P[o + 5] = facing;
  }

  spawn(p: CritterSpawn): void {
    // The first free slot from the head; when all are busy, the oldest-placed slot is reused.
    let i = this.head;
    for (let n = 0; n < this.cap; n++) { const j = (this.head + n) % this.cap; if (this.st[j * Critters.W + 6]! >= this.st[j * Critters.W + 7]!) { i = j; break; } }
    const o = i * Critters.W, S = this.st;
    this.head = (i + 1) % this.cap;
    if (S[o + 6]! >= S[o + 7]!) this.alive++;
    S[o] = p.s; S[o + 1] = p.x; S[o + 2] = p.y; S[o + 3] = p.vs; S[o + 4] = p.vx; S[o + 5] = p.vy;
    S[o + 6] = -(p.delay ?? 0); S[o + 7] = p.life; S[o + 8] = p.size; S[o + 9] = p.size1 ?? p.size; S[o + 10] = p.alpha; S[o + 11] = p.shape;
    S[o + 12] = p.wander ?? 0; S[o + 13] = (i * 0.618) % 1;
    S[o + 14] = lin(((p.color >> 16) & 255) / 255); S[o + 15] = lin(((p.color >> 8) & 255) / 255); S[o + 16] = lin((p.color & 255) / 255);
  }

  /** Integrates and writes the live critters. `cam` projects for the top-third rule (null: no screen rule, e.g. menus);
   *  `cut` is the camera-side cut plane (x, z slope, on): a +x critter above it would stand over the corridor. */
  private k = 0;
  private cam: object | null = null;
  private readonly cut = { x: 0, z: 0, w: 0 };
  private put(x: number, y: number, z: number, r: number, g: number, b: number, a: number, size: number, shape: number, phase: number, face: number): void {
    const cut = this.cut;
    if (this.cam && shape !== CRIT.ripple) {
      this.v.set(x, y, z).project(this.cam as never);
      a *= Math.min(1, Math.max(0, (1 / 3 - this.v.y) / 0.12));                // the top third (and the HUD band in it)
      if (x > 0 && cut.w > 0.5 && y > Math.max(0.15, (x - cut.x) * cut.z * 0.9)) a = 0;
    }
    if (a <= 0.004 || this.k >= this.cap) return;
    const o3 = this.k * 3, o4 = this.k * 4;
    this.aPos[o3] = x; this.aPos[o3 + 1] = y; this.aPos[o3 + 2] = z;
    this.aCol[o4] = r; this.aCol[o4 + 1] = g; this.aCol[o4 + 2] = b; this.aCol[o4 + 3] = a;
    this.aMisc[o4] = size; this.aMisc[o4 + 1] = shape; this.aMisc[o4 + 2] = phase; this.aMisc[o4 + 3] = face;
    this.k++;
  }

  /** Integrates and writes the live critters (no allocation). `cam` projects for the top-third rule (null: no screen
   *  rule, e.g. menus); `cut` is the camera-side cut plane (x, z slope, on): a +x critter above it would stand over the
   *  corridor on screen. */
  update(dt: number, time: number, originS: number, cam: object | null, cut: { x: number; z: number; w: number }): void {
    const S = this.st, W = Critters.W, P = this.perch;
    this.k = 0; this.cam = cam; this.cut.x = cut.x; this.cut.z = cut.z; this.cut.w = cut.w;
    for (let j = 0; j < this.nPerch; j++) {
      const o = j * 6, c = P[o + 4]!;
      this.put(P[o]!, P[o + 1]!, -(P[o + 2]! - originS), lin(((c >> 16) & 255) / 255), lin(((c >> 8) & 255) / 255), lin((c & 255) / 255), 1, P[o + 3]!, CRIT.perched, 0, P[o + 5]!);
    }
    this.nPerch = 0;
    for (let i = 0; i < this.cap; i++) {
      const o = i * W;
      if (S[o + 6]! >= S[o + 7]!) continue;
      const age = (S[o + 6]! += dt);
      if (age >= S[o + 7]!) { this.alive--; continue; }
      const wob = S[o + 12]!;
      if (wob > 0) { S[o + 4] = S[o + 4]! * 0.98 + Math.sin(time * 1.7 + S[o + 13]! * 40) * wob * dt * 4; S[o + 5] = Math.sin(time * 2.3 + S[o + 13]! * 17) * wob * 0.5; }
      S[o] = S[o]! + S[o + 3]! * dt; S[o + 1] = S[o + 1]! + S[o + 4]! * dt; S[o + 2] = S[o + 2]! + S[o + 5]! * dt;
      // Side bands only: a wanderer turns back before it crosses |x| 4.7 toward the corridor.
      if (wob > 0 && Math.abs(S[o + 1]!) < 4.7) { S[o + 1] = Math.sign(S[o + 1]! || 1) * 4.7; S[o + 4] = Math.abs(S[o + 4]!) * Math.sign(S[o + 1]!); }
      if (age < 0) continue;
      const u = age / S[o + 7]!;
      this.put(S[o + 1]!, S[o + 2]!, -(S[o]! - originS), S[o + 14]!, S[o + 15]!, S[o + 16]!, S[o + 10]! * Math.min(1, u * 8, (1 - u) * 4),
        S[o + 8]! + (S[o + 9]! - S[o + 8]!) * u, S[o + 11]!, S[o + 13]!, S[o + 4]! < 0 ? -1 : 1);
    }
    const k = this.k;
    this.geo.instanceCount = k;
    for (const n of ATTRS) {
      const at = this.geo.getAttribute(n) as InstancedBufferAttribute;
      at.clearUpdateRanges(); if (k) at.addUpdateRange(0, k * at.itemSize); at.needsUpdate = true;
    }
  }

  clear(): void { for (let i = 0; i < this.cap; i++) this.st[i * Critters.W + 7] = 0; this.alive = 0; this.geo.instanceCount = 0; }
}
