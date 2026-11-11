// Palette presets and blends (DESIGN §18.1, §22) and the readability colours (DESIGN §18.4).
import { describe, expect, it } from 'vitest';
import type { AreaId } from '../../../src/core/ids';
import { COLORS, GREEN_SHARE, HAZARD, LOOK, PRESETS, RECLAIM, blendWeight, contrastRatio, fadePaint, mixHex, relLum, sampleLook, samplePalette, withLum } from '../../../src/world/render/palette';

const ch = (hex: number, sh: number) => (hex >> sh) & 255;

describe('palette presets', () => {
  it('match the DESIGN §18.1 table (golden, late gold, sunset, blue hour)', () => {
    expect(PRESETS.downtown.zenith).toBe(0x8e7cc3); expect(PRESETS.downtown.sunElevDeg).toBe(22); expect(PRESETS.downtown.exposure).toBe(1.05);
    expect(PRESETS.suburbs.horizon).toBe(0xffe2ae); expect(PRESETS.suburbs.sunElevDeg).toBe(26);
    expect(PRESETS.docks.mid).toBe(0xe8826e); expect(PRESETS.docks.sunElevDeg).toBe(12);
    expect(PRESETS.neon.zenith).toBe(0x1e2350); expect(PRESETS.neon.sunIntensity).toBe(0.6); expect(PRESETS.neon.exposure).toBe(1.2);
    // Window-lit 20% at golden rising to 60% at blue hour (DESIGN §18.3); neon glow 0 → 1.
    expect(PRESETS.downtown.windowLit).toBe(0.2); expect(PRESETS.neon.windowLit).toBe(0.6);
    expect(PRESETS.downtown.neonGlow).toBe(0); expect(PRESETS.neon.neonGlow).toBe(1);
    for (const a of Object.keys(LOOK) as AreaId[]) expect(LOOK[a].haze).toBeLessThanOrEqual(0.35);
  });

  it('a gateway blend lerps from one preset to the next over the 8 s window (smoothstep), allocation-free', () => {
    const out = { ...PRESETS.downtown };
    expect(samplePalette('downtown', { from: 'downtown', to: 'suburbs', u: 0 }, out).zenith).toBe(PRESETS.downtown.zenith);
    expect(samplePalette('suburbs', { from: 'downtown', to: 'suburbs', u: 1 }, out).zenith).toBe(PRESETS.suburbs.zenith);
    const mid = samplePalette('downtown', { from: 'docks', to: 'neon', u: 0.5 }, out);
    expect(mid.sunIntensity).toBeCloseTo((PRESETS.docks.sunIntensity + PRESETS.neon.sunIntensity) / 2, 9);
    for (const sh of [16, 8, 0]) {
      const a = ch(PRESETS.docks.zenith, sh), b = ch(PRESETS.neon.zenith, sh), m = ch(mid.zenith, sh);
      expect(m).toBeGreaterThanOrEqual(Math.min(a, b)); expect(m).toBeLessThanOrEqual(Math.max(a, b));
    }
    expect(samplePalette('neon', null, out)).toBe(out);
    // smoothstep: monotone, 0 and 1 at the ends, slow at both ends.
    let prev = -1;
    for (let u = 0; u <= 1.0001; u += 0.05) { const w = blendWeight({ from: 'docks', to: 'neon', u }); expect(w).toBeGreaterThanOrEqual(prev); prev = w; }
    expect(blendWeight({ from: 'docks', to: 'neon', u: 0.1 })).toBeLessThan(0.1);
    expect(blendWeight(null)).toBe(0);
    expect(sampleLook('docks', { from: 'docks', to: 'neon', u: 1 }).road).toBe(LOOK.neon.road);
  });

  it('mixHex lerps per channel in sRGB', () => {
    expect(mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixHex(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });

  it('readability colours are the DESIGN §18.4 contract in every area', () => {
    expect(COLORS.edgeCream).toBe(0xfff8ec);   // the G1 cream-chrome grind signature (DESIGN §18.4)
    expect(COLORS.ink).toBe(0x2b2140);
    expect(COLORS.chevron).toBe(0xf2b630);
    expect(COLORS.coin).toBe(0xffc94a);
    expect(COLORS.coral).toBe(0xff5e6c);
    expect(HAZARD.neon.body).toBe(0x7a6fb0);
    expect(HAZARD.neon.inverted).toBe(true);
    expect([0xff3fa4, 0xff5a3c]).toContain(HAZARD.neon.rim);
    for (const a of ['downtown', 'suburbs', 'docks'] as const) expect(HAZARD[a].inverted).toBe(false);
    // Asphalt stays mid-value (lighter than the ink bodies, darker than the cream edge).
    const lum = (h: number) => 0.2126 * ch(h, 16) + 0.7152 * ch(h, 8) + 0.0722 * ch(h, 0);
    for (const a of ['downtown', 'suburbs', 'docks'] as const) {
      expect(lum(LOOK[a].road)).toBeGreaterThan(lum(HAZARD[a].body) * 3);
      expect(lum(LOOK[a].road)).toBeLessThan(lum(COLORS.edgeCream) * 0.6);
    }
  });
});

describe('RECLAIM tokens (DESIGN §18.1 RECLAIM table; THEME §5)', () => {
  it('car paint tops sit in L 0.075–0.11 and frame against the dark glass; the glass holds 3.5:1 on asphalt', () => {
    for (const p of Object.values(RECLAIM.carPaint)) {
      expect(relLum(p)).toBeGreaterThanOrEqual(0.075); expect(relLum(p)).toBeLessThanOrEqual(0.11);
      expect(contrastRatio(p, RECLAIM.glass)).toBeGreaterThanOrEqual(1.8);
    }
    expect(contrastRatio(RECLAIM.glass, COLORS.asphalt)).toBeGreaterThanOrEqual(3.5);
    expect(contrastRatio(RECLAIM.inkRust, COLORS.asphalt)).toBeGreaterThanOrEqual(3.5);
  });
  it('moss tokens are luminance-matched (±10%) to the faces they cover', () => {
    const near = (a: number, b: number) => Math.abs(relLum(a) - relLum(b)) / relLum(b);
    for (const [k, p] of Object.entries(RECLAIM.carPaint)) expect(near(RECLAIM.carRoofMoss[k as keyof typeof RECLAIM.carRoofMoss], p), k).toBeLessThanOrEqual(0.1);
    expect(near(RECLAIM.hazardMoss, HAZARD.downtown.top)).toBeLessThanOrEqual(0.1);
    expect(near(RECLAIM.hazardMossDark, 0x4a3b6b)).toBeLessThanOrEqual(0.1);
    expect(near(RECLAIM.neonHazardMoss, HAZARD.neon.body)).toBeLessThanOrEqual(0.1);
    expect(near(RECLAIM.neonHazardMossTop, HAZARD.neon.top)).toBeLessThanOrEqual(0.1);
    for (const [face, moss] of Object.entries(RECLAIM.hazardMossOn)) expect(near(moss, Number(face))).toBeLessThanOrEqual(0.1);
  });
  it('hazard foliage stays dark (L ≤ 0.05), decor foliage light (L ≥ 0.10), Neon decor foliage ≤ 1.3:1 on wet asphalt', () => {
    expect(relLum(RECLAIM.hazardFoliage)).toBeLessThanOrEqual(0.05); expect(relLum(RECLAIM.hazardFoliageLit)).toBeLessThanOrEqual(0.05);
    for (const c of [RECLAIM.ivyDeep, RECLAIM.ivyLight, RECLAIM.moss, RECLAIM.mossLight, RECLAIM.newLeaf, RECLAIM.meadow, RECLAIM.meadowSuburbs, RECLAIM.seagrass, RECLAIM.dryGrass])
      expect(relLum(c), c.toString(16)).toBeGreaterThanOrEqual(0.1);
    for (const c of [RECLAIM.nightLeaf, RECLAIM.nightMoss]) expect(contrastRatio(c, LOOK.neon.road)).toBeLessThanOrEqual(1.31);
    expect(contrastRatio(RECLAIM.deadTube, LOOK.neon.road)).toBeCloseTo(1.39, 1);
  });
  it('Neon vehicle bodies match the inverted hazard body value (L 0.18–0.19)', () => {
    for (const c of RECLAIM.neonCarBody) { expect(relLum(c)).toBeGreaterThanOrEqual(0.18); expect(relLum(c)).toBeLessThanOrEqual(0.19); }
  });
  it('keeps the grind signature alone: pickets and the lightest animal read against cream; no flower is gold or white', () => {
    expect(contrastRatio(RECLAIM.pickets, COLORS.edgeCream)).toBeGreaterThanOrEqual(2.7);
    expect(contrastRatio(RECLAIM.animalMax, COLORS.edgeCream)).toBeGreaterThanOrEqual(2.3);
    for (const c of Object.values(RECLAIM.flowers)) {
      const r = ch(c, 16), g = ch(c, 8), b = ch(c, 0);
      const goldish = r > b + 60 && g > b + 60 && Math.abs(r - g) < 60;       // coin-gold hue band
      expect(goldish, c.toString(16)).toBe(false);
      expect(relLum(c)).toBeLessThan(0.6);
    }
    expect(relLum(RECLAIM.seeds)).toBeLessThanOrEqual(relLum(RECLAIM.animalMax));
  });
  it('withLum hits the target luminance with the source hue; fadePaint lightens toward the verge and desaturates', () => {
    for (const [hue, L] of [[RECLAIM.moss, 0.09], [RECLAIM.rust, 0.05], [0x3f6b3a, 0.3], [0x000000, 0.2]] as const) expect(relLum(withLum(hue, L))).toBeCloseTo(L, 2);
    const f = fadePaint(0xc4473d);
    expect(ch(f, 16) - ch(f, 0)).toBeLessThan(0xc4 - 0x3d);
    expect(relLum(f)).toBeGreaterThan(relLum(0xc4473d));
  });
  it('green-share bands per area (DESIGN §18.1)', () => {
    expect(GREEN_SHARE).toEqual({ downtown: [0.06, 0.15], suburbs: [0.12, 0.3], docks: [0.03, 0.1], neon: [0.03, 0.1] });
  });
});
