import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, getRothBracketWithdrawalHeatmap, getGuardrailsComparisonHeatmap } from '../calculator.js';
import { buildActionPlan } from '../utils/actionPlan.js';

// buildActionPlan is pure presentation logic layered on top of runProjection's
// output -- these tests feed it real `runProjection(inputs)` results (rather
// than hand-rolled fake projections) so a shape change in calculator.js's
// output would surface here too, not just silently break the Action Plan UI.

const findSection = (plan, id) => plan.sections.find((s) => s.id === id);
const labels = (section) => section.items.map((i) => i.label);

describe('buildActionPlan', () => {
  describe('headline', () => {
    it('reports success and the projected ending balance for a well-funded plan', () => {
      const inputs = { ...DEFAULT_INPUTS, spouse2Enabled: false };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);

      expect(plan.headline.isSuccessful).toBe(projection.isSuccessful);
      expect(plan.headline.endingBalance).toBeCloseTo(projection.endingBalance, 2);
      expect(plan.headline.targetSpending).toBe(inputs.lifestyleExpense);
      expect(plan.headline.horizonYear).toBe(projection.years[projection.years.length - 1].year);
    });

    it('reports a shortfall when spending is set far above what the plan can sustain', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        preTaxInit: 50000,
        rothInit: 0,
        taxableInit: 0,
        ss1: 0,
        pension1: 0,
        lifestyleExpense: 500000,
      };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);

      expect(projection.isSuccessful).toBe(false);
      expect(plan.headline.isSuccessful).toBe(false);

      const legacy = findSection(plan, 'legacy');
      expect(legacy.items[0].detail).toMatch(/shortfall/i);
    });

    it('falls back to a default $-formatter when formatCurrency is not provided', () => {
      const inputs = { ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxContribution1: 10000 };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const working = findSection(plan, 'working');
      expect(labels(working)[0]).toMatch(/\$10,000\/yr Pre-Tax/);
    });
  });

  describe('While You\'re Working section', () => {
    it('lists each spouse\'s savings split by account when contributing', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: true,
        preTaxContribution1: 10000,
        rothContribution1: 5000,
        preTaxContribution2: 8000,
        rothContribution2: 0,
        retireAge1: 65,
        retireAge2: 63,
      };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection, (v) => `$${v}`);
      const working = findSection(plan, 'working');

      expect(labels(working)).toContain(`${inputs.spouse1Name}: save $10000/yr Pre-Tax + $5000/yr Roth`);
      expect(labels(working)).toContain(`${inputs.spouse2Name}: save $8000/yr Pre-Tax`);
      expect(labels(working)).toContain(`Work until age 65 (${inputs.spouse1Name}) and age 63 (${inputs.spouse2Name})`);
    });

    it('omits a spouse\'s savings line entirely when both their contributions are 0', () => {
      const inputs = { ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxContribution1: 0, rothContribution1: 0 };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const working = findSection(plan, 'working');

      expect(labels(working).some((l) => l.includes('save'))).toBe(false);
    });

    it('never mentions spouse 2 when spouse2Enabled is false, even with spouse2 contribution fields set', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        preTaxContribution2: 9000, // should be ignored entirely
      };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const working = findSection(plan, 'working');

      expect(labels(working).some((l) => l.includes(inputs.spouse2Name))).toBe(false);
      expect(labels(working).some((l) => l.includes('9000'))).toBe(false);
    });

    it('surfaces a custom current-household-spending line when currentSpendingMode is "custom"', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        currentSpendingMode: 'custom',
        currentHouseholdSpendingCustom: 60000,
      };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection, (v) => `$${v}`);
      const working = findSection(plan, 'working');

      expect(labels(working)).toContain('Keep household spending near $60000/yr while working');
    });

    it('falls back to the auto-derived spending line when currentSpendingMode is "auto"', () => {
      const inputs = { ...DEFAULT_INPUTS, spouse2Enabled: false, currentSpendingMode: 'auto' };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const working = findSection(plan, 'working');

      expect(labels(working)).toContain("Keep living expenses within what's left after taxes and the savings above");
    });
  });

  describe('At Retirement section', () => {
    it('describes a single filer\'s claiming age without any spouse-pairing text', () => {
      const inputs = { ...DEFAULT_INPUTS, spouse2Enabled: false, claimingAge1: 70 };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const retirement = findSection(plan, 'retirement');

      expect(labels(retirement)).toContain('Claim Social Security at age 70');
    });

    it('describes both spouses\' claiming ages for MFJ', () => {
      const inputs = { ...DEFAULT_INPUTS, spouse2Enabled: true, claimingAge1: 67, claimingAge2: 70 };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const retirement = findSection(plan, 'retirement');

      expect(labels(retirement)).toContain(
        `Claim Social Security at age 67 (${inputs.spouse1Name}) and age 70 (${inputs.spouse2Name})`
      );
    });

    it('names the configured withdrawal order', () => {
      const inputs = { ...DEFAULT_INPUTS, spouse2Enabled: false, withdrawalStrategy: 'RothFirst' };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const retirement = findSection(plan, 'retirement');
      const item = retirement.items.find((i) => i.label === 'Draw down accounts in this order:');

      expect(item.detail).toMatch(/Spend Roth accounts first/);
    });

    it('adds no Roth conversion item when the strategy is "none"', () => {
      const inputs = { ...DEFAULT_INPUTS, spouse2Enabled: false, rothConversionStrategy: 'none' };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const retirement = findSection(plan, 'retirement');

      expect(labels(retirement).some((l) => l.toLowerCase().includes('convert'))).toBe(false);
    });

    it('adds a fixed-amount Roth conversion item with the configured amount', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        rothConversionStrategy: 'fixed',
        rothConversionAmount: 25000,
      };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection, (v) => `$${v}`);
      const retirement = findSection(plan, 'retirement');

      expect(labels(retirement)).toContain('Your plan converts $25000/yr from Pre-Tax to Roth');
    });

    it('adds a maxBracket Roth conversion item naming the target bracket percentage', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        rothConversionStrategy: 'maxBracket',
        rothConversionBracket: 0.12,
      };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const retirement = findSection(plan, 'retirement');

      expect(labels(retirement)).toContain('Your plan converts Pre-Tax to Roth each year, up to the top of the 12% tax bracket');
    });

    it('the conversion detail says when it starts, when it stops, and what the projection actually did (changelog 261)', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        rothConversionStrategy: 'maxBracket',
        rothConversionBracket: 0.22,
        rothConversionDelayUntilRetire: true,
      };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const item = findSection(plan, 'retirement').items.find((i) => i.label.startsWith('Your plan converts Pre-Tax to Roth'));
      const convYears = projection.years.filter((r) => r.convertAmount > 0).map((r) => r.year);
      expect(convYears.length).toBeGreaterThan(1);
      expect(item.detail).toBe(
        `Starts the year you retire (${convYears[0]}) and repeats every year until the Pre-Tax balance is gone. `
        + `In this projection that is ${convYears.length} conversions, ${convYears[0]}\u2013${convYears[convYears.length - 1]}.`
      );

      const capped = runProjection({ ...inputs, rothConversionDurationYears: 3 });
      const cappedItem = findSection(buildActionPlan({ ...inputs, rothConversionDurationYears: 3 }, capped), 'retirement')
        .items.find((i) => i.label.startsWith('Your plan converts Pre-Tax to Roth'));
      expect(cappedItem.detail).toMatch(/^Starts the year you retire \(\d{4}\) and runs for 3 years\. In this projection that is 3 conversions, /);

      const now = runProjection({ ...inputs, rothConversionDelayUntilRetire: false });
      const nowItem = findSection(buildActionPlan({ ...inputs, rothConversionDelayUntilRetire: false }, now), 'retirement')
        .items.find((i) => i.label.startsWith('Your plan converts Pre-Tax to Roth'));
      expect(nowItem.detail).toMatch(/^Starts now \(\d{4}\) and repeats every year/);
    });

    it('mentions spending guardrails only when enabled', () => {
      const onInputs = { ...DEFAULT_INPUTS, spouse2Enabled: false, spendingGuardrails: true };
      const offInputs = { ...DEFAULT_INPUTS, spouse2Enabled: false, spendingGuardrails: false };

      const onPlan = buildActionPlan(onInputs, runProjection(onInputs));
      const offPlan = buildActionPlan(offInputs, runProjection(offInputs));

      expect(labels(findSection(onPlan, 'retirement')).some((l) => l.includes('guardrails'))).toBe(true);
      expect(labels(findSection(offPlan, 'retirement')).some((l) => l.includes('guardrails'))).toBe(false);
    });
  });

  describe('During Retirement section', () => {
    it('shows a flat inflation-adjusted target when three-phase spending is off', () => {
      const inputs = { ...DEFAULT_INPUTS, spouse2Enabled: false, lifestyleThreePhaseEnabled: false, lifestyleExpense: 80000 };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection, (v) => `$${v}`);
      const during = findSection(plan, 'during');

      expect(labels(during)).toContain('Target retirement spending: $80000/yr');
    });

    it('shows the three-phase Go-Go/Slow-Go/No-Go breakdown when enabled', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        lifestyleThreePhaseEnabled: true,
        lifestyleExpense: 100000,
        goGoEndAge: 75,
        slowGoEndAge: 85,
        goGoMultiplier: 1.1,
        slowGoMultiplier: 1.0,
        noGoMultiplier: 0.8,
      };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const during = findSection(plan, 'during');
      const item = during.items[0];

      expect(item.label).toMatch(/three-phase curve/);
      expect(item.detail).toMatch(/Go-Go \(to age 75\): 110%/);
      expect(item.detail).toMatch(/Slow-Go \(to age 85\): 100%/);
      expect(item.detail).toMatch(/No-Go \(after\): 80%/);
    });

    it('sorts milestones by start age and describes funding source per milestone', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        milestones: [
          { id: 1, name: 'New Roof', type: 'outflow', startAge: 75, endAge: 75, amount: 20000, fundedExternally: false, targetAccount: 'auto' },
          { id: 2, name: 'Inheritance', type: 'inflow', startAge: 60, endAge: 60, amount: 100000, targetAccount: 'taxable', isTaxable: false },
          { id: 3, name: 'Pre-funded Wedding', type: 'outflow', startAge: 68, endAge: 68, amount: 30000, fundedExternally: true },
        ],
      };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const during = findSection(plan, 'during');
      const milestoneItems = during.items.filter((i) => i.label.includes('"'));

      expect(milestoneItems.map((i) => i.label)).toEqual([
        expect.stringContaining('Inheritance'),
        expect.stringContaining('Pre-funded Wedding'),
        expect.stringContaining('New Roof'),
      ]);
      expect(milestoneItems[1].detail).toMatch(/Funded from savings set aside outside this plan/);
      expect(milestoneItems[2].detail).toMatch(/Drawn from accounts, following your withdrawal order above/);
    });

    it('lists mortgage and other debt payments only when configured', () => {
      const withDebt = { ...DEFAULT_INPUTS, spouse2Enabled: false, mortgagePayment: 24000, otherDebtPayment: 6000 };
      const withoutDebt = { ...DEFAULT_INPUTS, spouse2Enabled: false, mortgagePayment: 0, otherDebtPayment: 0 };

      const withDebtDuring = findSection(buildActionPlan(withDebt, runProjection(withDebt)), 'during');
      const withoutDebtDuring = findSection(buildActionPlan(withoutDebt, runProjection(withoutDebt)), 'during');

      expect(labels(withDebtDuring).some((l) => l.includes('mortgage payments'))).toBe(true);
      expect(labels(withDebtDuring).some((l) => l.includes('other debt payments'))).toBe(true);
      expect(labels(withoutDebtDuring).some((l) => l.includes('mortgage payments'))).toBe(false);
      expect(labels(withoutDebtDuring).some((l) => l.includes('other debt payments'))).toBe(false);
    });
  });

  describe('Legacy & Estate section', () => {
    it('omits the beneficiaries line entirely when no heirs have a nonzero split', () => {
      const inputs = { ...DEFAULT_INPUTS, spouse2Enabled: false, heirs: [] };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const legacy = findSection(plan, 'legacy');

      expect(labels(legacy).some((l) => l.includes('beneficiaries'))).toBe(false);
      expect(legacy.items.length).toBe(1); // just the ending-balance line
    });

    it('lists each heir with their split percentage when configured', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        heirSplitMode: 'custom',
        heirs: [
          { id: 1, name: 'Alice', splitPct: 60 },
          { id: 2, name: 'Bob', splitPct: 40 },
        ],
      };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const legacy = findSection(plan, 'legacy');
      const item = legacy.items.find((i) => i.label.includes('beneficiaries'));

      expect(item.label).toBe('Name beneficiaries: Alice (60%), Bob (40%)');
    });

    it('equal split names every heir as a fraction, never a rounded percent (changelog 262)', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        heirSplitMode: 'equal',
        heirs: [
          { id: 1, name: 'Child 1', splitPct: 33 },
          { id: 2, name: 'Child 2', splitPct: 33 },
          { id: 3, name: 'Child 3', splitPct: 0 },
        ],
      };
      const plan = buildActionPlan(inputs, runProjection(inputs));
      const item = findSection(plan, 'legacy').items.find((i) => i.label.includes('beneficiaries'));
      expect(item.label).toBe('Name beneficiaries: Child 1 (1/3), Child 2 (1/3), Child 3 (1/3) — equal shares');
      expect(item.detail).toMatch(/unless an heir has/);
    });

    it('filters out heirs with a 0% split', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        heirSplitMode: 'custom',
        heirs: [
          { id: 1, name: 'Alice', splitPct: 100 },
          { id: 2, name: 'Zero Percent Cousin', splitPct: 0 },
        ],
      };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);
      const legacy = findSection(plan, 'legacy');
      const item = legacy.items.find((i) => i.label.includes('beneficiaries'));

      expect(item.label).not.toMatch(/Zero Percent Cousin/);
    });
  });

  describe('section shape', () => {
    it('always returns all four sections in a fixed order, even when every optional item is empty', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        preTaxContribution1: 0,
        rothContribution1: 0,
        taxableContribution: 0,
        hsaContribution: 0,
        milestones: [],
        mortgagePayment: 0,
        otherDebtPayment: 0,
        heirs: [],
        rothConversionStrategy: 'none',
        spendingGuardrails: false,
      };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection);

      expect(plan.sections.map((s) => s.id)).toEqual(['working', 'retirement', 'during', 'legacy']);
      plan.sections.forEach((s) => expect(Array.isArray(s.items)).toBe(true));
    });
  });

  describe('Roth Ladder Optimizer recommendation (rothLadderHeatmap)', () => {
    // A well-funded household, large enough that different bracket/withdrawal
    // combinations actually produce meaningfully different ending balances --
    // DEFAULT_INPUTS alone is too tight post-fix (projects $0) for any combo
    // to look better than any other.
    const SOLVENT_INPUTS = { ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxInit: 800000, rothInit: 100000, taxableInit: 200000 };

    it('recommends the best-performing combo when no Roth conversion is configured at all', () => {
      const inputs = { ...SOLVENT_INPUTS, rothConversionStrategy: 'none' };
      const projection = runProjection(inputs);
      const heatmap = getRothBracketWithdrawalHeatmap(inputs);
      const plan = buildActionPlan(inputs, projection, undefined, heatmap);
      const retirement = findSection(plan, 'retirement');

      // Changelog 428: the note ranks on net to heirs after every tax.
      const best = heatmap.reduce((b, c) => (!b || c.afterTaxLegacy > b.afterTaxLegacy ? c : b), null);
      const item = retirement.items.find((i) => i.label.includes('leaves your heirs more after every tax'));

      expect(item).toBeTruthy();
      expect(item.label).toContain(`${Math.round(best.bracket * 100)}%`);
      expect(item.detail).toContain('Roth Ladder Optimizer');
    });

    it('does not recommend anything when the household is already running the best combo', () => {
      const heatmapForDefaults = getRothBracketWithdrawalHeatmap(SOLVENT_INPUTS);
      const best = heatmapForDefaults.reduce((b, c) => (!b || c.afterTaxLegacy > b.afterTaxLegacy ? c : b), null);
      const inputs = {
        ...SOLVENT_INPUTS,
        rothConversionStrategy: 'maxBracket',
        rothConversionBracket: best.bracket,
        withdrawalStrategy: best.withdrawalStrategy,
      };
      const projection = runProjection(inputs);
      const heatmap = getRothBracketWithdrawalHeatmap(inputs);
      const plan = buildActionPlan(inputs, projection, undefined, heatmap);
      const retirement = findSection(plan, 'retirement');

      expect(retirement.items.find((i) => i.label.includes('leaves your heirs more after every tax'))).toBeUndefined();
    });

    it('is skipped silently when no heatmap is passed in, so existing callers keep working', () => {
      const inputs = { ...SOLVENT_INPUTS, rothConversionStrategy: 'none' };
      const projection = runProjection(inputs);

      expect(() => buildActionPlan(inputs, projection)).not.toThrow();
      const plan = buildActionPlan(inputs, projection);
      const retirement = findSection(plan, 'retirement');
      expect(retirement.items.find((i) => i.label.includes('leaves your heirs more after every tax'))).toBeUndefined();
    });

    it('is skipped when the passed-in heatmap is an empty array', () => {
      const inputs = { ...SOLVENT_INPUTS, rothConversionStrategy: 'none' };
      const projection = runProjection(inputs);
      const plan = buildActionPlan(inputs, projection, undefined, []);
      const retirement = findSection(plan, 'retirement');

      expect(retirement.items.find((i) => i.label.includes('leaves your heirs more after every tax'))).toBeUndefined();
    });
  });

  describe('Guardrails vs Fixed-Withdrawal recommendation (guardrailsComparison)', () => {
    const SOLVENT_INPUTS = { ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxInit: 800000, rothInit: 100000, taxableInit: 200000, stressStartMode: 'retirement' };

    it('recommends turning guardrails on when they help in a majority of tested crash scenarios', () => {
      const inputs = { ...SOLVENT_INPUTS, spendingGuardrails: false };
      const projection = runProjection(inputs);
      const guardrailsComparison = getGuardrailsComparisonHeatmap(inputs);
      const plan = buildActionPlan(inputs, projection, undefined, undefined, guardrailsComparison);
      const retirement = findSection(plan, 'retirement');

      const item = retirement.items.find((i) => i.label.includes('Spending guardrails helped'));
      expect(item).toBeTruthy();
      expect(item.detail).toMatch(/historical crash scenarios tested/);
    });

    it('does not recommend a change when guardrails is already on and helps in a majority of scenarios', () => {
      const inputs = { ...SOLVENT_INPUTS, spendingGuardrails: true };
      const projection = runProjection(inputs);
      const guardrailsComparison = getGuardrailsComparisonHeatmap(inputs);
      const plan = buildActionPlan(inputs, projection, undefined, undefined, guardrailsComparison);
      const retirement = findSection(plan, 'retirement');

      expect(retirement.items.find((i) => i.label.includes('Spending guardrails helped'))).toBeUndefined();
      expect(retirement.items.find((i) => i.label.includes('Spending guardrails left less behind'))).toBeUndefined();
    });

    it('is skipped silently when no guardrails comparison is passed in', () => {
      const inputs = { ...SOLVENT_INPUTS, spendingGuardrails: false };
      const projection = runProjection(inputs);

      expect(() => buildActionPlan(inputs, projection)).not.toThrow();
      const plan = buildActionPlan(inputs, projection);
      const retirement = findSection(plan, 'retirement');
      expect(retirement.items.find((i) => i.label.toLowerCase().includes('guardrails'))).toBeUndefined();
    });
  });
});
