// skater/helmet.ts: helmet shells, novelty shapes, decals and finishes (DESIGN §15.3, §18.5). Classic dome
// (hemisphere × 1.08, 8 vents), visor shell, low bucket, round retro, and the novelties (hard hat with a brim, ribbed
// paper lantern, glass bubble with goldfish, cat ears, a petal ring, a wraparound visor). Strap and buckle on all.
// Helmet frame: the head-sphere centre (the `helmet` socket bone), +x = the face, +y up.
import { CylinderGeometry, SphereGeometry } from 'three';
import type { HelmetLook } from '../core/cosmetics';
import { ball, beam, boxAt, PartBuilder, place, shade, spike, tubeY, type UvMap } from './parts';
import { BODY } from './skater.config';
import { DECAL_UV } from './textures';

const WHITE: UvMap = { kind: 'solid', u: DECAL_UV.white.u, v: DECAL_UV.white.v };
const SHELL: UvMap = { kind: 'sphere', rect: DECAL_UV.shell };
const CYL_SHELL: UvMap = { kind: 'cyl', rect: DECAL_UV.shell };
const VISOR: UvMap = { kind: 'cyl', rect: DECAL_UV.visor };
const HR = BODY.headR;

export interface HelmetBuild {
  main: PartBuilder;
  /** The Fishbowl's glass (transparent, its own mesh). */
  glass: PartBuilder | null;
  /** The Fishbowl's goldfish (their own mesh, so they can orbit). */
  fish: PartBuilder | null;
}

/** Dome cap: a sphere from the pole down to `thetaDeg` from the top, tilted back so the brow sits higher. */
function dome(r: number, thetaDeg: number, w = 10, h = 5): SphereGeometry {
  return new SphereGeometry(r, w, h, 0, Math.PI * 2, 0, (thetaDeg * Math.PI) / 180);
}

export function buildHelmet(look: HelmetLook): HelmetBuild {
  const pb = new PartBuilder(false, WHITE);
  const shellCol = 0xffffff;                              // shells take their colour (and decal) from the canvas
  const rim = shade(look.color, 0.72);
  const glow = look.finish === 'emissive' ? 1 : 0;
  let glass: PartBuilder | null = null, fish: PartBuilder | null = null;
  const tiltBack = (x: number, y: number, z: number, deg: number, sx = 1, sy = 1, sz = 1) => place(x, y, z, 0, 0, deg, sx, sy, sz);
  const domeRim = (r: number, theta: number, y: number, tilt: number) => {
    const rr = r * Math.sin((theta * Math.PI) / 180), yy = r * Math.cos((theta * Math.PI) / 180);
    pb.add(new CylinderGeometry(rr * 1.02, rr * 1.03, 0.022, 10, 1, true), { color: rim, outline: 0 }, tiltBack(-0.01, y + yy, 0, tilt));
  };

  switch (look.shell) {
    case 'dome': case 'visor': case 'catEars': case 'petalRing': case 'wrapVisor': {
      const r = HR * 1.08;
      pb.add(dome(r, 100), { color: shellCol, uv: SHELL, emit: glow ? [0.6, 0] : undefined }, tiltBack(-0.01, 0.02, 0, 18));
      domeRim(r, 100, 0.02, 18);
      if (look.shell === 'visor') {
        // Visor Pro: a tinted brim that reflects the sky gradient.
        pb.add(new CylinderGeometry(r * 1.06, r * 1.16, 0.05, 8, 1, true, Math.PI / 2 - 0.95, 1.9), { color: 0xffffff, uv: VISOR },
          place(0.0, 0.07, 0, 0, 0, -22));
      }
      if (look.shell === 'catEars') {
        for (const s of [-1, 1]) {
          pb.add(new CylinderGeometry(0, 0.055, 0.1, 3, 1, false), { color: look.color, outline: 0.9 }, place(-0.02, 0.17, s * 0.095, s * 24, 0, 6));
          pb.add(new CylinderGeometry(0, 0.032, 0.065, 3, 1, true), { color: look.decalColor, outline: 0 }, place(0.012, 0.165, s * 0.093, s * 24, 0, 6));
        }
      }
      if (look.shell === 'petalRing') {
        // Sunflower: a ring of 12 petals around the brown seed dome.
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * 360;
          pb.add(spike(0.05, 0.11, 4), { color: i % 2 ? look.decalColor : shade(look.decalColor, 0.9), outline: 0.5 },
            place(0, 0.045, 0, 0, a, 0).multiply(place(0, 0, r * 0.84, 74, 0, 0, 1, 1, 0.3)));
        }
      }
      if (look.shell === 'wrapVisor') {
        pb.add(new CylinderGeometry(r * 1.05, r * 1.05, 0.085, 12, 1, true, Math.PI / 2 - 1.75, 3.5), { color: 0xffffff, uv: VISOR, emit: [0.9, 0] },
          place(0.004, 0.012, 0));
      }
      break;
    }
    case 'retro': {
      const r = HR * 1.16;
      pb.add(dome(r, 112, 10, 6), { color: shellCol, uv: SHELL }, tiltBack(-0.012, 0.012, 0, 8));
      domeRim(r, 112, 0.012, 8);
      break;
    }
    case 'bucket': {
      // Picnic Plaid: a low bucket hat: crown with a flat-ish top and a sloped brim all round (gingham canvas).
      pb.add(new CylinderGeometry(HR * 1.0, HR * 1.13, 0.19, 10, 1, false), { color: shellCol, uv: CYL_SHELL }, place(-0.005, 0.085, 0));
      pb.add(new CylinderGeometry(HR * 1.14, HR * 1.72, 0.06, 12, 1, true), { color: shellCol, uv: CYL_SHELL }, place(-0.005, -0.04, 0, 0, 0, 6));
      pb.add(new CylinderGeometry(HR * 1.15, HR * 1.15, 0.025, 10, 1, true), { color: shade(look.color, 0.65), outline: 0 }, place(-0.005, 0.0, 0));
      break;
    }
    case 'hardHat': {
      // Hard Hat: a tall crown with a ridge and a full brim, wider at the front peak.
      const r = HR * 1.1;
      pb.add(dome(r, 92, 10, 5), { color: shellCol, uv: SHELL }, place(-0.01, 0.025, 0, 0, 0, 6, 1, 1.12, 1));
      pb.add(new CylinderGeometry(r * 1.0, r * 1.42, 0.03, 12, 1, true), { color: shellCol, uv: CYL_SHELL }, place(0.03, 0.005, 0, 0, 0, 6, 1.12, 1, 1));
      pb.add(beam([-0.16, 0.17, 0], [0.14, 0.2, 0], 0.03, 0.026), { color: shade(look.color, 1.08), outline: 0.5 });
      break;
    }
    case 'lantern': {
      // Paper Lantern: a ribbed glowing body sitting on the head, dark caps, a little handle on top.
      pb.add(new SphereGeometry(HR * 1.25, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), { color: shellCol, uv: SHELL, emit: [1, 0] },
        place(-0.012, 0.07, 0, 0, 0, 14, 1, 1.2, 1));
      pb.add(tubeY(0.085, 0.07, 0.31, 0.345, 8), { color: 0x2b2140 });
      pb.add(new CylinderGeometry(HR * 1.2, HR * 1.2, 0.03, 8, 1, true), { color: 0x2b2140, outline: 0 }, place(-0.012, -0.005, 0, 0, 0, 14));
      pb.add(beam([0, 0.34, -0.04], [0, 0.39, 0], 0.012), { color: 0xc9a15a, outline: 0 });
      pb.add(beam([0, 0.39, 0], [0, 0.34, 0.04], 0.012), { color: 0xc9a15a, outline: 0 });
      break;
    }
    case 'bubble': {
      // Fishbowl: a glass bubble (its own transparent mesh) on a collar, a tiny antenna, two goldfish inside.
      glass = new PartBuilder(false, WHITE);
      glass.add(new SphereGeometry(0.255, 12, 9), { color: look.color, outline: 0 }, place(0.01, 0.045, 0));
      pb.add(tubeY(0.16, 0.19, -0.235, -0.19, 10), { color: 0xe8e4dc });
      pb.add(beam([-0.04, 0.29, 0], [-0.06, 0.37, 0], 0.01), { color: 0x8a8fa0, outline: 0 });
      pb.add(ball(0.022, 5, 4), { color: 0xff5e6c, emit: [0.6, 0], outline: 0.5 }, place(-0.06, 0.375, 0));
      fish = new PartBuilder(false, WHITE);
      for (const [a, y] of [[0.7, 0.12], [3.9, -0.04]] as const) {
        const x = Math.cos(a) * 0.21, z = Math.sin(a) * 0.21, yaw = (-a * 180) / Math.PI;
        fish.add(ball(0.03, 6, 4), { color: look.decalColor, outline: 0.4 }, place(x, y, z, 0, yaw, 0, 1, 0.75, 1.6));
        fish.add(new CylinderGeometry(0, 0.025, 0.04, 3, 1, false), { color: shade(look.decalColor, 1.12), outline: 0 },
          place(x, y, z, 0, yaw, 0).multiply(place(0, 0, -0.06, -90, 0, 0, 1, 1, 0.4)));
      }
      break;
    }
  }
  // Strap and buckle (all helmets).
  for (const s of [-1, 1]) pb.add(beam([0.0, -0.03, s * 0.168], [0.075, -0.15, s * 0.055], 0.012, 0.01), { color: 0x2b2140, outline: 0 });
  pb.add(boxAt(0.07, -0.17, -0.025, 0.09, -0.145, 0.025), { color: 0x8a8fa0, outline: 0 });
  return { main: pb, glass, fish };
}
