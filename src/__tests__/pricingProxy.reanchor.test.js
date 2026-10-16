// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from "@testing-library/react";
import { usePortfolioHoldings } from '../context/usePortfolioHoldings';

describe('updateHolding re-anchors a proxy-priced holding when its price is set directly', () => {
  it('clears pricingAnchor on a currentPrice patch, keeps it when Refresh supplies a new anchor', () => {
    localStorage.clear();
    const { result } = renderHook(() => usePortfolioHoldings(true));
    act(() => {
      result.current.addHoldings([{ id: 'h1', symbol: 'TRUST', shares: 1, currentPrice: 100, manualPricing: true, pricingSymbol: 'VFFSX', pricingAnchor: { proxyPrice: 600, holdingPrice: 100, date: '2026-09-01' } }]);
    });
    // Statement import / manual edit: price set without an anchor -> re-anchor.
    act(() => { result.current.updateHolding('h1', { currentPrice: 110 }); });
    expect(result.current.holdings.find((h) => h.id === 'h1').pricingAnchor).toBeNull();
    // Refresh: price + anchor together -> anchor kept.
    act(() => { result.current.updateHolding('h1', { currentPrice: 115, pricingAnchor: { proxyPrice: 650, holdingPrice: 110, date: '2026-09-09' } }); });
    expect(result.current.holdings.find((h) => h.id === 'h1').pricingAnchor.proxyPrice).toBe(650);
    // No proxy: a price patch leaves the (absent) anchor untouched.
    act(() => { result.current.addHoldings([{ id: 'h2', symbol: 'AAPL', shares: 1, currentPrice: 100 }]); });
    act(() => { result.current.updateHolding('h2', { currentPrice: 101 }); });
    expect('pricingAnchor' in result.current.holdings.find((h) => h.id === 'h2')).toBe(false);
  });
});
