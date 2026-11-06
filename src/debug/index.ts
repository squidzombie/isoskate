// debug/: window.__skate, perf HUD, overlays, tuning panel (INT; bots/ is WG). Public surface (TECH §4.13).
// Keys: backquote toggles the perf HUD and the overlays together, Shift+backquote the tuning panel.
// Query flags (debug builds only): ?overlay=1 starts with the perf HUD and overlays on, ?tuning=1 opens the panel.
import { isInjectable } from '../input';
import { installDebugApiImpl, type DebugHost, type DebugTools } from './api';
import { installOverlay } from './overlay';
import { installPerfHud } from './perfhud';
import { installTuningPanel, registerTunables } from './tuningPanel';

/** `deps` is a DebugHost (see debug/api.ts), built by game/wiring.ts. */
export function installDebugApi(deps: object): void {
  const host = deps as DebugHost;
  const tools: DebugTools = {};
  const api = installDebugApiImpl(host, tools);
  window.__skate = api;
  const root = document.getElementById('app');
  if (root) {
    tools.perf = installPerfHud(api, root);
    tools.tuning = installTuningPanel(root);
  }
  tools.overlay = installOverlay(host);
  if (isInjectable(host.input)) registerTunables('input: recognizer (live)', host.input.pipeline.rec.config);
  registerTunables('loop', host.loop);
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote' || e.repeat) return;
    if (e.shiftKey) { api.ext.tuning(); return; }
    const on = !(tools.perf?.on ?? false);
    api.ext.perfHud(on); api.ext.overlay(on);
  });
  const q = new URLSearchParams(location.search);
  if (q.get('overlay') === '1') { api.ext.perfHud(true); api.ext.overlay(true); }
  if (q.get('tuning') === '1') api.ext.tuning(true);
}

export type { DebugApiWithExt, DebugExt, DebugHost, HudPreview, StartOptions } from './api';
export { encodeWav } from './api';
export { CONTRAST_GATE, ratioOf, relLum, type ContrastItem, type ContrastReport } from './contrast';
export { registerTunables } from './tuningPanel';
export { BOTS, type Bot, type BotKind, type BotFactory, type BotOptions } from './bots';
