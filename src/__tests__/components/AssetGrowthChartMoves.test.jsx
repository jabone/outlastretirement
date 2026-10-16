// @vitest-environment jsdom
//
// Changelog 202: planned moves are marked on the Portfolio Projection
// chart. The markers themselves render inside Recharts' SVG, which jsdom
// does not lay out, so these tests pin the legend -- which appears exactly
// when there is a move of that kind -- and that the moves come through the
// engine's own normalizer (a junk entry the engine drops is not marked).
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { AssetGrowthChart } from '../../components/LazyCharts.jsx';
import { DEFAULT_INPUTS, runProjection } from '../../calculator';

afterEach(cleanup);
const START = DEFAULT_INPUTS.planYear;
const chart = (residencyTimeline) => {
  const inputs = { ...DEFAULT_INPUTS, residencyTimeline };
  render(<AssetGrowthChart data={runProjection(inputs).years} inputs={inputs} taxesOverlay lifestyleOverlay={false} />);
};

describe('moves on the Portfolio Projection chart', () => {
  it('no moves, no move legend', () => {
    chart([]);
    expect(screen.queryByText('Move Abroad')).toBeNull();
    expect(screen.queryByText('Move to Another State')).toBeNull();
  });
  it('a move abroad', () => {
    chart([{ id: 'it', fromYear: START + 5, kind: 'foreign', countryName: 'Italy', foreign: { roth: 'respect' } }]);
    expect(screen.getByText('Move Abroad')).toBeTruthy();
    expect(screen.queryByText('Move to Another State')).toBeNull();
  });
  it('a move between states', () => {
    chart([{ fromYear: START + 3, stateOfResidence: 'FL' }]);
    expect(screen.getByText('Move to Another State')).toBeTruthy();
    expect(screen.queryByText('Move Abroad')).toBeNull();
  });
  it('an entry the engine drops is not a move', () => {
    chart([{ fromYear: START + 3, stateOfResidence: 'not a state' }]);
    expect(screen.queryByText('Move to Another State')).toBeNull();
  });
});

describe('the move markers are icons (changelog 274)', () => {
  it('a move abroad draws a plane, a move between states a flag -- lucide SVGs, not emoji', () => {
    chart([{ id: 'it', fromYear: START + 5, kind: 'foreign', countryName: 'Italy', foreign: { roth: 'respect', presetId: 'IT' } }]);
    const abroad = screen.getByText('Move Abroad').querySelector('svg');
    expect(abroad).not.toBeNull();
    expect(abroad.getAttribute('class')).toMatch(/lucide-plane/);
    cleanup();
    chart([{ fromYear: START + 3, stateOfResidence: 'FL' }]);
    const state = screen.getByText('Move to Another State').querySelector('svg');
    expect(state.getAttribute('class')).toMatch(/lucide-flag/);
  });
});
