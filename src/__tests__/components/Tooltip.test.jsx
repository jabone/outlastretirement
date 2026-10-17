// @vitest-environment jsdom
// Tooltip popup renders through a portal (changelog 272).
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Tooltip from '../../components/Tooltip';
import SimulationContext from '../../context/SimulationContext';

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

describe('Tooltip from the keyboard, with a Look-it-up link', () => {
  const renderWithLink = () => {
    const openDictionary = vi.fn();
    render(
      <SimulationContext.Provider value={{ openDictionary, dictionaryQuery: '' }}>
        <button>before</button>
        <Tooltip text="The order of returns matters." more="sequence-of-returns">sequence risk</Tooltip>
        <button>after</button>
      </SimulationContext.Provider>,
    );
    return openDictionary;
  };

  it('the visible words are the name and the definition its description, not an aria-label over the words', () => {
    render(<Tooltip text="Seeds decide the trials.">Trial seed</Tooltip>);
    const trigger = screen.getByRole('button', { name: 'Trial seed' });
    expect(trigger).not.toHaveAttribute('aria-label');
    expect(trigger).toHaveAttribute('aria-description', 'Seeds decide the trials.');
  });

  it('Tab from the open trigger moves into the link (the portal put it at the end of the page)', () => {
    renderWithLink();
    const trigger = screen.getByRole('button', { name: 'sequence risk' });
    trigger.focus(); fireEvent.focus(trigger); // focus opens the popup
    const link = screen.getByRole('button', { name: /Look it up/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(trigger, { key: 'Tab' });
    expect(document.activeElement).toBe(link);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('Tab, Shift+Tab or Escape on the link closes the popup and returns focus to the trigger', () => {
    renderWithLink();
    const trigger = screen.getByRole('button', { name: 'sequence risk' });
    for (const key of [{ key: 'Tab' }, { key: 'Tab', shiftKey: true }, { key: 'Escape' }]) {
      trigger.focus(); fireEvent.focus(trigger);
      fireEvent.keyDown(trigger, { key: 'Tab' });
      const link = screen.getByRole('button', { name: /Look it up/ });
      expect(document.activeElement).toBe(link);
      fireEvent.keyDown(link, key);
      expect(screen.queryByRole('tooltip')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('Tab with the popup closed, or with no link to reach, is left to the browser', () => {
    renderWithLink();
    const trigger = screen.getByRole('button', { name: 'sequence risk' });
    trigger.focus(); fireEvent.focus(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' }); // closed, still focused
    expect(fireEvent.keyDown(trigger, { key: 'Tab' })).toBe(true); // not prevented
    render(<Tooltip text="Plain help.">label</Tooltip>);
    const plain = screen.getByRole('button', { name: 'label' });
    plain.focus(); fireEvent.focus(plain); // open, but there is no link to reach
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(fireEvent.keyDown(plain, { key: 'Tab' })).toBe(true);
  });
});
