// @vitest-environment jsdom
// Remembered fold state (changelog 270).
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS } from '../../calculator';
import RothConversionSection from '../../components/plan/sections/RothConversionSection';
import { FOLD_STATE_KEY, readFoldState, writeFoldState } from '../../components/plan/foldState';

beforeEach(() => localStorage.clear());
const field = (id) => document.getElementById(id);

describe('useFoldState through a real section', () => {
  it('starts from the plan-derived default, remembers a hand toggle, and restores it on the next mount', () => {
    renderWithSimulation(<RothConversionSection />);
    expect(field('field-rothConversionStrategy')).toBeNull(); // closed: no strategy on
    fireEvent.click(screen.getByText('Roth Conversion Optimization'));
    expect(field('field-rothConversionStrategy')).not.toBeNull();
    expect(readFoldState().rothConversion).toBe(true);
    // A fresh mount (a new visit) comes back open.
    document.body.innerHTML = '';
    renderWithSimulation(<RothConversionSection />);
    expect(field('field-rothConversionStrategy')).not.toBeNull();
    // Close it, and that is remembered too.
    fireEvent.click(screen.getByText('Roth Conversion Optimization'));
    expect(readFoldState().rothConversion).toBe(false);
  });

  it('a remembered choice beats the plan-derived default, but forceOpen beats both and is never written', () => {
    writeFoldState('rothConversion', false);
    renderWithSimulation(<RothConversionSection />, { inputs: { ...DEFAULT_INPUTS, rothConversionStrategy: 'fixed' } });
    expect(field('field-rothConversionStrategy')).toBeNull();
    document.body.innerHTML = '';
    renderWithSimulation(<RothConversionSection forceOpen />);
    expect(field('field-rothConversionStrategy')).not.toBeNull();
    fireEvent.click(screen.getByText('Roth Conversion Optimization'));
    expect(readFoldState().rothConversion).toBe(false); // unchanged by the forced instance
  });

  it('survives garbage in storage', () => {
    localStorage.setItem(FOLD_STATE_KEY, '{oops');
    expect(readFoldState()).toEqual({});
    renderWithSimulation(<RothConversionSection />);
    expect(screen.getByText('Roth Conversion Optimization')).toBeInTheDocument();
  });
});
