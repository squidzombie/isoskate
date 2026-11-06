// vfx/: particles, rings and speed lines (WA). Public surface (TECH §4.13).
// M0 stub: no-op. TODO(WA): DESIGN §18.8 effects in one pooled additive InstancedMesh (≤ 300).
import type { QualityTier } from '../core/ids';
import type { GfxContext, RenderFrame, Vfx } from '../core/view';

export function createVfx(_ctx: GfxContext): Vfx {
  return {
    update(_f: RenderFrame) { /* no-op */ },
    setQuality(_q: QualityTier) { /* no-op */ },
    clear() { /* no-op */ },
  };
}
