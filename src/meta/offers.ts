// meta/offers.ts: rewarded-offer eligibility (DESIGN §20, TECH §4.10 OfferPolicy). The UI shows an offer only if
// eligible() && provider.isAdReady(); with the v1 NullProvider nothing is ever ready, so no ad UI is visible.
// Rules: opt-in only; never mid-run (the UI asks only on Results / Crates); never in the first 3 runs or on the
// install day; results_double_coins needs ≥ 20 run coins, at most once per run and 5 per day; daily_gift_bonus once
// per day, after the day's gift was claimed. No revives, no interstitials, nothing that delays ROLL AGAIN.
import type { OfferPolicy, Placement } from '../core/platform';
import type { SaveV1 } from '../core/save';
import { OFFERS } from './economy.config';

export interface OfferCtx { runCoins: number; runsTotal: number; today: string }
/** What the policy reads from the save (a structural subset, so tests can pass plain objects). */
export interface OfferSaveView {
  installDay: string;
  daily: Pick<SaveV1['daily'], 'adsDay' | 'adsCount' | 'lastGiftDay'> & { giftBonusDay?: string | null };
}

export interface OfferPolicyExt extends OfferPolicy {
  /** Also refuses a second double-coins offer for the same run id. */
  eligibleFor(p: Placement, ctx: OfferCtx, runId?: string | null): boolean;
}

export function createOfferPolicy(save: () => OfferSaveView, usedRunId: () => string | null = () => null): OfferPolicyExt {
  const eligibleFor = (p: Placement, ctx: OfferCtx, runId?: string | null): boolean => {
    const s = save();
    if (ctx.runsTotal <= OFFERS.minRunsTotal) return false;          // runs 1–3: never
    if (ctx.today === s.installDay) return false;                     // never on the install day
    const adsToday = s.daily.adsDay === ctx.today ? s.daily.adsCount : 0;
    if (p === 'results_double_coins') {
      if (ctx.runCoins < OFFERS.results_double_coins.minRunCoins) return false;
      if (adsToday >= OFFERS.results_double_coins.perDay) return false;
      if (runId && usedRunId() === runId) return false;
      return true;
    }
    if (p === 'daily_gift_bonus') return s.daily.lastGiftDay === ctx.today && s.daily.giftBonusDay !== ctx.today;
    return false;
  };
  return { eligible: (p, ctx) => eligibleFor(p, ctx), eligibleFor };
}
