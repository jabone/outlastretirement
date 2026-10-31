// @vitest-environment jsdom
//
// The Quick Setup Wizard owns no fields (changelog 257). Its five entry
// steps render the Plan's own sections inside <GuidedSection only>, which
// keeps just the handful of controls WIZARD_FIELDS names for that step and
// hides the section's heading, notes and every other control. Guards:
//
//   1. App.jsx renders no control for a plan input -- every id="field-…" or
//      id="toggle-…" left in App.jsx is a view control, not a DEFAULT_INPUTS
//      key. A wizard mini-field creeping back fails here.
//   2. Every WIZARD_FIELDS key names a real input (bare, or with a spouse
//      suffix), so a typo hides a field silently in the wizard.
//   3. The `only` density does what the wizard relies on: the named
//      controls stay, everything else (including the section h3) is
//      hidden, there is no "More options" button, and an edit still writes
//      through updateInput.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS } from '../../calculator';
import { WIZARD_FIELDS, WIZARD_KEYS } from '../../config/wizardFields';
import { GuidedSection } from '../../components/plan/sectionShared';
import DemographicsSection from '../../components/plan/sections/DemographicsSection';
import AnnuitiesPensionsSection from '../../components/plan/sections/AnnuitiesPensionsSection';
import SocialSecuritySection from '../../components/plan/sections/SocialSecuritySection';
import ContributionsSection from '../../components/plan/sections/ContributionsSection';
import InitialBalancesSection from '../../components/plan/sections/InitialBalancesSection';

const here = dirname(fileURLToPath(import.meta.url));
const field = (id) => document.getElementById(id);
const hidden = (el) => !!el.closest('.guided-hidden');

describe('Setup wizard — owns no fields of its own', () => {
  it('App.jsx renders no control for a plan input', () => {
    const src = readFileSync(resolve(here, '../../App.jsx'), 'utf-8');
    const ids = [...src.matchAll(/id="(?:field|toggle)-([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
    const planInputs = ids.filter((k) => Object.prototype.hasOwnProperty.call(DEFAULT_INPUTS, k));
    expect(planInputs).toEqual([]);
  });

  it('the wizard steps render the shared sections, not inputs', () => {
    const src = readFileSync(resolve(here, '../../App.jsx'), 'utf-8');
    const wizard = src.slice(src.indexOf('{onboardingStep === 1 && ('), src.indexOf('{onboardingStep === 6 && ('));
    expect(wizard.length).toBeGreaterThan(1000);
    expect(wizard.match(/<input\b/g) || []).toEqual([]);
    expect(wizard.match(/<CommaNumberInput\b/g) || []).toEqual([]);
    for (const [step, section] of [
      ['household', 'DemographicsSection'], ['salaries', 'SalariesSection'], ['income', 'AnnuitiesPensionsSection'],
      ['balances', 'InitialBalancesSection'], ['spending', 'RetirementSpendSection'], ['savings', 'ContributionsSection'],
    ]) {
      if (step === 'income') {
        // Social Security has its own section, shown first on this step.
        expect(wizard).toContain('<GuidedSection only={WIZARD_FIELDS.income}><SocialSecuritySection forceOpen /><AnnuitiesPensionsSection');
        continue;
      }
      expect(wizard).toContain(`<GuidedSection only={WIZARD_FIELDS.${step}}><${section}`);
    }
  });

  it('every WIZARD_FIELDS key names a real input', () => {
    const missing = WIZARD_KEYS.filter((k) => !(k in DEFAULT_INPUTS) && !(`${k}1` in DEFAULT_INPUTS));
    expect(missing).toEqual([]);
    expect(WIZARD_KEYS.length).toBeGreaterThanOrEqual(14);
  });
});

describe('GuidedSection only={…} — the wizard density', () => {
  it('keeps the named household controls and hides the rest of Demographics, heading included', () => {
    renderWithSimulation(
      <GuidedSection only={WIZARD_FIELDS.household}><DemographicsSection /></GuidedSection>,
      { inputs: { ...DEFAULT_INPUTS, spouse2Enabled: true } },
    );
    for (const id of ['field-spouse1Name', 'field-birthYear1', 'field-retireAge1', 'field-stateOfResidence', 'toggle-spouse2Enabled', 'field-spouse2Name', 'field-birthYear2', 'field-retireAge2']) {
      expect(field(id)).not.toBeNull();
      expect(hidden(field(id))).toBe(false);
    }
    for (const id of ['field-sex1', 'field-lifeExpectancy1', 'field-claimingAge1', 'field-filingStatus']) {
      expect(field(id)).not.toBeNull();
      expect(hidden(field(id))).toBe(true);
    }
    expect(hidden(screen.getByText('Demographics'))).toBe(true);
    expect(screen.queryByText(/More options/)).toBeNull();
  });

  it('an edit in the wizard density writes through updateInput', () => {
    const updateInput = vi.fn();
    renderWithSimulation(
      <GuidedSection only={WIZARD_FIELDS.household}><DemographicsSection /></GuidedSection>,
      { updateInput },
    );
    fireEvent.change(field('field-birthYear1'), { target: { value: '1971' } });
    expect(updateInput).toHaveBeenCalledWith('birthYear1', 1971);
  });

  it('income step: Social Security, the pension figure and the military box stay; the pension detail hides', () => {
    renderWithSimulation(
      <GuidedSection only={WIZARD_FIELDS.income}><SocialSecuritySection forceOpen /><AnnuitiesPensionsSection forceOpen /></GuidedSection>,
      { inputs: { ...DEFAULT_INPUTS, pension1: 12000 } },
    );
    for (const id of ['field-ss1', 'field-pension1', 'toggle-militaryPension1']) {
      expect(field(id)).not.toBeNull();
      expect(hidden(field(id))).toBe(false);
    }
    for (const id of ['field-pensionStartAge1', 'field-pension1COLA']) {
      expect(field(id)).not.toBeNull();
      expect(hidden(field(id))).toBe(true);
    }
  });

  it('savings step: the three contribution figures stay; employer match and HSA hide', () => {
    renderWithSimulation(
      <GuidedSection only={WIZARD_FIELDS.savings}><ContributionsSection /></GuidedSection>,
    );
    for (const id of ['field-preTaxContribution1', 'field-rothContribution1', 'field-taxableContribution']) {
      expect(field(id)).not.toBeNull();
      expect(hidden(field(id))).toBe(false);
    }
    for (const id of ['field-employerMatchMode1', 'field-hsaContribution']) {
      expect(field(id)).not.toBeNull();
      expect(hidden(field(id))).toBe(true);
    }
  });

  it('balances step: pre-tax, Roth and taxable stay; HSA and the Roth detail hide', () => {
    renderWithSimulation(
      <GuidedSection only={WIZARD_FIELDS.balances}><InitialBalancesSection /></GuidedSection>,
    );
    for (const id of ['field-preTaxInit', 'field-rothInit', 'field-taxableInit']) {
      expect(hidden(field(id))).toBe(false);
    }
    for (const id of ['field-hsaInit', 'field-rothBasisInit']) {
      expect(field(id)).not.toBeNull();
      expect(hidden(field(id))).toBe(true);
    }
  });

  it('without `only` the guided density is unchanged: core fields show, advanced fold behind More options', () => {
    renderWithSimulation(<GuidedSection><DemographicsSection /></GuidedSection>);
    expect(hidden(field('field-birthYear1'))).toBe(false);
    expect(hidden(screen.getByText('Demographics'))).toBe(false);
    expect(screen.getByText(/More options/)).toBeTruthy();
  });
});
