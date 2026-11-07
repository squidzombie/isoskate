// gfx/silhouette.ts (WA, W2a; debug and gates only, never called in a frame): the world point under every pixel of a
// rendered frame. The scene is rendered once more into a render target with a depth texture (the same materials, so
// sway, the x-ray screen door and hidden camera-side decor match the visible frame exactly), the depth is packed into
// RGBA8, read back and unprojected with the camera. debug/contrast.ts uses it to measure a hazard's silhouette as
// the pixels that really show the hazard (DESIGN §18.4 "hazard silhouette"), not the convex hull of its box.
import {
  DepthTexture, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, UnsignedIntType, Vector3,
  WebGLRenderTarget, type Camera, type WebGLRenderer,
} from 'three';

/** World xyz per pixel, row 0 at the top (canvas order); NaN where nothing opaque was drawn (sky, clear colour). */
export interface WorldPoints { readonly w: number; readonly h: number; readonly xyz: Float32Array }

const PACK_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// 24-bit depth in r, g, b (base 255); a = 1 where something was drawn.
const PACK_FS = `uniform sampler2D tDepth; varying vec2 vUv;
void main() {
  float d = texture2D(tDepth, vUv).x;
  vec3 enc = fract(d * vec3(1.0, 255.0, 65025.0));
  enc -= enc.yzz * vec3(1.0 / 255.0, 1.0 / 255.0, 0.0);
  gl_FragColor = vec4(enc, d < 0.999999 ? 1.0 : 0.0);
}`;

/** Renders `scene` from `camera` at w × h device px and returns the world point of every pixel (null on failure). */
export function readWorldPoints(renderer: WebGLRenderer, scene: Scene, camera: Camera, w: number, h: number): WorldPoints | null {
  if (w < 1 || h < 1) return null;
  const depthRt = new WebGLRenderTarget(w, h, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: true });
  depthRt.depthTexture = new DepthTexture(w, h, UnsignedIntType);
  const packRt = new WebGLRenderTarget(w, h, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });
  const mat = new ShaderMaterial({ uniforms: { tDepth: { value: depthRt.depthTexture } }, vertexShader: PACK_VS, fragmentShader: PACK_FS,
    depthTest: false, depthWrite: false, toneMapped: false });
  const quad = new Mesh(new PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const packScene = new Scene();
  packScene.add(quad);
  const prev = renderer.getRenderTarget();
  const px = new Uint8Array(w * h * 4);
  // The frame's draw statistics (perf HUD, budgets) stay those of the visible frame.
  const info = renderer.info, ri = info.render, saved = { calls: ri.calls, triangles: ri.triangles, points: ri.points, lines: ri.lines };
  const autoReset = info.autoReset;
  info.autoReset = false;
  try {
    renderer.setRenderTarget(depthRt);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    renderer.setRenderTarget(packRt);
    renderer.render(packScene, new OrthographicCamera());
    renderer.readRenderTargetPixels(packRt, 0, 0, w, h, px);
  } catch {
    return null;
  } finally {
    info.autoReset = autoReset;
    ri.calls = saved.calls; ri.triangles = saved.triangles; ri.points = saved.points; ri.lines = saved.lines;
    renderer.setRenderTarget(prev);
    depthRt.depthTexture?.dispose(); depthRt.dispose(); packRt.dispose(); mat.dispose(); quad.geometry.dispose();
  }
  const xyz = new Float32Array(w * h * 3);
  const v = new Vector3();
  camera.updateMatrixWorld();
  for (let y = 0; y < h; y++) {
    const row = (h - 1 - y) * w;            // read-back rows run bottom-up
    for (let x = 0; x < w; x++) {
      const i = (row + x) * 4, o = (y * w + x) * 3;
      if (px[i + 3]! < 128) { xyz[o] = NaN; xyz[o + 1] = NaN; xyz[o + 2] = NaN; continue; }
      const d = px[i]! / 255 + px[i + 1]! / 65025 + px[i + 2]! / 16581375;
      v.set(((x + 0.5) / w) * 2 - 1, 1 - ((y + 0.5) / h) * 2, d * 2 - 1).applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
      xyz[o] = v.x; xyz[o + 1] = v.y; xyz[o + 2] = v.z;
    }
  }
  return { w, h, xyz };
}
