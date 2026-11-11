// skater/board.ts: the board geometry (DESIGN §18.5). The deck is the 0.80 × 0.21 rounded outline with nose and tail
// radius 0.105, extruded 0.022 deep (an extrusion built as a station grid so the kicks and the concave can bend it:
// beyond |z| > 0.30 the vertices rotate up 18°; y += 0.006 × (x / 0.105)²). Grip on top, the deck graphic underneath,
// 7 ply stripes on the edge; trucks (baseplate + 0.19 × 0.03 × 0.035 hanger) and 8-sided wheels of radius 0.028.
// Board frame: the deck centre at the origin, the long axis along z (nose toward −z), up +y.
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute } from 'three';
import type { BoardLook } from '../core/cosmetics';
import { boxAt, PartBuilder, place, shade, type UvMap } from './parts';
import { BOARD, FX } from './skater.config';
import { BOARD_UV } from './textures';

const WHITE: UvMap = { kind: 'solid', u: BOARD_UV.white.u, v: BOARD_UV.white.v };
const KEEP: UvMap = { kind: 'keep' };
const KICK = (BOARD.kickDeg * Math.PI) / 180;

/** Half-width of the deck at |z| along its length (round nose and tail). */
export function deckHalfWidth(az: number): number {
  const straight = BOARD.len / 2 - BOARD.endR;
  if (az <= straight) return BOARD.width / 2;
  const d = Math.min(BOARD.endR, az - straight);
  return Math.sqrt(Math.max(0, BOARD.endR * BOARD.endR - d * d));
}

/** Applies the concave and the kicks to a deck-space point (x across, y up, z along). */
export function bendDeck(x: number, y: number, z: number): [number, number, number] {
  let yy = y + BOARD.concave * (x / (BOARD.width / 2)) ** 2;
  let zz = z;
  const az = Math.abs(z);
  if (az > BOARD.kickX) {
    const dz = az - BOARD.kickX, s = Math.sign(z);
    // Rotate (dz, y) about the kick line by 18° upward, so the deck keeps its thickness through the kick.
    const nz = dz * Math.cos(KICK) - yy * Math.sin(KICK), ny = dz * Math.sin(KICK) + yy * Math.cos(KICK);
    zz = s * (BOARD.kickX + nz); yy = ny;
  }
  return [x, yy, zz];
}

interface Face { p: number[]; uv: number[] }

/** The deck: top (grip), bottom (graphic) and the edge (ply). Returns three geometries (separate UV maps). */
function deckGeometries(): { top: BufferGeometry; bottom: BufferGeometry; edge: BufferGeometry } {
  const st = [...BOARD.stations];
  const zs = [...st.slice(1).reverse().map((a) => -a), ...st];          // −0.396 … 0 … +0.396
  const half = BOARD.depth / 2, L = st[st.length - 1]!;
  const cols = [-1, 0, 1];
  const ring = (z: number, y: number) => cols.map((cx) => bendDeck(cx * deckHalfWidth(Math.abs(z)), y, z));
  const top: Face[] = [], bottom: Face[] = [], edge: Face[] = [];
  const g = BOARD_UV.graphic, gr = BOARD_UV.grip, ply = BOARD_UV.ply;
  const uAlong = (z: number, r: readonly number[]) => r[0]! + (r[2]! - r[0]!) * ((z + L) / (2 * L));
  const vAcross = (cx: number, r: readonly number[]) => r[1]! + (r[3]! - r[1]!) * ((cx + 1) / 2);
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i]!, zb = zs[i + 1]!;
    const ta = ring(za, half), tb = ring(zb, half), ba = ring(za, -half), bb = ring(zb, -half);
    for (let j = 0; j < 2; j++) {
      // Top (CCW seen from above: normal +y).
      quad(top, ta[j]!, tb[j]!, tb[j + 1]!, ta[j + 1]!,
        [uAlong(za, gr), vAcross(cols[j]!, gr)], [uAlong(zb, gr), vAcross(cols[j]!, gr)], [uAlong(zb, gr), vAcross(cols[j + 1]!, gr)], [uAlong(za, gr), vAcross(cols[j + 1]!, gr)]);
      // Bottom (normal −y). The graphic reads nose → tail along u, mirrored so it is upright seen from below.
      quad(bottom, ba[j]!, ba[j + 1]!, bb[j + 1]!, bb[j]!,
        [uAlong(za, g), vAcross(-cols[j]!, g)], [uAlong(za, g), vAcross(-cols[j + 1]!, g)], [uAlong(zb, g), vAcross(-cols[j + 1]!, g)], [uAlong(zb, g), vAcross(-cols[j]!, g)]);
    }
    // Edges (both long sides).
    for (const [k, flip] of [[0, false], [2, true]] as const) {
      const a0 = ta[k]!, a1 = tb[k]!, b0 = ba[k]!, b1 = bb[k]!;
      const uv = (z: number, v: number): [number, number] => [uAlong(z, ply), ply[1]! + (ply[3]! - ply[1]!) * v];
      if (!flip) quad(edge, a0, b0, b1, a1, uv(za, 1), uv(za, 0), uv(zb, 0), uv(zb, 1));
      else quad(edge, a0, a1, b1, b0, uv(za, 1), uv(zb, 1), uv(zb, 0), uv(za, 0));
    }
  }
  // Tip caps (nose and tail ends).
  for (const [z, s] of [[zs[0]!, -1], [zs[zs.length - 1]!, 1]] as const) {
    const t = ring(z, half), b = ring(z, -half);
    const uv = (v: number): [number, number] => [ply[0]!, ply[1]! + (ply[3]! - ply[1]!) * v];
    if (s < 0) quad(edge, t[0]!, t[2]!, b[2]!, b[0]!, uv(1), uv(1), uv(0), uv(0));
    else quad(edge, t[2]!, t[0]!, b[0]!, b[2]!, uv(1), uv(1), uv(0), uv(0));
  }
  return { top: toGeo(top), bottom: toGeo(bottom), edge: toGeo(edge) };
}

function quad(out: Face[], a: number[], b: number[], c: number[], d: number[], ua: number[], ub: number[], uc: number[], ud: number[]): void {
  out.push({ p: [...a, ...b, ...c], uv: [...ua, ...ub, ...uc] }, { p: [...a, ...c, ...d], uv: [...ua, ...uc, ...ud] });
}
function toGeo(f: Face[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(f.flatMap((x) => x.p), 3));
  g.setAttribute('uv', new Float32BufferAttribute(f.flatMap((x) => x.uv), 2));
  g.computeVertexNormals();
  return g;
}

/** Builds the board for a look into a builder (not skinned: the board mesh rides the board-pivot bone). */
export function buildBoard(look: BoardLook): PartBuilder {
  const pb = new PartBuilder(false, WHITE);
  const deck = deckGeometries();
  const glowBottom = look.finish === 'emissive' ? FX.boardGlow : look.finish === 'goldLeaf' ? 0.12 : 0;
  // The deck parts carry their own UVs (grip, graphic, ply).
  pb.add(deck.top, { color: 0xffffff, uv: KEEP });
  pb.add(deck.bottom, { color: 0xffffff, uv: KEEP, emit: glowBottom ? [glowBottom, 0] : undefined });
  const edgeGlow = look.gripGlow;
  pb.add(deck.edge, edgeGlow !== undefined ? { color: edgeGlow, uv: WHITE, emit: [0.9, 0] } : { color: 0xffffff, uv: KEEP });
  // Trucks.
  const y0 = -BOARD.depth / 2, tc = look.trucks;
  const axleY = -BOARD.deckY + BOARD.wheelR;
  for (const z of [-BOARD.truckZ, BOARD.truckZ]) {
    const bp = BOARD.baseplate, h = BOARD.hanger;
    pb.add(boxAt(-bp.w / 2, y0 - bp.h, z - bp.d / 2, bp.w / 2, y0, z + bp.d / 2), { color: shade(tc, 0.8), outline: 0.5 });
    pb.add(boxAt(-0.018, axleY + 0.01, z - 0.016, 0.018, y0 - bp.h, z + 0.016), { color: shade(tc, 0.7), outline: 0.4 });
    pb.add(boxAt(-h.w / 2, axleY - h.h / 2, z - h.d / 2, h.w / 2, axleY + h.h / 2, z + h.d / 2), { color: tc, outline: 0.5 });
  }
  // Wheels (or Glide Ring's glowing hover rings; Golden Hour's light-trail wheels glow, static fallback).
  const wx = BOARD.hanger.w / 2 + BOARD.wheelW / 2 - 0.004;
  for (const z of [-BOARD.truckZ, BOARD.truckZ]) for (const s of [-1, 1]) {
    if (look.wheelFx === 'hoverRing') {
      const ring = new CylinderGeometry(BOARD.wheelR * 1.15, BOARD.wheelR * 1.15, 0.012, BOARD.wheelSides, 1, true);
      pb.add(ring, { color: look.fxColor ?? 0x7ff8ff, emit: [1.4, 0], outline: 0.3 }, place(s * wx, axleY, z, 0, 0, 90));
      const ring2 = new CylinderGeometry(BOARD.wheelR * 0.98, BOARD.wheelR * 0.98, 0.012, BOARD.wheelSides, 1, true);
      pb.add(ring2, { color: look.fxColor ?? 0x7ff8ff, emit: [1.4, 0], outline: 0 }, place(s * wx, axleY, z, 0, 0, -90));
    } else {
      const wheel = new CylinderGeometry(BOARD.wheelR, BOARD.wheelR, BOARD.wheelW, BOARD.wheelSides, 1, false);
      const trail = look.wheelFx === 'lightTrail';
      pb.add(wheel, { color: trail ? look.fxColor ?? look.wheels : look.wheels, emit: trail ? [0.9, 0] : undefined, outline: 0.45 },
        place(s * wx, axleY, z, 0, 0, 90));
    }
  }
  return pb;
}

