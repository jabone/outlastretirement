// @vitest-environment jsdom
// Changelog 515: the Virginia deduction hold is said where Virginia is chosen.
import { describe, it, expect } from 'vitest';
import { REFERENCE_INPUTS as DEFAULT_INPUTS } from '../referenceHousehold';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
vi.mock('../../context/useSimulation', () => ({ useSimulation: () => globalThis.__simValue }));
import StateTaxesSection from '../../components/plan/sections/StateTaxesSection';

describe('the Virginia note in Settings', () => {
  it('shows the schedule and the 2030 hold only for Virginia', () => {
    globalThis.__simValue = { inputs: { ...DEFAULT_INPUTS, stateTaxState: 'va', stateOfResidence: 'VA' }, updateInput: () => {} };
    const { unmount } = render(<StateTaxesSection />);
    const note = screen.getByTestId('va-deduction-note');
    expect(note.textContent).toContain('$18,400 for a married couple in 2027 and $18,600 in 2028 and 2029');
    expect(note.textContent).toContain('drops it to $6,000 from 2030; this plan keeps the 2029 amount');
    unmount();
    globalThis.__simValue = { inputs: { ...DEFAULT_INPUTS, stateTaxState: 'pa', stateOfResidence: 'PA' }, updateInput: () => {} };
    render(<StateTaxesSection />);
    expect(screen.queryByTestId('va-deduction-note')).toBeNull();
  });
});
