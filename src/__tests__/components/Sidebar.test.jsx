// @vitest-environment jsdom
//
// Phase 0 proof-of-concept for the component-testing harness (see
// UI_TEST_COVERAGE_PLAN.md). Sidebar.jsx was picked as the first target
// because it's a good stress test of renderWithSimulation(): it reads 15
// separate context keys AND takes its own local props (isSidebarOpen, etc.)
// on top of that -- if the harness can render this without throwing, it can
// render most of the simpler tab components too.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, render } from '@testing-library/react';
import Sidebar from '../../components/layout/Sidebar';
import { renderWithSimulation } from '../testUtils';

// Sidebar's own local props (distinct from useSimulation() context) --
// factored out so each test only overrides what it cares about.
const baseProps = {
  isSidebarOpen: true,
  setIsSidebarOpen: vi.fn(),
  setShowSetupInstructions: vi.fn(),
  setOnboardingStep: vi.fn(),
  setShowOnboarding: vi.fn(),
  showDisclaimer: false,
  isMobileNavOpen: false,
  setIsMobileNavOpen: vi.fn(),
};

describe('Sidebar (component harness smoke test)', () => {
  beforeEach(() => { localStorage.clear(); });

  it('shows the six everyday entries, with the rest behind Explore more (changelog 287)', () => {
    renderWithSimulation(<Sidebar {...baseProps} />);
    ['Dashboard', 'Plan', 'Retirement Readiness', 'Year by Year', 'Premium', 'Help'].forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    // A free user's locked entry is named for the page it opens, the
    // Premium page, not for one area of it (changelog 366).
    expect(screen.queryByText('Detailed Holdings')).toBeNull();
    ['Tax & Estate', 'Optimizers', 'Risk & Stress', 'Scenarios', 'Preferences', 'What Will You Do?'].forEach(label => {
      expect(screen.queryByText(label)).toBeNull();
    });
    expect(screen.getByTestId('nav-more-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('Explore more opens the rest, remembers the choice, and Explore less closes it', () => {
    renderWithSimulation(<Sidebar {...baseProps} />);
    fireEvent.click(screen.getByTestId('nav-more-toggle'));
    ['Tax & Estate', 'Optimizers', 'Risk & Stress', 'Scenarios', 'Preferences', 'What Will You Do?'].forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(localStorage.getItem('retire_plan_nav_more_open')).toBe('true');
    fireEvent.click(screen.getByText('Explore less'));
    expect(screen.queryByText('Optimizers')).toBeNull();
    expect(localStorage.getItem('retire_plan_nav_more_open')).toBe('false');
  });

  it('opens itself when the current tab lives inside it, so a deep link never lands on a hidden entry', () => {
    renderWithSimulation(<Sidebar {...baseProps} />, { activeTab: 'risk' });
    expect(screen.getByText('Risk & Stress').closest('[role="button"]')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('nav-more-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  it('marks the current activeTab (from context) with aria-current, via an override', () => {
    renderWithSimulation(<Sidebar {...baseProps} />, { activeTab: 'taxestate' }); // inside Explore more: opens itself
    const taxEstateItem = screen.getByText('Tax & Estate').closest('[role="button"]');
    expect(taxEstateItem).toHaveAttribute('aria-current', 'page');
    const dashboardItem = screen.getByText('Dashboard').closest('[role="button"]');
    expect(dashboardItem).not.toHaveAttribute('aria-current');
  });

  it('clicking a nav item calls setActiveTab with that tab\'s id', () => {
    const setActiveTab = vi.fn();
    renderWithSimulation(<Sidebar {...baseProps} />, { setActiveTab });
    fireEvent.click(screen.getByText('Year by Year'));
    expect(setActiveTab).toHaveBeenCalledWith('yearledger');
  });

  it('throws a clear error if rendered without the SimulationContext provider, confirming useSimulation()\'s guard is intact', () => {
    // Deliberately uses plain render() instead of renderWithSimulation --
    // this proves the harness is actually doing something (supplying the
    // context), rather than the component secretly not needing it.
    const originalConsoleError = console.error;
    console.error = () => {}; // React logs the thrown error to console; silence it for this expected-failure test
    expect(() => {
      render(<Sidebar {...baseProps} />);
    }).toThrow('useSimulation must be used within a SimulationProvider');
    console.error = originalConsoleError;
  });
});

describe('Sidebar — one Plan entry for the two Plan views (changelog 252)', () => {
  it('opens Plan Settings by default and marks Plan active for either Plan tab', () => {
    localStorage.removeItem('retire_plan_plan_mode');
    const setActiveTab = vi.fn();
    renderWithSimulation(<Sidebar {...baseProps} />, { setActiveTab, activeTab: 'interview' });
    expect(screen.getByText('Plan').closest('[role="button"]')).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByText('Plan'));
    expect(setActiveTab).toHaveBeenCalledWith('settings');
  });

  it('opens the Guided view when that was the last one used', () => {
    localStorage.setItem('retire_plan_plan_mode', 'guided');
    const setActiveTab = vi.fn();
    renderWithSimulation(<Sidebar {...baseProps} />, { setActiveTab });
    fireEvent.click(screen.getByText('Plan'));
    expect(setActiveTab).toHaveBeenCalledWith('interview');
    localStorage.removeItem('retire_plan_plan_mode');
  });
});
