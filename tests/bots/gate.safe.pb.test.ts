// Gate: safe bot, seeds 51–100 × 8 min from the plateau (startT 150; TECH §11.2; gate.safe.ts).
import { safeSuite } from './gate.safe';
import { PLATEAU_T, seedsFor } from './suites';
const all = seedsFor(100);
safeSuite('safe-plateau-b', all.slice(all.length / 2), PLATEAU_T);
