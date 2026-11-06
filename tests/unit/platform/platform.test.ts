// platform/ (TECH §10): haptics rules, the back-gesture guard, wake lock, touch hygiene, visibility pause and boot
// checks, against small fakes of the browser globals (vitest runs in node).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHapticsImpl, HAPTIC_RULES } from '../../../src/platform/haptics';
import { createBackGuard } from '../../../src/platform/history';
import { installTouchHygiene } from '../../../src/platform/ios';
import { onHide } from '../../../src/platform/visibility';
import { createWakeLock } from '../../../src/platform/wake';
import { checkCompat } from '../../../src/platform/compat';

afterEach(() => { vi.unstubAllGlobals(); });

/** An EventTarget that records listener options (to check passive:false) and can dispatch plain events. */
class FakeTarget extends EventTarget {
  readonly added: { type: string; passive: boolean | undefined }[] = [];
  override addEventListener(type: string, cb: EventListenerOrEventListenerObject | null, o?: boolean | AddEventListenerOptions): void {
    this.added.push({ type, passive: typeof o === 'object' ? o.passive : undefined });
    super.addEventListener(type, cb, o);
  }
}

describe('haptics (DESIGN §9: ≥ 15 ms, ≤ 1 per 120 ms)', () => {
  it('floors pulses at 15 ms, rate-limits to one per 120 ms and respects enabled', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    let t = 1000;
    const h = createHapticsImpl(() => t);
    h.pulse(5);
    expect(vibrate).toHaveBeenLastCalledWith(HAPTIC_RULES.minPulseMs);
    t += 100; h.pulse(20);
    expect(vibrate).toHaveBeenCalledTimes(1);
    t += 20; h.pulse([10, 40, 30]);
    expect(vibrate).toHaveBeenLastCalledWith([15, 40, 30]);
    h.enabled = false; t += 500; h.pulse(30);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });
  it('is a silent no-op without navigator.vibrate (iOS web) and survives a throwing vibrate', () => {
    vi.stubGlobal('navigator', {});
    expect(() => createHapticsImpl(() => 0).pulse(30)).not.toThrow();
    vi.stubGlobal('navigator', { vibrate: () => { throw new Error('blocked'); } });
    expect(() => createHapticsImpl(() => 0).pulse(30)).not.toThrow();
  });
});

describe('back-gesture guard (TECH §10.1)', () => {
  it('pushes one entry at run start; popstate during a run pauses and re-pushes; on menus it goes back to the Title', () => {
    const win = new FakeTarget();
    const pushState = vi.fn();
    vi.stubGlobal('window', win);
    vi.stubGlobal('history', { pushState });
    const onBack = vi.fn();
    const g = createBackGuard(onBack);
    g.armRun(); g.armRun();
    expect(pushState).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event('popstate'));
    expect(onBack).toHaveBeenLastCalledWith('run');
    expect(pushState).toHaveBeenCalledTimes(2);                 // the page can never be left by a steering drag
    g.disarm();
    win.dispatchEvent(new Event('popstate'));
    expect(onBack).toHaveBeenLastCalledWith('menu');
    g.dispose();
    win.dispatchEvent(new Event('popstate'));
    expect(onBack).toHaveBeenCalledTimes(2);
  });
  it('survives a sandboxed history that throws', () => {
    vi.stubGlobal('window', new FakeTarget());
    vi.stubGlobal('history', { pushState: () => { throw new Error('sandboxed'); } });
    expect(() => createBackGuard(() => undefined).armRun()).not.toThrow();
  });
});

describe('wake lock (TECH §10.2)', () => {
  const fakeLock = () => {
    const sentinels: { released: boolean; release: () => Promise<void>; fire?: () => void; addEventListener: (t: string, f: () => void) => void }[] = [];
    return {
      sentinels,
      wakeLock: { request: vi.fn(async () => {
        const s = { released: false, fire: undefined as (() => void) | undefined,
          release: async () => { s.released = true; }, addEventListener: (_t: string, f: () => void) => { s.fire = f; } };
        sentinels.push(s);
        return s;
      }) },
    };
  };
  it('requests once, releases on pause, and re-acquires after the browser dropped it', async () => {
    const nav = fakeLock();
    const w = createWakeLock(nav);
    w.request(); w.request();
    await Promise.resolve(); await Promise.resolve();
    expect(nav.wakeLock.request).toHaveBeenCalledTimes(1);
    expect(w.held).toBe(true);
    w.release();
    expect(nav.sentinels[0]!.released).toBe(true);
    expect(w.held).toBe(false);
    w.request();
    await Promise.resolve(); await Promise.resolve();
    expect(w.held).toBe(true);
    nav.sentinels[1]!.released = true; nav.sentinels[1]!.fire?.();    // page hidden: the browser releases it
    w.request();
    await Promise.resolve(); await Promise.resolve();
    expect(nav.wakeLock.request).toHaveBeenCalledTimes(3);
  });
  it('a release while the request is pending drops the late sentinel; no API is a no-op', async () => {
    const nav = fakeLock();
    const w = createWakeLock(nav);
    w.request(); w.release();
    await Promise.resolve(); await Promise.resolve();
    expect(nav.sentinels[0]!.released).toBe(true);
    expect(w.held).toBe(false);
    expect(() => { const x = createWakeLock({}); x.request(); x.release(); }).not.toThrow();
  });
});

describe('touch hygiene (TECH §10.1)', () => {
  it('blocks touchmove and the long-press menu on #play only (non-passive); pinch and double-tap page-wide', () => {
    const doc = new FakeTarget();
    vi.stubGlobal('document', doc);
    const play = new FakeTarget();
    const off = installTouchHygiene(play as unknown as HTMLElement);
    expect(play.added).toEqual([{ type: 'touchmove', passive: false }, { type: 'contextmenu', passive: false }]);
    expect(doc.added.map((a) => a.type).sort()).toEqual(['dblclick', 'gesturestart']);
    expect(doc.added.some((a) => a.type === 'touchmove')).toBe(false);   // other screens still scroll
    const ev = new Event('touchmove', { cancelable: true });
    play.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    off();
    const ev2 = new Event('touchmove', { cancelable: true });
    play.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(false);
  });
});

describe('visibility pause (TECH §10.2)', () => {
  it('fires on visibilitychange to hidden, pagehide and blur, and not on visible', () => {
    const doc = Object.assign(new FakeTarget(), { visibilityState: 'visible' });
    const win = new FakeTarget();
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', win);
    const f = vi.fn();
    const off = onHide(f);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(f).not.toHaveBeenCalled();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('pagehide'));
    win.dispatchEvent(new Event('blur'));
    expect(f.mock.calls.map((c) => c[0])).toEqual(['hidden', 'pagehide', 'blur']);
    off();
    win.dispatchEvent(new Event('blur'));
    expect(f).toHaveBeenCalledTimes(3);
  });
});

describe('boot checks (TECH §10.8)', () => {
  it('reports WebGL2, structuredClone and AudioContext when missing', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    vi.stubGlobal('window', {});
    vi.stubGlobal('structuredClone', undefined);
    expect(checkCompat()).toEqual({ ok: false, missing: ['WebGL2', 'structuredClone', 'AudioContext'] });
  });
  it('passes with all three (webkitAudioContext counts)', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({}) }) });
    vi.stubGlobal('window', { webkitAudioContext: class {} });
    vi.stubGlobal('structuredClone', (x: unknown) => x);
    expect(checkCompat()).toEqual({ ok: true, missing: [] });
  });
});
