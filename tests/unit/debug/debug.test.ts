// debug/ pure parts: the WAV encoder (shots --audio), the contrast maths (shots --contrast), the tuning registry.
import { describe, expect, it } from 'vitest';
import { encodeWav } from '../../../src/debug/api';
import { CONTRAST_GATE, ratioOf, relLum } from '../../../src/debug/contrast';
import { registerTunables, tunableGroups } from '../../../src/debug/tuningPanel';

describe('encodeWav', () => {
  it('writes a 16-bit stereo RIFF/WAVE with the absolute peak (mono is duplicated)', () => {
    const data = new Float32Array([0, 0.5, -1, 0.25]);
    const { wavBase64, peak } = encodeWav({ numberOfChannels: 1, length: 4, sampleRate: 48000, getChannelData: () => data });
    const b = Buffer.from(wavBase64, 'base64');
    expect(peak).toBe(1);
    expect(b.toString('ascii', 0, 4)).toBe('RIFF');
    expect(b.toString('ascii', 8, 12)).toBe('WAVE');
    expect(b.readUInt16LE(22)).toBe(2);                 // channels
    expect(b.readUInt32LE(24)).toBe(48000);
    expect(b.readUInt16LE(34)).toBe(16);
    expect(b.readUInt32LE(40)).toBe(4 * 4);              // 4 frames × 2 ch × 2 bytes
    expect(b.readInt16LE(44 + 4)).toBe(16383);           // 0.5 × 0x7fff, truncated
    expect(b.readInt16LE(44 + 8)).toBe(-0x8000);
    expect(b.readInt16LE(44 + 10)).toBe(-0x8000);        // right = left
  });
});

describe('contrast maths (WCAG relative luminance)', () => {
  it('luminance and ratio match the WCAG reference values', () => {
    expect(relLum(255, 255, 255)).toBeCloseTo(1, 6);
    expect(relLum(0, 0, 0)).toBe(0);
    expect(ratioOf(relLum(255, 255, 255), 0)).toBeCloseTo(21, 6);
    // DESIGN §18.1: ink #2B2140 on asphalt #6B6478 is about 2.75:1 before lighting.
    const ink = relLum(0x2b, 0x21, 0x40), asphalt = relLum(0x6b, 0x64, 0x78);
    expect(ratioOf(ink, asphalt)).toBeGreaterThan(2.5);
    expect(ratioOf(asphalt, ink)).toBe(ratioOf(ink, asphalt));
    expect(CONTRAST_GATE).toEqual({ hazard: 2.5, edge: 1.8 });
  });
});

describe('tuning registry', () => {
  it('registers and unregisters live groups', () => {
    const cfg = { a: 1, nested: { b: true } };
    const off = registerTunables('test', cfg);
    expect(tunableGroups().get('test')).toBe(cfg);
    off();
    expect(tunableGroups().has('test')).toBe(false);
  });
});
