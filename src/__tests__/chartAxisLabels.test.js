import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compactDollars } from '../utils/compactDollars';

// Changelog 386. The savings charts labeled their left axis with one
// decimal of a million, so evenly spaced gridlines at $150k, $300k, $450k
// and $600k read "$0.1M, $0.3M, $0.5M, $0.6M": uneven steps on an even grid.
describe('chart dollar axes', () => {
  it('labels an evenly spaced sub-million axis with evenly spaced figures', () => {
    expect([0, 150000, 300000, 450000, 600000].map((v) => compactDollars(v)))
      .toEqual(['$0', '$150k', '$300k', '$450k', '$600k']);
  });

  it('keeps quarter-million steps apart above a million', () => {
    expect([750000, 1500000, 2250000, 3000000].map((v) => compactDollars(v)))
      .toEqual(['$750k', '$1.5M', '$2.25M', '$3M']);
  });

  it('no chart rounds its axis to one decimal of a million', () => {
    const src = readFileSync('src/components/LazyCharts.jsx', 'utf8');
    expect(src).not.toMatch(/tickFormatter=\{[^}]*toFixed\(1\)\}M/);
  });
});
