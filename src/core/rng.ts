// core/rng.ts (TECH §4.2). FROZEN CONTRACT: change only via docs/core-requests.md.
// Deterministic; the only randomness allowed in sim/, tricks/, world/gen/, meta/crates.

/** murmur3_32 over 32-bit words, with the fmix32 finalizer. Inputs are truncated to int32. Returns uint32. */
export function hash32(...ints: number[]): number {
  let h = 0x2b2140 ^ ints.length;
  for (let i = 0; i < ints.length; i++) {
    let k = Math.imul(ints[i]! | 0, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= ints.length * 4;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Small Fast Counting RNG (sfc32): 128-bit state, period ≥ 2^32, passes PractRand to 2^40+. */
export class Sfc32 {
  private a = 0; private b = 0; private c = 0; private d = 0;
  constructor(seed: number) {
    this.a = 0x9e3779b9 | 0;
    this.b = seed | 0;
    this.c = hash32(seed) | 0;
    this.d = 1;
    for (let i = 0; i < 15; i++) this.next();
  }
  next(): number {                                   // uint32
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }
  float(): number { return this.next() / 4294967296; }                 // [0,1)
  range(a: number, b: number): number { return a + (b - a) * this.float(); }  // [a,b)
  int(a: number, b: number): number { return a + Math.floor(this.float() * (b - a + 1)); }  // [a,b]
  chance(p: number): boolean { return this.float() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.float() * arr.length)]!; }
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const it of items) total += Math.max(0, it[1]);
    let r = this.float() * total;
    for (const it of items) {
      r -= Math.max(0, it[1]);
      if (r < 0) return it[0];
    }
    return items[items.length - 1]![0];
  }
  getState(): [number, number, number, number] { return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0]; }
  setState(s: [number, number, number, number]): void {
    this.a = s[0] | 0; this.b = s[1] | 0; this.c = s[2] | 0; this.d = s[3] | 0;
  }
}
export type RngStream = 'layout' | 'coins' | 'decor' | 'movers';
export const streamSeed = (runSeed: number, segIndex: number, stream: RngStream) =>
  hash32(runSeed, segIndex, ['layout', 'coins', 'decor', 'movers'].indexOf(stream));
