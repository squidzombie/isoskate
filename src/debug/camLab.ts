// debug/camLab.ts: `window.__camLab`, measurement hooks for the run camera (production, or a debug spec picked with
// ?debug=1&cam=<id>, world/render/camVariants.ts). Only installed with the debug API; nothing in the game reads it.
//   variant()   the active variant
//   framing()   the framing the rig used for the last frame (eased), plus its far-readable metres per CSS px
//   measure()   on-screen sizes at the current frame, from the live camera (real projected sizes at each depth):
//               skater box and a 1.5 m standing height at the skater, a 1.0 m tall hazard 1.0 s and 2.5 s ahead,
//               grind-edge and coin widths at the skater, 2.5 s ahead and on the HUD line, the ground seen on the
//               HUD line and at the top of the screen, draw calls and triangles of the last render
//   frameMs(n)  mean wall time of n renderNow() calls (SwiftShader in CI: relative numbers only)
import { Box3, Vector3 } from 'three';
import { CAMERA } from '../core/tuning';
import { originOf, readWorldPoints } from '../gfx';
import { OCCLUSION_DEBUG, RIG_UNIFORMS, camVariant, coinFloorOf, edgeHalfAt, farMetresPerPx, groundAt, type CamVariant, type Framing } from '../world/render';
import type { DebugHost } from './api';

const COIN_D = 0.32;      // world/render/layers.ts COIN.diameter

export interface CamLab {
  variant(): CamVariant;
  framing(): (Framing & { farMPerPx: number }) | null;
  measure(): Record<string, number | string | null>;
  frameMs(n?: number): number;
  /** The camera-side cut and the overhead-span fade on / off (before/after shots; `all` cuts every camera-side
   *  fragment, an audit aid); returns the current switches. */
  occlusion(o?: Partial<typeof OCCLUSION_DEBUG>): typeof OCCLUSION_DEBUG;
  /** Camera-side audit of the live chunk meshes: per material, vertices on the camera side (x > 4.5) above 1 m that do
   *  not carry the `near` flag (they would escape the camera-side cut), with a sample position and colour. */
  nearAudit(at?: { x: number; y: number; s: number }): Record<string, { unflagged: number; sample: number[] | null; at?: number[][] }>;
  /** Decor cover of the look-ahead zone (the owner's "covered the skate area"): of a grid of CSS pixels (every
   *  `step` px) whose camera ray meets the ground inside the corridor (|x| ≤ 4.5) from the skater to 2.5 s ahead, the
   *  share whose visible surface is decor (outside the corridor, |x| > 4.6, or overhead, y > 3.0 m), not the street
   *  or an obstacle. Screen-door (dithered) pixels count as covered only where they are drawn. */
  coverAudit(step?: number): { zonePx: number; covered: number; share: number };
  /** The rig's camera-derived shader uniforms and the run camera's world position (after a render). */
  uniforms(): Record<string, number[]>;
  /** World points (track x, y, s) under CSS pixels of the current frame (null where nothing opaque was drawn). */
  worldAt(px: [number, number][]): ({ x: number; y: number; s: number } | null)[];

}

export function installCamLab(host: DebugHost): CamLab {
  const rig = host.cameraRig as unknown as { last?: Framing; camera: { updateMatrixWorld(): void } };
  const vpOf = () => {
    const probe = document.getElementById('safe-probe');
    const safeTop = probe ? parseFloat(getComputedStyle(probe).paddingTop) || 0 : 0;
    const w = window.innerWidth, h = window.innerHeight;
    return { wCss: w, hCss: h, dpr: 1, aspect: w / h, safeTop, safeBottom: 0, coarse: false };
  };
  const lab: CamLab = {
    variant: () => camVariant(),
    framing() {
      const f = rig.last;
      return f ? { ...f, farMPerPx: farMetresPerPx(f, vpOf()) } : null;
    },
    measure(): Record<string, number | string | null> {
      host.loop.renderNow();
      const f = rig.last;
      if (!f) return { variant: camVariant().id };
      const vp = vpOf(), sim = host.sim(), c = sim.cur, s = c.p.s, x = c.p.x, gy = c.groundY, v = c.vel.s;
      const P = (q: { s: number; x: number; y: number }) => host.cameraRig.project(q);
      const vert = (sa: number, xa: number, h: number) => Math.abs(P({ s: sa, x: xa, y: gy + h }).y - P({ s: sa, x: xa, y: gy }).y);
      const across = (sa: number, w: number) => Math.abs(P({ s: sa, x: w / 2, y: gy }).x - P({ s: sa, x: -w / 2, y: gy }).x);
      // Grind edge stripe width across the stripe on screen (perpendicular to the edge's screen direction), the
      // narrowest of the corridor centre and both sides (|x| = 4.3 m).
      const edgeAcross = (sa: number, w: number) => {
        let m = Infinity;
        for (const x0 of [-4.3, 0, 4.3]) {
          const a = P({ s: sa, x: x0 - w / 2, y: gy }), b = P({ s: sa, x: x0 + w / 2, y: gy }), t = P({ s: sa + 1, x: x0 - w / 2, y: gy });
          const tl = Math.hypot(t.x - a.x, t.y - a.y) || 1;
          m = Math.min(m, Math.abs((b.x - a.x) * (t.y - a.y) - (b.y - a.y) * (t.x - a.x)) / tl);
        }
        return m;
      };
      // Skater: the projected world box (as ext.capture does).
      let skaterPx: number | null = null;
      const box = new Box3().setFromObject(host.skater.object3d);
      if (!box.isEmpty()) {
        const cam = host.cameraRig.camera, p = new Vector3();
        let y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i < 8; i++) {
          p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
          const py = ((1 - p.y) / 2) * vp.hCss;
          y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
        skaterPx = y1 - y0;
      }
      const info = (host.worldView as { debugInfo?(): { edgeHalfW: number; coinScale?: number; mainCalls: number; shadowCalls: number; chunks: number[]; shadowBox?: unknown } }).debugInfo?.();
      const coinW = COIN_D * (info?.coinScale ?? 1);
      // Grind-edge stripe width at a ground point: the built width (ortho) or the per-depth widening (perspective).
      const DEG0 = Math.PI / 180;
      const edgeWAt = (sa: number) => (f.proj === 'persp'
        ? 2 * edgeHalfAt(f, vp, f.D + (sa - s) * Math.cos(f.pitchDeg * DEG0) * Math.cos(f.yawDeg * DEG0)).cream : 2 * (info?.edgeHalfW ?? 0.02));
      const edgeW = edgeWAt(s);
      // The ground seen on the HUD line and at the top of the screen (screen centre).
      const span = f.proj === 'ortho' ? f.H : f.tanH;
      const hud = groundAt(f, f.xCentre, (f.anchorY - f.hudTop) * span), top = groundAt(f, f.xCentre, f.anchorY * span);
      const sHud = s + hud.s;
      // Coins: ortho scales every coin by coinScale; perspective floors each coin at its own depth (layers.ts
      // COIN_DEPTH_K), i.e. max(natural size, CAMERA.minCoinPx).
      const DEG = Math.PI / 180, cosT = Math.cos(f.pitchDeg * DEG), cosP = Math.cos(f.yawDeg * DEG);
      const coinK = coinFloorOf(f, vp);                                             // view.ts updateCoinScale
      const coinPx = (sa: number) => (f.proj === 'persp'
        ? across(sa, COIN_D * Math.max(1, coinK * (f.D + (sa - s) * cosT * cosP))) : across(sa, coinW));
      const r = host.gfx.renderer.info.render;
      return {
        variant: camVariant().id, proj: f.proj, pitchDeg: f.pitchDeg, yawDeg: f.yawDeg, speed: v, H: f.H, D: f.D,
        fovDeg: f.tanH ? (2 * Math.atan(f.tanH / 2) * 180) / Math.PI : 0, lookAheadSec: f.lookAheadSec,
        skaterPx, stand15Px: vert(s, x, 1.5),
        haz1m_1s: vert(s + 1.0 * v, 0, 1), haz1m_25s: vert(s + 2.5 * v, 0, 1), haz1m_hud: vert(sHud, 0, 1),
        edgeW, edgePx_near: edgeAcross(s, edgeW), edgePx_25s: edgeAcross(s + 2.5 * v, edgeWAt(s + 2.5 * v)), edgePx_hud: edgeAcross(sHud, edgeWAt(sHud)),
        coinPx_near: coinPx(s), coinPx_25s: coinPx(s + 2.5 * v), coinPx_hud: coinPx(sHud),
        corridorPx_near: across(s, 2 * 4.5), corridorPx_25s: across(s + 2.5 * v, 2 * 4.5),
        hudAheadM: hud.s, topAheadM: top.s, minEdgeRule: CAMERA.minEdgePx, minCoinRule: CAMERA.minCoinPx,
        mainCalls: info?.mainCalls ?? null, shadowCalls: info?.shadowCalls ?? null, calls: r.calls, tris: r.triangles,
        chunks: info ? info.chunks.join(',') : null, shadowBox: info?.shadowBox ? JSON.stringify(info.shadowBox) : null,
      };
    },
    occlusion(o) { Object.assign(OCCLUSION_DEBUG, o ?? {}); return { ...OCCLUSION_DEBUG }; },
    coverAudit(step = 4) {
      host.loop.renderNow();
      const r = host.gfx.renderer, el = r.domElement, W = el.width, H = el.height, k = W / Math.max(1, window.innerWidth);
      const cam = host.cameraRig.camera, wp = readWorldPoints(r, host.gfx.scene, cam, W, H);
      const sim = host.sim().cur, s0 = sim.p.s, s1 = s0 + 2.5 * Math.max(1, sim.vel.s), o = originOf(s0);
      const c = (cam as unknown as { position: Vector3 }).position, ortho = (cam as unknown as { isOrthographicCamera?: boolean }).isOrthographicCamera;
      const fwd = new Vector3(0, 0, -1).transformDirection(cam.matrixWorld), pt = new Vector3(), d = new Vector3(), g = new Vector3();
      let zone = 0, cov = 0;
      if (!wp) return { zonePx: 0, covered: 0, share: NaN };
      // Obstacles' own tall parts (planter crowns, pillars: x-rayed) are gameplay geometry, not decor cover.
      const boxes = host.sim().world.obstacles(s0 - 4, s1 + 40).flatMap((ob) => ob.solids.map((so) => so.box));
      for (let y = Math.ceil(56 + 2); y < window.innerHeight; y += step) for (let x = 0; x < window.innerWidth; x += step) {
        pt.set((x / window.innerWidth) * 2 - 1, 1 - (y / window.innerHeight) * 2, -1).unproject(cam);
        if (ortho) d.copy(fwd); else d.copy(pt).sub(c);
        if (d.y > -1e-6) continue;
        g.copy(pt).addScaledVector(d, (sim.groundY - pt.y) / d.y);
        const gs = o - g.z;
        if (Math.abs(g.x) > 4.5 || gs < s0 || gs > s1) continue;
        zone++;
        const i = (Math.round(y * k) * W + Math.round(x * k)) * 3, wx = wp.xyz[i]!;
        if (Number.isNaN(wx)) continue;
        const wy = wp.xyz[i + 1]!, ws = o - wp.xyz[i + 2]!;
        if (Math.abs(wx) > 4.6 || (wy > 3.0 && !boxes.some((b) => wx >= b.x0 - 0.6 && wx <= b.x1 + 0.6 && ws >= b.s0 - 0.6 && ws <= b.s1 + 0.6 && wy <= b.y1 + 2.5))) cov++;
      }
      return { zonePx: zone, covered: cov, share: zone ? cov / zone : NaN };
    },
    uniforms() {
      host.loop.renderNow();
      const c = (host.cameraRig.camera as unknown as { position: Vector3 }).position;
      return { ...Object.fromEntries(Object.entries(RIG_UNIFORMS).map(([k, u]) => [k, u.value.toArray()])), camera: [c.x, c.y, originOf(host.sim().cur.p.s) - c.z] };
    },
    worldAt(px) {
      host.loop.renderNow();
      const r = host.gfx.renderer, el = r.domElement, W = el.width, H = el.height, k = W / Math.max(1, window.innerWidth);
      const wp = readWorldPoints(r, host.gfx.scene, host.cameraRig.camera, W, H);
      const o = originOf(host.sim().cur.p.s);
      return px.map(([x, y]) => {
        if (!wp) return null;
        const i = (Math.round(y * k) * W + Math.round(x * k)) * 3, wx = wp.xyz[i]!;
        return Number.isNaN(wx) ? null : { x: wx, y: wp.xyz[i + 1]!, s: o - wp.xyz[i + 2]! };
      });
    },
    nearAudit(at) {
      const out: Record<string, { unflagged: number; sample: number[] | null; at?: number[][] }> = {};
      const v = new Vector3();
      host.gfx.scene.traverse((o) => {
        const m = o as unknown as { isMesh?: boolean; geometry?: { getAttribute(n: string): { array: ArrayLike<number> } | undefined; drawRange: { count: number } }; material?: { name?: string } };
        if (!m.isMesh || !m.geometry) return;
        const pos = m.geometry.getAttribute('position'), fx = m.geometry.getAttribute('fx'), col = m.geometry.getAttribute('color');
        if (!pos || !fx) return;
        const name = m.material?.name ?? '?', glow = name === 'world-glow', n = Math.min(pos.array.length / 3, m.geometry.drawRange.count);
        const e = (out[name] ??= { unflagged: 0, sample: null });
        for (let i = 0; i < n; i++) {
          const x = pos.array[i * 3]!, y = pos.array[i * 3 + 1]!, fl = Math.round(fx.array[i * 4 + (glow ? 3 : 2)]!);
          if (at) {
            v.set(x, y, pos.array[i * 3 + 2]!); (o as unknown as { localToWorld(v: Vector3): Vector3 }).localToWorld(v);
            const ws = originOf(host.sim().cur.p.s) - v.z;
            if (Math.abs(v.x - at.x) < 1.5 && Math.abs(v.y - at.y) < 1.5 && Math.abs(ws - at.s) < 3 && (e.at ??= []).length < 6) e.at.push([x, y, ws, v.x, fl]);
          }
          if (x > 4.5 && y > 1 && !(fl & 4) && !(fl & 2)) {
            e.unflagged++;
            if (!e.sample) e.sample = [x, y, pos.array[i * 3 + 2]!, col ? col.array[i * 3]! : -1, col ? col.array[i * 3 + 1]! : -1, col ? col.array[i * 3 + 2]! : -1, fl];
          }
        }
      });
      return out;
    },
    frameMs(n = 20) {
      host.loop.renderNow();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) host.loop.renderNow();
      return (performance.now() - t0) / n;
    },
  };
  (window as unknown as { __camLab?: CamLab }).__camLab = lab;
  return lab;
}
