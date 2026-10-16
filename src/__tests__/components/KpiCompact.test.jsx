// @vitest-environment jsdom
//
// The phone KPI summary line (changelog 294): on every page but the
// Dashboard the five KPI cards collapse behind one line on a phone. The
// collapse is CSS-gated to the phone breakpoint, so here we check the
// markup contract the CSS relies on.
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import App from '../../App';

afterEach(cleanup);
beforeEach(() => { localStorage.clear(); window.location.hash = ''; });

const settle = () => act(() => new Promise((r) => setTimeout(r, 300)));
// Mounting the whole <App /> cold can exceed vitest's 5 s default when the
// full suite runs every file in parallel (seen 2026-10-01); same allowance
// as clearBalanceNestEgg.test.jsx's full-App render.
const FULL_APP = { timeout: 60000 };

describe('KPI strip on a phone', () => {
  it('the Dashboard shows the full strip and no summary line', FULL_APP, async () => {
    window.location.hash = '#/dashboard';
    render(<App />); await settle();
    expect(screen.queryByTestId('kpi-compact')).toBeNull();
    expect(document.getElementById('kpi-grid').className).not.toMatch(/kpi-collapsed/);
  });

  it('other pages show the summary line; tapping it opens the strip and the choice is remembered', FULL_APP, async () => {
    window.location.hash = '#/strategy';
    render(<App />); await settle();
    const line = screen.getByTestId('kpi-compact');
    expect(line.textContent).toMatch(/\/yr/);
    expect(line.textContent).toMatch(/Ends \$/);
    expect(line.textContent).toMatch(/On track|Mostly on track|At risk|Runs short|Checking markets|Lasts on average/);
    expect(line.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('kpi-grid').className).toMatch(/kpi-collapsed/);
    fireEvent.click(line);
    expect(line.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('kpi-grid').className).not.toMatch(/kpi-collapsed/);
    expect(localStorage.getItem('retire_plan_kpi_open_mobile')).toBe('true');
  });

  it('the collapse and the summary line only exist under the phone breakpoint', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8');
    const top = css.slice(0, css.indexOf('@media'));
    expect(top).toMatch(/\.kpi-compact \{\s*display: none;/);
    const phone = css.slice(css.indexOf('@media (max-width: 768px)'));
    expect(phone).toMatch(/\.kpi-grid\.kpi-collapsed \{\s*display: none !important;/);
    expect(phone).toMatch(/html, body \{\s*overflow-x: clip;/);
    expect(top).not.toMatch(/kpi-collapsed/);
  });

  it('the slide-out menu covers everything up to 900px, not just phones (foldables)', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8');
    const blocks = [...css.matchAll(/@media (screen and )?\(max-width: (\d+)px\) \{/g)].map((m) => ({ screen: Boolean(m[1]), w: Number(m[2]), at: m.index }));
    const topbarAt = css.search(/\n  \.mobile-topbar \{/);
    const owner = blocks.filter((b) => b.at < topbarAt).pop();
    expect(owner.w).toBe(900);
    // Screen only: a printed page is about 816px wide, and these rules
    // re-showed the off-canvas drawer on paper (changelog 300).
    expect(owner.screen).toBe(true);
  });
});
