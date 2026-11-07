// game/titleBoard.ts: the Title's floating board follows the equipped board (Locker equips, a crate reveal's "Equip",
// a restored backup): a per-frame id compare, so nothing allocates until the id changes.
import type { BoardLook } from '../core/cosmetics';

/** Returns the per-frame sync: true when it pushed a new look to `hero`. */
export function boardFollower(equippedId: () => string, look: () => BoardLook, hero: { setLook(l: BoardLook): void }): () => boolean {
  let shown: string | null = null;
  return () => {
    const id = equippedId();
    if (id === shown) return false;
    shown = id;
    hero.setLook(look());
    return true;
  };
}
