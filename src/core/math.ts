// core/math.ts (TECH §4.2). FROZEN CONTRACT: change only via docs/core-requests.md.
export interface V3 { s: number; x: number; y: number }               // track space, metres
export interface AABB { s0: number; s1: number; x0: number; x1: number; y0: number; y1: number }
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const smoothstep = (e0: number, e1: number, v: number) => {
  const u = clamp((v - e0) / (e1 - e0), 0, 1);
  return u * u * (3 - 2 * u);
};
export const approach = (v: number, target: number, maxDelta: number) =>
  v < target ? Math.min(v + maxDelta, target) : Math.max(v - maxDelta, target);
export const round1cm = (v: number) => Math.round(v * 100) / 100;
