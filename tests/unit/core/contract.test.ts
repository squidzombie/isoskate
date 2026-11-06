// Compile-time check that every module factory keeps its frozen TECH §4.13 signature (checked by `npm run typecheck`;
// type-only imports, so nothing here touches the DOM or WebGL at runtime).
import { expect, it } from 'vitest';
import type { AudioEngine } from '../../../src/core/audio';
import type { CosmeticItem } from '../../../src/core/cosmetics';
import type { GestureRecognizer, InputSource, RecognizerConfig } from '../../../src/core/input';
import type { AreaId, QualityTier } from '../../../src/core/ids';
import type { MetaApi } from '../../../src/core/meta';
import type { Analytics, Haptics, MonetizationProvider } from '../../../src/core/platform';
import type { SaveStore } from '../../../src/core/save';
import type { Sim, SimDeps } from '../../../src/core/sim';
import type { TrickTables } from '../../../src/core/tricks';
import type { UiApi } from '../../../src/core/ui';
import type { CameraRig, GfxContext, SkaterView, Vfx, WorldView } from '../../../src/core/view';
import type { WorldGen, WorldGenConfig, WorldQuery } from '../../../src/core/world';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Gen = typeof import('../../../src/world/gen');
type Render = typeof import('../../../src/world/render');

export const FACTORY_SIGNATURES: [
  Equals<Gen['createWorldGen'], (cfg: WorldGenConfig) => WorldGen>,
  Equals<Gen['createWorldQuery'], (gen: WorldGen) => WorldQuery>,
  Equals<typeof import('../../../src/sim')['createSim'], (tables: TrickTables, deps?: SimDeps) => Sim>,
  Equals<typeof import('../../../src/tricks')['TRICKS'], TrickTables>,
  Equals<typeof import('../../../src/input')['createInput'], (el: HTMLElement, opts: { screenW: () => number; safeBottom: () => number }) => InputSource>,
  Equals<typeof import('../../../src/input')['createRecognizer'], (cfg?: Partial<RecognizerConfig>) => GestureRecognizer>,
  Equals<typeof import('../../../src/gfx')['createGfx'], (canvas: HTMLCanvasElement, q: QualityTier) => GfxContext>,
  Equals<Render['createWorldView'], (ctx: GfxContext) => WorldView>,
  Equals<Render['createCameraRig'], () => CameraRig>,
  Equals<typeof import('../../../src/vfx')['createVfx'], (ctx: GfxContext) => Vfx>,
  Equals<typeof import('../../../src/skater')['createSkaterView'], (ctx: GfxContext) => SkaterView>,
  Equals<typeof import('../../../src/content')['CATALOG'], readonly CosmeticItem[]>,
  Equals<typeof import('../../../src/save')['createSaveStore'], () => SaveStore>,
  Equals<typeof import('../../../src/meta')['createMeta'], (save: SaveStore, catalog: readonly CosmeticItem[]) => MetaApi>,
  Equals<typeof import('../../../src/meta')['createAnalytics'], (save: SaveStore) => Analytics>,
  Equals<typeof import('../../../src/audio')['createAudio'], () => AudioEngine>,
  Equals<typeof import('../../../src/ui')['createUi'], (root: HTMLElement) => UiApi>,
  Equals<typeof import('../../../src/platform')['createMonetization'], (flags: { fakeAds: boolean }) => MonetizationProvider>,
  Equals<typeof import('../../../src/platform')['createHaptics'], () => Haptics>,
  Equals<typeof import('../../../src/debug')['installDebugApi'], (deps: object) => void>,
] = [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true];

/** Hooks added at m0-core (TECH §4.13 / §11.4) that game/wiring.ts relies on. */
export const HOOK_SIGNATURES: [
  Equals<typeof import('../../../src/audio')['renderOffline'], (area: AreaId, sec: number) => Promise<AudioBuffer | null>>,
] = [true];

it('factory signatures match TECH §4.13 (enforced by tsc)', () => {
  expect(FACTORY_SIGNATURES.every(Boolean)).toBe(true);
  expect(HOOK_SIGNATURES.every(Boolean)).toBe(true);
});
