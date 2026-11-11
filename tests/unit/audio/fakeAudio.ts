// A minimal fake BaseAudioContext for node tests of the audio graph code. It records node creation and validates
// AudioParam automation the way browsers do (non-finite values throw, exponential ramps need a positive target,
// a value curve may not overlap other events, a source starts once), so engine bugs surface in `npm test`.
export class FakeParam {
  value: number;
  events: { kind: string; t: number; v: number; d?: number }[] = [];
  constructor(v: number) { this.value = v; }
  private chk(v: number, t: number): void {
    if (!Number.isFinite(v) || !Number.isFinite(t)) throw new TypeError(`non-finite automation (${v}, ${t})`);
    if (t < 0) throw new RangeError(`negative time ${t}`);
    if (this.events.length > 4000) this.events.splice(0, 2000);
  }
  setValueAtTime(v: number, t: number) { this.chk(v, t); this.events.push({ kind: 'set', t, v }); this.value = v; return this; }
  linearRampToValueAtTime(v: number, t: number) { this.chk(v, t); this.events.push({ kind: 'lin', t, v }); return this; }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.chk(v, t);
    if (!(v > 0) && !(v < 0)) throw new RangeError('exponential ramp to zero');
    this.events.push({ kind: 'exp', t, v }); return this;
  }
  setTargetAtTime(v: number, t: number, tau: number) {
    this.chk(v, t);
    if (!(tau > 0)) throw new RangeError(`time constant ${tau}`);
    this.events.push({ kind: 'target', t, v }); return this;
  }
  setValueCurveAtTime(c: ArrayLike<number>, t: number, d: number) {
    this.chk(c[0] ?? 0, t);
    if (!(d > 0) || c.length < 2) throw new RangeError('bad curve');
    for (const e of this.events) if (e.t > t && e.t < t + d) throw new Error('NotSupportedError: curve overlaps an event');
    this.events.push({ kind: 'curve', t, v: c[c.length - 1]!, d }); return this;
  }
  cancelScheduledValues(t: number) { this.chk(0, t); this.events = this.events.filter((e) => e.t < t && !(e.kind === 'curve' && e.t + (e.d ?? 0) > t)); return this; }
  cancelAndHoldAtTime(t: number) { return this.cancelScheduledValues(t); }
}

export class FakeNode {
  readonly outs: unknown[] = [];
  constructor(readonly ctx: FakeContext, readonly kind: string) { ctx.created[kind] = (ctx.created[kind] ?? 0) + 1; ctx.nodes++; }
  connect<T>(d: T): T { if (!d) throw new TypeError('connect to nothing'); this.outs.push(d); return d; }
  disconnect(): void { this.outs.length = 0; }
}
class Scheduled extends FakeNode {
  onended: (() => void) | null = null;
  startT = -1; stopT = Infinity;
  start(t = 0) { if (this.startT >= 0) throw new Error('InvalidStateError: start twice'); if (!Number.isFinite(t) || t < 0) throw new RangeError(`start ${t}`); this.startT = t; this.ctx.live.add(this); }
  stop(t = 0) { if (this.startT < 0) throw new Error('InvalidStateError: stop before start'); if (!Number.isFinite(t)) throw new RangeError(`stop ${t}`); this.stopT = Math.min(this.stopT, Math.max(t, this.startT)); }
}
export class FakeOsc extends Scheduled { type = 'sine'; frequency = new FakeParam(440); detune = new FakeParam(0); constructor(c: FakeContext) { super(c, 'osc'); } }
export class FakeBufSrc extends Scheduled {
  buffer: FakeBuffer | null = null; loop = false; playbackRate = new FakeParam(1); detune = new FakeParam(0);
  constructor(c: FakeContext) { super(c, 'buffer'); }
}
export class FakeBuffer {
  private readonly data: Float32Array[];
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() { return this.length / this.sampleRate; }
  getChannelData(c: number) { return this.data[c]!; }
}

export class FakeContext {
  currentTime = 0;
  readonly sampleRate = 8000;          // small buffers keep the noise bank cheap in node
  state = 'running';
  created: Record<string, number> = {};
  nodes = 0;
  readonly live = new Set<Scheduled>();
  readonly destination: FakeNode;
  constructor() { this.destination = new FakeNode(this, 'destination'); }
  /** Live (started, not yet stopped) sources at the current time. */
  playing(): number { let n = 0; for (const s of this.live) { if (s.stopT <= this.currentTime) this.live.delete(s); else if (s.startT <= this.currentTime + 0.2) n++; } return n; }
  createGain() { return Object.assign(new FakeNode(this, 'gain'), { gain: new FakeParam(1) }); }
  readonly oscs: FakeOsc[] = [];
  createOscillator() { const o = new FakeOsc(this); this.oscs.push(o); if (this.oscs.length > 5000) this.oscs.splice(0, 2500); return o; }
  createBufferSource() { return new FakeBufSrc(this); }
  createBuffer(ch: number, len: number, sr: number) { return new FakeBuffer(ch, len, sr); }
  createBiquadFilter() { return Object.assign(new FakeNode(this, 'biquad'), { type: 'lowpass', frequency: new FakeParam(350), Q: new FakeParam(1), gain: new FakeParam(0), detune: new FakeParam(0) }); }
  createDelay(_max = 1) { return Object.assign(new FakeNode(this, 'delay'), { delayTime: new FakeParam(0) }); }
  createWaveShaper() { return Object.assign(new FakeNode(this, 'shaper'), { curve: null as Float32Array | null, oversample: 'none' }); }
  createStereoPanner() { return Object.assign(new FakeNode(this, 'panner'), { pan: new FakeParam(0) }); }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(this, 'compressor'), { threshold: new FakeParam(-24), ratio: new FakeParam(12), knee: new FakeParam(30), attack: new FakeParam(0.003), release: new FakeParam(0.25) });
  }
}
export const asCtx = (c: FakeContext) => c as unknown as BaseAudioContext;
