// skater/body.ts: the rider's rigid-skinned geometry, built per SkaterLook from procedural parts (DESIGN §18.5:
// head sphere 10×8, limbs as tapered 6-sided tubes; hair, tops, bottoms, shoes and accessories from §15.1).
// Every part is authored in its bone's local frame (rest = identity, limbs hang along −y, the body faces +x).
import { CylinderGeometry } from 'three';
import type { Hex, SkaterLook } from '../core/cosmetics';
import { SKIN_TONES } from '../core/cosmetics';
import { ball, boxAt, mix, PartBuilder, place, shade, shell, spike, tube, tubeY, type PartOpts, type UvMap } from './parts';
import { BONE_INDEX as B, type RigDims } from './rig';
import { BODY } from './skater.config';
import { ATLAS } from './textures';

const WHITE: UvMap = { kind: 'solid', u: ATLAS.white.u, v: ATLAS.white.v };
const TORSO_UV: UvMap = { kind: 'cyl', rect: ATLAS.torso.uv };
const LEGS_UV: UvMap = { kind: 'cyl', rect: ATLAS.legs.uv };
const SLEEVE_UV: UvMap = { kind: 'cyl', rect: ATLAS.sleeves.uv };
const DEG = Math.PI / 180;

/** Options that depend on the rest of the loadout. */
export interface BodyOptions {
  /** The helmet shows the whole head (Fishbowl): hair gets its top cap. */
  headVisible: boolean;
}

/** Builds the body geometry for a look. Returns the filled builder (call build()). */
export function buildBody(look: SkaterLook, d: RigDims, opt: BodyOptions): PartBuilder {
  const pb = new PartBuilder(true, WHITE);
  const robot = look.kind === 'robot';
  const skin: Hex = robot ? 0xb8bcc8 : SKIN_TONES[look.skin] ?? SKIN_TONES[2]!;
  const w = d.w;
  const [top, top2] = look.topColors;
  const add = (g: Parameters<PartBuilder['add']>[0], o: PartOpts, m?: Parameters<PartBuilder['add']>[2]) => pb.add(g, o, m);
  const seams = look.fx.includes('lightSeams'), strips = look.fx.includes('reflectiveStrips');

  // ── head, face, neck ──────────────────────────────────────────────────────────────────────────────────────
  const hc = d.headUp;                                    // head sphere centre above the head bone
  add(ball(d.headR, 10, 8), {
    color: 0xffffff, bone: B.head,
    uv: { kind: 'front', rect: ATLAS.face.uv, r: d.headR, back: ATLAS.face.back },
  }, place(0, hc, 0, 0, 0, 0, 1, robot ? 0.94 : 1, 1));
  if (!robot) add(boxAt(-0.02, -0.025, -0.022, 0.035, 0.02, 0.022), { color: shade(skin, 0.96), bone: B.head, outline: 0 }, place(d.headR - 0.01, hc - 0.005, 0));
  add(tubeY(0.052, 0.048, -0.01, d.neck + 0.03, 6, true), { color: robot ? 0x8a8fa0 : skin, bone: B.neck });
  if (robot) add(tubeY(0.062, 0.062, 0.01, 0.03, 6, true), { color: top, bone: B.neck, outline: 0 });

  // ── torso: pelvis (hips), belly (spine), chest (chest) ────────────────────────────────────────────────────
  const topKind = look.top;
  const coat = topKind === 'raincoat', tee = topKind === 'tee', over = topKind === 'overalls';
  const onePiece = look.bottom === 'onePiece';
  const wide = coat ? 1.2 : tee ? 1.1 : topKind === 'varsity' || topKind === 'jacket' || topKind === 'coveralls' ? 1.05 : 1;
  const R = BODY.torsoR, dep = BODY.torsoDepth;
  const pelvisColor = onePiece ? look.bottomColor : robot ? 0x8a8fa0 : look.bottomColor;
  // Pelvis (pants top).
  add(tubeY(R.hips * w * 1.02, R.hips * w * 0.98, -0.085, 0.07, 8), { color: pelvisColor, bone: B.hips }, place(0, 0, 0, 0, 0, 0, dep, 1, 1));
  // Belly and chest carry the top's print (textured: white vertices, colour from the atlas).
  const textured = (o: Omit<PartOpts, 'color'>): PartOpts => ({ color: 0xffffff, ...o });
  if (robot) {
    add(tubeY(0.085, 0.09, -0.04, 0.2, 8), { color: 0xb8bcc8, bone: B.spine }, place(0, 0, 0, 0, 0, 0, 0.8, 1, 1));
    add(boxAt(-0.12, -0.05, -0.18 * w, 0.12, 0.2, 0.18 * w), textured({ bone: B.chest, uv: { kind: 'cyl', rect: ATLAS.torso.uv } }));
    add(ball(0.065, 6, 4), { color: top, bone: B.shoulderL, outline: 0.6 });
    add(ball(0.065, 6, 4), { color: top, bone: B.shoulderR, outline: 0.6 });
  } else {
    const hemDrop = tee ? 0.05 : coat ? 0.02 : 0;
    add(tubeY(R.waist * w * wide, R.waist * w * wide * 1.02, -0.05 - hemDrop, 0.2, 8), textured({ bone: B.spine, uv: TORSO_UV }), place(0, 0, 0, 0, 0, 0, dep, 1, 1));
    add(tubeY(R.waist * w * wide * 1.02, R.chest * w * wide, -0.06, 0.16, 8), textured({ bone: B.chest, uv: TORSO_UV }), place(0, 0, 0, 0, 0, 0, dep * 1.02, 1, 1));
    // Shoulder caps (deltoids) in the sleeve colour.
    const sleeve = topKind === 'varsity' ? top2 : over ? top2 : top;
    for (const bn of [B.shoulderL, B.shoulderR]) add(ball(0.066 * w * (coat ? 1.15 : 1), 6, 4), { color: sleeve, bone: bn, outline: 0.7 }, place(0, -0.015, 0));
  }

  // Top-specific geometry.
  switch (topKind) {
    case 'hoodie': {
      add(ball(0.12, 6, 4), { color: shade(top, 0.92), bone: B.chest }, place(-0.1, 0.17, 0, 0, 0, 0, 0.8, 0.75, 1.15));
      for (const s of [-1, 1]) add(boxAt(-0.006, -0.08, -0.006, 0.006, 0, 0.006), { color: top2, bone: B.chest, outline: 0 }, place(0.105, 0.13, s * 0.035));
      break;
    }
    case 'raincoat': {
      add(ball(0.15, 6, 4), { color: shade(top, 0.95), bone: B.chest }, place(-0.12, 0.19, 0, 0, 0, 0, 0.75, 0.75, 1.2));
      // The huge coat's flared skirt hangs from the hem bone (it sways on landings).
      add(tubeY(R.hips * w * 1.18, R.hips * w * 1.62, -0.36, 0.04, 8, true), { color: top, bone: B.hem }, place(0, 0, 0, 0, 0, 0, 0.78, 1, 1));
      add(tubeY(R.hips * w * 1.6, R.hips * w * 1.64, -0.37, -0.33, 8, true), { color: top2, bone: B.hem, outline: 0 }, place(0, 0, 0, 0, 0, 0, 0.79, 1, 1));
      break;
    }
    case 'overalls': {
      // The bib in front of the tee, straps over the shoulders.
      add(boxAt(0.07, -0.08, -0.1 * w, 0.115, 0.1, 0.1 * w), { color: top, bone: B.chest }, undefined);
      for (const s of [-1, 1]) add(boxAt(-0.11, 0.06, -0.018, 0.11, 0.185, 0.018), { color: top, bone: B.chest, outline: 0 }, place(0, 0, s * 0.085 * w));
      break;
    }
    case 'coveralls': {
      add(tubeY(0.08, 0.075, 0.0, 0.05, 6, true), { color: top2, bone: B.neck, outline: 0 }, place(0, -0.005, 0, 0, 0, 0, 1.2, 1, 1.2));
      if (strips) {
        add(tubeY(R.chest * w * 1.07, R.chest * w * 1.07, 0.02, 0.06, 8, true), { color: 0xe8e4dc, bone: B.chest, outline: 0, emit: [1, 0] }, place(0, 0, 0, 0, 0, 0, dep * 1.05, 1, 1));
      }
      break;
    }
    case 'courierJacket': {
      add(tubeY(0.075, 0.07, -0.01, 0.045, 6, true), { color: shade(top, 1.3), bone: B.neck, outline: 0 });
      if (seams) for (const s of [-1, 1]) {
        add(boxAt(-0.008, -0.27, -0.006, 0.008, 0.16, 0.006), { color: top2, bone: B.chest, outline: 0, emit: [0, 1] }, place(0, 0, s * R.chest * w * 1.01));
      }
      break;
    }
    case 'jacket': case 'varsity': case 'trackJacket': case 'cardigan': {
      const collar = topKind === 'varsity' ? top : topKind === 'cardigan' ? top2 : shade(top, topKind === 'jacket' ? 0.85 : 1.1);
      add(tubeY(0.08, 0.072, -0.015, 0.04, 6, true), { color: collar, bone: B.neck, outline: 0 }, place(0, 0, 0, 0, 0, 0, 1.15, 1, 1.2));
      if (topKind === 'jacket') add(boxAt(0.06, 0.08, -0.05, 0.11, 0.15, 0.05), { color: top2, bone: B.chest, outline: 0 });   // tee at the open collar
      break;
    }
    default: break;
  }

  // ── arms ──────────────────────────────────────────────────────────────────────────────────────────────────
  const short = tee || over;                                   // short sleeves (the overalls' tee too)
  const sleeveColor = topKind === 'varsity' ? top2 : over ? top2 : top;
  const sleeveTextured = !robot && (look.print === 'stripe' || topKind === 'trackJacket' || topKind === 'varsity');
  const aw = w * (coat ? 1.2 : tee ? 1.08 : 1);
  for (const [sh, el, hd, side] of [[B.shoulderL, B.elbowL, B.handL, -1], [B.shoulderR, B.elbowR, B.handR, 1]] as const) {
    const ra = BODY.limbR.upperArm * aw, rf = BODY.limbR.foreArm * aw;
    if (robot) {
      add(tube(0.034, 0.032, d.upperArm, 6), { color: 0xb8bcc8, bone: sh });
      add(ball(0.045, 6, 4), { color: top, bone: el, outline: 0.6 });
      add(tube(0.032, 0.03, d.foreArm, 6), { color: 0xb8bcc8, bone: el });
      add(boxAt(-0.04, -0.09, -0.03, 0.04, 0, 0.03), { color: 0x8a8fa0, bone: hd });
      continue;
    }
    if (short) {
      add(tube(ra * 1.22, ra * 1.18, d.upperArm * 0.55, 6), { color: sleeveColor, bone: sh });
      add(tube(ra * 0.82, rf * 0.9, d.upperArm * 0.62, 6), { color: skin, bone: sh }, place(0, -d.upperArm * 0.4, 0));
      add(tube(rf * 0.9, rf * 0.78, d.foreArm, 6), { color: skin, bone: el });
    } else {
      add(tube(ra, ra * 0.92, d.upperArm + 0.02, 6), sleeveTextured ? textured({ bone: sh, uv: SLEEVE_UV }) : { color: sleeveColor, bone: sh });
      add(tube(rf * 1.02, rf * 0.94, d.foreArm - 0.02, 6), sleeveTextured ? textured({ bone: el, uv: SLEEVE_UV }) : { color: sleeveColor, bone: el });
      // Cuffs in the secondary colour (ribbed knit, rain toggles, jacket cuffs).
      const cuff = topKind === 'varsity' ? top : topKind === 'longSleeve' ? top : topKind === 'coveralls' ? top2 : top2;
      add(tube(rf * 1.06, rf * 1.04, 0.04, 6, true), { color: topKind === 'hoodie' || topKind === 'longSleeve' ? shade(top, 0.85) : cuff, bone: el, outline: 0 }, place(0, -d.foreArm + 0.05, 0));
      if (strips) add(tube(ra * 1.08, ra * 1.06, 0.04, 6, true), { color: 0xe8e4dc, bone: sh, outline: 0, emit: [1, 0] }, place(0, -0.12, 0));
      if (seams) add(boxAt(-0.006, -d.upperArm, -0.006, 0.006, 0, 0.006), { color: top2, bone: sh, outline: 0, emit: [0, 1] }, place(0, 0, side * ra * 0.98));
      if (topKind === 'trackJacket') add(boxAt(-0.006, -d.foreArm, -0.006, 0.006, 0, 0.006), { color: top2, bone: el, outline: 0 }, place(0, 0, side * rf));
    }
    // Hands (mittens).
    add(boxAt(-0.035, -0.085, -0.026, 0.04, 0.005, 0.026), { color: skin, bone: hd }, place(0, -0.005, 0, 0, 0, 6));
    if (look.accessory === 'wristband' && side === -1) add(tube(rf * 1.12, rf * 1.12, 0.035, 6, true), { color: look.accessoryColor ?? 0xff5e6c, bone: el, outline: 0 }, place(0, -d.foreArm + 0.035, 0));
  }

  // ── legs ──────────────────────────────────────────────────────────────────────────────────────────────────
  const bot = look.bottom;
  const legR = { baggyJeans: [1.22, 1.3], slimJeans: [0.98, 0.9], cargoShorts: [1.22, 1], shorts: [1.12, 1], chinos: [1.2, 1.25],
    trackPants: [1.05, 1.0], slacks: [1.05, 1.05], onePiece: [1.12, 1.12], robot: [0.85, 0.85] }[bot] ?? [1, 1];
  const shortLen = bot === 'cargoShorts' ? 0.78 : bot === 'shorts' ? 0.58 : 0;   // fraction of the thigh covered
  const legPrinted = look.print === 'paintDots' || bot === 'trackPants' || bot === 'baggyJeans' || bot === 'slimJeans';
  const legOpts = (bone: number): PartOpts => legPrinted ? textured({ bone, uv: LEGS_UV }) : { color: look.bottomColor, bone };
  const rt = BODY.limbR.thigh * w, rs = BODY.limbR.shin * w;
  for (const [hip, knee, ankle] of [[B.hipL, B.kneeL, B.ankleL], [B.hipR, B.kneeR, B.ankleR]] as const) {
    if (robot) {
      add(tube(0.062, 0.055, d.thigh, 6), { color: look.bottomColor, bone: hip });
      add(ball(0.055, 6, 4), { color: 0xb8bcc8, bone: knee, outline: 0.6 });
      add(tube(0.05, 0.045, d.shin, 6), { color: look.bottomColor, bone: knee });
    } else if (shortLen > 0) {
      add(tube(rt * legR[0]!, rt * legR[1]!, d.thigh * shortLen + 0.02, 6), legOpts(hip));
      if (bot === 'cargoShorts') add(boxAt(-0.035, -0.06, -0.012, 0.035, 0, 0.012), { color: shade(look.bottomColor, 0.88), bone: hip, outline: 0 }, place(0, -d.thigh * 0.42, (hip === B.hipL ? -1 : 1) * rt * 1.22));
      add(tube(rt * 0.72, rs * 0.95, d.thigh * (1 - shortLen) + 0.04, 6), { color: skin, bone: hip }, place(0, -d.thigh * shortLen + 0.02, 0));
      add(tube(rs * 0.95, rs * 0.72, d.shin + 0.01, 6), { color: skin, bone: knee });
    } else {
      const crop = bot === 'slacks' ? 0.8 : 1;            // Gus's slacks are ankle-cropped (tube socks show)
      add(tube(rt * legR[0]!, rt * legR[1]! * 0.98, d.thigh + 0.03, 6), legOpts(hip));
      add(tube(rs * legR[1]! * 1.08, rs * legR[1]! * (bot === 'baggyJeans' || bot === 'chinos' ? 1.18 : 0.98), d.shin * crop, 6), legOpts(knee));
      if (crop < 1) add(tube(rs * 0.78, rs * 0.74, d.shin * (1 - crop) + 0.03, 6), { color: skin, bone: knee }, place(0, -d.shin * crop + 0.02, 0));
      if (bot === 'baggyJeans' || bot === 'chinos') add(tube(rs * legR[1]! * 1.22, rs * legR[1]! * 1.24, 0.05, 6, true), { color: shade(look.bottomColor, 0.9), bone: knee, outline: 0 }, place(0, -d.shin + 0.06, 0));
    }
    // Socks.
    if (look.accessory === 'tallSocks' || look.accessory === 'tubeSocks') {
      const sc = look.accessoryColor ?? 0xffffff, tubeS = look.accessory === 'tubeSocks';
      const len = tubeS ? 0.12 : 0.17;
      add(tube(rs * 0.82, rs * 0.78, len, 6, true), {
        color: sc, bone: knee, outline: 0,
        colorAt: tubeS ? (p) => (p.y > -0.03 && p.y < -0.012) || (p.y > -0.055 && p.y < -0.042) ? top : null : undefined,
      }, place(0, -d.shin + len, 0));
    }
    if (strips && !robot) add(tube(rs * legR[1]! * 1.14, rs * legR[1]! * 1.12, 0.045, 6, true), { color: 0xe8e4dc, bone: knee, outline: 0, emit: [1, 0] }, place(0, -0.16, 0));
    // Shoes.
    shoe(pb, look, ankle, knee, d);
  }

  // ── accessories ───────────────────────────────────────────────────────────────────────────────────────────
  const acc = look.accessory, ac = look.accessoryColor ?? 0xff8a5b;
  if (acc === 'headphones') {
    for (const s of [-1, 1]) add(tubeY(0.045, 0.045, -0.03, 0.03, 6), { color: ac, bone: B.neck, outline: 0.6 }, place(0.03, 0.0, s * 0.09, 90, 0, 0));
    add(boxAt(-0.1, -0.012, -0.095, -0.05, 0.012, 0.095), { color: shade(ac, 0.6), bone: B.neck, outline: 0 }, place(0, -0.01, 0));
  }
  if (acc === 'backpack') {
    add(boxAt(-0.11, -0.16, -0.12 * w, 0, 0.1, 0.12 * w), { color: ac, bone: B.chest }, place(-R.chest * dep * w - 0.05, 0, 0));
    add(boxAt(-0.005, -0.12, -0.08, 0.008, -0.1, 0.08), { color: top2, bone: B.chest, outline: 0, emit: seams ? [0, 1] : [0.6, 0] }, place(-R.chest * dep * w - 0.162, 0, 0));
    for (const s of [-1, 1]) add(boxAt(-0.01, -0.12, -0.012, 0.02, 0.16, 0.012), { color: shade(ac, 0.8), bone: B.chest, outline: 0 }, place(R.chest * dep * w * 0.95, 0, s * 0.08 * w));
  }
  if (acc === 'beanie') {
    add(tubeY(d.headR * 1.04, d.headR * 1.06, hc + 0.0, hc + 0.07, 10, true), { color: ac, bone: B.head, outline: 0.5 });
    add(tubeY(d.headR * 1.08, d.headR * 1.08, hc + 0.0, hc + 0.03, 10, true), { color: shade(ac, 0.85), bone: B.head, outline: 0 });
  }
  if (acc === 'antenna') {
    add(tube(0.008, 0.008, 0.16, 4), { color: 0x8a8fa0, bone: B.helmet, outline: 0.4 }, place(-0.02, 0.36, 0));
    add(ball(0.03, 6, 4), { color: ac, bone: B.helmet, emit: [0.8, 0], outline: 0.6 }, place(-0.02, 0.37, 0));
  }

  hair(pb, look, d, opt);
  return pb;
}

/** Shoes per type (the ankle bone: sole 0.075 below, toes toward +x). */
function shoe(pb: PartBuilder, look: SkaterLook, ankle: number, knee: number, d: RigDims): void {
  const c = look.shoeColor, L = BODY.shoeLen, bk = BODY.shoeBack, W = BODY.shoeW / 2, up = d.ankleUp;
  const x0 = -bk, x1 = L - bk;
  const sole = (h: number, col: Hex, wide = 1) => pb.add(boxAt(x0 - 0.005, -up, -W * wide - 0.004, x1 + 0.008, -up + h, W * wide + 0.004), { color: col, bone: ankle });
  switch (look.shoes) {
    case 'highTop':
      sole(0.03, 0xfff4e3);
      pb.add(boxAt(x0, -up + 0.03, -W, x1, -up + 0.085, W), { color: c, bone: ankle });
      pb.add(boxAt(x0, -up + 0.06, -W * 0.85, x0 + 0.13, up + 0.05, W * 0.85), { color: c, bone: ankle });
      pb.add(boxAt(x1 - 0.07, -up + 0.028, -W * 1.01, x1 + 0.006, -up + 0.06, W * 1.01), { color: 0xfff4e3, bone: ankle, outline: 0 });
      break;
    case 'chunky':
      sole(0.05, mix(c, 0xffffff, 0.75), 1.12);
      pb.add(boxAt(x0 + 0.005, -up + 0.05, -W * 1.05, x1 - 0.01, -up + 0.1, W * 1.05), { color: c, bone: ankle });
      pb.add(boxAt(x0, -up + 0.08, -W * 0.85, x0 + 0.11, up + 0.02, W * 0.85), { color: c, bone: ankle });
      break;
    case 'rainBoots':
      sole(0.022, shade(c, 0.6));
      pb.add(boxAt(x0, -up + 0.022, -W, x1, -up + 0.085, W), { color: c, bone: ankle });
      pb.add(tube(0.072, 0.064, 0.2, 6), { color: c, bone: knee }, place(0, -d.shin + 0.14, 0));
      break;
    case 'workBoots':
      sole(0.03, 0x2e2a33, 1.05);
      pb.add(boxAt(x0, -up + 0.03, -W * 1.02, x1, -up + 0.095, W * 1.02), { color: c, bone: ankle });
      pb.add(boxAt(x0, -up + 0.07, -W * 0.9, x0 + 0.14, up + 0.07, W * 0.9), { color: c, bone: ankle });
      pb.add(boxAt(x0 + 0.13, -up + 0.08, -W * 0.5, x0 + 0.15, up + 0.06, W * 0.5), { color: 0xf2b630, bone: ankle, outline: 0 });
      break;
    case 'robot':
      pb.add(boxAt(x0, -up, -W * 1.05, x1, -up + 0.07, W * 1.05), { color: c, bone: ankle });
      pb.add(boxAt(x1 - 0.08, -up + 0.005, -W * 1.08, x1 + 0.01, -up + 0.06, W * 1.08), { color: look.bottomColor, bone: ankle, outline: 0 });
      pb.add(tube(0.045, 0.05, 0.08, 6), { color: 0x8a8fa0, bone: ankle }, place(0, 0.05, 0));
      break;
    default: // lowTop
      sole(0.026, 0xfff4e3);
      pb.add(boxAt(x0, -up + 0.026, -W, x1, -up + 0.075, W), { color: c, bone: ankle });
      pb.add(boxAt(x0, -up + 0.05, -W * 0.82, x0 + 0.12, -up + 0.105, W * 0.82), { color: c, bone: ankle });
      break;
  }
}

/** Hair that shows under the helmet (sides, back, fringe); a top cap only when the helmet shows the whole head. */
function hair(pb: PartBuilder, look: SkaterLook, d: RigDims, opt: BodyOptions): void {
  const col = look.hairColor, hc = d.headUp, r = d.headR, bone = B.head;
  const front = Math.PI / 2;                              // CylinderGeometry θ for +x
  const curtain = (y0: number, y1: number, r0: number, r1: number, openDeg: number, color = col, outline = 0.8) =>
    pb.add(curtainGeo(r0, r1, y0, y1, front + (openDeg / 2) * DEG, (360 - openDeg) * DEG), { color, bone, outline }, place(0, hc, 0));
  const cap = () => { if (opt.headVisible) pb.add(shell(r * 1.03, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.42), { color: col, bone, outline: 0 }, place(-0.01, hc + 0.005, 0, 0, 0, 10)); };
  switch (look.hair) {
    case 'bob':
      curtain(-0.13, 0.04, r * 1.13, r * 1.04, 110); cap();
      break;
    case 'longStraight':
      curtain(-0.16, 0.04, r * 1.1, r * 1.04, 120); cap();
      pb.add(curtainGeo(r * 1.16, r * 1.08, -0.42, -0.1, front + 105 * DEG, 150 * DEG), { color: col, bone, outline: 0.8 }, place(0, hc, 0));
      break;
    case 'curlyMop': {
      const pts: [number, number, number][] = [[-0.12, -0.02, 0.1], [-0.15, -0.03, 0], [-0.12, -0.02, -0.1], [-0.02, -0.04, 0.16], [-0.02, -0.04, -0.16], [0.11, 0.05, 0.08], [0.11, 0.05, -0.08], [-0.06, -0.08, 0.07]];
      for (const [x, y, z] of pts) pb.add(ball(0.06, 5, 4), { color: col, bone, outline: 0.7 }, place(x, hc + y, z));
      cap();
      break;
    }
    case 'afroPuff':
      curtain(-0.06, 0.03, r * 1.02, r * 1.05, 120); cap();
      pb.add(ball(0.11, 7, 5), { color: col, bone, outline: 1 }, place(-0.17, hc + 0.06, 0));
      break;
    case 'buzz': case 'shortGrey':
      curtain(-0.075, 0.02, r * 1.01, r * 1.03, look.hair === 'buzz' ? 140 : 120); cap();
      if (look.hair === 'shortGrey') for (const s of [-1, 1]) pb.add(boxAt(-0.02, -0.08, -0.008, 0.02, 0, 0.008), { color: col, bone, outline: 0 }, place(0.035, hc, s * r * 0.98));
      break;
    case 'twinBuns':
      curtain(-0.07, 0.03, r * 1.02, r * 1.05, 120); cap();
      for (const s of [-1, 1]) pb.add(ball(0.068, 6, 4), { color: col, bone, outline: 1 }, place(-0.06, hc + 0.0, s * 0.165));
      break;
    case 'topBun':
      curtain(-0.07, 0.03, r * 1.02, r * 1.05, 120); cap();
      pb.add(ball(0.075, 6, 4), { color: col, bone, outline: 1 }, place(-0.19, hc + 0.06, 0));
      break;
    case 'ponytail':
      curtain(-0.07, 0.03, r * 1.02, r * 1.05, 120); cap();
      pb.add(tube(0.05, 0.022, 0.28, 6), { color: col, bone, outline: 0.8 }, place(-0.18, hc + 0.02, 0, 0, 0, -28));
      pb.add(tube(0.03, 0.03, 0.025, 6, true), { color: 0xff5e6c, bone, outline: 0 }, place(-0.185, hc + 0.025, 0, 0, 0, -28));
      break;
    case 'spikes': {
      curtain(-0.06, 0.03, r * 1.01, r * 1.04, 120); cap();
      const tip = look.hairTip ?? col;
      for (let i = 0; i < 9; i++) {
        const a = front + (70 + i * 27.5) * DEG, x = Math.sin(a) * r * 0.95, z = Math.cos(a) * r * 0.95;
        const yaw = Math.atan2(x, z) * 180 / Math.PI;
        pb.add(spike(0.034, 0.11, 4), { color: col, bone, outline: 0.6, colorAt: (p) => (p.y > 0.06 ? tip : null) },
          place(x, hc + 0.01 - (i % 2) * 0.03, z, 0, yaw, 0).multiply(place(0, 0, 0, 70, 0, 0)));
      }
      break;
    }
    case 'mohawk':
      pb.add(boxAt(-0.15, 0, -0.018, 0.12, 0.12, 0.018), { color: col, bone, outline: 0.8 }, place(0, hc + 0.16, 0));
      break;
    default: break;   // 'none'
  }
}

/** An open partial tube (hair curtain) from y0 (radius rBottom) up to y1 (radius rTop), θ as CylinderGeometry. */
function curtainGeo(rBottom: number, rTop: number, y0: number, y1: number, th0: number, thLen: number) {
  const g = new CylinderGeometry(rTop, rBottom, y1 - y0, 10, 1, true, th0, thLen);
  g.translate(0, (y0 + y1) / 2, 0);
  return g;
}
