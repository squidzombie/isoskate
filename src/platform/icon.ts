// platform/icon.ts: the procedural app icon (TECH §10.6): a skateboard over a sunset disc.
// M0 draws a simple version; gen-icons.mjs (M4) renders it to PNGs.
export function drawIcon(c: CanvasRenderingContext2D, size: number, maskable: boolean): void {
  const s = size;
  c.fillStyle = '#2B2140';
  c.fillRect(0, 0, s, s);
  const r = maskable ? s * 0.3 : s * 0.38;
  const g = c.createLinearGradient(0, s * 0.5 - r, 0, s * 0.5 + r);
  g.addColorStop(0, '#FFC94A'); g.addColorStop(1, '#FF5E6C');
  c.fillStyle = g;
  c.beginPath(); c.arc(s / 2, s / 2, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#FFF4E3';
  const w = r * 1.6, h = r * 0.22;
  c.beginPath(); c.roundRect?.(s / 2 - w / 2, s * 0.58, w, h, h / 2); c.fill();
  c.fillStyle = '#2B2140';
  for (const dx of [-0.3, 0.3]) { c.beginPath(); c.arc(s / 2 + dx * w, s * 0.58 + h * 1.4, h * 0.45, 0, Math.PI * 2); c.fill(); }
}
