// core/platform.ts (TECH §4.10). FROZEN CONTRACT: verbatim from TECH §4; change only via docs/core-requests.md.
export interface Haptics { enabled: boolean; pulse(pattern: number | number[]): void }  // vibrate now; native bridge later
export type Placement = 'results_double_coins' | 'daily_gift_bonus';
export type Sku = 'ad_free_pass' | 'coins_s' | 'coins_m' | 'coins_l' | 'supporter_pack';
export interface Product { sku: Sku; title: string; priceLabel: string }
export type PurchaseResult =
  | { ok: true; sku: Sku; transactionId: string }
  | { ok: false; sku: Sku; reason: 'cancelled' | 'failed' | 'unavailable' };
export interface MonetizationProvider {
  readonly kind: 'null' | 'fake' | 'native';
  init(): Promise<void>;
  isAdReady(p: Placement): boolean;
  showRewarded(p: Placement): Promise<'rewarded' | 'skipped' | 'unavailable'>;
  products(): Promise<Product[]>;
  purchase(sku: Sku): Promise<PurchaseResult>;
  restore(): Promise<Sku[]>;
}
/** meta/offers.ts implements this. The UI shows an offer only if eligible() && provider.isAdReady(). */
export interface OfferPolicy { eligible(p: Placement, ctx: { runCoins: number; runsTotal: number; today: string }): boolean }
export interface Analytics {
  track(event: string, props?: Record<string, string | number | boolean | object>): void;
  setOptOut(on: boolean): void;
  buffer(): readonly { e: string; t: number; p?: object }[];
}
export interface AnalyticsSink { flush(events: readonly object[]): Promise<void> }   // future uploader
