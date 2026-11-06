// SkaterView budgets and behaviour (ROADMAP W2b acceptance; TECH §8.4, §8.5): ≤ 8 draw calls and ≤ 3.5k triangles
// (outline twins included) for every item and for the worst combination, a loadout switch ≤ 30 ms, run and showcase
// modes, and the import boundary (sim/, tricks/, world/gen/ never import content/ or skater/).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BackSide, Scene, Texture, type Mesh, type Material } from 'three';
import { describe, expect, it } from 'vitest';
import { CATALOG, DEFAULT_LOADOUT, itemsOfSlot } from '../../../src/content';
import type { Loadout } from '../../../src/core/cosmetics';
import type { ScoreState, SkaterState } from '../../../src/core/sim';
import type { GfxContext, RenderFrame, SkaterPose } from '../../../src/core/view';
import { GOLDEN } from '../../../src/gfx';
import { BUDGET, SkaterViewImpl, basePose, createSkaterView, showcasePose } from '../../../src/skater';

/** A node GfxContext: canvas textures are plain textures (no DOM); draw callbacks are not run. */
const ctx = (): GfxContext => ({
  renderer: {} as GfxContext['renderer'], scene: new Scene(), quality: 'med', palette: () => GOLDEN,
  canvasTexture: () => new Texture(),
});
const withItem = (slot: 'skater' | 'board' | 'helmet', look: Loadout[typeof slot]): Loadout => ({ ...DEFAULT_LOADOUT, [slot]: look } as Loadout);
const vp = { wCss: 390, hCss: 844, dpr: 1, aspect: 390 / 844, safeTop: 0, safeBottom: 0, coarse: true };
function frame(pose: SkaterPose, o: { s?: number; x0?: number; x1?: number; alpha?: number; events?: RenderFrame['events'] } = {}): RenderFrame {
  const st = (x: number) => ({ p: { s: o.s ?? 10, x, y: pose.height }, vel: { s: 7, x: 0, y: 0 }, tick: 1, t: 1 } as unknown as SkaterState);
  return { alpha: o.alpha ?? 1, dt: 1 / 60, timeScale: 1, prev: st(o.x0 ?? 0), cur: st(o.x1 ?? 0), pose, score: {} as ScoreState,
    events: o.events ?? [], playerS: o.s ?? 10, speed: 7, area: 'downtown', blend: null, viewport: vp };
}

describe('budgets', () => {
  it('every item: ≤ 8 draw calls and ≤ 3.5k triangles, outline twins included', () => {
    const v = new SkaterViewImpl(ctx());
    for (const it of CATALOG) {
      v.setLoadout(withItem(it.slot, it.look as never));
      const s = v.stats();
      expect(s.drawCalls, it.id).toBeLessThanOrEqual(BUDGET.drawCalls);
      expect(s.tris, it.id).toBeLessThanOrEqual(BUDGET.tris);
      expect(v.meshes().length, it.id).toBe(s.drawCalls);
    }
  });
  it('the worst combination of the heaviest skater, board and helmet stays under 3.5k triangles and 8 calls', () => {
    const v = new SkaterViewImpl(ctx());
    const worst = (slot: 'skater' | 'board' | 'helmet') => {
      let best = { tris: 0, look: DEFAULT_LOADOUT[slot] as Loadout[typeof slot] };
      for (const it of itemsOfSlot(slot)) {
        v.setLoadout(withItem(slot, it.look as never));
        const t = v.stats().parts[slot === 'skater' ? 'body' : slot];
        if (t > best.tris) best = { tris: t, look: it.look as never };
      }
      return best;
    };
    const s = worst('skater'), b = worst('board'), h = worst('helmet');
    v.setLoadout({ skater: s.look as Loadout['skater'], board: b.look as Loadout['board'], helmet: h.look as Loadout['helmet'] });
    const st = v.stats();
    // The Fishbowl shows the whole head, so the body adds its hair cap: the true worst case is this combination.
    expect(st.tris).toBeGreaterThanOrEqual(s.tris + b.tris + h.tris);
    expect(st.tris).toBeLessThanOrEqual(BUDGET.tris);
    expect(st.drawCalls).toBeLessThanOrEqual(BUDGET.drawCalls);
  });
  it('a loadout switch takes ≤ 30 ms (geometry rebuild; canvases are measured by the contact-sheet script)', () => {
    const v = new SkaterViewImpl(ctx());
    for (const it of CATALOG) v.setLoadout(withItem(it.slot, it.look as never));   // warm-up (JIT)
    const ms: number[] = [];
    for (let rep = 0; rep < 2; rep++) for (const it of CATALOG) {
      v.setLoadout(DEFAULT_LOADOUT);
      v.setLoadout(withItem(it.slot, it.look as never));
      ms.push(v.lastSwitchMs);
    }
    ms.sort((a, b) => a - b);
    expect(ms[Math.floor(ms.length * 0.95)]!).toBeLessThanOrEqual(BUDGET.switchMs);
    // Switching to the same loadout again rebuilds nothing.
    v.setLoadout(DEFAULT_LOADOUT);
    const geo = v.meshes().map((m) => m.geometry);
    v.setLoadout({ ...DEFAULT_LOADOUT });
    expect(v.meshes().map((m) => m.geometry)).toEqual(geo);
  });
});

describe('structure', () => {
  it('a rigid-skinned body with an outline twin sharing the skeleton; board and helmet on their bones', () => {
    const v = new SkaterViewImpl(ctx());
    const ms = v.meshes();
    const body = ms.find((m) => m.name === 'skater-body') as Mesh & { skeleton?: unknown; isSkinnedMesh?: boolean };
    const outline = ms.find((m) => m.name === 'skater-body-outline') as Mesh & { skeleton?: unknown };
    expect(body.isSkinnedMesh).toBe(true);
    expect(outline.skeleton).toBe(body.skeleton);
    // Rigid skinning: every vertex weighted 1.0 to exactly one bone.
    const w = body.geometry.getAttribute('skinWeight');
    for (let i = 0; i < w.count; i++) { expect(w.getX(i)).toBe(1); expect(w.getY(i) + w.getZ(i) + w.getW(i)).toBe(0); }
    // The outline draws the same buffers (shorter draw range), back faces, ink.
    expect(outline.geometry.getAttribute('position')).toBe(body.geometry.getAttribute('position'));
    for (const m of ms.filter((x) => x.name.endsWith('-outline'))) expect((m.material as Material).side).toBe(BackSide);
    expect(ms.find((m) => m.name === 'skater-board')!.parent).toBe(v.rig.bone.board);
    expect(ms.find((m) => m.name === 'skater-helmet')!.parent).toBe(v.rig.bone.helmet);
    // Shadow pass: body, board, helmet only.
    expect(ms.filter((m) => m.castShadow).length).toBe(3);
  });
  it('the Fishbowl adds its glass and orbiting goldfish (8 calls)', () => {
    const v = new SkaterViewImpl(ctx());
    v.setLoadout(withItem('helmet', CATALOG.find((c) => c.id === 'hm_fishbowl')!.look as never));
    expect(v.stats().drawCalls).toBe(8);
    expect(v.meshes().some((m) => m.name === 'helmet-glass' && (m.material as Material).transparent)).toBe(true);
  });
});

describe('run and showcase', () => {
  it('follows the interpolated sim position with origin rebasing', () => {
    const v = createSkaterView(ctx());
    v.update(frame(basePose(), { s: 600, x0: 1, x1: 2, alpha: 0.25 }));
    expect(v.object3d.position.x).toBeCloseTo(1.25, 6);
    expect(v.object3d.position.z).toBeCloseTo(-(600 - 512), 6);
  });
  it('showcase faces the menu camera, takes the turntable yaw, and previews tricks', () => {
    const v = new SkaterViewImpl(ctx());
    v.setMode('showcase');
    v.setTurntable(30);
    v.update(frame(basePose()));
    expect(v.turn.rotation.y).toBeCloseTo(((-90 + 30) * Math.PI) / 180, 6);
    // Goofy riders are turned so they still face the camera.
    v.setLoadout(withItem('skater', CATALOG.find((c) => c.id === 'sk_mika')!.look as never));
    v.update(frame(basePose()));
    expect(v.turn.rotation.y).toBeCloseTo(((-90 + 180 + 30) * Math.PI) / 180, 6);
    // The preview loop hops and lands.
    let maxHop = 0, landed = 0;
    for (let t = 0; t < 12; t += 1 / 30) { const p = showcasePose(t, t - 1 / 30); maxHop = Math.max(maxHop, p.hop); landed += p.landed; }
    expect(maxHop).toBeGreaterThan(0.2);
    expect(landed).toBe(2);
    v.setMode('run');
    v.update(frame(basePose()));
    expect(v.turn.rotation.y).toBe(0);
  });
  it('stays finite through every pose, events and long frames', () => {
    const v = new SkaterViewImpl(ctx());
    const poses: SkaterPose[] = [
      basePose({ pose: 'flip', mode: 'air', board: { roll: 720, yaw: 180, pitch: 70 } }),
      basePose({ pose: 'crash', mode: 'crashed', crash: { t: 0, seed: 1 } }),
      basePose({ pose: 'grind', mode: 'grind', grindId: 'smith' }),
      basePose({ pose: 'land', landImpulse: 1 }),
      basePose({ heading: Number.NaN }),
    ];
    for (const p of poses) for (let i = 0; i < 30; i++) {
      v.update({ ...frame(p, { events: [{ t: 'land', tick: 1, airT: 0.6, dropH: 0.5, quality: 'perfect', surface: 'asphalt' }] }), dt: i === 3 ? 5 : 1 / 60 });
      v.object3d.updateMatrixWorld(true);
      v.object3d.traverse((o) => { for (const e of o.matrixWorld.elements) expect(Number.isFinite(e)).toBe(true); });
    }
  });
});

describe('boundaries', () => {
  it('sim/, tricks/ and world/gen/ never import content/ or skater/', () => {
    const root = new URL('../../../src/', import.meta.url).pathname;
    const files: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
    for (const d of ['sim', 'tricks', 'world/gen']) walk(join(root, d));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/from\s+['"][^'"]*\/(content|skater)(\/|['"])/);
  });
});
