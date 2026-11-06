// debug/tuningPanel.ts: live edits of tunables (TECH §11.5), dev only, never persisted. Generic: any registered
// object's numeric and boolean fields (one level of nesting) become inputs that write straight into the object.
// M0-io registers the live recognizer config and the loop time scale; G1 registers score.config and gen.config with
// `registerTunables` (debug/index.ts) once those files exist. Toggled with Shift+Backquote (~) or
// `__skate.ext.tuning(on)`. Changing gameplay numbers mid-run breaks determinism on purpose: it is a dev tool.
type Tunable = Record<string, unknown>;
const groups = new Map<string, Tunable>();
const listeners = new Set<() => void>();

/** Adds (or replaces) a group of live tunables. Returns an unregister function. */
export function registerTunables(name: string, obj: object): () => void {
  groups.set(name, obj as Tunable);
  for (const f of listeners) f();
  return () => { groups.delete(name); for (const f of listeners) f(); };
}
export const tunableGroups = (): ReadonlyMap<string, Tunable> => groups;

export interface TuningPanel { set(on: boolean): void; readonly on: boolean; dispose(): void }

export function installTuningPanel(root: HTMLElement): TuningPanel {
  const el = document.createElement('div');
  el.id = 'tuning-panel';
  el.style.cssText = 'position:absolute;right:4px;top:calc(60px + var(--safe-top, 0px));bottom:calc(60px + var(--safe-bottom, 0px));'
    + 'width:min(280px,70vw);overflow:auto;z-index:10;display:none;pointer-events:auto;touch-action:pan-y;'
    + 'font:11px/1.3 ui-monospace,Menlo,monospace;color:#fff4e3;background:rgba(43,33,64,.88);padding:6px 8px;border-radius:8px';
  root.append(el);
  let on = false;

  const row = (obj: Tunable, key: string, label: string): HTMLElement | null => {
    const v = obj[key];
    if (typeof v !== 'number' && typeof v !== 'boolean') return null;
    const r = document.createElement('label');
    r.style.cssText = 'display:flex;justify-content:space-between;gap:6px;align-items:center;margin:2px 0';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.style.cssText = 'width:72px;font:inherit;background:#fff4e3;color:#2b2140;border:0;border-radius:4px;padding:1px 4px';
    if (typeof v === 'boolean') { input.type = 'checkbox'; input.checked = v; input.onchange = () => { obj[key] = input.checked; }; }
    else {
      input.type = 'number'; input.step = 'any'; input.value = String(v);
      input.onchange = () => { const x = Number(input.value); if (Number.isFinite(x)) obj[key] = x; else input.value = String(obj[key]); };
    }
    r.append(name, input);
    return r;
  };
  const render = () => {
    el.replaceChildren();
    const head = document.createElement('div');
    head.textContent = 'TUNING (live, not saved)';
    head.style.cssText = 'font-weight:700;margin-bottom:4px';
    el.append(head);
    for (const [g, obj] of groups) {
      const h = document.createElement('div');
      h.textContent = g;
      h.style.cssText = 'margin:6px 0 2px;color:#ffc94a';
      el.append(h);
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          for (const k2 of Object.keys(v as object)) { const r = row(v as Tunable, k2, `${k}.${k2}`); if (r) el.append(r); }
        } else { const r = row(obj, k, k); if (r) el.append(r); }
      }
    }
  };
  const refresh = () => { if (on) render(); };
  listeners.add(refresh);
  return {
    get on() { return on; },
    set(v: boolean) { on = v; el.style.display = on ? '' : 'none'; if (on) render(); },
    dispose() { listeners.delete(refresh); el.remove(); },
  };
}
