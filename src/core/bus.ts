// core/bus.ts (TECH §4.8). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
// Tiny implementation: typed listeners run in subscription order, then onAny listeners in subscription order.
// Listener lists are copy-on-write, so (un)subscribing during an emit is safe and emit never allocates.
export interface Bus<E extends { t: string }> {
  on<K extends E['t']>(t: K, f: (e: Extract<E, { t: K }>) => void): () => void;
  onAny(f: (e: E) => void): () => void;
  emit(e: E): void;
}
export function createBus<E extends { t: string }>(): Bus<E> {
  type Fn = (e: E) => void;
  const byType = new Map<string, Fn[]>();
  let any: Fn[] = [];
  return {
    on(t, f) {
      const fn = f as unknown as Fn;
      byType.set(t, [...(byType.get(t) ?? []), fn]);
      return () => { byType.set(t, (byType.get(t) ?? []).filter((g) => g !== fn)); };
    },
    onAny(f) {
      any = [...any, f];
      return () => { any = any.filter((g) => g !== f); };
    },
    emit(e) {
      const list = byType.get(e.t);
      if (list) for (let i = 0; i < list.length; i++) list[i]!(e);
      const all = any;
      for (let i = 0; i < all.length; i++) all[i]!(e);
    },
  };
}
