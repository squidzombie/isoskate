// world/render/title/space.ts: the Title backdrop (owner request): the Earth alone in space at golden hour, and the
// player's equipped board floating in front of it like a small moon, slowly spinning. Everything is procedural:
//   - Earth: a sphere with the CPU-baked equirect maps (earthTexture.ts), a warm terminator band between the day side
//     and a quiet night side with a few warm lights, an ocean glint, a fresnel rim, and a pulsing warm beacon at the
//     run's start city on the dusk band;
//   - drifting clouds (their own sphere), an additive atmosphere shell, a starfield (points) and a deep indigo sky
//     with a faint sunset nebula and the sun's glow just off frame (one background sphere);
//   - the board: the skater module's hero board (two draw calls), lit by its own key light.
// 7 draw calls, ~16k triangles, no allocation per frame. The dive (TAP TO ROLL) pushes this camera into the city,
// under a cloud wash that then opens on the street (handover.ts); see game/dive.ts for the timeline.
import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, ClampToEdgeWrapping, type Camera, DataTexture,
  DirectionalLight, Group, HemisphereLight, LinearFilter, Mesh, MirroredRepeatWrapping, OrthographicCamera, PerspectiveCamera,
  Points, Quaternion, RedFormat, RepeatWrapping, RGBAFormat, Scene, ShaderMaterial, SphereGeometry, Vector3, Matrix4,
  type WebGLRenderer,
} from 'three';
import { Sfc32 } from '../../../core/rng';
import type { Viewport } from '../../../core/view';
import { EarthBaker, EARTH_TEX } from './earthTexture';
import { HandoverCamera } from './handover';
import {
  ATMO_FS, CLOUDS_FS, EARTH_FS, EARTH_VS, SKY_FS, SKY_VS, STARS_FS, STARS_VS, WASH_FS, WASH_VS,
} from './shaders';

export const TITLE_SCENE = {
  /** Scene frame: the Earth at the origin, the Title camera on +z looking along −z. Earth → sun. */
  sun: [0.86, 0.34, 0.2] as const,
  /** Where the background's sun glow sits (just off frame, upper right). */
  glow: [0.62, 0.5, -0.6] as const,
  /** The Earth's fixed orientation (deg): axial tilt toward the right, then the turn about its axis. */
  tiltDeg: -21, spinDeg: 205,
  /** The start city: on the day side of the evening terminator (dot with the sun), lifted toward the viewer. */
  cityDot: 0.06, cityUp: 0.12,
  cloudDegPerSec: 1.4,
  board: {
    /** One turn about its long axis; `linger` slows it on the graphic and the grip (θ = 2πu − linger·sin 4πu). */
    spinSec: 11, linger: 0.36,
    /** Long axis tilted from vertical (deg) with a slow sway, a lean toward the viewer and a gentle bob. */
    tiltDeg: -24, swayDeg: 6, swaySec: 7.5, leanDeg: 8, bobSec: 5.2, bob: 0.025,
    outlinePx: 2.2,
    key: [0.55, 0.45, 0.7] as const, keyColor: 0xffdcb8, keyI: 2.7, sky: 0xa898dc, ground: 0x45364f, hemiI: 1.3,
  },
  /** Layout (CSS px, from the Title UI's measured rects, TitleBand). The Earth sits behind the logo block (centre at
   *  `y` between the logo's top and TAP TO ROLL's bottom, radius of the width in portrait, of the height in
   *  landscape); the board floats in the clear band between TAP TO ROLL (and BEST) and the tab bar, `len` = its long
   *  axis as a fraction of that band (capped by `maxLen` of the height). */
  portrait: { fov: 44, earth: { x: 0.47, y: 0.62, r: 0.47 }, board: { x: 0.56, y: 0.5, len: 0.8, maxLen: 0.32 } },
  landscape: { fov: 34, earth: { x: 0.37, y: 0.78, r: 0.36 }, board: { x: 0.7, y: 0.5, len: 0.56, maxLen: 0.46 } },
  stars: 900,
} as const;

/** The Title UI's layout (CSS px): the clear band for the board (below TAP TO ROLL and BEST, above the tab bar), the
 *  logo block (the logo's top to TAP TO ROLL's bottom) the Earth sits behind, the right edge of the centre column
 *  (logo, TAP TO ROLL) and the bottom of the top chips: on wide screens the board takes the side region instead. */
export interface TitleBand { top: number; bottom: number; heroTop: number; heroBottom: number; colR: number; sideTop: number }

/** One dive frame (game/dive.ts DiveView). */
export interface DiveFrame { phase: 'space' | 'world'; u: number; v: number; cover: number; hole: number; flat: number }

const DEG = Math.PI / 180;
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const norm3 = (v: readonly [number, number, number]) => new Vector3(v[0], v[1], v[2]).normalize();

function dataTex(data: Uint8Array, w: number, h: number, rgba: boolean): DataTexture {
  const t = new DataTexture(data, w, h, rgba ? RGBAFormat : RedFormat);
  t.magFilter = LinearFilter; t.minFilter = LinearFilter; t.generateMipmaps = false;
  t.wrapS = RepeatWrapping; t.wrapT = ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export class TitleScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(TITLE_SCENE.portrait.fov, 1, 0.05, 900);
  /** The board host: the hero board's object3d goes in here (deck frame: long axis z, grip +y). */
  readonly boardSlot = new Group();
  readonly handover = new HandoverCamera();
  /** Bake telemetry (ms): the boot preview, the slices of the full maps. */
  readonly bake = { previewMs: 0, slices: 0, maxSliceMs: 0, totalMs: 0, done: false, uploadedAt: -1 };
  private readonly earthGroup = new Group();
  private readonly earth: Mesh; private readonly clouds: Mesh; private readonly atmo: Mesh;
  private readonly sky: Mesh; private readonly stars: Points;
  private readonly anchor = new Group(); private readonly tilt = new Group(); private readonly spin = new Group();
  private readonly key: DirectionalLight;
  private readonly earthMat: ShaderMaterial; private readonly cloudMat: ShaderMaterial; private readonly atmoMat: ShaderMaterial;
  private readonly starMat: ShaderMaterial;
  private readonly washMat: ShaderMaterial; private readonly washScene = new Scene(); private readonly washCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly sun: Vector3; private readonly sunHome: Vector3; private readonly cityLocal: Vector3;
  private readonly full: EarthBaker;
  private colorHi: DataTexture | null = null; private cloudsHi: DataTexture | null = null; private puffHi: DataTexture | null = null;
  private readonly colorLo: DataTexture; private readonly cloudsLo: DataTexture; private readonly puffLo: DataTexture;
  private time = 0; private mixT = 0;
  private vpW = -1; private vpH = -1;
  /** The band the layout was made for (compared field by field: nothing allocates per frame). */
  private readonly laid = { on: false, top: 0, bottom: 0, heroTop: 0, heroBottom: 0, colR: 0 };
  private dpr = 1;
  // Layout pose (restored after a dive) and dive scratch.
  private readonly camHome = new Vector3(); private readonly anchorHome = new Vector3(); private boardScale = 1;
  private diving = false;
  private readonly cityW = new Vector3(); private readonly n0 = new Vector3(); private readonly n1 = new Vector3();
  private readonly tmp = new Vector3(); private readonly tmp2 = new Vector3(); private readonly q0 = new Quaternion();
  private readonly qLook = new Quaternion(); private readonly mLook = new Matrix4();
  private spin0 = 0; private boardA = 0.4; private readonly boardOff = new Vector3(); private baseFov: number = TITLE_SCENE.portrait.fov;
  private lastCalls = 0; private lastTris = 0;

  constructor(private readonly band: () => TitleBand | null = () => null) {
    this.scene.name = 'title-space';
    this.scene.matrixWorldAutoUpdate = true;
    const C = TITLE_SCENE;
    this.sun = norm3(C.sun); this.sunHome = this.sun.clone();
    // Earth orientation and the start city (an Earth-local unit vector, fixed for the bake).
    this.earthGroup.rotation.set(0, 0, C.tiltDeg * DEG);
    this.earthGroup.updateMatrix();
    const spinQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), C.spinDeg * DEG);
    const V = new Vector3(0, 0, 1);
    const L = this.sun;
    // City normal: the view axis pushed onto the cityDot iso-line of the sun, lifted a little toward +y.
    const nCity = V.clone().addScaledVector(L, C.cityDot - V.dot(L)).add(new Vector3(0, C.cityUp, 0));
    nCity.addScaledVector(L, C.cityDot - nCity.clone().normalize().dot(L)).normalize();
    const earthQ = new Quaternion().setFromEuler(this.earthGroup.rotation).multiply(spinQ);
    this.cityLocal = nCity.clone().applyQuaternion(earthQ.clone().invert());
    const city = [this.cityLocal.x, this.cityLocal.y, this.cityLocal.z] as const;
    // Boot preview maps (1/16 of the texels, synchronous), then the full maps in idle slices (startBake).
    const t0 = nowMs();
    const pre = new EarthBaker({ w: EARTH_TEX.w / 4, h: EARTH_TEX.h / 4, cloudW: EARTH_TEX.cloudW / 4, cloudH: EARTH_TEX.cloudH / 4, puff: EARTH_TEX.puff / 4, city });
    pre.bakeAll();
    this.bake.previewMs = nowMs() - t0;
    this.colorLo = dataTex(pre.color, pre.w, pre.h, true);
    this.cloudsLo = dataTex(pre.clouds, pre.cw, pre.ch, false);
    this.puffLo = mirrored(dataTex(pre.puff, pre.pw, pre.pw, false));
    this.full = new EarthBaker({ city });

    const geo = new SphereGeometry(1, 72, 48), geoLo = new SphereGeometry(1, 40, 24);
    const sh = (fs: string, u: Record<string, { value: unknown }>, o: Partial<ConstructorParameters<typeof ShaderMaterial>[0]> = {}) =>
      new ShaderMaterial({ vertexShader: EARTH_VS, fragmentShader: fs, uniforms: u, ...o });
    const tex = { uMap: { value: this.colorLo }, uMapLo: { value: this.colorLo }, uClouds: { value: this.cloudsLo }, uCloudsLo: { value: this.cloudsLo }, uMix: { value: 0 } };
    this.earthMat = sh(EARTH_FS, { ...tex, uSun: { value: this.sun }, uCity: { value: this.cityLocal }, uTime: { value: 0 }, uCloudRot: { value: 0 }, uBeacon: { value: 1 }, uDive: { value: 0 } });
    this.cloudMat = sh(CLOUDS_FS, { uClouds: tex.uClouds, uCloudsLo: tex.uCloudsLo, uMix: tex.uMix, uSun: { value: this.sun }, uFade: { value: 1 } },
      { transparent: true, depthWrite: false });
    this.atmoMat = sh(ATMO_FS, { uSun: { value: this.sun }, uGain: { value: 1 } }, { side: BackSide, transparent: true, depthWrite: false, blending: AdditiveBlending });
    this.earth = new Mesh(geo, this.earthMat); this.earth.name = 'title-earth';
    this.earth.rotation.y = C.spinDeg * DEG;
    this.clouds = new Mesh(geo, this.cloudMat); this.clouds.name = 'title-clouds';
    this.clouds.scale.setScalar(1.012); this.clouds.renderOrder = 1;
    this.atmo = new Mesh(geoLo, this.atmoMat); this.atmo.name = 'title-atmosphere';
    this.atmo.scale.setScalar(1.075); this.atmo.renderOrder = 2;
    this.earth.add(this.clouds);
    this.earthGroup.add(this.earth, this.atmo);
    // The atmosphere shader reads its own local position as the up vector: keep it unrotated relative to the sun.
    this.atmo.rotation.set(0, 0, 0);

    const skyMat = new ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: BackSide, depthWrite: false,
      uniforms: { uNoise: { value: this.cloudsLo }, uGlow: { value: norm3(C.glow) } } });
    this.sky = new Mesh(geoLo, skyMat); this.sky.name = 'title-sky';
    this.sky.scale.setScalar(600); this.sky.renderOrder = -10; this.sky.frustumCulled = false;

    this.starMat = new ShaderMaterial({ vertexShader: STARS_VS, fragmentShader: STARS_FS, transparent: true, depthWrite: false,
      blending: AdditiveBlending, uniforms: { uTime: { value: 0 }, uPx: { value: 1 } } });
    this.stars = new Points(starGeometry(C.stars), this.starMat); this.stars.name = 'title-stars';
    this.stars.frustumCulled = false;

    // The board: anchor (layout position) → tilt (sway, lean) → spin (about the long axis) → deck frame (nose up).
    this.boardSlot.rotation.x = Math.PI / 2;
    this.anchor.add(this.tilt); this.tilt.add(this.spin); this.spin.add(this.boardSlot);
    const B = C.board;
    this.key = new DirectionalLight(B.keyColor, B.keyI * Math.PI);
    this.key.position.copy(norm3(B.key)).multiplyScalar(10);
    const hemi = new HemisphereLight(B.sky, B.ground, B.hemiI * Math.PI);
    this.scene.add(this.sky, this.stars, this.earthGroup, this.anchor, this.key, this.key.target, hemi);

    // The dive's cloud wash: one full-screen triangle, drawn over whichever scene the dive shows.
    const tri = new BufferGeometry();
    tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.washMat = new ShaderMaterial({ vertexShader: WASH_VS, fragmentShader: WASH_FS, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uNoise: { value: this.puffLo }, uCover: { value: 0 }, uHole: { value: -1 }, uFlat: { value: 0 }, uZoom: { value: 0 },
        uAspect: { value: { x: 1, y: 1 } }, uTime: { value: 0 } } });
    const wash = new Mesh(tri, this.washMat); wash.frustumCulled = false;
    this.washScene.add(wash);
  }

  /** Starts the full-resolution bake in idle slices (≤ EARTH_TEX.sliceMs each); `schedule` runs a callback later. */
  startBake(schedule: (step: (budgetMs: number) => boolean) => void = idleSlices): void {
    schedule((budgetMs) => {
      const done = this.full.step(Math.min(EARTH_TEX.sliceMs, budgetMs), nowMs);
      const b = this.bake;
      b.slices = this.full.slices; b.maxSliceMs = this.full.maxSliceMs; b.totalMs = this.full.totalMs;
      if (done && !b.done) this.uploadFull();
      return done;
    });
  }

  /** Bake progress 0…1. */
  get bakeProgress(): number { return this.full.progress; }

  /** Per frame on the Title (and under the menus opened from it): animation and layout. */
  update(dt: number, vp: Viewport): void {
    const d = Math.min(0.1, Math.max(0, dt));
    this.time += d;
    if (vp.wCss !== this.vpW || vp.hCss !== this.vpH || (!this.diving && this.bandMoved())) this.layout(vp);
    if (this.colorHi && this.mixT < 1) {
      this.mixT = Math.min(1, this.mixT + d / 0.6);
      this.earthMat.uniforms.uMix!.value = ss(0, 1, this.mixT);
    }
    const C = TITLE_SCENE, B = C.board, t = this.time;
    this.earthMat.uniforms.uTime!.value = t;
    const rot = (t * C.cloudDegPerSec * DEG) % (2 * Math.PI);
    this.clouds.rotation.y = rot;
    this.earthMat.uniforms.uCloudRot!.value = rot / (2 * Math.PI);
    this.starMat.uniforms.uTime!.value = t;
    if (!this.diving) {
      const u = (t / B.spinSec + 0.5) % 1;                 // opens on the graphic (θ = π)
      this.spin.rotation.y = 2 * Math.PI * u - B.linger * Math.sin(4 * Math.PI * u);
      this.tilt.rotation.set(B.leanDeg * DEG, 0, (B.tiltDeg + B.swayDeg * Math.sin((2 * Math.PI * t) / B.swaySec)) * DEG);
      this.anchor.position.copy(this.anchorHome);
      this.anchor.position.y += B.bob * this.boardScale * Math.sin((2 * Math.PI * t) / B.bobSec);
    }
  }

  /** Draws the space scene (the Title backdrop). */
  render(r: WebGLRenderer): void {
    this.starMat.uniforms.uPx!.value = r.getPixelRatio();
    r.render(this.scene, this.camera);
    this.lastCalls = r.info.render.calls; this.lastTris = r.info.render.triangles + r.info.render.points;
  }

  /** Draw calls and triangles (points included) of the last space render; bake telemetry. */
  stats() { return { drawCalls: this.lastCalls, tris: this.lastTris, bake: { ...this.bake, progress: this.full.progress } }; }

  // ── the dive ────────────────────────────────────────────────────────────────────────────────────────────────────
  /** TAP TO ROLL: remember where the camera and the board start. */
  beginDive(): void {
    this.diving = true;
    this.camera.updateMatrixWorld();
    this.q0.copy(this.camera.quaternion);
    this.spin0 = this.spin.rotation.y;
    this.earthGroup.updateMatrixWorld(true);
    this.cityW.copy(this.cityLocal).applyMatrix4(this.earth.matrixWorld);
    this.n1.copy(this.cityW).normalize();
    this.n0.copy(this.camHome).sub(this.cityW).normalize();
    // The board's place relative to the camera → city line: its fraction along it, and its offset from it.
    this.tmp.copy(this.cityW).sub(this.camHome);
    const len2 = this.tmp.lengthSq();
    this.tmp2.copy(this.anchorHome).sub(this.camHome);
    this.boardA = Math.min(0.9, Math.max(0.05, this.tmp2.dot(this.tmp) / len2));
    this.boardOff.copy(this.anchorHome).sub(this.camHome).addScaledVector(this.tmp, -this.boardA);
  }

  /** Back to the Title pose (the dive ended or was cancelled). */
  endDive(): void {
    if (!this.diving) return;
    this.diving = false;
    this.camera.position.copy(this.camHome); this.camera.quaternion.copy(this.q0);
    this.camera.near = 0.05; this.camera.updateProjectionMatrix();
    this.anchor.position.copy(this.anchorHome); this.anchor.scale.setScalar(1); this.anchor.visible = true;
    this.cloudMat.uniforms.uFade!.value = 1; this.atmoMat.uniforms.uGain!.value = 1;
    this.earthMat.uniforms.uBeacon!.value = 1; this.earthMat.uniforms.uDive!.value = 0;
    this.sun.copy(this.sunHome);
    this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
  }

  /** One dive frame. Space phase: the push into the city (this scene). World phase: the world scene through the
   *  hand-over camera (`world` = the run's scene, camera and the rider's position). Then the wash on top. */
  renderDive(r: WebGLRenderer, f: DiveFrame, vp: Viewport, world: { scene: Scene; camera: Camera; focus: Vector3 }): Camera {
    let cam: Camera;
    if (f.phase === 'space') {
      if (!this.diving) this.beginDive();
      this.spaceDive(f.flat ? 0 : f.u);
      this.render(r);
      cam = this.camera;
    } else {
      cam = f.flat ? world.camera : this.handover.at(f.v, world.camera, world.focus, vp.wCss / Math.max(1, vp.hCss));
      r.render(world.scene, cam);
    }
    this.drawWash(r, f, vp);
    return cam;
  }

  private spaceDive(u: number): void {
    const cam = this.camera;
    // Distance to the city falls geometrically (accelerating), the direction swings onto the city's normal and the
    // camera turns to look straight at it.
    const d0 = this.camHome.distanceTo(this.cityW), d1 = 0.0045;
    const e = Math.pow(u, 2.1);
    const dist = d0 * Math.pow(d1 / d0, e);
    const w = ss(0, 0.8, u);
    this.tmp.copy(this.n0).lerp(this.n1, w).normalize();
    cam.position.copy(this.cityW).addScaledVector(this.tmp, dist);
    this.mLook.lookAt(cam.position, this.cityW, this.tmp2.set(0, 1, 0));
    this.qLook.setFromRotationMatrix(this.mLook);
    cam.quaternion.slerpQuaternions(this.q0, this.qLook, ss(0, 0.4, u));
    cam.near = Math.max(0.0004, Math.min(0.05, dist * 0.25));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // The board leads the dive: it slides onto the camera → city line and falls ahead of the camera into the city,
    // shrinking to a speck (its scale follows the shrinking distance, so it never fills the frame).
    const k = ss(0, 0.55, u);
    this.tmp.copy(this.cityW).sub(cam.position);
    const a = this.boardA + (0.97 - this.boardA) * ss(0.1, 0.8, u);
    this.anchor.position.copy(cam.position).addScaledVector(this.tmp, a).addScaledVector(this.boardOff, 1 - k);
    this.anchor.scale.setScalar((dist / d0) * (1 - 0.85 * ss(0.35, 0.8, u)));
    this.spin.rotation.y = this.spin0 + 7 * u * u;
    this.anchor.visible = u < 0.9;
    cam.fov = this.baseFov + 18 * ss(0.25, 0.85, u);
    cam.updateProjectionMatrix();
    // Close to the surface the cloud sphere and the outer glow would fill the frame flat: fade them out.
    this.cloudMat.uniforms.uFade!.value = 1 - ss(0.82, 0.97, u);
    this.atmoMat.uniforms.uGain!.value = 1 - ss(0.7, 0.95, u);
    this.earthMat.uniforms.uBeacon!.value = 1 - ss(0.15, 0.45, u);
    const warm = ss(0.1, 0.7, u);
    this.earthMat.uniforms.uDive!.value = warm;
    // The late sun swings round onto the city: the dusk band moves off and the approach glows gold, not night blue.
    this.sun.copy(this.sunHome).addScaledVector(this.n1, 0.9 * warm).normalize();
  }

  private drawWash(r: WebGLRenderer, f: DiveFrame, vp: Viewport): void {
    if (f.cover <= 0.001) return;
    const u = this.washMat.uniforms, s = Math.min(vp.wCss, vp.hCss) || 1;
    u.uCover!.value = f.cover; u.uHole!.value = f.hole; u.uFlat!.value = f.flat;
    u.uZoom!.value = f.phase === 'space' ? 6 * Math.pow(f.u, 3) : 6 + 2 * f.v;
    (u.uAspect!.value as { x: number; y: number }).x = vp.wCss / s;
    (u.uAspect!.value as { x: number; y: number }).y = vp.hCss / s;
    u.uTime!.value = this.time;
    const ac = r.autoClear;
    r.autoClear = false;
    r.render(this.washScene, this.washCam);
    r.autoClear = ac;
  }

  // ── layout ─────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Places the camera so the Earth and the board land in the free band (never under the logo, TAP TO ROLL, the
   *  chips or the tab bar). */
  layout(vp: Viewport): void {
    const W = Math.max(1, vp.wCss), H = Math.max(1, vp.hCss);
    this.vpW = vp.wCss; this.vpH = vp.hCss; this.dpr = vp.dpr;
    const portrait = W / H < 0.85, P = portrait ? TITLE_SCENE.portrait : TITLE_SCENE.landscape;
    const b = this.band() ?? { top: H * 0.47, bottom: H * 0.9, heroTop: H * 0.15, heroBottom: H * 0.44, colR: W * 0.7, sideTop: H * 0.08 };
    this.keep(this.band());
    const bandH = Math.max(60, b.bottom - b.top);
    const cam = this.camera;
    cam.fov = P.fov; cam.aspect = W / H; cam.near = 0.05; cam.far = 900; this.baseFov = P.fov;
    cam.clearViewOffset(); cam.updateProjectionMatrix();
    const t = Math.tan((P.fov * DEG) / 2), f = H / 2 / t;
    const ray = (x: number, y: number, out: Vector3) => out.set(((2 * x) / W - 1) * t * (W / H), (1 - (2 * y) / H) * t, -1);
    // Earth: centre on screen and its radius in px → distance; the camera sits opposite the ray from the Earth.
    const ex = P.earth.x * W, ey = b.heroTop + P.earth.y * (b.heroBottom - b.heroTop), er = P.earth.r * (portrait ? W : H);
    ray(ex, ey, this.tmp);
    const De = 1 / Math.sin(Math.atan(er / f));
    const dir = this.tmp.normalize();
    this.camHome.copy(dir).multiplyScalar(-De);
    cam.position.copy(this.camHome);
    cam.quaternion.identity();
    cam.updateMatrixWorld();
    // Board: the band's anchor point at a depth that gives it `len` px of long axis.
    let bx = P.board.x * W, by = b.top + P.board.y * bandH, len = Math.min(P.board.len * bandH, P.board.maxLen * H);
    if (!portrait && W - b.colR > 0.24 * W) {
      // Wide screens: the side region right of the logo column, from under the chips to the tab bar.
      const sh = b.bottom - b.sideTop;
      bx = (b.colR + W) / 2; by = b.sideTop + 0.5 * sh;
      len = Math.min(P.board.len * sh, P.board.maxLen * H, 1.6 * (W - b.colR));
    }
    const depth = (0.8 * f) / Math.max(40, len);
    ray(bx, by, this.tmp2).multiplyScalar(depth).add(cam.position);
    this.anchorHome.copy(this.tmp2);
    this.anchor.position.copy(this.anchorHome);
    this.boardScale = 0.8;
    this.key.target.position.copy(this.anchorHome);
    this.key.position.copy(norm3(TITLE_SCENE.board.key)).multiplyScalar(10).add(this.anchorHome);
    this.sky.position.copy(cam.position);
  }

  /** Compiles the wash program ahead of the dive (it is first drawn mid-dive); `draw` also draws it once into a
   *  1-pixel scissor, which forces the compile to finish where shaders do not compile in parallel. */
  precompile(r: WebGLRenderer, draw = false): void {
    try {
      if (!draw) { r.compile(this.washScene, this.washCam); return; }
      this.washMat.uniforms.uCover!.value = 0.5;
      scissored(r, () => r.render(this.washScene, this.washCam));
    } catch { /* lost context */ }
  }

  /** Draws `scene` once into a 1-pixel scissor (uploads what it has not drawn yet, finishes compiles), under the
   *  frame that follows. */
  static warm(r: WebGLRenderer, scene: Scene, camera: Camera): void { scissored(r, () => r.render(scene, camera)); }

  private keep(b: TitleBand | null): void {
    const l = this.laid;
    l.on = !!b;
    if (b) { l.top = b.top; l.bottom = b.bottom; l.heroTop = b.heroTop; l.heroBottom = b.heroBottom; l.colR = b.colR; }
  }
  private bandMoved(): boolean {
    const b = this.band(), l = this.laid;
    if (!b) return l.on;
    const far = (a: number, c: number) => Math.abs(a - c) >= 1;
    return !l.on || far(b.top, l.top) || far(b.bottom, l.bottom) || far(b.heroTop, l.heroTop) || far(b.heroBottom, l.heroBottom) || far(b.colR, l.colR);
  }

  /** Context restore: re-upload the baked maps. */
  rebuildGPU(): void {
    for (const t of [this.colorLo, this.cloudsLo, this.puffLo, this.colorHi, this.cloudsHi, this.puffHi]) if (t) t.needsUpdate = true;
  }

  private uploadFull(): void {
    const f = this.full;
    this.colorHi = dataTex(f.color, f.w, f.h, true);
    this.cloudsHi = dataTex(f.clouds, f.cw, f.ch, false);
    const u = this.earthMat.uniforms;
    u.uMap!.value = this.colorHi; u.uClouds!.value = this.cloudsHi;
    this.cloudMat.uniforms.uClouds!.value = this.cloudsHi;
    this.puffHi = mirrored(dataTex(f.puff, f.pw, f.pw, false));
    this.washMat.uniforms.uNoise!.value = this.puffHi;
    this.bake.done = true; this.bake.uploadedAt = nowMs();
  }
}

/** The wash samples its noise past the edges as it zooms: mirrored, so it never smears into streaks. */
function mirrored(t: DataTexture): DataTexture { t.wrapS = MirroredRepeatWrapping; t.wrapT = MirroredRepeatWrapping; return t; }

function scissored(r: WebGLRenderer, draw: () => void): void {
  const ac = r.autoClear;
  r.autoClear = false;
  r.setScissorTest(true); r.setScissor(0, 0, 1, 1);
  try { draw(); } finally { r.setScissorTest(false); r.autoClear = ac; }
}

function starGeometry(n: number): BufferGeometry {
  const rng = new Sfc32(0x57a125);
  const pos = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n), tint = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const z = rng.float() * 2 - 1, a = rng.float() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    pos[i * 3] = 300 * r * Math.cos(a); pos[i * 3 + 1] = 300 * z; pos[i * 3 + 2] = 300 * r * Math.sin(a);
    const k = rng.float();
    size[i] = k > 0.985 ? 3.4 : k > 0.93 ? 2.4 : 1.1 + rng.float() * 0.9;
    phase[i] = rng.float();
    const warm = rng.float();
    const c = warm > 0.8 ? [1.0, 0.82, 0.62] : warm < 0.15 ? [0.72, 0.8, 1.0] : [1.0, 0.96, 0.9];
    const b = k > 0.93 ? 1 : 0.45 + 0.4 * rng.float();
    tint[i * 3] = c[0]! * b; tint[i * 3 + 1] = c[1]! * b; tint[i * 3 + 2] = c[2]! * b;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aSize', new BufferAttribute(size, 1));
  g.setAttribute('aPhase', new BufferAttribute(phase, 1));
  g.setAttribute('aTint', new BufferAttribute(tint, 3));
  return g;
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Idle-time slices: requestIdleCallback with its deadline (several slices while it lasts; no timeout, so a busy run
 *  frame is never interrupted), else one slice per setTimeout. */
function idleSlices(step: (budgetMs: number) => boolean): void {
  const g = globalThis as { requestIdleCallback?: (f: (d: { timeRemaining(): number }) => void) => number };
  let skipped = 0;
  const run = (d?: { timeRemaining(): number }) => {
    if (d && d.timeRemaining() < EARTH_TEX.sliceMs && ++skipped < 30) { next(); return; }   // a short idle period: wait
    skipped = 0;
    let done = step(EARTH_TEX.sliceMs);
    while (!done && d && d.timeRemaining() > EARTH_TEX.sliceMs + 1) done = step(EARTH_TEX.sliceMs);
    if (!done) next();
  };
  const next = () => { if (g.requestIdleCallback) g.requestIdleCallback(run); else setTimeout(run, 16); };
  next();
}
