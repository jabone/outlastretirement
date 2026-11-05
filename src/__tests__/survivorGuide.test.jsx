// @vitest-environment jsdom
// The Survivor's Guide (What's New 492): each spouse's guide is the plan as
// the other would carry it on if this spouse died this year.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DEFAULT_INPUTS, runProjection } from '../calculator';
import { REFERENCE_INPUTS } from './referenceHousehold';
import { buildSurvivorGuide, buildSurvivorGuides } from '../utils/survivorGuide';
import { firstSteps, yearlyRoutine } from '../config/survivorGuideContent';
const stepIds = (g) => firstSteps(g).flatMap((grp) => grp.items.map((i) => i.id));
import { SurvivorGuidePage } from '../components/SurvivorGuideSheet';
import { sanitizeSurvivorNotes, setSurvivorNote, noteFrom, SURVIVOR_NOTE_MAX_LENGTH } from '../utils/survivorNotes';

const START = DEFAULT_INPUTS.planYear;
const couple = (over = {}) => ({
  ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, rebalancingEnabled: true,
  spouse1Name: 'Pat', spouse2Name: 'Lee',
  birthYear1: START - 68, retireAge1: 65, lifeExpectancy1: 90, claimingAge1: 67, salary1: 0, ss1: 36000,
  spouse2Enabled: true, birthYear2: START - 66, retireAge2: 65, lifeExpectancy2: 93, claimingAge2: 67, salary2: 0, ss2: 20000,
  preTaxInit: 700000, rothInit: 150000, taxableInit: 250000, hsaInit: 0,
  lifestyleExpense: 70000, stateTaxState: 'none', glideAllocationEnabled: false,
  ...over,
});

describe('buildSurvivorGuide', () => {
  it('is only for two people who are both alive now', () => {
    expect(buildSurvivorGuide(couple({ spouse2Enabled: false }), 1).status).toBe('no-spouse');
    expect(buildSurvivorGuides(couple({ spouse2Enabled: false }))).toEqual([]);
  });

  it('runs the plan as if the spouse died this year, alone from next year', () => {
    const g = buildSurvivorGuide(couple(), 1);
    expect(g.status).toBe('ok');
    expect(g.names).toEqual({ deceased: 'Pat', survivor: 'Lee' });
    expect(g.deathYear).toBe(START);
    expect(g.firstYear).toBe(START + 1);
    expect(g.survivorAge).toBe(67);
    // One row per year Lee is alive, from next year to Lee's life expectancy.
    expect(g.rows[0].year).toBe(START + 1);
    expect(g.rows[g.rows.length - 1].age).toBe(93);
    expect(g.flags.firstYearFiling).toBe('Single');
  });

  it('keeps the larger Social Security check and drops the other', () => {
    const g = buildSurvivorGuide(couple(), 1);
    // Together both checks; alone, Lee keeps Pat's larger one.
    expect(g.income.before.socialSecurity).toBeGreaterThan(g.income.after.socialSecurity + 10000);
    expect(g.income.after.socialSecurity).toBeGreaterThan(30000);
  });

  it('compares spending with the same retired year of the plan together, and applies the survivor drop', () => {
    const g = buildSurvivorGuide(couple({ survivorDropKeepsHousing: false }), 2);
    expect(g.spending.dropPct).toBe(20);
    expect(g.spending.after / g.spending.before).toBeCloseTo(0.8, 2);
    // A new plan keeps the housing share at the couple's dollars.
    const h = buildSurvivorGuide(couple(), 2);
    expect(h.spending.keepsHousing).toBe(true);
    expect(h.spending.after / h.spending.before).toBeGreaterThan(0.83);
    // A survivor still working: compared once retired, not in a working year.
    const w = buildSurvivorGuide(couple({ birthYear1: START - 55, retireAge1: 60, salary1: 120000, lifeExpectancy1: 90, survivorDropKeepsHousing: false }), 2);
    expect(w.spending.workingAtFirst).toBe(true);
    expect(w.spending.year).toBe(START + 5);
    expect(w.spending.after / w.spending.before).toBeCloseTo(0.8, 2);
  });

  it('the plan\u2019s own Survivor Stress Test does not change the "both of you" side', () => {
    const plain = buildSurvivorGuide(couple(), 1);
    const own = buildSurvivorGuide(couple({ survivorStressEnabled: true, survivorStressSpouse: 2, survivorStressAge: 60 }), 1);
    expect(own.status).toBe('ok');
    expect(own.spending.before).toBeCloseTo(plain.spending.before, 0);
    expect(own.income.before.socialSecurity).toBeCloseTo(plain.income.before.socialSecurity, 0);
  });

  it('tells a survivor to apply for their own benefit when the plan switches to it', () => {
    // Lee 66 (survivor) with a large own benefit claimed at 70: survivor
    // benefit first, own benefit from 70.
    const g = buildSurvivorGuide(couple({ ss2: 45000, claimingAge2: 70 }), 1);
    expect(g.income.ownSwitch?.age).toBe(70);
    expect(firstSteps(g)[0].items.find((i) => i.id === 'social-security').detail).toMatch(/switches you to your own benefit at 70/);
  });

  it('says a pension that had not started pays a pre-retirement survivor benefit', () => {
    const g = buildSurvivorGuide(couple({ birthYear1: START - 58, retireAge1: 65, pension1: 30000, pensionStartAge1: 65 }), 1);
    expect(g.flags.deceasedPensionStarted).toBe(false);
    const step = firstSteps(g).flatMap((x) => x.items).find((i) => i.id === 'pension');
    expect(step.detail).toMatch(/had not started/);
    expect(step.detail).not.toMatch(/when the pension started/);
  });

  it('never says no tax is withheld, and only names the month-of-death payment when it was paid', () => {
    const g = buildSurvivorGuide(couple(), 1);
    expect(yearlyRoutine(g).join(' ')).not.toMatch(/not taken out of a withdrawal unless you ask/);
    expect(yearlyRoutine(g).join(' ')).toMatch(/an IRA usually holds back 10%/);
    const young = buildSurvivorGuide(couple({ birthYear1: START - 55, retireAge1: 60, salary1: 120000 }), 1);
    expect(firstSteps(young)[0].items.find((i) => i.id === 'social-security').detail).not.toMatch(/month of death/);
  });

  it('ignores an active stress scenario and the plan’s own Survivor Stress Test', () => {
    const plain = buildSurvivorGuide(couple(), 1);
    const stressed = buildSurvivorGuide(couple({ stressType: 'crash2008', survivorStressEnabled: true, survivorStressSpouse: 2, survivorStressAge: 70 }), 1);
    expect(stressed.rows[0].savingsEnd).toBeCloseTo(plain.rows[0].savingsEnd, 0);
    expect(stressed.survivor).toBe(2);
  });

  it('puts the life insurance payout into savings and says so', () => {
    const g = buildSurvivorGuide(couple({ lifeInsuranceEnabled1: true, lifeInsuranceDeathBenefit1: 250000 }), 1);
    expect(g.flags.lifeInsurance).toBe(true);
    expect(stepIds(g)).toContain('life-insurance');
    expect(g.income.lifeInsurance).toBeCloseTo(250000, 0);
    const none = buildSurvivorGuide(couple(), 1);
    expect(stepIds(none)).not.toContain('life-insurance');
  });

  it('gives the spending rule in dollars when the risk-based rule is on', () => {
    const g = buildSurvivorGuide(couple({ riskGuardrailsEnabled: true }), 1);
    expect(g.rule.kind).toBe('risk');
    expect(g.rule.cutBelow).toBeGreaterThan(0);
    expect(g.rule.spendIfCut).toBeLessThan(g.rows[0].lifestyle);
    expect(buildSurvivorGuide(couple(), 1).rule.kind).toBe('none');
  });

  it('the rows add up to the projection it describes', () => {
    const inputs = couple();
    const g = buildSurvivorGuide(inputs, 1);
    const p = runProjection({ ...inputs, survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 68 });
    const y = p.years.find((r) => r.year === START + 1);
    const f = y.priceIndex || y.inflFactor || 1;
    const next = p.years.find((r) => r.year === START + 2);
    expect(g.rows[0].savingsEnd).toBeCloseTo(y.totalPortfolioEnding / (next.priceIndex || next.inflFactor), 0);
    expect(g.rows[0].fromPreTax).toBeCloseTo(y.drawPreTax / f, 0);
  });

  it('prints the deceased spouse’s note, or lines to write one', () => {
    const g = buildSurvivorGuide(couple(), 1);
    const { unmount } = render(<SurvivorGuidePage guide={g} note={{ text: 'Call Dana first.\nKeep the house a year.', updatedAt: '2026-11-04' }} />);
    expect(screen.getByRole('heading', { name: /If Pat dies first: Lee.s guide/ })).toBeInTheDocument();
    expect(screen.getByText(/Call Dana first/)).toBeInTheDocument();
    expect(screen.getByText('written 2026-11-04')).toBeInTheDocument();
    expect(screen.getByTestId('survivor-guide-years').querySelectorAll('tbody tr').length).toBe(g.rows.length);
    unmount();
    render(<SurvivorGuidePage guide={g} note={null} />);
    expect(screen.queryByText(/Call Dana first/)).toBeNull();
  });
});

describe('survivor notes', () => {
  it('keeps two slots of text, line breaks and all, and drops the rest', () => {
    expect(sanitizeSurvivorNotes({ from1: { text: 'a\r\nb', updatedAt: '2026-11-04' }, from3: { text: 'x' }, from2: { text: '   ' } }))
      .toEqual({ from1: { text: 'a\nb', updatedAt: '2026-11-04' } });
    expect(sanitizeSurvivorNotes({ from1: { text: 'x', updatedAt: 'yesterday' } })).toEqual({ from1: { text: 'x' } });
    expect(sanitizeSurvivorNotes('nope')).toEqual({});
    expect(sanitizeSurvivorNotes({ from2: { text: 'y'.repeat(SURVIVOR_NOTE_MAX_LENGTH + 50) } }).from2.text.length).toBe(SURVIVOR_NOTE_MAX_LENGTH);
  });

  it('dates a changed note, keeps an unchanged one, clears a blank one', () => {
    const a = setSurvivorNote({}, 1, 'hello', '2026-11-04');
    expect(a).toEqual({ from1: { text: 'hello', updatedAt: '2026-11-04' } });
    expect(setSurvivorNote(a, 1, 'hello', '2026-11-05')).toBe(a);
    expect(setSurvivorNote(a, 1, '  ', '2026-11-05')).toEqual({});
    expect(noteFrom(a, 1).text).toBe('hello');
    expect(noteFrom(a, 2)).toBe(null);
  });
});

describe('other survivor benefits, where the money is kept, opening the app (What’s New 493)', () => {
  const google = { id: 'g', whose: 1, name: 'Employer survivor income', kind: 'yearly', amount: 100000, years: 10, whileWorking: true, contact: 'Benefits office' };
  const working = (over = {}) => couple({ birthYear1: START - 55, retireAge1: 62, salary1: 200000, survivorBenefits: [google], ...over });

  it('counts a while-working employer benefit as income for its years and prints how to claim it', () => {
    const g = buildSurvivorGuide(working(), 1);
    expect(g.income.after.benefit).toBeGreaterThan(95000);
    // Level in dollars after the death, so worth less each year in today's dollars.
    expect(g.rows[9].incomeParts.benefit).toBeGreaterThan(75000);
    expect(g.rows[9].incomeParts.benefit).toBeLessThan(g.rows[0].incomeParts.benefit);
    expect(g.rows[10].incomeParts.benefit).toBe(0);
    const step = firstSteps(g).flatMap((x) => x.items).find((i) => i.id === 'other-benefits');
    expect(step.detail).toMatch(/Employer survivor income: \$100,000 a year for 10 years; contact Benefits office/);
    expect(g.income.changes.some((c) => c.kind === 'benefit' && c.change === 'stops')).toBe(true);
  });

  it('a while-working benefit does not apply after retirement, and says so', () => {
    const g = buildSurvivorGuide(couple({ survivorBenefits: [google] }), 1);
    expect(g.income.after.benefit).toBe(0);
    expect(g.benefits[0].applies).toBe(false);
    expect(firstSteps(g).flatMap((x) => x.items).map((i) => i.id)).toContain('benefits-ended');
  });

  it('a benefit left out of the plan still prints, marked as not counted', () => {
    const g = buildSurvivorGuide(working({ survivorBenefits: [{ ...google, counted: false }] }), 1);
    expect(g.income.after.benefit).toBe(0);
    expect(firstSteps(g).flatMap((x) => x.items).find((i) => i.id === 'other-benefits').detail).toMatch(/not counted in this plan/);
  });

  it('prints where the money is kept, from the household’s list and Detailed Holdings, and how to open the app', () => {
    const g = buildSurvivorGuide(couple(), 1);
    const notes = { accounts: [{ id: 'a', firm: 'Credit Union', kind: 'bank', owner: 'Pat', note: 'Checking and savings' }], appNotes: 'Google Drive, folder Retirement' };
    const holdings = [
      { id: 'h1', taxTreatment: 'preTax', institution: 'Fidelity', account: '401(k)', shares: 10, currentPrice: 100 },
      { id: 'h2', taxTreatment: 'preTax', institution: 'Fidelity', account: '401(k)', shares: 5, currentPrice: 100 },
    ];
    render(<SurvivorGuidePage guide={g} note={null} notes={notes} holdings={holdings} lastBackupAt={Date.UTC(2026, 10, 1, 12)} />);
    const where = screen.getByTestId('survivor-guide-where-money');
    expect(where.textContent).toMatch(/Credit Union/);
    expect(where.textContent).toMatch(/Fidelity401\(k\)/);
    expect(where.textContent).toMatch(/\$1,500/);
    const open = screen.getByTestId('survivor-guide-open-app');
    expect(open.textContent).toMatch(/outlastretirement_full_backup_/);
    expect(open.textContent).toMatch(/Google Drive, folder Retirement/);
    expect(open.textContent).toMatch(/November 1, 2026/);
  });

  it('the holdings list can be switched off', () => {
    const g = buildSurvivorGuide(couple(), 1);
    render(<SurvivorGuidePage guide={g} note={null} notes={{ includeHoldings: false }} holdings={[{ id: 'h', taxTreatment: 'roth', institution: 'Vanguard', account: 'Roth IRA', shares: 1, currentPrice: 1 }]} />);
    expect(screen.queryByTestId('survivor-guide-where-money')).toBeNull();
  });
});

describe('the first weeks page (What’s New 496)', () => {
  it('lists the steps that cannot wait in one line each, who to call, and the money for now', async () => {
    const { SurvivorFirstWeeksPage } = await import('../components/SurvivorGuideSheet');
    const g = buildSurvivorGuide(couple({ lifeInsuranceEnabled1: true, lifeInsuranceDeathBenefit1: 200000 }), 1);
    render(<SurvivorFirstWeeksPage guide={g} note={{ text: 'Call Dana first.' }} />);
    const page = screen.getByTestId('survivor-weeks-1');
    expect(page.textContent).toMatch(/The first weeks, if Pat dies/);
    expect(page.textContent).toMatch(/Call Dana first/);
    expect(screen.getByTestId('survivor-weeks-step-go-slow')).toBeTruthy();
    expect(screen.getByTestId('survivor-weeks-step-social-security').textContent).toMatch(/1-800-772-1213/);
    expect(screen.getByTestId('survivor-weeks-step-life-insurance').textContent).toMatch(/\$200,000/);
    // Only the first two months: nothing from the first-year list.
    expect(screen.queryByTestId('survivor-weeks-step-estate')).toBeNull();
    expect(page.textContent).toMatch(/Money for now/);
  });
});
