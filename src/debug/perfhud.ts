// debug/perfhud.ts: the perf readout (TECH §11.5): fps, p50/p95 frame interval, draw calls, triangles, geometries,
// textures, sim ms, chunk build p95, heap, plus the camera framing (H, yaw, achieved look-ahead). Updated at 2 Hz,
// bottom-left above the safe area, pointer-events:none. Toggled with the backquote key (with the overlays).
import type { DebugAPI } from '../core/debug';

export interface PerfHud { set(on: boolean): void; readonly on: boolean; dispose(): void }

export function installPerfHud(api: DebugAPI, root: HTMLElement): PerfHud {
  const el = document.createElement('div');
  el.id = 'perf-hud';
  el.style.cssText = 'position:absolute;left:4px;bottom:calc(4px + var(--safe-bottom, 0px));z-index:9;pointer-events:none;'
    + 'font:11px/1.35 ui-monospace,Menlo,monospace;color:#fff4e3;background:rgba(43,33,64,.78);padding:4px 7px;'
    + 'border-radius:6px;white-space:pre;display:none';
  root.append(el);
  let on = false;
  const draw = () => {
    const p = api.perf(), c = api.camera(), s = api.snapshot();
    el.textContent = `${p.fps.toFixed(0)} fps  p50 ${p.p50.toFixed(1)}  p95 ${p.p95.toFixed(1)} ms\n`
      + `calls ${p.calls}  tris ${(p.tris / 1000).toFixed(1)}k  geo ${p.geoms}  tex ${p.textures}\n`
      + `sim ${p.simMs.toFixed(2)}  build p95 ${p.buildMs.toFixed(1)} ms${p.heapMB !== null ? `  heap ${p.heapMB.toFixed(0)} MB` : ''}\n`
      + `H ${c.H.toFixed(1)} m  yaw ${c.yawDeg.toFixed(0)}°  look ${c.lookAheadSec.toFixed(2)} s\n`
      + `t ${s.t.toFixed(1)}  v ${s.speed.toFixed(2)}  x ${s.p.x.toFixed(2)}  ${s.mode}  ${s.area}`;
  };
  const timer = setInterval(() => { if (on) { try { draw(); } catch { /* boot */ } } }, 500);
  return {
    get on() { return on; },
    set(v: boolean) { on = v; el.style.display = on ? '' : 'none'; if (on) { try { draw(); } catch { /* boot */ } } },
    dispose() { clearInterval(timer); el.remove(); },
  };
}
