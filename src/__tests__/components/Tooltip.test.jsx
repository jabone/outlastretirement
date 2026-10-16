// @vitest-environment jsdom
// Tooltip popup renders through a portal (changelog 272).
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Tooltip from '../../components/Tooltip';

afterEach(cleanup);

describe('Tooltip', () => {
  it('opens into document.body, not inside the trigger, so no sidebar or scroll wrapper can cover it', () => {
    render(<div data-testid="host"><Tooltip text="Seeds decide the trials.">Trial seed</Tooltip></div>);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(screen.getByRole('button'));
    const popup = screen.getByRole('tooltip');
    expect(popup).toHaveTextContent('Seeds decide the trials.');
    expect(popup.parentElement).toBe(document.body);
    expect(screen.getByTestId('host').contains(popup)).toBe(false);
    expect(popup.style.position).toBe('fixed');
    fireEvent.mouseLeave(screen.getByRole('button'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('toggles from the keyboard and closes on Escape', () => {
    render(<Tooltip text="Help text">Label</Tooltip>);
    const trigger = screen.getByRole('button');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('appears in place (no transition to fly in from the corner) and its mark is one fixed size', () => {
    render(<Tooltip text="Help text">Label</Tooltip>);
    const trigger = screen.getByRole('button');
    const icon = trigger.querySelector('svg');
    expect(icon.style.flexShrink).toBe('0');
    expect(icon.style.width).toBe('14px');
    fireEvent.mouseEnter(trigger);
    const popup = screen.getByRole('tooltip');
    expect(popup.style.transition).toBe('none');
    expect(popup.style.animation).toBe('none');
    expect(popup.querySelector('.tooltip-content').style.transition).toBe('none');
  });

  it('the gap between trigger and card is part of the popup, so the mouse never crosses dead space', () => {
    render(<Tooltip text="Help text" position="bottom">Label</Tooltip>);
    fireEvent.mouseEnter(screen.getByRole('button'));
    const popup = screen.getByRole('tooltip');
    expect(popup.style.paddingTop).toBe('8px');
    expect(popup.querySelector('.tooltip-content')).not.toBeNull();
  });
});
