// ui/guard.ts: dev-mode layout-read guard (ROADMAP W3a: "no layout reads during runs, checked with a dev-mode
// guard"). When installed (debug builds only), it wraps the DOM APIs that force style/layout (getBoundingClientRect,
// offset*/client*/scroll* getters, getComputedStyle, innerWidth/innerHeight) and counts every call made while
// `active` (the UI sets it on the run screen). `allow(f)` exempts deliberate reads (a resize re-measure).
export interface LayoutGuard {
  readonly installed: boolean;
  active: boolean;
  readonly reads: number;
  /** First few offending call sites (stack lines), for the e2e message. */
  readonly samples: readonly string[];
  allow<T>(f: () => T): T;
  reset(): void;
}

const GETTERS: readonly [string, readonly string[]][] = [
  ['HTMLElement', ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'offsetParent']],
  ['Element', ['clientWidth', 'clientHeight', 'clientTop', 'clientLeft', 'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft']],
];
const METHODS: readonly [string, readonly string[]][] = [['Element', ['getBoundingClientRect', 'getClientRects']]];

export function createLayoutGuard(install: boolean): LayoutGuard {
  let reads = 0, allowed = 0;
  const samples: string[] = [];
  const g: LayoutGuard = {
    installed: false, active: false,
    get reads() { return reads; },
    get samples() { return samples; },
    allow<T>(f: () => T): T { allowed++; try { return f(); } finally { allowed--; } },
    reset() { reads = 0; samples.length = 0; },
  };
  if (!install || typeof window === 'undefined') return g;
  const hit = () => {
    if (!g.active || allowed > 0) return;
    reads++;
    if (samples.length < 6) samples.push((new Error().stack ?? '').split('\n').slice(2, 5).map((s) => s.trim()).join(' < '));
  };
  const w = window as unknown as Record<string, { prototype: object } | undefined>;
  for (const [cls, names] of GETTERS) {
    const proto = w[cls]?.prototype;
    if (!proto) continue;
    for (const n of names) {
      const d = Object.getOwnPropertyDescriptor(proto, n);
      if (!d?.get) continue;
      const get = d.get;
      Object.defineProperty(proto, n, { ...d, get(this: unknown) { hit(); return get.call(this); } });
    }
  }
  for (const [cls, names] of METHODS) {
    const proto = w[cls]?.prototype as Record<string, unknown> | undefined;
    if (!proto) continue;
    for (const n of names) {
      const f = proto[n];
      if (typeof f !== 'function') continue;
      proto[n] = function (this: unknown, ...a: unknown[]) { hit(); return (f as (...x: unknown[]) => unknown).apply(this, a); };
    }
  }
  const gcs = window.getComputedStyle.bind(window);
  window.getComputedStyle = ((el: Element, p?: string | null) => { hit(); return gcs(el, p); }) as typeof window.getComputedStyle;
  for (const n of ['innerWidth', 'innerHeight'] as const) {
    let o: object | null = window;
    while (o && !Object.getOwnPropertyDescriptor(o, n)) o = Object.getPrototypeOf(o) as object | null;
    const d = o ? Object.getOwnPropertyDescriptor(o, n) : undefined;
    if (o && d?.get && d.configurable) {
      const get = d.get;
      Object.defineProperty(o, n, { ...d, get(this: unknown) { hit(); return get.call(this); } });
    }
  }
  (g as { installed: boolean }).installed = true;
  return g;
}
