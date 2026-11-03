// The Will It Last? card says one line; the rest opens on request
// (changelog 481).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { planVerdict } from '../utils/planVerdict';

const hist = { lasted: 65, count: 75, firstStart: 1928 };

describe('the one-line answer', () => {
  it('names both measures when both are in', () => {
    const v = planVerdict({ isSuccessful: true, mc: { status: 'fresh', successProbability: 52 }, history: hist });
    expect(v.label).toBe('At risk');
    expect(v.short).toBe('Lasts in 52% of simulated markets and 65 of 75 real retirements since 1928.');
    expect(v.detail.length).toBeGreaterThan(v.short.length);
  });
  it('the simulated markets alone, before the history check is in', () => {
    expect(planVerdict({ isSuccessful: true, mc: { status: 'fresh', successProbability: 95 } }).short).toBe('Lasts in 95% of simulated markets.');
  });
  it('the history alone, before the simulated markets are in', () => {
    expect(planVerdict({ isSuccessful: true, history: hist }).short).toBe('Lasts in 65 of 75 real retirements since 1928.');
  });
  it('a plan that runs short says when', () => {
    const v = planVerdict({ isSuccessful: false, years: [{ year: 2050, shortfall: 0 }, { year: 2051, shortfall: 900 }] });
    expect(v.short).toBe('Even with average returns, the money runs out in 2051.');
  });
  it('nothing to say yet: the card falls back to the detail', () => {
    expect(planVerdict({ isSuccessful: true }).short).toBeNull();
  });
});

describe('the card', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '..', 'App.jsx'), 'utf8');
  it('shows the short line and opens the rest in a dialog', () => {
    expect(app).toMatch(/\{verdict\.short \|\| verdict\.detail\}/);
    expect(app).toMatch(/data-testid="verdict-details-open"/);
    const dialog = app.slice(app.indexOf('data-testid="verdict-details"'));
    for (const id of ['verdict-plain', 'verdict-assumes', 'trust-fund-line', 'untested-risks']) expect(dialog).toContain(`data-testid="${id}"`);
  });
});
