// The Dashboard's "Plan Feedback" carousel, as a pure function.
//
// Deterministic rule-based checks (thresholds on success rate, RMDs, IRMAA
// and so on), the same every time for the same plan -- which is why the UI
// calls this "Plan Feedback" rather than implying an advisor produced it.
//
// This lived inside DashboardTab.jsx until changelog 131. It is pure logic
// over (inputs, projection) with no React in it, it is the sort of thing
// that has to be testable rule by rule, and exporting it from a component
// file breaks React Fast Refresh -- so it sits here beside actionPlan.js,
// the other narrative layer built on the same projection output.
//
// Returns an array of { type, title, desc, action?, quickApply? }, where
// `type` is 'success' | 'warning' | 'danger' | 'info', `action` is a
// { tab, subTab?, label } jump target, and `quickApply` is a
// { label, config } patch the card can apply to `inputs` in one click.

import { reviewDue } from './annualReview';
import { verdictBand, verdictPct, verdictPctText } from './planVerdict';
import { stateTaxJurisdictionFor } from '../calculator';
import { US_STATE_NAME } from '../config/usStates';
import { coupleHorizonOdds } from './mortality';
import { planWarningFeedback, invalidInputLines, CHECK_INPUTS_TITLE } from './planNotices';

export function getPlanFeedback(inputs, projection, mcResults, getRMDAge) {
  const findings = [];

  // Annual review (changelog 256): a plan whose own year lags the calendar
  // is aging every figure it holds. Named first because every age depends
  // on it.
  const due = reviewDue(inputs);
  if (due.due) {
    findings.push({
      type: 'warning',
      title: `This plan still thinks it is ${inputs.planYear}`,
      desc: `It is ${due.years} year${due.years === 1 ? '' : 's'} behind the calendar, so every age, the projection's first year and the Medicare lookback are anchored a year back. The annual review checklist advances the year and walks through what to update.`,
      action: { tab: 'settings', subTab: 'planyear', label: 'Open the annual review →' },
    });
  }
  // Inputs the engine could not run as entered (it used another value), and
  // entries it ran as entered that are probably not what was meant.
  const invalid = invalidInputLines(projection, inputs);
  if (invalid.length) {
    findings.push({
      type: 'danger',
      title: CHECK_INPUTS_TITLE,
      desc: invalid.join(' '),
      action: { tab: 'settings', subTab: 'household', label: 'Open Household \u2192' },
    });
  }
  findings.push(...planWarningFeedback(projection, inputs));

  // The state and the tax jurisdiction disagree (changelog 467): a plan
  // whose jurisdiction was left at 'none' or set by hand to another
  // state's rules is taxed as somewhere it does not live. The two are
  // soft-linked when the state is chosen, so this fires only on an older,
  // imported or hand-edited plan, and on one unlinked on purpose.
  {
    const expected = stateTaxJurisdictionFor(inputs.stateOfResidence);
    const actual = inputs.stateTaxState;
    if (expected !== actual && expected !== 'flat_5' && !(expected === 'state_rules' && actual === 'flat_5')) {
      const stateName = US_STATE_NAME[inputs.stateOfResidence] || inputs.stateOfResidence;
      findings.push({
        type: 'warning',
        title: 'State Tax Does Not Match Your State',
        desc: actual === 'none'
          ? `Your state is ${stateName}, which has an income tax, but this plan charges no state income tax. The State Taxes section can set the jurisdiction to ${stateName}'s own rules.`
          : `Your state is ${stateName}, but this plan's state tax jurisdiction is set differently. The State Taxes section shows which rules the plan is using.`,
        action: { tab: 'settings', subTab: 'taxes', label: 'Open State Taxes \u2192' },
        quickApply: { label: `Tax this plan as ${stateName}`, config: { stateTaxState: expected, stateTaxUnlinked: false } },
      });
    }
  }
  // A couple's horizon (planner's review item 14, changelog 468): two
  // coin-flip ages leave good odds that someone is alive after the plan
  // says both are gone, and every year past the end is an unfunded year.
  // Fires when the SSA table gives one in four or better; the fix runs the
  // plan to the year one in ten couples still has someone alive.
  if (inputs.spouse2Enabled && !inputs.mcLongevityEnabled) {
    const odds = coupleHorizonOdds({ planYear: inputs.planYear, sex1: inputs.sex1, birthYear1: inputs.birthYear1, lifeExpectancy1: inputs.lifeExpectancy1, sex2: inputs.sex2, birthYear2: inputs.birthYear2, lifeExpectancy2: inputs.lifeExpectancy2 });
    if (odds && odds.reachEnd >= 0.25) {
      const pct = Math.round(odds.reachEnd * 100);
      findings.push({
        type: 'warning',
        title: 'The Plan May End While One of You Is Alive',
        desc: `By the SSA life table there is a ${pct}% chance at least one of you is alive when this plan ends in ${odds.endYear}, and the plan funds nothing after that year. One in ten couples still has someone alive in ${odds.oneInTen.year} (ages ${odds.oneInTen.age1} and ${odds.oneInTen.age2}). The Monte Carlo can also sample lifespans instead of fixing them.`,
        action: { tab: 'settings', subTab: 'household', label: 'Open Household \u2192' },
        quickApply: { label: `Plan to ${odds.oneInTen.year} (ages ${odds.oneInTen.age1} and ${odds.oneInTen.age2})`, config: { lifeExpectancy1: odds.oneInTen.age1, lifeExpectancy2: odds.oneInTen.age2 } },
      });
    }
  }
  const initialNestEgg = inputs.preTaxInit + inputs.rothInit + inputs.taxableInit;

  // 1. Success Rate & Core Health
  // Only a finished Monte Carlo for THIS plan gives a success rate. Before
  // one arrives the card says what the average-returns projection shows and
  // that the market check is pending -- it used to print 100% or 0% here
  // (outside review, 2026-09-28), which contradicted the Dashboard verdict.
  const successRate = mcResults && Number.isFinite(mcResults.successProbability) ? verdictPct(mcResults.successProbability) : null;
  // Banded on the same whole percent the card prints (planVerdict.js), so
  // the title and the Dashboard verdict cannot disagree at 89.5%.
  const band = verdictBand(successRate);
  if (!projection.isSuccessful) {
    findings.push({
      type: 'danger',
      title: 'Shortfall Even With Average Returns',
      desc: `With the returns you assumed every year, the plan does not cover its spending to the end.${successRate === null ? '' : ` In the Monte Carlo, ${verdictPctText(successRate)}% of simulated markets last.`} Retiring later, claiming Social Security later, or spending less each change that; the Optimizers and Readiness tabs show by how much.`,
    });
  } else if (successRate === null) {
    findings.push({
      type: 'info',
      title: 'Lasts With Average Returns',
      desc: 'With the returns you assumed every year, the plan covers its spending to the end. How it holds up across good and bad markets appears here once the Monte Carlo check has run.',
      action: { tab: 'risk', subTab: 'montecarlo', label: 'Open the Monte Carlo →' },
    });
  } else if (band === 'good') {
    findings.push({
      type: 'success',
      title: 'On Track',
      desc: `Lasts with average returns, and ${verdictPctText(successRate)}% of simulated markets last too, so there is a buffer against down-years. The Readiness tab shows the most the plan could spend and still last.`
    });
  } else if (band === 'caution') {
    findings.push({
      type: 'warning',
      title: 'Mostly On Track',
      desc: `Lasts with average returns, and ${verdictPctText(successRate)}% of simulated markets last, so a bad run of returns could still fall short. Spending Guardrails (spending trimmed after down years) and a higher savings rate are two settings that change this.`
    });
  } else {
    findings.push({
      type: 'danger',
      title: 'At Risk in Weak Markets',
      desc: `Lasts with average returns, but only ${verdictPctText(successRate)}% of simulated markets last. Retiring later, claiming Social Security later, or spending less each raise that; the Optimizers and Readiness tabs show by how much.`
    });
  }

  // ACA Coverage Gap Warning
  // Note: this reads projection.years (the actual shape runProjection
  // returns) — it previously read projection.data, which is always
  // undefined, so this whole block was silently dead code regardless of
  // the underlying inAcaCoverageGap/acaSubsidyBoost values.
  const acaGapRows = (projection.years || []).filter(d => d.inAcaCoverageGap);
  const acaGapYears = acaGapRows.map(d => d.year);
  // The state(s) the household lives in during those years -- not the
  // plan-wide starting state, which a planned move makes stale.
  const acaGapStates = [...new Set(acaGapRows.map(d => d.residenceState || inputs.stateOfResidence))].join(' and ');
  const inAcaCoverageGap = acaGapYears.length > 0;
  if (inAcaCoverageGap && !inputs.acaSubsidyProtectionEnabled) {
    // Name the actual years (collapsed into ranges, e.g. "2031–2036, 2038")
    // rather than "some years", and point at the Year by Year ledger,
    // which flags the same rows with a GAP badge in its ACA / FPL column.
    const ranges = [];
    for (const y of acaGapYears) {
      const last = ranges[ranges.length - 1];
      if (last && y === last[1] + 1) last[1] = y; else ranges.push([y, y]);
    }
    const yearText = ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
    findings.push({
      type: 'danger',
      title: 'ACA Medicaid Coverage Gap Detected',
      desc: `Because you live in a non-expansion state (${acaGapStates}) and retire early, your projected taxable income falls below the Federal Poverty Level (FPL) in ${acaGapYears.length === 1 ? 'one year' : `${acaGapYears.length} years`} (${yearText}). Below that line the marketplace pays no premium credit in those years, so the plan is charged the full premium. The "ACA Subsidy Protection" setting shows the plan with enough taxable income (from Roth conversions) to stay above the line. Each affected year is flagged with a GAP badge in the Year by Year ledger's ACA / FPL column.`,
      action: { tab: 'settings', subTab: 'taxes', label: 'Enable ACA Subsidy Protection →' }
    });
  } else if (projection.years && projection.years.some(d => d.acaSubsidyBoost > 0)) {
    const totalBoost = projection.years.reduce((sum, d) => sum + (d.acaSubsidyBoost || 0), 0);
    findings.push({
      type: 'success',
      title: 'ACA Subsidy Protection Active',
      desc: `Your ACA Subsidy Protection automatically executed a total of $${totalBoost.toLocaleString()} in forced Roth Conversions during your pre-65 retirement years to keep your taxable income above the poverty line, securing your ACA health insurance subsidies.`
    });
  }

  // AMT — should read $0 for essentially every scenario this app can
  // produce (see the comment above calculateAMT in calculator.js: the 2026
  // exemption dwarfs the only add-back this simplified model computes, the
  // standard deduction), but the check is kept live rather than removed in
  // case a future change to bracket/exemption math or a very large,
  // concentrated Roth conversion ever does push it positive.
  const totalAmt = projection.years ? projection.years.reduce((sum, d) => sum + (d.amtTax || 0), 0) : 0;
  if (totalAmt > 0) {
    findings.push({
      type: 'danger',
      title: 'Alternative Minimum Tax (AMT) Triggered',
      desc: `This plan is projected to owe a combined $${Math.round(totalAmt).toLocaleString()} in Alternative Minimum Tax over the plan horizon, on top of regular federal tax. AMT applies when your tentative minimum tax (income minus the AMT exemption, taxed at 26%/28%) exceeds your regular tax bill — most often triggered by a very large, concentrated Roth conversion in a single year. Consider spreading large conversions across more years to stay under the AMT threshold.`
    });
  }

  // Widow's/Widower's Tax Torpedo: the year a spouse dies, household filing
  // status flips from MFJ to Single immediately (see runProjection's
  // currentStatus logic in calculator.js) -- but income sources like RMDs,
  // pensions, and the deceased spouse's own accounts don't shrink by half
  // the way the tax brackets effectively do (Single brackets are roughly
  // half as wide as MFJ at the same rate). This scans the actual year-by-
  // year projection (already computed, no new calculator.js math needed)
  // for the MFJ->Single transition and flags it if the survivor's marginal
  // bracket jumps meaningfully on what's often similar or only modestly
  // reduced income.
  if (inputs.spouse2Enabled && projection.years) {
    for (let i = 1; i < projection.years.length; i++) {
      const prevYear = projection.years[i - 1];
      const thisYear = projection.years[i];
      if (prevYear.householdStatus === 'MFJ' && thisYear.householdStatus === 'Single') {
        const bracketJump = thisYear.marginalBracket - prevYear.marginalBracket;
        if (bracketJump > 0.02) {
          findings.push({
            type: 'danger',
            title: "Widow's/Widower's Tax Torpedo",
            desc: `In ${thisYear.year}, your household's filing status shifts from Married Filing Jointly to Single following the loss of a spouse, and the surviving spouse's marginal tax bracket jumps from ${(prevYear.marginalBracket * 100).toFixed(0)}% to ${(thisYear.marginalBracket * 100).toFixed(0)}%. This happens because Single filer tax brackets are roughly half as wide as MFJ brackets, while income sources like RMDs and pensions often don't drop proportionally when one spouse passes away. Some couples convert more to Roth while both are alive, in the wider joint brackets, so less is taxed at the survivor's rates; the Tax Optimizer Hub shows what that does on this plan.`,
            action: { tab: 'strategy', subTab: 'optimizer', label: 'Go to Tax Optimizer Hub →' }
          });
          break; // surface only the first such transition, not every year after
        }
      }
    }
  }

  // Form SSA-44 (changelog 131). Medicare prices each year's Part B/D
  // surcharge off the tax return filed TWO YEARS EARLIER, so the first
  // Medicare years after a retirement are billed against peak earning
  // income -- an overpayment that a form, not a plan change, undoes. The
  // engine reports irmaaAppealSavings on every year an appeal would help,
  // whether or not the appeal toggle is on, which is what lets this card
  // exist: it is telling the user about paperwork, not about a setting.
  // Deliberately NOT shown once the toggle is on -- the Action Plan still
  // carries the reminder there, and a Dashboard alert about something the
  // plan already assumes is noise.
  const appealYears = (projection.years || []).filter((d) => (d.irmaaAppealSavings || 0) > 0);
  if (appealYears.length > 0 && !inputs.irmaaLifeChangeAppealEnabled) {
    const totalAppealSaving = appealYears.reduce((sum, d) => sum + d.irmaaAppealSavings, 0);
    const first = appealYears[0].year;
    const last = appealYears[appealYears.length - 1].year;
    const spanText = first === last ? `${first}` : `${first}-${last}`;
    findings.push({
      type: 'warning',
      title: 'Medicare Premiums Billed on Your Working Income',
      desc: `Medicare sets each year's Part B and Part D premium from the tax return you filed two years earlier, so your first Medicare years are surcharged on the income you had while still working. Filing Form SSA-44, "Medicare Income-Related Monthly Adjustment Amount - Life-Changing Event", asks Social Security to use this year's estimated income instead; stopping work qualifies, as do seven other events (marriage, divorce or annulment, death of a spouse, work reduction, loss of income-producing property, loss of pension income, and an employer settlement payment). On this plan an approved appeal is worth about $${Math.round(totalAppealSaving).toLocaleString()} across ${spanText}. This is paperwork you file with Social Security, with evidence of the event attached - the projection below does not assume you file it, so those years currently show the higher premium. Each affected year carries an SSA-44 badge in the Year by Year ledger's Medicare line of the Health column.`,
      action: { tab: 'yearledger', label: 'See the affected years →' },
      quickApply: {
        label: 'Assume the SSA-44 appeal succeeds',
        config: { irmaaLifeChangeAppealEnabled: true }
      }
    });
  }

  // 2. Tax Bucket Mix & RMDs
  const preTaxPct = initialNestEgg > 0 ? (inputs.preTaxInit / initialNestEgg) * 100 : 0;
  const taxablePct = initialNestEgg > 0 ? (inputs.taxableInit / initialNestEgg) * 100 : 0;
  
  if (preTaxPct > 70) {
    const rmdAgeVal = getRMDAge(inputs.birthYear1);
    findings.push({
      type: 'info',
      title: 'Pre-Tax Concentration (RMD Tax Bomb)',
      desc: `${preTaxPct.toFixed(0)}% of your wealth is in Traditional Pre-Tax accounts. Starting at age ${rmdAgeVal}, required withdrawals (RMDs) will force taxable ordinary income on you. The Optimizer Hub shows what converting some of it to Roth in low-bracket years, before Social Security and the required withdrawals start, would do to this plan's taxes and what is left after them.`,
      action: { tab: 'strategy', subTab: 'optimizer', label: 'Go to Tax Optimizer Hub →' }
    });
  }
  
  const retiresBefore59 = (Number(inputs.retireAge1) || 0) < 59.5 || (inputs.spouse2Enabled && (Number(inputs.retireAge2) || 0) < 59.5);
  if (taxablePct < 10 && inputs.preTaxInit > 0) {
    findings.push({
      type: 'info',
      title: 'Low Taxable Liquidity',
      desc: `Your taxable brokerage account accounts for only ${taxablePct.toFixed(0)}% of your assets. Once it is spent, the plan draws from Pre-Tax accounts instead${retiresBefore59 ? ', before age 59½ with the 10% early-withdrawal penalty' : ''}, in good markets and bad, which leaves less room to choose where each year's money comes from.`,
      action: { tab: 'settings', subTab: 'balances', label: 'Adjust Starting Balances →' }
    });
  }

  // Spending Guardrails recommendation
  if (!inputs.spendingGuardrails) {
    findings.push({
      type: 'info',
      title: 'Spending Guardrails Disabled',
      desc: 'Spending Guardrails are off. With them on, spending skips its inflation raise after a down year and is cut 10% after a crash in the first retired year, and both are restored once the portfolio is back on your plan’s path. That often helps a plan last through a bear market, at the cost of spending less while it runs.',
      action: { tab: 'risk', subTab: 'stress', label: 'View Stress Scenarios →' },
      quickApply: {
        label: 'Enable Spending Guardrails',
        config: { spendingGuardrails: true }
      }
    });
  }

  // 3. Asset Allocation & Volatility Risk
  if (!inputs.rebalancingEnabled) {
    findings.push({
      type: 'warning',
      title: 'Static Return Assumption Risk',
      desc: 'You are using flat return rates (pre vs. post retirement). This models average returns but ignores market volatility. Dynamic Asset Allocation (rebalancing) derives the return and the risk from your stock/bond mix instead, under Plan → Assumptions & Risk.',
      action: { tab: 'settings', subTab: 'assumptions', label: 'View Asset Allocations →' },
      quickApply: {
        label: 'Enable Dynamic Asset Allocation',
        config: { rebalancingEnabled: true }
      }
    });
  } else {
    const postStock = inputs.stockAllocationPost;
    if (postStock > 80) {
      findings.push({
        type: 'danger',
        title: 'High Equity Volatility in Retirement',
        desc: `Your post-retirement stock allocation is ${postStock}%. A high-equity portfolio exposes you to Sequence of Returns Risk—a crash in the early years of retirement could cause permanent depletion. Risk & Stress shows how this plan fares in the worst historical starts, and Compare allocations shows other stock shares on your own numbers. The mix is a decision for you and any advisor you work with.`,
        action: { tab: 'settings', subTab: 'assumptions', label: 'Adjust Retirement Allocations →' }
      });
    } else if (postStock < 30) {
      findings.push({
        type: 'warning',
        title: 'High Bond Allocation (Inflation Risk)',
        desc: `Your post-retirement stock allocation is only ${postStock}%. While stable, a low-equity portfolio may fail to outpace long-term inflation. Compare allocations on Risk & Stress shows what other stock shares do to this plan over a 30-year retirement. The mix is a decision for you and any advisor you work with.`,
        action: { tab: 'settings', subTab: 'assumptions', label: 'Adjust Retirement Allocations →' }
      });
    }
  }

  // 4. Social Security claiming
  const age1 = inputs.claimingAge1;
  if (age1 === 62) {
    findings.push({
      type: 'info',
      title: 'Early Social Security Claiming Discount',
      desc: `You are claiming Social Security at age 62, which permanently reduces your benefit check by 30% compared to your Full Retirement Age (FRA). Each year you wait raises the check for life: about 5% to 6.7% a year between 62 and 67, and 8% a year from 67 to 70. The SS Claiming Matrix shows the lifetime totals on this plan, and the years of checks a later start gives up.`,
      action: { tab: 'strategy', subTab: 'ssheatmap', label: 'View SS Claiming Matrix →' },
      quickApply: {
        label: 'Try claiming at 67 (full retirement age)',
        config: { claimingAge1: 67 }
      }
    });
  }

  // 5. Pension COLA Erosion
  const inflationPct = Number(inputs.inflationRate) || 0;
  const halfLifeYears = inflationPct > 0 ? Math.round(Math.log(2) / Math.log(1 + inflationPct / 100)) : null;
  if (inputs.pension1 > 0 && inputs.pension1COLA === 0 && !inputs.pension1LumpSum && halfLifeYears) {
    findings.push({
      type: 'warning',
      title: 'Pension Purchasing Power Erosion',
      desc: `Your pension does not have cost-of-living adjustments (0% COLA). At this plan's ${inflationPct}% inflation its purchasing power halves in about ${halfLifeYears} years, so the portfolio covers more of the spending in late retirement. The plan already prices that; this is a reminder of what it assumes.`,
      action: { tab: 'settings', subTab: 'income', label: 'Adjust Pension Settings →' }
    });
  }

  // 6. Tax Bracket Optimization suggestions based on Optimizer
  if (inputs.rothConversionStrategy === 'none' && inputs.preTaxInit > 100000) {
    findings.push({
      type: 'info',
      title: 'Roth Conversion Arbitrage Opportunity',
      desc: 'You are currently not performing any Roth conversions. Converting Pre-Tax IRA/401(k) assets to Roth in years when your ordinary tax bracket is low (such as right after retirement but before Social Security starts) is one widely used approach, and the Optimizer Hub shows what it does on this plan. A conversion means paying income tax now; whether it helps depends on your brackets now and later, your state, and what you want left for heirs.',
      action: { tab: 'strategy', subTab: 'optimizer', label: 'Compare Strategies in Optimizer Hub →' },
      quickApply: {
        label: 'Try conversions to the 22% bracket',
        config: {
          rothConversionStrategy: 'maxBracket',
          rothConversionBracket: 0.22
        }
      }
    });
  }

  return findings;
}

