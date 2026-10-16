// @vitest-environment jsdom
//
// Every overlay (Quick Update, the disclaimer, Print / PDF, the Setup
// Wizard, suggested changes, the maximized chart) opens in ModalShell. Before
// it, Escape did nothing, focus stayed on the button behind the overlay, Tab
// walked the page underneath, and the page behind still scrolled.
import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ModalShell from '../../components/ModalShell';

function Harness({ dismissible = true }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      {open && (
        <ModalShell onClose={() => setOpen(false)} dismissible={dismissible} labelledBy="t">
          <h2 id="t">Title</h2>
          <button>First</button>
          <button>Last</button>
        </ModalShell>
      )}
    </>
  );
}

describe('ModalShell', () => {
  it('is a labelled modal dialog that takes focus and locks the page scroll', () => {
    render(<Harness />);
    const opener = screen.getByText('Open it');
    opener.focus();
    fireEvent.click(opener);
    const dlg = screen.getByRole('dialog', { name: 'Title' });
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(dlg.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('Escape closes it, focus returns to the opener and the scroll lock lifts', () => {
    render(<Harness />);
    const opener = screen.getByText('Open it');
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });

  it('Tab from the last control wraps to the first', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Open it'));
    const last = screen.getByText('Last');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('First'));
  });

  it('a dialog that must be answered ignores Escape', () => {
    const onClose = vi.fn();
    render(<ModalShell onClose={onClose} dismissible={false} label="Must accept"><button>Accept</button></ModalShell>);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });
});
