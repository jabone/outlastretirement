// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import BackgroundWorkIndicator from '../../components/BackgroundWorkIndicator';

describe('BackgroundWorkIndicator', () => {
  it('appears after a moment while the Monte Carlo runs, with how far it has got', () => {
    vi.useFakeTimers();
    render(<BackgroundWorkIndicator mcLoading mcProgress={0.42} trials={1000} heavyLoading={false} />);
    expect(screen.queryByTestId('background-work')).toBeNull();
    act(() => { vi.advanceTimersByTime(800); });
    expect(screen.getByRole('status').textContent).toMatch(/Simulated markets: running 1,000… 42%/);
    vi.useRealTimers();
  });

  it('says the history checks are running, and shows nothing when idle', () => {
    vi.useFakeTimers();
    const { rerender } = render(<BackgroundWorkIndicator mcLoading={false} heavyLoading />);
    act(() => { vi.advanceTimersByTime(800); });
    expect(screen.getByRole('status').textContent).toMatch(/History checks and optimizers: running/);
    rerender(<BackgroundWorkIndicator mcLoading={false} heavyLoading={false} />);
    expect(screen.queryByTestId('background-work')).toBeNull();
    vi.useRealTimers();
  });
});
