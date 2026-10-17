// Builds the "Action Plan" / execution roadmap: a plain-language, ordered
// list of what a user actually needs to DO for their plan to unfold the way
// the simulation projects. This is pure presentation logic (no financial
// math of its own) derived entirely from `inputs` (the plan configuration)
// and `projection` (calculator.js's runProjection output) -- it's the
// single source of truth shared between the always-visible ActionPlanCard
// on the Dashboard and the printable report in App.jsx, so both stay in
// sync automatically instead of drifting into two separate copies of the
// same narrative.
//
import { buildAbroadActionItems } from './abroadActionItems';

// Returns { headline, sections } where each section is
// { id, title, items: [{ label, detail }] }. `detail` may be null.

const WITHDRAWAL_STRATEGY_LABELS = {
  TaxableFirst: 'Spend your Taxable Brokerage account first, then Pre-Tax, then Roth.',
  PreTaxFirst: 'Spend Pre-Tax accounts first, then Taxable, then Roth.',
  RothFirst: 'Spend Roth accounts first, then Taxable, then Pre-Tax.',
  ProRata: 'Withdraw proportionally across all three accounts based on their balances each year.',
};

const WITHDRAWAL_STRATEGY_SHORT_LABELS = {
  TaxableFirst: 'Taxable-first',
  PreTaxFirst: 'Pre-Tax-first',
  RothFirst: 'Roth-first',
  ProRata: 'pro-rata',
};

const HEIR_STRATEGY_LABELS = {
  flat_10: 'draw it down evenly over the 10 years the IRS allows (the "Flat 10-Year" rule)',
  lump_sum_start: 'take the full balance as a single withdrawal in year 1',
  lump_sum_end: 'let it grow untouched and withdraw the full balance in year 10',
};

// How each Auto-Max mode should be described. The point of saying which
// mode is on, rather than only a dollar figure, is that the figure MOVES:
// the IRS limits are indexed and the catch-ups step up with age, so a
// single "$X/yr until retirement" would be wrong from the second year.
const AUTO_MAX_LABELS = {
  '401k': 'the full 401(k) elective deferral limit',
  ira: 'the full IRA contribution limit',
  max: 'the maximum allowed across the 401(k), an IRA and the HSA',
};

const STRESS_SCENARIO_LABELS = {
  '1929': 'the 1929 Great Depression',
  '1966': 'the 1966 Lost Decade',
  '1973': 'the 1973 Stagflation crash',
  '2000': 'the 2000 Dot-Com crash',
  '2008': 'the 2008 Global Financial Crisis',
};

export function buildActionPlan(inputs, projection, formatCurrency, rothLadderHeatmap, guardrailsComparison) {
  const fc = typeof formatCurrency === 'function'
    ? formatCurrency
    : (v) => `$${Math.round(v || 0).toLocaleString()}`;

  const spouse1 = inputs.spouse1Name || 'Primary';
  const spouse2 = inputs.spouse2Name || 'Spouse';
  const hasSpouse2 = !!inputs.spouse2Enabled;

  const years = (projection && projection.years) || [];
  const lastYear = years.length > 0 ? years[years.length - 1] : null;
  const endingBalance = (projection && typeof projection.endingBalance === 'number')
    ? projection.endingBalance
    : (lastYear ? lastYear.totalPortfolioEnding : 0);
  const isSuccessful = projection ? !!projection.isSuccessful : true;

  const headline = {
    targetSpending: inputs.lifestyleExpense || 0,
    endingBalance,
    horizonYear: lastYear ? lastYear.year : null,
    isSuccessful,
  };

  // ---------------------------------------------------------------------
  // Section 1: While You're Working
  // ---------------------------------------------------------------------
  const workingItems = [];

  // Read what the engine ACTUALLY contributed rather than the manual input
  // fields (changelog 130). Any Auto-Max mode overrides those fields --
  // 'max' replaces the Pre-Tax/Roth split AND the HSA amount, and adds an
  // IRA as a backdoor Roth -- so a plan set to "Contribute the Max" used to
  // be described here by the numbers it had stopped using. The first year
  // that actually saves anything is the one narrated, since that is where
  // the schedule starts.
  const firstSavingYear = years.find((y) => (
    (y.preTaxContribution1 || 0) + (y.rothContribution1 || 0)
    + (y.preTaxContribution2 || 0) + (y.rothContribution2 || 0)
    + (y.hsaContribution || 0) + (y.backdoorRothContribution || 0) > 0
  )) || years[0] || {};
  const startYearNote = firstSavingYear.year ? ` Figures shown are for ${firstSavingYear.year}.` : '';

  const savingsItemFor = (who, mode, preTax, roth, retireAge) => {
    const parts = [];
    if (preTax > 0) parts.push(`${fc(preTax)}/yr Pre-Tax`);
    if (roth > 0) parts.push(`${fc(roth)}/yr Roth`);
    if (parts.length === 0) return null;
    const autoLabel = AUTO_MAX_LABELS[mode];
    return {
      label: autoLabel
        ? `${who}: contribute ${autoLabel} every working year`
        : `${who}: save ${parts.join(' + ')}`,
      detail: autoLabel
        ? `Auto-Max is on, so this is not a fixed amount: it follows the IRS limits, which rise each year and step up again at the catch-up ages. That works out to ${parts.join(' + ')} in ${firstSavingYear.year || 'the first year'}. Until retirement at age ${retireAge}.`
        : `Until retirement at age ${retireAge}.${startYearNote}`,
    };
  };

  const item1 = savingsItemFor(
    spouse1, inputs.autoMaxContribution1,
    firstSavingYear.preTaxContribution1 || 0, firstSavingYear.rothContribution1 || 0,
    inputs.retireAge1,
  );
  if (item1) workingItems.push(item1);
  if (hasSpouse2) {
    const item2 = savingsItemFor(
      spouse2, inputs.autoMaxContribution2,
      firstSavingYear.preTaxContribution2 || 0, firstSavingYear.rothContribution2 || 0,
      inputs.retireAge2,
    );
    if (item2) workingItems.push(item2);
  }
  // The employer match and the backdoor Roth are real money going into the
  // plan and were never mentioned here at all, which understated the whole
  // savings picture even when the fields above were right.
  if ((firstSavingYear.employerMatchAmount || 0) > 0) {
    workingItems.push({
      label: `Collect the employer match: ${fc(firstSavingYear.employerMatchAmount)}/yr into Pre-Tax`,
      detail: `Your employer's money, on top of your own contributions.${startYearNote}`,
    });
  }
  if ((firstSavingYear.backdoorRothContribution || 0) > 0) {
    workingItems.push({
      label: `A ${fc(firstSavingYear.backdoorRothContribution)}/yr backdoor Roth contribution goes into Roth`,
      detail: 'A non-deductible contribution to a Traditional IRA, converted to Roth straight afterward \u2014 the route that stays open when income rules out a direct Roth IRA contribution. Any other pre-tax IRA money you hold makes part of that conversion taxable under the pro-rata rule.',
    });
  }
  if ((inputs.taxableContribution || 0) > 0) {
    workingItems.push({
      label: `Save ${fc(inputs.taxableContribution)}/yr to your Taxable Brokerage account`,
      detail: 'Household total, while at least one spouse is still working.',
    });
  }
  if ((firstSavingYear.hsaContribution || 0) > 0) {
    const hsaAuto = inputs.autoMaxContribution1 === 'max' || inputs.autoMaxContribution2 === 'max';
    workingItems.push({
      label: `Contribute ${fc(firstSavingYear.hsaContribution)}/yr to your HSA`,
      detail: `This plan assumes HSA funds are reserved for qualified medical costs, where they come out tax-free, and spent on anything else only when every other account is empty.${hsaAuto ? ' Auto-Max sets this to the legal limit each year, so it rises with the limits and with the age-55 catch-up.' : ''}${startYearNote}`,
    });
  }
  if (inputs.currentSpendingMode === 'custom' && inputs.currentHouseholdSpendingCustom) {
    workingItems.push({
      label: `Keep household spending near ${fc(inputs.currentHouseholdSpendingCustom)}/yr while working`,
      detail: `Separate from your ${fc(inputs.lifestyleExpense)}/yr retirement spending target below \u2014 this is what you actually live on before retirement.`,
    });
  } else {
    workingItems.push({
      label: "Keep living expenses within what's left after taxes and the savings above",
      detail: 'This plan auto-derives your working-years spending from take-home pay rather than a fixed number; if you know your real budget, set it explicitly under Plan → Spending → Current Household Spending (Pre-Retirement).',
    });
  }
  workingItems.push({
    label: hasSpouse2
      ? `Work until age ${inputs.retireAge1} (${spouse1}) and age ${inputs.retireAge2} (${spouse2})`
      : `Work until age ${inputs.retireAge1}`,
    detail: null,
  });

  // ---------------------------------------------------------------------
  // Section 2: At Retirement
  // ---------------------------------------------------------------------
  const retirementItems = [];

  retirementItems.push({
    label: hasSpouse2
      ? `Claim Social Security at age ${inputs.claimingAge1} (${spouse1}) and age ${inputs.claimingAge2} (${spouse2})`
      : `Claim Social Security at age ${inputs.claimingAge1}`,
    detail: `Estimated benefit at Full Retirement Age: ${fc(inputs.ss1 || 0)}/yr${hasSpouse2 ? ` (${spouse1}), ${fc(inputs.ss2 || 0)}/yr (${spouse2})` : ''}. Claiming earlier or later than FRA changes the actual amount.`,
  });

  // Form SSA-44 (changelog 130). Medicare prices each year's IRMAA from the
  // return filed two years earlier, so the first Medicare years after
  // retirement are charged against peak earning income. SSA will substitute
  // the current year's estimate after a life-changing event, but only if
  // the form is actually filed -- which is why this is an ACTION rather
  // than a setting. Only shown when the engine can see it is worth money.
  const appealYears = years.filter((y) => (y.irmaaAppealSavings || 0) > 0);
  if (appealYears.length > 0) {
    const totalAppealSaving = appealYears.reduce((sum, y) => sum + y.irmaaAppealSavings, 0);
    const firstAppealYear = appealYears[0].year;
    const lastAppealYear = appealYears[appealYears.length - 1].year;
    const spanText = firstAppealYear === lastAppealYear
      ? `${firstAppealYear}`
      : `${firstAppealYear}-${lastAppealYear}`;
    const alreadyAssumed = !!inputs.irmaaLifeChangeAppealEnabled;
    // A declared event (changelog 180) names itself here, because the
    // evidence Social Security asks for differs by event -- a decree for a
    // divorce, a death certificate, a letter from an employer. This is the
    // one place irmaaLifeChangeEventType does any work; it changes no
    // arithmetic anywhere.
    const DECLARED_EVENT_LABELS = {
      marriage: 'a marriage',
      divorce: 'a divorce or annulment',
      deathOfSpouse: 'the death of a spouse',
      workStoppage: 'stopping work',
      workReduction: 'a reduction in work hours',
      lossOfIncomeProperty: 'the loss of income-producing property',
      lossOfPension: 'the loss of pension income',
      employerSettlement: 'an employer settlement payment',
    };
    const declaredLabel = DECLARED_EVENT_LABELS[inputs.irmaaLifeChangeEventType];
    const declaredYear = Math.round(Number(inputs.irmaaLifeChangeEventYear) || 0);
    const declaredEventSentence = (declaredLabel && declaredYear > 0)
      ? `You have recorded ${declaredLabel} in ${declaredYear}, which is a qualifying life-changing event. `
      : '';
    retirementItems.push({
      label: alreadyAssumed
        ? `Form SSA-44: this plan already assumes you file it with Social Security (${spanText})`
        : `Filing Form SSA-44 with Social Security could lower your Medicare premiums in ${spanText}`,
      detail: `${declaredEventSentence}Medicare sets each year's premium from the tax return you filed two years earlier, so your first Medicare years get priced against your working income. Form SSA-44, "Medicare Income-Related Monthly Adjustment Amount - Life-Changing Event", asks Social Security to use this year's estimate instead. Stopping work qualifies. On this plan that is worth about ${fc(totalAppealSaving)} in total across ${spanText}${alreadyAssumed ? ' \u2014 which the projection already reflects, so the saving disappears if the form is never filed.' : `, which this projection does NOT assume: turning on "Assume a Form SSA-44 IRMAA appeal" under Plan \u2192 Taxes & Roth \u2192 Medicare Premiums (IRMAA) shows the plan with it.`} You file it when the premium determination letter arrives, with evidence of the event and either the filed return or an IRS transcript for the year you want used. Seven other events also qualify: marriage, divorce or annulment, death of a spouse, work reduction, loss of income-producing property, loss of pension income, and an employer settlement payment.`,
    });
  }

  retirementItems.push({
    label: 'Draw down accounts in this order:',
    detail: WITHDRAWAL_STRATEGY_LABELS[inputs.withdrawalStrategy] || WITHDRAWAL_STRATEGY_LABELS.TaxableFirst,
  });

  if (inputs.rothConversionStrategy && inputs.rothConversionStrategy !== 'none') {
    // Say what the projection did, not what the settings imply: the first
    // and last year with a conversion, how many, and why they stop (the
    // Roth-ladder cap, or the Pre-Tax balance running out). the owner read the
    // old "continuing each year Pre-Tax funds remain" on the printed page
    // and could not parse it (changelog 261).
    const conversionYears = years.filter((r) => (Number(r.convertAmount) || 0) > 0).map((r) => r.year);
    const firstConv = conversionYears[0];
    const lastConv = conversionYears[conversionYears.length - 1];
    const capYears = Math.round(Number(inputs.rothConversionDurationYears) || 0);
    const whenStart = inputs.rothConversionDelayUntilRetire
      ? `Starts the year you retire${firstConv ? ` (${firstConv})` : ''}`
      : `Starts now${firstConv ? ` (${firstConv})` : ''}`;
    const whenStop = capYears > 0
      ? `runs for ${capYears} year${capYears === 1 ? '' : 's'}`
      : 'repeats every year until the Pre-Tax balance is gone';
    const startNote = conversionYears.length > 0
      ? `${whenStart} and ${whenStop}. In this projection that is ${conversionYears.length} conversion${conversionYears.length === 1 ? '' : 's'}, ${firstConv}${lastConv !== firstConv ? `\u2013${lastConv}` : ''}.`
      : `${whenStart} and ${whenStop}. This projection never converts: there is no year with Pre-Tax money left and room under the target.`;
    if (inputs.rothConversionStrategy === 'fixed') {
      retirementItems.push({
        label: `Your plan converts ${fc(inputs.rothConversionAmount)}/yr from Pre-Tax to Roth`,
        detail: startNote,
      });
    } else if (inputs.rothConversionStrategy === 'maxBracket') {
      const pct = Math.round((inputs.rothConversionBracket || 0) * 100);
      retirementItems.push({
        label: `Your plan converts Pre-Tax to Roth each year, up to the top of the ${pct}% tax bracket`,
        detail: startNote,
      });
    }
  }

  if (inputs.spendingGuardrails) {
    retirementItems.push({
      label: 'Follow spending guardrails after a down market',
      detail: "After a year with a negative return, skip that year's inflation raise; after a crash in your first retired year, cut spending 10%. Restore both once the portfolio is back on your plan's path.",
    });
  }

  // Roth Conversion Ladder Optimizer opportunity note: rothLadderHeatmap is
  // the bracket x withdrawal-order grid from calculator.js's
  // getRothBracketWithdrawalHeatmap (Strategy tab -> Roth Ladder Optimizer),
  // passed in by the caller since it's already computed off the main thread
  // -- buildActionPlan itself never runs projections. Optional and skipped
  // silently if not provided (e.g. a caller that hasn't wired it up yet), so
  // this never breaks existing call sites.
  if (Array.isArray(rothLadderHeatmap) && rothLadderHeatmap.length > 0) {
    const bestCell = rothLadderHeatmap.reduce((best, cell) => (
      !best || cell.endingBalance > best.endingBalance ? cell : best
    ), null);
    const isActiveCombo = inputs.rothConversionStrategy === 'maxBracket'
      && inputs.rothConversionBracket === bestCell.bracket
      && inputs.withdrawalStrategy === bestCell.withdrawalStrategy;
    // A small, arbitrary noise floor -- don't recommend switching strategies
    // over a rounding-level difference that isn't worth the hassle.
    const improvement = bestCell.endingBalance - endingBalance;
    if (!isActiveCombo && improvement > 1000) {
      const bestPct = Math.round(bestCell.bracket * 100);
      retirementItems.push({
        label: `Filling the ${bestPct}% bracket with ${WITHDRAWAL_STRATEGY_SHORT_LABELS[bestCell.withdrawalStrategy] || bestCell.withdrawalStrategy} withdrawals projects a larger ending balance`,
        detail: `Optimizers \u2192 Roth Ladder Optimizer tries every bracket and withdrawal order. It projects ${fc(bestCell.endingBalance)} ending balance for this combination, ${fc(improvement)} more than your current settings. A large gap usually means your current conversion setting is aggressive for your bracket picture.`,
      });
    }
  }

  // Guardrails vs. Fixed-Withdrawal opportunity note: guardrailsComparison is
  // the stress-scenario x guardrails-on/off grid from calculator.js's
  // getGuardrailsComparisonHeatmap (Risk tab -> Guardrails vs Fixed
  // Withdrawals), passed in by the caller the same optional way
  // rothLadderHeatmap is above. The 'none' stress scenario is excluded from
  // the comparison because guardrails only change anything in years with a
  // negative return -- comparing on-vs-off with no crash in the sequence at
  // all would always show a tie and tell the household nothing.
  if (Array.isArray(guardrailsComparison) && guardrailsComparison.length > 0) {
    const crashCells = guardrailsComparison.filter((c) => c.stressType !== 'none');
    const scenarioTypes = [...new Set(crashCells.map((c) => c.stressType))];
    const comparisons = scenarioTypes
      .map((stressType) => {
        const withOn = crashCells.find((c) => c.stressType === stressType && c.guardrailsOn === true);
        const withOff = crashCells.find((c) => c.stressType === stressType && c.guardrailsOn === false);
        if (!withOn || !withOff) return null;
        return { stressType, improvement: withOn.endingBalance - withOff.endingBalance };
      })
      .filter(Boolean);

    if (comparisons.length > 0) {
      const helpedIn = comparisons.filter((c) => c.improvement > 0);
      const hurtIn = comparisons.filter((c) => c.improvement < 0);
      const worseScenario = hurtIn.length > 0
        ? hurtIn.reduce((worst, c) => (c.improvement < worst.improvement ? c : worst))
        : null;

      // Only speak up when guardrails is a clear majority call one way or
      // the other across the tested crash scenarios -- a near-even split
      // isn't a strong enough signal to recommend a change either way.
      if (!inputs.spendingGuardrails && helpedIn.length > hurtIn.length) {
        let detail = `Across ${comparisons.length} historical crash scenarios tested on Risk & Stress, skipping raises after down years (and cutting 10% after a first-year crash) improved the ending balance in ${helpedIn.length} of them.`;
        if (worseScenario) {
          detail += ` The exception was ${STRESS_SCENARIO_LABELS[worseScenario.stressType] || worseScenario.stressType},, where the rule left less behind. The Guardrails vs Fixed Withdrawals comparison there also shows how much spending the rule gave up in each.`;
        }
        retirementItems.push({
          label: 'Spending guardrails helped in most of the historical crashes tested',
          detail,
        });
      } else if (inputs.spendingGuardrails && hurtIn.length > helpedIn.length) {
        retirementItems.push({
          label: 'Spending guardrails left less behind in most of the historical crashes tested',
          detail: `Across ${comparisons.length} historical crash scenarios tested on Risk & Stress, skipping raises after down years (and cutting 10% after a first-year crash) left a lower ending balance in ${hurtIn.length} of them. The Guardrails vs Fixed Withdrawals comparison there shows each one.`,
        });
      }
    }
  }

  // ---------------------------------------------------------------------
  // Section 3: During Retirement
  // ---------------------------------------------------------------------
  const duringItems = [];

  if (inputs.lifestyleThreePhaseEnabled) {
    duringItems.push({
      label: `Target retirement spending: ${fc(inputs.lifestyleExpense)}/yr baseline, on a three-phase curve`,
      detail: `Go-Go (to age ${inputs.goGoEndAge}): ${Math.round((inputs.goGoMultiplier || 1) * 100)}% (${fc(inputs.lifestyleExpense * (inputs.goGoMultiplier || 1))}/yr). Slow-Go (to age ${inputs.slowGoEndAge}): ${Math.round((inputs.slowGoMultiplier || 1) * 100)}% (${fc(inputs.lifestyleExpense * (inputs.slowGoMultiplier || 1))}/yr). No-Go (after): ${Math.round((inputs.noGoMultiplier || 1) * 100)}% (${fc(inputs.lifestyleExpense * (inputs.noGoMultiplier || 1))}/yr).`,
    });
  } else {
    duringItems.push({
      label: `Target retirement spending: ${fc(inputs.lifestyleExpense)}/yr`,
      detail: inputs.goGoBumpEnabled
        ? `Plus a +${inputs.goGoBumpRate}% travel bump through age ${inputs.goGoBumpEndAge}. Inflation-adjusted every year after that.`
        : 'Inflation-adjusted every year.',
    });
  }

  const sortedMilestones = [...(inputs.milestones || [])].sort((a, b) => (a.startAge || 0) - (b.startAge || 0));
  sortedMilestones.forEach((m) => {
    const ageLabel = m.isRecurring ? `ages ${m.startAge}-${m.endAge}` : `age ${m.startAge}`;
    const isOutflow = m.type === 'outflow';
    const amt = `${fc(m.amount)}${m.isRecurring ? '/yr' : ''}`;
    const accountLabel = m.targetAccount === 'preTax' ? 'Pre-Tax' : m.targetAccount === 'roth' ? 'Roth' : 'Taxable Brokerage';
    let detail = null;
    if (isOutflow) {
      detail = m.fundedExternally
        ? 'Funded from savings set aside outside this plan \u2014 no impact on your tracked accounts.'
        : `Drawn from ${(!m.targetAccount || m.targetAccount === 'auto') ? 'accounts, following your withdrawal order above' : accountLabel}.`;
    } else {
      detail = `Deposited into ${accountLabel}${m.isTaxable ? ', taxed as ordinary income' : ''}.`;
    }
    duringItems.push({
      label: `${isOutflow ? 'Plan for' : 'Expect'} "${m.name}": ${amt} at ${ageLabel}`,
      detail,
    });
  });

  if ((inputs.mortgagePayment || 0) > 0) {
    duringItems.push({
      label: `Keep making mortgage payments of ${fc(inputs.mortgagePayment)}/yr`,
      detail: 'Until the balance is paid off.',
    });
  }
  if ((inputs.otherDebtPayment || 0) > 0) {
    duringItems.push({
      label: `Keep making other debt payments of ${fc(inputs.otherDebtPayment)}/yr`,
      detail: 'Until the balance is paid off.',
    });
  }

  // ---------------------------------------------------------------------
  // Section 4: Legacy & Estate
  // ---------------------------------------------------------------------
  const legacyItems = [];
  legacyItems.push({
    label: `Projected ending balance: ${fc(endingBalance)}${headline.horizonYear ? ` in ${headline.horizonYear}` : ''}`,
    detail: isSuccessful
      ? 'Based on the savings, retirement age, claiming age, and spending targets above \u2014 change any of them and this number moves.'
      : "This plan currently projects a shortfall before running out the full horizon \u2014 the steps above alone won't reach a positive ending balance as configured.",
  });

  // Equal split (changelog 259): every heir counts and the label says the
  // fraction, not a rounded 33% that reads as 1% missing. Custom: the
  // heirs with a share, at their normalized share.
  const equalSplit = inputs.heirSplitMode !== 'custom';
  const allHeirs = inputs.heirs || [];
  const heirs = equalSplit ? allHeirs : allHeirs.filter((h) => (h.splitPct || 0) > 0);
  const splitTotal = heirs.reduce((sum, h) => sum + Math.max(0, h.splitPct || 0), 0);
  const heirLabel = (h) => {
    if (equalSplit) return heirs.length === 1 ? h.name : `${h.name} (1/${heirs.length})`;
    const pct = splitTotal > 0 ? (Math.max(0, h.splitPct || 0) / splitTotal) * 100 : 100 / heirs.length;
    return `${h.name} (${Math.round(pct)}%)`;
  };
  if (heirs.length > 0) {
    const defaultStrategyLabel = HEIR_STRATEGY_LABELS[inputs.heirDistributionStrategy] || HEIR_STRATEGY_LABELS.flat_10;
    legacyItems.push({
      label: `Name beneficiaries: ${heirs.map(heirLabel).join(', ')}${equalSplit && heirs.length > 1 ? ' — equal shares' : ''}`,
      detail: `Modeled assuming each heir will ${defaultStrategyLabel}, unless an heir has their own override set in Tax & Estate → Estate Legacy Planner.`,
    });
  }

  const abroadItems = buildAbroadActionItems(inputs, projection, fc);

  return {
    headline,
    sections: [
      { id: 'working', title: "While You're Working", items: workingItems },
      { id: 'retirement', title: 'At Retirement', items: retirementItems },
      { id: 'during', title: 'During Retirement', items: duringItems },
      // Changelog 201: only for a plan with a move abroad.
      ...(abroadItems.length > 0 ? [{ id: 'abroad', title: 'Moving Abroad', items: abroadItems }] : []),
      { id: 'legacy', title: 'Legacy & Estate', items: legacyItems },
    ],
  };
}
