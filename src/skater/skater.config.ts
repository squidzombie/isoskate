// skater/skater.config.ts: every skater, board and helmet tunable (DESIGN §18.5, TECH §8.5). Purely visual: the
// hitbox and physics live in core/tuning.ts and never read this file. Lengths in metres, angles in degrees.

/** Body proportions for the regular build at heightScale 1 (DESIGN §18.5: about 1.80 m to the helmet top,
 *  head radius 0.17, torso 0.48, legs 0.72, shoes 0.30 × 0.13). */
export const BODY = {
  headR: 0.17,
  headUp: 0.15,            // head bone (top of the neck) → head sphere centre
  neck: 0.07,
  torso: 0.48,             // hips bone → neck bone
  spineUp: 0.1,            // hips → spine bone
  chestUp: 0.2,            // spine → chest bone
  shoulderUp: 0.14,        // chest → shoulder line
  shoulderHalf: 0.175,     // half shoulder width (regular)
  upperArm: 0.25, foreArm: 0.23, hand: 0.08,
  hipHalf: 0.09, hipDown: 0.04,
  thigh: 0.36, shin: 0.34,
  ankleUp: 0.075,          // sole → ankle
  shoeLen: 0.3, shoeH: 0.13, shoeW: 0.115,
  shoeBack: 0.095,         // ankle → heel of the shoe (the toes extend shoeLen − shoeBack forward)
  /** Torso, limb and shoulder width factors per build. */
  build: { slim: 0.88, regular: 1.0, stocky: 1.16 } as Record<'slim' | 'regular' | 'stocky', number>,
  /** Limb radii (regular): upper arm, forearm, thigh, shin. Clothing widens them per item. */
  limbR: { upperArm: 0.052, foreArm: 0.045, thigh: 0.075, shin: 0.058 },
  torsoR: { hips: 0.15, waist: 0.15, chest: 0.175 },   // half-width across the shoulders axis
  torsoDepth: 0.74,        // front-to-back / side-to-side ratio of the torso cross-section
} as const;

/** Board (DESIGN §18.5): deck 0.80 × 0.21, nose and tail radius 0.105, depth 0.022; kicks beyond |x| > 0.30 rotate
 *  up 18°; concave y += 0.006 × (z / 0.105)²; trucks 0.19 × 0.03 × 0.035 hangers; 8-sided wheels r 0.028. */
export const BOARD = {
  len: 0.8, width: 0.21, endR: 0.105, depth: 0.022,
  kickX: 0.3, kickDeg: 18, concave: 0.006,
  /** Deck centre above the board bottom (wheel contact) at rest. */
  deckY: 0.098,
  truckZ: 0.235,           // truck axle distance from the deck centre (along the board)
  hanger: { w: 0.19, h: 0.03, d: 0.035 },
  baseplate: { w: 0.07, h: 0.012, d: 0.06 },
  wheelR: 0.028, wheelW: 0.032, wheelSides: 8,
  /** Length stations of the deck mesh (|x| from the centre; the tips close the round ends). */
  stations: [0, 0.15, 0.295, 0.33, 0.36, 0.383, 0.396],
  /** Foot targets on the deck, along the board (− = nose): front bolts and the tail. */
  frontZ: -0.2, backZ: 0.28,
  /** Ankle offset toward the heel side of the deck, so the shoe sits across the deck. */
  heelShift: 0.05,
  footYawFront: 22, footYawBack: -6,
} as const;

/** Spring blending (DESIGN §18.5): critically damped, ω = 18 rad/s, 30 for pop and landing. */
export const SPRING = { omega: 18, omegaFast: 30, fakiePivot: 26 } as const;

/** DESIGN §18.5 pose table values, plus the view-side oscillators. */
export const POSE = {
  roll: { knee: 15, hipDrop: 0.04, armAbd: 32, armFlex: 24, headTurn: 80, spineTwist: 14, chestTwist: 46, bobHz: 0.6, bobAmp: 0.015 },
  carve: { leanMax: 22, toeKnee: 30, heelHipBack: 0.06, armCounter: 15 },
  pop: { backKnee: 8, frontKnee: 70, boardPitch: 25, stretch: 1.06, frontLift: 0.08 },
  tuck: { knee: 85, footLift: 0.22, armAbd: 45 },
  flip: { shoulderTwist: 15, catchAt: 0.8, catchLift: 0.06 },
  grab: { knee: 95 },
  land: { dip: 0.15, dipIn: 0.08, dipOut: 0.22, knee: 55, squash: 0.94 },
  manual: { pitch: 12, swayHz: 1.2, swayDeg: 20 },
  grind: { knee: 25, armAbd: 60 },
  sketchy: { windmillHz: 2, dur: 0.3 },
  idle: { knee: 8, armAbd: 10, breatheHz: 0.25, swayDeg: 3 },
  /** Gus's `upright` style: knees and bends scaled by this factor. */
  upright: 0.35,
} as const;

/** Crash tumble (DESIGN §18.5): forward + 3 m/s up, spin 3–6 rad/s about a seeded axis, limbs flail with 4 Hz noise
 *  ±40°; the board flies off with its own spin and bounces with restitution 0.3; the helmet stays on. */
export const CRASH = {
  up: 3, fwdFactor: 0.45, fwdMax: 4.5, spinMin: 3, spinMax: 6,
  flailHz: 4, flailDeg: 40, gravity: 14, restitution: 0.3, friction: 0.55, bodyR: 0.22,
  settleTau: 0.25,         // angular settling once on the ground
  board: { up: 2.6, fwdFactor: 0.75, side: 1.6, spinMin: 9, spinMax: 15, r: 0.05 },
  step: 1 / 120,           // view-side integration step (deterministic from the crash time)
  maxT: 4,
} as const;

/** Outline twins (DESIGN §18.4: inverted hull, ink, 0.025 m), widened to a minimum on-screen width so the skater
 *  keeps its ink line at top speed (31 px tall), capped so tiny parts never balloon. */
export const OUTLINE = { color: 0x2b2140, width: 0.025, minPx: 0.85, maxWidth: 0.05 } as const;

/** Toon ramp (DESIGN §18.2) and the rim light that lifts the skater off the mid-value street. */
export const SHADE = {
  ramp: [0.35, 0.7, 1.0] as const,
  rimColor: 0xffe2b8, rimStrength: 0.45, rimPower: 2.6,
  /** Albedo multiplier (sRGB hex): keeps light, saturated cloth out of the ACES shoulder so hues survive. */
  albedo: 0xd6d6d6,
  glossSpec: 0.35,
} as const;

/** Blink every 3–6 s (DESIGN §18.5). */
export const BLINK = { min: 3, max: 6, dur: 0.12 } as const;

/** Effects with static fallbacks (DESIGN §15; bespoke animation is M5 stretch). */
export const FX = {
  seamHz: 0.5, seamA: 0xff3fa4, seamB: 0x3ff2ff,      // Aki's lightSeams
  stripMin: 0.2, stripMax: 1.2,                        // Vesper's reflectiveStrips, toward dusk
  lanternMin: 0.2, lanternMax: 1.0,                    // Paper Lantern helmet, toward blue hour
  boardGlow: 0.8,                                      // emissive board finishes (Lantern Row's lanterns)
  waveDur: 0.9,                                        // Gus waves at the camera on Perfect landings
  hemKick: 14, hemOmega: 9,                            // Lark's coat hem sway on landings (deg, rad/s)
  earFlickDur: 0.35, petalBobDur: 0.4,
  fishOrbitHz: 0.25,
  sunLoop: 6,                                          // Glide Ring's sun rises and sets on a 6 s loop
} as const;

/** Showcase (Locker / Shop turntable): slow idle plus a trick preview loop. */
export const SHOWCASE = {
  facingDeg: -90,          // root yaw that turns the body toward +z (the locker camera) at turntable 0
  loop: 5.5,               // seconds between trick previews
  hop: 0.32, air: 0.62,    // preview hop apex (m) and airtime (s), small enough to stay in frame
  idleSpin: 0,             // deg/s automatic turntable (0: the Locker drag owns it)
} as const;

/** Budgets (ROADMAP W2b acceptance, TECH §8.4): skater + board + helmet including outline twins. */
export const BUDGET = { drawCalls: 8, tris: 3500, switchMs: 30 } as const;

/** Texture sizes (TECH §8.4): skater atlas 256², board graphic 512 × 128, helmet decal 256 × 128, grip 128². */
export const TEX = { atlas: 256, face: 64, deckW: 512, deckH: 128, decalW: 256, decalH: 128, grip: 128 } as const;
