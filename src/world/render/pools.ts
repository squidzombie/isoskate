// world/render/pools.ts: pooled chunk geometry (TECH §8.4 "chunk buffers are pooled", §8.6). Each PooledGeo owns
// preallocated position/normal/colour arrays and one BufferGeometry; a chunk writes into them with `setDrawRange` and
// update ranges, and a released chunk hands them back, so steady-state streaming allocates nothing on the CPU or GPU.
// Capacity grows by doubling (the geometry is disposed and re-created) only when a chunk outgrows every pooled buffer.
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

export class PooledGeo {
  readonly geo = new BufferGeometry();
  pos!: Float32Array; nrm!: Float32Array; col!: Float32Array;
  cap = 0;
  /** Vertices written by the current owner. */
  count = 0;
  private readonly sphere = new Sphere(new Vector3(), 1);

  constructor(cap: number) { this.alloc(cap); }

  /** Makes room for `n` vertices, keeping what is written so far. */
  ensure(n: number): void {
    if (n <= this.cap) return;
    let cap = this.cap;
    while (cap < n) cap *= 2;
    const { pos, nrm, col } = this;
    this.geo.dispose();                      // frees the GPU buffers of the old arrays
    this.alloc(cap);
    this.pos.set(pos.subarray(0, this.count * 3));
    this.nrm.set(nrm.subarray(0, this.count * 3));
    this.col.set(col.subarray(0, this.count * 3));
  }

  /** Publishes the written range to the GPU and sets the bounds (from the writer's min/max). */
  commit(min: Vector3, max: Vector3): void {
    const g = this.geo, n = this.count;
    for (const name of ['position', 'normal', 'color'] as const) {
      const a = g.getAttribute(name) as BufferAttribute;
      a.clearUpdateRanges();
      if (n > 0) a.addUpdateRange(0, n * 3);
      a.needsUpdate = true;
    }
    g.setDrawRange(0, n);
    if (n > 0) this.sphere.center.addVectors(min, max).multiplyScalar(0.5);
    this.sphere.radius = n > 0 ? Math.max(1e-3, min.distanceTo(max) / 2) : 0;
    g.boundingSphere = this.sphere;
  }

  dispose(): void { this.geo.dispose(); }

  private alloc(cap: number): void {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.nrm = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('normal', new BufferAttribute(this.nrm, 3));
    this.geo.setAttribute('color', new BufferAttribute(this.col, 3));
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
  get idle(): number { return this.free.length; }
  dispose(): void { for (const g of this.free) g.dispose(); this.free.length = 0; }
}
