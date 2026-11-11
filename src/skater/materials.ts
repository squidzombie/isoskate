// skater/materials.ts: the skater's materials (DESIGN §18.2: MeshToonMaterial with a 3-step ramp 0.35 / 0.7 / 1.0;
// §18.4: an inverted-hull ink outline, 0.025 m). Shader additions, shared by every skater material:
//  - aEmit: per-vertex self-glow (albedo × weight × uEmitGain) and fx glow (uFxColor × weight), so emissive
//    finishes, reflective strips, light seams and glowing wheels need no extra texture or draw call;
//  - a warm rim light that lifts the skater off the mid-value street (value contrast at 31 px);
//  - holo: a view-angle hue shift (Holo Shift's finish), switched by the uHolo uniform so every board shares one
//    program (a loadout switch never compiles a shader);
//  - the outline pushes vertices along aOutline by uOutlineW (set per frame from the camera so the ink line never
//    drops under OUTLINE.minPx on screen), before skinning;
//  - uDesat: the world's crash desaturation (gfx sharedUniforms(ctx).uDesat, the same object, wired @G1), applied in
//    output colour space like world/render's grading, so the rider greys with the street during the crash slow-mo.
import {
  BackSide, Color, DataTexture, FrontSide, type IUniform, MeshBasicMaterial, MeshToonMaterial, NearestFilter, RedFormat,
  type Texture, type WebGLProgramParametersWithUniforms,
} from 'three';
import { OUTLINE, SHADE } from './skater.config';

let ramp: DataTexture | null = null;
/** The shared 3-step toon ramp. */
export function toonRamp(): DataTexture {
  if (ramp) return ramp;
  const data = new Uint8Array(SHADE.ramp.map((v) => Math.round(v * 255)));
  ramp = new DataTexture(data, SHADE.ramp.length, 1, RedFormat);
  ramp.minFilter = NearestFilter; ramp.magFilter = NearestFilter; ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

export interface SkaterUniforms {
  uEmitGain: IUniform<number>;
  uFxColor: IUniform<Color>;
  uRimColor: IUniform<Color>;
  uRimStrength: IUniform<number>;
  uTime: IUniform<number>;
  /** 1 = Holo Shift's view-angle hue shift, 0 = off. */
  uHolo: IUniform<number>;
  /** Crash desaturation 0..1: the view swaps in the context's shared uniform (gfx sharedUniforms) by reference. */
  uDesat: IUniform<number>;
}
export const newUniforms = (): SkaterUniforms => ({
  uEmitGain: { value: 1 }, uFxColor: { value: new Color(0x000000) }, uRimColor: { value: new Color(SHADE.rimColor) },
  uRimStrength: { value: SHADE.rimStrength }, uTime: { value: 0 }, uHolo: { value: 0 }, uDesat: { value: 0 },
});
const DESAT_GLSL = 'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114))), uDesat);';

export interface ToonOptions {
  map: Texture | null;
  transparent?: boolean;
  opacity?: number;
  color?: number;
}

/** A skater toon material (vertex colours × atlas, the shared ramp, glow, rim). Every option that changes the shader
 *  program (map or not, transparent or not) is fixed per material for the life of a view; looks only swap uniforms,
 *  textures and geometry. */
export function toonMaterial(u: SkaterUniforms, o: ToonOptions): MeshToonMaterial {
  const m = new MeshToonMaterial({
    color: o.color ?? SHADE.albedo, map: o.map, gradientMap: toonRamp(), vertexColors: true,
    transparent: !!o.transparent, opacity: o.opacity ?? 1, depthWrite: !o.transparent, side: FrontSide,
  });
  m.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aEmit;\nvarying vec2 vEmit;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvEmit = aEmit;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vEmit;
uniform float uEmitGain; uniform vec3 uFxColor; uniform vec3 uRimColor; uniform float uRimStrength; uniform float uTime;
uniform float uHolo; uniform float uDesat;
vec3 skHue(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (uHolo > 0.5) diffuseColor.rgb = clamp(skHue(diffuseColor.rgb, dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)) * 5.0 + uTime * 0.6), 0.0, 1.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vEmit.x * uEmitGain + uFxColor * vEmit.y;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  float fres = pow(1.0 - clamp(dot(normalize(geometryNormal), geometryViewDir), 0.0, 1.0), ${SHADE.rimPower.toFixed(2)});
  reflectedLight.directDiffuse += uRimColor * fres * uRimStrength * (0.35 + 0.65 * diffuseColor.rgb);
}`)
      .replace('#include <colorspace_fragment>', `#include <colorspace_fragment>\n${DESAT_GLSL}`);
  };
  m.customProgramCacheKey = () => 'sk-toon';
  return m;
}

/** Glass (Fishbowl): transparent, with a bright fresnel edge so it reads as a bubble. */
export function glassMaterial(u: SkaterUniforms, color: number, opacity: number): MeshToonMaterial {
  const m = toonMaterial(u, { map: null, transparent: true, opacity, color });
  m.vertexColors = true;
  return m;
}

export interface OutlineUniforms { uOutlineW: IUniform<number>; uDesat: IUniform<number> }
/** The ink outline: back faces of the same buffers, pushed out along aOutline. `desat`: the shared crash uniform. */
export function outlineMaterial(desat: IUniform<number> = { value: 0 }): MeshBasicMaterial & { userData: { uniforms: OutlineUniforms } } {
  const uniforms: OutlineUniforms = { uOutlineW: { value: OUTLINE.width }, uDesat: desat };
  const m = new MeshBasicMaterial({ color: OUTLINE.color, side: BackSide }) as MeshBasicMaterial & { userData: { uniforms: OutlineUniforms } };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aOutline;\nuniform float uOutlineW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += aOutline * uOutlineW;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDesat;')
      .replace('#include <colorspace_fragment>', `#include <colorspace_fragment>\n${DESAT_GLSL}`);
  };
  m.customProgramCacheKey = () => 'sk-outline';
  return m;
}
