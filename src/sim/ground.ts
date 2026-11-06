// sim/ground.ts: rolling on the ground (TECH §6.3 step 5 roll/manual; DESIGN §5.3, §7). FROZEN in M0 (TECH §6.3).
//  - Follow groundAt(s, x, y + STEP_UP): step-ups ≤ STEP_UP are taken instantly as a bump.
//  - Stair and incline slabs are sticky: the board follows their slope and never rolls off them; stairs emit stairStep.
//  - Pit level = lip level: board centre over a pit with board bottom ≤ lipY + PIT_FALL_EPS → crash (pit.cause).
//  - Otherwise, ground falling away by > ROLL_OFF_DROP → airborne 'rollOff' with coyote (never over a pit).
import type { GroundHit, GroundSlab, Obstacle } from '../core/world';
import { COYOTE, PIT_FALL_EPS, STEP_UP } from '../core/tuning';
import { freshAir, type Ctx } from './state';

/** Ground falling away by more than this goes airborne (TECH §6.3). */
export const ROLL_OFF_DROP = 0.05;
/** A sticky slab (stairs / incline) is followed down by up to this much per tick (10-stair at 10.5 m/s ≈ 0.10). */
export const STICKY_DROP = 0.3;

/** Obstacle id owning a slab (−1 for none / the bare street). */
export function slabOwner(obs: readonly Obstacle[], slab: GroundSlab | null): number {
  if (!slab) return -1;
  for (const ob of obs) for (const sl of ob.slabs) if (sl === slab) return ob.id;
  return -1;
}

/** Record the surface the board now rides on (surface event on change). */
export function setGround(k: Ctx, g: GroundHit): void {
  const st = k.st, c = st.cur;
  c.groundY = g.y;
  c.layer = g.layer;
  if (g.surface !== c.surface) { c.surface = g.surface; k.ev.push({ t: 'surface', tick: c.tick, surface: g.surface }); }
  const kind = g.slab?.kind ?? 'flat';
  st.slabKind = kind;
  st.groundOb = slabOwner(k.obs, g.slab);
  if (kind === 'stairs' && g.slab) {
    const sl = g.slab, n = Math.max(1, sl.steps ?? 1);
    const step = Math.floor(((c.p.s - sl.s0) / Math.max(1e-6, sl.s1 - sl.s0)) * n);
    if (step !== st.stairStep) { if (st.stairStep >= 0) k.ev.push({ t: 'stairStep', tick: c.tick }); st.stairStep = step; }
  } else st.stairStep = -1;
}

/** One rolling tick (roll or manual). Returns 'bump' when a step-up was taken (manuals end on bumps). */
export function rollGround(k: Ctx): 'ok' | 'bump' | 'air' | 'crash' {
  const st = k.st, c = st.cur;
  const g = k.world.groundAt(c.p.s, c.p.x, c.p.y + STEP_UP);
  if (g.pit && !g.slab && c.p.y <= g.pit.lipY + PIT_FALL_EPS + 1e-9) {
    const ob = obstacleOfPit(k, g);
    if (st.cfg.god) {                       // logged once per obstacle (crash() ghosts it), then ridden as ground
      if (!ob || !st.ghosted.has(ob.id)) k.crash(g.pit.cause, ob?.id ?? null);
      c.p.y = g.y; c.vel.y = 0; setGround(k, g);
      return 'ok';
    }
    k.crash(g.pit.cause, ob?.id ?? null);
    return 'crash';
  }
  const sticky = st.slabKind !== 'flat' || (g.slab !== null && g.slab.kind !== 'flat');
  const drop = c.p.y - g.y;
  if (drop <= ROLL_OFF_DROP || (sticky && drop <= STICKY_DROP)) {
    const up = g.y - c.p.y > 0.02;
    c.p.y = g.y;
    c.vel.y = 0;
    setGround(k, g);
    return up ? 'bump' : 'ok';
  }
  // Roll off an edge: airborne, with coyote time unless over a pit.
  c.mode = 'air';
  c.vel.y = 0;
  c.airT = 0;
  c.coyote = g.pit ? 0 : COYOTE + 1e-9;
  c.flip = null; c.spin = null; c.flipsThisAir = 0; c.airTricks.length = 0;
  st.air = freshAir();
  st.air.reason = 'rollOff';
  st.air.takeoffY = c.p.y;
  k.ev.push({ t: 'airborne', tick: c.tick, reason: 'rollOff' });
  return 'air';
}

/** Ghost-mode / crash attribution: the obstacle a pit belongs to. */
export function obstacleOfPit(k: Ctx, g: GroundHit): Obstacle | null {
  if (!g.pit) return null;
  for (const ob of k.obs) for (const p of ob.pits) if (p === g.pit) return ob;
  return null;
}
