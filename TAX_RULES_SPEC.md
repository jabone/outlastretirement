# OutlastRetirement — Tax Rules Specification for Professional Review

**Version:** 2.35 — 2026-10-31, engine as of changelog 467. *(2.35: a per-person Medicare supplement and out-of-pocket line beside the computed Part B and D premiums (Rule 2.9); the employer match stops at a share of pay (Rule 3.1); a new plan is taxed by the state chosen in Quick Setup (Rule 4.1).)* v2.34 — 2026-10-29, engine as of changelog 465. *(2.34: a year-by-year Roth conversion schedule and the on-device search that writes it (Rule 3.4).)* v2.33 — 2026-10-28, engine as of changelog 464. *(2.33: an optional Social Security start month per spouse, priced by the month and paying only the months from it in the claim year (Rule 3.12).)* v2.32 — 2026-10-28, engine as of changelog 463. *(2.32: a fill-to-bracket Roth conversion may target the 0% tier, converting what the deductions cover with no federal income tax; targets are limited to the real brackets (Rule 3.4).)* v2.31 — 2026-10-28, engine as of changelog 462. *(2.31: a survivor whose own benefit is larger keeps it and starts the survivor benefit only in the first year it pays more, instead of fixing its reduction in the first alone year (Rule 3.12); the trust-fund depletion stress defaults are stated as the engine's 2032 and 22%, from the 2026 Trustees Report (Rule 3.12).)* v2.30 — 2026-10-23, engine as of changelog 457. *(2.30: the 2026-10-23 review — ACA MAGI counts the taxable-earnings slice of a non-qualified Roth draw, as IRMAA MAGI always did (§1.2, Rule 2.10); a working survivor's benefit is subject to the Retirement Earnings Test, with withheld months credited back at FRA (Rules 2.11, 3.12); a Pre-Tax Life-Event withdrawal counts toward the year's RMD (Rule 3.2); SSA's announced 2026 COLA is 2.8%; text corrections where the spec contradicted the correct engine — reinvested dividends add basis (Rule 3.9), the charitable bequest draws on five buckets (Rule 5.4), Maryland credits inheritance tax against its estate tax (Rule 5.5), heir state income tax IS charged (Rule 5.7), each MFS return floors its own deduction (§7), the senior deduction is §70103(a), and the HSA/FICA cafeteria-plan note was inverted (Rule 2.7); notes added on the uncapped §36B(f) repayment (P.L. 119-21 repeal), the Part D premium-stabilization demonstration, AMT gains near the phase-out, pre-claim COLA-vs-AWI indexing, mortgage-insurance premiums, Minnesota's NII surtax and Georgia's 2027 exclusion step-up (Rules 2.5, 2.9, 2.10, 2.2, 3.12, 4.9).)* v2.29 — 2026-10-20, engine as of changelog 448. *(2.29: an optional Keep at Least floor; the Monte Carlo, historical starts and SAFEMAX count a run as lasting only if it never ends a retired year below it (§1.5).)* v2.28 — 2026-10-20, engine as of changelog 447. *(2.28: investment fees — fund expenses (default 0.10%) and an advisor fee (default 0) — come off the Pre-Tax, Roth, Taxable and HSA balances each year after the return, are not deductible (IRC §67(g), made permanent by Pub. L. 119-21; Pub. 529), and also reduce an heir's inherited-account growth (§1.4).)* v2.27 — 2026-10-19, engine as of changelog 443. *(2.27: ACA Cliff Protection is on by default, and the plan warns when the assumed premium is well under the age-rated benchmark (Rule 2.10).)* v2.26 — 2026-10-19, engine as of changelog 442. *(2.26: a Detailed Holdings REIT, option-income or BDC holding left at Not Set is ordinary, and Mixed counts half (Rule 3.9).)* v2.25 — 2026-10-19, engine as of changelog 441. *(2.25: the default qualified share is weighted by what the stock and bond sides yield, not by the balance split (Rule 2.3).)* v2.24 — 2026-10-19, engine as of changelog 440. *(2.24: a QCD beyond the RMD is shown inside the year's Pre-Tax distributions (Rule 3.3); the optimizers' net-to-heirs key prices the heirs' share of the Pre-Tax balance after a bequest at the federal and state rate they pay (Rule 5.0, changelog 438).)* v2.23 — 2026-10-19, engine as of changelog 433. *(2.23: an itemizer's AMTI adds back only the SALT line and the senior deduction, not the whole itemized total (Rule 2.5); §7 and Rule 2.2 no longer say the app does not itemize.)* v2.22 — 2026-10-18, engine as of changelog 430. *(2.22: California's brackets, standard deduction, exemption credit and phase-out carry forward from their 2025 vintage by the Tax Bracket Inflation Rate instead of standing still (Rule 4.4, §1.3, §7).)* v2.21 — 2026-10-18, engine as of changelog 429. *(2.21: a harvested loss is the loss the account holds — basis over the declined value, plus the year's own contribution — and the sale resets the basis (Rule 2.8); §7 notes that an unharvested decline below basis is forfeited.)* v2.20 — 2026-10-18, engine as of changelog 423. *(2.20: the surviving spouse's inherited-IRA election is documented as not modelled (Rule 3.2, §7); §7 brought current for itemized deductions and dividend character.)* v2.19 — 2026-10-18, engine as of changelog 423. *(2.19: a fill-to-bracket Roth conversion is trimmed after the withdrawal solver by the income its draws added, so conversion and Pre-Tax draw together land on the ceiling (Rule 3.4).)* v2.18 — 2026-10-18, engine as of changelog 422. *(2.18: a Monte Carlo trial hands the engine its random draw and the engine prices it in the phase it is in, so the Survivor Stress Test, a fatal care episode and the glide path shape a trial as they shape the plan (§1.3).)* v2.17 — 2026-10-18, engine as of changelog 420. *(2.17: sampled Monte Carlo inflation moves every indexed figure, not only spending (§1.3).)* v2.16 — 2026-10-18, engine as of changelog 419. *(2.16: statutory figures index from their TAX_YEAR vintage rather than the plan's first year (§1.3).)* v2.15 — 2026-10-17, engine as of changelog 418. *(2.15: Wisconsin leaves the ACA coverage-gap list (Rule 2.10); QCDs from the year the owner turns 71, with or without an RMD and not capped at it (Rule 3.3).)* v2.14 — 2026-10-17, engine as of changelog 417. *(2.14: itemized deductions — SALT under the OBBBA cap, mortgage interest on acquisition debt, cash gifts after the 0.5% floor, medical over 7.5% — taken when larger than the standard deduction, and the non-itemizer charitable deduction from 2026 (Rule 2.2).)* v2.13 — 2026-10-17, engine as of changelog 416. *(2.13: RMDs read the Joint and Last Survivor table when the sole-beneficiary spouse is more than 10 years younger (Rule 3.2).)* v2.12 — 2026-10-17, engine as of changelog 415. *(2.12: the ACA premium tax credit is computed — state benchmark premium by age less the Rev. Proc. 2025-25 applicable percentage of MAGI, capped at the premium, estimated before the year and reconciled on the settled MAGI (Rule 2.10).)* v2.11 — 2026-10-17, engine as of changelog 414. *(2.11: the taxable-brokerage qualified share follows the plan's stock/bond split by default, the bond and cash share being interest; a Detailed Holdings bond or cash holding with no Distribution Character is ordinary (Rules 2.3, 3.9).)* v2.10 — 2026-10-17, engine as of changelog 411. *(2.10: SSA's announced 2027 COLA, wage base and earnings-test amounts (Rules 2.11, 3.1); the Survivor Stress Test age is alive-through, like Life Expectancy, so the year of death is a joint return (Q-2).)* v2.9 — 2026-10-17, engine as of changelog 409. *(2.9: the ACA poverty line is the guideline published the year before the coverage year — 2026 coverage on the 2025 table — so the 400% cliff and the coverage-gap floor sit where the marketplace puts them (Rule 2.10).)* v2.8 — 2026-10-17, engine as of changelog 407. *(2.8: two MFS returns each floor their own standard deduction, for the ordinary tax, the gains stack, the NIIT test, the conversion ceiling, the ledger's bracket and a state that starts from the federal deduction (Rule 1.1).)* v2.7 — 2026-10-17, engine as of changelog 406. *(2.7: the max-bracket conversion ceiling and the ledger's marginal bracket read the larger MFS return's share, as the IRMAA cap already did (Rule 1.1); the heir's year-one inherited-IRA draw is priced above the year-one HSA/NQDC lumps on the same return, federal and state; the household effective estate tax rate counts GST and the heirs' state income tax as each heir's rate already did; Today's Dollars deflates the heirs' state income tax (Rule 5.0 and the per-heir rules); a harvested loss covers the solver's draw gains before any of it offsets ordinary income, and the senior-bonus MAGI nets the loss used (Rule 2.8); the draws that fund the ACA boost tax, the subsidy clawback and the IRMAA true-up are taxed and penalized like any other and keep the Roth layer accounting; the boost's tax is split federal/state; the foreign dividend surtax and the §904 re-sourcing follow the split-year and remitted shares and the passive basket needs the country to tax investment income; a QCD comes only from taxable money and leaves the Form 8606 ratio (Rules 2.10, 3.2, the years-abroad section).)* v2.6 — 2026-09-30, engine as of changelog 349. *(2.6: new Rule 4.8 — a Washington jurisdiction with the capital gains excise tax (7% + 2.9% over $1M, RCW 82.87) and, from 2028, the ESSB 6346 income tax (9.9% over a $1,000,000 household deduction, capital gains tax credited); Washington's estate tax runs through its graduated 10%–20% table (Rule 5.5, Q-19 revised); New York's 2026 / 2027–2032 / 2033+ rates re-confirmed against Tax Law §601 (Rule 4.5); Pub. 590-A labelled as the 2025 edition used for rules only, 2026 IRA figures from Notice 2025-67.)* v2.5 — 2026-09-30, engine after the 2026-09 tax review. *(2.5: the senior bonus phases out per person (Rule 2.2); MFS gives each return its own deduction, age add-on, state return and IRMAA test (Rules 1.1, 2.1, 2.2, 2.9, 4.1) and no premium tax credit (Rule 2.10); the survivor keeps their own 65+ deduction whichever spouse survives; provisional income includes every AGI item (§1.2, Rule 2.6); Life-Event Pre-Tax withdrawals before 59½ are penalized (Rule 3.5); Colorado's SS subtraction shares the pension cap and Pennsylvania taxes 401(k) deferrals (Rules 4.2, 4.3, 4.6); NIIT excludes a Pre-Tax-funded annuity (Rule 2.4); the FRA-year earnings test runs for FRA 67 (Rule 2.11); IRMAA's top tier is ≥ and the MFS-together top line is $500,000 less the lower one (Rule 2.9); Auto-Max 401(k) routes the catch-up to Roth over the wage threshold (Rule 3.1); the estate exemption doubles for MFS and the DSUE indexes only to the first death (Rule 5.1); Illinois' 2026 exemption is $2,925; §1.3 corrected.)* v2.4 — 2026-09-24, engine as of changelog 265. *(2.4 replaces the survivor Social Security rule in Rule 3.12: age-60 start, the 71.5%–100% age reduction, RIB-LIM and carried delayed credits, in place of "the greater of the two from 62".)* v2.3 — 2026-09-10, engine as of changelog 165. *(2.3 documents
the taxable-account income change already shipped in changelog 161: the
holdings-linked yield now counts every taxable distribution rather than
dividends alone. It also adds **Q-24**, which proposes splitting that
income by character — NOT implemented, and the one open question in this
document that changes federal tax for an identifiable group of households.
Its design was settled on 2026-09-10: separate buckets rather than one
blended ordinary share, a §199A REIT carve-out, and a user-chosen
derivation. Four sub-questions remain for the reviewer.)* v2.2.1 — 2026-09-05, engine as of changelog 133.
*(2.2.1 was a documentation-only sync: the §5 intro and Rule 3.10 still described the
pre-changelog-119/133 estate, contradicting Rule 5.0 and the code. No
engine change.)* **Q-1 through Q-23 are all
resolved, confirmed as-is, or closed by documentation; Q-24 is new and
open.** This version: Q-18 state estate/inheritance structure
(graduated schedules for OR/MN/MA/RI/IL/MD, NY's 105% credit cliff, MD's
inheritance-tax credit, life insurance out of the inheritance base), Q-13
estate thresholds and heir brackets indexed to the plan's final year, Q-10(b)
concentrated-stock gains taxed inside the engine, Q-1 MFS split across two
returns; Q-22 re-verified and confirmed as-is against Tax Law § 601 as
currently in force. v1.9 (2026-09-02, changelog 126): (Q-17 CA/NY
standard deductions and the IL exemption allowance, Q-8 HSA cannot pay
pre-Medicare insurance premiums, Q-9 pension lump sums / §72(b) annuity
exclusion ratio / after-tax basis pro-rata on every Pre-Tax distribution).
v1.8 (same day, changelog 125): (Q-21
inherited-IRA annual RMDs, Q-10(a) rents/annuities in NII, Q-14 Colorado
rules; Q-16 confirmed as-is). v1.7 (same day, changelog 124): Q-3 unused
deduction against gains, Q-6 Part D $38.99, Q-7 FRA by birth year, Q-11
capital-loss rules, Q-12 MFS AMT breakpoint, Q-23 per-return Additional
Medicare Tax; Q-2, Q-19 and Q-20 confirmed as-is). v1.6 (same day,
changelog 123): IRMAA MAGI is AGI-based: taxable Social Security only, and the discretionary Pre-Tax
draw, realized gains and taxable Roth earnings included — Q-4(b)(c)
resolved; Q-4 closed). v1.5 (same day, changelog 121): IRMAA priced off
the return filed two years earlier, with an optional Form SSA-44
life-changing-event appeal — Q-4(a). v1.4 (same
day, changelog 120): Illinois, Pennsylvania and New York exempt or exclude
IRA/401(k) distributions, RMDs and Roth conversions per their own rules —
Q-15 resolved, Rule 4.3. v1.3 (same day, changelog 119): exact Social Security taxability
worksheet — Q-5 resolved, Rule 2.6; HSA in the gross estate — Q-13
partial; ACA 400%-FPL cliff protection. v1.2 was 2026-08-30 at changelog
104.

**Tax-year vintage of all figures:** 2026 unless a rule says otherwise

**Prepared for:** an Enrolled Agent / CPA reviewing the *rules*, not the code

---

## 0. How to use this document

OutlastRetirement (outlastretirement.com; formerly Cash Flow Engine at cashflowengine.app) is a retirement cash-flow projection
tool. Every year of a household's plan, it computes federal income tax,
FICA, state income tax, Medicare premiums, Social Security benefits and
taxability, required distributions, and — at the end of the plan — estate,
GST, inheritance and heir income taxes. This document states, in plain
language, **every tax rule the engine applies, the dollar figures it uses,
and the authority those figures were taken from**, so that a professional
can confirm each one without reading source code.

Each rule ends with a **Reviewer** line. Please mark one of:

- **Agree** — the rule and figures are correct for tax year 2026 as stated.
- **Correct but incomplete** — right as far as it goes; note what is missing
  and whether it matters for a retirement projection.
- **Issue** — the rule or a figure is wrong; please give the correct
  treatment and, where possible, the statute/publication.

Section 6 collects the **questions we already have** — places where our own
review found something we could not settle, or where a design choice needs a
professional's judgment. Section 7 lists simplifications the engine makes
knowingly. You do not need to re-flag anything in Section 7 unless you think
the simplification is unacceptable for the tool's purpose.

Two conventions to keep in mind throughout:

1. **The engine models one household return per year.** Filing status is
   one of MFJ, Single, or MFS. There is no Head of Household or Qualifying
   Surviving Spouse. When a spouse dies, the survivor is treated as Single
   from that projection year on.
2. **Every dollar figure below is the 2026 statutory amount; the engine
   then indexes some of them forward** through the projection at a
   user-set "Tax Bracket Inflation Rate" (default 2.5%/yr). Section 1.3
   is the table of what is and is not indexed. Where the law fixes a
   figure (NIIT thresholds, SS provisional-income thresholds), the engine
   deliberately does not index it.

---

## 1. Conventions and glossary

### 1.1 Household, ages, filing status

- Two spouses at most, "Spouse 1" and "Spouse 2". Ages are calendar-year
  ages (year − birth year), so an age test such as "59½" is effectively
  "age 60 in that calendar year".
- Filing status is fixed for the plan (MFJ / Single / MFS) while both
  spouses are alive. On the death of either spouse, status becomes Single
  in that same projection year and stays Single.
- For MFS with both spouses alive, the engine models **two returns**: the
  household's income is divided between them by `mfsIncomeSplitPct`
  (default 50), and each return carries its own standard deduction, age
  add-on, state return and IRMAA test (Rules 2.1, 2.2, 2.9, 4.1). A 100%
  split, or a plan with no Spouse 2, is one return (see Q-1 in Section 6).

### 1.2 Income measures the engine computes each year

| Name in this document | What it contains |
|---|---|
| **Ordinary income base** | Wages (net of pre-tax 401(k), HSA and NQDC deferrals) + pensions + federally taxable Social Security + rental and flat annuity income + the taxable part of RMDs (after any QCD) + the taxable part of Roth conversions + other taxable inflows + taxable annuity-purchase payouts + Pre-Tax milestone withdrawals + NUA cost basis − any harvested-loss ordinary offset. |
| **Discretionary Pre-Tax draw** | The additional Pre-Tax withdrawal the engine's solver takes to fund spending. Added to the ordinary income base when pricing that year's tax. |
| **Capital gains** | The qualified share of the taxable-brokerage yield (2% of the balance by default; the share follows the plan's stock/bond split, Rule 2.3), plus realized gains on taxable-brokerage withdrawals (the non-basis fraction of each dollar withdrawn). All gains are treated as long-term. |
| **MAGI proxy** | Ordinary income base + discretionary Pre-Tax draw + capital gains. Used for the OBBBA senior-bonus phase-out and NIIT. |
| **IRMAA MAGI** | Ordinary income base + discretionary Pre-Tax draw + taxable Roth earnings + capital gains — i.e. AGI (tax-exempt interest is not modelled). Social Security enters at its *taxable* amount, as in AGI (since v1.6; Q-4(b)(c)). The figure that sets year N's premium is year N−2's IRMAA MAGI (the two-year lookback, v1.5). |
| **ACA MAGI** | Ordinary income base + discretionary Pre-Tax draw + taxable Roth earnings + capital gains + the non-taxable part of Social Security (§36B(d)(2)(B): AGI plus untaxed Social Security; tax-exempt interest is not modelled). |
| **Provisional income (SS)** | The ordinary income base without Social Security (wages net of deferrals, pensions, rental/flat-annuity income, taxable RMD, Pre-Tax Life-Event withdrawals, the purchased annuity's taxable slice, other taxable inflows, NUA cost basis, less the harvested-loss ordinary offset) + dividends + taxable Roth conversion + the discretionary Pre-Tax draw + realized gains on a Taxable draw + the taxable earnings slice of an early Roth draw + ½ of Social Security. Settled AFTER the withdrawal solver, so it matches AGI; see Rule 2.6. The same "other ordinary income" figure feeds the max-bracket conversion sizing and the ACA / IRMAA conversion caps. |

### 1.3 What is indexed forward, and by what

| Item | Indexed? | Factor |
|---|---|---|
| Ordinary brackets, basic standard deduction, age-65 add-on, LTCG thresholds, AMT exemption / phase-out / rate breakpoint, IRMAA thresholds (unless the user freezes them), Federal Poverty Level, 401(k)/IRA/HSA/QCD limits | Yes | Tax Bracket Inflation Rate (default 2.5%) |
| Social Security wage base | Yes | General inflation rate (proxy for the Average Wage Index) |
| Medicare Part B and Part D premiums | Yes | Their own rates (default 5%/yr each) |
| Social Security benefit | Yes | SS COLA (default 2.5%) |
| NIIT thresholds; SS provisional-income thresholds; Additional Medicare Tax thresholds; OBBBA senior-bonus amount and phase-out; New York brackets and recapture; California BHS threshold | **No** (statutory) | — |
| $3,000 capital-loss ordinary offset ($1,500 MFS) | **No** (statutory, §1211(b); see Q-11) | — |
| Federal estate and GST exemptions; state estate exemptions that index; heir income-tax brackets | Yes, to the plan's final year (see Q-13; "Index estate thresholds" can turn it off). A deceased spouse's unused exclusion (DSUE) is indexed only to the first death (Rule 5.1). | Tax Bracket Inflation Rate |
| HSA age-55 catch-up ($1,000) | **No** (statutory, §223(b)(3)(B)) | — |
| IRMAA top tier ($500,000 / $750,000) | **No** through 2027, then yes (42 U.S.C. 1395r(i)); the MFS-together top line is $500,000 less the indexed lower threshold | Tax Bracket Inflation Rate |

**From which year (v2.16, changelog 419).** Every statutory figure above
is the TAX_YEAR's (2026). Indexing runs from that vintage, not from the
plan's first year: a plan whose first year is 2027 prices 2027 on the
2026 figures carried one year at the relevant rate, and a 2026 plan
opened after the figures roll to 2027 prices 2026 on them carried back
one year (`vintageShift` in runProjection; the estate exemption's year
count runs from TAX_YEAR too). Until 419 the first plan year always used
the figures unindexed, whichever year it was. The user's own today's-dollar
amounts (spending, benefits, property tax, gifts) still index from the
plan's first year, which is their "today". The poverty guideline and SSA's
announced figures are looked up by calendar year and were already right.

**Sampled inflation (v2.17, changelog 420).** In a Monte Carlo trial that
samples a year's inflation, every factor in the table that indexes by a
rate moves by the sampled delta that year and compounds from there: the
brackets and deductions, the IRMAA thresholds, the Part B and D premiums,
the medical and long-term-care factors, the SS COLA (except a year SSA has
announced, which keeps the announced figure) and the statutory limits. A
trial sampled at the planned rate throughout is identical to no sampling.
Until 420 only the spending slices moved (changelog 247), so an
inflation-shock trial overstated the harm.

**Sampled returns (v2.18, changelog 422).** A Monte Carlo trial does not
price its own return. It hands the engine, for each year, either a
standard-normal draw *z* or a bootstrap row of the historical table, and
the engine turns it into that year's return from the expected return and
the risk of the phase it is in — working or retired by its own rules
(including the Survivor Stress Test and a fatal long-term-care episode),
and the glide path's stock share for that year when rebalancing is on.
A lognormal draw is priced at the median-preserving parameters, so *z* = 0
is the plan's own compound return and a zero-volatility run reproduces the
deterministic plan year for year. A numeric override remains an absolute
return. Until 422 the trial loop worked out the phase on its own and
ignored the stress test, so a trial could use working-years returns in
retired years.

---

### 1.4 Investment fees

Every return the user enters, every Monte Carlo draw, stress-test year and historical start is **before** fees. After the year's return, the engine multiplies each of Pre-Tax, Roth, Taxable and HSA by (1 − f), where f is Fund Expenses + Advisor Fee (each 0–5%; defaults 0.10% and 0). The fee is charged on the year-end balance and is not a distribution: a fee paid inside an IRA is not income. It is not deductible: investment fees are miscellaneous itemized deductions (Pub. 529), suspended by IRC §67(g) from 2018 and permanently by Pub. L. 119-21. The cash reserve, home, other property and a concentrated-stock position pay no fee. An heir's inherited-account growth uses the same net return (Rule 5.0). The taxable dividend yield is not reduced by the expense ratio, which slightly overstates taxable dividends (conservative). The ledger carries `fundExpensesPaid` and `advisorFeesPaid` per year; the guardrails' down-year test and tax-loss harvesting read the before-fee market return.

### 1.5 Keep at least (success test)

`portfolioFloorReal` (today's dollars, default 0). A projection's `floorBreachYear` is the first retired year whose year-end Pre-Tax + Roth + Taxable + HSA + cash reserve, divided by that year-end's price factor, is below the floor; `meetsFloor` is `isSuccessful` and no breach. The Monte Carlo success rate, the historical-starts counts and SAFEMAX use `meetsFloor`. The floor changes no cash flow, draw or tax: the deterministic projection's `isSuccessful` is unchanged, and the verdict notes a breach under average returns.

## 2. Federal individual income tax and payroll taxes

### Rule 2.1 — Ordinary income tax brackets

**What the engine does.** Applies the 2026 rate schedule to ordinary taxable
income (ordinary income base + discretionary Pre-Tax draw − standard
deduction, floored at zero). Bracket ceilings are indexed forward (§1.3).

| Rate | MFJ up to | Single up to | MFS up to |
|---|---|---|---|
| 10% | $24,800 | $12,400 | $12,400 |
| 12% | $100,800 | $50,400 | $50,400 |
| 22% | $211,400 | $105,700 | $105,700 |
| 24% | $403,550 | $201,775 | $201,775 |
| 32% | $512,450 | $256,225 | $256,225 |
| 35% | $768,700 | $640,600 | $384,350 |
| 37% | above | above | above |

**Married filing separately files TWO returns (v2.0, Q-1).** The engine
carries one household taxable-income figure. For MFS it now divides that
figure between the two returns by `mfsIncomeSplitPct` (default **50**) and
applies the MFS schedule to each, summing the results. The same split runs
through the preferential-rate bands and the §1411 threshold (Rule 2.3/2.4)
and through the AMT exemption and 28% breakpoint (Rule 2.5), all of which
are per-return figures. Because the MFS ceilings above are exactly half of
MFJ below the top bracket, an even split produces very nearly the MFJ
figure — which is the correct result for a couple with similar incomes, and
is what makes the *other* MFS rules the real cost of the status. Setting
the split to 100 puts everything on one return, which is right for a
one-earner couple and is what the engine assumed for every MFS plan before
v2.0 (overstating a two-earner couple's ordinary tax by roughly a third).
A plan with no second spouse enabled always uses a single return, since
there is only one person filing.

Every per-return line the engine reads against the household figure is
read the same way: the larger return crosses it first, so the household
can reach the line divided by the larger return's share. That is how the
max-bracket conversion ceiling (Rule 3.3) and the IRMAA conversion cap size
a conversion on two returns, and how the ledger's marginal bracket is read
(the larger return's share of the household's taxable income against the
MFS schedule). Until changelog 403 the conversion ceiling and the marginal
bracket read the whole household figure against one MFS return, which for
an even split converted half of what fit and showed a bracket one or two
steps too high.

Each of the two returns also carries its **own** MFS standard deduction and
its own spouse's age-65 add-on (Rule 2.2), and each return's taxable income
is floored at zero on its own: a return whose share of the income is under
its deduction loses the rest of it (§63 — a deduction is not transferable
between separate returns). The ordinary tax, the 0/15/20% stack and the
NIIT test each run per return on that basis, with each return's share of
the gains sheltered by its own unused deduction; a state that starts from
the federal deduction takes that return's own. For an even split between
spouses in the same age band this is identical to dividing the summed
deduction in the income proportion, which is what the engine did until
changelog 407 and which overstated a low-income return's deduction
(an 80/20 split of $60,000 showed $32,200 of deduction against $60,000;
the 20% return can use only $12,000 of its $16,100). The conversion
ceiling and the ledger's marginal bracket read the larger return the same
way: its share of the ordinary income less its own deduction. Before v2.5,
one $16,100 deduction was taken off the couple's combined income, which
cost a 50/50 couple about $3,500 a year at the 22% bracket.

**Knowingly simplified.** The split is one ratio applied to the household's
whole taxable income; the engine does not attribute each income source to
the spouse who earned it (the Pre-Tax bucket in particular has no per-spouse
owner — see Rule 4.3's note on New York's per-person exclusion), nor does it
model community-property states, where the split is 50/50 by law.

**Optional stress toggle — "TCJA rates later repealed":** substitutes the
pre-2018 rates (10/15/25/28/33/35/39.6%) on the *same* 2026 bracket widths
and halves the standard deduction. Off by default; labelled to users as a
hypothetical, since OBBBA made the current rates permanent.

**Authority.** Rev. Proc. 2025-32 (tax year 2026 inflation adjustments).

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 2.2 — Standard deduction, age-65 add-on, OBBBA senior bonus

**What the engine does.** The deduction each year is the larger of the
standard deduction and the itemized total (below, v2.14), plus the senior
bonus either way. The standard deduction is the sum of three parts:

1. **Basic standard deduction:** $32,200 MFJ / $16,100 Single / $16,100 MFS,
   indexed. (Pre-TCJA stress toggle: half these amounts, no personal
   exemption.)
2. **Additional standard deduction for age 65+ (IRC §63(f)):** $1,650 per
   spouse aged 65+ on a married return (MFJ or MFS), $2,050 for an
   unmarried filer, indexed. Blindness is not modelled. On MFS split across
   two returns each spouse counts on their own return; a one-return MFS plan
   (100% split, or no Spouse 2) counts Spouse 1 only. A surviving spouse --
   whichever spouse survives -- counts as one senior on a Single return.
3. **OBBBA senior deduction (P.L. 119-21 §70103(a); IRC §151(d)(5) as
   added):** $6,000 per individual aged 65+, tax years 2025–2028 only, each
   individual's $6,000 reduced separately by 6% of MAGI over $75,000
   (Single) / $150,000 (MFJ), floored at zero -- so two seniors filing
   jointly are fully phased out at $250,000, not $350,000 --
   **not available to MFS**, **not indexed**, allowed whether or not
   the filer itemizes. Because the phase-out depends on MAGI and MAGI
   depends on that year's withdrawals and conversions, the engine solves
   the two together: every tax computation uses the bonus that survives at
   the income it is pricing (MAGI proxy, §1.2).

**Itemized deductions (v2.14, changelog 417).** With `itemizeDeductions:
'auto'` (the default) each year takes the larger of the standard deduction
and the sum of four lines (`itemizedDeductionFor`), AGI approximated by the
MAGI proxy; `'never'` takes the standard deduction, as every plan did
before 417, and two separate MFS returns always do:

1. *State and local taxes* (§164(b)(6) as amended by P.L. 119-21 §70120):
   the state income tax the engine settled for the PRIOR year (cash basis:
   what is paid in a year is largely the prior year's liability; year one
   counts none) plus `propertyTaxAnnual` (today's dollars, housing-inflated),
   capped at $40,000 for 2025 rising 1% a year to 2029 ($40,400 for 2026)
   and $10,000 from 2030, the cap reduced by 30% of MAGI over $500,000
   (2025, +1%/yr) to a floor of $10,000; MFS half of each (`saltCapFor`).
2. *Mortgage interest* (§163(h)(3)(F)): the year's interest from the
   engine's own amortization, when `mortgageIsAcquisitionDebt` (default on),
   pro-rated to $750,000 of principal ($375,000 MFS) when the balance is
   higher. Other debt's interest is never deducted.
3. *Charitable cash gifts* (§170(b)(1)(G), §170(b)(1)(I) as added by
   §70425): `charitableGivingAnnual` (today's dollars, inflated), at most
   60% of AGI, less a floor of 0.5% of AGI from 2026. QCDs (Rule 3.3) are
   excluded from income and never counted here.
4. *Medical* (§213(a)): the pre-65 Healthcare Bridge net of its premium
   tax credit, long-term care costs, and Medicare Part B and D premiums
   including IRMAA, less the HSA's tax-free draw, over 7.5% of AGI. The
   pre-solver base pricing sees the bridge before its credit and without
   the Medicare premiums; the solver and the settled year see the full
   figure.

A standard-deduction year also deducts cash gifts up to $1,000 ($2,000
MFJ) from 2026 (§170(p), P.L. 119-21 §70424; `nonItemizerCharitableFor`),
below the line, so no MAGI changes. The rows carry `deductionUsed`,
`itemizedDeduction` and the four lines. Iowa, Montana and North Dakota
start from federal taxable income (Rule 4.9) and so inherit whichever
deduction the federal return used. Not modelled: the 35% ceiling on the
value of itemized deductions in the 37% bracket (§68 as amended by
§70111), mortgage-insurance premiums as residence interest (§163(h)(3)(E)
as revived by §70108, from 2026), investment interest, casualty losses,
the pre-2018 Pease limit, every other state's own itemizing rules, and
the AMT's other preference items (Rule 2.5 adds back the SALT line for an
itemizer and allows the other three).

**Authority.** Rev. Proc. 2025-32 (basic and §63(f) amounts); P.L. 119-21
§70103(a) as summarised by IRS, H&R Block and the Peter G. Peterson Foundation
(bonus amount, years, phase-out, MFS exclusion). Verified 2026-08-29.
P.L. 119-21 §§70111, 70120, 70424, 70425 (itemized changes from 2025/2026);
IRC §§163(h)(3), 164(b)(6), 170(b), 170(p), 213(a).

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 2.3 — Long-term capital gains and qualified dividends

**What the engine does.** Capital gains (§1.2) are stacked on top of
ordinary taxable income and taxed at 0% / 15% / 20% using these ceilings,
indexed:

| | MFJ | Single | MFS |
|---|---|---|---|
| 0% band ceiling | $98,900 | $49,450 | $49,450 |
| 15% band ceiling | $613,700 | $545,500 | $306,850 |

All gains are treated as long-term; there are no short-term gains in the
model. The taxable-brokerage yield is split between qualified and ordinary
income by a *qualified share* (changelog 208; `taxableQualifiedDividendPct`):
the qualified share joins the gains stack here, the rest is ordinary income
in every ordinary-income sum (Rule 2.1, provisional income, ACA and IRMAA
MAGI, the NIIT base, the state base). **From changelog 414 (v2.11) the
share by default follows the plan's stock/bond split year by year** —
the Working or Retired stock allocation, walked down by the glide path
when rebalancing and the glide are on (`planStockShareForYear`): the stock
side of a brokerage account pays qualified dividends, the bond and cash
side pays interest, which is ordinary. **From changelog 441 (v2.25) the
split is weighted by what each side yields**, not by the balance: with
stocks at 1.3% and bonds at 4% (`taxableStockYieldPct`,
`taxableBondYieldPct`, both editable), a 60/40 account's income is
0.78 + 1.60 = 2.38 points, of which 0.78 / 2.38 = 33% is qualified, where
the balance split said 60% (`qualifiedShareFromAllocation`). The two
yields set only the share; the account's income is still its typed or
linked yield. A typed share applies only with
that switch off (`taxableQualifiedDividendFollowsAllocation: false`); a
plan saved before 414 with a share other than the old 100% default keeps
its figure. Linked to Detailed Holdings the share comes from each holding's
Distribution Character (Rule 3.9).

**Unused standard deduction (v1.7, Q-3).** Where ordinary income is below
the standard deduction, the unused remainder reduces the gains before they
are stacked — taxable income is AGI less the deduction, and the 0% band is
measured on taxable income (Schedule D Tax Worksheet). NIIT (Rule 2.4) is
still measured on MAGI, i.e. before the deduction.

**Authority.** Rev. Proc. 2025-32; §1(h); Form 1040 Schedule D Tax
Worksheet.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 2.4 — Net Investment Income Tax

**What the engine does.** 3.8% on the lesser of (a) capital gains as
defined in §1.2 and (b) MAGI over $250,000 MFJ / $200,000 Single /
$125,000 MFS. Thresholds are **not** indexed (statutory since 2013). MAGI
here is taxable income plus the standard deduction added back (an AGI
proxy).

Net investment income in the engine is dividends, realized gains, net
rental income and non-qualified annuity income (the last two since v1.8,
Q-10(a); they are ordinary income for the brackets and NII for the 3.8%,
per §1411(c)(1)(A)(i)), and the gain realized by a concentrated-stock
diversification (since v2.0, Q-10(b) — see Rule 3.8). The purchased
annuity's taxable payout counts only when the contract was bought with
Taxable (non-qualified) money: an annuity bought from the Pre-Tax bucket is
a qualified-plan distribution, excluded from NII by §1411(c)(5). (The flat
Plan Settings "annuity income" line has no source and stays in NII.)

**Authority.** IRC §1411.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 2.5 — Alternative Minimum Tax

**What the engine does.** Tentative minimum tax = 26% of AMTI up to the
rate breakpoint, 28% above, after an exemption that phases out at 50 cents
per dollar of AMTI over the phase-out start. Regular tax is compared and
the excess (if any) is added. AMTI is the regular taxable income plus the
deductions the AMT disallows: the standard deduction, or in a year that
itemizes (Rule 2.2) the state and local tax line only — mortgage interest,
charitable gifts and medical costs over the floor are allowed under both
systems (§56(b)(1)); the senior deduction is added back. Capital gains are
excluded from both sides of the comparison — the rates are identical under
both systems, but note that in law gains DO enter AMTI and can erode the
exemption through the phase-out (a 50%-rate effect above the thresholds
below since P.L. 119-21), so a household with large ordinary AMTI plus
large gains near the threshold can owe AMT the engine misses; bounded by
26–28% of the exemption, rare for this app's profiles, and conservative to
leave out only in the sense that the comparison stays simple. (v2.23:
until changelog 433 an itemizer's AMTI was the income before any
deduction, which produced a phantom AMT for every household that
itemized.)

| | MFJ | Single | MFS |
|---|---|---|---|
| Exemption | $140,200 | $90,100 | $70,100 |
| Phase-out begins | $1,000,000 | $500,000 | $500,000 |
| 26%→28% breakpoint | $244,500 | $244,500 | $122,250 (v1.7, Q-12) |

All three figures are indexed. Phase-out rate 50% (OBBBA; was 25%).

**Authority.** Rev. Proc. 2025-32, post-OBBBA figures; §56(b)(1) for the
itemized add-back. For a standard-deduction filer AMT never exceeds regular
tax in practice; an itemizer with a large SALT line can owe it. ISOs and
private-activity bond interest are not modelled.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 2.6 — Taxability of Social Security benefits

**What the engine does.** Provisional income = other income (§1.2) + ½ of
benefits. Thresholds (not indexed):

| | Lower | Upper |
|---|---|---|
| MFJ | $32,000 | $44,000 |
| Single | $25,000 | $34,000 |
| MFS, lived with spouse at any time in the year | $0 | $0 |
| MFS, lived apart all year | $25,000 | $34,000 |

**Tier rule (exact worksheet, since 2026-09-02 / changelog 119):** below
the lower threshold, none; between the thresholds, the lesser of 50% of
benefits and 50% of the excess over the lower threshold; above the upper
threshold, the lesser of 85% of benefits and (85% of the excess over the
upper threshold + the capped 50%-tier amount). This replaces the flat
0/50/85% tiers the engine used through v1.2 (Q-5). Cross-checked against
an independent published example (MFJ, $40,000 of benefits + $24,000
pension → $6,000 taxable; plus a $40,000 IRA withdrawal → $34,000 taxable
and $5,564 of 2026 federal tax), reproduced to the dollar.

A Roth conversion counts as provisional income: the engine re-tests
taxability with the conversion included, both when sizing a
"fill-the-bracket" conversion and when computing the year's tax.

**The withdrawals that fund spending count too (changelog 132).** Provisional
income is AGI excluding benefits plus half of benefits, so the discretionary
Pre-Tax draw, the realized gains on a Taxable draw, and the taxable earnings
slice of a pre-59½ Roth draw all belong in the test. Through v2.0 taxable
Social Security was settled BEFORE the withdrawal solver ran, so none of the
three were counted: the draw taken to cover spending is itself what pushes
benefits up a tier, and the engine could not see that cost while sizing the
draw. The solver now re-tests taxability against each candidate draw, and the
settled figure is what the ledger reports — the same ordering fix changelog
123 made for IRMAA MAGI (Q-4b).

Who this moved: only households whose benefits were not already pinned at the
85% cap. A plan comfortably above the upper threshold is affected by exactly
$0, because the cap binds first — the demo Carters sit at $136k–$339k of
provisional income and did not move by a cent. A modest household living off
its Pre-Tax bucket moves a great deal: the engine's own DEFAULT_INPUTS couple
was reporting $0 of taxable benefits while the draw put real provisional
income at $41k–$68k, and correcting it costs about $134,000 of ending balance
over the plan.

**Salary enters net of deferrals (changelog 133).** The wage figure in the
provisional-income test is salary less 401(k), HSA and NQDC deferrals,
matching AGI and the ordinary-income base. Through changelog 132 it was
gross salary, which OVERSTATED provisional income for anyone still working
and deferring — a 63-year-old claiming early while deferring $30,000 was
tested as though that $30,000 were on their return. Retired years are
unaffected, salary being zero there.

**Authority.** IRC §86; IRS Publication 915 (MFS base amount of $0).

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 2.7 — FICA / Medicare payroll taxes

**What the engine does.** Employee share only, on each working spouse's
wages (salary, phased-retirement part-time income, and RSU/GSU vesting
income):

- Social Security 6.2% up to the wage base, **$184,500 for 2026 and $192,300 for 2027** (SSA, announced 2026-10-14; later years index forward from the last announced figure, changelog 410), which
  grows with the plan's general inflation rate in later years as a proxy
  for Average Wage Index adjustment.
- Medicare 1.45% on all wages.
- Additional Medicare Tax 0.9% on combined household wages over $250,000
  MFJ / $200,000 Single; for MFS each spouse's own wages are tested against
  $125,000 separately, as on two returns (v1.7, Q-23). Thresholds not
  indexed.

NQDC deferrals remain in FICA wages in the year deferred (§3121(v)(2)
timing) and NQDC distributions are not FICA-taxed. Pre-tax 401(k) and HSA
contributions are *not* excluded from the FICA wage base (correct for
401(k); for the HSA it matches a DIRECT contribution — an HSA funded
through a §125 cafeteria plan at work IS excluded from FICA wages in law,
so the engine overstates FICA by 7.65% of the contribution for that common
case, a conservative simplification).

**Authority.** ssa.gov/oact/cola/cbb.html (wage base, verified
2026-08-20); 42 U.S.C. §430; IRS Additional Medicare Tax Q&A.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 2.8 — Tax-loss harvesting (optional feature, off by default)

**What the engine does.** In a year the assumed return is negative, the
loss the taxable-brokerage account actually holds after the decline is
"harvested" (v2.21, changelog 429): its basis over the declined value,
never more than the decline itself, and nothing at all while the account
sits on gains — an account at 60% gains has no loss to sell on a 20%
dip. One lot the pooled basis cannot see is the year's own contribution,
bought at the top and under water by the whole decline, so that slice is
harvestable on its own (the larger of the two figures is taken, not the
sum). The sale and rebuy reset the basis to the declined value, so a loss
deducted now is not sheltered again as a smaller gain later. Until 429
the whole balance's decline was booked as a loss whatever the basis, and
the basis was left where it was. Losses first offset that year's realized capital gains — the gains on Life-Event
Taxable withdrawals and on the discretionary Taxable draw the solver takes
— and never the qualified-dividend proxy (v1.7, Q-11(c)); then up to
$3,000 of ordinary income ($1,500 MFS, §1211(b)(1); not indexed —
Q-11(a)(b)); the remainder carries forward indefinitely. Wash-sale
compliance is assumed, not modelled. The order holds for the solver's own
draw too (changelog 404): the ordinary offset is set provisionally before
the draw is sized, and if the draw's gains exceed the loss left after it,
the solver reclaims the offset to cover those gains first, so no loss
reaches ordinary income while a gain is still untaxed. The MAGI the
senior-bonus phase-out is read against (Rule 2.2) counts the draw's gains
net of the loss used on them, as the IRMAA MAGI does.

**Authority.** IRC §§1211–1212.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 2.9 — Medicare Part B and Part D premiums and IRMAA

**What the engine does.** For each household member aged 65+, charges the
Part B premium and a Part D premium every year, using the IRMAA tier that
the IRMAA MAGI (§1.2) **of the projection year two years earlier** falls
in, evaluated against the premium year's (indexed) thresholds — the return
"filed two years earlier" that SSA uses (since v1.5; Q-4(a)). The filing
status of that earlier year is used too, so a new widow(er) is priced off
the joint return for two years, as in practice. The first two projection
years have no earlier row and use their own MAGI (the engine does not ask
for pre-plan income). Thresholds are indexed unless the user selects the
"Freeze IRMAA brackets" stress toggle.

**The top tier does not index through 2027 (v2.1, changelog 132).** 42
U.S.C. §1395r(i) indexes "each dollar amount in paragraph (2) or (3)" to
CPI, but carves out "each dollar amount in paragraph (3) of $500,000",
resuming indexing only "in the case of any calendar year beginning after
2027" from an August 2026 base. So the **$500,000 single / $750,000 joint**
top threshold is fixed in nominal dollars through 2027 and grows only from
2028 — which is why those two figures have not moved since 2019 while every
lower tier moved annually. The engine applies this as current law,
independent of the stress toggle; the four lower tiers continue to index.
The MFS-living-together top line is not a separate dollar amount: the
statute sets it at $500,000 less the (indexed) lower MFS threshold
($391,000 = $500,000 − $109,000 in 2026), so the engine derives it that
way — the $500,000 stays frozen through 2027 and the line moves only as the
subtracted amount indexes. Every tier is "greater than" its floor except
the top one, which CMS words as "greater than or equal to"; the engine
matches both.

**Married filing separately (two returns).** Each spouse's premium is set
by the MAGI on their own return. With Spouse 2 enabled, the engine prices
each spouse on Medicare at their share of the household IRMAA MAGI (the
`mfsIncomeSplitPct` split the income tax uses; a 100% split puts all of it
on Spouse 1's return and prices Spouse 2 at $0) and adds the two premiums.
It used to price both spouses on the combined MAGI, which charged a
$75,000-each couple the second-highest MFS tier twice ($15,581 a year of
Part B against $4,870 jointly). The IRMAA tier cap on Roth conversions
lets household MAGI reach the tier line divided by the larger spouse's
share.

**Federal / state decomposition (v2.4, changelog 182).** `solveWithdrawals`'
internal `getTax` now returns `{ total, federal, state }` via `getTaxParts`;
`getTax` is a `.total` accessor over it, so the binary search and every
sequential strategy price exactly what they did before. The split of the
chosen draw is computed ONCE at the end (`finish`), never threaded through
the 40-iteration search. `extraTax` is accumulated alongside
`extraTaxFederal` / `extraTaxState`: the solver's marginal tax splits
genuinely, while the ACA subsidy boost and clawback are federal. The 10%
early-withdrawal penalty is federal; a state's own additional tax on the
same distribution (California's 2.5%) is state.

Rows therefore carry both the pre-withdrawal partials (`baseFederalTax`,
`baseStateTax`, `ficaTax`) and the complete figures (`federalTax`,
`stateTax`), with the invariant
`federalTax + stateTax + ficaTax === totalTaxesPaid` in every year.
Behaviour-neutral: verified identical across nine plan shapes on thirteen
per-year fields.

**Pre-plan returns (v2.3, changelog 179).** The lookback needs year N−2's
return, so the plan's first two years depend on returns filed before the
projection starts. Two optional inputs supply them —
`irmaaTwoYearsPriorMagi` (planYear−2) and `irmaaPriorYearMagi`
(planYear−1) — seeded into the MAGI history oldest-first before the loop,
so the existing `length − 2` lookback finds them with no other change.
Both default to 0 meaning **not provided**, carried as an `unknown` flag so
a blank falls back to that year's own MAGI rather than being priced as a
genuine $0 return; a plan supplying neither is bit-for-bit unchanged.
Filing status for a seeded year is the plan's *starting* status.

The same change made the SSA-44 appeal reachable for a household that
retired **before** the plan begins. `stoppedWork` requires a working →
retired transition inside the projection, so a plan starting the year
someone retires never recorded an event and the toggle silently did
nothing — for precisely the household these inputs exist for. The event is
now anchored at `startYear − 1` when the household is already retired in
year one, which opens the same window the seeded returns cover. It is
recorded independently of the toggle, matching the in-projection path, so
the ledger badge and Action Plan item can tell a user the form is worth
filing before they know it exists. With no seeds there is no lookback row
in those years, so nothing is computed and no existing plan moves.

**Declared life-changing events (v2.3, changelog 180).** SSA-44 accepts
eight events. The engine detects two (a salary ending, a spouse dying).
The other six are not detection gaps but life events the model does not
represent at all: no marriage or divorce exists in a projection, there is
no pension end age, `rentalIncome` is a flat perpetual stream, and an
employer settlement is unmodelled — and work *reduction* is equally
unreachable because `salary1` is a single constant. `irmaaLifeChangeEventYear`
lets the user declare one; it may precede `planYear`. Where a declared and
a detected event coexist the **later** one wins, so an early declaration
cannot shorten a window opened later. `irmaaLifeChangeEventType` is display
only — it feeds the Action Plan's evidence guidance and changes no
arithmetic. The appeal still applies only where the current year prices
lower, so a declaration can never raise a premium.

**What "IRMAA MAGI" contains (v1.6).** AGI as the engine models it: the
ordinary income base (with Social Security at its taxable amount), the
discretionary Pre-Tax draw the solver takes, taxable Roth earnings,
dividends and realized gains on Taxable draws. It is settled *after* the
withdrawal solver, so a pre-RMD retiree's IRA draw is in it. Tax-exempt
interest is not modelled. Years with no lookback row (the first two) and
years priced through the SSA-44 appeal use a pre-solver estimate that
omits the draw, then are re-priced at the settled figure and the
difference charged as additional premium in the same year, funded in the
plan's withdrawal order (`irmaaTrueUp` in the ledger row).

**Form SSA-44 appeal (optional, default off).** After a life-changing
event — the engine recognises a spouse who was drawing salary stopping
work, and the death of a spouse — the beneficiary may ask SSA to use the
event year's or the following year's estimated MAGI instead of the
lookback year's. With the toggle on, in the event year and the two years
after it the engine charges the lower of the lookback premium and the
current-year premium (an appeal is only filed when it helps). Divorce,
loss of a pension and loss of income-producing property are not modelled.

Part B (monthly):

| Tier | MFJ MAGI over | Single MAGI over | Premium |
|---|---|---|---|
| Standard | — | — | $202.90 |
| 1 | $218,000 | $109,000 | $284.10 |
| 2 | $274,000 | $137,000 | $405.80 |
| 3 | $342,000 | $171,000 | $527.50 |
| 4 | $410,000 | $205,000 | $649.20 |
| 5 | $750,000 | $500,000 | $689.90 |

MFS (lived with spouse): $649.20 above $109,000; $689.90 at or above $391,000.

Part D (monthly): base premium $38.99 (2026 national base beneficiary
premium, CMS July 28 2025 announcement — Q-6, v1.7) plus IRMAA surcharges of
$14.50 / $37.50 / $60.40 / $83.30 / $91.00 at the same tiers. Note: the
2026 base embeds CMS's Premium Stabilization Demonstration (a $10 uniform
reduction in 2026); if the demonstration lapses, the base jumps more than
the Part D inflation default projects — re-check at the annual update.

**Supplement and out-of-pocket line (v2.35, changelog 467).** Beside the
computed Part B and Part D premiums, each person on Medicare is charged a
user-entered annual figure (medicareSupplementCost, $4,500 for a plan
started after October 2026, 0 for one saved earlier) for a Medigap or
Advantage premium, dental, vision, hearing and out-of-pocket costs, grown
at the medical inflation rate. It is an expense, not a premium priced by
income: it counts in the medical itemized deduction (Rule 2.2) and half of
it is treated as HSA-qualified (a Medigap premium is not, Pub. 969; care
is).

**Authority.** CMS "2026 Medicare Parts A & B Premiums and Deductibles"
fact sheet; SSA POMS Part D IRMAA table (via Kiplinger's 2026 summary);
SSA "Medicare Premiums: Rules for Higher-Income Beneficiaries" and Form
SSA-44 (lookback year and life-changing events; fetched 2026-09-02).

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 2.10 — ACA Medicaid coverage gap (non-expansion states)

**What the engine does.** For a household that is retired, not yet both on
Medicare, and resident in AL, FL, GA, KS, MS, SC, TN, TX or WY, flags
any year in which ACA MAGI (§1.2) falls below 100% of the Federal Poverty
Level — no Medicaid and no marketplace subsidy. With "ACA Subsidy
Protection" on, the engine forces a Roth conversion just large enough to
reach the floor. Wisconsin is deliberately not on the list (v2.15,
changelog 418): it has not adopted the expansion, but its BadgerCare Plus
waiver covers childless adults up to 100% of FPL, where marketplace
credits begin, so a Wisconsin household has no gap to fall into; until
418 the engine flagged one and, with Protection on, forced a conversion
that was never needed. Its tax is priced federal and state separately, and the
draws that pay it — as with the subsidy clawback and the IRMAA true-up —
are themselves taxed and, before 59½, penalized, with the tax on that tax
funded the same way (changelog 405; until then the state part of the
boost's tax was reported as federal, and the funding draws went untaxed).

FPL: the guideline published the year BEFORE the coverage year, as the
marketplace applies it (45 CFR 155.300; §36B regulations) — 2026 coverage
uses the 2025 guidelines, $15,650 for one person, +$5,500 per additional
person (90 FR 5917); 2027 coverage uses the 2026 guidelines, $15,960 and
+$5,680 (91 FR 1797); later years index the newest guideline forward at
the bracket inflation rate until the next January's table replaces the
estimate. Household size is 2 for MFJ, else 1. Until changelog 409 the
engine read the current year's guideline and indexed from the plan start,
which put the 2026 cliff at $86,560 for a couple against the real $84,600
(single $63,840 against $62,600): a conversion sized to the engine's line
could cross the marketplace's and forfeit the year's whole credit.

**Married filing separately gets no premium tax credit** (§36B(c)(1)(C);
the domestic-abuse / abandonment exception is not modelled). In an MFS year
the engine applies no "Estimated ACA Premium Tax Credit", runs no 400%
cliff check or cliff-protection cap on conversions, and no coverage-gap
conversion: the Healthcare Bridge cost is paid in full. ACA MAGI and the
cliff line read 0 in those years.

**The 400% ceiling (added 2026-09-02, changelog 119).** With the 2021–2025
enhanced premium tax credits expired, eligibility for 2026 coverage again
ends at 400% of FPL (§36B(c)(1)(A)); one dollar over forfeits the whole
credit. In every state, for any year the household is retired with a
member under 65, the engine computes ACA MAGI (AGI + the non-taxable
portion of Social Security; tax-exempt interest is not modelled) and
flags a breach. With "ACA Cliff Protection" on, voluntary Roth
conversions are capped so estimated MAGI (other ordinary income + all
Social Security + dividends + the taxable share of the conversion) stays
at or under 4 × FPL; discretionary Pre-Tax draws the solver later needs
can still cross the line and are flagged rather than blocked. The FPL
vintage is the statutory prior year (above; changelog 409). Cliff
Protection is on by default since v2.27 (changelog 443), because with the
credit computed a crossing costs the whole year's credit; a saved plan
keeps its own setting. The plan also warns, once, when the premium it
assumes is under 75% of the age-rated benchmark, since the Healthcare
Bridge default is not age-rated and the credit then covers the whole
premium.

**The credit itself (v2.12, changelog 415).** By default
(`acaCreditSource: 'formula'`) the engine computes the premium tax credit
as §36B(b) does: the benchmark premium less the household's contribution,
never more than the premium paid.

- *Benchmark* (§36B(b)(3)(C)): the second-lowest-cost silver plan covering
  the adults on the marketplace that year. The engine has no rating-area
  data, so it uses the state's 2026 average benchmark for a 40-year-old
  (KFF, county premiums weighted by plan selections; US average $625 a
  month, `ACA_BENCHMARK_40_MONTHLY_2026`), one per covered adult, scaled by
  the federal default age curve (45 CFR 147.102: 40 = 1.278, 64 = 3.000;
  New York and Vermont community-rated at 1.0, Massachusetts' 2:1 curve as
  half the federal climb) and the medical inflation factor
  (`acaBenchmarkPremiumAnnual`). The household's own benchmark from
  healthcare.gov's tax tool can be typed instead
  (`acaBenchmarkPremiumSource: 'manual'`, `acaBenchmarkPremiumAnnual`,
  today's dollars).
- *Contribution* (§36B(b)(3)(A)): the applicable percentage of ACA MAGI,
  from the 2026 schedule in Rev. Proc. 2025-25 — 2.10% under 133% of FPL,
  3.14%→4.19% to 150%, 4.19%→6.60% to 200%, 6.60%→8.44% to 250%,
  8.44%→9.96% to 300%, 9.96% to 400% — interpolated linearly within a
  band (`ACA_APPLICABLE_PCT_2026`, `acaApplicablePercent`). Nothing below
  100% of FPL or above 400%. Later years keep the 2026 schedule (its
  indexing is a few hundredths of a point a year).
- *Cap*: the premium share of the Healthcare Bridge cost
  (`healthcareBridgePremiumPct`, 70% by default), since the credit cannot
  exceed the premium (§36B(b)(2)(A)).

*Advance and reconciliation.* The year's credit is estimated before the
withdrawal solver — the way a household projects income to the
marketplace — from the larger of last year's settled ACA MAGI (when the
household was on the marketplace then) and this year's known income
(other ordinary income + all Social Security + dividends + the taxable
share of the conversion chosen for the year), and netted out of the bridge
cost (`acaSubsidyApplied`). After the solver the credit is re-figured on
the settled ACA MAGI (`acaCreditSettled`); the difference is settled on
the return as Form 8962 does — a shortfall repaid as federal tax
(`acaSubsidyClawback`, funded Taxable → Roth → Pre-Tax like the boost
tax), an excess refunded to the taxable account (`acaSubsidyRefund`). A
year over the cliff or in the coverage gap earns nothing and repays the
whole advance. The repayment is deliberately UNCAPPED: the §36B(f)(2)(B)
repayment limitation was repealed by P.L. 119-21 for tax years after 2025
(IRS FS-2025-10), so the old income-tiered caps must not be reintroduced. The first marketplace year of a household with no income
before the solver is estimated at zero and settled as a refund.

*Manual* (`acaCreditSource: 'manual'`): the user-entered "Estimated ACA
Premium Tax Credit" ($/yr, medical-inflated) is netted out of the bridge
cost while eligible and repaid in full as tax in any year that ends over
the cliff or in the coverage gap — the pre-415 behavior, kept for a plan
saved with a typed figure (sanitizeInputs) and for anyone who prefers it.
Not modelled: Medicaid eligibility below 138% of FPL in expansion states
(the engine still prices the marketplace credit there), cost-sharing
reductions, the §36B(c)(1)(E) exception for income under 100% of FPL, and
employer-coverage affordability.

**Authority.** 90 FR 5917 (HHS poverty guidelines, 17 Jan 2025) and 91 FR
1797 (15 Jan 2026); 45 CFR 155.300; 45 CFR 147.102 (age curve); IRC §36B(b),
§36B(c)(1)(A); Rev. Proc. 2025-25 (2026 applicable percentages); KFF
2026 benchmark premiums by state (via Becker's Payer Issues, 20 Nov 2025);
healthinsurance.org Medicaid expansion tracker (state list).

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

## 3. Retirement accounts, contributions and distributions

### Rule 2.11 — Social Security Retirement Earnings Test (v2.3, changelog 178)

42 U.S.C. §403(b)/(f). A beneficiary who claims **before full retirement
age** and still has **earned income** has benefits withheld:

| Situation | Annual exempt amount (2026 / 2027) | Withholding |
|---|---|---|
| Under FRA for the whole year | $24,480 / $25,560 | $1 per $2 of earnings above it |
| Calendar year FRA is attained | $65,160 / $67,920 | $1 per $3 of earnings above it |
| From the month FRA is reached | — | None, at any income |

The 2027 amounts are SSA's, announced 2026-10-14 (changelog 410, with the
2027 COLA of 3.6% and wage base of $192,300); years after the last
announced one index forward from it at the plan's inflation rate. The
2027 COLA governs a plan that keeps the default COLA assumption; a COLA
the user entered governs every year.

Verified 2026-09-14 against `ssa.gov/oact/cola/rtea.html` (2025: $23,400 /
$62,160). Both amounts are AWI-indexed in law; the engine indexes them by
the plan's general inflation factor, the same stand-in `calculateFICATaxes`
already uses for the Social Security wage base.

**Earnings means wages and net self-employment only.** SSA is explicit that
pensions, annuities, investment income, interest, veterans' and other
government or military retirement benefits do not count — so neither do
IRA/401(k) withdrawals, Roth conversions or realized gains, all of which
this engine generates in quantity. The engine tests `ficaWages1/2` (salary
or part-time income, plus RSU vesting), which is the same basis FICA uses
and deliberately excludes the NQDC distributions that `salary` carries by
that point.

**The FRA recomputation is part of the rule, not a refinement.** At FRA,
SSA recalculates the benefit "to give you credit for the months we reduced
or withheld benefits", which is arithmetically identical to having claimed
that many months later. The engine accumulates withheld months per spouse
and, from FRA, prices the benefit at `min(FRA, claimingAge + months/12)`.
Modelling the withholding without the credit would convert a timing rule
into a permanent penalty and would bias every claiming-age comparison in
the app. For a household claiming at 62 with $50,000 of part-time income
and a life expectancy of 90, the two halves together *raise* projected
lifetime benefits by roughly $128,000 relative to the pre-178 engine, which
paid the reduced benefit in full forever.

Withholding is applied per spouse against that spouse's own retirement
benefit and capped at that benefit; it never reaches other income. **A
survivor's benefit is tested too** (survivor benefits are not exempt from
the test, 42 U.S.C. §403(b)): in a survivor year the benefit actually in
payment -- own or survivor, whichever the max-of rule pays -- is tested
against the survivor's own earnings, and the withheld months are credited
back at FRA through the recomputation of whichever benefit was being paid
(the survivor claim age for a survivor benefit, the own claiming age
otherwise).

**Simplifications, all deliberate:**
- The monthly "grace year" test in the first retired year is not modelled.
- A spousal top-up is not reduced by either spouse's earnings (the test
  reaches it in law, both for the worker's excess earnings and the
  recipient's own).
- The engine steps a year at a time and models no birth month. The
  FRA-attainment year is the calendar year in which the age reaches the
  whole-year part of FRA (age 67 for anyone born 1960 or later), and in that
  year the whole calendar year's earnings are tested against the higher
  amount at $1 per $3, where SSA counts only the earnings in the months
  before the FRA month -- conservative for someone whose FRA falls early in
  the year. The test runs in that year only for a benefit claimed before FRA;
  a claim at FRA is never tested. (Until the 2026-09 review the FRA year was
  skipped entirely whenever FRA was a whole age, because the "age ≥ FRA"
  exit ran first.) Months withheld in the FRA year are credited from the
  following year.

### Rule 3.1 — Contribution limits (advisory and "Auto-Max")

| Limit | 2026 figure | Authority |
|---|---|---|
| 401(k)/403(b)/457/TSP elective deferral | $24,500 | IRS Notice 2025-67 |
| Catch-up, age 50+ | $8,000 | Notice 2025-67 |
| "Super" catch-up, ages 60–63 (replaces, does not stack) | $11,250 | Notice 2025-67 |
| §415(c) annual additions | $72,000 | Notice 2025-67 |
| IRA | $7,500 | Notice 2025-67 |
| IRA catch-up, 50+ | $1,100 | Notice 2025-67 |
| HSA self-only / family | $4,400 / $8,750 | Rev. Proc. 2025-19 |
| HSA catch-up, 55+ | $1,000 | IRC §223(b)(3)(B), not indexed |
| Mandatory-Roth catch-up wage threshold (SECURE 2.0) | $150,000 | Notice 2025-67 |
| Roth IRA MAGI phase-out | MFJ $242,000–$252,000; Single $153,000–$168,000; MFS-together $0–$10,000 | Notice 2025-67 (all three 2026 ranges, fetched 2026-09-30); Pub. 590-A 2025 edition for the rules only |

**How they are used.** The engine does not enforce any of these on the
user's entered contributions; they drive the Contribution Advisor's
warnings, the Mega-Backdoor-Roth room estimate, and the optional
"Auto-Max" setting, which sets a spouse's Pre-Tax contribution to the
age-appropriate deferral (or IRA) limit, indexed. In both the "401(k)" and
"max" Auto-Max modes, a spouse aged 50+ whose wages (salary plus RSU vests)
exceed the mandatory-Roth threshold has the catch-up routed to Roth, not
Pre-Tax (§414(v)(7), SECURE 2.0 §603); the "401(k)" mode adds it to that
spouse's Roth contribution. The HSA limit in "max" mode indexes the base
limit only; the $1,000 catch-up is fixed. The §415(c) test ignores
the 100%-of-compensation prong. Roth IRA eligibility is advisory only.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 3.2 — Required minimum distributions

**What the engine does.** Pre-Tax balances are one pooled household
account. RMDs begin at the owner's start age — **73, or 75 for anyone born
in 1960 or later** — and are computed as balance ÷ the Uniform Lifetime
Table divisor for the owner's age. The owner is Spouse 1 while alive, then
the surviving Spouse 2 (treated as a spousal rollover, on Spouse 2's own
age and start age). No first-year April 1 deferral; no still-working
exception. **Any distribution during the year counts toward the
requirement** (Reg. §1.401(a)(9)-5): a Pre-Tax Life-Event withdrawal taken
in an RMD year reduces the amount forced on top of it dollar for dollar,
so a $50,000 Life Event against a $40,000 RMD leaves nothing further to
force. (The discretionary draws the withdrawal solver takes come later in
the year's ordering and do not reduce the RMD; the RMD's cash is credited
to spending first, so the solver only draws beyond it.)

**The survivor's beneficiary election (v2.20, noted 2026-10-17).** A
surviving spouse may instead keep the decedent's IRA as an inherited
account (§401(a)(9)(B)(iv); Reg. §1.401(a)(9)-5(g)(3)): draws are then
penalty-free at any age, RMDs wait until the year the decedent would have
reached their start age (useful when the decedent was the younger
spouse), and from then the survivor's own single-life factor is used
(recalculated yearly). The engine always models the rollover — the
survivor's own age, start age and 59½ test — and never the inherited
election. The cases where the election is better (a survivor under 59½
who needs the money, or a survivor older than a decedent who had not
reached RMD age) are therefore priced with a penalty, or with earlier
RMDs, that a planner would avoid. Listed in §7.

**Joint-life table (v2.13, changelog 416).** While both spouses are alive,
Spouse 2 is the sole beneficiary (`rmdSpouseSoleBeneficiary`, default on)
and more than 10 years younger than Spouse 1 — the ages both attain in
the distribution year, Reg. §1.401(a)(9)-5(c)(2) — the divisor is
Publication 590-B Table II (Joint and Last Survivor Life Expectancy) at
the two ages (`src/config/rmdJointLifeTable.js`, parsed from the
publication by `scripts/parseJointLifeTable.py`; a 75-year-old with a
60-year-old spouse divides by 28.3 instead of 24.6). A gap of ten years
or less, a surviving spouse, or a beneficiary other than the spouse reads
Table III as before. Because the Pre-Tax balance is pooled under Spouse 1,
an older Spouse 2 does not stretch anything: a couple where the younger
spouse owns the larger IRA is understated here. The rows the engine
carries (`rmdDivisor`, `rmdJointLifeTable`) say which table a year used.

Uniform Lifetime Table (Reg. §1.401(a)(9)-9, 2022 update):
73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0,
102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9,
109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0, 115: 2.9,
116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120+: 2.0.

**Employer match (v2.35, changelog 467).** The percent-mode match applies
its rate to deferrals up to the smaller of a share of the IRS elective
deferral limit and, when set, a share of that spouse's pay for the year
(employerMatchCapPayPct, 6% for a plan started after October 2026, 0 = no
pay cap for one saved earlier), so "50% of the first 6% of pay" is the
default reading. The match is added to the Pre-Tax balance and never
counted as the household's own saving.

**Authority.** SECURE 2.0 §107; IRS Publication 590-B (2025), Appendix B Tables II and III; Reg. §1.401(a)(9)-5(c)(2), §1.401(a)(9)-9.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 3.3 — Qualified Charitable Distributions

**What the engine does.** From the year the owner turns 71 (v2.15,
changelog 418; the law says 70½, §408(d)(8)(B)(ii), and whole ages attained
in the year make 71 the first year every owner has passed it), an annual
QCD (user input) is routed from Pre-Tax to charity, with or without an
RMD: it satisfies any RMD due, any excess is a further tax-free
distribution, and all of it is excluded from ordinary income, provisional
income and IRMAA MAGI. Capped at **$111,000** (2026, indexed), the balance,
and the part of the account that is not basis (§408(d)(8)(D): a QCD comes
only from otherwise taxable money). Until 418 a QCD needed an RMD to ride
on (73 or 75) and could not exceed it. The QCD sits in neither Form 8606's year-end balance nor
its distributions, so the pro-rata basis ratio every other distribution
uses that year is basis over the balance less the QCD (changelog 405).
One household cap, not per spouse; the one-time $55,000 split-interest
election is not modelled. The whole QCD, the part beyond the RMD included,
is shown inside the year's Pre-Tax distributions so the account
reconciles, and the Readiness paycheck names it as the charity's, never
the household's (v2.24, changelog 440).

**Authority.** IRC §408(d)(8); IRS Notice 2025-67 ($111,000).

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 3.4 — Roth conversions

**What the engine does.** Three strategies: none; a fixed annual amount; or
"fill to the top of a chosen bracket." The fill-to-bracket amount is found
by search so that ordinary taxable income — with Social Security
re-tested against the conversion and the OBBBA senior bonus phase-out
included — lands at the bracket ceiling minus a user buffer. Conversions
carry no 10% penalty. The taxable share of a conversion follows the
pro-rata rule below. Each conversion becomes a dated Roth basis layer with
its own five-year clock (Rule 3.5); its non-taxable pro-rata share is
recorded separately and is never penalised on withdrawal.

**The 0% tier (v2.32, changelog 463).** The chosen bracket may be 0%,
whose ceiling is $0 of taxable income: the fill then converts as much as
the year's deductions cover (the standard deduction, the 65+ additional
amount and the OBBBA senior deduction, or the itemized total when that is
larger) less the buffer, so the conversion adds no federal income tax. The
same search applies, so a Social Security benefit that becomes taxable as
the conversion grows, and a senior deduction that phases out, are both
re-solved. Targets are limited to 0, 10, 12, 22, 24, 32, 35 and 37%; any
other value in an imported plan takes the 22% default and is listed among
the plan's input corrections (until v2.32 an unknown rate fell through to
a $0 ceiling and silently became the 0% tier). The Roth Ladder grid tests
all eight targets against the four withdrawal orders (32 combinations).

**Year-by-year schedule (v2.34, changelog 465).** A fourth strategy fills
each year to the bracket a schedule names for it ({year, bracket}, the
bracket one of the Rule 3.4 targets or none); a year the schedule does not
name converts nothing, and the duration cap does not apply. Each scheduled
year runs the same search, IRMAA cap, ACA cliff protection and
post-solver trim as the single-bracket strategy, so a schedule with one
bracket in every year projects identically to it. The schedule is written
by an on-device search (optimizeRothSchedule): starting from the better of
no conversions and the best single bracket at the plan's withdrawal order,
it tries, one year at a time over the first 20 conversion years, none, 0,
10, 12, 22, 24 or 32% with the other years held, keeping a change only
when it improves the chosen goal by more than $1 (a tie goes to the lower
bracket); later years repeat the last choice. Goals: what the heirs keep
after every tax in today's dollars (the optimizers' key, Rule 5.0), or the
highest level spending that lasts (§1.5's spend-to-zero bisection, checked
in full at the end). At most 1,200 projections; the result is never worse
than its seeds. It is a coordinate search, not a proof of optimality.

**The fill makes room for the year's spending draw (v2.19, changelog
423).** The search above runs before the withdrawal solver, against the
income known then. Once the solver has drawn, a fill-to-bracket conversion
is trimmed by the ordinary income those draws added (the taxable share of
a discretionary Pre-Tax draw, taxable Roth earnings, a reclaimed harvested
loss): the surplus is unconverted (Pre-Tax back up, Roth back down, the
conversion layer and the Form 8606 basis reversed), the tax it no longer
owes is repriced on the settled year and returned to the Pre-Tax account
that funded it (as surplus into Taxable before 59½, when the draw carried
a penalty already charged), and the loop repeats until ordinary taxable
income sits on the ceiling to the dollar. It is only ever a trim: a
conversion the ACA cliff (Rule 2.10) or the IRMAA cap (Rule 2.9) had held
below the bracket is never enlarged, since re-conversion is limited to
what the loop itself took off. Until 423 a plan funding its spending from
Pre-Tax overshot the target bracket by the whole draw. The trimmed amount
is carried on the year row (`conversionTrimmedForDraw`).

**Pro-rata rule (Backdoor Roth):** after-tax basis in the pooled Pre-Tax
bucket (from non-deductible contributions or a user-entered starting
basis) makes each converted dollar only (1 − basis ÷ balance) taxable.
**Since v1.9 (Q-9(c)) basis is applied to every distribution, not only
conversions.** One ratio is fixed at the start of each year, before the
first distribution and including that year's own non-deductible
contribution (the way Form 8606 line 2 does), and (1 − ratio) of every
dollar leaving the Pre-Tax bucket is ordinary income: RMDs net of any QCD,
Life-Event Pre-Tax withdrawals, the solver's discretionary draw, the
Pre-Tax top-ups that fund an ACA clawback or an IRMAA true-up, and Roth
conversions alike. The basis pool is decremented by the recovered share
each time. The 10% early-distribution penalty is charged on the taxable
share only. The ratio
uses the whole pooled Pre-Tax balance, including 401(k) money (conservative
relative to §408(d)(2), which looks at IRAs only).

**Authority.** IRC §408A(d); IRC §408(d)(2).

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 3.5 — Early-distribution penalty

**What the engine does.** When Spouse 1 is under 59½, any Pre-Tax
withdrawal the solver takes to fund spending, **and any Pre-Tax Life-Event
(milestone) withdrawal**, is charged the 10% federal additional tax on its
taxable (non-basis) share, and California's 2.5% (Rule 4.4). The Life-Event
penalty is part of `baseFederalTax` / `baseStateTax`; the solver's is in
`extraTaxFederal` / `extraTaxState`. No exceptions (§72(t) SEPP, separation
at 55, disability, etc.) are modelled.

**Roth withdrawals follow the §408A(d)(4) ordering rules.** The engine
keeps Roth basis in layers: regular contributions (user-entered starting
figure plus the plan's own Roth contributions and Roth-targeted inflows),
then conversions oldest-first, each dated with the year it was made and
split into its taxable and non-taxable (pro-rata basis) parts. A
withdrawal is deemed to come from contributions, then conversions in
order (taxable part before non-taxable within a layer, Reg. §1.408A-6
Q&A-8), then earnings. Before 59½:

- contributions: no tax, no penalty;
- taxable part of a conversion made fewer than five tax years earlier
  (the clock starts January 1 of the conversion year, so a 2026
  conversion is free from tax year 2031): 10% penalty, no income tax
  (Reg. §1.408A-6 Q&A-5);
- taxable part of a seasoned conversion, and every non-taxable part: no
  tax, no penalty;
- earnings (the amount above total basis): ordinary income plus the 10%
  penalty (and California's 2.5%).

From 59½ the distribution is treated as qualified — the engine assumes the
account satisfies the five-year account rule of §408A(d)(2)(B) by then,
which is not tracked. The user-entered "converted in the last four
years" total is spread evenly over the four calendar years before the
plan and treated as fully taxable when converted. Milestone (Life Event)
withdrawals targeted at Roth consume basis layers but are not themselves
penalised or taxed (pre-existing simplification). Earnings are measured
as balance minus total basis, floored at zero, so a balance below basis
after a market decline yields no taxable earnings.

**Authority.** IRC §72(t); IRC §408A(d)(2), (d)(4); Reg. §1.408A-6.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 3.6 — Net Unrealized Appreciation

**What the engine does.** A one-time in-kind distribution of employer
stock from the Pre-Tax bucket at a chosen age: the cost basis is ordinary
income that year; the appreciation moves to the taxable brokerage account
as unrealized gain (later taxed at long-term rates as it is realized under
the account's blended basis ratio). No lump-sum-distribution test; no
penalty on the basis portion if under 59½; NUA shares are not excluded
from the taxable account's basis step-up at death.

**Authority.** IRC §402(e)(4).

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 3.7 — Non-qualified deferred compensation (§409A)

**What the engine does.** Per spouse: an existing balance grows at a plan
crediting rate; annual deferrals while working reduce ordinary income (but
not FICA wages); distributions over a chosen number of years are ordinary
income and are not FICA-taxed. No employer-insolvency risk, no 409A
penalty, no death-benefit payout; the balance is not included in the
estate (see Q-13).

**Authority.** IRC §409A; §3121(v)(2).

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 3.8 — Equity compensation and concentrated stock

**What the engine does.** RSU/GSU vests are wages: ordinary income and
FICA wages in the vest year. Sell-to-cover is withholding mechanics only
(the engine computes actual tax on the full vest). Shares held after vest
land in a "concentrated stock" bucket at full basis. Planned annual
diversification of that bucket realizes gain (balance × (1 − basis
fraction)).

**Since v2.0 (Q-10(b)) that gain is taxed inside the engine.** The sale is
now taken BEFORE the year's tax calculation rather than after it, so the
gain joins the year's capital-gains base and is stacked in the 0/15/20%
bands, exposed to the §1411 3.8% tax, taxed by the state, and counted in
every MAGI — the ACA cliff test and the IRMAA figure Medicare reads two
years later included. It also appears in the year's total tax paid, where
before it was netted silently out of the sale proceeds. Previously it was
charged a **flat user-set rate (default 15%)** that touched none of those:
a $1,000,000 sale of a position with a 10% basis reported a $135,000 cost
and left ACA MAGI at $53,200. The proceeds still land in Taxable after that
account's own growth, so they are not double-compounded in the year they
move across, and arrive as fresh 100% basis. With vest routing on, the
basis fraction is the tracked blended figure rather than the flat
percentage. `concentratedStockFlatTaxEnabled` (default off) restores the
old flat-rate arithmetic. The concentrated bucket is still not part of the
estate model.

**Authority.** IRC §83; §61; §1(h); §1411.

**Knowingly simplified.** Gains are long-term regardless of holding period,
as everywhere else in the engine (Rule 3.9); there is no §1202 qualified
small business stock exclusion, no §1044 rollover, and no exchange-fund or
collar alternative to an outright sale.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 3.9 — Taxable brokerage account basis and income

**What the engine does.** Basis is tracked as a pool: contributions,
reinvested surplus, NUA basis and diversification proceeds enter at 100%
basis; growth never adds basis; withdrawals remove basis pro-rata. The
starting basis is either entered or defaults to 40% of the balance. Each
withdrawal realizes gain equal to the non-basis fraction. Reinvested
dividends add to basis -- they are after-tax money buying shares, and not
crediting them would tax the same dollars twice -- while dividends paid out
in cash add nothing.

**Income on the account (v2.3, changelog 161).** The engine applies a yield
to the taxable balance each year. That yield is either a user input
(default 2%) or, for a user of the Detailed Holdings area, linked to their
actual holdings. The linked figure counts **every taxable distribution**,
not dividends alone: per holding it takes the higher of the forward
dividend estimate (annual dividend per share × shares) and what that
holding actually distributed in the most recent complete calendar year.
Return of capital is excluded, being a basis reduction rather than income.
Only holdings tagged as belonging to a taxable account are counted — a
distribution inside an IRA, 401(k), Roth or HSA is not taxed in the year it
lands and never enters this figure.

Before changelog 161 the linked figure was dividends only, which omitted
capital gain distributions. For a portfolio of mutual funds those are
frequently the largest payment of the year, and the omission understated
taxable income, IRMAA MAGI and ACA MAGI in every projection year.

**How much of that income is qualified.** Until changelog 208 the whole
of it was added to the capital-gains bucket (`capGains = taxableDividends
+ realizedGains`) at the 0/15/20% rates of Rule 2.3, which overstated
after-tax income for a household holding bond funds, REITs or money-market
funds in a taxable account. Since 208 the linked figure carries a
qualified share built from each Taxable holding's Distribution Character:
Ordinary Dividend and logged interest are ordinary; Qualified Dividend
and capital gain distributions are qualified; Return of Capital is not
income. **From changelog 414 (v2.11) a holding whose character is Not Set
is sorted by its effective asset class** (`taxCharacterForHolding`): a
bond or cash-equivalent holding is ordinary, as its interest is. **From
changelog 442 (v2.26)** a Not Set holding is ordinary too when its ticker
or name marks it a REIT (rent is never a qualified dividend), an
option-income or covered-call fund (option premium) or a business
development company (`ORDINARY_INCOME_TICKERS`, name patterns), and
**Mixed / Fund-Dependent counts one half ordinary**
(`ordinaryIncomeShareForHolding`); until 442 Mixed, and every stock-class
fund left at Not Set, counted as fully qualified. Any other stock holding
left at Not Set stays qualified. A character the user set is always used. Without the link, the share follows the plan's
stock/bond split (Rule 2.3). See **Q-24** for the design history; what
remains there is a short-term-distribution reporting question, the §199A
limitation, and two state/exempt-interest questions.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 3.10 — Health Savings Account

**What the engine does.** One household HSA. Contributions while either
spouse works reduce ordinary income and IRMAA MAGI; growth is untaxed; the
balance is drawn, tax-free, each year against qualified healthcare costs
before any other withdrawal. No non-medical withdrawals, no
Medicare-enrollment contribution stop, no limit enforcement. **Whatever is
left at the end of the plan IS part of the estate model** (changelog 119):
it sits in the gross estate like any other account, and a non-spouse heir
owes ordinary income tax on their whole share in the year of death under
§223(f)(8)(B) — no ten-year stretch, no step-up. A surviving spouse takes
it over as their own instead. See Rule 5.0.

**Which costs are qualified (v1.9, Q-8).** Long-term-care costs and
Medicare Part B/D premiums including IRMAA are qualified at any age. The
pre-Medicare healthcare bridge is **split**: a `healthcareBridgePremiumPct`
input (default 70%) marks the insurance-premium share, which is *not*
qualified, and only the remaining out-of-pocket share is drawn from the
HSA. An `hsaPreMedicarePremiumsQualified` flag treats the whole bridge as
qualified, for the two pre-65 cases the statute does allow — COBRA
continuation coverage and coverage while receiving unemployment
compensation. Before v1.9 the entire bridge, premiums included, was paid
from the HSA tax-free.

**Authority.** IRC §223(d)(2); IRC §213(d)(1)(D) and Pub. 969: "You may
not use HSA funds to pay for insurance, except for the following" —
long-term care insurance, health care continuation coverage (such as
COBRA), coverage while receiving unemployment compensation, and Medicare
and other health care coverage at 65 or older (not Medigap).

**Knowingly simplified.** The 70% default is a planning assumption about
the composition of an early retiree's health budget, not a statutory
figure; the user is expected to set it. Age-based qualified-LTC-premium
limits under §213(d)(10) are not applied.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 3.11 — Annuities

Two separate features:

1. **Flat "Annuity Income ($/yr)" input** — an existing annuity's payout,
   grown with inflation, taxed entirely as ordinary income (the user is
   told to enter the taxable part).
2. **Annuity purchase** — a lump sum moved from a chosen account at a
   chosen age, paying a user-set percentage per year, indexed by an
   optional `annuityIndexation`. **Since v1.9 (Q-9(b)) the taxable share
   of each payout follows the source account:**
   - `preTax` — a qualified annuity with no basis: the payout is fully
     ordinary income.
   - `roth` — a qualified distribution: the payout is fully excluded.
   - `taxable` — non-qualified: the IRC §72(b)(1) exclusion ratio applies.
     The investment in the contract is the premium in the money of the
     purchase year; the expected return is this plan's own projected
     payouts from the purchase age through spouse 1's life expectancy,
     summed with the same indexation. That fraction of each payout is
     excluded, and the exclusion stops once the cumulative excluded amount
     equals the investment (§72(b)(2)).

   The `annuityIsTaxable` toggle is retained as an explicit "tax every
   dollar" override and **remains on by default**, so a plan built before
   v1.9 produces the same numbers until the user turns it off. Payout
   continues for the life of the plan regardless of the annuitant's death;
   no QLAC cap.

**Authority.** IRC §72(b), §72(c)(1).

**Knowingly simplified.** Expected return is taken from the plan's own
life-expectancy input rather than the Reg. §1.72-9 actuarial tables, so a
plan whose life expectancy differs from the table's will exclude a
different share per year (the lifetime total is still capped at the
premium). The §72(b)(3) deduction for unrecovered investment at death is
not modelled, nor is the §72(q) 10% penalty on a pre-59½ non-qualified
annuity payout.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 3.12 — Social Security benefit amounts

**What the engine does.** Each spouse enters the benefit at full retirement
age and a claiming age 62–70. FRA comes from the year of birth (v1.7,
Q-7): 66 for 1943–1954, rising two months a year to 67 for 1960 and later
(ssa.gov agereduction table). The benefit paid is the FRA amount × the
statutory multiplier × cumulative COLA:

- Early: 5/9 of 1% per month for the first 36 months before FRA, 5/12 of
  1% per month beyond, down to 62 (for FRA 67: 62 = 70%, 63 = 75%,
  64 = 80%, 65 = 86.7%, 66 = 93.3%; for FRA 66: 62 = 75%).
- Delayed: 2/3 of 1% per month to age 70 (124% for FRA 67; 132% for FRA
  66; a 1957-born claimant at 70 earns 42 months, 128%).

The cumulative COLA applies from the plan's first year, including years
before the claim. In law a pre-claim benefit grows with the national
Average Wage Index to roughly age 60 and with CPI COLAs only after;
AWI has historically outrun CPI, so a younger planner's FRA amount is
modestly understated — conservative, and the user can simply enter a
present-dollar FRA estimate from ssa.gov, which already embeds AWI
indexing to the statement date.

Single-person plan: benefit starts at the chosen claiming age.
Couple, both alive: each benefit starts at that spouse's claiming age.
Survivor (v2.4, changelog 265; 42 U.S.C. 402(e)/(f)): from age 60, the
larger each year of the survivor's own benefit and the survivor benefit
on the deceased's record. The survivor benefit's base is what the
deceased was receiving, or the full benefit with delayed credits earned
to the death (capped at 70) if they died before claiming. It is 71.5% of
that base for a survivor who starts at 60, rising in a straight line to
100% at the survivor's FRA, fixed at the age the survivor benefit starts:
the first year the survivor is alone, at least 60, and the survivor
benefit at that age pays more than their own benefit. A survivor whose
own check is larger keeps it and files for the survivor benefit later,
in the first year it overtakes their own (at the latest at FRA, when it
is unreduced). RIB-LIM: if the
deceased claimed early, the survivor gets no more than the larger of the
deceased's reduced benefit and 82.5% of the deceased's full benefit. The
survivor FRA table's 1957-1961 steps are approximated by the retirement
FRA. Not modeled: the disabled-widow(er) benefit from 50, the
mother's/father's benefit, and deliberately delaying the survivor benefit
past the first year it pays more than the survivor's own, to lift its
reduction further.

**Spousal benefit (per-spouse toggle, off by default).** When on for a
spouse, the engine adds an "excess spousal" top-up equal to
max(0, 50% × other spouse's FRA benefit − own FRA benefit), multiplied by
the spousal reduction factor for the age at which the top-up first
becomes payable: 25/36 of 1% per month for the first 36 months before 67
and 5/12 of 1% per month beyond (62 = 65%, 64 = 75%), with no delayed
credits above 1.0. The top-up starts at the later of the spouse's own
claiming age and the age they reach when the other spouse files (deemed
filing, §402(r), applied to everyone), and never before 62. Both FRA
amounts are in the same COLA-adjusted dollars. The top-up is subject to
the trust-fund depletion cut and ends at the worker's death (the survivor
rule above then applies). Both toggles off reproduces ss1 + ss2 exactly.
Not modelled: the spouse's own benefit being independently reduced when
the top-up starts later (the engine reduces the own benefit at the own
claiming age and the top-up at its own start age, which is the
post-2016 deemed-filing outcome), the one-year-of-marriage test, and
divorced-spouse benefits.

Optional stress: trust-fund depletion in a chosen year (default 2032)
cutting benefits by a chosen percentage (default 22%): the 2026 Trustees
Report projects the OASI trust fund depleted in the fourth quarter of
2032, with 78% of scheduled benefits payable after. Saved plans keep the
figures they were saved with.

**Start month (v2.33, changelog 464).** Each spouse may choose the month
the benefit starts, January to December of the calendar year they reach
their claiming age (claimMonth, 0 to 11; January is the whole-year plan
of every earlier version). The benefit is priced at the claiming age plus
that many twelfths through the same monthly multiplier (5/9 of 1% for each
of the first 36 months early, 5/12 of 1% beyond, 2/3 of 1% of delay), and
the claim year pays (12 − month) of 12 months. The exact age also prices a
spousal top-up (paid from its start month in its first year), the
survivor benefit's base and RIB-LIM, and the earnings test's FRA
recomputation; the earnings test reads the part-year benefit in the claim
year. With no birth month in the plan, the months count from the start of
the calendar year. A claim at 70 always starts in January. The claiming
grid compares whole ages.

**Authority.** 42 U.S.C. §402(b), (c), (q), (r), (w); SSA Trustees' 2026
Annual Report (ssa.gov/oact/TR/2026; SSA press release 2026-06-09).

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 3.13 — Pensions

**What the engine does.** Per spouse: a benefit from a start age, with its
own COLA; a survivor percentage (default 50%) paid to the other spouse on
death; flags for government / military (used by state rules); an optional
lump sum at the start age. Pension income is fully ordinary federally. No
after-tax-contribution basis recovery (§72 simplified method).

**Lump sum (v1.9, Q-9(a)).** Taken in cash, the lump sum is ordinary
income in the year received (IRC §402(a)) and is *not* additionally added
to spendable cash: it is the pension income for that year, and it carries
the same state treatment — government / military exempt, or private — that
the recurring benefit would have had. With `pensionNLumpSumRollover` set,
it is instead a direct rollover under IRC §402(c)(1): the amount is added
to the Pre-Tax bucket, no income is recognised, no cash is received, and
the money is taxed as it is later withdrawn. Before v1.9 the lump sum
arrived as untaxed spendable cash.

**Knowingly simplified.** No 20% mandatory withholding on a non-direct
rollover (§3405(c)), no 60-day indirect-rollover window, and no §402(e)(4)
ten-year averaging or NUA election on a lump-sum distribution.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 3.14 — Life insurance and reverse mortgages

- **Cash-value life insurance:** cash value grows, policy loans accrue, net
  death benefit = face (+ cash value if "increasing") − loans. No
  withdrawals or new loans are taken in projection; proceeds are
  income-tax-free (§101(a)). Estate treatment in Rule 5.6.
- **Reverse mortgage (HECM-style):** proceeds are loan advances, not
  income — excluded from every income measure. Principal limit is a flat
  percentage of home value (not HUD's PLF tables); non-recourse cap at
  home value.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

## 4. State income tax

### Rule 4.1 — Common structure

**What the engine does.** The state taxable base is the federal ordinary
income base plus dividends and realized gains, **before the federal
standard deduction**, with two adjustments: Social Security is removed in
states that exempt it (exactly the federally taxable portion that is in the
base), and pensions are reduced by each state's exclusion. **Each state's
own standard deduction, exemption allowance or credit is then applied only
where Rules 4.4–4.7 say so** — as of v1.9 (Q-17) that means CA, NY, IL, CO
and VA; the generic flat-rate jurisdiction still has none, because the user
supplies only a rate. Supported jurisdictions: none / TX-FL (zero);
generic flat-rate state (user rate, default 5%); the other 35 states and DC
by their own rules (Rule 4.9, which applies its own deductions); Illinois; Pennsylvania;
Colorado; California; New York (with NYC and Yonkers); Virginia;
Washington (v2.6, Rule 4.8 — which does NOT use this common base).

Two distinct inputs: "State Tax Jurisdiction" drives income tax; "State of
Residence" drives estate/inheritance and ACA rules. They can disagree.

**Married filing separately.** When the federal side splits MFS across two
returns (Rule 2.1), the state tax is computed per return too: every dollar
figure (income, pension, Social Security, distributions, conversions, the
federal deduction Colorado starts from, California's HSA addback) divides
by the same split, each return uses that spouse's own age for the age-based
rules, its pensions are that spouse's own for New York's per-recipient
exclusion and Virginia's military subtraction, and the two liabilities are
added. Every modelled state taxes MFS on its single schedule, so pricing
the whole household on one return used to run a two-earner couple up the
single brackets once (California, $75,000 each: $9,705 against $5,549
jointly; it now matches).

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 4.2 — Social Security treatment by state

| Jurisdiction | Treatment in engine |
|---|---|
| CA, NY, IL, PA | Fully exempt |
| CO | 65+: fully subtracted. 55–64: fully subtracted when federal AGI ≤ $75,000 single / $95,000 joint (TY2025+), otherwise inside the $20,000 pension cap. Under 55: taxed. A full subtraction still uses up the person's $24,000 / $20,000 pension cap — Colorado DOR: "any subtraction claimed for Social Security benefits will reduce the subtraction an individual can claim for any other pension and annuity income" (fetched 2026-09-30). Benefits split evenly between spouses of a joint return (v1.8, Q-14a) |
| Generic flat-rate state | User toggle; if taxed, the federally taxable portion is taxed |

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 4.3 — Pension and retirement-income treatment by state

| Jurisdiction | Pensions | IRA / 401(k) withdrawals, RMDs, Roth conversions |
|---|---|---|
| IL (4.95%) | Fully exempt | Fully exempt at any age, Roth conversions included (35 ILCS 5/203(a)(2)(F); IDOR Pub. 120) — since v1.4 |
| PA (3.07%) | Fully exempt | Distributions exempt once the owner is 59½ ("after retirement age"); a Roth conversion is a non-taxable rollover at any age; an early distribution is taxed in full here (PA taxes only the amount above the owner's own contributions — cost recovery — which the engine cannot track per account, so this is conservative) — since v1.4 |
| CO (4.4%) | $20,000 per person 55–64, $24,000 at 65+, nothing under 55 — one cap shared by pensions, IRA/401(k) distributions and conversions (not premature), and Social Security (a full SS subtraction uses the cap first; 55–64 SS over the AGI limit competes inside it) | Inside the same cap when the owner is 59½+ (federal line 4b, C.R.S. §39-22-104(4)(f)); a premature distribution does not qualify — since v1.8, Q-14(c). Military: under 55, up to $15,000 (§39-22-104(4)(y), TY2022–2028); from 55, inside the ordinary cap — Q-14(b) |
| NY | Government (NYS, local, federal, military) pensions fully exempt (Tax Law §612(c)(3)); private pensions $20,000 exclusion per recipient from 59½, capped at that recipient's own pension (§612(c)(3-a)) | Share each 59½+ recipient's same $20,000 with private pension income: IRA/401(k) distributions, RMDs and Roth conversion income (TSB-M-98(7)I) fill whatever room the pension left. The Pre-Tax bucket is household-level, so the room is pooled across the 59½+ spouses rather than attributed to the account owner — exact for one IRA owner, at most $20,000 generous for a couple who each hold an IRA but only one has income to exclude — since v1.4 |
| CA | Taxed (user toggle); military retirement excluded up to $20,000 per household if federal AGI ≤ $125,000 Single / $250,000 MFJ, tax years 2025–2029 only (R&TC §§17132.9, 17132.10) — see Q-16 | Taxed in full |
| Generic flat | User toggle; military pension fully exempt | Taxed in full |

**Authority.** NY: tax.ny.gov "Information for retired persons", IT-201
lines 26 and 29, verified 2026-08-20; TSB-M-98(7)I (conversion income
qualifies at 59½), fetched 2026-09-02. IL: IDOR Publication 120,
fetched 2026-09-02. PA: PA PIT Guide ch. 7 "Gross Compensation"
(pa.gov PDF), fetched 2026-09-02; conversion-as-rollover per REV-636. CA
military: FTB 2025 Form 540 booklet, AB 53, verified 2026-08-23.

**What is counted as a distribution.** Taxable RMDs (after any QCD), the
solver's discretionary Pre-Tax draw, milestone Pre-Tax withdrawals, NUA
cost basis, and the taxable earnings slice of an early Roth draw; Roth
conversions are carried separately because Pennsylvania treats them
differently from ordinary distributions.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 4.4 — California

**Brackets (tax year 2025 schedules — the vintage; FTB publishes the next
year's in late December). Since v2.22 (changelog 430) every figure below
except the BHS threshold carries forward from 2025 by the Tax Bracket
Inflation Rate: × (1 + r) to reach 2026, then the plan's indexing factor
from there — the same vintage rule the federal figures follow from 2026
(§1.3). Until 430 the 2025 figures stood still for the whole plan, so
California tax was overstated more with every year. When the 2026 schedule
is published, the table is replaced and the vintage moves to 2026.**

| Single / MFS up to | MFJ up to | Rate |
|---|---|---|
| $11,079 | $22,158 | 1% |
| $26,264 | $52,528 | 2% |
| $41,452 | $82,904 | 4% |
| $57,542 | $115,084 | 6% |
| $72,724 | $145,448 | 8% |
| $371,479 | $742,958 | 9.3% |
| $445,771 | $891,542 | 10.3% |
| $742,953 | $1,485,906 | 11.3% |
| above | above | 12.3% |

Plus:

- **Mental/Behavioral Health Services Tax:** 1% of taxable income over
  $1,000,000 (all statuses).
- **Exemption credits:** $153 per exemption (1, or 2 MFJ) plus $153 per
  spouse aged 65+; each credit reduced by $6 for every $2,500 ($1,250 MFS)
  of federal AGI over $252,203 Single/MFS / $504,411 MFJ; non-refundable.
  Blind and dependent credits not modelled.
- **HSA non-conformity:** the year's HSA contribution plus estimated
  earnings on the balance are added back to CA taxable income.
- **Early-distribution tax:** 2.5% on Pre-Tax and Roth withdrawals before
  59½, on top of the federal 10%.
- **Standard deduction (v1.9, Q-17):** $5,706 Single/MFS, $11,412 MFJ,
  subtracted after the HSA add-back and before the rate schedule. Itemised
  deductions are not modelled, so a CA itemiser is overstated by the excess
  of their itemised total over these amounts.

**Authority.** ftb.ca.gov 2025 Form 540 tax rate schedules and
instructions (AGI Limitation Worksheet); FTB Form 3805P instructions;
Proposition 63 / Prop 1. Verified 2026-08-20 and 2026-08-23.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 4.5 — New York State, New York City, Yonkers

**Brackets by era (Tax Law §601, as amended by the FY2026 budget; never
indexed):**

| Single / MFS up to | MFJ up to | 2026 | 2027–2032 | 2033+ |
|---|---|---|---|---|
| $8,500 | $17,150 | 3.90% | 3.80% | 3.80% |
| $11,700 | $23,600 | 4.40% | 4.30% | 4.30% |
| $13,900 | $27,900 | 5.15% | 5.05% | 5.05% |
| $80,650 | $161,550 | 5.40% | 5.30% | 5.30% |
| $215,400 | $323,200 | 5.90% | 5.80% | 5.80% |
| $1,077,550 | $2,155,350 | 6.85% | 6.85% | 6.85% |
| $5,000,000 | $5,000,000 | 9.65% | 9.65% | 8.82% (top) |
| $25,000,000 | $25,000,000 | 10.30% | 10.30% | — |
| above | above | 10.90% | 10.90% | — |

**Tax table benefit recapture (§601(d-5)/(d-6)/(d-7)):** above $107,650 of
NY AGI the benefit of the lower brackets is recaptured over a $50,000
phase-in band per the IT-2105-I worksheets. The engine uses the same
figure for NY AGI and NY taxable income (no NY deduction modelled). The
2026 single-filer incremental amounts are $567 / $2,047 / $30,172 /
$32,500; MFJ $333 / $807 / $3,071 / $60,350 / $32,500; the 2027–2032 and
2033+ tables are carried from the enacted budget text and are flagged for
re-verification against the 2027 IT-2105-I when published.

**$25M flat clause:** in 2026–2032, taxable income over $25,000,000 is
taxed at a flat 10.9% on the whole amount; absent from 2033.

**NYC resident tax (optional):** 3.078% to $12,000 / $21,600 (Single/MFJ),
3.762% to $25,000 / $45,000, 3.819% to $50,000 / $90,000, 3.876% above;
on the same base as the state; no NYC school-tax or household credits.

**Yonkers resident surcharge (optional):** 16.75% of net state tax.

**Standard deduction (v1.9, Q-17):** $8,000 Single, $16,050 MFJ, $8,000
MFS — Tax Law §614 — subtracted before the §601 rate schedule and before
the NYC schedule, which runs on the same base. The §601(d-5)/(d-6) tax
table benefit recapture is still measured against NY **AGI** (the
pre-deduction figure), which is what the statute tests, while the bracket
walk uses taxable income. The dependent-filer $3,100 figure and the head-of
-household $11,200 are not modelled (neither status exists in this engine);
itemised deductions are not modelled.

**Authority.** Tax Law §601 via nysenate.gov (2026-08-20; re-fetched
2026-09-30 for v2.6, section last revised 2025-07-11: (a)/(c) carry the
"after 2025 and before 2027" rows 3.90/4.40/5.15/5.40/5.90%, the "after
2026 and before 2033" rows 3.80/4.30/5.05/5.30/5.80% with the same
thresholds, and the post-2032 8.82% top rate — the table above is exact,
no engine change); FY2026 budget bill print, budget.ny.gov (2027/2033
eras, 2026-08-23); 2026 IT-2105-I worksheets; NYS-50-T-Y (1/26) for
Yonkers.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 4.6 — Illinois, Pennsylvania, Colorado flat rates

IL 4.95%; PA 3.07% (no local EIT, and no exemption or deduction — PA
genuinely has none). IL and PA apply to the pre-federal-deduction base of
Rule 4.1 after the retirement-income subtractions of Rule 4.3.
**Pennsylvania wages include the employee's own 401(k)/403(b) deferrals**:
PA does not exclude "contributions to an IRC Section 401 plan" from
compensation (PA PIT Guide, Gross Compensation, fetched 2026-09-30), so the
Pre-Tax deferrals the federal base leaves out are added back. HSA
contributions stay out (a PA deduction) and so do NQDC deferrals (taxed by
PA when paid). **Illinois
exemption allowance (v1.9, Q-17):** $2,925 per person for 2026 (IDOR
Bulletin FY 2026-15; $2,850 for 2025) — one for a single
filer, two for MFJ — plus $1,000 for each spouse aged 65 or older, and
**zero** once federal AGI exceeds $250,000 (Single/MFS/HoH) or $500,000
(MFJ); it is a cliff, not a phase-out. Subtracted before the 4.95% rate.
The additional $1,000 for a legally blind taxpayer is not modelled (the
engine has no blindness input). CO 4.4% (the 2025 and 2026
rate per the department's Individual Income Tax Guide; TABOR temporary
reductions such as 2024's 4.25% are year-specific and not projected —
Q-14(d)) applies to **federal taxable income** — the Rule 4.1 base less
the federal standard deduction the projection computed for the year —
after the Rule 4.3 subtractions (v1.8, Q-14(e)).

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 4.8 — Washington (v2.6, changelog 349)

Jurisdiction `wa`, chosen automatically when State of Residence becomes WA
(a plan saved with WA on the zero jurisdiction keeps it; Settings shows a
note pointing to the Washington choice). It does **not** use the Rule 4.1
base: Washington has no Social Security, pension or IRA subtraction.

**Capital gains excise tax (RCW 82.87; every year).** 7% of Washington
capital gains (RCW 82.87.040(1)) plus 2.9% of the part over $1,000,000
(82.87.040(2), from tax year 2025, ESSB 5813 c 421 L 2025; the $1,000,000
is not an 82.87.150 "applicable amount", so it is not indexed).
Washington capital gains = the year's realized long-term gains less the
standard deduction: $278,000 for 2025 (dor.wa.gov; $250,000 in statute,
CPI-indexed each October under 82.87.150). The 2026 figure is not yet
published, so $278,000 is carried as the 2026 figure and grown by the
plan's Tax Bracket Inflation Rate. **Spouses share one deduction**
whether they file jointly or separately (82.87.060(1); WAC 458-20-300);
on two MFS returns each return takes its income-split share of it, and
each return has its own $1,000,000 for the 2.9% (the statute says "an
individual's Washington capital gains"). The gains figure is the realized
gains the federal side taxes as long-term — the solver's Taxable draws and
the Life-Event / concentrated-stock / annuity-purchase sales, net of a
harvested loss — never dividends. Real estate and retirement-account
gains (exempt, 82.87.050) never reach this figure.

**Income tax (ESSB 6346, c 238 L 2026; tax years 2028+).** 9.90% of
Washington taxable income (s 201). Base income = federal AGI − all
long-term capital gains + the Washington capital gains above (s 302);
taxable income = base − a $1,000,000 standard deduction per individual,
combined for spouses or domestic partners "regardless of whether they file
joint or separate returns" (s 314; split by the MFS income share like the
capital-gains deduction). No exclusion for Social Security, pensions or
IRA withdrawals exists in the act. **The capital gains tax is a
nonrefundable credit** against this tax, with no carryover (s 205), so the
year's Washington total = max(capital gains tax, income tax before
credit). **Indexing (s 316):** "beginning October 2029 and each October of
an odd-numbered year thereafter", by the latest one-year CPI change, "for
taxes due in the following calendar year". The engine reads that — as the
department reads the identical capital-gains wording — as tax year 2030
for the first adjusted figure, then 2032, 2034, …; each adjustment applies
one year of the plan's average bracket inflation (so the deduction grows
at about half the rate of prices), rounded to $1,000. **Reviewer:** the
first adjusted year (2029 or 2030) is the one reading this rule rests on.

**Not modelled:** the charitable deductions (the act's $100,000 cap, the
capital-gains tax's own), the smaller AGI modifications (non-Washington
municipal interest added, federal-obligation interest and tribal income
removed, NOL rules, 90% of wagering losses, IRC §280E), the credit for
other states' income tax, and short-term vs long-term character (every
realized gain is treated as long-term, as on the federal side). Before
2028 only the capital gains tax applies; the heir-side income tax (Rule
5.7) uses the same function, so an heir living in Washington owes tax on
inherited-IRA withdrawals only above $1,000,000 of income from 2028.

**Authority.** dor.wa.gov "Income tax" and its FAQ; Final Bill Report
ESSB 6346 and the session law (lawfilesext.leg.wa.gov); dor.wa.gov
"Capital gains tax" and the special notice "New tiered rates";
RCW 82.87.020/.040/.050/.060/.150 and WAC 458-20-300 (app.leg.wa.gov);
all fetched 2026-09-30.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 4.9 — The other 35 states and DC, by their own rules (changelog 361)

Jurisdiction `state_rules`, chosen automatically when State of Residence is
any state with an income tax and no model above (stateTaxJurisdictionFor).
The rules are one record per state in `src/config/stateTaxRules.js`, tax
year 2026, researched from each revenue department's pages, forms and
statutes in October 2026; what each record simplifies and its sources are
in `docs/STATE_TAX_RULES_NOTES.json`. Every figure the first pass could not
confirm was re-checked against primary sources on 2026-10-03 (changelog
362); the few still unpublished are marked STILL UNCONFIRMED there. A residence with no record falls back to the
flat rate. Schema version 4 moves a plan, or a timeline move, still on the
untouched flat rate (5%, SS untaxed, pensions taxed) in one of these states
to `state_rules`; any other flat-rate setting is kept.

**Computation (`stateRulesTax`, one return; MFS two-return split as Rule
4.1).** Joint schedule for MFJ only, single otherwise.
1. Start from federal AGI (the Rule 4.1 base before any subtraction).
2. Social Security: `exempt` removes the federally taxable part in the
   base; `taxed` keeps it; `exemptIfAgiBelow` removes it at or below the
   AGI line and keeps it all above (a cliff where MN, UT and VT taper);
   Connecticut above its line taxes at most 25% of gross benefits
   (`maxTaxableShare`).
3. Source exemptions: military pensions where `militaryExempt`; federal,
   state and local government pensions where `govPensionExempt` (the
   pension the plan marks government or military).
4. Retirement exclusion: per person (pooled across the spouses whose age
   reaches a tier — the IRA bucket is household-level) or per return; an
   amount of null is unlimited. Covers pensions, IRA/401(k) distributions
   and Roth conversions, and (GA, DE) investment income = AGI − wages −
   taxable SS − pensions − distributions. `reducedBySS` (ME, MD) lowers each
   person's cap by their gross benefit. `agiPhase` steps the exclusion down
   with AGI (NJ tests income without Social Security, and in its partial
   bands excludes that share of the income rather than of the cap).
   `iraMinAge` (MI, MS: 59½) admits IRA money and conversions only when the
   older spouse has reached it.
5. Missouri removes realized long-term gains.
6. `federalTaxable` states (IA, MT, ND) subtract the federal deduction;
   `standardDeduction: 'federal'` states (AZ, DC, ID, MO, NM) use it as
   their own. The federal figure already holds the §63(f) 65+ add-on and
   the 2025–2028 senior deduction, so those records add only state-specific
   age amounts; Arizona (`excludeFederalAged65`, A.R.S. 43-1041/1022) takes
   it without the §63(f) add-on. `extraDeduction65` may differ by status
   (Nebraska $2,050 single / $1,700 married). Then the state's own standard deduction, per-person
   exemptions and 65+ amounts.
7. Brackets on the result; surtax (MA 4% over $1,107,750; ME 2% over
   $1,000,000) on taxable income over the line, the line indexed; per-person
   credits off the tax (not below zero); a typical county rate (MD 3.1%,
   IN 1.75%, IA 0.2% school surtax) on the same base.
8. Figures marked indexed (brackets, deductions, ME/MD/MI exclusions) grow
   by the year's bracket factor; the rest stay at their statutory dollars.

UT, WI, SC and OH fold a phase-out (taxpayer credit, sliding deduction,
income-adjusted deduction, the Ohio $332 jump) into their bracket rows, so
those rows are not the published schedules; the plan shows the statute's
rates. The heir-side tax (Rule 5.7) prices an heir in one of these states
by the same record at the heir's age.

**Not modelled:** credits other than flat per-person ones, itemized
deductions, the Alabama deduction for federal tax paid, Missouri's public
pension exemption, Montana's lower capital gains rates, Vermont's minimum
tax, Minnesota's 1% net-investment-income surtax over $1,000,000,
Georgia's 2027 step-up of the 65+ retirement exclusion to $70,000 (HB 463;
the record holds $65,000 for all years, conservative from 2027), municipal
taxes other than the county averages, and per-spouse attribution of
exclusions.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

## 5. Estate, GST, inheritance and heir income tax

The estate is valued **once, at the end of the plan**, in that year's
nominal dollars, as the sum of the Pre-Tax, Roth, taxable-brokerage and HSA
balances, the four §2033 assets listed in Rule 5.0 (NQDC, cash reserve,
concentrated stock and home equity), and includible life-insurance
proceeds, less any charitable bequest. Only a **purchased annuity** is
outside the estate. Rule 5.0 immediately below is the authority for this
paragraph; if the two ever disagree, Rule 5.0 wins.

### Rule 5.0 — What is in the gross estate

**What the engine does (changelog 133).** The gross estate is the plan's
ending Pre-Tax + Roth + Taxable + HSA balances, plus self-owned life
insurance death benefits, plus four assets that were silently excluded
until v2.2:

| Asset | Basis at death | Heir income tax |
|---|---|---|
| Concentrated stock position | Stepped up (§1014) | None |
| Cash reserve | n/a | None |
| Home equity | Stepped up (§1014) | None |
| Unpaid NQDC balance | **No step-up (§1014(c))** | Ordinary income (§691, IRD) |

IRC §2033 brings in "all property, real or personal, tangible or
intangible" the decedent had an interest in, which covers all four. The
home enters at fair market value with any mortgage deductible as a §2053
debt, so the engine uses the NET equity figure it already tracks — a
reverse-mortgage balance therefore reduces the taxable estate, correctly.

The NQDC treatment is the one with teeth: an unpaid deferred-comp balance
is income in respect of a decedent, expressly denied a basis step-up, so
the heir owes ordinary income tax on it as well as the estate owing
estate tax — the same double hit an inherited IRA takes. Modelled as
year-one income to the heir, stacked above the inherited HSA, which is the
common lump-sum-at-death election; a plan whose NQDC election spreads
payments over years would spread the tax and pay somewhat less. The
heir's year-one draw from the inherited IRA (an RMD, a tenth, or the whole
balance under lump-sum-at-start) sits on the same return and is priced
ABOVE both lumps, federal and state (changelog 402; until then it was
priced from the heir's own income as if the lumps were not there). The
household's effective estate tax rate is every tax between the gross
estate and what the heirs keep -- estate, inheritance, GST, foreign, the
heirs' income tax on the IRA, HSA and NQDC, and the heirs' state income
tax -- over the gross estate, the same drag each heir's own rate counts.

**Why it mattered.** Before this, a plan dying with a $19,000,000 founder
position paid estate tax on none of it. The demo household's estate was
understated by $681,483 (mostly cash reserve and residual stock).

**Still simplified:** a purchased annuity is excluded (it generally ends at
death, but a period-certain remainder would be includible), and a
charitable bequest can still only be funded from Pre-Tax/Roth/Taxable —
see `KNOWN_ISSUES.md`.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

### Rule 5.1 — Federal estate tax

Exemption **$15,000,000** per person (OBBBA, permanent), doubled for a
married plan — MFJ **or MFS**; portability does not depend on filing
status (portability/DSUE assumed elected) — reduced by lifetime taxable
gifts. **Indexed** since v2.0 (Q-13): IRC §2010(c)(3)(B) adjusts the basic
exclusion for every year after 2026. The survivor's own exclusion is
multiplied by (1 + Tax Bracket Inflation Rate) ^ plan years (the plan's
final year); the deceased spouse's unused exclusion (DSUE) is fixed in
dollars at the first death and not indexed afterwards (§2010(c)(4)), so it
is indexed only to the earlier of the two spouses' life-expectancy years.
The same "married" test feeds the Hawaii / Maryland state portability. The 40% rate is not indexed. `estateIndexingEnabled: false` restores
the unindexed comparison. Tax = 40% flat on the excess (graduated 18–40% schedule under
$1M taxable ignored). The taxable estate is reduced by state estate and
inheritance taxes paid (§2058 state death tax deduction) before the
exemption applies. No marital deduction/first-death modelling — second
death only.

*Ranking key (changelog 428, corrected 438).* The optimizers rank
strategies by net to heirs after every tax: the Legacy Planner's net
inheritance with the inherited Pre-Tax pool re-priced at death — the
heirs' share after any charitable bequest, less the federal and state
income tax the heirs' ten-year draw-down pays, at its effective rate — so
ten years of post-death growth do not favor whatever left the most in
Pre-Tax. Until 438 the whole ending balance was priced (a Pre-Tax bequest
to charity raised the key) and the heirs' state income tax was left out.

**Authority.** IRC §2010 as amended by P.L. 119-21; irs.gov estate tax
page.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 5.2 — Generation-skipping transfer tax

Heirs flagged as skip persons: their share of the gross estate over a
$15,000,000 GST exemption (never doubled; not portable) is taxed at 40% in
addition to estate tax. **Indexed to the plan's final year** since v2.0
(Q-13) on the same schedule as the estate exclusion, because IRC §2631(c)
defines the GST exemption as equal to the basic exclusion amount. No
predeceased-parent exception.

**Authority.** Rev. Proc. 2025-32 §4.14; Form 706-GS(T) instructions.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 5.3 — Lifetime gifting

Annual exclusion **$19,000** per recipient (2026), optionally doubled for
gift-splitting, grown with inflation. Gifts above the exclusion reduce the
federal exemption. Direct tuition/medical payments, 529 five-year election
and non-citizen spouse rules not modelled.

**Authority.** Rev. Proc. 2025-32; irs.gov gift-tax FAQ.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 5.4 — Charitable bequest

Unlimited deduction (§2055). The bequest is a percentage or dollar amount
of the gross estate, capped at the assets it can actually be paid from
(the Pre-Tax, Roth, Taxable, cash-reserve and concentrated-stock buckets —
life-insurance proceeds pass to the policy's beneficiaries and cannot fund
it), and is sourced pro-rata, Pre-Tax-first, or taxable-first across those
buckets; heirs inherit what remains of each. Bequests are assumed exempt from all state estate and
inheritance taxes.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 5.5 — State estate and inheritance taxes

Keyed on State of Residence. **Since v2.0 (Q-18) each state's real
structure applies** rather than a single top rate on the excess; the
`estateMethod` column below says which of five shapes each state uses:

- *(blank)* — one rate on the excess over the exemption. CT, HI, ME, VT,
  DC (WA moved to its own table in v2.6). Vermont's statute is one rate: e.g.
  32 V.S.A. §7442a, "$5,000,000.00 or more — 16 percent of the excess over
  $5,000,000.00".
- `credit2011` — the pre-2001 IRC §2011 credit for state death taxes
  (frozen table, keyed on the taxable estate less $60,000), minus the
  credit that state's own exclusion buys. **MA, RI, MD.** Evaluating the
  table at each state's exclusion reproduces its published credit exactly:
  $99,600 (MA, $2,000,000), $87,940 (RI, $1,838,056), $391,600 (MD,
  $5,000,000). Because it is a credit, the tax phases in from zero — there
  is no cliff at the filing threshold.
- `threshold2011` — the same §2011 table, but the exclusion is a
  **threshold**: nothing below it, the whole estate taxed above it.
  **IL.** "The exclusion amount is a taxable threshold and not a credit
  against tax" (Illinois Attorney General, estate tax fact sheet).
- `scheduleOnExcess` / `scheduleOnWhole` — the state's own graduated table,
  applied to the estate net of the exclusion (**MN**, Form M706, 13%→16%
  above a $3,000,000 subtraction) or to the whole taxable estate (**OR**,
  Form OR-706 Part 6, whose first row already starts at $1,000,000 with a
  zero base, 10%→16%). **WA** (v2.6) is `scheduleOnExcess` on its own
  Table W: 10% to $1M, 14% to $2M, 15% to $3M, 16% to $4M, 18% to $6M, 19%
  to $7M, 19.5% to $9M, 20% above ($1,490,000 base at $9M), on the
  "Washington taxable estate", which dor.wa.gov defines as the amount
  "after all allowable deductions, including the applicable exclusion
  amount".
- `ny` — the §952(b) graduated schedule (3.06%→16%) over the §952(c)
  **credit cliff**: full credit at or below the basic exclusion amount, a
  linearly shrinking credit between 100% and 105% of it, and *no credit at
  all* above 105% — "no credit shall be allowed to the estate of any
  decedent whose New York taxable estate exceeds one hundred five percent
  of the basic exclusion amount". At the 2026 exclusion the band runs
  $7,350,000–$7,717,500 and carries a marginal rate near 200%; above it the
  full schedule applies to every dollar.

**Maryland levies both taxes and credits one against the other** (Q-18(b)):
the inheritance tax paid by all beneficiaries is subtracted from the gross
Maryland estate tax, floored at zero — "The inheritance tax paid to the
Register of Wills is subtracted from the gross Maryland estate tax
liability and the difference is the Maryland estate tax due" (Comptroller
of Maryland, Tax Tip 42). Every other state's two taxes are independent.

**Exemptions are indexed only where the statute indexes them** (Q-13):
CT (which tracks the federal basic exclusion), ME, NY, RI and DC move with
the plan's Tax Bracket Inflation Rate; HI, IL, MA, MD, MN, OR, VT and WA
are fixed dollar figures and stay put. The rate schedules themselves — the
§2011 table, §952(b), and MN's, OR's and WA's tables — are frozen in
statute and are never indexed. (WA's $3,000,000 is fixed because, per the
department, it "is not set to increase going forward due to an expired CPI
in the statute".)

The base is the gross estate, plus all lifetime taxable gifts in
Connecticut (CGS §12-391(c), gifts since 2005) and taxable gifts made
within three years of death in Minnesota (§291.016 subd. 2(3)). For a
married plan, Hawaii's and Maryland's exemptions are doubled at the
second death — both states allow a deceased-spousal-unused-exclusion
election (HI Form M-6; MD Tax-General §7-309(b), deaths on or after
January 1, 2019) and the engine assumes the full unused amount was
elected, mirroring its federal portability assumption. No other state's
exemption is doubled (Washington expressly rejects portability;
Minnesota's 2025 portability bill was not enacted).

| State | Exemption | Top rate | Inheritance tax |
|---|---|---|---|
| CT | $15,000,000 (indexed) | 12% | — |
| HI | $5,490,000 | 20% | — |
| IL | $4,000,000 | §2011 table `threshold2011` | — |
| KY | — | — | yes |
| ME | $7,160,000 (indexed) | 12% | — |
| MD | $5,000,000 | §2011 less $391,600 `credit2011` | yes, credited against the estate tax |
| MA | $2,000,000 | §2011 less $99,600 `credit2011` | — |
| MN | $3,000,000 | 13–16% `scheduleOnExcess` | — |
| NE | — | — | yes |
| NJ | — | — | yes |
| NY | $7,350,000 (indexed) | 3.06–16% `ny` | — |
| OR | $1,000,000 | 10–16% `scheduleOnWhole` | — |
| PA | — | — | yes |
| RI | $1,838,056 (indexed) | §2011 less $87,940 `credit2011` | — |
| VT | $5,000,000 | 16% | — |
| WA | $3,000,000 (not indexed) | 10–20% `scheduleOnExcess` (see Q-19) | — |
| DC | $4,988,400 (indexed) | 16% | — |

**Life insurance is outside the inheritance base** (Q-18(c), v2.0). All
five inheritance-tax states exempt proceeds on the decedent's life paid to
a named beneficiary, which is what every heir in this model is: PA
(REV-1508 Schedule E instructions — PA is the broadest, exempting them
"payable to the estate or to a named beneficiary"), NJ (transfer
inheritance tax instructions), KY (KRS 140.030), MD (Tax-Gen. §7-203(d))
and NE (Neb. Rev. Stat. §77-2001, whose base reaches only proceeds
"receivable by the executor or administrator"). The proceeds remain in the
ESTATE base, where IRC §2042 puts a self-owned policy; only the
inheritance-tax base is reduced. An ILIT-owned policy was never in either.

**Inheritance tax schedules** (applied to each heir's gross share, net of
the life-insurance exemption above, by the heir's relationship — spouse /
child / parent / sibling / in-law / niece-nephew / other; default child):

- **Kentucky** (KRS 140.070/.080): Class A exempt — spouse, child, parent,
  sibling, and (per 2026 Ky. Acts ch. 198, see Q-20) nieces/nephews.
  Class B (in-law): $1,000 exempt, then 4% to $10k, 5% to $20k, 6% to
  $30k, 8% to $45k, 10% to $60k, 12% to $100k, 14% to $200k, 16% above.
  Class C (other): $500 exempt, then 6% to $10k, 8% to $20k, 10% to $30k,
  12% to $45k, 14% to $60k, 16% above.
- **Maryland** (Tax-Gen. §7-203/-204): spouse, child, parent, sibling,
  in-law exempt; others 10% flat if the bequest exceeds $1,000. The
  inheritance tax paid is credited against the MD estate tax (Tax-Gen.
  §7-309(b); Comptroller Tax Tip 42), as the table above and the engine
  both apply -- the household pays the larger of the two, not both
  (see Q-18(b)).
- **Nebraska** (§77-2004 to -2006, post-LB 310): spouse exempt; child,
  parent, sibling, in-law 1% over $100,000; niece/nephew 11% over $40,000;
  other 15% over $25,000.
- **New Jersey** (N.J.S.A. 54:34-2): spouse, child, parent exempt; sibling
  and in-law 0% to $25,000, 11% to $1.1M, 13% to $1.4M, 14% to $1.7M, 16%
  above; niece/other 15% to $700,000, 16% above, nothing if under $500.
- **Pennsylvania** (72 P.S. §9116): spouse 0%; child and parent 4.5%;
  sibling 12%; all others 15%; no exemptions.

Life-insurance proceeds are included in the base for inheritance tax (see
Q-18). Aunts/uncles/cousins fall in "other".

**Authority.** Each state's DOR/statute directly (not aggregators);
verified 2026-08-21; per-line citations in `src/__tests__/calculator.test.js`.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 5.6 — Life insurance in the estate

Proceeds are income-tax-free (§101(a)). A policy pays exactly once, at
its insured's death. When the insured spouse dies before the other, a
self/spouse-owned policy's net death benefit is paid to the survivor and
invested in the Taxable account (as basis) in the year of death; the
policy then ceases to exist and nothing from it reaches the plan-end
estate directly (the invested proceeds do, as ordinary assets). A
trust-owned (ILIT) policy instead freezes its benefit at the year-of-death
value and passes to heirs outside the taxable estate; growth of the trust
corpus is not modelled. A policy on the second-to-die (or on a single
planner) pays at plan end: included in the gross estate (federal, GST and
state) unless trust-owned; the §2035 three-year lookback for transfers to
an ILIT is described to users but not enforced. Plan-end proceeds are
split among heirs by the estate split percentages rather than by
beneficiary designation.

**Authority.** IRC §101(a); §2042.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 5.6a — Basis reset at the first death (added 2026-10-02, changelog 360)

In the year the first spouse of a couple is first counted dead (natural
life expectancy or the survivor stress test), the Taxable Brokerage basis
pool and each concentrated stock position's basis are reset toward market
value at that year's opening balance:

  new basis = old basis + share × (market value − old basis)

written so a position under water would step DOWN (§1014 sets basis to
FMV). In practice it never does: the engine already caps the Taxable
basis pool at market value each year, so unrealized losses are not
carried and the reset is always zero or upward. `share` is:

- **1** when the household's state that year is a community-property
  state (AZ, CA, ID, LA, NM, NV, TX, WA, WI): §1014(b)(6) resets both
  halves of community property;
- otherwise by the new input `taxableAccountOwner`: **½** for 'joint'
  (the default; a qualified joint interest, §2040(b), half included under
  §1014(b)(9)), **1** when the account is in the deceased spouse's name,
  **0** when it is in the survivor's.

Years abroad use the common-law rule. A concentrated position without vest
routing switches from its flat cost-basis percentage to tracked basis
dollars after the reset. Pre-Tax balances are IRD and get no reset
(§1014(c)); Roth needs none; the home is not reset here because the plan
does not model a post-death sale's capital gain separately (see Rule 5.0
for the estate treatment). The plan-end heir step-up (Rules 5.0, 5.7) is
unchanged. Before this rule the survivor carried the couple's original
basis for life, overstating realized gains, MAGI and IRMAA.

**Simplifications.** Death at the start of its year; community character
follows the state of residence that year, so property acquired in a
common-law state, California quasi-community property (§1014 treats it as
the acquiring spouse's separate property) and elective community-property
trusts (AK, TN, SD, KY, FL) are not modelled.

**Authority.** IRC §1014(a), (b)(6), (b)(9), (c); §2040(b); IRS
Publication 551 (Basis of Assets), "Inherited Property".

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

### Rule 5.7 — Heirs' income tax on inherited accounts (SECURE Act)

For each heir (filing status and other income entered by the user), the
inherited share of the Pre-Tax bucket is withdrawn under one of four
schedules and the incremental federal tax at the heir's bracket position
is the "tax drag". The default since v1.8 (Q-21) is **annual RMDs then
year 10**: when the decedent died on or after the required beginning date
(age at death ≥ 73, or 75 for births from 1960), years 1–9 carry a
required distribution of balance ÷ the applicable denominator — the
greater of the heir's single-life expectancy (Reg. §1.401(a)(9)-9(b) table;
the heir's age in the year after death, reduced by one each year) and the
decedent's remaining single-life expectancy — and the remainder is
distributed in year 10 (Reg. §1.401(a)(9)-5(d)(1)(ii), (d)(3)(iii), (e)).
Before the RBD nothing is required until year 10. The heir's age is
entered per heir ("Age today"); if blank the heir is assumed 30 years
younger than the first spouse. The other schedules — level over 10 years
(balance ÷ years remaining, with growth), lump sum in year 1, lump sum in
year 10 — remain as voluntary patterns; a year-10 lump sum is refused when
the decedent was past the RBD and the RMD schedule is applied instead
(flagged in the result). Brackets are the 2026 federal schedule
**carried to the plan's final year** (v2.0, Q-13) at the Tax Bracket
Inflation Rate, and the heir's other income — which the user enters in
today's dollars — is carried forward with them, so both sides of the stack
sit in the same money as the nominal inheritance. Moving them together
leaves the heir's own marginal position unchanged and stops inflation alone
pushing the inheritance up the schedule. `estateIndexingEnabled: false`
restores the unindexed 2026 comparison. No heir standard deduction or NIIT
(heir STATE income tax on the ten-year draw-down IS charged, by the state
set on each heir card -- see Rules 5.0 and 4.9); no §691(c) IRD
deduction for federal estate tax paid on the same dollars. Eligible designated
beneficiaries (spouse, minor child, disabled, chronically ill, ≤10 years
younger) are not distinguished. Inherited Roth is tax-free; inherited
taxable brokerage receives a full basis step-up (§1014).

**Authority.** IRC §401(a)(9)(H); Treas. Reg. §1.401(a)(9)-5(d) (T.D.
10001, 2024); IRS Publication 590-B.

**Reviewer:** [ ] Agree  [ ] Correct but incomplete  [ ] Issue: ______________

---

## 6. Questions for the reviewer

These are ordered roughly by how much money they move in a typical
retirement projection. Items marked **(verify)** are facts we could not
settle from primary sources; items marked **(judgment)** are design
choices where we want a professional's view on materiality.

**Q-1 — RESOLVED 2026-09-03 (v2.0, changelog 127).** Neither of the two
options the question offered, but the third: the engine now models the two
returns an MFS household actually files. It splits the household's taxable
income between them by `mfsIncomeSplitPct` (default 50) and applies the MFS
schedule to each — the ordinary brackets, the 0/15/20% capital-gains bands
with their own § 1411 threshold, and the AMT exemption and 28% breakpoint
all being per-return figures. Because the MFS brackets are exactly half of
MFJ below the top, an even split lands where MFJ does, which is the correct
answer for a couple with similar incomes; the old single-return model was
the arithmetic of a one-earner couple and overstated a two-earner couple's
federal ordinary tax by roughly a third. Setting the split to 100 restores
it for a household where one spouse genuinely earns everything, and a plan
with no second spouse enabled always uses one return regardless, since there
is only one person to file it. **Every MFS-specific penalty is untouched and
still applies** — the $0 Social Security base amount when the couple lived
together, the lower AMT exemption, the $125,000 NIIT and Additional Medicare
thresholds, the $1,500 capital-loss limit, the excluded OBBBA senior bonus
and the collapsed Roth phase-out — because those, not the brackets, are the
real cost of filing separately and are what a user turns the status on to
see. The "Single plan with a partner enabled" half of the question is
unchanged and stays documented in Section 7: two unmarried people sharing a
plan still file one Single return here. See Rule 2.10. Text kept for the
record.** ~~(judgment) — MFS and unmarried-couple modelling.~~ For MFS the engine
places both spouses' combined income on one return and applies the halved
MFS brackets, deduction, AMT and NIIT figures to that combined income. For
a "Single" plan with a partner enabled it does the same on one Single
return. Is a per-spouse split (each return carrying its own wages, pension
and half of joint items) required for MFS results to be usable, or is it
acceptable to document MFS as approximate and steer users to MFJ/Single?

**Q-2 — CLOSED 2026-09-02 (v1.7, no code change): in the engine's model a spouse is alive for the whole of every year up to and including the life-expectancy year, and the first "Single" year is the first full year of survivorship — so the §6013(a)(3) joint return for the year of death is already what happens; the text below is kept for the record. The Survivor Stress Test's age reads the same way from changelog 411 (alive through the stress age, Single from the next year); until then it ended the marriage in the year the spouse turned that age and filed it Single.** ~~(judgment) — Year of death.~~ The survivor is treated as Single in
the year the first spouse dies. §6013(a)(3) permits a joint return for
that year; Qualifying Surviving Spouse status thereafter requires a
dependent child the tool doesn't model. Is "Single from the year of death"
an acceptable simplification, or should the year of death stay MFJ?

**Q-3 — RESOLVED 2026-09-02 (v1.7, changelog 124): the unused deduction now reduces gains before stacking (Rule 2.3); NIIT stays on MAGI (Rule 2.4). Text kept for the record.** ~~(judgment) — Unused standard deduction against capital gains.~~ When
ordinary income is below the standard deduction, the engine floors ordinary
taxable income at zero and does *not* apply the unused deduction against
capital gains before stacking them in the 0%/15%/20% bands. For a retiree
living mainly off a taxable brokerage account this overstates tax. We
believe the Schedule D worksheet applies the full deduction against total
taxable income including gains — please confirm, and confirm the same for
the NIIT MAGI add-back (Rule 2.4).

**Q-4 — RESOLVED 2026-09-02: (a) in v1.5 (changelog 121, the two-year lookback with an optional SSA-44 appeal); (b) and (c) in v1.6 (changelog 123, AGI-based MAGI settled after the withdrawal solver). Rule 2.9 describes the result; the text below is kept for the record. The top-tier indexing note at the end is now CLOSED too — changelog 132 freezes the $500,000 single / $750,000 joint threshold through 2027 per 42 U.S.C. 1395r(i) and indexes it only from 2028.** ~~(judgment) — IRMAA MAGI. Three simplifications: (a) the current
year's MAGI is used rather than the two-year lookback; (b) MAGI includes~~
*gross* Social Security rather than the taxable portion; (c) MAGI omits
the discretionary Pre-Tax withdrawal the engine takes to fund spending,
which for a pre-RMD retiree is usually the largest income item. (b)
overstates and (c) understates. Which of these would you consider
necessary to fix for a tool users rely on for Roth-conversion decisions
near IRMAA tiers? Also: the top IRMAA tier ($500k/$750k) is statutorily
frozen through 2027 and only indexed from 2028; the engine indexes it from
year one.

**Q-5 — RESOLVED 2026-09-02 (changelog 119): the exact worksheet is now implemented; the text below is kept for the record.** ~~Social Security taxability tiers.~~ The engine used flat
0% / 50% / 85% tiers at the provisional-income thresholds rather than the
worksheet's graduated "lesser of" formula. Worked example: MFJ, $30,000 of
benefits, $30,000 of other income → provisional $45,000 → engine taxes
$25,500 (85%); the worksheet gives roughly $6,850. Our review suggests the
overstatement persists across a wide band above the upper threshold, not
just at the boundary, and it also sharpens the "tax torpedo" effect on
conversion sizing. Would you agree this should be replaced with the exact
formula? Separately, provisional income omits the discretionary Pre-Tax
draw (the withdrawal is solved *after* SS taxability is settled), NUA
basis income, annuity-purchase payouts and milestone Pre-Tax withdrawals.

**Q-6 — RESOLVED 2026-09-02 (v1.7, changelog 124): $38.99 confirmed against CMS's July 28 2025 Part D announcement and implemented.** ~~(verify) — Medicare Part D base premium.~~ The engine used $34.50 as
the 2026 national base beneficiary premium alongside 2026 IRMAA
surcharges. Our review believes $34.50 is the 2024 figure and 2026 is
approximately $38.99. Please confirm the 2026 amount.

**Q-7 — RESOLVED 2026-09-02 (v1.7, changelog 124): FRA now comes from the birth year per the SSA table (Rule 3.12).** ~~(judgment) — Social Security FRA fixed at 67.~~ Users born before
1960 have an FRA of 66 to 66 and 10 months; the engine treats a 1957-born
user claiming at 66 as 12 months early (93.3%) rather than at FRA. Is an
FRA-by-birth-year table warranted, given the user enters their own FRA
benefit amount?

**Q-8 — RESOLVED 2026-09-02 (v1.9, changelog 126) against IRS Publication
969, which states "You may not use HSA funds to pay for insurance, except
for the following" and then lists only long-term care insurance, health
care continuation coverage such as COBRA, coverage while receiving
unemployment compensation, and "Medicare and other health care coverage if
you were 65 or older (other than premiums for a Medicare supplemental
policy, such as Medigap)". The pre-Medicare healthcare bridge is now split
by a `healthcareBridgePremiumPct` input (default 70%): only the
non-premium share is an HSA-qualified expense. An
`hsaPreMedicarePremiumsQualified` flag restores the whole bridge for the
COBRA / unemployment cases the statute does allow. LTC costs and Medicare
premiums including IRMAA remain fully qualified at any age. See Rule 2.9.
Text kept for the record.** ~~(judgment) — HSA qualified expenses.~~ Pre-65 marketplace (ACA)
premiums are paid from the HSA tax-free in the model. Our understanding is
that health-insurance premiums are qualified only in limited cases (COBRA,
premiums while receiving unemployment, Medicare premiums at 65+, qualified
LTC premiums up to age-based limits). Should pre-65 marketplace premiums
be excluded from HSA-eligible spending?

**Q-9 — RESOLVED 2026-09-02 (v1.9, changelog 126), all three parts.**
**(a)** A cash lump sum is now ordinary income in the year received (IRC
§402(a)), carrying the same state treatment — government / military exempt
or private — the recurring pension would have had, and it is no longer
added to spendable cash on top of that income. A new
`pensionNLumpSumRollover` flag models the IRC §402(c)(1) direct rollover
instead: the amount lands in Pre-Tax, no income is recognised, and no cash
is received. **(b)** Annuity payout taxation now follows the source
account: a Pre-Tax purchase is fully taxable, a Roth purchase fully
excluded, and a purchase from Taxable applies the IRC §72(b)(1) exclusion
ratio — investment in the contract over expected return, the latter summed
over the plan's own projected payouts through spouse 1's life expectancy —
with the exclusion stopping once the investment is recovered per
§72(b)(2). The existing `annuityIsTaxable` toggle is retained as an
explicit "tax every dollar" override and remains the default, so existing
plans do not move. **(c)** One after-tax basis ratio is now computed
before the first distribution of each year — including that year's own
non-deductible contribution, the way Form 8606 line 2 does — and applied
pro-rata to every Pre-Tax distribution: RMDs, Life-Event withdrawals, the
solver's discretionary draw and the tax-funding top-ups, not only Roth
conversions. See Rules 3.4, 3.11 and 3.13. Text kept for the record.**
~~(judgment) — Three "untaxed cash" items.~~ (a) A pension **lump sum**
is received as spendable cash with no ordinary income recognised and no
rollover to Pre-Tax. (b) The **annuity purchase** feature has no §72(b)
exclusion ratio — payouts are all-taxable or all-excluded by a toggle.
(c) **Pre-Tax after-tax basis** (from non-deductible contributions) is
applied only to Roth conversions; RMDs and ordinary withdrawals are treated
as fully taxable even when basis exists (§72 / §408(d)(2) apply pro-rata to
all distributions). Which of these matter enough to fix first?

**Q-10 — RESOLVED: (a) 2026-09-02 (v1.8, changelog 125), rents and annuity income are now in the NIIT base (Rule 2.4); (b) 2026-09-03 (v2.0, changelog 127).** The concentrated-stock diversification now happens BEFORE the year's tax engine runs, and the gain it realizes joins the year's capital-gains base like any other realized gain — 0/15/20% stacking, NIIT, state tax, and every MAGI including the ACA and IRMAA ones. Previously the sale ran at the very end of the year and was charged a flat user-set rate that never entered `totalTaxesPaid` at all: a $1,000,000 sale of a 10%-basis position showed a $135,000 cost and an ACA MAGI of $53,200, preserving subsidies it would in reality have destroyed; it now costs about $171,000 and puts MAGI over $1,000,000. A `concentratedStockFlatTaxEnabled` input (default off) keeps the old arithmetic for reproducing prior numbers. See Rules 2.4 and 3.8.** ~~(judgment) — Investment income outside the main tax engine.~~
(a) Rental income and non-qualified annuity income are ordinary income but
are excluded from NII for NIIT purposes, though §1411(c)(1)(A)(i) includes
rents and annuities. (b) Diversification of a concentrated stock position
is taxed at a flat user-set rate (default 15%) with no bracket stacking,
NIIT, state tax or MAGI effect. Is (a) an error worth fixing? Is (b) an
acceptable planning simplification if clearly labelled?

**Q-11 — RESOLVED 2026-09-02 (v1.7, changelog 124): (a) $1,500 for MFS, (b) no longer indexed, (c) losses net only against realized gains, never the dividend proxy (Rule 2.8).** ~~(verify/judgment) — Capital-loss rules.~~ (a) The $3,000 ordinary
offset is applied to all statuses; §1211(b)(1) halves it to $1,500 for
MFS. (b) The $3,000 is indexed forward with inflation; it is not indexed
by statute. (c) Harvested losses offset the engine's "capital gains"
measure, which includes the 2%-of-balance qualified-dividend proxy;
qualified dividends are not capital gains and cannot absorb capital
losses. Please confirm (c) in particular.

**Q-12 — RESOLVED 2026-09-02 (v1.7, changelog 124): $122,250 for MFS confirmed in Rev. Proc. 2025-32 §.03 and implemented.** ~~(verify) — AMT 28% breakpoint for MFS.~~ The engine used $244,500
for all statuses. We believe the MFS breakpoint is half the joint figure
($122,250 for 2026). Immaterial in practice (AMT never binds without
itemized deductions), but please confirm.

**Q-13 — RESOLVED 2026-09-03 (v2.0, changelog 127).** The answer to "should
the engine index the exemptions and heir brackets at the same Tax Bracket
Inflation Rate it uses for income tax" is yes, and it now does — but only
where the law actually indexes. The federal basic exclusion (IRC
§ 2010(c)(3)(B)), the GST exemption (§ 2631(c), which ties it to the estate
exclusion), the five state exemptions that are statutorily indexed (CT, ME,
NY, RI, DC) and the heirs' brackets are all carried to the plan's final year
at that rate. The heirs' own stated income is carried with the brackets,
since the user enters it in today's dollars but it is stacked under an
inheritance in plan-end dollars. **The fixed-in-statute state exemptions
(HI, IL, MA, MD, MN, OR, VT, WA) deliberately do not move**, because they do
not: indexing them would invent relief no legislature has granted. Neither
do the rate schedules themselves — the § 2011 credit table, NY § 952(b), and
MN's and OR's tables are frozen dollar figures. A new
`estateIndexingEnabled` input (default on) restores the unindexed
comparison. The remaining exclusions the question lists — NQDC, home equity,
cash reserve, concentrated stock and purchased annuities outside the gross
estate, and NQDC as income in respect of a decedent — are unchanged and stay
in Section 7. See Rules 5.2, 5.3 and 5.6. Text kept for the record.**
~~(judgment) — Nominal-dollar estate against unindexed thresholds.~~ *(Update 2026-09-02, changelog 119: the HSA is in the gross estate and taxed to non-spouse heirs as year-one ordinary income under §223(f)(8)(B). Completed 2026-09-05, changelog 133: NQDC, home equity, the cash reserve and a concentrated stock position are in the gross estate too, NQDC additionally as income in respect of a decedent under §691. A purchased annuity remains excluded.)*
The estate is valued at plan end in nominal dollars (often 30+ years out)
but is sheltered by the 2026 federal exemption ($15M), 2026 GST exemption,
2026 state exemptions, and the heirs' tax drag is computed on 2026
brackets with today's-dollar heir income. §2010(c)(3)(B) indexes the
federal exemption from 2027; the indexed state exemptions (CT, ME, NY, RI,
DC) also move. This systematically overstates estate and heir tax for
younger households. Should the engine index the exemptions and heir
brackets at the same Tax Bracket Inflation Rate it uses for income tax?
Relatedly: HSA, NQDC, home equity, cash reserve, concentrated stock and
purchased annuities are excluded from the gross estate; an inherited HSA
is fully taxable to a non-spouse heir in the year of death, and NQDC is
income in respect of a decedent — neither is modelled.
*(Superseded — do not read the sentence above as current. The HSA went
into the gross estate with its §223(f)(8)(B) heir income tax in changelog
119, and NQDC, home equity, the cash reserve and a concentrated stock
position followed in changelog 133, NQDC with its §691 IRD income tax.
Only a purchased annuity is still excluded. This paragraph is kept because
Section 6 preserves the original question verbatim, but it contradicted
its own resolution header for three days and is exactly the drift the
reviewer flagged.)*

**Q-14 — RESOLVED 2026-09-02 (v1.8, changelog 125) against tax.colorado.gov's "Income Tax Topics: Social Security, Pensions, and Annuities" and the Individual Income Tax Guide: (a) SS by age band with the 55–64 AGI limit; (b) $15,000 under-55 military subtraction, ordinary cap from 55; (c) IRA/401(k) distributions and conversions inside the cap when not premature; (d) 4.4% confirmed for 2025 and 2026; (e) base is federal taxable income. See Rules 4.2, 4.3, 4.6. Text kept for the record.** ~~(verify) — Colorado.~~ (a) The engine exempted Social Security in
full at any age; our understanding of C.R.S. §39-22-104(4)(f)/(g) is that
SS is part of the pension/annuity subtraction — fully deductible at 65+
(since TY2022), within the $20,000 cap for ages 55–64 (with a broader
subtraction for 55–64 from TY2025 subject to an AGI limit under HB
24-1142), and not deductible under 55. (b) Military retirement is exempted
in full; CO instead has a capped military retirement subtraction for
under-55 retirees (§39-22-104(4)(y)) and the ordinary cap at 55+. (c) The
$20,000/$24,000 subtraction is applied only to pensions, not to IRA/401(k)
distributions, which CO treats as pension/annuity income. (d) The engine
uses the 4.4% statutory rate; TABOR-triggered temporary reductions (e.g.
4.25% for TY2024 under SB 24-228) are not modelled — please confirm the
operative 2026 rate. (e) CO starts from federal *taxable* income, so the
federal standard deduction should reduce the CO base; the engine uses
pre-deduction income.

**Q-15 — RESOLVED 2026-09-02 (v1.4, changelog 120): implemented as Rule 4.3 describes, against each department's own guidance; the text below is kept for the record. Still worth a reviewer's eye: the pooled (not per-owner) NY room, and PA's early-distribution cost-recovery treatment.** ~~Illinois, Pennsylvania and New York retirement income.~~ The engine exempted *pensions* in IL and PA but taxes IRA/401(k)
withdrawals, RMDs and Roth conversions at the full state rate. Our
understanding: IL (35 ILCS 5/203(a)(2)(F)) subtracts all federally taxed
retirement-plan and IRA distributions including conversions; PA does not
tax qualifying retirement-plan distributions after retirement age/59½
(but does tax early ones). Likewise NY's $20,000 exclusion (§612(c)(3-a))
covers IRA distributions and periodic plan payments, not only pensions.
Because Roth-conversion ladders are this tool's core use case, this is the
state-tax item we most want confirmed.

**Q-16 — CONFIRMED AS-IS 2026-09-02: the FTB's 2025 Schedule CA (540) instructions read "The exclusion is capped at $20,000 for a surviving spouse, spouses filing a joint return, and any other individual who did not exceed the federal AGI limits" — one cap per return, and "must not exceed" $125,000 / $250,000 is a cliff. The engine already does both.** ~~(verify) — California military exclusion per household.~~ The
$20,000 cap is applied to the household's combined military pensions; the
statute reads as per qualified retiree. Please confirm, and confirm the
AGI limit is a cliff rather than a phase-out.

**Q-17 — RESOLVED 2026-09-02 (v1.9, changelog 126). CA's $5,706 / $11,412
(FTB, 2025 Form 540 line 18 — note the figure in the question below was the
2024 amount), NY's $8,000 / $16,050 with MFS on the single figure (Tax Law
§614), and IL's exemption allowance ($2,850 per person, $1,000 more for
each spouse 65 or older, and nothing at all above $250,000 single /
$500,000 joint of federal AGI — IL-1040 Step 4) are all now subtracted
before the respective rate schedules. CO already uses federal taxable
income as its base as of v1.8. See Rules 4.1, 4.4 and 4.5. Text kept for
the record.** ~~(judgment) — State standard deductions.~~ CA ($5,540 / $11,080 for
2025), NY ($8,000 / $16,050), IL's exemption allowance ($2,850 + $1,000 at
65) and CO's federal-taxable-income starting point are all absent; the
state base is pre-federal-deduction income. This overstates state tax by
several hundred to ~$1,500 per year. Worth adding?

**Q-18 — RESOLVED 2026-09-03 (v2.0, changelog 127), all three parts, each
against the levying jurisdiction's own statute or form instructions.**
**(a)** The five states that publish a graduated schedule now use it. One
frozen pre-2001 IRC § 2011 credit table (transcribed from Table B of the
Massachusetts DOR's estate tax guide, keyed on the taxable estate less
$60,000) serves MA, RI, IL and MD — and evaluating it at each state's own
exclusion reproduces all three published credit figures exactly ($99,600 MA,
$87,940 RI, $391,600 MD), which is the cross-check that it was transcribed
correctly. MN uses its own Form M706 table (13%→16%) applied after the
$3,000,000 exclusion; OR its own Form OR-706 table (10%→16%) applied to the
whole taxable estate from $1,000,000. **MA's $2,000,000 is a credit**, so
the tax phases in from zero rather than cliffing. **IL's $4,000,000 is "a
taxable threshold and not a credit against tax"** (Illinois AG fact sheet),
so crossing it taxes the whole estate. **NY's exclusion is a credit under
§ 952(c)** that phases out linearly between 100% and 105% of the basic
exclusion amount and is denied entirely above it, over the § 952(b)
graduated schedule — a marginal rate near 200% inside the band and a full
schedule on every dollar above it. **VT was checked and is genuinely a
single 16% rate** (32 V.S.A. § 7442a), contrary to the question's list, so
it is unchanged; CT, HI, ME and DC likewise remain single-rate (WA gained its graduated table in v2.6).
**(b)** MD no longer sums the two taxes: "The inheritance tax paid to the
Register of Wills is subtracted from the gross Maryland estate tax liability
and the difference is the Maryland estate tax due" (Comptroller Tax Tip 42).
**(c)** Life insurance on the decedent's life paid to a named beneficiary —
which is what every heir in this model is — is removed from the inheritance
base in all five states (PA REV-1508 Schedule E instructions, which exempt
it even when payable to the estate; NJ transfer inheritance tax
instructions; KRS 140.030; Md. Tax-Gen. § 7-203(d); Neb. Rev. Stat.
§ 77-2001, whose base reaches only proceeds receivable by the executor or
administrator). It remains in the ESTATE base, where IRC § 2042 puts it.
See Rules 5.4 and 5.5. Text kept for the record.**
~~(judgment) — State estate/inheritance structure.~~ (a) Estate tax
uses each state's top rate on the excess over the exemption; MA's $2M
operates as a credit, OR/MN/IL/VT/RI/NY have graduated schedules, IL's $4M
is a threshold (full estate taxed above it), NY's cliff at 105% of the
exemption is not modelled. (b) MD levies both taxes but allows inheritance
tax paid as a credit against estate tax; the engine sums both. (c) Life
insurance payable to a named beneficiary is generally excluded from PA,
NJ, KY, MD and NE inheritance tax; the engine includes it. Which of these
would you prioritise?

**Q-19 — RESOLVED v2.6 (changelog 349).** The 2026-09-02 confirmation got the top rate right but not the shape: the engine charged 20% on the whole excess over $3,000,000, while the law is a graduated table on the Washington taxable estate. dor.wa.gov "Estate tax tables" (fetched 2026-09-30): for deaths from July 1, 2026 (ESB 6347, 2026, restoring the pre-2025 table after ESSB 5813's 10–35% table for July 2025–June 2026) Table W runs 10% / 14% / 15% / 16% / 18% / 19% / 19.5% / 20% with breaks at $1M, $2M, $3M, $4M, $6M, $7M, $9M, on the estate after the $3,000,000 exclusion, which is not indexed ("expired CPI in the statute"). The engine now walks that table (`scheduleOnExcess`); a $5M estate owes $240,000, not $400,000. *Earlier status:* CONFIRMED AS-IS 2026-09-02: RCW 83.100.040(2)(a) as published on leg.wa.gov carries three tables — (i) before July 1 2025 (top 20%), (ii) July 1 2025–June 30 2026 (top 35%), (iii) on or after July 1 2026 (top 20%); fetched 2026-09-02. ~~(verify) — Washington estate tax rate.~~ The engine carries a
$3,000,000 exemption and a 20% top rate, with a note that the 35% top rate
was a temporary July 2025–June 2026 rate under "ESB 6347" reverting to 20%
from July 1, 2026. Our review's understanding of ESSB 5813 (2025) is that
the 10–35% schedule (35% over $9M taxable) is permanent. Please confirm the
schedule in force for deaths after July 1, 2026 (RCW 83.100.040).

**Q-20 — CONFIRMED AS-IS 2026-09-02: KRS 140.070 (apps.legislature.ky.gov, current version, "Effective: April 27, 2026; History: Amended 2026 Ky. Acts ch. 198, sec. 40") lists "nephew, niece, or a nephew or niece of the half blood" in Class A.** ~~(verify) — Kentucky nieces and nephews.~~ The engine treats
nieces/nephews as exempt Class A citing 2026 Ky. Acts ch. 198 §40
(effective April 27, 2026, deaths on/after January 1, 2026). Please
confirm this enactment; if it did not occur, nieces/nephews belong in
Class B.

**Q-21 — RESOLVED 2026-09-02 (v1.8, changelog 125): the annual-RMD schedule is implemented and is the default; the year-10 lump sum is refused after the RBD (Rule 5.7). Text kept for the record.** ~~(judgment) — Inherited IRA annual RMDs.~~ Under Reg.
§1.401(a)(9)-5(d) (final regs 2024), a non-eligible designated beneficiary
of a decedent who died after the required beginning date must take annual
life-expectancy RMDs in years 1–9 and empty the account by year 10. The
engine's "lump sum in year 10" schedule ignores this and its "level over
10 years" schedule uses balance ÷ years remaining rather than the
single-life divisor. Should the year-10 lump sum be removed as an option
when the decedent was past RBD (which at plan end is nearly always)?

**Q-22 — CONFIRMED AS-IS 2026-09-03 (v2.0, no code change).** Tax Law § 601
as currently in force on nysenate.gov — which reflects the FY2027 budget
enacted in spring 2026 — still carries exactly the three eras the engine
models: a schedule "for taxable years beginning after two thousand
twenty-five and before two thousand twenty-seven", one "after two thousand
twenty-six and before two thousand thirty-three", and one "after two
thousand thirty-two". The 2027–2032 joint schedule still contains the 9.65%,
10.30% and 10.90% brackets, and its published cumulative base at $25,000,000
is $2,477,616 — which the engine's own bracket walk reproduces to the dollar
($2,477,616), as it does $417,616 at $5,000,000. The 2033+ era still reverts
to an 8.82% top rate at $2,155,350. No amendment; text kept for the record.**
~~(verify) — New York 2027 figures.~~ The 2027–2032 and 2033+ bracket
rates and recapture tables were transcribed from the FY2026 enacted budget
text. Have they been amended by the FY2027 budget (enacted spring 2026)?

**Q-23 — RESOLVED 2026-09-02 (v1.7, changelog 124): each MFS spouse's wages are tested separately (Rule 2.7).** ~~(judgment) — Additional Medicare Tax on MFS.~~ The 0.9% was computed
on combined household wages against one $125,000 threshold for MFS; it is
a per-return tax, so each spouse's own wages should be tested separately.
Follows from Q-1.

---

**Q-24 — (judgment) Splitting taxable-account distributions by character.
NOT IMPLEMENTED. Design decided by the product owner 2026-09-10; the
remaining questions are marked below.**

*The problem.* Rule 3.9 taxes the entire taxable-account yield at
preferential rates. A household whose taxable account holds bond funds,
REITs or money-market funds receives much of its income as ordinary
dividends or interest, taxed at the marginal ordinary rate. Treating that
as qualified understates federal tax, and because the two buckets stack
differently against the standard deduction it also shifts the
ordinary-income figure driving IRMAA and ACA MAGI.

*Decided: separate buckets, not one blended ordinary share.* They diverge in
ways a single share cannot express, and the divergences are exactly the ones
a retiree's taxable account runs into:

| Bucket | Federal | State | Notes |
|---|---|---|---|
| Qualified dividends | Preferential (Rule 2.3) | Ordinary in most states | Today's only treatment |
| Ordinary dividends | Marginal ordinary | Ordinary | 1099-DIV Box 1a less Box 1b |
| §199A REIT dividends | Ordinary **less a 20% deduction** | Ordinary | Box 5 |
| Exempt-interest dividends | **Exempt** | Exempt only if in-state | Box 12 |
| Interest — Treasury/agency | Ordinary | **State-exempt** | Material in CA/NY |
| Interest — other | Ordinary | Ordinary | |
| Capital gain distributions | Preferential | Ordinary | Box 2a; long-term by definition |

**Short-term distributions are not a bucket.** A mutual fund's short-term
capital gain distributions are reported in Box 1a among ordinary dividends
rather than in Box 2a, so they fall inside the Ordinary dividends row above
and need no separate treatment. The app offered "Short-Term Capital Gain
Distribution" as a Distribution Character until 2026-09-10; it was removed
as a category error, and holdings carrying it were remapped to Ordinary
Dividend (changelog 168). Flagged here in case the reviewer disagrees.

*Decided: carve out §199A REIT dividends.* Note this is not only a split —
the engine models **no deduction of any kind** beyond the standard deduction
(§7), so honouring the 20% deduction adds a new mechanism rather than
re-labelling an existing one. Questions for the reviewer: does the taxable-
income limitation (§199A(a), the lesser of 20% of QBI-equivalent income or
20% of taxable income less net capital gain) bind often enough at retiree
income levels to be worth modelling, or is the flat 20% an acceptable
simplification for this tool's purpose?

*Decided: the derivation is the user's choice*, not a fixed rule — last
complete year, an average over a chosen number of years, or a figure they
set by hand. This answers the worry that one fund's unusual year would
otherwise set a household's assumed character for every remaining year of
the plan.

*Closed: the heir model needs no split.* Rule 5.0's heir income tax falls on
inherited Pre-Tax, the inherited HSA and NQDC as IRD. The taxable account
passes with a §1014 step-up and no heir income tax, and the projection ends
at death, so no post-death distribution income is modelled.

*Still open for the reviewer.*

1. §199A: flat 20% or the full limitation (judgment).
2. Exempt-interest dividends are federally exempt but count in the
   **provisional income** test for Social Security taxability (Rule 2.6) and
   in **IRMAA MAGI**. If we model the bucket, do we need to feed it into
   both — and does that make it worth modelling at all for a household
   unlikely to hold munis in a small taxable account?
3. Treasury interest is state-exempt. The engine models CA/NY/IL/PA/CO/MN
   state tax. Is omitting that exemption acceptable, given a retiree holding
   T-bills in a taxable brokerage in California is a common case?

**Reviewer:** [ ] Approach is sound  [ ] Sound with changes: ____________
[ ] Immaterial for a retirement projection  [ ] Issue: ______________

---

## 7. Simplifications made knowingly

Listed so you can skip them unless you consider one unacceptable.

- One pooled Pre-Tax, one pooled Roth, one taxable account, one HSA per
  household; per-spouse account ownership is not tracked. RMD start age,
  59½ tests, QCD cap and pro-rata all key off Spouse 1 while alive.
- Roth basis is tracked in layers (Rule 3.5) but the five-year *account*
  rule for qualified distributions after 59½ is assumed satisfied.
- Spousal Social Security benefits are modelled behind a per-spouse
  toggle (Rule 3.12); divorced-spouse and child-in-care benefits are not.
- Itemized deductions cover SALT, mortgage interest, cash gifts and the
  medical floor (Rule 2.2); no QBI, no credits (child, saver's, education;
  the foreign tax credit and the premium tax credit are modelled), no
  estimated-tax/withholding timing.
- Taxable-brokerage basis is one pooled figure capped at the balance, so
  an account that falls below its basis in a year harvesting is off (or
  cannot harvest) forfeits that loss: the basis is written down to the
  balance and the later recovery is taxed as gain. Lots are not tracked.
- A surviving spouse always rolls the decedent's Pre-Tax balance into
  their own (Rule 3.2); the election to keep it as an inherited IRA —
  penalty-free draws under 59½, RMDs deferred to the decedent's start age
  — is not modelled.
- No Head of Household or Qualifying Surviving Spouse.
- Taxable-account investment income is qualified dividends on the stock
  share and ordinary interest on the bond and cash share (Rules 2.3, 3.9,
  v2.11); no short-term gains, tax-exempt interest or foreign income
  outside the years-abroad rules. The *amount* can be linked to real
  distributions for a Detailed Holdings user, capital gain distributions
  included (Rule 3.9).
- Inflation indexing is a smooth user-set rate, not chained-CPI (federal)
  or the California CPI with their rounding conventions; California's
  figures index from a 2025 vintage until FTB's 2026 schedule is in.
- The TCJA-sunset and IRMAA-freeze toggles are labelled hypothetical
  stress tests, not law. Note the distinction the toggle name invites you to
  miss: the **Freeze IRMAA thresholds** input is the hypothetical (it holds
  ALL five tiers flat forever), whereas the freeze of the top tier alone
  through 2027 is genuine current law and is applied unconditionally,
  toggle or not (Rule 2.9, changelog 132). Turning the toggle on is
  therefore not a way to "fix" the top tier — it would wrongly freeze the
  four lower tiers that CMS really does index.
- State modelling covers CA, NY (with NYC/Yonkers), IL, PA, CO and a
  generic flat-rate state; other states use the flat-rate proxy with user
  toggles for SS and pension treatment.
- Estate is second-death only, at plan end, with portability assumed (the
  DSUE is indexed only to the first death); no trusts, QTIP, bypass,
  probate costs or debts.
- MFS divides the household's income, deductions, state figures and IRMAA
  MAGI between the two returns in one ratio (`mfsIncomeSplitPct`); no
  income source is attributed to the spouse who earned it. Each return
  floors its own standard deduction (Rule 1.1).
- SS survivor benefit (since v2.4) follows 402(e)/(f) -- age-60 start,
  71.5%-100% age reduction, RIB-LIM, delayed credits carried -- but the
  survivor is assumed to start it in the first eligible year rather than
  time it; no disabled-widow(er) benefit; no WEP/GPO (repealed 2025).

---

## 8. Open items already logged

`KNOWN_ISSUES.md` in the repository is the LIVE list and wins over this
section if the two ever disagree — this one is a snapshot and has been stale
before (it carried the NY estate cliff as open for two days after changelog
127 fixed it).

Closed since v2.0, no longer open items:

- **NY estate tax cliff** — fixed in changelog 127. The exclusion is modelled
  as a credit that phases out between 100% and 105% of the exclusion and
  vanishes above it.
- **IRMAA top-tier indexing** (the tail of Q-4) — fixed in changelog 132.
- **SS provisional income omitting the discretionary draw** — fixed in
  changelog 132 (Rule 2.6); the gross-vs-net salary residual it left behind
  is fixed in changelog 133.
- **NQDC, home equity, cash reserve and concentrated stock outside the
  gross estate** — fixed in changelog 133 (Rule 5.0), NQDC with its §691
  IRD income tax. The HSA half of that question was closed back in
  changelog 119; the Q-13 record text saying otherwise is now marked
  superseded.
- **Scenario-save froze the UI** — fixed in changelog 133 (a performance
  defect, not a tax rule).

Still open as of this version: Alaska/Hawaii poverty
guidelines; the one-time QCD split-interest election; tax-exempt interest
in IRMAA MAGI; the charitable-bequest funding limitation noted in Rule 5.0;
and any Section 6 item this document still marks as a judgment call.

---

*Prepared from the engine source (`src/calculator.js`) by a structured
survey on 2026-08-29. Figures in this document are transcribed from the
constants the engine actually uses; where the survey believed a figure or
rule was wrong, it is stated as a question in Section 6 rather than
silently corrected.*
