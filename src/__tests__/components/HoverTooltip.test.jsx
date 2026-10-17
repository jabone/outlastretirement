// @vitest-environment jsdom
// HoverTooltip names an icon-only control after its tip; a control that
// already shows its name as text keeps that name and gets the tip as a
// description (WCAG 2.5.3, label in name).
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import HoverTooltip from '../../components/HoverTooltip';

afterEach(cleanup);

describe('HoverTooltip', () => {
  it('names an icon-only control after the tip', () => {
    render(<HoverTooltip text="Maximize Chart"><button><svg /></button></HoverTooltip>);
    const btn = screen.getByRole('button', { name: 'Maximize Chart' });
    expect(btn).toHaveAttribute('aria-label', 'Maximize Chart');
    expect(btn).not.toHaveAttribute('aria-description');
  });

  it('leaves a name the control already has alone', () => {
    render(<HoverTooltip text="Minimize Sidebar"><button aria-label="Collapse"><svg /></button></HoverTooltip>);
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
  });

  it('`labeled`: the visible words stay the name and the tip becomes the description', () => {
    render(<HoverTooltip text="Balances, salary and claiming age" labeled><button><span>Quick Update</span></button></HoverTooltip>);
    const btn = screen.getByRole('button', { name: 'Quick Update' });
    expect(btn).not.toHaveAttribute('aria-label');
    expect(btn).toHaveAttribute('aria-description', 'Balances, salary and claiming age');
  });

  it('`labeled` adds no text to the control, so textContent is still the words on screen', () => {
    render(<HoverTooltip text="Open the Premium page" labeled><button><span>Premium</span></button></HoverTooltip>);
    expect(screen.getByRole('button', { name: 'Premium' }).textContent).toBe('Premium');
  });
});
