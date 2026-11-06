// content/cosmetics.ts against DESIGN §15 (TECH §11.1 "content"): 40 items, ids and names exactly as the design
// tables (parsed from docs/DESIGN.md), counts per rarity, every look valid for its interface, starters and sources,
// and every item visibly distinct from the others in its slot.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BoardLook, CosmeticItem, HelmetLook, SkaterLook } from '../../../src/core/cosmetics';
import type { Rarity, Slot } from '../../../src/core/ids';
import { CATALOG, DEFAULT_LOADOUT, STARTERS, itemById, itemsOfSlot, loadoutOf } from '../../../src/content';

const DESIGN = readFileSync(new URL('../../../docs/DESIGN.md', import.meta.url), 'utf8');
const section = (from: string, to: string) => DESIGN.slice(DESIGN.indexOf(from), DESIGN.indexOf(to, DESIGN.indexOf(from)));
const rowsOf = (md: string) => md.split('\n').filter((l) => /^\| `(sk|bd|hm)_/.test(l))
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
const hexes = (s: string) => [...s.matchAll(/#([0-9A-Fa-f]{6})/g)].map((m) => parseInt(m[1]!, 16));
const RARITY: Record<string, Rarity> = { C: 'common', R: 'rare', E: 'epic', L: 'legendary' };

const SKATER_ROWS = rowsOf(section('### 15.1 Skaters', '### 15.2 Boards'));
const BOARD_ROWS = rowsOf(section('### 15.2 Boards', '### 15.3 Helmets'));
const HELMET_ROWS = rowsOf(section('### 15.3 Helmets', '**Backlog**'));
const ALL_ROWS: [Slot, string[]][] = [
  ...SKATER_ROWS.map((r) => ['skater', r] as [Slot, string[]]),
  ...BOARD_ROWS.map((r) => ['board', r] as [Slot, string[]]),
  ...HELMET_ROWS.map((r) => ['helmet', r] as [Slot, string[]]),
];
const idOf = (r: string[]) => r[0]!.replace(/`/g, '');
/** Every number in a look, flattened (colours included). */
const values = (o: unknown): number[] => typeof o === 'number' ? [o] : Array.isArray(o) ? o.flatMap(values)
  : o && typeof o === 'object' ? Object.values(o).flatMap(values) : [];

describe('catalog shape', () => {
  it('has 40 items with unique ids and names', () => {
    expect(CATALOG).toHaveLength(40);
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(40);
    expect(new Set(CATALOG.map((c) => c.name)).size).toBe(40);
  });
  it('matches DESIGN §15 counts per slot and rarity', () => {
    const want: Record<Slot, Record<Rarity, number>> = {
      skater: { common: 4, rare: 4, epic: 2, legendary: 2 },
      board: { common: 6, rare: 5, epic: 3, legendary: 2 },
      helmet: { common: 4, rare: 4, epic: 2, legendary: 2 },
    };
    for (const slot of ['skater', 'board', 'helmet'] as Slot[]) {
      for (const r of ['common', 'rare', 'epic', 'legendary'] as Rarity[]) {
        expect(CATALOG.filter((c) => c.slot === slot && c.rarity === r).length, `${slot} ${r}`).toBe(want[slot][r]);
      }
    }
  });
  it('parses all 40 rows from the design tables', () => {
    expect(SKATER_ROWS).toHaveLength(12);
    expect(BOARD_ROWS).toHaveLength(16);
    expect(HELMET_ROWS).toHaveLength(12);
  });
  it('has the ids, names, slots, rarities and order of the design tables', () => {
    expect(CATALOG.map((c) => c.id)).toEqual(ALL_ROWS.map(([, r]) => idOf(r)));
    for (const [slot, r] of ALL_ROWS) {
      const it = itemById(idOf(r))!;
      expect(it.slot).toBe(slot);
      expect(it.name).toBe(r[1]);
      expect(it.rarity).toBe(RARITY[r[2]!.charAt(0)]);
      expect(it.id.slice(0, 3)).toBe({ skater: 'sk_', board: 'bd_', helmet: 'hm_' }[slot]);
    }
  });
  it('has the right sources: three starters, Golden Hour is level30, everything else shop', () => {
    expect(CATALOG.filter((c) => c.source === 'starter').map((c) => c.id).sort())
      .toEqual(Object.values(STARTERS).slice().sort());
    expect(itemById('bd_golden_hour')!.source).toBe('level30');
    expect(CATALOG.filter((c) => c.source === 'level30')).toHaveLength(1);
    for (const [, r] of ALL_ROWS) {
      const it = itemById(idOf(r))!;
      if (/starter/.test(r[2]!)) expect(it.source).toBe('starter');
    }
    for (const id of Object.values(STARTERS)) expect(itemById(id)!.rarity).toBe('common');
  });
  it('carries the themes named in the design rows', () => {
    const theme = (r: string[]) => {
      const t = r.join(' ').match(/(Downtown|Suburbs|Docks|Neon)-themed/);
      return t ? t[1]!.toLowerCase() : undefined;
    };
    for (const [, r] of ALL_ROWS) expect(itemById(idOf(r))!.theme, idOf(r)).toBe(theme(r));
  });
  it('the default loadout is the three starters', () => {
    expect(DEFAULT_LOADOUT.skater).toBe(itemById(STARTERS.skater)!.look);
    expect(DEFAULT_LOADOUT.board).toBe(itemById(STARTERS.board)!.look);
    expect(DEFAULT_LOADOUT.helmet).toBe(itemById(STARTERS.helmet)!.look);
    expect(loadoutOf({ skater: 'sk_gus', board: 'hm_classic' })).toEqual({
      skater: itemById('sk_gus')!.look, board: DEFAULT_LOADOUT.board, helmet: DEFAULT_LOADOUT.helmet,
    });
    expect(itemsOfSlot('board')).toHaveLength(16);
  });
});

describe('looks follow the design rows', () => {
  it('skaters: skin, build, height, hair, top, print, bottom, shoes, accessory and every colour', () => {
    for (const r of SKATER_ROWS) {
      const id = idOf(r), l = itemById(id)!.look as SkaterLook;
      const [skin, build, hs] = r[3]!.split('/').map((s) => s.trim());
      if (l.kind === 'human') {
        expect(l.skin, id).toBe(Number(skin));
        expect(l.heightScale, id).toBeCloseTo(Number(hs), 5);
      } else expect(skin).toBe('robot');
      expect(l.build, id).toBe(build);
      if (l.kind === 'human') {
        expect(r[4]!.split(' ')[0], id).toBe(l.hair);
        expect(r[5]!.split(' ')[0], id).toBe(l.top);
        const print = r[5]!.split(',').map((s) => s.trim())[1] ?? 'none';
        expect(print.split(' ')[0], id).toBe(l.print);
        const bottom = r[6]!.split(' ')[0]!;
        expect(bottom === '(overalls)' || bottom === '(coveralls)' ? 'onePiece' : bottom, id).toBe(l.bottom);
        expect(r[7]!.split(' ')[0], id).toBe(l.shoes);
      }
      const acc = r[8]!.split(' ')[0];
      expect(acc === 'none' ? null : acc, id).toBe(l.accessory);
      // Every colour in the look columns (not the fx / notes column) is in the look.
      const vals = values(l);
      for (const c of hexes(r.slice(4, 9).join(' '))) expect(vals, `${id} #${c.toString(16)}`).toContain(c);
      if (r[9]!.includes('goofy')) expect(l.stance).toBe('goofy'); else expect(l.stance).toBe('regular');
      if (r[9]!.includes('upright')) expect(l.poseStyle).toBe('upright');
      for (const fx of ['reflectiveStrips', 'lightSeams', 'screenFace'] as const) {
        expect(l.fx.includes(fx), `${id} ${fx}`).toBe(r[9]!.includes(fx));
      }
    }
    expect((itemById('sk_ines')!.look as SkaterLook).printColors).toEqual([0xff8a5b, 0x7ee0b5, 0xa88beb]);
    expect((itemById('sk_aki')!.look as SkaterLook).hairTip).toBe(0x3ff2ff);
    expect((itemById('sk_gus')!.look as SkaterLook).facialHair).toBe('moustache');
    expect((itemById('sk_lark')!.look as SkaterLook).fx).toContain('coatSway');
    expect((itemById('sk_gus')!.look as SkaterLook).fx).toContain('leafTrail');
  });
  it('boards: pattern, palette and the other params', () => {
    for (const r of BOARD_ROWS) {
      const id = idOf(r), l = itemById(id)!.look as BoardLook;
      expect(l.pattern, id).toBe(r[3]);
      expect(l.palette, id).toEqual(hexes(r[4]!));
      const other = r[5]!;
      const vals = values(l);
      for (const c of hexes(other)) expect(vals, `${id} #${c.toString(16)}`).toContain(c);
      const num = (k: string) => { const m = other.match(new RegExp(`${k} ([0-9.]+)`)); return m ? Number(m[1]) : null; };
      expect(l.wear, id).toBe(num('wear') ?? 0);
      expect(l.scale, id).toBe(num('scale') ?? 1);
      expect(l.rot, id).toBe(num('rot') ?? 0);
      const wheels = other.match(/wheels `#([0-9A-F]{6})`/);
      if (wheels) expect(l.wheels, id).toBe(parseInt(wheels[1]!, 16));
      const trucks = other.match(/trucks `#([0-9A-F]{6})`/);
      expect(l.trucks, id).toBe(trucks ? parseInt(trucks[1]!, 16) : 0xb8bcc8);
      expect(l.grip, id).toBe(0x2e2a33);
      const finish = other.match(/finish `(\w+)`/);
      expect(l.finish, id).toBe(finish ? finish[1] : 'flat');
      const wfx = other.match(/wheelFx `(\w+)`/);
      expect(l.wheelFx, id).toBe(wfx ? wfx[1] : 'none');
      const logo = other.match(/logo "([^"]+)"/);
      expect(l.logo, id).toBe(logo ? logo[1] : null);
    }
    expect((itemById('bd_golden_hour')!.look as BoardLook).gripGlow).toBe(0xffd58a);
    expect((itemById('bd_glide_ring')!.look as BoardLook).animated).toBe(true);
  });
  it('helmets: shell, colour, decal and finish', () => {
    const shellOf: Record<string, HelmetLook['shell']> = {
      hm_catears: 'catEars', hm_sunflower: 'petalRing', hm_holovisor: 'wrapVisor',
    };
    for (const r of HELMET_ROWS) {
      const id = idOf(r), l = itemById(id)!.look as HelmetLook;
      const shell = shellOf[id] ?? (r[3]!.match(/novelty: (\w+)/)?.[1] ?? r[3]!.split(' ')[0]);
      expect(l.shell, id).toBe(shell);
      expect(l.color, id).toBe(hexes(r[4]!)[0]);
      const vals = values(l);
      for (const c of hexes(r[5]!)) expect(vals, `${id} #${c.toString(16)}`).toContain(c);
      const finish = r[6]!.match(/^(matte|gloss|chrome|emissive)/);
      if (finish) expect(l.finish, id).toBe(finish[1]);           // Sunflower's row names no finish (matte)
      if (/^novelty|^dome|^visor|^bucket|^retro/.test(r[3]!)) expect(SHELL).toContain(l.shell);
    }
    expect((itemById('hm_fishbowl')!.look as HelmetLook).opacity).toBe(0.35);
    expect((itemById('hm_visorpro')!.look as HelmetLook).visorTint).toBe(0x8a5cff);
  });
});

// ── Interface validation (TECH §4.7 unions and ranges) ──────────────────────────────────────────────────────────
const HAIR = ['none', 'bob', 'longStraight', 'curlyMop', 'afroPuff', 'buzz', 'twinBuns', 'topBun', 'ponytail', 'spikes', 'shortGrey', 'mohawk'];
const TOP = ['tee', 'hoodie', 'longSleeve', 'jacket', 'varsity', 'raincoat', 'overalls', 'trackJacket', 'coveralls', 'courierJacket', 'cardigan', 'robot'];
const PRINT = ['none', 'stripe', 'pocket', 'chestLogo', 'crestRD', 'paintDots', 'sunsetStripe'];
const BOTTOM = ['baggyJeans', 'slimJeans', 'cargoShorts', 'shorts', 'chinos', 'trackPants', 'slacks', 'onePiece', 'robot'];
const SHOE = ['lowTop', 'highTop', 'chunky', 'rainBoots', 'workBoots', 'robot'];
const ACC = ['tallSocks', 'tubeSocks', 'wristband', 'headphones', 'beanie', 'backpack', 'antenna'];
const SFX = ['reflectiveStrips', 'lightSeams', 'leafTrail', 'screenFace', 'coatSway'];
const PATTERN = ['plainMaple', 'stripes', 'chevrons', 'checker', 'halftoneSun', 'palms', 'waveLines', 'polka', 'gradientFade',
  'stickerBomb', 'topo', 'neonGrid', 'retroSun', 'brick', 'cassette', 'corrugated', 'koi', 'streetMap', 'lanterns', 'goldLeaf'];
const SHELL = ['dome', 'visor', 'bucket', 'retro', 'hardHat', 'lantern', 'bubble', 'catEars', 'petalRing', 'wrapVisor'];
const DECAL = ['none', 'stickers', 'stripe', 'scuffs', 'plaid', 'innerEars', 'ribs', 'fish', 'petals', 'glyphScroll'];
const isHex = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 0xffffff;
const KEYS = {
  skater: ['kind', 'skin', 'build', 'heightScale', 'hair', 'hairColor', 'hairTip', 'facialHair', 'top', 'topColors', 'print',
    'printColors', 'bottom', 'bottomColor', 'shoes', 'shoeColor', 'accessory', 'accessoryColor', 'stance', 'poseStyle', 'fx'],
  board: ['pattern', 'palette', 'scale', 'rot', 'wear', 'logo', 'grip', 'wheels', 'trucks', 'finish', 'wheelFx', 'fxColor', 'gripGlow', 'animated'],
  helmet: ['shell', 'color', 'decal', 'decalColor', 'finish', 'visorTint', 'opacity', 'fx'],
};

function validate(c: CosmeticItem): void {
  const id = c.id;
  for (const k of Object.keys(c.look)) expect(KEYS[c.slot], `${id}: unknown key ${k}`).toContain(k);
  if (c.slot === 'skater') {
    const l = c.look as SkaterLook;
    expect(['human', 'robot']).toContain(l.kind);
    expect(Number.isInteger(l.skin) && l.skin >= 0 && l.skin <= 7, id).toBe(true);
    expect(['slim', 'regular', 'stocky']).toContain(l.build);
    expect(l.heightScale >= 0.92 && l.heightScale <= 1.08, id).toBe(true);
    expect(HAIR).toContain(l.hair); expect(isHex(l.hairColor)).toBe(true);
    if (l.hairTip !== undefined) expect(isHex(l.hairTip)).toBe(true);
    if (l.facialHair !== undefined) expect(l.facialHair).toBe('moustache');
    expect(TOP).toContain(l.top); expect(l.topColors.length).toBe(2); expect(l.topColors.every(isHex)).toBe(true);
    expect(PRINT).toContain(l.print);
    if (l.printColors) expect(l.printColors.every(isHex)).toBe(true);
    expect(BOTTOM).toContain(l.bottom); expect(isHex(l.bottomColor)).toBe(true);
    expect(SHOE).toContain(l.shoes); expect(isHex(l.shoeColor)).toBe(true);
    if (l.accessory !== null) { expect(ACC).toContain(l.accessory); expect(isHex(l.accessoryColor), id).toBe(true); }
    expect(['regular', 'goofy']).toContain(l.stance); expect(['normal', 'upright']).toContain(l.poseStyle);
    for (const f of l.fx) expect(SFX).toContain(f);
    // Robot parts only on the robot.
    expect(l.top === 'robot' || l.bottom === 'robot' || l.shoes === 'robot', id).toBe(l.kind === 'robot');
    if (l.top === 'overalls' || l.top === 'coveralls') expect(l.bottom, id).toBe('onePiece');
  } else if (c.slot === 'board') {
    const l = c.look as BoardLook;
    expect(PATTERN).toContain(l.pattern);
    expect(l.palette.length).toBe(3); expect(l.palette.every(isHex)).toBe(true);
    expect(l.scale >= 0.5 && l.scale <= 2, id).toBe(true);
    expect([0, 45, 90]).toContain(l.rot);
    expect(l.wear >= 0 && l.wear <= 1, id).toBe(true);
    expect(l.logo === null || (typeof l.logo === 'string' && l.logo.length > 0 && l.logo.length <= 16)).toBe(true);
    for (const k of ['grip', 'wheels', 'trucks'] as const) expect(isHex(l[k]), `${id} ${k}`).toBe(true);
    expect(['flat', 'holo', 'animHue', 'goldLeaf', 'emissive']).toContain(l.finish);
    expect(['none', 'lightTrail', 'hoverRing']).toContain(l.wheelFx);
    if (l.wheelFx !== 'none') expect(isHex(l.fxColor), id).toBe(true);
    if (l.gripGlow !== undefined) expect(isHex(l.gripGlow)).toBe(true);
  } else {
    const l = c.look as HelmetLook;
    expect(SHELL).toContain(l.shell); expect(isHex(l.color)).toBe(true);
    expect(DECAL).toContain(l.decal); expect(isHex(l.decalColor)).toBe(true);
    expect(['matte', 'gloss', 'chrome', 'emissive']).toContain(l.finish);
    if (l.visorTint !== undefined) expect(isHex(l.visorTint)).toBe(true);
    if (l.opacity !== undefined) expect(l.opacity > 0 && l.opacity <= 1, id).toBe(true);
    expect(['none', 'emissiveDusk', 'orbitFish', 'petalShed', 'glyphTrail', 'earFlick']).toContain(l.fx);
  }
}

describe('look validation', () => {
  it('every look validates against its interface', () => { for (const c of CATALOG) validate(c); });
  it('the catalog is frozen', () => {
    expect(Object.isFrozen(CATALOG)).toBe(true);
    expect(Object.isFrozen(CATALOG[0])).toBe(true);
  });
  it('every item is distinct within its slot', () => {
    for (const slot of ['skater', 'board', 'helmet'] as Slot[]) {
      const looks = itemsOfSlot(slot).map((c) => JSON.stringify(c.look));
      expect(new Set(looks).size, slot).toBe(looks.length);
    }
    // Boards: one pattern each. Skaters: distinct (top, top colour). Helmets: distinct (shell, colour, decal).
    expect(new Set(itemsOfSlot('board').map((c) => (c.look as BoardLook).pattern)).size).toBe(16);
    expect(new Set(itemsOfSlot('skater').map((c) => { const l = c.look as SkaterLook; return `${l.top}:${l.topColors[0]}`; })).size).toBe(12);
    expect(new Set(itemsOfSlot('helmet').map((c) => { const l = c.look as HelmetLook; return `${l.shell}:${l.color}:${l.decal}`; })).size).toBe(12);
  });
});
