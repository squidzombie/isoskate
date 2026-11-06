// Gate: safe bot, seeds 1–50 × 8 min from t = 0 (TECH §11.2; gate.safe.ts).
import { safeSuite } from './gate.safe';
import { seedsFor } from './suites';
const all = seedsFor(100);
safeSuite('safe-t0-a', all.slice(0, all.length / 2));
