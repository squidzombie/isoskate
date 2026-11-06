// vfx/particles.ts: one pooled additive InstancedMesh of camera-facing quads (DESIGN §18.8: capped at 300, 150 on low)
// with a CPU ring buffer. Shapes: soft puff, streak (stretched along its screen-space velocity: sparks, speed lines),
// star (coin pops, crash stars), petal / leaf flake. Positions are in track space and written rebased each frame.
import {
  AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial,
} from 'three';
import type { GfxContext } from '../core/view';
import { sharedUniforms } from '../gfx';

export const SHAPE = { puff: 0, streak: 1, star: 2, flake: 3 } as const;
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export interface Spawn {
  s: number; x: number; y: number; vs: number; vx: number; vy: number;
  life: number; size: number; size1?: number; color: number; color1?: number; alpha: number;
  shape: number; gravity?: number; drag?: number; stretch?: number; spin?: number;
}

export class Particles {
  readonly mesh: Mesh;
  private readonly geo: InstancedBufferGeometry;
  private readonly aPos: Float32Array; private readonly aVel: Float32Array; private readonly aCol: Float32Array; private readonly aMisc: Float32Array;
  // CPU state (struct of arrays).
  private readonly n: number;
  private readonly s: Float32Array; private readonly x: Float32Array; private readonly y: Float32Array;
  private readonly vs: Float32Array; private readonly vx: Float32Array; private readonly vy: Float32Array;
  private readonly age: Float32Array; private readonly life: Float32Array; private readonly size0: Float32Array; private readonly size1: Float32Array;
  private readonly c0: Float32Array; private readonly c1: Float32Array; private readonly a0: Float32Array; private readonly shape: Float32Array;
  private readonly grav: Float32Array; private readonly drag: Float32Array; private readonly stretch: Float32Array; private readonly spin: Float32Array;
  private head = 0;
  cap: number;
  alive = 0;

  constructor(ctx: GfxContext, max = 300) {
    this.n = max; this.cap = max;
    const f = () => new Float32Array(max);
    this.s = f(); this.x = f(); this.y = f(); this.vs = f(); this.vx = f(); this.vy = f(); this.age = f(); this.life = f();
    this.size0 = f(); this.size1 = f(); this.a0 = f(); this.shape = f(); this.grav = f(); this.drag = f(); this.stretch = f(); this.spin = f();
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
    this.geo = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('uv', quad.getAttribute('uv'));
    this.aPos = new Float32Array(max * 3); this.aVel = new Float32Array(max * 3); this.aCol = new Float32Array(max * 4); this.aMisc = new Float32Array(max * 4);
    for (const [name, arr, k] of [['aPos', this.aPos, 3], ['aVel', this.aVel, 3], ['aCol', this.aCol, 4], ['aMisc', this.aMisc, 4]] as const) {
      const a = new InstancedBufferAttribute(arr, k); a.setUsage(DynamicDrawUsage); this.geo.setAttribute(name, a);
    }
    this.geo.instanceCount = 0;
    const u = sharedUniforms(ctx);
    const mat = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false,
      uniforms: { uDesat: u.uDesat, uRes: u.uRes },
      vertexShader: /* glsl */`
        attribute vec3 aPos; attribute vec3 aVel; attribute vec4 aCol; attribute vec4 aMisc;   // misc: size, shape, stretch, rot
        varying vec4 vCol; varying vec2 vUv; varying float vShape;
        void main() {
          vCol = aCol; vUv = uv; vShape = aMisc.y;
          vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
          vec2 c = position.xy * aMisc.x;
          if (aMisc.y > 0.5 && aMisc.y < 1.5) {
            vec2 d = (modelViewMatrix * vec4(aVel, 0.0)).xy;
            float l = length(d);
            vec2 dir = l > 1e-5 ? d / l : vec2(0.0, 1.0);
            vec2 perp = vec2(-dir.y, dir.x);
            c = perp * position.x * aMisc.x * 0.35 + dir * position.y * aMisc.x * (1.0 + aMisc.z);
          } else {
            float cr = cos(aMisc.w), sr = sin(aMisc.w);
            c = vec2(c.x * cr - c.y * sr, c.x * sr + c.y * cr);
          }
          mv.xy += c;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uDesat;
        varying vec4 vCol; varying vec2 vUv; varying float vShape;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float a;
          if (vShape < 0.5) a = pow(max(0.0, 1.0 - dot(p, p)), 1.5);
          else if (vShape < 1.5) a = max(0.0, 1.0 - abs(p.x)) * smoothstep(1.0, 0.4, abs(p.y));
          else if (vShape < 2.5) { float q = abs(p.x) * abs(p.y); a = max(0.0, 1.0 - length(p)) * (0.35 + 0.65 * smoothstep(0.12, 0.0, q)); }
          else a = step(dot(p * vec2(1.0, 1.8), p * vec2(1.0, 1.8)), 1.0);
          vec3 c = vCol.rgb; float l = dot(c, vec3(0.299, 0.587, 0.114));
          gl_FragColor = vec4(mix(c, vec3(l), uDesat), vCol.a * a);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.name = 'vfx';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  spawn(p: Spawn): void {
    // A ring buffer: when full, the oldest slot is overwritten.
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    if (this.life[i]! <= this.age[i]!) this.alive++;
    this.s[i] = p.s; this.x[i] = p.x; this.y[i] = p.y; this.vs[i] = p.vs; this.vx[i] = p.vx; this.vy[i] = p.vy;
    this.age[i] = 0; this.life[i] = p.life; this.size0[i] = p.size; this.size1[i] = p.size1 ?? p.size;
    this.a0[i] = p.alpha; this.shape[i] = p.shape; this.grav[i] = p.gravity ?? 0; this.drag[i] = p.drag ?? 0;
    this.stretch[i] = p.stretch ?? 0; this.spin[i] = p.spin ?? 0;
    const c0 = p.color, c1 = p.color1 ?? p.color;
    this.c0[i * 3] = lin(((c0 >> 16) & 255) / 255); this.c0[i * 3 + 1] = lin(((c0 >> 8) & 255) / 255); this.c0[i * 3 + 2] = lin((c0 & 255) / 255);
    this.c1[i * 3] = lin(((c1 >> 16) & 255) / 255); this.c1[i * 3 + 1] = lin(((c1 >> 8) & 255) / 255); this.c1[i * 3 + 2] = lin((c1 & 255) / 255);
  }

  /** Integrates, then writes the live particles (rebased by originS) into the first instances. `alphaAt` caps the
   *  alpha by screen region (look-ahead zone ≤ 25%). */
  update(dt: number, originS: number, alphaCap: (s: number, y: number) => number): void {
    let k = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.age[i]! >= this.life[i]!) continue;
      const a = (this.age[i]! += dt);
      if (a >= this.life[i]!) { this.alive--; continue; }
      const dr = Math.max(0, 1 - this.drag[i]! * dt);
      this.vs[i]! *= dr; this.vx[i]! *= dr; this.vy[i] = (this.vy[i]! - this.grav[i]! * dt) * dr;
      this.s[i]! += this.vs[i]! * dt; this.x[i]! += this.vx[i]! * dt; this.y[i]! += this.vy[i]! * dt;
      const u = a / this.life[i]!;
      const o3 = k * 3, o4 = k * 4;
      this.aPos[o3] = this.x[i]!; this.aPos[o3 + 1] = this.y[i]!; this.aPos[o3 + 2] = -(this.s[i]! - originS);
      this.aVel[o3] = this.vx[i]!; this.aVel[o3 + 1] = this.vy[i]!; this.aVel[o3 + 2] = -this.vs[i]!;
      const fade = this.shape[i] === SHAPE.flake ? Math.min(1, (1 - u) * 4, u * 6) : 1 - u;
      const alpha = Math.min(this.a0[i]! * fade, alphaCap(this.s[i]!, this.y[i]!));
      for (let c = 0; c < 3; c++) this.aCol[o4 + c] = this.c0[i * 3 + c]! + (this.c1[i * 3 + c]! - this.c0[i * 3 + c]!) * u;
      this.aCol[o4 + 3] = alpha;
      this.aMisc[o4] = this.size0[i]! + (this.size1[i]! - this.size0[i]!) * u;
      this.aMisc[o4 + 1] = this.shape[i]!; this.aMisc[o4 + 2] = this.stretch[i]!; this.aMisc[o4 + 3] = this.spin[i]! * a;
      k++;
    }
    this.geo.instanceCount = k;
    for (const n of ['aPos', 'aVel', 'aCol', 'aMisc']) {
      const at = this.geo.getAttribute(n) as InstancedBufferAttribute;
      at.clearUpdateRanges(); if (k) at.addUpdateRange(0, k * at.itemSize); at.needsUpdate = true;
    }
  }

  setCap(cap: number): void { this.cap = Math.max(1, Math.min(this.n, cap)); if (this.head >= this.cap) this.head = 0; }
  clear(): void { this.age.fill(0); this.life.fill(0); this.alive = 0; this.geo.instanceCount = 0; }
  dispose(): void { this.geo.dispose(); (this.mesh.material as ShaderMaterial).dispose(); }
}
