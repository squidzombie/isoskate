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
  Points, Quaternion, RedFormat, RepeatWrapping, RGBAFormat, Scene, ShaderMaterial, SphereGeometry, type Texture, Vector2, Vector3,
  Vector4, Matrix4, type WebGLRenderer,
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
    /** One turn about its long axis, at a constant rate (owner direction: it floats in space, so no easing and no
     *  lingering on a face; edge-on moments are part of it). */
    spinSec: 11,
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
  /** The soft dark vignette behind the logo block (TitleBand.scrim*): depth at its centre, and its radii as a multiple
   *  of the block's half size. */
  scrim: { k: 0.4, padX: 1.3, padY: 1.55 },
  /** Cross-fade (s) from one bake stage of a map to the next (placeholder → boot preview → full). */
  fadeSec: 0.6,
} as const;

/** The Title UI's layout (CSS px): the clear band for the board (below TAP TO ROLL and BEST, above the tab bar), the
 *  logo block (the logo's top to TAP TO ROLL's bottom) the Earth sits behind, the right edge of the centre column
 *  (logo, TAP TO ROLL) and the bottom of the top chips: on wide screens the board takes the side region instead. */
export interface TitleBand {
  top: number; bottom: number; heroTop: number; heroBottom: number; colR: number; sideTop: number;
  /** The logo block (logo + tagline): centre and half size; scrimRx 0 = none. */
  scrimX: number; scrimY: number; scrimRx: number; scrimRy: number;
}

/** One map's texture pair in the shaders: `hi` fades in over `lo` as each bake stage lands. */
interface Layer { lo: { value: Texture }; hi: { value: Texture }; mix: { value: number }; t: number }
function fadeStep(l: Layer, dt: number): void { if (l.t < 1) { l.t = Math.min(1, l.t + dt); l.mix.value = ss(0, 1, l.t); } }
function pushStage(l: Layer, tex: Texture): void {
  if (l.mix.value >= 0.5) l.lo.value = l.hi.value;   // mid-fade: keep whichever of the two dominates
  l.hi.value = tex; l.t = 0; l.mix.value = 0;
}

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
  /** Bake telemetry (ms): the preview's work, its slices and the full maps' (both bakers), the longest slice, and when
   *  each stage landed (performance.now). */
  readonly bake = { previewMs: 0, slices: 0, maxSliceMs: 0, over: 0, totalMs: 0, done: false, previewAt: -1, cloudsAt: -1, uploadedAt: -1 };
  private readonly earthGroup = new Group();
  private readonly earth: Mesh; private readonly clouds: Mesh; private readonly atmo: Mesh;
  private readonly sky: Mesh; private readonly stars: Points;
  private readonly anchor = new Group(); private readonly tilt = new Group(); private readonly spin = new Group();
  private readonly key: DirectionalLight;
  private readonly earthMat: ShaderMaterial; private readonly cloudMat: ShaderMaterial; private readonly atmoMat: ShaderMaterial;
  private readonly starMat: ShaderMaterial; private readonly skyMat: ShaderMaterial;
  private readonly washMat: ShaderMaterial; private readonly washScene = new Scene(); private readonly washCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly sun: Vector3; private readonly sunHome: Vector3; private readonly cityLocal: Vector3;
  /** The boot preview (¼ colour, ½ clouds) and the full maps, both baked in idle slices; until the preview lands
   *  the planet is a plain shaded ocean sphere (1-texel placeholders), so boot never waits on a bake. */
  private readonly pre: EarthBaker; private readonly full: EarthBaker;
  private colorHi: DataTexture | null = null; private cloudsHi: DataTexture | null = null; private puffHi: DataTexture | null = null;
  private previewUp = false;
  private readonly texs: DataTexture[] = [];
  private readonly colorL: Layer; private readonly cloudL: Layer;
  private nebT = 0;
  private readonly scrimU = { uScrim: { value: new Vector4(0, 0, 1, 1) }, uScrimK: { value: 0 } };
  private scrimK = 0; private readonly scrimBox = { x: 0, y: 0, rx: 0, ry: 0 }; private readonly buf = new Vector2();
  private time = 0;
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
  /** The board's spin angle this frame (a constant rate; the dive adds its tumble on top). */
  private spinAngle = 0; private boardA = 0.4; private readonly boardOff = new Vector3(); private baseFov: number = TITLE_SCENE.portrait.fov;
  private lastCalls = 0; private lastTris = 0; private readonly focusW = new Vector3();

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
    // The preview maps (¼ of the colour texels, ½ of the clouds'), then the full maps, all in idle slices (startBake).
    this.pre = new EarthBaker({ w: EARTH_TEX.w / 4, h: EARTH_TEX.h / 4, cloudW: EARTH_TEX.cloudW / 2, cloudH: EARTH_TEX.cloudH / 2, puff: EARTH_TEX.puff / 4, city });
    this.full = new EarthBaker({ city });
    const colorPh = this.tex(new Uint8Array([19, 86, 100, 0]), 1, 1, true), cloudPh = this.tex(new Uint8Array([0]), 1, 1, false);
    const puffPh = this.tex(new Uint8Array([128]), 1, 1, false);

    const geo = new SphereGeometry(1, 72, 48), geoLo = new SphereGeometry(1, 40, 24);
    const sh = (fs: string, u: Record<string, { value: unknown }>, o: Partial<ConstructorParameters<typeof ShaderMaterial>[0]> = {}) =>
      new ShaderMaterial({ vertexShader: EARTH_VS, fragmentShader: fs, uniforms: u, ...o });
    const tex = { uMap: { value: colorPh as Texture }, uMapLo: { value: colorPh as Texture }, uMix: { value: 1 },
      uClouds: { value: cloudPh as Texture }, uCloudsLo: { value: cloudPh as Texture }, uCMix: { value: 1 } };
    this.colorL = { lo: tex.uMapLo, hi: tex.uMap, mix: tex.uMix, t: 1 };
    this.cloudL = { lo: tex.uCloudsLo, hi: tex.uClouds, mix: tex.uCMix, t: 1 };
    const sc = this.scrimU;
    this.earthMat = sh(EARTH_FS, { ...tex, ...sc, uSun: { value: this.sun }, uCity: { value: this.cityLocal }, uTime: { value: 0 }, uCloudRot: { value: 0 }, uBeacon: { value: 1 }, uDive: { value: 0 } });
    this.cloudMat = sh(CLOUDS_FS, { uClouds: tex.uClouds, uCloudsLo: tex.uCloudsLo, uCMix: tex.uCMix, ...sc, uSun: { value: this.sun }, uFade: { value: 1 } },
      { transparent: true, depthWrite: false });
    this.atmoMat = sh(ATMO_FS, { ...sc, uSun: { value: this.sun }, uGain: { value: 1 } }, { side: BackSide, transparent: true, depthWrite: false, blending: AdditiveBlending });
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

    this.skyMat = new ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: BackSide, depthWrite: false,
      uniforms: { uNoise: { value: cloudPh as Texture }, uGlow: { value: norm3(C.glow) }, uNeb: { value: 0 } } });
    const skyMat = this.skyMat;
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
      uniforms: { uNoise: { value: puffPh as Texture }, uCover: { value: 0 }, uHole: { value: -1 }, uFlat: { value: 0 }, uZoom: { value: 0 },
        uAspect: { value: { x: 1, y: 1 } }, uTime: { value: 0 } } });
    const wash = new Mesh(tri, this.washMat); wash.frustumCulled = false;
    this.washScene.add(wash);
  }

  /** Starts the bake in idle slices (≤ EARTH_TEX.sliceMs each): the preview, then the full maps, each map uploaded
   *  (and cross-faded in) as soon as its pass is complete, the clouds first. `schedule` runs a callback later.
   *  `allowed()` false (a run or a screen without the space backdrop is up) holds the bake: it never competes with play. */
  startBake(allowed: () => boolean = () => true, schedule: (step: (budgetMs: number) => boolean) => void = idleSlices): void {
    schedule((budgetMs) => {
      if (!allowed()) return false;
      const ms = Math.min(EARTH_TEX.sliceMs, budgetMs);
      let done = false;
      if (!this.pre.done) { if (this.pre.step(ms, nowMs)) this.uploadPreview(); }
      else { done = this.full.step(ms, nowMs); this.uploadStages(); }
      const b = this.bake, p = this.pre, f = this.full;
      b.previewMs = p.totalMs; b.slices = p.slices + f.slices; b.maxSliceMs = Math.max(p.maxSliceMs, f.maxSliceMs); b.totalMs = p.totalMs + f.totalMs;
      b.over = p.over + f.over;
      return done;
    });
  }

  /** Bake progress 0…1 (the full maps). */
  get bakeProgress(): number { return this.full.progress; }

  /** Per frame on the Title (and under the menus opened from it): animation and layout. */
  update(dt: number, vp: Viewport): void {
    const d = Math.min(0.1, Math.max(0, dt));
    this.time += d;
    if (vp.wCss !== this.vpW || vp.hCss !== this.vpH || (!this.diving && this.bandMoved())) this.layout(vp);
    const C = TITLE_SCENE, B = C.board, t = this.time;
    fadeStep(this.colorL, d / C.fadeSec); fadeStep(this.cloudL, d / C.fadeSec);
    if (this.previewUp && this.nebT < 1) { this.nebT = Math.min(1, this.nebT + d / C.fadeSec); this.skyMat.uniforms.uNeb!.value = ss(0, 1, this.nebT); }
    // The vignette behind the logo block: on while the Title UI is up, gone as the dive starts (the UI leaves).
    const band = this.diving ? null : this.band(), on = !!band && band.scrimRx > 0;
    if (band && on) { const q = this.scrimBox; q.x = band.scrimX; q.y = band.scrimY; q.rx = band.scrimRx * C.scrim.padX; q.ry = band.scrimRy * C.scrim.padY; }
    this.scrimK += ((on ? C.scrim.k : 0) - this.scrimK) * Math.min(1, d * (this.diving ? 14 : 6));
    this.earthMat.uniforms.uTime!.value = t;
    const rot = (t * C.cloudDegPerSec * DEG) % (2 * Math.PI);
    this.clouds.rotation.y = rot;
    this.earthMat.uniforms.uCloudRot!.value = rot / (2 * Math.PI);
    this.starMat.uniforms.uTime!.value = t;
    this.spinAngle = 2 * Math.PI * ((t / B.spinSec + 0.5) % 1);   // constant angular speed; opens on the graphic (θ = π)
    if (!this.diving) {
      this.spin.rotation.y = this.spinAngle;
      this.tilt.rotation.set(B.leanDeg * DEG, 0, (B.tiltDeg + B.swayDeg * Math.sin((2 * Math.PI * t) / B.swaySec)) * DEG);
      this.anchor.position.copy(this.anchorHome);
      this.anchor.position.y += B.bob * this.boardScale * Math.sin((2 * Math.PI * t) / B.bobSec);
    }
  }

  /** Draws the space scene (the Title backdrop). */
  render(r: WebGLRenderer): void {
    this.starMat.uniforms.uPx!.value = r.getPixelRatio();
    // The vignette in drawing-buffer px (gl_FragCoord: origin bottom left).
    r.getDrawingBufferSize(this.buf);
    const sx = this.buf.x / Math.max(1, this.vpW), sy = this.buf.y / Math.max(1, this.vpH), q = this.scrimBox;
    this.scrimU.uScrim.value.set(q.x * sx, (this.vpH - q.y) * sy, Math.max(1, q.rx * sx), Math.max(1, q.ry * sy));
    this.scrimU.uScrimK.value = q.rx > 0 ? this.scrimK : 0;
    r.render(this.scene, this.camera);
    this.lastCalls = r.info.render.calls; this.lastTris = r.info.render.triangles + r.info.render.points;
  }

  /** `o`'s world position (a shared vector, valid until the next call): the dive's focus on the rider. */
  worldPos(o: { getWorldPosition(v: Vector3): Vector3 }): Vector3 { return o.getWorldPosition(this.focusW); }

  /** Draw calls and triangles (points included) of the last space render; bake telemetry. */
  stats() { return { drawCalls: this.lastCalls, tris: this.lastTris, bake: { ...this.bake, progress: this.full.progress } }; }

  // ── the dive ────────────────────────────────────────────────────────────────────────────────────────────────────
  /** TAP TO ROLL: remember where the camera and the board start. */
  beginDive(): void {
    this.diving = true;
    this.camera.updateMatrixWorld();
    this.q0.copy(this.camera.quaternion);
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
    this.spin.rotation.y = this.spinAngle + 7 * u * u;     // keeps its speed at the tap, then tumbles as it falls
    this.anchor.visible = u < 0.9;
    cam.fov = this.baseFov + 18 * ss(0.25, 0.85, u);
    cam.updateProjectionMatrix();
    // Close to the surface the cloud sphere and the outer glow would fill the frame flat: fade them out.
    this.cloudMat.uniforms.uFade!.value = 1 - ss(0.82, 0.97, u);
    this.atmoMat.uniforms.uGain!.value = 1 - ss(0.7, 0.95, u);
    this.earthMat.uniforms.uBeacon!.value = 1 - ss(0.15, 0.45, u);
    const warm = ss(0.1, 0.7, u);
    this.earthMat.uniforms.uDive!.value = warm;
    // The sun eases a little toward the city, keeping it inside the warm dusk band on its day side (n·l 0.06 → ~0.2):
    // the approach glows orange-gold into the peach wash, neither night blue nor a day-green that greys under it.
    this.sun.copy(this.sunHome).addScaledVector(this.n1, 0.16 * warm).normalize();
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
  rebuildGPU(): void { for (const t of this.texs) t.needsUpdate = true; }

  private tex(data: Uint8Array, w: number, h: number, rgba: boolean): DataTexture {
    const t = dataTex(data, w, h, rgba);
    this.texs.push(t);
    return t;
  }

  /** The preview landed: the planet fades in from the plain sphere, the nebula with it. */
  private uploadPreview(): void {
    const p = this.pre;
    pushStage(this.colorL, this.tex(p.color, p.w, p.h, true));
    const clouds = this.tex(p.clouds, p.cw, p.ch, false);
    pushStage(this.cloudL, clouds);
    this.skyMat.uniforms.uNoise!.value = clouds;
    this.washMat.uniforms.uNoise!.value = mirrored(this.tex(p.puff, p.pw, p.pw, false));
    this.previewUp = true; this.bake.previewAt = nowMs();
  }

  /** Each full map goes up as soon as its pass is complete (clouds, then the wash noise, then the colour). */
  private uploadStages(): void {
    const f = this.full, b = this.bake;
    if (f.cloudsDone && !this.cloudsHi) { this.cloudsHi = this.tex(f.clouds, f.cw, f.ch, false); pushStage(this.cloudL, this.cloudsHi); b.cloudsAt = nowMs(); }
    if (f.puffDone && !this.puffHi) { this.puffHi = mirrored(this.tex(f.puff, f.pw, f.pw, false)); this.washMat.uniforms.uNoise!.value = this.puffHi; }
    if (f.colorDone && !this.colorHi) { this.colorHi = this.tex(f.color, f.w, f.h, true); pushStage(this.colorL, this.colorHi); b.done = true; b.uploadedAt = nowMs(); }
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
  const room = EARTH_TEX.sliceMs + 2;                     // a slice starts only with its budget and 2 ms to spare
  const run = (d?: { timeRemaining(): number }) => {
    if (d && d.timeRemaining() < room && ++skipped < 60) { next(); return; }   // a short idle period: wait
    skipped = 0;
    let done = step(EARTH_TEX.sliceMs), n = 1;
    while (!done && d && n < 4 && d.timeRemaining() >= room) { done = step(EARTH_TEX.sliceMs); n++; }
    if (!done) next();
  };
  const next = () => { if (g.requestIdleCallback) g.requestIdleCallback(run); else setTimeout(run, 16); };
  next();
}
