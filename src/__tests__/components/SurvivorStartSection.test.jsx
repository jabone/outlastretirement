// @vitest-environment jsdom
// The survivor start-age setting and its comparison on Plan -> Income.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, cleanup } from '@testing-library/react';
import SurvivorStartSection from '../../components/plan/sections/SurvivorStartSection.jsx';
import { renderWithSimulation } from '../testUtils.jsx';
import { DEFAULT_INPUTS } from '../../calculator.js';
import { REFERENCE_INPUTS } from '../referenceHousehold';

afterEach(cleanup);

const ray = {
  ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, planYear: 2026, stateTaxState: 'none',
  spouse2Enabled: true, spouse1Name: 'Ray', spouse2Name: 'Angie',
  birthYear1: 1964, birthYear2: 1966, retireAge1: 62, retireAge2: 60, salary1: 0, salary2: 0,
  claimingAge1: 62, claimingAge2: 67, ss1: 30000, ss2: 8000, lifeExpectancy1: 90, lifeExpectancy2: 92,
  survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 62,
  preTaxInit: 900000, rothInit: 100000, taxableInit: 100000, lifestyleExpense: 55000,
};

describe('SurvivorStartSection', () => {
  it('is not shown in a one-person plan', () => {
    renderWithSimulation(<SurvivorStartSection />, { inputs: { ...ray, spouse2Enabled: false } });
    expect(screen.queryByTestId('survivor-start-panel')).toBeNull();
  });

  it('offers a start age for each person, as soon as possible by default', () => {
    renderWithSimulation(<SurvivorStartSection />, { inputs: ray });
    expect(screen.getByLabelText('Ray starts a survivor benefit').value).toBe('0');
    expect(screen.getByLabelText('Angie starts a survivor benefit').value).toBe('0');
    expect(screen.getAllByRole('option', { name: /At 67 \(full retirement age\)/, hidden: true })).toHaveLength(2);
  });

  it('compares the start ages and can use one', () => {
    const updateInput = vi.fn();
    renderWithSimulation(<SurvivorStartSection />, { inputs: ray, updateInput });
    fireEvent.click(screen.getByTestId('survivor-start-compare'));
    expect(screen.getByTestId('survivor-start-result').textContent).toMatch(/Ray dies at 62 \(the Survivor Stress Test\), when Angie is 61/);
    expect(screen.getByTestId('survivor-start-row-61')).toBeTruthy();
    expect(screen.getByTestId('survivor-start-row-63')).toBeTruthy();
    expect(screen.queryByTestId('survivor-start-row-64')).toBeNull();
    expect(screen.getByText(/stops growing at 63/)).toBeTruthy();
    expect(screen.getByText('Best for this plan')).toBeTruthy();
    fireEvent.click(screen.getByTestId('survivor-start-row-63').querySelector('button'));
    expect(updateInput).toHaveBeenCalledWith('survivorStartAge2', 63);
  });

  it('says when the start age changes nothing', () => {
    renderWithSimulation(<SurvivorStartSection />, { inputs: { ...ray, survivorStressEnabled: false } });
    fireEvent.click(screen.getByTestId('survivor-start-compare'));
    expect(screen.getByTestId('survivor-start-result').textContent).toMatch(/past full retirement age/);
  });
});
