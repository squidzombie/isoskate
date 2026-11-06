// world/gen/areas.ts: the area timeline, a pure function of (t, startArea) (DESIGN §12.1, TECH §5.1).
// First visit 40 s (it holds the Roll-out or the Lesson Line), later visits 35 s, gateways 4 s, 156 s loop.
// The palette blends over 8 s centred on each gateway.
import type { AreaBlend } from '../../core/world';
import type { AreaId, GatewayId } from '../../core/ids';
import { AREA_ORDER } from '../../core/ids';

export const FIRST_VISIT_SEC = 40, VISIT_SEC = 35, GATEWAY_SEC = 4, BLEND_SEC = 8;
export const LOOP_SEC = AREA_ORDER.length * (VISIT_SEC + GATEWAY_SEC);   // 156 s
/** Gateway that leads out of each area. */
export const GATEWAY_AFTER: Readonly<Record<AreaId, GatewayId>> = {
  downtown: 'greenway', suburbs: 'levelCrossing', docks: 'harborBridge', neon: 'underpass',
};

export interface AreaSample { area: AreaId; blend: AreaBlend | null; gateway: GatewayId | null; first: boolean; visit: number }

/** Area state at run time t (seconds). `visit` counts visits from 0 (the start area); `first` = first visit of
 *  that area in this run. During a gateway `area` is still the area being left; it switches at the gateway end. */
export function areaAtTime(t: number, startArea: AreaId = 'downtown'): AreaSample {
  const start = AREA_ORDER.indexOf(startArea);
  const n = AREA_ORDER.length;
  // Visit k (k ≥ 0) starts at visitStart(k); visit 0 is 5 s longer than the rest.
  const visitStart = (k: number) => (k === 0 ? 0 : FIRST_VISIT_SEC + GATEWAY_SEC + (k - 1) * (VISIT_SEC + GATEWAY_SEC));
  const visitLen = (k: number) => (k === 0 ? FIRST_VISIT_SEC : VISIT_SEC);
  const tt = Math.max(0, t);
  let k = tt < FIRST_VISIT_SEC + GATEWAY_SEC ? 0 : 1 + Math.floor((tt - FIRST_VISIT_SEC - GATEWAY_SEC) / (VISIT_SEC + GATEWAY_SEC));
  if (k < 0) k = 0;
  const area = AREA_ORDER[(start + k) % n]!;
  const next = AREA_ORDER[(start + k + 1) % n]!;
  const prev = AREA_ORDER[(start + k - 1 + n) % n]!;
  const gwStart = visitStart(k) + visitLen(k);
  const gateway = tt >= gwStart ? GATEWAY_AFTER[area] : null;
  let blend: AreaBlend | null = null;
  const midOut = gwStart + GATEWAY_SEC / 2;                       // gateway out of this area
  const midIn = visitStart(k) - GATEWAY_SEC / 2;                  // gateway into this area (k ≥ 1)
  if (Math.abs(tt - midOut) <= BLEND_SEC / 2) blend = { from: area, to: next, u: (tt - (midOut - BLEND_SEC / 2)) / BLEND_SEC };
  else if (k > 0 && Math.abs(tt - midIn) <= BLEND_SEC / 2) blend = { from: prev, to: area, u: (tt - (midIn - BLEND_SEC / 2)) / BLEND_SEC };
  return { area, blend, gateway, first: k < n, visit: k };
}
