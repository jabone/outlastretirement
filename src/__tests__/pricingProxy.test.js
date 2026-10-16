import { describe, it, expect } from 'vitest';
import { applyProxyPrice, quoteSymbolFor, isLivePriced, createHolding } from '../utils/portfolioHoldings.js';

// A 401(k)'s "Institutional 500 Index Trust" has no ticker; VFFSX is the
// same portfolio in mutual-fund form, on a different per-unit price scale.
const trust = createHolding({
  symbol: 'VANGUARD-INSTITUTIONAL-500-INDEX', name: 'Vanguard Institutional 500 Index Trust',
  shares: 742.411, currentPrice: 120.10, manualPricing: true, pricingSymbol: 'VFFSX',
});

describe('pricing proxy ticker', () => {
  it('quotes the proxy instead of the unquotable symbol, and brings a manual holding back into live pricing', () => {
    expect(quoteSymbolFor(trust)).toBe('VFFSX');
    expect(isLivePriced(trust)).toBe(true);
    expect(isLivePriced({ ...trust, pricingSymbol: '' })).toBe(false);
    expect(quoteSymbolFor({ symbol: 'aapl' })).toBe('AAPL');
  });

  it('first sighting anchors the proxy against the holding price WITHOUT copying the proxy price', () => {
    const patch = applyProxyPrice(trust, 612.34, '2026-09-09');
    expect(patch.currentPrice).toBe(120.10);
    expect(patch.pricingAnchor).toEqual({ proxyPrice: 612.34, holdingPrice: 120.10, date: '2026-09-09' });
  });

  it('later sightings scale the holding price by the proxy return since the anchor', () => {
    const anchored = { ...trust, pricingAnchor: { proxyPrice: 600, holdingPrice: 120, date: '2026-09-01' } };
    expect(applyProxyPrice(anchored, 630).currentPrice).toBeCloseTo(126, 6);   // +5%
    expect(applyProxyPrice(anchored, 570).currentPrice).toBeCloseTo(114, 6);   // -5%
    expect(applyProxyPrice(anchored, 630).pricingAnchor).toEqual(anchored.pricingAnchor);
  });

  it('ignores a missing or zero proxy quote', () => {
    expect(applyProxyPrice(trust, 0)).toBeNull();
    expect(applyProxyPrice(trust, undefined)).toBeNull();
  });

  it('a holding with a $0 price re-anchors rather than scaling from nothing', () => {
    const zero = { ...trust, currentPrice: 0, pricingAnchor: { proxyPrice: 600, holdingPrice: 0, date: '2026-09-01' } };
    const patch = applyProxyPrice(zero, 630, '2026-09-09');
    expect(patch.currentPrice).toBe(0);
    expect(patch.pricingAnchor.proxyPrice).toBe(630);
  });
});
