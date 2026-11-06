// debug/perfhud.ts: a tiny perf readout (fps, p50/p95, calls, tris, sim ms, build ms), toggled with the backquote key.
import type { DebugAPI } from '../core/debug';

export function installPerfHud(api: DebugAPI, root: HTMLElement): () => void {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:4px;bottom:calc(4px + var(--safe-bottom));z-index:9;pointer-events:none;'
    + 'font:11px/1.3 ui-monospace,monospace;color:#fff4e3;background:rgba(43,33,64,.7);padding:3px 6px;border-radius:6px;'
    + 'white-space:pre;display:none';
  root.append(el);
  let on = false;
  const tick = setInterval(() => {
    if (!on) return;
    const p = api.perf();
    const c = api.camera();
    el.textContent = `${p.fps.toFixed(0)} fps  p50 ${p.p50.toFixed(1)}  p95 ${p.p95.toFixed(1)} ms\n`
      + `calls ${p.calls}  tris ${p.tris}  sim ${p.simMs.toFixed(2)}  build ${p.buildMs.toFixed(1)}\n`
      + `H ${c.H.toFixed(1)} m  yaw ${c.yawDeg.toFixed(0)}°  look ${c.lookAheadSec.toFixed(2)} s`;
  }, 500);
  const key = (e: KeyboardEvent) => { if (e.code === 'Backquote') { on = !on; el.style.display = on ? '' : 'none'; } };
  window.addEventListener('keydown', key);
  return () => { clearInterval(tick); window.removeEventListener('keydown', key); el.remove(); };
}
