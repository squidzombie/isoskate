// debug/bots/util.ts: small helpers shared by the bots.

/** x of a polyline in time at t (sorted by t; clamped at the ends). */
export function polyAt(pts: readonly { t: number; x: number }[], t: number): number {
  if (!pts.length) return 0;
  if (t <= pts[0]!.t) return pts[0]!.x;
  let lo = 0, hi = pts.length - 1;
  if (t >= pts[hi]!.t) return pts[hi]!.x;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m]!.t <= t) lo = m; else hi = m; }
  const a = pts[lo]!, b = pts[hi]!;
  return b.t - a.t > 1e-9 ? a.x + (b.x - a.x) * ((t - a.t) / (b.t - a.t)) : b.x;
}
