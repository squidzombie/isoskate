// Every canvas generator runs for every item (and all 20 deck patterns at every scale and rotation) against a
// recording 2D context, deterministically: the same look draws the same calls.
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../src/content';
import type { BoardLook, BoardPattern, HelmetLook, SkaterLook } from '../../../src/core/cosmetics';
import { PATTERNS, drawBoardAtlas, drawHelmetDecal, drawSkaterAtlas } from '../../../src/skater/textures';

/** A fake CanvasRenderingContext2D that records method calls and property writes. */
function fakeCtx(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const grad = { addColorStop: (o: number, c: string) => log.push(`stop ${o} ${c}`) };
  const target: Record<string, unknown> = {
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    measureText: (t: string) => ({ width: t.length * 12 }), setLineDash: () => {}, canvas: {},
  };
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k in t) return t[k];
      return (...a: unknown[]) => { log.push(`${k}(${a.map((x) => (typeof x === 'number' ? x.toFixed(2) : String(x))).join(',')})`); };
    },
    set(t, k: string, v) { log.push(`${k}=${String(v)}`); t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

const ALL_PATTERNS: BoardPattern[] = ['plainMaple', 'stripes', 'chevrons', 'checker', 'halftoneSun', 'palms', 'waveLines', 'polka',
  'gradientFade', 'stickerBomb', 'topo', 'neonGrid', 'retroSun', 'brick', 'cassette', 'corrugated', 'koi', 'streetMap', 'lanterns', 'goldLeaf'];

describe('canvas generators', () => {
  it('all 20 deck patterns exist and draw at every scale and rotation', () => {
    expect(Object.keys(PATTERNS).sort()).toEqual([...ALL_PATTERNS].sort());
    const base = CATALOG.find((c) => c.id === 'bd_plain_maple')!.look as BoardLook;
    for (const pattern of ALL_PATTERNS) for (const scale of [0.5, 1, 2]) for (const rot of [0, 45, 90] as const) {
      const { ctx, log } = fakeCtx();
      drawBoardAtlas(ctx, { ...base, pattern, scale, rot, wear: 1, logo: 'Pressline' });
      expect(log.length, pattern).toBeGreaterThan(20);
    }
  });
  it('every item draws its canvases deterministically', () => {
    for (const it of CATALOG) {
      const run = () => {
        const { ctx, log } = fakeCtx();
        if (it.slot === 'skater') drawSkaterAtlas(ctx, it.look as SkaterLook, { blink: false, robotFace: 0 });
        else if (it.slot === 'board') drawBoardAtlas(ctx, it.look as BoardLook);
        else drawHelmetDecal(ctx, it.look as HelmetLook);
        return log;
      };
      const a = run();
      expect(a.length, it.id).toBeGreaterThan(10);
      expect(run()).toEqual(a);
    }
  });
  it('every item in a slot draws a different canvas', () => {
    for (const slot of ['skater', 'board', 'helmet'] as const) {
      const logs = CATALOG.filter((c) => c.slot === slot).map((it) => {
        const { ctx, log } = fakeCtx();
        if (slot === 'skater') drawSkaterAtlas(ctx, it.look as SkaterLook, { blink: false, robotFace: 0 });
        else if (slot === 'board') drawBoardAtlas(ctx, it.look as BoardLook);
        else drawHelmetDecal(ctx, it.look as HelmetLook);
        return log.join('|');
      });
      expect(new Set(logs).size, slot).toBe(logs.length);
    }
  });
  it('the robot screen has 12 distinct faces and a blink', () => {
    const kettle = CATALOG.find((c) => c.id === 'sk_kettle')!.look as SkaterLook;
    const faces = new Set<string>();
    for (let f = 0; f < 12; f++) { const { ctx, log } = fakeCtx(); drawSkaterAtlas(ctx, kettle, { blink: false, robotFace: f }); faces.add(log.join('|')); }
    expect(faces.size).toBe(12);
    const juno = CATALOG.find((c) => c.id === 'sk_juno')!.look as SkaterLook;
    const open = fakeCtx(), shut = fakeCtx();
    drawSkaterAtlas(open.ctx, juno, { blink: false, robotFace: 0 });
    drawSkaterAtlas(shut.ctx, juno, { blink: true, robotFace: 0 });
    expect(open.log.join('|')).not.toBe(shut.log.join('|'));
  });
});
