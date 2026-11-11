// The Title's floating board (skater/hero.ts): the equipped look's own deck, two draw calls, rebuilt only on a change.
import { Mesh, Scene, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { itemsOfSlot } from '../../../src/content';
import type { BoardLook } from '../../../src/core/cosmetics';
import type { GfxContext } from '../../../src/core/view';
import { createHeroBoard } from '../../../src/skater';

const ctx = (): GfxContext => ({
  renderer: {} as GfxContext['renderer'], scene: new Scene(), quality: 'med', palette: () => ({}) as never,
  canvasTexture: () => new Texture(),
});
const deck = (o: { object3d: { children: unknown[] } }) => o.object3d.children[0] as Mesh;

describe('hero board', () => {
  it('builds every board look in two draw calls, under the skater budget for a board', () => {
    const h = createHeroBoard(ctx());
    for (const it of itemsOfSlot('board')) {
      h.setLook(it.look as BoardLook);
      const s = h.stats();
      expect(s.drawCalls).toBe(2);
      expect(s.tris, it.id).toBeGreaterThan(100);
      expect(s.tris, it.id).toBeLessThan(2500);
    }
  });
  it('rebuilds only when the look changes', () => {
    const h = createHeroBoard(ctx());
    const [a, b] = itemsOfSlot('board');
    h.setLook(a!.look as BoardLook);
    const g = deck(h).geometry;
    h.setLook({ ...(a!.look as BoardLook) });
    expect(deck(h).geometry).toBe(g);
    h.setLook(b!.look as BoardLook);
    expect(deck(h).geometry).not.toBe(g);
  });
});
