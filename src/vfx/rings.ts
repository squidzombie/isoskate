// vfx/rings.ts: world-space rings on the ground (DESIGN §18.8): the bank-timer arc around the board's contact shadow
// (cream → coral as it shrinks, pulsing in its last 0.25 s; it shows the time until the combo banks, §13.2) and the
// golden Perfect ring (0.25 s). Flat triangle strips rebuilt in place (no allocation per frame).
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial } from 'three';
import { VFX } from './vfx.config';

const SEG = VFX.bankArc.segments;

function ringGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
  const idx: number[] = [];
  for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx);
  return g;
}
/** Writes an arc of `frac` (0..1) of a ring (inner r0, outer r1), starting at 12 o'clock, clockwise seen from above. */
function writeArc(g: BufferGeometry, r0: number, r1: number, frac: number): void {
  const pos = g.getAttribute('position') as BufferAttribute;
  const a = pos.array as Float32Array;
  const n = Math.max(1, Math.round(SEG * Math.min(1, Math.max(0, frac))));
  for (let i = 0; i <= SEG; i++) {
    const t = Math.min(i, n) / SEG * Math.PI * 2 * (frac >= 1 ? 1 : 1);
    const ang = -Math.PI / 2 + (Math.min(i, n) / SEG) * Math.PI * 2;
    void t;
    const c = Math.cos(ang), s = Math.sin(ang);
    a[i * 6] = c * r0; a[i * 6 + 1] = 0; a[i * 6 + 2] = s * r0;
    a[i * 6 + 3] = c * r1; a[i * 6 + 4] = 0; a[i * 6 + 5] = s * r1;
  }
  pos.needsUpdate = true;
  g.setDrawRange(0, n * 6);
}

export class Rings {
  readonly arc: Mesh;
  readonly perfect: Mesh;
  private readonly arcMat = new MeshBasicMaterial({ color: VFX.bankArc.cream, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide, toneMapped: false });
  private readonly perfMat = new MeshBasicMaterial({ color: VFX.perfectRing.color, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide,
    blending: AdditiveBlending, toneMapped: false });
  private readonly cream = new Color(VFX.bankArc.cream);
  private readonly coral = new Color(VFX.bankArc.coral);
  private norm = 0;
  private lastBank = 0;
  private perfT = -1;
  private time = 0;

  constructor() {
    this.arc = new Mesh(ringGeometry(), this.arcMat);
    this.arc.name = 'bankArc'; this.arc.frustumCulled = false; this.arc.renderOrder = 4; this.arc.visible = false;
    this.perfect = new Mesh(ringGeometry(), this.perfMat);
    this.perfect.name = 'perfectRing'; this.perfect.frustumCulled = false; this.perfect.renderOrder = 4; this.perfect.visible = false;
    writeArc(this.perfect.geometry, 0.9, 1.0, 1);
  }

  /** Bank-timer arc at the board's ground point. bankIn ≤ 0 or no combo hides it. */
  updateArc(active: boolean, bankIn: number, x: number, y: number, z: number, dt: number): void {
    this.time += dt;
    if (!active || bankIn <= 0) { this.arc.visible = false; this.norm = 0; this.lastBank = 0; return; }
    if (bankIn > this.lastBank + 1e-3 || this.norm <= 0) this.norm = Math.max(bankIn, 0.3);
    this.lastBank = bankIn;
    const frac = Math.min(1, bankIn / this.norm);
    const { r, width, pulseLast } = VFX.bankArc;
    const pulse = bankIn < pulseLast ? 0.5 + 0.5 * Math.sin(this.time * Math.PI * 16) : 0;
    writeArc(this.arc.geometry, r - width / 2, r + width / 2 + pulse * 0.03, frac);
    this.arcMat.color.copy(this.cream).lerp(this.coral, 1 - frac);
    this.arcMat.opacity = 0.85 + 0.15 * pulse;
    this.arc.position.set(x, y + 0.02, z);
    this.arc.visible = true;
  }

  triggerPerfect(): void { this.perfT = 0; }
  updatePerfect(x: number, y: number, z: number, dt: number): void {
    if (this.perfT < 0) { this.perfect.visible = false; return; }
    this.perfT += dt;
    const u = this.perfT / VFX.perfectRing.life;
    if (u >= 1) { this.perfT = -1; this.perfect.visible = false; return; }
    const r = VFX.perfectRing.r0 + (VFX.perfectRing.r1 - VFX.perfectRing.r0) * u;
    this.perfect.scale.setScalar(r);
    this.perfMat.opacity = 0.9 * (1 - u);
    this.perfect.position.set(x, y + 0.025, z);
    this.perfect.visible = true;
  }

  clear(): void { this.arc.visible = false; this.perfect.visible = false; this.perfT = -1; this.norm = 0; this.lastBank = 0; }
  dispose(): void { this.arc.geometry.dispose(); this.perfect.geometry.dispose(); this.arcMat.dispose(); this.perfMat.dispose(); }
}
