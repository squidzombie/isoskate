// world/render/pools.ts: pooled chunk geometry (TECH §8.4 "chunk buffers are pooled", §8.6). Each PooledGeo owns
// preallocated position / normal / colour / auv / fx arrays and one BufferGeometry; a chunk writes into them with
// `setDrawRange` and update ranges, and a released chunk hands them back, so steady-state streaming allocates nothing
// on the CPU or the GPU. Capacity grows by doubling (the geometry is disposed and re-created) only when a chunk
// outgrows every pooled buffer of its role.
//   auv: paint / sign atlas uv (x < 0: none).   fx: per-material flags (materials.ts documents each layout).
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

const ATTRS = [['position', 3], ['normal', 3], ['color', 3], ['auv', 2], ['fx', 4]] as const;

export class PooledGeo {
  readonly geo = new BufferGeometry();
  pos!: Float32Array; nrm!: Float32Array; col!: Float32Array; uv!: Float32Array; fx!: Float32Array;
  cap = 0;
  /** Vertices written by the current owner. */
  count = 0;
  /** Set when `ensure` re-allocated (and disposed the GPU side); the owner clears it. */
  grown = false;
  private readonly sphere = new Sphere(new Vector3(), 1);

  constructor(cap: number) { this.alloc(cap); }

  /** Makes room for `n` vertices, keeping what is written so far. */
  ensure(n: number): void {
    if (n <= this.cap) return;
    let cap = this.cap;
    while (cap < n) cap *= 2;
    const { pos, nrm, col, uv, fx } = this;
    this.geo.dispose();                      // frees the GPU buffers of the old arrays
    this.grown = true;                       // the view registers it again at once (stable GPU geometry count)
    this.alloc(cap);
    const k = this.count;
    this.pos.set(pos.subarray(0, k * 3)); this.nrm.set(nrm.subarray(0, k * 3)); this.col.set(col.subarray(0, k * 3));
    this.uv.set(uv.subarray(0, k * 2)); this.fx.set(fx.subarray(0, k * 4));
  }

  /** Publishes the written range to the GPU and sets the bounds (from the writer's min/max). */
  commit(min: Vector3, max: Vector3): void {
    const g = this.geo, n = this.count;
    for (const [name, size] of ATTRS) {
      const a = g.getAttribute(name) as BufferAttribute;
      a.clearUpdateRanges();
      if (n > 0) a.addUpdateRange(0, n * size);
      a.needsUpdate = true;
    }
    g.setDrawRange(0, n);
    if (n > 0) this.sphere.center.addVectors(min, max).multiplyScalar(0.5);
    this.sphere.radius = n > 0 ? Math.max(1e-3, min.distanceTo(max) / 2) : 0;
    g.boundingSphere = this.sphere;
  }

  /** After a GPU context restore: the whole written range is uploaded again on the next draw. */
  reupload(): void {
    for (const [name, size] of ATTRS) {
      const a = this.geo.getAttribute(name) as BufferAttribute;
      a.clearUpdateRanges();
      if (this.count > 0) a.addUpdateRange(0, this.count * size);
      a.needsUpdate = true;
    }
  }

  dispose(): void { this.geo.dispose(); }

  private alloc(cap: number): void {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3); this.nrm = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    this.uv = new Float32Array(cap * 2); this.fx = new Float32Array(cap * 4);
    const arrays = [this.pos, this.nrm, this.col, this.uv, this.fx];
    ATTRS.forEach(([name, size], i) => this.geo.setAttribute(name, new BufferAttribute(arrays[i]!, size)));
    this.geo.setDrawRange(0, 0);
  }
}

/** A free list of PooledGeo. `created` counts every allocation (unit tests assert steady state). */
export class GeoPool {
  private readonly free: PooledGeo[] = [];
  created = 0;
  constructor(private readonly initialCap = 4096) {}
  acquire(): PooledGeo {
    const g = this.free.pop();
    if (g) { g.count = 0; return g; }
    this.created++;
    return new PooledGeo(this.initialCap);
  }
  release(g: PooledGeo): void { g.count = 0; this.free.push(g); }
  /** Creates small geometries until `n` exist (they grow on first use; a grown one keeps its BufferGeometry), so the
   *  pool's high-water mark is reached at boot, not whenever a run first needs one more. Returns the new ones. */
  prewarm(n: number, cap = 16): PooledGeo[] {
    const out: PooledGeo[] = [];
    while (this.created < n) { this.created++; const g = new PooledGeo(cap); out.push(g); this.free.unshift(g); }
    return out;
  }
  get idle(): number { return this.free.length; }
  dispose(): void { for (const g of this.free) g.dispose(); this.free.length = 0; }
}
