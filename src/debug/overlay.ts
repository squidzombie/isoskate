// debug/overlay.ts: dev overlays drawn in the run scene (TECH §11.5), toggled with the backquote key (with the perf
// HUD), `?overlay=1` or `__skate.ext.overlay(on)`:
//   - hitboxes: the skater HITBOX at its sim position (and its steering target), every solid ahead coloured by
//     height class (bump grey, low crash coral, landable blue, tall magenta, knock orange) and pits
//   - safe line: the SafeKeys ahead as a polyline (ollie keys marked with an amber cross)
//   - look-ahead lines across the corridor: LOOKAHEAD_MIN (2.5 s, amber) and the achieved look-ahead (mint)
//   - chunk bounds (lilac) and the corridor edges (paper)
//   - safe-line heatmap (G1, TECH §11.5): the validator's reachable set from the board over the next 2.5 s, per grid
//     slice and 0.25 m cell: viable (reachable and still survivable, F & B) mint, reachable but doomed dim coral
//   - pick window (G1): the edge being picked is drawn gold, a bar across it marks the predicted capture, one tick
//     per pick swipe so far; heat and link window (G1): bars ahead of the board to where the combo heat (amber) and
//     the link window (mint) run out at the current speed; airLeft: a cross where the board is predicted to come down
// One LineSegments with preallocated buffers, rebuilt in scene.onBeforeRender, so it is current in rAF frames and in
// renderNow() alike. Drawn on top (no depth test). Track space → world with the shared origin rebasing.
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, type Scene } from 'three';
import { CHUNK_LEN, CORRIDOR_HALF, HEIGHT, HITBOX, LOOKAHEAD_MIN } from '../core/tuning';
import { originOf } from '../gfx';
import { simDebug } from '../sim';
import { GRID_CELLS, gridCellX, reachable, type ReachOut } from '../world/gen';
import type { DebugHost } from './api';

/** Height class of a solid above its local ground (DESIGN §5.5), from the frozen bands only (no renderer import). */
export function bandOf(top: number, ground: number): 'bump' | 'low' | 'forbidden' | 'tall' {
  const h = top - ground;
  return h <= HEIGHT.bumpMax ? 'bump' : h <= HEIGHT.lowMax ? 'low' : h < HEIGHT.tallMin ? 'forbidden' : 'tall';
}

const MAX_SEGMENTS = 12000;
const COL = {
  skater: 0x7ee0b5, bump: 0xcfc3b8, low: 0xff5e6c, landable: 0x5eb8ff, tall: 0xff3fa4, forbidden: 0xff00ff, knock: 0xff8a5b,
  safe: 0x7ee0b5, ollie: 0xffc94a, look: 0x7ee0b5, lookMin: 0xf2b630, chunk: 0xa88beb, corridor: 0xfff4e3,
  viable: 0x3fbf8a, doomed: 0x8a3a44, pick: 0xffd23a, heat: 0xffa040, window: 0x7ee0b5, airLeft: 0xffffff,
} as const;
/** Heatmap: horizon (s), recomputed at most every HEAT_EVERY frames and only on the ground (a plan starts rolling). */
const HEAT_HORIZON = 2.5, HEAT_EVERY = 6;

export interface Overlay { set(on: boolean): void; readonly on: boolean; dispose(): void }

export function installOverlay(host: DebugHost): Overlay {
  const pos = new Float32Array(MAX_SEGMENTS * 6), col = new Float32Array(MAX_SEGMENTS * 6);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setDrawRange(0, 0);
  const mat = new LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
  const lines = new LineSegments(geo, mat);
  lines.name = 'debugOverlay';
  lines.frustumCulled = false;
  lines.renderOrder = 999;
  lines.visible = false;
  const scene: Scene = host.gfx.scene;
  scene.add(lines);

  let n = 0, origin = 0;
  const seg = (s0: number, x0: number, y0: number, s1: number, x1: number, y1: number, c: number) => {
    if (n >= MAX_SEGMENTS) return;
    const o = n * 6;
    pos[o] = x0; pos[o + 1] = y0; pos[o + 2] = -(s0 - origin);
    pos[o + 3] = x1; pos[o + 4] = y1; pos[o + 5] = -(s1 - origin);
    const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
    col[o] = r; col[o + 1] = g; col[o + 2] = b; col[o + 3] = r; col[o + 4] = g; col[o + 5] = b;
    n++;
  };
  const box = (s0: number, s1: number, x0: number, x1: number, y0: number, y1: number, c: number) => {
    for (const y of [y0, y1]) {
      seg(s0, x0, y, s1, x0, y, c); seg(s0, x1, y, s1, x1, y, c); seg(s0, x0, y, s0, x1, y, c); seg(s1, x0, y, s1, x1, y, c);
    }
    for (const s of [s0, s1]) for (const x of [x0, x1]) seg(s, x, y0, s, x, y1, c);
  };

  // Safe-line heatmap scratch: per slice its s and [reachLo, reachHi, viableLo, viableHi] (world/gen reachable()).
  const reach: ReachOut = { s: new Float64Array(400), masks: new Int32Array(400 * 4) };
  let reachN = 0, reachAge = 0, reachTick = -1;
  const bit = (lo: number, hi: number, c: number) => ((c < 32 ? lo >>> c : hi >>> (c - 32)) & 1) === 1;
  const heatmap = (sim: ReturnType<DebugHost['sim']>, s: number) => {
    const cur = sim.cur;
    if (cur.tick < reachTick) reachN = 0;                // a new run (or a rewind): the old set is stale
    reachTick = cur.tick;
    if ((cur.mode === 'roll' || cur.mode === 'manual') && ++reachAge >= HEAT_EVERY) {
      reachAge = 0;
      const v = Math.max(1, cur.vel.s);
      reachN = reachable({ t: cur.t, x: cur.p.x, horizon: HEAT_HORIZON, obstacles: sim.world.obstacles(s - 1, s + HEAT_HORIZON * v + 6) }, reach);
    }
    for (let i = 0; i < reachN; i += 2) {
      const si = reach.s[i]!;
      if (si < s - 0.5) continue;
      const m = i * 4, rl = reach.masks[m]!, rh = reach.masks[m + 1]!, vl = reach.masks[m + 2]!, vh = reach.masks[m + 3]!;
      for (let c = 0; c < GRID_CELLS; c++) {
        if (!bit(rl, rh, c)) continue;
        const x = gridCellX(c);
        seg(si, x - 0.1, 0.02, si, x + 0.1, 0.02, bit(vl, vh, c) ? COL.viable : COL.doomed);
      }
    }
  };
  /** Pick window, heat / link window bars and the airLeft cross (GP's simDebug). */
  const simInfo = (sim: ReturnType<DebugHost['sim']>, s: number, v: number) => {
    const d = simDebug(sim);
    if (!d) return;
    const cur = sim.cur, x = cur.p.x;
    if (d.heat > 0) { seg(s, x - 0.7, 0.08, s + d.heat * v, x - 0.7, 0.08, COL.heat); seg(s + d.heat * v, x - 0.9, 0.08, s + d.heat * v, x - 0.5, 0.08, COL.heat); }
    if (d.window > 0) { seg(s, x + 0.7, 0.08, s + d.window * v, x + 0.7, 0.08, COL.window); seg(s + d.window * v, x + 0.5, 0.08, s + d.window * v, x + 0.9, 0.08, COL.window); }
    if (cur.mode === 'air' && d.airLeft > 0) {
      const sl = s + d.airLeft * v;
      seg(sl - 0.3, x - 0.3, cur.groundY + 0.05, sl + 0.3, x + 0.3, cur.groundY + 0.05, COL.airLeft);
      seg(sl - 0.3, x + 0.3, cur.groundY + 0.05, sl + 0.3, x - 0.3, cur.groundY + 0.05, COL.airLeft);
    }
    const pk = d.pick, e = pk ? sim.world.edge(pk.edgeId) : undefined;
    if (pk && e) {
      for (const dy of [0, 0.03, 0.06]) seg(e.a.s, e.a.x, e.a.y + dy, e.b.s, e.b.x, e.b.y + dy, COL.pick);
      const sc = Math.min(e.b.s, Math.max(e.a.s, s + pk.inSec * v)), u = (sc - e.a.s) / Math.max(1e-6, e.b.s - e.a.s);
      const ex = e.a.x + (e.b.x - e.a.x) * u, ey = e.a.y + (e.b.y - e.a.y) * u;
      seg(sc, ex - 0.6, ey + 0.05, sc, ex + 0.6, ey + 0.05, COL.pick);
      for (let k = 0; k < pk.dirs.length; k++) seg(sc - 0.25 - 0.2 * k, ex - 0.15, ey + 0.4, sc - 0.25 - 0.2 * k, ex + 0.15, ey + 0.4, COL.pick);
    }
  };

  const rebuild = () => {
    n = 0;
    const sim = host.sim(), cur = sim.cur, s = cur.p.s, v = Math.max(1, cur.vel.s);
    origin = originOf(s);
    const look = host.camera().lookAheadSec;
    const ahead = Math.max(look, LOOKAHEAD_MIN) * v + 10;
    // Skater hitbox (TECH §6.4): s ± l/2, x ± w/2, y … y + h; and the steering target.
    box(s - HITBOX.l / 2, s + HITBOX.l / 2, cur.p.x - HITBOX.w / 2, cur.p.x + HITBOX.w / 2, cur.p.y, cur.p.y + HITBOX.h, COL.skater);
    seg(s, cur.targetX, 0.03, s + 2, cur.targetX, 0.03, COL.skater);
    for (const o of sim.world.obstacles(s - 4, s + ahead)) {
      for (const so of o.solids) {
        const b = so.box, cls = bandOf(b.y1, b.y0);
        const c = so.top === 'knock' ? COL.knock : cls === 'tall' ? COL.tall : cls === 'forbidden' ? COL.forbidden
          : cls === 'bump' ? COL.bump : so.top === 'landable' ? COL.landable : COL.low;
        box(b.s0, b.s1, b.x0, b.x1, b.y0, b.y1, c);
      }
      for (const p of o.pits) box(p.s0, p.s1, p.x0, p.x1, p.lipY - 0.3, p.lipY, COL.low);
    }
    // Safe line.
    let prev: { s: number; x: number } | null = null;
    for (let i = Math.max(0, Math.floor(s / CHUNK_LEN)); i <= Math.floor((s + ahead) / CHUNK_LEN); i++) {
      for (const k of sim.gen.chunk(i).safe) {
        if (k.s < s - 2 || k.s > s + ahead) continue;
        if (prev) seg(prev.s, prev.x, 0.05, k.s, k.x, 0.05, COL.safe);
        if (k.action === 'ollie') {
          seg(k.s - 0.3, k.x - 0.3, 0.06, k.s + 0.3, k.x + 0.3, 0.06, COL.ollie);
          seg(k.s - 0.3, k.x + 0.3, 0.06, k.s + 0.3, k.x - 0.3, 0.06, COL.ollie);
        }
        prev = k;
      }
    }
    // Look-ahead lines.
    seg(s + LOOKAHEAD_MIN * v, -CORRIDOR_HALF - 0.3, 0.05, s + LOOKAHEAD_MIN * v, CORRIDOR_HALF + 0.3, 0.05, COL.lookMin);
    seg(s + look * v, -CORRIDOR_HALF - 0.3, 0.07, s + look * v, CORRIDOR_HALF + 0.3, 0.07, COL.look);
    // Chunk bounds and corridor edges.
    for (let i = Math.floor((s - 4) / CHUNK_LEN); i <= Math.floor((s + ahead) / CHUNK_LEN) + 1; i++) {
      seg(i * CHUNK_LEN, -6, 0.04, i * CHUNK_LEN, 6, 0.04, COL.chunk);
    }
    for (const x of [-CORRIDOR_HALF, CORRIDOR_HALF]) seg(s - 4, x, 0.04, s + ahead, x, 0.04, COL.corridor);
    heatmap(sim, s);
    simInfo(sim, s, v);
    geo.setDrawRange(0, n * 2);
    for (const a of [geo.getAttribute('position'), geo.getAttribute('color')] as BufferAttribute[]) {
      a.clearUpdateRanges(); a.addUpdateRange(0, n * 6); a.needsUpdate = true;
    }
  };

  const prevHook = scene.onBeforeRender;
  scene.onBeforeRender = function (...args) {
    if (lines.visible) { try { rebuild(); } catch { geo.setDrawRange(0, 0); } }   // e.g. no world chunks at boot
    prevHook.apply(this, args);
  };

  return {
    get on() { return lines.visible; },
    set(on: boolean) { lines.visible = on; },
    dispose() { scene.onBeforeRender = prevHook; scene.remove(lines); geo.dispose(); mat.dispose(); },
  };
}
