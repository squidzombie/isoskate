// meta/analytics.ts: local analytics (DESIGN §21). `track(event, props)` appends to a ring buffer of 500 events kept in
// the save-adjacent key `dusklane.analytics` (written at most every 2 s, and on flush), and logs to the console in dev.
// No network in v1; the install id is anonymous; opting out clears the buffer and stops recording. A future
// AnalyticsSink (TECH §4.10) can upload `buffer()` and then clear it.
import { GAME_ID } from '../core/ids';
import type { Analytics, AnalyticsSink } from '../core/platform';
import type { SaveStore } from '../core/save';
import { createStorage, type StorageAdapter } from '../save';

export const ANALYTICS_KEY = `${GAME_ID}.analytics`;
export const ANALYTICS = { max: 500, writeMs: 2000 } as const;

export type AnalyticsEvent = { e: string; t: number; p?: object };

export interface AnalyticsExt extends Analytics {
  readonly optOut: boolean;
  /** Writes the buffer now (visibility hidden, run end). */
  flush(): void;
  /** Hands the buffer to a sink (future uploader) and clears what it accepted. */
  upload(sink: AnalyticsSink): Promise<number>;
  clear(): void;
}

export interface AnalyticsOptions { io?: StorageAdapter; now?: () => number; log?: boolean }

/** Analytics instances by save store, so createMeta(save, …) can find the instance wiring made for the same save. */
const BY_SAVE = new WeakMap<SaveStore, AnalyticsExt>();
export const analyticsFor = (save: SaveStore): AnalyticsExt | undefined => BY_SAVE.get(save);

export function createAnalyticsImpl(save: SaveStore, o: AnalyticsOptions = {}): AnalyticsExt {
  const io = o.io ?? createStorage();
  const now = o.now ?? (() => Date.now());
  const log = o.log ?? (typeof import.meta !== 'undefined' && !!import.meta.env?.DEV && typeof window !== 'undefined');
  let optOut = save.data.settings.analyticsOptOut;
  let buf: AnalyticsEvent[] = [];
  try {
    const raw = JSON.parse(io.get(ANALYTICS_KEY) ?? '[]') as unknown;
    if (Array.isArray(raw)) buf = raw.filter((x): x is AnalyticsEvent => !!x && typeof x === 'object' && typeof (x as AnalyticsEvent).e === 'string').slice(-ANALYTICS.max);
  } catch { buf = []; }
  if (optOut) buf = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const write = () => { if (timer) { clearTimeout(timer); timer = null; } if (!optOut) io.set(ANALYTICS_KEY, JSON.stringify(buf)); };
  // Written at most every 2 s, in idle time where the browser offers it (a 500-event buffer is ~50 KB of JSON:
  // never a synchronous storage write in the middle of a run frame).
  const g = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
  const ric = typeof g.requestIdleCallback === 'function' ? g.requestIdleCallback.bind(globalThis) : null;
  const schedule = () => { if (!timer) timer = setTimeout(() => { if (ric) ric(write, { timeout: 3000 }); else write(); }, ANALYTICS.writeMs); };

  const a: AnalyticsExt = {
    get optOut() { return optOut; },
    track(event, props) {
      if (optOut) return;
      const ev: AnalyticsEvent = props ? { e: event, t: now(), p: props } : { e: event, t: now() };
      buf.push(ev);
      if (buf.length > ANALYTICS.max) buf.splice(0, buf.length - ANALYTICS.max);
      if (log) console.debug('[analytics]', event, props ?? '');
      schedule();
    },
    setOptOut(on) {
      optOut = on;
      if (on) { buf = []; io.remove(ANALYTICS_KEY); if (timer) { clearTimeout(timer); timer = null; } }
    },
    buffer: () => buf,
    flush: write,
    async upload(sink) {
      const batch = buf.slice();
      if (!batch.length) return 0;
      await sink.flush(batch);
      buf = buf.slice(batch.length);
      write();
      return batch.length;
    },
    clear() { buf = []; write(); },
  };
  BY_SAVE.set(save, a);
  return a;
}
