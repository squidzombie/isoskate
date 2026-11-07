// world/render/sky.ts: what only the menu cameras see (DESIGN §18.3, layer 1: the ortho run camera never looks at the
// horizon): the sky dome (3-stop gradient, sun disc, glow falloff), 5–8 lozenge clouds with warm tops and rosy
// undersides, an occasional V of 5 birds, and two parallax skyline strips (the near one 15% darker; emissive window
// dots in Neon). Plus the run camera's screen-space sky glow inside the HUD band (horizon colour → transparent,
// alpha 0.25), which never reaches the zone where hazards are first read.
import {
  AdditiveBlending, BackSide, BufferAttribute, DoubleSide, BufferGeometry, Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry,
  ShaderMaterial, SphereGeometry, type Camera, type Scene,
} from 'three';
import type { PaletteSample } from '../../core/view';
import { Sfc32, hash32 } from '../../core/rng';
import { sharedUniforms } from '../../gfx';
import type { GfxContext } from '../../core/view';
import { shade } from './palette';

export const SKY_LAYER = 1;
export const SKY = { radius: 380, clouds: 7, birdsEvery: 26, stripNear: 210, stripFar: 330 } as const;

const col = (hex: number) => new Color(hex);

export class Sky {
  readonly group = new Group();
  private readonly dome: Mesh;
  private readonly domeMat: ShaderMaterial;
  private readonly clouds: Mesh[] = [];
  private readonly birds: Mesh;
  private readonly strips: Mesh[] = [];
  private readonly stripMat: MeshBasicMaterial[] = [];
  private readonly windowMat: MeshBasicMaterial;
  private readonly cloudTop = new MeshBasicMaterial({ color: 0xffc9a8, fog: false });
  private readonly cloudBot = new MeshBasicMaterial({ color: 0xe58f8a, fog: false });
  private t = 0;
  /** Screen-space glow in the HUD band (run camera). */
  readonly glow: Mesh;
  private readonly glowMat: ShaderMaterial;

  constructor(ctx: GfxContext) {
    const u = sharedUniforms(ctx);
    this.group.name = 'sky';
    this.domeMat = new ShaderMaterial({
      side: BackSide, depthWrite: false, fog: false,
      uniforms: { uZen: { value: col(0x8e7cc3) }, uMid: { value: col(0xf2a37b) }, uHor: { value: col(0xffd9a0) }, uSun: { value: col(0xfff1c9) },
        uSunGlow: { value: col(0xffc27a) }, uSunDir: { value: [0, 0.2, -1] }, uDisc: { value: 1 }, uDesat: u.uDesat },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
      fragmentShader: /* glsl */`
        uniform vec3 uZen; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunGlow; uniform vec3 uSunDir;
        uniform float uDisc; uniform float uDesat;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 c = h < 0.12 ? mix(uHor, uMid, smoothstep(-0.02, 0.12, h)) : mix(uMid, uZen, smoothstep(0.12, 0.65, h));
          vec3 sd = normalize(uSunDir);
          float d = max(0.0, dot(normalize(vDir), sd));
          c += uSunGlow * pow(d, 18.0) * 0.55 * uDisc + uSunGlow * pow(d, 4.0) * 0.18 * uDisc;
          c = mix(c, uSun, smoothstep(0.9993, 0.9996, d) * uDisc);
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          gl_FragColor = vec4(mix(c, vec3(l), uDesat), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new Mesh(new SphereGeometry(SKY.radius, 24, 12), this.domeMat);
    this.dome.name = 'skyDome';
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);
    // Clouds: flattened lozenges (two-tone: warm top, rosy underside).
    const r = new Sfc32(hash32(0xc10d));
    for (let i = 0; i < SKY.clouds; i++) {
      const g = new Group();
      const top = new Mesh(new SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), this.cloudTop);
      const bot = new Mesh(new SphereGeometry(1, 10, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this.cloudBot);
      bot.scale.y = 0.35;
      g.add(top, bot);
      const m = new Mesh(); m.add(g);
      const sx = r.range(24, 52);
      g.scale.set(sx, r.range(5, 8), r.range(10, 16));
      // Three in the narrow portrait view up the street, the rest spread for landscape.
      const z = r.range(200, 330), wide = i >= 3 ? 1.6 : 0.4;
      m.position.set(r.range(-0.5, 0.5) * z * wide, z * r.range(0.16, 0.42), -z);
      m.userData.drift = r.range(0.6, 1.6);
      this.clouds.push(m);
      this.group.add(m);
    }
    // Birds: a V of five chevrons.
    this.birds = new Mesh(birdGeometry(), new MeshBasicMaterial({ color: 0x3a2b4c, fog: false, side: DoubleSide }));
    this.birds.visible = false;
    this.group.add(this.birds);
    // Skyline strips: two rows of extruded silhouettes (near 15% darker), Neon window dots on the near one.
    this.windowMat = new MeshBasicMaterial({ color: 0xffd39a, fog: false, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    for (const [k, dist] of [[0, SKY.stripFar], [1, SKY.stripNear]] as const) {
      const mat = new MeshBasicMaterial({ color: 0x6b4e8c, fog: false, side: DoubleSide });
      const { body, windows } = skylineGeometry(k, dist);
      const m = new Mesh(body, mat);
      m.name = `skyline${k}`;
      m.renderOrder = -9 + k;
      this.strips.push(m); this.stripMat.push(mat);
      this.group.add(m);
      if (windows) { const w = new Mesh(windows, this.windowMat); w.renderOrder = -7; m.add(w); }
    }
    this.group.traverse((o) => { o.layers.set(SKY_LAYER); o.frustumCulled = false; });

    // HUD-band sky glow (run camera, layer 0): a screen-space quad from the top of the frame down to hudTop.
    this.glowMat = new ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, fog: false,
      uniforms: { uCol: { value: col(0xffd9a0) }, uTop: { value: 0.066 }, uAlpha: { value: 0.25 }, uDesat: u.uDesat },
      // The quad covers only the band (no full-screen blend): vY runs 1 − uTop … 1 from its bottom edge to the top.
      vertexShader: 'uniform float uTop; varying float vY; void main() { vY = 1.0 - uTop * (0.5 - 0.5 * position.y); gl_Position = vec4(position.x, vY * 2.0 - 1.0, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uCol; uniform float uTop; uniform float uAlpha; uniform float uDesat;
        varying float vY;
        void main() {
          float k = smoothstep(1.0 - uTop, 1.0, vY);
          vec3 c = uCol; float l = dot(c, vec3(0.299, 0.587, 0.114));
          gl_FragColor = vec4(mix(c, vec3(l), uDesat), uAlpha * k);
          #include <colorspace_fragment>
        }`,
    });
    this.glow = new Mesh(new PlaneGeometry(2, 2), this.glowMat);
    this.glow.name = 'skyGlow';
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 1000;
  }

  addTo(scene: Scene): void { scene.add(this.group, this.glow); }

  /** Per frame: colours from the palette, the dome and strips around the camera, cloud drift, the bird pass. */
  update(p: PaletteSample, sunDisc: number, cam: Camera, dt: number, hudTop: number, skyGlow: number, neonGlow: number, menu: boolean): void {
    this.t += dt;
    const m = this.domeMat.uniforms;
    (m.uZen!.value as Color).setHex(p.zenith); (m.uMid!.value as Color).setHex(p.mid); (m.uHor!.value as Color).setHex(p.horizon);
    (m.uSun!.value as Color).setHex(p.sun); (m.uSunGlow!.value as Color).setHex(p.sunGlow);
    m.uDisc!.value = sunDisc;
    // The menu cameras look up the street: the sun (or, at blue hour, its afterglow) sits low over the vanishing point,
    // a little left, so it is in frame in portrait too.
    const el = (Math.max(6, p.sunElevDeg * 0.5) * Math.PI) / 180;
    m.uSunDir!.value = [-0.09, Math.sin(el), -Math.cos(el)];
    this.group.visible = menu;
    this.group.position.copy(cam.position);
    this.cloudTop.color.setHex(shade(p.horizon, 0.1)).lerp(new Color(0xffc9a8), 0.5 * (1 - neonGlow));
    this.cloudBot.color.setHex(p.mid).lerp(new Color(0xe58f8a), 0.5 * (1 - neonGlow));
    for (const c of this.clouds) { c.position.x += (c.userData.drift as number) * dt; if (c.position.x > 240) c.position.x -= 480; }
    this.stripMat[0]!.color.setHex(shade(p.zenith, -0.05)).lerp(new Color(p.mid), 0.35);
    this.stripMat[1]!.color.copy(this.stripMat[0]!.color).multiplyScalar(0.85);
    this.windowMat.opacity = 0.15 + 0.85 * neonGlow;
    // A V of five birds crosses every ~26 s.
    const ph = (this.t % SKY.birdsEvery) / SKY.birdsEvery;
    this.birds.visible = menu && ph < 0.45;
    if (this.birds.visible) {
      const u = ph / 0.45;
      this.birds.position.set(-120 + 240 * u, 46 + 6 * Math.sin(u * 3), -150);
      this.birds.scale.setScalar(1 + 0.05 * Math.sin(this.t * 6));
    }
    // HUD-band glow (run camera only).
    this.glow.visible = !menu;
    const g = this.glowMat.uniforms;
    (g.uCol!.value as Color).setHex(p.horizon);
    g.uTop!.value = Math.max(0.02, hudTop);
    g.uAlpha!.value = skyGlow;
  }

  dispose(): void {
    this.group.traverse((o) => { const mm = o as Mesh; if (mm.isMesh) mm.geometry.dispose(); });
    this.domeMat.dispose(); this.cloudTop.dispose(); this.cloudBot.dispose(); this.windowMat.dispose();
    for (const s of this.stripMat) s.dispose();
    this.glow.geometry.dispose(); this.glowMat.dispose();
  }
}

function birdGeometry(): BufferGeometry {
  const pos: number[] = [];
  const offs = [[0, 0], [-3, -1.5], [3, -1.5], [-6, -3], [6, -3]] as const;
  for (const [dx, dy] of offs) {
    pos.push(dx - 1.2, dy + 0.5, 0, dx, dy, 0, dx, dy + 0.25, 0);
    pos.push(dx, dy, 0, dx + 1.2, dy + 0.5, 0, dx, dy + 0.25, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  return g;
}

/** A strip of building silhouettes on an arc at `dist` (k = 0 far, 1 near), optional window dots (near strip). */
function skylineGeometry(k: number, dist: number): { body: BufferGeometry; windows: BufferGeometry | null } {
  const r = new Sfc32(hash32(0x5c1, k));
  const pos: number[] = [], win: number[] = [];
  const quad = (o: number[], ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number) => {
    o.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
  };
  for (let a = -1.2; a < 1.2;) {
    const w = r.range(0.025, 0.06), h = dist * r.range(0.05, 0.16) * (k ? 0.8 : 1);
    const x0 = Math.sin(a) * dist, z0 = -Math.cos(a) * dist, x1 = Math.sin(a + w) * dist, z1 = -Math.cos(a + w) * dist;
    quad(pos, x0, -4, z0, x1, -4, z1, x1, h, z1, x0, h, z0);
    if (r.chance(0.25)) { const t = h + r.range(4, 12); quad(pos, (x0 * 0.7 + x1 * 0.3), h, (z0 * 0.7 + z1 * 0.3), (x0 * 0.5 + x1 * 0.5), h, (z0 * 0.5 + z1 * 0.5), (x0 * 0.5 + x1 * 0.5), t, (z0 * 0.5 + z1 * 0.5), (x0 * 0.7 + x1 * 0.3), t, (z0 * 0.7 + z1 * 0.3)); }
    if (k === 1) {
      for (let y = 3; y < h - 2; y += 3.2) for (let u = 0.15; u < 0.9; u += 0.22) {
        if (!r.chance(0.35)) continue;
        const px = x0 + (x1 - x0) * u, pz = z0 + (z1 - z0) * u, s = 0.6;
        quad(win, px - s, y, pz + 0.5, px + s, y, pz + 0.5, px + s, y + s * 1.4, pz + 0.5, px - s, y + s * 1.4, pz + 0.5);
      }
    }
    a += w + r.range(0, 0.015);
  }
  const body = new BufferGeometry();
  body.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  let windows: BufferGeometry | null = null;
  if (win.length) { windows = new BufferGeometry(); windows.setAttribute('position', new BufferAttribute(new Float32Array(win), 3)); }
  return { body, windows };
}
