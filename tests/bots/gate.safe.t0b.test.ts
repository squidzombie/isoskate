// Gate: safe bot, seeds 51–100 × 8 min from t = 0 (TECH §11.2; gate.safe.ts).
import { safeSuite } from './gate.safe';
import { seedsFor } from './suites';
const all = seedsFor(100);
safeSuite('safe-t0-b', all.slice(all.length / 2));
