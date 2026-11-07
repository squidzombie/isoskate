// world/render/title/shaders.ts: GLSL for the Title's space scene and the dive wash. Every colour is written in
// display space (no tone mapping, no colour-space conversion): a stylised, sunset-palette planet, not a physical one.
export const EARTH_VS = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
  vUv = uv; vL = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const EARTH_FS = /* glsl */ `
uniform sampler2D uMap; uniform sampler2D uMapLo; uniform sampler2D uClouds; uniform sampler2D uCloudsLo;
uniform float uMix; uniform vec3 uSun; uniform vec3 uCity; uniform float uTime; uniform float uCloudRot; uniform float uBeacon;
uniform float uDive;
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
  float dc = 1.0 - dot(normalize(vL), uCity);
  vec4 tx = mix(texture2D(uMapLo, vUv), texture2D(uMap, vUv), uMix);
  float land = smoothstep(0.3, 0.48, tx.a);
  float lights = clamp((tx.a - 0.515) * 2.06, 0.0, 1.0);
  float ndl = dot(N, uSun);
  float day = smoothstep(-0.12, 0.3, ndl);
  float band = exp(-pow((ndl - 0.06) / 0.24, 2.0));
  vec3 alb = tx.rgb;
  vec2 cuv = vec2(vUv.x - uCloudRot, vUv.y);
  float cs = mix(texture2D(uCloudsLo, cuv).r, texture2D(uClouds, cuv).r, uMix);
  alb *= 1.0 - 0.3 * cs * day;
  float lam = clamp(ndl * 0.95 + 0.1, 0.0, 1.0);
  vec3 dayC = alb * (0.46 + 0.86 * lam) * vec3(1.08, 0.98, 0.86);
  vec3 duskC = alb * vec3(1.25, 0.72, 0.5) + vec3(0.42, 0.15, 0.06);
  dayC = mix(dayC, duskC, band * 0.88);
  vec3 nightC = alb * vec3(0.16, 0.18, 0.3) + vec3(0.03, 0.03, 0.075);
  vec3 col = mix(nightC, dayC, day);
  vec3 H = normalize(uSun + V);
  col += vec3(1.0, 0.8, 0.58) * pow(max(dot(N, H), 0.0), 40.0) * (1.0 - land) * smoothstep(-0.02, 0.25, ndl) * 0.55;
  float night = 1.0 - smoothstep(-0.22, 0.04, ndl);
  col += vec3(1.0, 0.68, 0.34) * lights * (0.2 + 1.15 * night);
  col += vec3(1.0, 0.8, 0.5) * exp(-dc / 0.00022) * (0.8 + 0.4 * sin(uTime * 2.4)) * uBeacon;
  // The dive: golden late light pools around the start city as the camera falls toward it.
  float lum = dot(alb, vec3(0.3, 0.55, 0.15));
  vec3 gold = mix(vec3(0.98, 0.6, 0.4), vec3(1.0, 0.85, 0.62), smoothstep(0.2, 0.6, lum)) * (0.62 + 0.55 * lum);
  col = mix(col, gold + col * 0.25, uDive * 0.9 * exp(-dc / 0.05));
  float fr = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
  vec3 rim = mix(vec3(0.32, 0.27, 0.58), vec3(1.0, 0.8, 0.62), smoothstep(-0.3, 0.45, ndl));
  rim = mix(rim, vec3(1.0, 0.54, 0.45), band * 0.75);
  col = mix(col, rim, fr * mix(0.4, 0.82, smoothstep(-0.4, 0.3, ndl)));
  gl_FragColor = vec4(col, 1.0);
}`;

export const CLOUDS_FS = /* glsl */ `
uniform sampler2D uClouds; uniform sampler2D uCloudsLo; uniform float uMix; uniform vec3 uSun; uniform float uFade;
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
  float c = mix(texture2D(uCloudsLo, vUv).r, texture2D(uClouds, vUv).r, uMix);
  vec3 N = normalize(vN);
  float ndl = dot(N, uSun);
  float day = smoothstep(-0.12, 0.28, ndl);
  float band = exp(-pow((ndl - 0.04) / 0.22, 2.0));
  vec3 col = mix(vec3(0.24, 0.22, 0.36), vec3(1.0, 0.97, 0.93), day);
  col = mix(col, vec3(1.0, 0.68, 0.5), band * 0.92);
  gl_FragColor = vec4(col, c * mix(0.26, 0.9, day) * uFade);
}`;

export const ATMO_FS = /* glsl */ `
uniform vec3 uSun; uniform float uGain;
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float f = clamp(dot(-normalize(vN), V), 0.0, 1.0);
  float g = smoothstep(0.0, 0.4, f); g *= g;
  float s = dot(normalize(vW), uSun);
  vec3 col = mix(vec3(0.3, 0.26, 0.55) * 0.6, vec3(1.0, 0.8, 0.58), smoothstep(-0.25, 0.45, s));
  col = mix(col, vec3(1.0, 0.5, 0.42), exp(-pow(s / 0.24, 2.0)) * 0.8);
  gl_FragColor = vec4(col * g * mix(0.3, 1.0, smoothstep(-0.45, 0.3, s)) * uGain, 1.0);
}`;

export const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vDir = w.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/** Deep indigo space, a faint sunset-palette nebula and the sun's glow just off frame. */
export const SKY_FS = /* glsl */ `
uniform sampler2D uNoise; uniform vec3 uGlow;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float gd = dot(d, uGlow);
  vec3 col = mix(vec3(0.07, 0.055, 0.13), vec3(0.12, 0.07, 0.17), smoothstep(0.7, -0.7, d.y));
  vec2 uv = vec2(atan(d.z, d.x) * 0.15915 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.3183 + 0.5);
  float n = texture2D(uNoise, uv * vec2(1.0, 1.4) + vec2(0.13, 0.0)).r * 0.6 + texture2D(uNoise, uv * 2.3 + vec2(0.41, 0.27)).r * 0.4;
  float neb = smoothstep(0.22, 0.85, n);
  vec3 nebC = mix(vec3(0.42, 0.21, 0.47), vec3(0.96, 0.5, 0.42), smoothstep(-0.3, 0.9, gd));
  col += nebC * neb * (0.1 + 0.12 * smoothstep(-0.2, 0.8, gd));
  float g = max(gd, 0.0);
  col += vec3(1.0, 0.64, 0.4) * pow(g, 10.0) * 0.6 + vec3(0.95, 0.46, 0.42) * pow(g, 3.0) * 0.14;
  gl_FragColor = vec4(col, 1.0);
}`;

export const STARS_VS = /* glsl */ `
attribute float aSize; attribute float aPhase; attribute vec3 aTint;
uniform float uTime; uniform float uPx;
varying vec3 vTint; varying float vTw;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vTw = 0.72 + 0.28 * sin(uTime * (0.5 + aPhase * 1.6) + aPhase * 40.0);
  vTint = aTint;
  gl_PointSize = aSize * uPx;
}`;

export const STARS_FS = /* glsl */ `
varying vec3 vTint; varying float vTw;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, r);
  gl_FragColor = vec4(vTint, (a * a * 0.5 + smoothstep(0.4, 0.0, r)) * vTw);
}`;

export const WASH_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** The dive's warm peach cloud wash: rushes in (uZoom) as the camera reaches the cloud layer, covers the cut from
 *  space to the street, then opens from the centre (uHole). uFlat = 1: a plain fade (reduced motion). */
export const WASH_FS = /* glsl */ `
uniform sampler2D uNoise; uniform float uCover; uniform float uHole; uniform float uFlat; uniform float uZoom;
uniform vec2 uAspect; uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uAspect;
  float r = length(p);
  // Two layers of the cloud map rushing outward at different rates (parallax), plus a fine third for puffs.
  vec2 q1 = p / (1.0 + uZoom), q2 = p / (1.0 + 0.55 * uZoom);
  float n = texture2D(uNoise, vec2(0.5) + q1 * 0.55).r * 0.5
          + texture2D(uNoise, vec2(0.5) + q2 * 1.05 + vec2(uTime * 0.015, 0.0)).r * 0.32
          + texture2D(uNoise, vec2(0.5) + q2 * 2.2 + vec2(0.21, 0.13)).r * 0.18;
  float m = smoothstep(0.3, 0.7, n);
  vec3 col = mix(vec3(0.97, 0.68, 0.57), vec3(1.0, 0.84, 0.71), m);
  col = mix(col, vec3(1.0, 0.96, 0.9), smoothstep(0.62, 0.82, n));
  col *= 0.96 + 0.08 * (1.0 - r);
  float cov = smoothstep(1.0 - 1.2 * uCover, 1.25 - 1.2 * uCover, 0.55 * n + 0.45 * (1.0 - r * 0.6));
  cov = max(cov, smoothstep(0.85, 1.0, uCover));
  float hole = smoothstep(uHole - 0.05, uHole + 0.35, r + (n - 0.5) * 0.55);
  float a = mix(cov * hole, uCover, uFlat);
  gl_FragColor = vec4(mix(col, vec3(1.0, 0.82, 0.7), uFlat), a);
}`;
