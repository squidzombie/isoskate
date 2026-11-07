// world/render/materials.ts: the world materials (TECH §8.6 5-mesh layout, DESIGN §18.2). Built once per WorldView.
//   opaque    MeshLambertMaterial, vertex colours, flat normals, NO discard (tile GPUs keep early depth rejection).
//             fx = (ground pattern cell + 1 | 0, sway weight, flag bits, emissive add); auv = paint atlas uv (x < 0: none)
//   xray      the same plus the 4×4 Bayer screen door (50%): the above-1.6 m parts of in-corridor tall solids
//   emissive  unlit vertex colour × intensity (neon, signs, windows, lamps); fx = (intensity, window rand | −1,
//             flag bits, animation 0 none | 1 holo drift + scanlines + rare flicker | 2 blink 1 Hz | 3 blink, other phase)
//   glow      additive camera-facing cards (depthWrite off); fx = (corner x, corner y ∈ −1..1, intensity, 0)
//   building  = opaque (its own mesh per chunk so buildings and shadow casters cull and cast as one)
// Flag bits (writer.ts FX): 1 noFog (hazards, grind edges skip the haze), 2 shadow-only (collapsed in the main pass,
// still drawn by the default depth material in the shadow pass), 4 camera-side decor (hidden when uHideNear),
// 8 matte (hazard bodies: direct sun scaled by MATTE so a sun-lit ink front stays dark), 16 warn (chevrons flash with
// the full-width hazard warning, uWarn), 32 grind (G1, DESIGN §18.4 grind signature: the polished cream-chrome coping
// of every grindable edge: a fixed self-lit sheen, the same under every palette, and a slow glint travelling along
// the street; nothing else may use it).
// Every material reads the shared uniforms (gfx sharedUniforms): uDesat, the haze, uTime, uEmis, uWindowLit, uGlow.
import {
  AdditiveBlending, DoubleSide, MeshBasicMaterial, MeshLambertMaterial, type IUniform, type Material, type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { GfxContext } from '../../core/view';
import { GRADING_PARS, sharedUniforms, type SharedUniforms } from '../../gfx';
import { RENDER } from './render.config';

export interface WorldTextures { ground: Texture; signs: Texture }
export interface WorldMaterials {
  opaque: MeshLambertMaterial; xray: MeshLambertMaterial; emissive: MeshBasicMaterial; glow: MeshBasicMaterial;
  all: readonly Material[];
  dispose(): void;
}

const VERT_PARS = /* glsl */`
attribute vec2 auv;
attribute vec4 fx;
uniform float uTime;
uniform float uHideNear;
varying vec4 vFx;
varying vec2 vAuv;
varying vec3 vLocal;
varying vec3 vObjN;
`;
const VERT_SWAY = /* glsl */`
vFx = fx; vAuv = auv; vLocal = position; vObjN = normal;
if (fx.y > 0.0) {
  float ph = position.x * 0.9 + position.z * 0.37;
  float k = fx.y * max(0.0, position.y - 0.5) * 0.05;
  transformed.x += k * sin(uTime * 3.14159 + ph);
  transformed.z += k * 0.6 * cos(uTime * 2.6 + ph);
}
`;
const VERT_HIDE = /* glsl */`
{ int fl = int(fx.z + 0.5);
  if ((fl & 2) != 0 || ((fl & 4) != 0 && uHideNear > 0.5)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }
`;
/** Glow cards keep (corner u, corner v, intensity) in fx.xyz, so their flag bits live in fx.w. */
const VERT_HIDE_GLOW = VERT_HIDE.replace('fx.z', 'fx.w');
const FRAG_PARS = /* glsl */`
varying vec4 vFx;
varying vec2 vAuv;
varying vec3 vLocal;
varying vec3 vObjN;
${GRADING_PARS}
`;
const GRADE = /* glsl */`
{ int fl = int(vFx.z + 0.5); gl_FragColor.rgb = dlGrade(gl_FragColor.rgb, (fl & 1) != 0 ? 1.0 : 0.0, length(vViewPosition)); }
`;
const BAYER = /* glsl */`
{ ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
  int idx = q.x + q.y * 4;
  float b = float(int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5)[idx]) / 16.0;
  if (b < 0.5) discard; }
`;

function bindShared(shader: WebGLProgramParametersWithUniforms, u: SharedUniforms, extra: Record<string, IUniform> = {}): void {
  Object.assign(shader.uniforms, {
    uDesat: u.uDesat, uTime: u.uTime, uHaze: u.uHaze, uHazeAmt: u.uHazeAmt, uHazeY0: u.uHazeY0, uHazeMode: u.uHazeMode,
    uHazeNear: u.uHazeNear, uHazeFar: u.uHazeFar, uRes: u.uRes, uEmis: u.uEmis, uWindowLit: u.uWindowLit, uGlow: u.uGlow,
    uHideNear: u.uHideNear, uWarn: u.uWarn, uSkyZenith: u.uSkyZenith, uSkyMid: u.uSkyMid, uSkyHorizon: u.uSkyHorizon,
  }, extra);
}

function patchLit(m: MeshLambertMaterial, u: SharedUniforms, tex: WorldTextures, xray: boolean): void {
  const ground = { value: tex.ground }, signs = { value: tex.signs }, matte = { value: RENDER.matte };
  m.onBeforeCompile = (sh) => {
    bindShared(sh, u, { uGround: ground, uSigns: signs, uMatte: matte });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_SWAY}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_HIDE}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uGround;\nuniform sampler2D uSigns;\nuniform float uMatte;\nuniform float uEmis;\nuniform float uWarn;\nuniform float uTime;\n${FRAG_PARS}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `vec4 diffuseColor = vec4( diffuse, opacity );\n${xray ? BAYER : ''}`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
if (vFx.x > 0.5) {
  float cell = floor(vFx.x + 0.5) - 1.0;
  vec2 cxy = vec2(mod(cell, 4.0), floor(cell / 4.0));
  vec3 an = abs(vObjN);
  vec2 pp = an.y > 0.5 ? vec2(vLocal.x, -vLocal.z) : (an.x > an.z ? vec2(-vLocal.z, vLocal.y) : vec2(vLocal.x, vLocal.y));
  vec2 t = fract(pp * 0.25);
  diffuseColor.rgb *= texture2D(uGround, (cxy + 0.012 + t * 0.976) * 0.25).rgb * 2.0;
}
if (vAuv.x >= 0.0) { vec4 p = texture2D(uSigns, vAuv); diffuseColor.rgb = mix(diffuseColor.rgb, p.rgb, p.a); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vFx.w * uEmis;
{ int fl = int(vFx.z + 0.5); if ((fl & 16) != 0) totalEmissiveRadiance += diffuseColor.rgb * uWarn * 1.4;
  if ((fl & 32) != 0) {
    float gl = pow(0.5 + 0.5 * sin(vLocal.z * ${(2 * Math.PI / RENDER.grind.glintPeriod).toFixed(5)} + uTime * ${RENDER.grind.glintSpeed.toFixed(3)}), ${RENDER.grind.glintSharp.toFixed(1)});
    float top = step(0.5, vObjN.y);
    totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * (${RENDER.grind.sheen.toFixed(3)} + ${RENDER.grind.topSheen.toFixed(3)} * top + ${RENDER.grind.glint.toFixed(3)} * gl);
  } }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n{ int fl = int(vFx.z + 0.5); if ((fl & 8) != 0) reflectedLight.directDiffuse *= uMatte; }`)
      .replace('#include <colorspace_fragment>', `#include <colorspace_fragment>\n${GRADE}`);
  };
  m.customProgramCacheKey = () => (xray ? 'dl-world-xray' : 'dl-world-opaque');
}

function patchEmissive(m: MeshBasicMaterial, u: SharedUniforms, tex: WorldTextures): void {
  const signs = { value: tex.signs };
  m.onBeforeCompile = (sh) => {
    bindShared(sh, u, { uSigns: signs });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}\nvarying vec3 vViewPosition;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_SWAY}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nvViewPosition = - mvPosition.xyz;\n${VERT_HIDE}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
uniform sampler2D uSigns;
uniform float uTime;
uniform float uEmis;
uniform float uWindowLit;
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
varying vec3 vViewPosition;
${FRAG_PARS}
vec3 dlHue(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
vec3 base = diffuseColor.rgb;
if (vAuv.x >= 0.0) { vec4 p = texture2D(uSigns, vAuv); base = mix(base * 0.25, base * p.rgb, p.a); }
float inten = vFx.x * uEmis;
int anim = int(vFx.w + 0.5);
if (anim == 1) {
  base = max(dlHue(base, sin(uTime * 1.2566 + vLocal.x * 0.2) * 0.6), vec3(0.0));
  float scan = 0.78 + 0.22 * step(0.5, fract(gl_FragCoord.y * 0.25));
  float fl = step(0.985, fract(sin(floor(uTime * 20.0) * 12.9898 + vLocal.z) * 43758.5453));
  inten *= scan * (1.0 - 0.75 * fl);
} else if (anim == 2 || anim == 3) {
  float ph = anim == 2 ? 0.0 : 0.5;
  inten *= 0.15 + 0.85 * step(0.5, fract(uTime + ph));
}
if (vFx.y >= 0.0) {
  float lit = step(vFx.y, uWindowLit);
  vec3 glass = mix(uSkyMid, uSkyZenith, 0.55 + 0.4 * fract(vFx.y * 7.0)) * 0.42;
  diffuseColor.rgb = mix(glass, base * inten, lit);
} else {
  diffuseColor.rgb = base * inten;
}`)
      .replace('#include <colorspace_fragment>', `#include <colorspace_fragment>\n${GRADE}`);
  };
  m.customProgramCacheKey = () => 'dl-world-emissive';
}

function patchGlow(m: MeshBasicMaterial, u: SharedUniforms): void {
  m.onBeforeCompile = (sh) => {
    bindShared(sh, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFx = fx; vAuv = auv; vLocal = position; vObjN = normal;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_HIDE_GLOW}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uGlow;\nuniform float uDesat;\nvarying vec4 vFx;\nvarying vec2 vAuv;\nvarying vec3 vLocal;\nvarying vec3 vObjN;`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
float r2 = dot(vFx.xy, vFx.xy);
float a = max(0.0, 1.0 - r2);
a = a * a * vFx.z * uGlow;
float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
diffuseColor = vec4(mix(diffuseColor.rgb, vec3(l), uDesat), a);`);
  };
  m.customProgramCacheKey = () => 'dl-world-glow';
}

export function createWorldMaterials(ctx: GfxContext, tex: WorldTextures): WorldMaterials {
  const u = sharedUniforms(ctx);
  const opaque = new MeshLambertMaterial({ vertexColors: true });
  const xray = new MeshLambertMaterial({ vertexColors: true });
  const emissive = new MeshBasicMaterial({ vertexColors: true });
  const glow = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending,
    side: DoubleSide });
  patchLit(opaque, u, tex, false);
  patchLit(xray, u, tex, true);
  patchEmissive(emissive, u, tex);
  patchGlow(glow, u);
  opaque.name = 'world-opaque'; xray.name = 'world-xray'; emissive.name = 'world-emissive'; glow.name = 'world-glow';
  const all = [opaque, xray, emissive, glow];
  return { opaque, xray, emissive, glow, all, dispose() { for (const m of all) m.dispose(); } };
}
