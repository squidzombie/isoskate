// debug/: window.__skate, perf HUD, overlays, tuning panel (INT; bots/ is WG). Public surface (TECH §4.13).
import type { DebugAPI } from '../core/debug';
import { installDebugApiImpl, type DebugHost } from './api';
import { installPerfHud } from './perfhud';

/** `deps` is a DebugHost (see debug/api.ts), built by game/wiring.ts. */
export function installDebugApi(deps: object): void {
  const host = deps as DebugHost;
  const api: DebugAPI = installDebugApiImpl(host);
  window.__skate = api;
  const root = document.getElementById('app');
  if (root) installPerfHud(api, root);
}

export type { DebugHost, StartOptions } from './api';
export { BOTS, type Bot, type BotKind, type BotFactory, type BotOptions } from './bots';
