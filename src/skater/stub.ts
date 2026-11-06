// skater/stub.ts: M0 stand-in skater. Shows heading, carve lean, crouch, pose.board flip rotation (roll/yaw/pitch)
// and pose.spinYaw, with the loadout's main colours. Positioned with the shared origin rebasing (gfx/space.ts).
import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry } from 'three';
import { SKIN_TONES, type Loadout } from '../core/cosmetics';
import { lerp } from '../core/math';
import type { GfxContext, RenderFrame, SkaterView } from '../core/view';
import { originOf } from '../gfx';

const DEG = Math.PI / 180;
const BOARD_Y = 0.07;                     // deck centre above the board bottom (wheels + trucks)

export class StubSkaterView implements SkaterView {
  readonly object3d = new Group();
  private readonly spin = new Group();      // heading + spin yaw
  private readonly body = new Group();      // rider: lean and crouch
  private readonly board = new Group();     // deck: flip rotation
  private readonly mats = {
    top: new MeshLambertMaterial({ color: 0xe0a93b }), legs: new MeshLambertMaterial({ color: 0x4c6a92 }),
    skin: new MeshLambertMaterial({ color: 0xd9a27e }), helmet: new MeshLambertMaterial({ color: 0xf3e3c3 }),
    deck: new MeshLambertMaterial({ color: 0xd9b98c }), grip: new MeshLambertMaterial({ color: 0x2e2a33 }),
    wheels: new MeshLambertMaterial({ color: 0xf3e3c3 }),
  };
  private mode: 'run' | 'showcase' = 'run';

  constructor(ctx: GfxContext) {
    this.object3d.name = 'skater';
    const legs = new Mesh(new CapsuleGeometry(0.13, 0.55, 4, 8), this.mats.legs);
    legs.position.y = 0.48;
    const torso = new Mesh(new CapsuleGeometry(0.2, 0.32, 4, 8), this.mats.top);
    torso.position.y = 1.05;
    const head = new Mesh(new SphereGeometry(0.17, 10, 8), this.mats.skin);
    head.position.y = 1.52;
    const helmet = new Mesh(new SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.helmet);
    helmet.position.y = 1.55;
    this.body.add(legs, torso, head, helmet);
    this.body.position.y = 0.1;
    const deck = new Mesh(new BoxGeometry(0.21, 0.025, 0.8), this.mats.deck);
    const grip = new Mesh(new BoxGeometry(0.2, 0.004, 0.78), this.mats.grip);
    grip.position.y = 0.0145;
    this.board.add(deck, grip);
    for (const z of [-0.27, 0.27]) for (const x of [-0.09, 0.09]) {
      const w = new Mesh(new BoxGeometry(0.035, 0.056, 0.056), this.mats.wheels);
      w.position.set(x, -0.045, z);
      this.board.add(w);
    }
    this.board.position.y = BOARD_Y;
    this.board.rotation.order = 'YXZ';
    this.spin.add(this.body, this.board);
    this.object3d.add(this.spin);
    this.object3d.traverse((o) => { if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = false; } });
    ctx.scene.add(this.object3d);
  }

  setLoadout(l: Loadout): void {
    this.mats.top.color.setHex(l.skater.topColors[0]);
    this.mats.legs.color.setHex(l.skater.bottomColor);
    this.mats.skin.color.setHex(l.skater.kind === 'robot' ? 0xb8bcc8 : SKIN_TONES[l.skater.skin] ?? 0xd9a27e);
    this.mats.helmet.color.setHex(l.helmet.color);
    this.mats.deck.color.setHex(l.board.palette[0]);
    this.mats.grip.color.setHex(l.board.grip);
    this.mats.wheels.color.setHex(l.board.wheels);
  }

  update(f: RenderFrame): void {
    if (this.mode !== 'run') return;
    const s = f.playerS;
    const x = lerp(f.prev.p.x, f.cur.p.x, f.alpha), y = lerp(f.prev.p.y, f.cur.p.y, f.alpha);
    const p = f.pose;
    this.object3d.position.set(x, y, -(s - originOf(s)));
    this.spin.rotation.y = -p.heading + p.spinYaw * DEG;
    this.body.rotation.z = -p.lean;
    this.body.scale.y = 1 - 0.15 * p.crouch;
    this.board.rotation.set(p.board.pitch * DEG, p.board.yaw * DEG, p.board.roll * DEG);
    if (p.crash) {
      const u = Math.min(1, p.crash.t / 0.4);
      this.body.rotation.x = -u * 1.4;
      this.body.position.y = 0.1 - u * 0.2;
    } else {
      this.body.rotation.x = 0;
      this.body.position.y = 0.1;
    }
  }

  setMode(m: 'run' | 'showcase'): void { this.mode = m; }
  rebuildGPU(): void { /* plain materials: nothing to rebuild */ }
}
