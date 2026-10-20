// Today's dollars vs future dollars for DISPLAY: the one place the app
// decides which projection-row fields are money and how each is converted.
//
// runProjection returns every figure in the dollars of the year it happens
// ("future dollars"). Preferences > "Show figures in" defaults to today's
// dollars, which divides each money figure by the price level. Before this
// module there were two hand-kept copies of that conversion (App.jsx's
// DOLLAR_FIELDS list and oneLeverCompare's deflateProjectionForDisplay) and
// they had drifted: the list covered about 106 of the row's 180-odd numeric
// fields, so federalTax, stateTax, FICA, the IRMAA and ACA MAGI figures,
// realized gains and more stayed in future dollars beside a deflated total
// (the 2055 ledger showed $8,292 of total tax next to "$15,693 federal").
//
// ROW_FIELD_CLASS classifies EVERY numeric field a projection row can carry.
// displayDollars.test.js runs projections and fails when a numeric field is
// in no class, so a new engine field cannot silently stay in future dollars.
//
//   'year'    money priced at the year's own level: income, spending, taxes,
//             draws, contributions, thresholds, and start-of-year balances.
//             Divided by the row's price index.
//   'yearEnd' a balance measured at the END of the year (a stock, not a
//             flow). Divided by the next year's price index, i.e. the
//             year's factor times one more year of inflation (see
//             END_OF_YEAR_BALANCES).
//   'none'    not money: ages, years, rates, shares, factors, counts, flags.

// End-of-year balances are one year of inflation further from today than the
// year's flows. Dividing them by the start-of-year factor overstated every
// today's-dollar balance by one year of inflation. The engine's own
// today's-dollar helpers (computeOptimizerResultsReal,
// computeSensitivityAnalysisReal, computeAgeFinderResultsReal, the Roth ladder
// grids, the stress comparison and Historical Starts) import these factors, so
// flipping this switch moves every screen together.
export const END_OF_YEAR_BALANCES = true;

const YEAR = 'year';
const YEAR_END = 'yearEnd';
const NONE = 'none';

const byClass = (cls, fields) => Object.fromEntries(fields.map((f) => [f, cls]));

export const ROW_FIELD_CLASS = Object.freeze({
  ...byClass(NONE, [
    // Who and when
    'year', 'age1', 'age2', 'seniorCount', 'moveMonth',
    'ssEarningsTestCreditMonths1', 'ssEarningsTestCreditMonths2',
    // Price levels and inflation factors
    'priceIndex', 'inflFactor', 'ssColaFactor', 'medicalInflFactor', 'ltcInflFactor',
    'partBInflFactor', 'partDInflFactor', 'irmaaThresholdFactor', 'taxBracketInflationFactor', 'statutoryInflFactor',
    // Rates, shares and multipliers
    'growthRate', 'feeRatePct', 'marginalBracket', 'lifestyleMultiplier', 'housingMultiplier', 'medicalMultiplier',
    'phaseMultiplier', 'essentialShare', 'concentratedStockConcentrationPct',
    'concentratedStock2ConcentrationPct', 'cashReserveMonthsCovered',
    'wrGuardrailRate', 'wrGuardrailMultiplier', 'wrGuardrailPlannedRate',
    'firstDeathBasisResetShare', 'qualifiedDividendShare', 'acaApplicablePct', 'rmdDivisor',
  ]),
  ...byClass(YEAR, [
    // Income and inflows
    'salary', 'rsuIncome1', 'rsuIncome2', 'fixedInflows', 'ssIncome', 'ssOwn1', 'ssIfBoth',
    'ssIfOnly1', 'ssIfOnly2', 'ssEarningsTestWithheld', 'pension', 'rentalAnnuity',
    'annuityPayout', 'nqdcDistribution1', 'nqdcDistribution2', 'reverseMortgagePayoutThisYear',
    // The forward mortgage a reverse mortgage retires at origination (A26).
    'reverseMortgageForwardPayoff',
    // Concentrated-stock sale proceeds spent on the year's bills (E25).
    'concentratedStockProceedsSpent',
    'milestoneInflow', 'lifeInsurancePayoutToSurvivor', 'dividendCash',
    // The cost-basis change at the first death (changelog 360).
    'firstDeathBasisChange',
    // Spending, costs and taxes
    'lifestyleExpenses', 'healthcareBridge', 'ltcCost', 'irmaaCost', 'partBCost', 'partDCost',
    'irmaaTrueUp', 'irmaaAppealSavings', 'totalExpenses', 'totalTaxesPaid', 'extraTax', 'amtTax',
    'conversionTaxCost', 'conversionTrimmedForDraw', 'baseFederalTax', 'baseStateTax', 'ficaTax', 'extraTaxFederal',
    'extraTaxState', 'federalTax', 'stateTax', 'mortgagePaymentThisYear', 'otherDebtPaymentThisYear',
    'milestoneOutflow', 'milestoneOutflowExternal', 'milestoneOutflowGeneral', 'giftsThisYear',
    'surplusReinvested', 'foreignHealthcare', 'medicarePenalty', 'essentialSpending',
    'guaranteedIncome', 'floorGap', 'lifestyleDeficit', 'savingsDeficit', 'shortfall', 'netChange',
    'cashReserveMonthlySpend', 'cashReserveTarget',
    // Foreign tax detail
    'foreignTax', 'foreignTaxCredit', 'foreignTaxCreditGeneral', 'foreignTaxCreditPassive',
    'foreignTaxCreditableGeneral', 'foreignTaxCreditablePassive', 'foreignLocalTax',
    'foreignRothTax', 'foreignContributions', 'foreignWealthTax', 'uncreditableForeignTax',
    'extraTaxForeign',
    // Draws, contributions and conversions
    'drawdown', 'drawPreTax', 'drawRoth', 'drawTaxable', 'discretionaryDrawPreTax', 'rmdAmount',
    'qcdAmount', 'rmdTaxableAmount', 'convertAmount', 'convertAmountTaxable', 'totalContributions',
    'employerMatchAmount', 'backdoorRothContribution', 'hsaContribution', 'hsaMedicalDraw',
    'hsaGeneralDraw', 'hsaGeneralDrawTax', 'hsaGeneralDrawPenalty',
    'nqdcDeferral1', 'nqdcDeferral2', 'preTaxContribution1', 'rothContribution1',
    'preTaxContribution2', 'rothContribution2', 'cashReserveDraw', 'cashReserveReplenish',
    'cashReservePreFund', 'rothDrawFromBasis', 'rothDrawEarningsTaxed', 'rothDrawPenalized',
    'concentratedStockDiversified', 'concentratedStockDiversificationTax',
    'concentratedStockNetProceeds', 'concentratedStockVestedIn', 'concentratedStock2Diversified',
    'concentratedStock2DiversificationTax', 'concentratedStock2NetProceeds',
    'concentratedStock2VestedIn',
    // Tax-line detail, MAGI figures and the thresholds they are compared to
    'taxableSS', 'stdDeduction', 'seniorBonusDeduction', 'ordinaryTaxableIncome',
    'nuaOrdinaryIncome', 'taxableDividends', 'ordinaryDividends', 'realizedGains',
    'taxLossHarvestedThisYear', 'harvestedGainsOffset', 'harvestedOrdinaryOffset', 'lossUsedOnDraw',
    'irmaaMagi', 'irmaaBasisMagi', 'irmaaLookbackMagi', 'irmaaCapCeiling', 'irmaaCappedConversion',
    'acaMagi', 'acaCliffThreshold', 'acaSubsidyBoost', 'acaSubsidyApplied', 'acaSubsidyClawback',
    'acaBenchmarkPremium', 'acaCreditSettled', 'acaSubsidyRefund',
    'itemizedDeduction', 'itemizedSalt', 'itemizedMortgageInterest', 'itemizedCharitable', 'itemizedMedical', 'nonItemizerCharitable',
    'acaCliffCappedConversion',
    // Start-of-year balances are priced at the year's own level
    'preTaxStart', 'rothStart', 'taxableStart', 'hsaStart',
  ]),
  ...byClass(YEAR_END, [
    'preTaxEnd', 'rothEnd', 'taxableEnd', 'hsaEnd', 'totalPortfolioEnding',
    // Investment fees (changelog 447) come off the year-end balance, so they
    // are priced at the year's end. The running total is a sum of nominal
    // fees shown at that year's level -- an approximation; the Fees card
    // sums each year's fee in today's dollars itself.
    'feesPaid', 'fundExpensesPaid', 'advisorFeesPaid', 'feesPaidCumulative',
    'cashReserveBalance', 'nqdcBalance1', 'nqdcBalance2',
    'concentratedStockBalance', 'concentratedStock2Balance',
    'mortgageBalance', 'otherDebtBalance', 'homeValue', 'reverseMortgageBalance', 'homeEquity',
    'otherEstateAssetsValue',
    'lifeInsuranceCashValue', 'lifeInsuranceLoanBalance', 'lifeInsuranceNetCashValue',
    'lifeInsuranceNetDeathBenefit', 'lifeInsuranceNetDeathBenefit1', 'lifeInsuranceNetDeathBenefit2',
    'preTaxBasis', 'taxableBasis', 'rothBasis', 'lossCarryforward',
    'foreignTaxCarryforward', 'foreignTaxCarryforwardGeneral', 'foreignTaxCarryforwardPassive',
  ]),
});

// The row's own price level: realized (priceIndex) when a stress test or a
// Monte Carlo trial moved inflation, the plan's inflFactor otherwise.
export function yearFactor(row) {
  return (row && (Number(row.priceIndex) || Number(row.inflFactor))) || 1;
}

// The price level at the END of row i: the next row's level, or for the
// last row, one more year at the last year's own rate.
export function yearEndFactor(years, i) {
  if (!Array.isArray(years) || years.length === 0) return 1;
  const f = yearFactor(years[i]);
  if (!END_OF_YEAR_BALANCES) return f;
  if (i + 1 < years.length) return yearFactor(years[i + 1]);
  if (years.length >= 2) {
    const prev = yearFactor(years[years.length - 2]);
    return prev > 0 ? f * (f / prev) : f;
  }
  return f;
}

// The factor that converts the plan's final balance (endingBalance, a
// Monte Carlo percentile, the estate) to today's dollars.
export function finalBalanceFactor(years) {
  return Array.isArray(years) && years.length ? yearEndFactor(years, years.length - 1) : 1;
}

// Converts a projection for display. Future dollars returns it untouched.
// Today's dollars returns a copy with every money field of every row
// converted and the plan-level totals re-derived from the converted rows:
// endingBalance and peakPortfolioWorth from totalPortfolioEnding, and the
// lifetime totals as a present value (each year's amount over that year's
// factor -- the treatment the engine's optimizer gives discountedTaxes),
// never the nominal sum over the final factor.
//
// A converted result carries displayBasis: 'today', so a caller can tell it
// from a raw (future-dollar) projection and never convert twice.
export function deflateProjectionForDisplay(proj, useRealDollars) {
  if (!useRealDollars || !proj || !Array.isArray(proj.years) || proj.years.length === 0) return proj;
  if (proj.displayBasis === 'today') return proj;
  const src = proj.years;
  const years = src.map((y, i) => {
    const out = { ...y };
    const f = yearFactor(y);
    const fEnd = yearEndFactor(src, i);
    for (const key in y) {
      const v = y[key];
      if (typeof v !== 'number') continue;
      const cls = ROW_FIELD_CLASS[key];
      if (cls === YEAR) out[key] = v / f;
      else if (cls === YEAR_END) out[key] = v / fEnd;
    }
    return out;
  });
  const sum = (key) => years.reduce((s, y) => s + (Number(y[key]) || 0), 0);
  const last = years[years.length - 1];
  return {
    ...proj,
    years,
    displayBasis: 'today',
    endingBalance: Number(last.totalPortfolioEnding) || 0,
    peakPortfolioWorth: years.reduce((mx, y) => Math.max(mx, Number(y.totalPortfolioEnding) || 0), 0),
    totalTaxesPaid: sum('totalTaxesPaid'),
    totalIRMAAPaid: sum('irmaaCost'),
    totalRMDsForced: sum('rmdAmount'),
  };
}

// A Monte Carlo result in the display basis. Its percentiles are future
// dollars (one runProjection per trial); under today's dollars each
// year's curve point is divided by that year's end-of-year factor of the
// plan's own projection and the ending percentiles by the final one, the
// same factor the Dashboard's Ending Balance uses, so the P10-P90 band
// brackets the headline number on every screen and in print.
export function monteCarloForDisplay(monteCarlo, rawProjection, useRealDollars) {
  if (!monteCarlo) return monteCarlo;
  const years = (rawProjection && rawProjection.years) || [];
  if (!useRealDollars || years.length === 0) return { ...monteCarlo, displayBasis: 'future' };
  const finalF = finalBalanceFactor(years);
  const byYear = new Map(years.map((y, i) => [y.year, yearEndFactor(years, i)]));
  const curves = Array.isArray(monteCarlo.growthCurves)
    ? monteCarlo.growthCurves.map((c) => {
      const f = byYear.get(c.year) || finalF;
      const d = (v) => (typeof v === 'number' ? Math.round(v / f) : v);
      return { ...c, p10: d(c.p10), p25: d(c.p25), p50: d(c.p50), p75: d(c.p75), p90: d(c.p90) };
    })
    : monteCarlo.growthCurves;
  const div = (v) => (typeof v === 'number' ? v / finalF : v);
  return {
    ...monteCarlo,
    displayBasis: 'today',
    endingP10: div(monteCarlo.endingP10),
    endingP50: div(monteCarlo.endingP50),
    endingP90: div(monteCarlo.endingP90),
    averageEndingBalance: div(monteCarlo.averageEndingBalance),
    growthCurves: curves,
  };
}

// The short label a card or print header puts beside a figure.
export function basisLabel(useRealDollars) {
  return useRealDollars ? 'in today’s dollars' : 'in future dollars';
}
