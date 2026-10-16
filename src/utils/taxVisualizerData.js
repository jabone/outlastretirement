// Rows for the Tax & Estate bracket chart and its Filing Detail panel,
// built from projection rows that are already in the display basis
// (utils/displayDollars.js). Lifted out of App.jsx so it can be tested
// against the engine's own figures.
import {
  BRACKETS_MFJ,
  BRACKETS_MFS,
  BRACKETS_SINGLE,
  irmaaScaledThresholds,
  irmaaTopTierFactor,
} from '../calculator';
import { yearFactor } from './displayDollars';

// `options.mfsLivedWithSpouse` (the plan's input, default true) picks the
// married-filing-separately IRMAA schedule: living together is the
// compressed per-return schedule, living apart the single one.
export function buildTaxVisualizerData(years, useRealDollars, { mfsLivedWithSpouse = true } = {}) {
  if (!Array.isArray(years)) return [];
  const startYear = years.length ? years[0].year : 0;
  return years.map(y => {
    const status = y.householdStatus === 'MFJ' || y.householdStatus === 'MFS' ? y.householdStatus : 'Single';
    const brackets = status === 'MFJ' ? BRACKETS_MFJ : status === 'MFS' ? BRACKETS_MFS : BRACKETS_SINGLE;
    const inf = y.taxBracketInflationFactor || 1;
    // The IRMAA thresholds calculateIRMAA() priced this year with: the
    // year's own threshold factor (1 when frozen), the statutory top-tier
    // freeze, and the MFS schedule for a separate return. A tier the
    // schedule does not have (MFS living together has two) is null, so no
    // line is drawn and no comparison can land on it.
    const irmaaFactor = y.irmaaThresholdFactor ?? inf;
    const topFactor = irmaaFactor === 1 ? 1 : irmaaTopTierFactor(y.year, irmaaFactor, startYear);
    const irmaaLines = irmaaScaledThresholds(status, mfsLivedWithSpouse, irmaaFactor, topFactor)
      .map((t) => (Number.isFinite(t) ? t / (useRealDollars ? yearFactor(y) : 1) : null));
    // The rows are already in the display basis (today's or future
    // dollars). The bracket and IRMAA thresholds below are built in the
    // year's own dollars, so they are divided by the same price index the
    // rows were, or the lines and the bars sit in different dollars.
    const shown = useRealDollars ? yearFactor(y) : 1;

    const stdDeduction = y.stdDeduction || 0;
    // The income stack is read from the engine's own row, not rebuilt from
    // the inputs. It used to subtract the inputs' pre-tax contributions
    // (not what the engine deferred that year, and never HSA or NQDC
    // deferrals), count the whole RMD including any QCD and the whole
    // conversion including after-tax basis, and leave out rental and
    // annuity income, ordinary dividends and taxed Roth earnings. It then
    // stacked all of it ON TOP of a standard-deduction block, so the bars
    // stood one deduction higher than the income the engine taxed.
    //
    // The parts now sum to the engine's gross ordinary income
    // (ordinaryTaxableIncome + stdDeduction whenever there is taxable
    // income). Wages, stock vesting and deferred-comp payouts are split
    // out of the engine's `salary`, which carries all three. What the row
    // does not itemize (taxable inflows, the taxable part of an annuity,
    // pre-tax money drawn for a life event) is the "Other ordinary
    // income" layer; if the itemized parts overshoot (after-tax basis in
    // a pre-tax draw), the pre-tax draw layer gives the difference back.
    const stockVesting = (y.rsuIncome1 || 0) + (y.rsuIncome2 || 0);
    const deferredComp = (y.nqdcDistribution1 || 0) + (y.nqdcDistribution2 || 0);
    const payrollDeferrals = (y.preTaxContribution1 || 0) + (y.preTaxContribution2 || 0) + (y.hsaContribution || 0) + (y.nqdcDeferral1 || 0) + (y.nqdcDeferral2 || 0);
    const taxableSalary = Math.max(0, (y.salary || 0) - stockVesting - deferredComp - payrollDeferrals);
    const pension = y.pension || 0;
    const taxableSS = y.taxableSS || 0;
    const rmdAmount = y.rmdTaxableAmount !== undefined ? y.rmdTaxableAmount : (y.rmdAmount || 0);
    let discretionaryDrawPreTax = y.discretionaryDrawPreTax || 0;
    const convertAmount = y.convertAmountTaxable !== undefined ? y.convertAmountTaxable : (y.convertAmount || 0);
    let otherOrdinary = (y.rentalAnnuity || 0) + (y.nuaOrdinaryIncome || 0) + (y.ordinaryDividends || 0) + (y.rothDrawEarningsTaxed || 0);
    const itemized = taxableSalary + stockVesting + deferredComp + pension + taxableSS + rmdAmount + discretionaryDrawPreTax + convertAmount + otherOrdinary;
    const oti = y.ordinaryTaxableIncome || 0;
    const totalOrdinaryGross = oti > 0 ? oti + stdDeduction : itemized;
    const residual = totalOrdinaryGross - itemized;
    if (Math.abs(residual) < 0.5) { /* rounding */ }
    else if (residual > 0) otherOrdinary += residual;
    else {
      const back = Math.min(discretionaryDrawPreTax, -residual);
      discretionaryDrawPreTax -= back;
      otherOrdinary = Math.max(0, otherOrdinary - (-residual - back));
    }

    return {
      year: y.year,
      age1: y.age1,
      age2: y.age2,
      isRetired: y.isRetired,
      householdStatus: y.householdStatus,
      stdDeduction,
      taxableSalary,
      stockVesting,
      deferredComp,
      pension,
      taxableSS,
      rmdAmount,
      discretionaryDrawPreTax,
      convertAmount,
      otherOrdinary,
      totalOrdinaryGross,
      // MAGI as the ENGINE settles it (calculator.js `irmaaMagiFinal`),
      // not a second approximation. This used to be `totalOrdinaryGross`
      // -- an ordinary-income stack that INCLUDES the standard deduction
      // and excludes capital gains -- which meant the Tax & Estate "IRMAA
      // Status" panel and the chart's tier-line picker both read a figure
      // the projection itself disagreed with. Rows from a scenario saved
      // before the engine carried `irmaaMagi` fall back to the old
      // approximation rather than reading zero.
      magi: y.irmaaMagi !== undefined && y.irmaaMagi !== null ? y.irmaaMagi : totalOrdinaryGross,
      // What Medicare actually prices THIS year off: the MAGI from the
      // return filed two years earlier (`lookback`), this year's own
      // figure when there is no such year yet (`current`), or the
      // current-year figure a Form SSA-44 appeal substitutes (`appeal`).
      // Carried so the IRMAA panel can show the tier the plan is really
      // charged rather than one derived from this year's income.
      irmaaBasisMagi: y.irmaaBasisMagi,
      irmaaBasisSource: y.irmaaBasisSource,
      irmaaLookbackMagi: y.irmaaLookbackMagi,
      ordinaryTaxableIncome: y.ordinaryTaxableIncome || 0,
      // Engine results the Filing Detail panel used to rebuild for itself
      // (changelog 176). `totalTaxesPaid` is the year's COMPLETE tax --
      // federal, state, FICA and the marginal tax on the withdrawal the
      // solver sized. The panel used to show an "effective FEDERAL rate"
      // summed from ordinary bracket-filling alone, which missed capital
      // gains, NIIT and AMT; it turns out the engine cannot produce a
      // complete federal-only figure at all, because the draw's tax
      // (`extraTax`) is never split federal/state. So the panel shows the
      // total, named as the total. See calculator.js's comment on
      // baseFederalTax before reintroducing a federal-only number here.
      totalTaxesPaid: y.totalTaxesPaid || 0,
      baseFederalTax: y.baseFederalTax || 0,
      baseStateTax: y.baseStateTax || 0,
      extraTax: y.extraTax || 0,
      // Complete figures since changelog 182 -- the withdrawal solver now
      // splits its own marginal tax, so these carry the draw's tax too and
      // sum with FICA to totalTaxesPaid exactly.
      federalTax: y.federalTax || 0,
      stateTax: y.stateTax || 0,
      ficaTax: y.ficaTax || 0,
      // Years abroad (changelog 196). federalTax + stateTax + ficaTax +
      // foreignTax - foreignTaxCredit === totalTaxesPaid.
      foreignTax: y.foreignTax || 0,
      foreignTaxCredit: y.foreignTaxCredit || 0,
      // marginalBracket respects the TCJA sunset toggle, which a walk up
      // the drawn bracket bars cannot see. realizedGains and
      // taxableDividends complete the income actually taxed, so an
      // effective rate has an honest denominator.
      marginalBracket: y.marginalBracket,
      realizedGains: y.realizedGains || 0,
      taxableDividends: y.taxableDividends || 0,

      // Bracket limits (including Standard Deduction), derived from the
      // shared BRACKETS_MFJ/BRACKETS_SINGLE constants in calculator.js
      // rather than a second hardcoded copy — that duplication caused
      // real drift bugs earlier (see #15 in the project's fix history).
      limit10: stdDeduction + brackets[0].limit * inf / shown,
      limit12: stdDeduction + brackets[1].limit * inf / shown,
      limit22: stdDeduction + brackets[2].limit * inf / shown,
      limit24: stdDeduction + brackets[3].limit * inf / shown,
      limit32: stdDeduction + brackets[4].limit * inf / shown,
      limit35: stdDeduction + brackets[5].limit * inf / shown,

      // The factor the limits above were built with. Published so nothing
      // downstream has to reverse-derive it out of limit10 against a
      // hardcoded standard deduction -- which is what the Filing Detail
      // panel did until changelog 176, using constants (24800 / 12400)
      // that no longer matched the deduction in use.
      taxBracketInflationFactor: inf,
      // The scale the drawn lines use: the bracket inflation over the display
      // divisor. The Filing Detail's bracket bars fill against this so they
      // match the lines and the (converted) taxable income.
      bracketScale: inf / shown,

      // IRMAA thresholds, in the same dollars as the bars (see irmaaLines
      // above). For a separate (MFS) return they are per return: each
      // spouse's own income is measured against them.
      irmaaTier1: irmaaLines[0],
      irmaaTier2: irmaaLines[1],
      irmaaTier3: irmaaLines[2],
      irmaaTier4: irmaaLines[3],
      irmaaTier5: irmaaLines[4],
      irmaaPerReturn: status === 'MFS',
    };
  });
}
