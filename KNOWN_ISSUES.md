# Known Issues

A running backlog of real, confirmed bugs and gaps found during development
(mostly while writing tests — see `UI_TEST_COVERAGE_PLAN.md` for the
per-tab testing narrative these came out of) that weren't fixed at the time
they were found, either because the fix is bigger than the change in
progress or because it needs its own dedicated pass. Entries are removed
once fixed (with a note in `src/config/changelog.js` at that point, per
DEVELOPMENT.md's documentation checklist).

## Open

### The Carters' estate exercises less than the Estate Legacy Planner can show

The demo household converts its whole Pre-Tax bucket away by Sam's late
sixties and spends the HSA down by 70, so on the BASE plan the heirs' 10-Year
Rule income tax, the inherited-HSA tax, GST and (since changelog 127, which
indexes the exclusion to the plan's final year) New York's estate tax all
read $0. Changelog 128 covered the two that matter most through saved
scenarios — "No Roth conversions" leaves roughly $0.9M of heir tax, and the
two inheritance scenarios straddle New York's 105% cliff — rather than
changing the Carters themselves, so every existing video callout keeps its
numbers. Still unshown anywhere: the **inherited-HSA ordinary income** hit
(changelog 119), which would need a materially larger starting HSA, and
**GST tax**, which needs a skip share above the indexed exemption (~$37M by
this plan's final year) and is out of reach for this family.

### Tax-rule simplifications still open (deliberate, awaiting EA review)

Everything the 2026-08-29 spec survey and the 2026-09 tax review found as a
defect is fixed (see Fixed below). What remains are simplifications the
engine makes knowingly; each is also stated in `TAX_RULES_SPEC.md`.

- **Married filing separately (Rules 2.1, 2.2, 2.9, 4.1):** one ratio
  (`mfsIncomeSplitPct`) divides the household's income, deductions, state
  figures and IRMAA MAGI between the two returns; no source is attributed to
  the spouse who earned it (the Pre-Tax bucket has no owner); each return
  floors its own standard deduction (changelog 407); community-property
  states are not modelled, and
  the premium-tax-credit exception for victims of domestic abuse or
  abandonment is not modelled (MFS never gets a credit). Two unmarried
  people on a Single plan still share one return.
- **Social Security earnings test (Rule 2.11):** no birth month, so the FRA
  year tests the whole calendar year's earnings, not only the months before
  the FRA month; the first-year monthly test and the spousal top-up's
  exposure to the worker's earnings are not modelled.
- **State retirement income (Rule 4.3):** New York's $20,000 room is pooled
  across the 59½+ spouses; Pennsylvania taxes an early distribution in full
  rather than above the owner's contributions; Colorado splits a joint
  return's benefits evenly between spouses and does not project TABOR
  one-year rate cuts.
- **Washington (Rule 4.8, changelog 349):** the capital gains tax's 2026
  standard deduction is not yet published, so the 2025 $278,000 is used
  for 2026 and grown by the plan's bracket inflation; every realized gain
  is long-term; the charitable deductions, the income tax's smaller AGI
  modifications and the credit for other states' tax are not modelled; the
  income tax's first adjusted deduction is read as tax year 2030 (the act
  says "October 2029 … for taxes due in the following calendar year"), and
  each biennial adjustment uses the plan's average yearly bracket inflation
  rather than a CPI path. A plan saved with Washington on the Tax-Free
  State choice stays there until the user picks Washington.
- **IRMAA (Rule 2.9):** tax-exempt interest is not modelled; the first two
  projection years use their own estimated-then-trued-up MAGI unless the
  pre-plan returns are entered; only work stoppage and a spouse's death are
  detected as life-changing events; the Pre-Tax dollars drawn to fund a
  true-up are not re-priced for tax.
- **Annuities and pensions (Rules 3.11, 3.13):** expected return uses the
  plan's life expectancy rather than the Reg. §1.72-9 tables; no §72(b)(3)
  deduction at death; no §72(q) penalty; no 20% withholding, 60-day window
  or §402(e)(4) averaging on a lump sum; the pro-rata basis ratio is fixed
  once a year and ignores the 401(k)-vs-IRA distinction. The flat Plan
  Settings "annuity income" line has no source account, so it always counts
  as net investment income.
- **Capital gains (Rules 2.3, 2.8, 3.8):** every gain is long-term; the
  harvested loss is a balance × |return| proxy, not tax lots; no §1202,
  §1044, exchange-fund or collar alternative to a concentrated-stock sale.
- **HSA (Rule 3.10):** the 70% premium share of the healthcare bridge is a
  planning default; §213(d)(10) LTC-premium limits are not applied; the
  catch-up is keyed to the oldest spouse rather than per spouse; the stop
  at Medicare enrollment is not enforced; the QCD cap is per household.
- **Estate (Rules 5.0–5.7):** second death only, portability assumed; the
  DSUE is indexed to the earlier of the two life-expectancy years and does
  not follow the survivor-stress death age; a purchased annuity is outside
  the estate; CT, HI, ME, VT and DC keep single-rate models (WA walks its
  graduated table since changelog 349); IL's
  interrelated calculation is approximated; no QTIP, marital-deduction or
  apportionment rules; inherited-IRA eligible designated beneficiaries are
  not distinguished.
- **Deductions (Rule 2.2, Q-17):** no itemized deductions in any
  jurisdiction, no blindness add-on or IL blindness exemption, no head of
  household or dependent-filer figures.
- **UI, not engine:** the IRMAA tier lines on the Tax & Estate charts
  (`App.jsx` irmaaTier1-5) read the MFJ or Single table only, so an MFS
  plan's chart shows the Single lines; the engine's premiums are right.

## Fixed

### 2026-09 tax review: senior bonus, MFS, provisional income, state rules

**FIXED 2026-09-30 (tax branch; changelog entry written by the lead).**
The senior bonus phases out per person; MFS gives each return its own
standard deduction, age add-on, state return and IRMAA test, and no premium
tax credit; the surviving spouse keeps their own 65+ deduction whichever
spouse survives; provisional income, the max-bracket conversion sizing and
the ACA / IRMAA conversion caps share one AGI figure that includes
Life-Event Pre-Tax withdrawals, the purchased annuity, taxable windfalls,
NUA basis and NQDC deferrals; a Life-Event Pre-Tax withdrawal before 59½
pays the 10% (and California's 2.5%); Colorado's SS subtraction uses up the
pension cap; Pennsylvania taxes employee 401(k) deferrals; NIIT excludes a
Pre-Tax-funded annuity; the FRA-year earnings test runs for FRA 67; the
IRMAA top tier is "at or above" and the MFS-together top line is $500,000
less the lower one; Auto-Max 401(k) routes the catch-up to Roth over the
wage threshold; the "max" HSA catch-up is not indexed; the estate exemption
doubles for MFS and the DSUE is indexed only to the first death; Illinois'
2026 exemption is $2,925; the trust-fund default follows the 2026 Trustees
Report (2032, 22%). Tests: `src/__tests__/taxRulesReview2026-09.test.js`.

### Findings of the 2026-08-29 tax-rules spec survey — all resolved

`TAX_RULES_SPEC.md` was prepared 2026-08-29 for professional review. The
structured survey behind it raised the questions in that document's
Section 6; the ones our own reading believed were genuine defects (as
opposed to judgment calls) were listed here so they were not lost. Every
one has since been fixed or confirmed; the simplifications each left behind
are collected under Open. Q numbers refer to TAX_RULES_SPEC.md Section 6.
(The Colorado entry below was extended in the 2026-09 tax review: a full
Social Security subtraction uses up the same pension cap.)

- **Q-15 IL / PA / NY retirement income — FIXED 2026-09-02 (changelog
  120):** IL exempts IRA/401(k) distributions and conversions in full; PA
  exempts distributions from 59½ and conversions at any age; NY's $20,000
  exclusion now covers IRA distributions and conversion income from 59½,
  sharing each recipient's cap with private pension. Remaining
  simplifications: NY room is pooled across 59½+ spouses (the Pre-Tax
  bucket has no owner); PA early distributions are taxed in full rather
  than above-contributions (cost recovery).
- **Q-14 Colorado — FIXED 2026-09-02 (changelog 125):** SS by age band
  (65+ exempt; 55–64 exempt under $75k/$95k AGI else inside the cap; under
  55 taxed), IRA/401(k) money and conversions inside the $20k/$24k cap when
  not premature, $15,000 under-55 military subtraction (2022–2028), base =
  federal taxable income. Still simplified: a joint return's benefits are
  split evenly between spouses; TABOR year-specific rate cuts are not
  projected (4.4% for 2025/2026 confirmed).
- **Q-5 SS taxability tiers — FULLY CLOSED 2026-09-05 (changelogs 119 +
  132 + 133):** the exact Pub. 915 worksheet replaced the flat 0/50/85%
  tiers (119); provisional income now counts the solver's discretionary
  Pre-Tax draw, realized gains and early-Roth taxable earnings, settled
  after the withdrawal solver (132); and salary enters net of 401(k)/HSA/
  NQDC deferrals as AGI has it, not gross (133). Nothing open from Q-5.
- **Q-4 IRMAA MAGI — FIXED 2026-09-02 (changelogs 121 + 123):** two-year
  lookback with an optional SSA-44 appeal; MAGI now AGI-based (taxable SS
  only) and settled after the withdrawal solver so the discretionary
  Pre-Tax draw counts; the top tier's statutory freeze through 2027 is
  modelled as of changelog 132 (42 U.S.C. §1395r(i)), and salary enters
  net of NQDC deferrals as of changelog 133. Still open: tax-exempt
  interest is not modelled; the first two
  projection years use their own (estimated, then trued-up) MAGI because
  no pre-plan income is asked for; only work-stoppage and death of a
  spouse count as life-changing events; the Pre-Tax dollars drawn to fund
  an IRMAA true-up are not themselves re-priced for tax.
- **Q-3 Unused standard deduction — FIXED 2026-09-02 (changelog 124):**
  the unused remainder now shelters gains before stacking; NIIT stays on
  MAGI.
- **Q-9 Untaxed cash — FIXED 2026-09-02 (changelog 126):** a cash pension
  lump sum is ordinary income in the year received with the recurring
  pension's state treatment, and a new rollover flag models the §402(c)
  direct rollover into Pre-Tax; annuity payouts follow the source account,
  with the §72(b) exclusion ratio (capped at the premium per §72(b)(2)) on
  a Taxable purchase; after-tax basis now comes back pro-rata on every
  Pre-Tax distribution, not only conversions. Still simplified: expected
  return uses the plan's own life expectancy rather than the Reg. §1.72-9
  tables; no §72(b)(3) deduction for unrecovered investment at death; no
  §72(q) penalty; no 20% withholding, 60-day window or §402(e)(4) averaging
  on a lump sum; the basis ratio is fixed once per year and ignores the
  401(k)-vs-IRA distinction, as the conversion pro-rata always has.
- **Q-1 MFS — FIXED 2026-09-03 (changelog 127):** a separate-filing
  household is now spread across the two returns it actually files, by
  `mfsIncomeSplitPct` (default 50); 100 restores the old single-return
  arithmetic for a one-earner couple, and a one-person plan always uses one
  return. Still simplified: one ratio is applied to the whole household
  taxable income rather than attributing each source to the spouse who
  earned it (the Pre-Tax bucket has no per-spouse owner), and community
  property states are not modelled. Two unmarried people on a Single plan
  still share one return — unchanged, and documented in spec Section 7.
  (**Q-23** Additional Medicare Tax is now per spouse for MFS — FIXED
  2026-09-02, changelog 124.)
- **Q-6 / Q-12 — FIXED 2026-09-02 (changelog 124):** Part D base premium
  $38.99 (CMS 2026); AMT 28% breakpoint $122,250 for MFS.
- **Q-11 Capital losses — FIXED 2026-09-02 (changelog 124):** $1,500 for
  MFS, not indexed, nets only against realized gains (Life-Event Taxable
  withdrawals and the solver's Taxable draw), never the dividend proxy.
  Still a simplification: the harvested loss is a balance × |return|
  proxy, not tax lots.
- **Q-10(a) — FIXED 2026-09-02 (changelog 125):** rents and annuity
  income now count as NII. **Q-10(b) — FIXED 2026-09-03 (changelog 127):**
  the diversification is taken before the tax engine runs, so its gain is
  stacked in the 0/15/20% bands, exposed to NIIT and state tax, counted in
  every MAGI, and shown in the year's tax paid. `concentratedStockFlatTaxEnabled`
  keeps the old flat rate. Still simplified: gains are long-term regardless
  of holding period, and there is no §1202, §1044, exchange-fund or collar
  alternative to an outright sale.
- **Q-8 — FIXED 2026-09-02 (changelog 126):** per IRS Pub. 969 an HSA
  cannot pay pre-Medicare insurance premiums, so the healthcare bridge is
  split by `healthcareBridgePremiumPct` (default 70%) and only the
  out-of-pocket share is drawn tax-free; a flag restores the whole bridge
  for COBRA and unemployment-period coverage. Still simplified: the 70%
  default is a planning assumption, not a statutory figure, and the
  age-based §213(d)(10) qualified-LTC-premium limits are not applied.
- **Q-13 — FIXED 2026-09-03 (changelog 127):** the federal and GST
  exemptions, the five statutorily-indexed state exemptions (CT, ME, NY,
  RI, DC) and the heirs' brackets and stated income are now carried to the
  plan's final year at the Tax Bracket Inflation Rate;
  `estateIndexingEnabled: false` restores the unindexed comparison. Fixed
  dollar exemptions (HI, IL, MA, MD, MN, OR, VT, WA) and the frozen rate
  schedules deliberately do not move. **Fully closed 2026-09-05 (changelog
  133):** the HSA went into the gross estate 2026-09-02 (changelog 119,
  taxed to non-spouse heirs as year-one ordinary income), and NQDC, home
  equity, the cash reserve and a concentrated stock position followed in
  changelog 133 — NQDC with its §691 income-in-respect-of-a-decedent tax.
  Only a purchased annuity is still excluded. See Rule 5.0 of
  `TAX_RULES_SPEC.md`.
- **Q-18 — FIXED 2026-09-03 (changelog 127), all three parts:** OR, MN, MA,
  RI, IL and MD now use their real graduated computations (one pre-2001
  §2011 credit table serves MA/RI/IL/MD and reproduces all three published
  credit figures exactly); NY's exclusion is modelled as the §952(c) credit
  that phases out between 100% and 105% and vanishes above it; IL's $4M is
  a threshold, so crossing it taxes the whole estate; MD subtracts the
  inheritance tax paid from its estate tax; and life insurance to a named
  beneficiary is out of the inheritance base in all five states. VT was
  checked and really is a single 16% rate. Still simplified: CT, HI, ME, VT
  and DC keep the single-rate model their statutes describe but their
  own graduated tables (where any exist) are not walked; IL's real
  "interrelated calculation" — the estate tax is deductible in computing
  itself — is approximated by the plain table; and no state's QTIP,
  marital-deduction or apportionment rules are modelled. (**Q-21**
  inherited-IRA annual RMDs — FIXED
  2026-09-02, changelog 125: the default schedule now takes the required
  minimums in years 1–9 and refuses a year-10 lump sum after the RBD;
  eligible designated beneficiaries are still not distinguished, and the
  heir's age defaults to 30 years younger than spouse 1 unless entered.)
- **Q-16 — CONFIRMED AS-IS 2026-09-02:** the FTB caps the exclusion at
  $20,000 per return (joint filers included), which is what the engine does.
- **Q-17 — FIXED 2026-09-02 (changelog 126):** CA $5,706/$11,412, NY
  $8,000/$16,050 (MFS on the single figure), and IL's exemption allowance
  ($2,850/person + $1,000 per spouse 65+, zero above $250,000/$500,000 of
  federal AGI) are now subtracted before each schedule; CO already ran on
  federal taxable income from changelog 125. Still simplified: no itemised
  deductions in any state, no IL blindness exemption, and no head-of-
  household or dependent-filer figures (neither status exists here).
- **Q-7 — FIXED 2026-09-02 (changelog 124) and 2026-09-24 (changelog
  265):** FRA follows the SSA birth-year table (66 for 1943–54 rising to
  67 for 1960+); the survivor branch now pays the 402(e)/(f) survivor
  benefit from 60 (71.5% rising to 100% at the survivor's FRA, RIB-LIM,
  the deceased's delayed credits carried) or the survivor's own benefit,
  whichever is larger each year.
- **Q-19 / Q-20 — CONFIRMED AS-IS 2026-09-02** against leg.wa.gov (RCW
  83.100.040: 35% table only for deaths July 2025–June 2026, 20% after)
  and apps.legislature.ky.gov (KRS 140.070 as amended by 2026 Ky. Acts ch.
  198: nieces/nephews Class A). **Q-22 — CONFIRMED AS-IS 2026-09-03**
  against Tax Law §601 as currently in force on nysenate.gov, which already
  reflects the FY2027 budget: the three eras the engine models are intact,
  the 2027–2032 joint schedule still carries 9.65/10.30/10.90%, and its
  published bases at $5,000,000 and $25,000,000 ($417,616 and $2,477,616)
  are reproduced to the dollar.
- **Q-2 — closed by documentation 2026-09-02:** the model's first Single
  year is the first full year of survivorship, so the year-of-death joint
  return is already honoured.
- The backdoor-Roth $7,000/2025-limit default was fixed 2026-08-31
  alongside the per-spouse split, changelog 108. (The remaining minor HSA
  and QCD items are listed under Open.)


### A charitable bequest could only be funded from three buckets &mdash; now five

**FIXED 2026-09-14 (changelog 181).** Changelog 133 put NQDC, the cash
reserve, a concentrated stock position and home equity into the gross
estate, but `charityFundable` stayed `preTax + Roth + taxable`. A plan whose
wealth was mostly a founder position could not direct a bequest at it, and
any bequest larger than the three accounts was silently capped &mdash; taking
the estate-tax deduction down with it.

`splitCharitableBequest` is now generic over whatever buckets it is handed
(its output mirrors its input keys, so three-bucket callers are unchanged),
and `CHARITABLE_SOURCE_ORDERS` drains cash and the stock position alongside
the taxable account, with Roth last in every order. Home equity, NQDC, the
HSA and life insurance remain deliberately out: a house is not liquid at
death, unpaid NQDC is a claim on the employer's schedule, and the HSA and
any policy pass to their own named beneficiaries rather than being the
executor's to direct &mdash; which is the F-6 audit finding the cap exists for.

The heir pools are netted of what the charity took, guarded by a
conservation test on an all-stepped-up estate. That fixture shape matters:
an inherited pre-tax balance keeps growing through the heir's 10-year
drawdown and that growth lands in `grossInherited`, so an estate containing
one cannot check conservation to the dollar.


### Second external audit, August 30, 2026: five confirmed findings

Fixed 2026-08-30, changelog 104, 1444 tests
(`auditFixes2026-08-30.test.js`). Verified against source and reproduced
before changing anything. (1) **Life insurance mis-timing** — a policy on
the first spouse to die stayed "active" to plan end, cash value and loan
compounding on a dead insured; now a self/spouse-owned policy pays the
survivor's Taxable (100% basis, §101(a)) the year the insured dies and
ceases to exist; trust-owned freezes for heirs; second-to-die and single
plans unchanged. (2) **HI + MD portability** — `portability: true` table
flag doubles those exemptions for MFJ at the second death (HI Form M-6
DSUE; MD Tax-General §7-309(b), deaths ≥2019). The audit also claimed
Minnesota — REFUTED: SF 30 (2025) was never enacted (Jan 2026 Faegre
Drinker: "the Minnesota estate tax exemption is not portable"); WA
correctly stays non-portable. (3) **State gift add-back** — CT adds all
CT taxable gifts (CGS §12-391(c)), MN adds gifts within three years of
death (§291.016 subd. 2(3)); `calculateStateEstateInheritanceTax` grew an
`opts` 5th arg { married, lifetimeTaxableGifts, recentTaxableGifts }.
(4) **IRC §2058** — state death taxes now deduct from the federal taxable
estate (`calculateFederalEstateTax` 5th arg). (5) **Monte Carlo floor** —
sampled returns clamped at −100% (a balance can hit zero, never go
negative); an override year of exactly 0% is no longer skipped as falsy.
(6) **Charity conservation** — a charitable bequest is capped at the
drainable buckets (Pre-Tax/Roth/Taxable), so an all-insurance estate can
no longer deduct a bequest heirs' insurance actually keeps.

The audit verified as CORRECT: per-heir inheritance-tax shares, one
federal estate tax across heirs, step-up on inherited taxable, the MFS
IRMAA Infinity-tier walk, IRMAA-in-expenses (no solver oscillation),
worker/fallback Monte Carlo parity, per-year percentile bands, stress
tests re-running the full solver, the five inheritance states' class
mappings, and WA non-portability.

### Spousal Social Security benefit &mdash; now modelled

Fixed 2026-08-30 (changelog 102). Per-spouse `ssSpousalEnabled1/2`
toggle. `spousalSSTopUp()` pays max(0, 50% of the other spouse's FRA
benefit &minus; own FRA benefit) &times; `getSpousalSSMultiplier(startAge)`
(25/36 of 1%/month for 36 months, 5/12 beyond, no delayed credits), where
the start age is the later of the own claiming age and the age at which
the other spouse files (deemed filing) and never below 62. Paid only while
both spouses are alive; the existing survivor branch already pays the
greater own benefit. Both toggles off = `ss1 + ss2` exactly, so no saved
plan moves. Tests: `spousalSocialSecurity.test.js`.

### Pre-59&frac12; Roth withdrawals were penalised in full, including basis

Fixed 2026-08-30 (changelog 103). `runProjection` now keeps Roth basis
layers (`makeRothLayers` / `splitRothDraw` / `consumeRothLayers`):
contributions, then dated conversions split into taxable and
non-taxable parts. A pre-59&frac12; Roth draw is split by the
&sect;408A(d)(4) ordering rules inside `solveWithdrawals` (new trailing
`rothDrawSplit` argument): contributions free, seasoned conversions free,
young conversions' taxable part penalised only, earnings ordinary income
plus penalty. New inputs `rothBasisInit` and `rothRecentConversionsInit`
(both 0 by default). Behaviour change to note: with no basis entered,
early Roth earnings are now income-taxed as well as penalised, where they
were previously penalty-only. Ledger rows carry `rothBasis`,
`rothDrawFromBasis`, `rothDrawEarningsTaxed`, `rothDrawPenalized`. The
five-year *account* rule after 59&frac12; is assumed met. Tests:
`rothBasisOrdering.test.js`.

### Single-person plans received Social Security from 62 regardless of claiming age

Resolved 2026-08-29 (changelog 101). The SS benefit block had three
branches: both alive, Spouse 1 surviving, Spouse 2 surviving. With
`spouse2Enabled: false`, `spouse2Alive` is false, so a single filer fell
into the "Spouse 1 surviving" branch, which starts a survivor benefit at
62 and pays `max(ss1Benefit, ss2Benefit)` — with `ss2` still at its
$18,000 default. A single user with `claimingAge1: 70` was paid 124% of
PIA from 62. A dedicated `spouse1Alive && !spouse2Enabled` branch now
starts the benefit at `claimingAge1` and ignores `ss2`. One existing test
had been asserting the buggy behaviour (a 67-year-old with claiming age 70
receiving the delayed benefit in year 0) and was corrected. Found by the
TAX_RULES_SPEC.md survey.

### Age-65+ additional standard deduction and the OBBBA senior bonus &mdash; now modelled

Resolved 2026-08-29 (changelog 100). `additionalStandardDeductionAged`
adds the IRC s 63(f) amount ($1,650 per aged spouse married / $2,050
single, 2026, indexed with the bracket factor) for each filer 65+ on the
return; `seniorBonusDeduction` adds the OBBBA $6,000 per senior for
2025&ndash;2028 with the 6% MAGI phase-out over $75k / $150k, MFS
excluded, unindexed. The bonus is MAGI-dependent, so runProjection
exposes `deductionFor(magi)` and every tax computation &mdash; the
withdrawal solver (which now accepts a function for its standardDeduction
argument), base/reference/harvest/conversion/ACA pricing, the max-bracket
conversion sizing, and the row's Std Deduction / Ordinary Taxable Income /
Bracket &mdash; prices its own income through it. Row gains
`seniorBonusDeduction` and `seniorCount`. The DEFAULT_INPUTS golden ending
balance moved from 186,789.64 to 207,438.45. Amounts verified against
Rev. Proc. 2025-32 and published summaries of P.L. 119-21 s 70104;
re-verify the 63(f) figures in the January 2027 tax pass, and note the
bonus sunsets after 2028 by construction.

### The Social Security "tax torpedo" is now re-solved inside conversion sizing

Resolved 2026-08-29 (changelog 100). Taxable SS is a function
(`taxableSSFor(otherIncome)`) rather than a one-shot number; the
max-bracket conversion bisects for the largest conversion whose taxable
income &mdash; with SS re-tested against the conversion and the senior
bonus phase-out included &mdash; stays at or under the bracket ceiling
minus the buffer, and the year's `taxableSS` is then settled against the
conversion actually made. The provisional-income base itself is
unchanged (salary + pension + rental/annuity + RMD + dividends); adding
milestone Pre-Tax draws, NUA, annuity payouts and the withdrawal solver's
own discretionary draws to it would be the next refinement. A separate
display-only fix rode along: the ledger's Ordinary Taxable Income column
double-counted milestone Pre-Tax withdrawals.

### External logic audit, August 2026: nine confirmed engine and UI bugs

Resolved 2026-08-29 (changelog 99). An outside review of the projection
engine turned up thirteen findings; nine were confirmed against the code
and fixed together, the other four are the Open entries above.

- **Rental Income and Annuity Income were untaxed.** `rentalAnnuity` fed
  cash inflows and the SS provisional-income test but not
  `baseOrdinaryTaxableIncome`, `magiForIRMAA`, or the max-bracket
  conversion's `taxableIncomeBeforeConversion`. Now in all three (and,
  through the base, in state tax and the ACA MAGI).
- **State SS exemption created a phantom deduction.** `calculateStateTaxes`
  subtracted gross `ss` from an income base that only carried the
  federally taxable portion. `extras.federalTaxableSS` now says what is
  actually in the base and that is what exempting states back out (and
  what taxing states keep); direct callers that omit it keep the gross
  convention.
- **SS claiming multiplier was linear 8%/yr** (60% at 62). Now the
  statutory 5/9% / 5/12% per-month schedule (70% at 62), month-granular.
- **NIIT thresholds were inflation-indexed** despite the comment saying
  they aren't, and tested against taxable income. Now fixed dollars and
  tested against MAGI (`calculateCapitalGainsTaxes` takes the standard
  deduction as an optional fifth argument to add back).
- **FICA wage base frozen at $184,500.** `calculateFICATaxes` now takes a
  wage-index factor (the plan inflation factor); the Additional Medicare
  threshold stays fixed by statute.
- **RMDs stopped at Spouse 1's death** and the Forced RMDs KPI added
  phantom age-73/74 RMDs for 1960+ births. RMDs now follow whichever
  spouse owns the pooled balance, on that owner's age and start age; the
  KPI sums the rows' `rmdAmount`.
- **Yearly Ledger CSV was all NaN** (read `startBalance`, `growth`, ...
  which the engine never emits). Rewritten as `utils/yearLedgerCsv.js`,
  33 real columns, unit-tested.
- **Real Dollars mode** left HSA, cash reserve, home/debt, life insurance,
  NQDC, RSU income and concentrated stock nominal. The App.jsx memo now
  deflates an explicit `DOLLAR_FIELDS` list; keep it in step with the row
  object.
- **Interview Estate gate** keyed on life insurance only; now opens for
  configured heirs, a charitable bequest, or life insurance.

Tests: `src/__tests__/auditFixes2026-08.test.js` pins each one.

### New York's 2027 and 2033 bracket step-downs were not modelled

Resolved 2026-08-23. The app applied one bracket set to every projection
year; s 601 already contains the 2027-2032 schedule ((viii): bottom five
rates drop to 3.80/4.30/5.05/5.30/5.80) and the 2033+ schedule ((ix): the
9.65/10.30/10.90 brackets expire, top rate reverts to 8.82%) as enacted
law. calculateStateTaxes now takes the projection row's calendar year and
picks the era &mdash; brackets AND the era's coupled recapture table
(s 601(d-6) for 2027-2032, (d-7) for 2033+), since the two move together
by construction. (d-7) also drops the "flat 10.9% above $25M AGI" clause,
so that cliff exists through 2032 and vanishes in 2033, which the model
follows.

Sourcing: the consolidated-law page truncates before (d-6)/(d-7); their
integers were transcribed from the FY2026 budget bill print
(budget.ny.gov revenue Article VII) and verified by re-derivation from the
enacted (viii)/(ix) rate schedules (every row within ~$1, flat identities
exact: 9.65% x $5M = $482,500 in the 2027 era from either filing status's
table) plus internal chaining. Re-verify against DTF's 2027 IT-2105-I when
it publishes. NY thresholds still never inflate &mdash; every era's
figures are fixed dollar amounts.

### New York City local income tax was not modelled

Resolved 2026-08-23. The blocker was sourcing: the combined s 1304 +
s 1304-B resident rates could not be confirmed from a first-party
document. The 2026 IT-2105-I prints the full NYC resident schedule
(3.078% / 3.762% / 3.819% / 3.876%; single thresholds $12,000 / $25,000 /
$50,000, joint $21,600 / $45,000 / $90,000), each cumulative base
re-deriving from the rates within $1. Modelled as a new nycResident
toggle (NY-only, mutually exclusive with Yonkers in the UI): the city
schedule applies to the same taxable-income base as the state (SS exempt,
pension exclusions flow through), additively &mdash; the Yonkers surcharge
never multiplies it. Thresholds are statutory, unchanged since 2015, not
indexed. NYC's school-tax and household credits are not modelled (errs
against the taxpayer by a few tens of dollars).

### California: HSAs are not recognised by the state &mdash; now modelled

Resolved 2026-08-23. Each year's HSA contribution plus estimated earnings
on the balance (this year's return, floored at zero) is added back to
California taxable income, feeding both the brackets and the 1% BHS
surcharge base. Withdrawals stay untaxed by CA in the model, consistent
with the state having already taxed contributions and earnings. The
IRA-to-HSA rollover addback + 2.5% additional tax remains unmodelled (the
app has no such rollover input).

### California: the $20,000 military retirement exclusion &mdash; now modelled, replacing an over-generous blanket rule

Resolved 2026-08-23. The app had been subtracting military pensions in
FULL for every state; California never allowed that (it taxed military
retirement fully before 2025). Now CA applies the real rule (R&TC
ss 17132.9/17132.10, confirmed in the FTB's 2025 540 booklet): up to
$20,000, only when federal AGI is at or below $125,000 single / $250,000
joint, and only for tax years 2025-2029 &mdash; the projection's calendar
year enforces the sunset. Other states keep their existing full
subtraction. Net effect: CA tax UP for military retirees (the app was
under-charging them), which is the honest direction.

### California exemption credits were not modelled

Resolved 2026-08-23. $153 per personal exemption plus $153 per spouse
65+, as CREDITS against tax (the entry's own warning: modelling them as
deductions would be materially wrong), phasing out $6 per credit per
$2,500 ($1,250 MFS) or fraction thereof of federal AGI above $252,203
single / $504,411 joint. Verified against the 2025 540 instructions'
AGI Limitation Worksheet and FTB's SB 1144 analysis. Blind and dependent
credits are not modelled (no such inputs exist); omitting them can only
overstate CA tax. Amounts are the 2025 vintage, refreshed each January
with the brackets (both are CPI-indexed).


### New York's tax table benefit recapture above $107,650 was not modelled

Resolved 2026-08-23. Tax Law s 601(d-5): once NY AGI passes $107,650, New
York claws back the benefit of the graduated brackets &mdash; a fixed
recapture base plus an incremental benefit phased in over $50,000 of AGI
above each row's threshold, so that at full phase-in the entire taxable
income is effectively taxed at the filer's marginal rate. The app charged
brackets only, understating NY tax for everyone above $107,650 &mdash; by
$567/yr at $160,000 single, growing to $65,286/yr at $5M. A two-pension
household clears $107,650 easily, so this was never a high-earner edge case.

The blocker last time was that the single-filer rows above $215,400 would
not reconcile against the rate schedules. They now do, and the reason is
the finding worth keeping: **the FY2026 budget's rate cuts changed the
recapture dollars too.** The 2026 s 601(d-5) single/MFS figures
($567 / $2,047 / $30,172 / $32,500) are not the 2025 s 601(d-4) ones
($568 / $1,831 / $30,171 / $32,500) that summary tables and stale
codifications still carry &mdash; the earlier pass was almost certainly
reading a (d-4) transcription against the (d-5) rate schedule. Verified two
independent ways: the department's own 2026 IT-2105-I tax computation
worksheets print these exact integers (and the divide-by-$50,000,
round-to-four-decimals mechanics, which the app now matches), and every row
re-derives from the s 601 rate schedules as sum over lower brackets of
(row rate &minus; lower rate) &times; lower width, within ~$1.25 of the
published integers. Both tables also chain internally (each row's base
equals the previous row's base + incremental), which is the cheap check
that catches a stale or mistranscribed row. With full recapture the flat
identities land exactly: 9.65% &times; $5,000,000 = $482,500.

Above $25M of AGI the graduated schedule is abandoned outright &mdash;
everything at 10.9%, including the statute's own ~$150k cliff at that line.
The Yonkers surcharge multiplies the state liability including recapture,
as the IT-201 worksheets do. One recorded approximation: the app has no NY
deduction model, so state taxable income stands in for NY AGI in the
phase-in fraction; AGI &ge; taxable income, so this only ever slightly
under-phases inside a $50,000 band. The 2027 step-down brackets have since
shipped (see the entry above this one) with their coupled recapture tables
&mdash; the coupling that, ignored, is exactly how this bug happened.

### All five inheritance-tax states charged the wrong rate to everyone

Resolved 2026-08-21. The old table stored one exemption/rate pair per state,
and the comment above it said that pair represented the closest-relative
(child) tier. It did not. In every one of the five states the stored exemption
came from one beneficiary class and the stored rate from a different, more
distant one &mdash; so the number was not the child figure, not the stranger
figure, and not any figure the state actually charges anybody:

| State | Stored | Actual child tier | Actual "anyone else" tier |
| --- | --- | --- | --- |
| Kentucky | $1,000 / 16% | exempt | $500 then 6&ndash;16% |
| Maryland | $1,000 / 10% | exempt | 10% flat over a $1,000 cliff |
| Nebraska | $100,000 / 15% | $100,000 then 1% | $25,000 then 15% |
| New Jersey | $25,000 / 16% | exempt | 15% to $700k, 16% above |
| Pennsylvania | $0 / 15% | 4.5% flat | 15% flat |

Simply correcting the pairs was not an option, because there is no single
correct pair. Three of the five exempt children entirely, so a faithful
closest-relative table would have reported **$0 forever** in KY, MD and NJ
&mdash; hiding the tax precisely where it does the most damage, since a niece
or an unmarried partner in those same states can owe six figures.

So heirs now carry a **relationship** field (Tax &amp; Estate &rarr; Estate
Legacy Planner), and each state's real beneficiary-class schedule is modelled:
`STATE_INHERITANCE_SCHEDULES` in `calculator.js`. Graduated bands are modelled
as bands, not collapsed to a top rate &mdash; New Jersey's Class C charges 11%
all the way to $1.1M, so the old 16% overstated a $500,000 bequest to a
sibling by 45%.

Three things worth recording that the audit turned up:

- **Kentucky changed for 2026.** 2026 Ky. Acts ch. 198 sec. 40 moved nieces
  and nephews from Class B into the fully-exempt Class A, applying to deaths
  on or after January 1, 2026. Kentucky's own DOR forms and published guide
  still predate the amendment; KRS 140.070 governs.
- **De minimis thresholds are cliffs, not exemptions**, and Maryland and New
  Jersey put the boundary on opposite sides of the line &mdash; MD is exempt
  at $1,000 and taxable at $1,000.01; NJ is exempt at $499 and taxable on the
  whole amount at $500. Hence two separately named keys rather than one shared
  number.
- **Nebraska's statutes still print their pre-2023 figures** alongside the
  current post-LB-310 ones, for deaths before the phase-in completed. That is
  an easy way to transcribe a wrong number from a correct source.

Documented simplifications carried deliberately: aunts, uncles and cousins are
folded into "anyone else" (which over-states them in KY and NE, where they sit
one tier lower); Nebraska's under-22 exemption and Pennsylvania's 0% rate for
a parent inheriting from a child aged 21 or under are not modelled, as neither
an heir age nor a decedent age is collected.

### The split optimizer reported future dollars beside a chip reporting today's

Resolved 2026-08-21. `useRealDollars` defaults ON, so every balance the app
shows is discounted to today's dollars &mdash; except the Pre-Tax vs. Roth
Split Optimizer, which rendered `_runProjectionPreSanitized`'s raw nominal
output directly. The sticky Plan Status bar sits in the bottom-right corner of
that same page reading the same projection through the discounting path, so
the screen showed **$5,585,384** and **$2,412,357** at once, roughly a factor
of inflation apart, with nothing to say they were different currencies. A user
reasonably read it as a contradiction.

`getContributionSplitOptimizer` now takes `{ realDollars }` and prices its own
results, and the section states which unit it is showing.

Two details worth keeping:

- **Ending balance and total taxes discount differently.** A balance is one
  figure at the final year, so it divides by that year's inflation factor.
  Taxes are a sum across every year, each paid in its own year's dollars, so
  they must be discounted year by year and re-summed &mdash; dividing the
  nominal total by the final factor would understate them badly, since most of
  the tax is paid decades before the end. `computeOptimizerResultsReal` already
  made this distinction; this is the same logic applied per projection.
- **The recommendation was never wrong.** Discounting divides every candidate
  by the same positive factors, so it cannot reorder them. Only the magnitude
  was mislabelled. There is a test asserting the winner is identical either
  way, which is what would catch discounting being applied non-uniformly.

The audit for the same gap elsewhere came back clean: this was the only
component calling a projection function directly and rendering the dollars.
`DashboardTab`'s `autoCalibratePlan` also calls `runProjection` directly but
only reads `isSuccessful` from it, never a dollar figure.

### Six of thirteen state estate tax exemptions were wrong

Resolved 2026-08-21. The whole `STATE_ESTATE_INHERITANCE_TAX_TABLE` came from
a single aggregated summary that had gone stale, and nothing in the test suite
could detect it &mdash; the same failure shape as the New York and California
bracket bugs above. Re-verified every jurisdiction against its own revenue
department or statute:

| Jurisdiction | Was | Verified 2026 |
| --- | --- | --- |
| Connecticut | $13,990,000 | **$15,000,000** (tracks the federal BEA) |
| Maine | $7,000,000 | **$7,160,000** |
| New York | $7,160,000 | **$7,350,000** |
| Rhode Island | $1,802,431 | **$1,838,056** |
| DC | $4,873,200 | **$4,988,400** |
| Washington | $3,000,000 @ **35%** | $3,000,000 @ **20%** |

Five of the six are simply a year stale: CT, ME, NY, RI and DC all index their
exemptions annually, which the table's own comment wrongly asserted they did
not. Hawaii, Illinois, Maryland, Massachusetts, Minnesota, Oregon and Vermont
were all correct, as were every top rate except Washington's.

Washington is the interesting one. Its 35% rate was **temporary** &mdash;
ESSB 5813 (2025) set the 10%&ndash;35% table, and ESB 6347 (2026) limited it
to deaths from July 2025 through June 2026, restoring the 10%&ndash;20% table
after that. (Correction 2026-09-30, changelog 349: this entry originally
credited the 35% rate to ESB 6347, and the engine then charged 20% on the
whole excess over $3,000,000; Washington's tax is the graduated Table W on
that excess, which the engine now walks. A $5,000,000 estate owes $240,000,
not $400,000.) The app was carrying a rate that had already
expired, overstating a large Washington estate's tax by three-quarters. A rate
with a sunset date cannot be copied forward, which is now called out
explicitly in `TAX_UPDATE_PROCESS.md` section 9.

No jurisdictions entered or left the list for 2026 (Oregon SB 1511 failed;
Maryland SB 211 died in committee).

### Yonkers and California's early-distribution tax were both a 100% miss

Resolved 2026-08-20. Two verified gaps, both of which were absent entirely
rather than wrong.

**Yonkers** charges its resident income tax as **16.75% of your New York
State liability** (Publication NYS-50-T-Y (1/26): "Multiply the result by
16.75% (0.1675)"), not with its own brackets. Because it multiplies a figure
the app already computed exactly, it was cheap to add — and until now a
Yonkers resident's state tax was understated by a flat sixth. There is a
toggle on Plan Settings → Taxes & Roth that appears only when New York is the
jurisdiction.

**California** adds **2.5%** to the federal 10% on the taxable portion of a
distribution taken before 59½ (FTB Form 3805P: "the portion of the early
distribution that is included in income is subject to an additional 2½%
tax"). That brings the combined cost to 12.5%, and it matters
disproportionately here — the whole point of modelling a Roth conversion
ladder or a 72(t) is reaching money before 59½.

Known simplification carried over deliberately: California does not conform to
every federal exception to the early-distribution penalty, and this app
applies a single blanket age test for both. A distribution that qualifies for
an exception (72(t) substantially-equal payments, separation from service at
55+, disability) is over-penalised at both levels equally. That was already
true of the federal 10%; the state figure inherits the same shape rather than
introducing a new inconsistency.

### New York government pensions were taxed as if they were private

Resolved 2026-08-20. New York excludes pensions paid by New York State, a NY
local government, or the **federal** government in full — no dollar cap and no
age test (IT-201 line 26, Tax Law s 612(c)(3)). The app applied the $20,000
private-pension exclusion to all pension income alike, so a federal or NYS
retiree with a $60,000 pension was taxed on $40,000 of it that New York does
not tax at all.

Fixed with a per-spouse **Government Pension** toggle on Plan Settings →
Income, sitting alongside the existing Military Pension flag. A federal
military pension is also a federal government pension, so the two flags
overlap; the projection decides per spouse whether the whole amount is
state-exempt rather than summing two buckets, which is what stops a pension
marked both ways being excluded twice.

The same fix closed a second bug pointing the other way. The $20,000
exclusion is per *recipient* and NY is explicit that "neither of you can claim
any unused part of your spouse's exclusion" — but the old code granted a
second $20,000 whenever both spouses were 59½, even if only one of them had
any pension income. That **under**-taxed one-pension couples. The exclusion is
now capped at each spouse's own pension income.

Both exclusions can apply to the same person on different money: s 612(c)(3-a)
covers pensions "not otherwise excluded pursuant to paragraph three", so a
government retiree with separate private pension income gets the full
government exclusion and up to $20,000 against the rest.

### New York state brackets were wrong, and MFS was fine all along

Resolved 2026-08-20. The open question here was whether New York publishes a
separate rate schedule for Married Filing Separately, or whether MFS filers
use the single-filer schedule as the app assumed. **The assumption was
correct** — Tax Law s 601(c) is headed "Resident unmarried individuals,
resident married individuals filing separate returns and resident estates and
trusts", one schedule covering all three, and the department's own tax tables
carry the matching column heading "Single or Married filing separately".

Reading the statute to settle that turned up something considerably worse: the
bracket tables themselves, labelled "estimated 2026", were wrong three
separate ways, all of which **overstated** tax for every New York resident
regardless of filing status. Every rate was about 0.1 point high; two
breakpoints ($21,400 single, $43,000 joint, at a 6.33% rate) existed nowhere
in the statute; and the 9.65% rate was applied from $215,400 single /
$323,200 joint when the statute does not reach it until $1,077,550 /
$2,155,350. The 10.30% and 10.90% top brackets were missing entirely.

Corrected against s 601(a)(1)(vii) and s 601(c)(1)(vii), and now pinned by
tests that check against the base dollar amounts the statute publishes at each
threshold. The previous test cross-checked the progressive walk against a
duplicated copy of the same wrong table, so it passed throughout — which is
why the new tests compare against the statute rather than against ourselves.

### Holdings sub-tab has three separate, similarly-worded import entry points

The Holdings sub-tab (`src/components/tabs/PortfolioTab.jsx`) offered three
distinct ways to bring in holdings data, stacked on the same page with no
signposting about which one to use for what: the "Upload CSV" button near
the top (a plain spreadsheet import — symbol/shares/price only, no
lot/dividend/closed-position history), the "Import from Portfolio Tracker
Backup" section's "Choose Backup File (.json)" button (`PtaImportPanel.jsx`
— the full-fidelity importer: tax lots, dividend ledger, closed positions),
and the "Import from a Brokerage Statement" section's "Paste Statement
Text" / "Upload PDF" buttons (`StatementImportPanel.jsx` — best-effort
text/PDF extraction). Confirmed as a real point of confusion in practice:
asked to "upload the backup" (the `.json` PTA export), the user's first
attempt was the CSV button, since nothing on the page differentiated the
three at a glance.

Fixed 2026-08-19 (changelog id 56), signposting-only (no behavior change):
a "which import should I use?" note now sits right under the Holdings
toolbar naming all three by name, `Upload Holdings CSV`'s tooltip is
explicit that it's for a plain spreadsheet only, and both
`PtaImportPanel.jsx` and `StatementImportPanel.jsx` gained a bolded
"Use this if you have..." lead sentence distinguishing themselves from
the other two. `InputReference.jsx` also gained rows for the CSV and
statement importers (previously only the PTA backup import had one), so
all three are now comparable side-by-side in the Input Dictionary.

Both toggle-switch and plain-form-field label association gaps below have
been fixed too. New issues get added here as they're found.

### Plain form fields: `<label>` not programmatically associated with its input

Plain text/number/select fields' `<label>` sat as a sibling of its
`<input>`/`<select>` inside a shared `<div className="form-group">`
wrapper — never connected via `htmlFor`/`id`/`aria-labelledby`, and the
label didn't wrap the control either. A sighted mouse user wasn't
affected (the label visually sits right above its field, and clicking the
field itself worked fine), but a screen reader user tabbing through
fields and relying on programmatic label association wouldn't hear the
label announced with its control, and `getByLabelText()`-style queries
(this app's own test suite included) failed on every one of these.

Confirmed across `src/components/tabs/SettingsTab.jsx` (180 fields),
`src/App.jsx` (19 fields), `src/components/tabs/InterviewTab.jsx` (11
fields routed through its shared `Field`/`NumField`/`TextField`/
`SelectField` components, plus 5 more inside the per-heir Estate & Heirs
mini-editor), `src/components/tabs/StrategyTab.jsx` (6 fields), and
`src/components/QuickUpdate.jsx` (1 field rendered 11x) — 222 sites
total, spanning every file in the app that used the `.form-group`
markup pattern (`TaxEstateTab.jsx`, `RiskTab.jsx`, `DashboardTab.jsx`,
and `LedgerTab.jsx` don't use it at all, so weren't affected).

Fixed 2026-08-11 (changelog id 26): added `htmlFor`/`id` pairs linking
each visible label to its field, generated via a codemod for the ~208
straightforward one-field-per-name sites (deriving the id from the
field's `updateInput('key', ...)` call, its `inputs.key` value binding,
or its local `setXxx` setter name) plus manual fixes for the handful of
cases that needed care to avoid *introducing* a new collision instead of
fixing the old gap: `InterviewTab.jsx`'s generic `Field` wrapper (takes
its control as `children`, so it now generates the id itself via
`useId()` and clones it onto the child) and its per-heir loop (ids now
include the heir's own `id` so multiple heirs don't share one), and
`QuickUpdate.jsx`'s `Field` component (rendered many times per page, so
also switched to `useId()` rather than a fixed id). Covered by regression
tests confirming `getByLabelText()` resolves these fields -- including
the trickier Tooltip-wrapped, nested-outer-field, and multi-row cases --
in `src/__tests__/components/SettingsTab.test.jsx`,
`src/__tests__/components/InterviewTab.test.jsx`, and
`src/__tests__/components/StrategyTab.test.jsx`.

### Toggle switches: clickable label text disconnected from the checkbox

Every `<label className="custom-switch">` toggle across the app wrapped
only the checkbox and its visual slider `<span>` — the human-readable
question/label text was a separate sibling element, not connected to the
checkbox via `htmlFor`/`id` or `aria-labelledby`. Clicking the visible
text (what a sighted mouse user would naturally try, and what a screen
reader user relying on label association would expect to work) did
nothing; only the small switch control itself responded to clicks, and
screen readers announced the checkbox with no accessible name at all.

Confirmed across `src/components/tabs/LedgerTab.jsx` (1 toggle),
`src/components/tabs/InterviewTab.jsx` (its shared `ToggleRow` component,
covering every `Gate`/`InputToggle` across all ~15 Interview sections),
`src/components/tabs/SettingsTab.jsx` (39 toggles), `src/App.jsx` (3
toggles), `src/components/tabs/RiskTab.jsx` (2 toggles), and
`src/components/tabs/DashboardTab.jsx` (2 toggles) — 48 sites total.
`src/components/tabs/StrategyTab.jsx` has no toggle switches at all.

Fixed 2026-08-11 (changelog id 25): added `htmlFor`/`id` pairs linking
each visible label to its checkbox (using React's `useId()` in
multi-instance/loop contexts, or a plain static id in components that
render once per mount), with `aria-labelledby` used instead for the
couple of toggles whose visible text lives inside a heading (`<h3>`)
rather than a plain label. Covered by regression tests confirming
`getByLabelText()` now resolves these toggles in
`src/__tests__/components/InterviewTab.test.jsx`,
`src/__tests__/components/LedgerTab.test.jsx`,
`src/__tests__/components/RiskTab.test.jsx`,
`src/__tests__/components/SettingsTab.test.jsx`, and
`src/__tests__/components/DashboardTab.test.jsx`. The separate, larger-scale
plain-form-field label gap (see above) was fixed in a later pass.

### DashboardTab.jsx Plan Feedback action links landed on the wrong sub-tab

Follow-on to the crash fix below, found during the 2026-08-19 information
architecture review (see `IA_REVIEW.md`). That fix stopped the crash by
dropping the sub-tab half of each recommendation's `{tab, subTab}` target
and calling only `setActiveTab(rec.action.tab)` -- but dropping it was
itself wrong. `App.jsx` keys the tab panel wrapper on `activeTab`, forcing
a full remount on every navigation, so each tab's local sub-tab state reset
to its hardcoded default. The in-code comment claimed the user would land
"on whatever sub-tab it last had open"; in practice they always landed on
the first one.

Of the 11 recommendations, 5 name a non-default sub-tab and so went to the
wrong panel silently: the four targeting `settings/balances` (e.g. "Adjust
Retirement Allocations", which meant Plan Settings > Initial Balances,
~2,400 lines from where it actually landed) and the one targeting
`strategy/ssheatmap`. The other 5 "worked" only because they happened to
point at their tab's default.

Fixed 2026-08-19 (changelog id 57): `settingsSubTab`, `strategySubTab`,
`taxestateSubTab`, and `ledgerSubTab` are now lifted into
`SimulationContext` alongside `riskSubTab`, which was already there, and
the handler resolves the right setter through a `SUB_TAB_SETTERS` map. As
a side benefit sub-tab position now persists across navigation instead of
resetting on every tab change. `testUtils.jsx`'s harness supplies real
`useState` for all five (a static value plus a `vi.fn()` setter would have
left every tab stuck on its default and quietly invalidated any test that
clicks a sub-tab). Regression tests in
`src/__tests__/components/DashboardTab.test.jsx` cover both a default and a
non-default sub-tab target.

### DashboardTab.jsx Plan Feedback action links crashed the tab

Every Plan Feedback recommendation's action link whose target wasn't the
Risk tab called `setSettingsSubTab`/`setTaxestateSubTab`/
`setStrategySubTab`/`setLedgerSubTab` — none of which existed anywhere in
`DashboardTab.jsx`'s scope (each is local `useState` owned by its own tab
component, not shared context). The one exception (`setRiskSubTab`, for
the Risk-targeted recommendation) turned out to be broken too, for a
different reason: it genuinely exists on `SimulationContext` but was never
destructured into this file. Clicking almost any action link threw a
`ReferenceError` and crashed the whole Dashboard tab.

Fixed 2026-08-10 (changelog id 23): simplified the four broken cases to
just `setActiveTab(rec.action.tab)` (lands on the right tab, though not
the specific sub-tab, until those four states are lifted into context),
and destructured `setRiskSubTab` so that one case works fully. Covered by
regression tests in `src/__tests__/components/DashboardTab.test.jsx`.

### Test harness: `testUtils.jsx` default `taxVisualizerData` was `null`

Contradicted its own doc comment ("defaulted to empty arrays") and the
real `App.jsx` (whose `useMemo` always resolves to an array, falling back
to `[]`, never `null`). `TaxEstateTab.jsx` reads `taxVisualizerData[0]`
unconditionally on first render, so the stale default would crash any
component test rendering that tab without an explicit override.

Fixed 2026-08-10, alongside `src/__tests__/components/TaxEstateTab.test.jsx`.

### Test harness: `testUtils.jsx` defaulted `dieWithZeroResults`/`targetPortfolioResults` to `null`

Same class of bug as the `taxVisualizerData` one above. Both were grouped
in with the genuine Web-Worker-backed "tier 3" results (`optimizerResults`,
`ageFinderResults`, etc.) and defaulted to `null`, but in the real
`App.jsx` both are plain synchronous `useMemo`s over calculator.js's
`findDieWithZeroSpending`/`findTargetPortfolioSize` -- never null in
practice, with no loading guard anywhere that reads them.
`StrategyTab.jsx`'s default "Tax Optimizer Hub" sub-tab reads
`dieWithZeroResults.spending` and `targetPortfolioResults.targetPortfolio
.total` unconditionally on first render, so the stale `null` default would
have crashed any component test rendering that tab's default view without
an override.

Fixed 2026-08-11, alongside `src/__tests__/components/StrategyTab.test.jsx`,
by computing real values from those two calculator.js functions once (the
same way `baseProjection`/`baseKpis` already were) instead of defaulting to
`null`.

### RiskTab.jsx crashed when clicking a point on the stress-test chart

The "Lifetime Milestones (Under Stress)" chart's `onYearSelect` callback
(Historical Stress Tests sub-tab, Active Scenario view) called
`setWaterfallYear`/`setWaterfallPlaying`, neither of which existed
anywhere in `RiskTab.jsx`'s scope -- they're `DashboardTab.jsx`'s own
local `useState`, not shared context, and this file has no Cash Flow
Waterfall panel to react to a selected year at all. Clicking any point on
that chart threw a `ReferenceError` and crashed the whole Risk tab, the
same failure class as the DashboardTab Plan Feedback bug below.

Fixed 2026-08-11 (changelog id 24), alongside
`src/__tests__/components/RiskTab.test.jsx`, by removing the dead callback
entirely rather than wiring up unused local state.
