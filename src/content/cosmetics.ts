// content/cosmetics.ts: the cosmetic catalog (DESIGN §15). SK owns this file from W2b (all 40 items).
// M0: the three starters only, with valid look params.
import type { BoardLook, CosmeticItem, HelmetLook, Loadout, SkaterLook } from '../core/cosmetics';

const JUNO: SkaterLook = {
  kind: 'human', skin: 2, build: 'regular', heightScale: 1.0,
  hair: 'bob', hairColor: 0x2b1e1a,
  top: 'hoodie', topColors: [0xe0a93b, 0xf3e3c3], print: 'none',
  bottom: 'baggyJeans', bottomColor: 0x4c6a92,
  shoes: 'highTop', shoeColor: 0xf7f2ea,
  accessory: null, stance: 'regular', poseStyle: 'normal', fx: [],
};
const PLAIN_MAPLE: BoardLook = {
  pattern: 'plainMaple', palette: [0xd9b98c, 0xc9a27a, 0xe8c9a0], scale: 1, rot: 0, wear: 0.2,
  logo: null, grip: 0x2e2a33, wheels: 0xf3e3c3, trucks: 0xb8bcc8, finish: 'flat', wheelFx: 'none',
};
const CLASSIC: HelmetLook = {
  shell: 'dome', color: 0xf3e3c3, decal: 'none', decalColor: 0x2b2140, finish: 'matte', fx: 'none',
};

export const CATALOG: readonly CosmeticItem[] = [
  { id: 'sk_juno', slot: 'skater', name: 'Juno Park', rarity: 'common', source: 'starter', look: JUNO },
  { id: 'bd_plain_maple', slot: 'board', name: 'Plain Maple', rarity: 'common', source: 'starter', look: PLAIN_MAPLE },
  { id: 'hm_classic', slot: 'helmet', name: 'Classic Shell', rarity: 'common', source: 'starter', look: CLASSIC },
];

export const STARTERS = { skater: 'sk_juno', board: 'bd_plain_maple', helmet: 'hm_classic' } as const;
export const DEFAULT_LOADOUT: Loadout = { skater: JUNO, board: PLAIN_MAPLE, helmet: CLASSIC };
