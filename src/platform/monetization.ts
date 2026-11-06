// platform/monetization.ts: MonetizationProvider (TECH §4.10, DESIGN §20). MU owns this file from W3a.
// v1 ships NullProvider (ad UI hidden). ?fakeads=1 selects FakeProvider for development.
import type { MonetizationProvider, Placement, Product, PurchaseResult, Sku } from '../core/platform';

export const NullProvider: MonetizationProvider = {
  kind: 'null',
  init: async () => undefined,
  isAdReady: () => false,
  showRewarded: async () => 'unavailable',
  products: async () => [],
  purchase: async (sku: Sku): Promise<PurchaseResult> => ({ ok: false, sku, reason: 'unavailable' }),
  restore: async () => [],
};

function fakeProvider(): MonetizationProvider {
  const products: Product[] = [
    { sku: 'ad_free_pass', title: 'Ad-Free Pass', priceLabel: '$3.99' },
    { sku: 'coins_s', title: '1,200 coins', priceLabel: '$0.99' },
    { sku: 'coins_m', title: '7,000 coins', priceLabel: '$4.99' },
    { sku: 'coins_l', title: '15,000 coins', priceLabel: '$9.99' },
    { sku: 'supporter_pack', title: 'Supporter Pack', priceLabel: '$6.99' },
  ];
  let n = 0;
  return {
    kind: 'fake',
    init: async () => undefined,
    isAdReady: (_p: Placement) => true,
    showRewarded: () => new Promise((r) => setTimeout(() => r('rewarded'), 800)),
    products: async () => products,
    purchase: async (sku) => ({ ok: true, sku, transactionId: `fake-${++n}` }),
    restore: async () => [],
  };
}

export function createMonetizationImpl(flags: { fakeAds: boolean }): MonetizationProvider {
  return flags.fakeAds ? fakeProvider() : NullProvider;
}
