// gfx/space.ts: track space ↔ three.js world space with origin rebasing (TECH §8.2).
// world.x = x, world.y = y, world.z = −(s − originS); originS = floor(playerS / 512)·512.
// Every view (world, skater, camera, shadow camera, vfx) derives originS from RenderFrame.playerS the same way.
import type { Vector3 } from 'three';
import { ORIGIN_REBASE } from '../core/tuning';

export const originOf = (playerS: number) => Math.floor(playerS / ORIGIN_REBASE) * ORIGIN_REBASE;
export function toWorld(s: number, x: number, y: number, originS: number, out: Vector3): Vector3 {
  return out.set(x, y, -(s - originS));
}
