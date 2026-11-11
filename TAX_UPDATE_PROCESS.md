# Annual Tax-Year Update Process

Every dollar figure and threshold the app uses for federal and state tax, Medicare, Social Security and the ACA is a published figure for a specific year, held in `src/calculator.js` (and, for the 35 rule-driven states, `src/config/stateTaxRules.js`). The IRS, CMS, SSA, HHS and each state publish new figures every year, mostly between July and January. This document is the checklist for taking them in.

> **Keep `TAX_RULES_SPEC.md` in step.** That document restates every rule
> and figure below in plain language for professional review. When a figure
> here changes, change it there too (Sections 2–5 carry the same tables).

## The model: add a table year, never overwrite

The federal income-tax figures are kept **one table per tax year**, the way `SS_ANNOUNCED` and `FPL_TABLES` already were:

- `FEDERAL_TAX_TABLES` in `src/calculator.js` is keyed by tax year (2026 and 2027 today). A projection year Y reads the **newest table at or before Y**, scaled by the plan's Tax Bracket Inflation Rate from that table's year to Y. A published year is therefore exact; a year after the newest table is that table carried forward. A year before the oldest table reads the oldest table carried back.
- The carry is always the path's own bracket factor at Y over its factor at the table's year (`carryEveryTable` in `runProjection`), the `TAX_YEAR` table included. So every published year is exact in every mode (deterministic, a plan starting before or after `TAX_YEAR`, a Monte Carlo trial that samples inflation, a historical replay), and only inflation after it moves the figures. `federalTaxTables.test.js` checks a plan starting the year before `TAX_YEAR`, which is what every saved plan becomes on January 1.
- **A new year's figures are ADDED as a new key. The previous year's entry is never edited.** A plan still sitting in the earlier year keeps pricing that year on its own published figures (a 2026 plan after the January switch still sees the real 2026 brackets for 2026, not 2027's carried back).
- Every federal helper (`calculateTaxes`, `calculateCapitalGainsTaxes`, `calculateNetInvestmentIncomeTax`, `calculateAMT`, `getTaxBracketLimit`, `getBracketFilling`, `additionalStandardDeductionAged`, `calculateFederalEstateTax`) takes a *federal tax context* (`federalTaxContext(year, factor, factorSince, carryEveryTable)`) where it used to take a bare factor, and still takes the bare factor, which means "the `TAX_YEAR` table times this factor"; `bracketsFor(status)` without a table is the `TAX_YEAR` table too. Projection rows carry `federalTaxYear` and `federalTaxFactor`; anything that re-prices a row through the helpers passes `federalTaxContextOfRow(row)`, never the row's `taxBracketInflationFactor` alone (that factor is from `TAX_YEAR`, so it would price a 2028 row on the 2026 table).

Figures **not yet keyed by year** are still single `_2026` constants: the IRMAA thresholds and premiums, the Part D base premium and surcharges, the 401(k)/IRA/Roth/HSA/QCD limits, the annual gift exclusion, the ACA applicable-percentage and benchmark-premium tables. These are the `TAX_YEAR`'s figures, carried to other years by a factor measured from `TAX_YEAR`; they change only at the January switch below. When one of them is next touched, prefer moving it into a year-keyed table rather than renaming the constant.

Unindexed statutory figures are in no table and never move: the NIIT thresholds, the Social Security provisional-income thresholds, the Additional Medicare Tax thresholds, the $6,000 senior deduction and its phase-out (2025–2028, `SENIOR_BONUS_LAST_YEAR`), the $1,000 HSA catch-up, the $3,000 capital-loss offset.

## The calendar

| When | What is published | What to do |
|---|---|---|
| Late July | CMS Part D national average bid (base beneficiary premium) | Note it for the January switch (`PART_D_BASE_PREMIUM`). |
| October | SSA COLA, wage base, earnings-test amounts | Add `SS_ANNOUNCED[next year]` (#4). Live at once. |
| October/November | IRS inflation-adjustment Revenue Procedure | Add `FEDERAL_TAX_TABLES[next year]` (#1). Live at once. |
| November | IRS retirement-plan limits notice; CMS Part B and IRMAA | Note them for the January switch (#5, #6). |
| Autumn | Rev. Proc. for ACA applicable percentages; KFF benchmark premiums | Note them for the January switch (#7). |
| **December** | — | The year-end source review (below), and prepare the January switch on a branch. |
| **January 1** | — | The `TAX_YEAR` switch (#0). |
| January | HHS poverty guidelines; California FTB schedules (late December) | Add `FPL_TABLES[this year]` (#8); refresh CA (#9). |
| Spring | Social Security Trustees Report; SSA period life table | #4 trust-fund default; #12 life table. |

## 0. The January 1 `TAX_YEAR` switch

`TAX_YEAR` (top of `src/calculator.js`) is the vintage of every figure that is not yet year-keyed, and the year a brand-new plan starts in (`DEFAULT_INPUTS.planYear`). It moves on **January 1**, not earlier: a plan opened in December should still start in the current year, and until the switch the non-keyed figures are the current year's.

`inputs.planYear` is separate and per plan (Plan Settings, Plan Year). Bumping `TAX_YEAR` does not move any saved plan's `planYear`. `runProjection`, `runMonteCarlo`, `findOptimalRetirementAge`, `computeStressComparisonData` and `computeAgeFinderResultsReal` read `inputs.planYear` for where a projection starts. The legacy `currentAge` migration in `sanitizeInputs` and the print view's demographics still read `TAX_YEAR` (a legacy plan saved with an age and no birth year becomes a year younger after the switch; known, audit P3).

The switch, in one commit:

1. `TAX_YEAR = <new year>`. `FEDERAL_TAX_TABLES[TAX_YEAR]` must already exist (the test in `federalTaxTables.test.js` fails otherwise); nothing in the federal income-tax tables changes.
2. Replace the non-keyed `_2026` figures with the new year's, renaming the suffix: IRMAA (#5), Part D (#5), contribution limits (#6), HSA (#6), QCD (#6), the annual gift exclusion (#3), the ACA tables (#7). Only figures that are **published** go in; one that is not yet out keeps the old figure and is carried by the factor, and is listed in the commit message.
3. **The copy.** The help text already says later published years are used as published and grow from the newest. But the Guide, the Input Dictionary, `src/config/howFigured.js`, `src/utils/copyFigures.js` and `LifeEventsSection.jsx` print the named 2026 constants (`DEDUCTION_MFJ`, `BRACKETS_*`, `AMT_EXEMPTION_*_2026`, `ADDITIONAL_DEDUCTION_AGED_*_2026`, `FEDERAL_ESTATE_EXEMPTION_2026`, `GST_EXEMPTION_2026`, `ANNUAL_GIFT_EXCLUSION_2026`, the capital-gains figures pinned in `copyFigures.test.js` / `howFigured.test.js`) next to the label `{TAX_YEAR}`. After the switch the label says the new year, so every such site must read the new year's figure: either point it at `FEDERAL_TAX_TABLES[TAX_YEAR]` or update the constant it reads. Search for `_2026` and `{TAX_YEAR}` together.
4. Expect goldens to move (every plan's first year now reads the new year's non-keyed figures exactly). Explain each one in the commit message, as for any figure change.
5. Add the release note (`src/config/changelog.js`).

## 1. Federal income tax: `FEDERAL_TAX_TABLES` (Revenue Procedure, October/November)

- **Source:** the IRS inflation-adjustment Revenue Procedure for the new year (irs.gov/newsroom, "IRS releases tax inflation adjustments for tax year `<year>`"; the PDF is irs.gov/pub/irs-drop/rp-`<yy>`-`<nn>`.pdf). Read the Rev. Proc. itself, not a summary.
- **What to do:** add `FEDERAL_TAX_TABLES[<year>]: buildFederalTaxTable({...})` with every field below, and the citation in a comment. Do not edit an existing year.
  - `brackets` for **MFJ, Single, MFS and HOH**: the top of each band, 10% to 35%, then `Infinity` at 37%. MFS is half of MFJ (Single's figures except the 35% ceiling); read the MFS schedule from the Rev. Proc. rather than halving. HOH has its own schedule.
  - `standardDeduction` for MFJ (also QSS), Single, MFS, HOH.
  - `agedAddOn`: the additional amount for the aged, `married` (MFJ, MFS, QSS) and `unmarried` (Single, HOH). The blind amount is the same and is not modelled.
  - `capGains.zeroTop` (top of the 0% band) and `capGains.fifteenTop` (top of the 15% band) for all four statuses. MFS's 15% ceiling is half of MFJ's, not Single's.
  - `amt.exemption` and `amt.phaseout` for MFJ, Single (also HOH) and **MFS**, and `amt.breakpoint.joint` / `.MFS` (the §55(b)(1) 26%/28% line; MFS is half). `AMT_PHASEOUT_RATE` (0.5) is statutory.
  - `estate.basicExclusion` and `estate.gstExemption` (equal by §2631(c)).
- The pre-TCJA stress schedule is derived per table (`buildFederalTaxTable`); nothing to enter.
- **Pin it:** add a test in `src/__tests__/federalTaxTables.test.js` that states every figure of the new table, with the Rev. Proc. cited, like the 2027 one.
- **Goldens:** adding a table moves every plan's later years (the published figures differ from 2.5% indexing). Run the suite, and for each moved golden say old → new and why in the commit message. The Learn lessons (`learnLessonFigures.test.js`) quote the Parkers' ledger; a moved figure there means the lesson text, its screenshot and any recorded narration need updating (the test says which). The demo backup fixture is regenerated with `npx vite-node scripts/generateDemoBackup.mjs` (`vite-node` is not a dependency, so `npx` downloads it on first use); it is also the video series' recording fixture.
- **Not in the table, deliberately:** the senior deduction (`SENIOR_BONUS_*`, statutory and unindexed; if the 2025–2028 window is extended, bump `SENIOR_BONUS_LAST_YEAR`; in the January 2029 pass confirm it expired and drop it from the Guide and Input Dictionary), the NIIT thresholds.

## 2. Downstream of the federal tables (no separate edit)

The Tax & Estate bracket chart (`src/utils/taxVisualizerData.js`) and the Filing Detail bars (`TaxEstateTab.jsx`) draw from each row's `federalTaxYear` table. The heirs' brackets and the estate and GST exemptions read the estate year's table (`calculateHeirEstateTax`). Arizona's federal-deduction-without-the-65+-add-on reads the year's table through the state context (`calculateStateTaxes` forwards `federalTax` to the state rules). Connecticut's estate exemption is the federal basic exclusion by statute and reads the estate year's table (`followsFederalExclusion`). With estate indexing off, the estate year reads the newest published table as published, uncarried.

## 3. Federal estate, gift and GST

- **Estate basic exclusion and GST exemption:** in `FEDERAL_TAX_TABLES` (#1). `FEDERAL_ESTATE_EXEMPTION_2026` and `GST_EXEMPTION_2026` are now read from the 2026 table and exist for the copy.
- **Annual gift exclusion:** `ANNUAL_GIFT_EXCLUSION_2026`, not year-keyed (the gifting model grows it from the gifting start at the plan's inflation, not by calendar year). Same Rev. Proc. Update at the January switch; indexed in $1,000 steps (§2503(b)(2)).
- **Do not touch:** `FEDERAL_ESTATE_TOP_RATE` / `GST_RATE` (40%, statutory), `FEDERAL_2011_CREDIT_TABLE` and `ADJUSTED_TAXABLE_ESTATE_OFFSET` (the frozen pre-2005 §2011 table some states still key on).

## 4. Social Security: `SS_ANNOUNCED` (SSA, October) and the trust-fund default (spring)

- **`SS_ANNOUNCED`:** keyed by year: `{ cola, wageBase, earningsTestUnderFra, earningsTestFraYear }`. Add the new year's key from SSA's COLA fact sheet (ssa.gov/news/en/cola/factsheets/`<year>`.html) as soon as it is published; never edit a published year. Years after the newest are carried at the plan's rates. A plan on the default COLA uses the announced COLA for that year (changelog 410). The $1-per-$2 / $1-per-$3 earnings-test rates are statutory.
- **Trust-fund depletion default:** `ssDepletionYear` / `ssCutPercent` in `DEFAULT_INPUTS` (and the fallback values and tooltip in `LegislativeRisksSection.jsx`, the Input Dictionary row, and the `ssa-trustees-<year>` entry in `src/config/sources.js`). Refresh from the Trustees Report each spring (ssa.gov/oact/TR/`<year>`/II_A_highlights.html): the OASI depletion year and 100 minus the percent payable. Saved plans keep their own values.

## 5. Medicare Part B, Part D and IRMAA (CMS, July and November; at the January switch)

- **Constants:** `IRMAA_STANDARD_PREMIUM`, `IRMAA_TIER_PREMIUMS`, `IRMAA_THRESHOLDS_MFJ`, `IRMAA_THRESHOLDS_SINGLE`, `IRMAA_THRESHOLDS_MFS_TOGETHER`, `PART_D_BASE_PREMIUM`, `PART_D_IRMAA_SURCHARGES`, `IRMAA_TOP_TIER_FREEZE_THROUGH_YEAR`. Not year-keyed: they are `TAX_YEAR`'s, so they change at the January switch.
- **Source:** CMS "Medicare Parts A & B premiums and deductibles" fact sheet (mid-November); the Part D base beneficiary premium from CMS's late-July Part D bid release; the Part D surcharges from SSA POMS.
- **What to do:** the standard premium, the five surcharge tiers, the five MAGI thresholds for both statuses, the MFS-together line, Part D. The top tier ($500,000 / $750,000) is frozen in statute through 2027 and indexes from 2028 on an August 2026 base. `irmaaTopTierFactor` measures that from the threshold table's own year (`TAX_YEAR`); once `TAX_YEAR` is 2028 or later the table's top figure is CMS's indexed figure and moves with the other tiers, so from the 2028 switch take the top figures from CMS. `IRMAA_THRESHOLDS_MFS_TOGETHER` carries the lower MFS-together line and the top; the engine derives the top as $500,000 (indexed) less the lower line, so check CMS's printed MFS figures equal that identity.
- **Downstream:** the bracket chart's IRMAA lines derive from these.

## 6. Contribution, HSA and QCD limits (IRS, November and May; at the January switch)

These index at the plan's **general inflation rate** (`statutoryInflFactor`), not the bracket rate. Not year-keyed.

- **401(k)/IRA:** `ELECTIVE_DEFERRAL_LIMIT_2026`, `CATCHUP_50_2026`, `CATCHUP_60_63_2026`, `IRA_LIMIT_2026`, `IRA_CATCHUP_50_2026`, `ANNUAL_ADDITIONS_LIMIT_2026` (§415(c)), `MANDATORY_ROTH_CATCHUP_WAGE_THRESHOLD_2026`, `ROTH_IRA_PHASEOUT_MFJ` / `ROTH_IRA_PHASEOUT_SINGLE` (`ROTH_IRA_PHASEOUT_MFS_TOGETHER` is the statutory $0–$10,000). Source: the IRS retirement-plan limits notice (irs.gov/newsroom, "401(k) limit increases ... `<year>`"). The age 60–63 catch-up *replaces* the 50+ one (`getElectiveDeferralLimit`).
- **HSA:** `HSA_LIMIT_SELF_2026`, `HSA_LIMIT_FAMILY_2026` (HSA Rev. Proc., usually May). `HSA_CATCHUP_55_2026` ($1,000) is statutory.
- **QCD:** `QCD_LIMIT_2026`, from the retirement-plan limits notice (not the main Rev. Proc.). Per person.
- Projections circulating before the notice (Milliman and the like) are not figures; wait for the IRS.

## 7. ACA tables (at the January switch, except the poverty line)

- **`ACA_APPLICABLE_PCT_2026`:** the §36B applicable-percentage bands (Rev. Proc. for the coverage year, e.g. Rev. Proc. 2026-26 for 2027). Later years currently reuse it (audit P2: the 2027 top band moved from 9.96% to 10.22%); a year-keyed table is the better shape.
- **`ACA_BENCHMARK_40_MONTHLY_2026`:** the state benchmark (second-lowest silver) premium at age 40 (KFF, autumn). Carried by the medical inflation factor.
- **`ACA_NON_EXPANSION_STATES`:** healthinsurance.org or KFF's Medicaid expansion tracker. **This can change at any time of year** (a legislature or ballot measure); check whenever expansion news appears.

## 8. Federal poverty level: `FPL_TABLES` (HHS, January)

- **Constants:** `FPL_TABLES` (keyed by the year the guideline is published: `[1-person base, per additional person]`, 48 states + DC; Alaska and Hawaii are not modelled). `FPL_LATEST_TABLE_YEAR` follows the newest key.
- **Add a table year, never overwrite.** Coverage in year Y is measured against the guideline published in Y − 1 (45 CFR 155.300), so the January 2027 guideline governs **2028** coverage. Overwriting the 2026 entry would price 2027 coverage on the wrong year's line (the error changelog 409 fixed).
- **Source:** aspe.hhs.gov poverty guidelines (the page may refuse automated clients; open it in a browser).
- `getFederalPovertyLevel(size)` with no year answers for `TAX_YEAR` coverage (the help copy's cliff figures), so those move at the switch.

## 9. State income tax brackets (CA, NY, VA)

- **Constants:** `BRACKETS_CA_SINGLE`, `BRACKETS_CA_MFJ`, `CA_STD_DEDUCTION_SINGLE`, `CA_STD_DEDUCTION_MFJ`, `CA_EXEMPTION_CREDIT` (+ `CA_EXEMPTION_PHASEOUT`), `CA_MILITARY_EXCLUSION_*`, `BRACKETS_NY_*` (2026 / `_2027` / `_2033` eras), `NY_RECAPTURE_*` (per era), `NY_TAX_ERAS`, `NY_STD_DEDUCTION_SINGLE`, `NY_STD_DEDUCTION_MFJ`, `BRACKETS_NYC_*`, `CA_BHS_TAX_THRESHOLD`, `BRACKETS_VA`, `VA_STD_DEDUCTION_*`, `VA_PERSONAL_EXEMPTION`, `VA_AGE_EXEMPTION`, `VA_AGE_DEDUCTION` (+ thresholds), `VA_MILITARY_SUBTRACTION_CAP`
- **California standard deduction** is CCPI-indexed like the brackets: refresh it from the same 540 booklet each January. **New York's** is statutory (Tax Law §614) and moves only by legislation.
- **Status:** both verified 2026-08-20 against primary sources. These were previously marked "estimated" and both were badly wrong &mdash; see the Fixed section of `KNOWN_ISSUES.md`. **The two states need completely different treatment, so read both bullets.**

### California &mdash; refresh EVERY January (state tables, not year-keyed)

- **Source:** `https://www.ftb.ca.gov/forms/<year>/<year>-540-tax-rate-schedules.pdf`. Schedule X is "Single or Married/RDP Filing Separately"; Schedule Y is joint/surviving spouse. Schedule Z is head of household, which this app does not model.
- **Why annually:** California indexes every threshold to the California CPI (June-to-June) each year. A table left alone drifts about 2-4% per threshold per year, always overstating tax.
- **Timing trap:** FTB publishes in **late December**, not with the federal figures in October. If the current year's PDF 404s, that is expected &mdash; use last year's, which is what FTB's own Form 540-ES instructs. Currently on the **2025** schedule for exactly this reason.
- **Also check:** the 1% Behavioral Health Services Tax threshold (`CA_BHS_TAX_THRESHOLD`). It has been a flat $1,000,000 since 2005 and is believed not indexed, but confirm it has not been changed by legislation. It is the same for every filing status &mdash; do not halve it for MFS. The $500,000 MFS figure in FTB guidance belongs to the estimated-tax safe harbour, a different rule.
- **Also refresh with the brackets (both CPI-indexed, added 2026-08-23):** the exemption credit amount (`CA_EXEMPTION_CREDIT`, $153 for 2025; dependents' $475 is unmodelled) and its phase-out thresholds ($252,203 single / $504,411 joint for 2025) &mdash; from the 540 instructions' AGI Limitation Worksheet.
- **One-time check in the January 2030 pass:** the $20,000 military retirement exclusion (R&TC ss 17132.9/17132.10) sunsets after tax year 2029; `CA_MILITARY_EXCLUSION_LAST_YEAR` enforces it. If the legislature extends it, bump that constant; if not, nothing to do &mdash; and remove this line.

### New York &mdash; do NOT index, but watch for step changes

- **Source:** NY Tax Law &sect; 601 (nysenate.gov/legislation/laws/TAX/601). &sect; 601(a)(1) is joint, &sect; 601(c)(1) is single **and married filing separately** &mdash; one schedule covers both, confirmed from the subsection heading.
- **Why NOT annually:** NY stopped indexing after tax year 2017 (&sect; 601-a). The thresholds are fixed dollar amounts in statute. **Never apply a CPI factor to them.**
- **What to watch instead:** &sect; 601 already contains several dated schedules, and since 2026-08-23 the app models the enacted eras itself (`NY_TAX_ERAS`: 2026 / 2027-2032 / 2033+, each with its coupled recapture table). The remaining job is watching for NEW legislation that rewrites those scheduled futures &mdash; re-read &sect; 601 after any state budget; the FY2026 budget cut the middle-class rates, and nothing stops a future one from rewriting 2027+ again.
- **Pending verification (2026-08-23):** the (d-6)/(d-7) recapture integers were transcribed from the FY2026 budget bill print because the consolidated-law page truncates before them (they re-derive exactly from the enacted rate schedules). When DTF publishes the 2027 IT-2105-I (early 2027), diff its worksheets against `NY_RECAPTURE_SINGLE_2027` / `NY_RECAPTURE_MFJ_2027` &mdash; individual rows may differ by a dollar of rounding, as (d-5)'s did ($567 printed where the formula says $568).
- **New York City (added 2026-08-23):** `BRACKETS_NYC_SINGLE` / `BRACKETS_NYC_MFJ` are the combined &sect; 1304 + &sect; 1304-B resident rates from the IT-2105-I's NYC schedule &mdash; statutory dollar thresholds, unchanged since 2015, NOT indexed. Only legislation moves them; check the new year's IT-2105-I in the same pass.
- **Verification method that actually works:** &sect; 601 publishes a cumulative base dollar amount at each threshold. Compute the app's tax at each threshold and compare against those bases &mdash; agreement within $1 (NY's own rounding) means the whole schedule is right. The `calculator.test.js` blocks for both states do this. Comparing against a duplicated copy of the table proves nothing; that is precisely how the previous wrong values survived.
- **The recapture table is COUPLED to the rate schedule &mdash; move them together.** `NY_RECAPTURE_SINGLE` / `NY_RECAPTURE_MFJ` carry the &sect; 601(d-5) tax table benefit recapture (verified 2026-08-23). Each rate-schedule subsection has a matching recapture subsection ((d-4) for 2025, (d-5) for 2026...), and the FY2026 rate cuts changed the recapture dollars &mdash; reading one year's recapture against another year's rates is exactly the reconciliation failure that delayed this feature. Two checks, both cheap: (1) rows must chain (each row's base = previous base + incremental); (2) each row's full recapture must equal &Sigma; over lower brackets of (row rate &minus; lower rate) &times; lower width, within ~$1.25. Cross-check against the current year's IT-2105-I tax computation worksheets (tax.ny.gov/pdf/current_forms/it/it2105i.pdf), which print the same integers. The `calculator.test.js` recapture block encodes the flat identities (9.65% &times; $5M = $482,500).

### Virginia — do NOT index, but confirm the standard deduction each January

- **Source:** Va. Code § 58.1-320 (rates/brackets), § 58.1-322.03 (standard deduction, age deduction, exemptions) at law.lis.virginia.gov, and tax.virginia.gov's Deductions page and Military Benefits Subtraction FAQ. Verified 2026-08-31.
- **Why NOT annually:** nothing in Virginia's schedule is CPI-indexed — the $3k/$5k/$17k bracket thresholds have been unchanged since 1990, and the exemptions ($930 / $800), age deduction ($12,000, $50k/$75k thresholds), and $40,000 military cap are fixed statutory dollars. **Never apply a CPI factor.** Only legislation moves any of them.
- **The standard deduction now steps up by law:** `VA_STD_DEDUCTION_*` are $8,750 single / $17,500 MFJ, which the engine applies to every year. The 2026 General Assembly raised them to $9,200 / $18,400 from tax year 2027, with further steps in 2028 and 2029 (tax.virginia.gov, "New Virginia Tax Laws"; audit C4, 2026-11-09). **Open item:** the constant needs a year schedule, and the 2028 and 2029 amounts need reading from the statute (Va. Code § 58.1-322.03) before it can be written. Until then a Virginia couple's taxable income is overstated by $900 in 2027 (about $52 of tax). Each January, confirm the current amounts on tax.virginia.gov's Deductions page.
- **Also check:** rate-reform bills. Virginia's legislature debates lowering the 5.75% top rate or raising the $17,000 threshold most sessions; none had passed as of the 2026-08-31 verification.

## 10. Illinois, Pennsylvania and Colorado

These three are inline in `calculateStateTaxes` / nearby helpers rather than tables, which is exactly why they are easy to miss.

- **Illinois:** the 4.95% rate (inline, `ilTaxable * 0.0495`); `IL_EXEMPTION_ALLOWANCE` (indexed each year — IDOR announces it in an informational bulletin, e.g. FY 2026-15 set $2,925 for 2026), `IL_EXEMPTION_AGE_65` ($1,000, statutory), `IL_EXEMPTION_AGI_LIMIT_SINGLE` / `_MFJ` ($250,000 / $500,000, statutory). Source: tax.illinois.gov bulletins and the IL-1040 instructions, Step 4.
- **Pennsylvania:** the 3.07% rate (inline). Statutory; changes only by legislation. The compensation rules (retirement distributions exempt after retirement age, employee 401(k) deferrals taxable) are cited in `src/config/sources.js`.
- **Colorado:** the 4.4% rate (inline; TABOR can cut it for a single year — do not copy a one-year TABOR rate forward), the pension/annuity caps ($24,000 at 65+, $20,000 at 55–64), the 55–64 Social Security AGI limits ($75,000 / $95,000), and the under-55 military $15,000 (through 2028). Source: tax.colorado.gov "Social Security, Pensions, and Annuities" and the Individual Income Tax Guide. Remember the full SS subtraction uses up the same cap.

## 11. State estate & inheritance tax table

- **Constant:** `STATE_ESTATE_INHERITANCE_TAX_TABLE`
- **Source:** each jurisdiction's own department of revenue or statute. **Do
  not use an aggregated summary as the source of record.** The 2026 audit
  found 6 of 13 estate exemptions wrong, all traceable to a single
  aggregator's table that had gone stale; the rate/exemption pairs looked
  internally plausible, which is exactly why nothing caught them. An
  aggregator is fine as a *starting list of which states levy the tax* — it
  is not fine as the figure you ship.
- **Which figures move every January (indexed):**
  - **CT** — CGS §12-391 statutorily ties the exemption to the federal basic
    exclusion amount, so it moves whenever the federal BEA does (2026:
    $15,000,000).
  - **ME** — 36 MRS §4102(5), indexed by Maine Revenue Services.
  - **NY** — Tax Law §952(c), indexed basic exclusion amount.
  - **RI** — RIGL §44-22-1.1 credit amount, indexed by the Division of Taxation.
  - **DC** — DC Code §47-3701(14), indexed by the Office of Tax and Revenue.
- **Which figures only move by legislation (fixed):** HI, IL, MD, MA, MN, OR,
  VT, WA, and every inheritance-tax exemption. These can change *off* the
  normal January cycle, so also watch mid-year session outcomes.
- **Watch for rates that expire.** Washington's 35% top rate was temporary
  (ESSB 5813's table, limited by ESB 6347 to deaths July 2025 – June 2026);
  the 10%–20% table returned on July 1, 2026. The engine walks that table
  (`WA_ESTATE_SCHEDULE`) on the excess over the $3,000,000 exclusion. A rate with a sunset date is not a rate you can copy forward
  — check whether the schedule you are reading is the current one or the one
  that just lapsed.
- **Watch for states entering or leaving.** Iowa eliminated its inheritance
  tax effective 2025; NJ and DE previously phased out their estate taxes.
  For 2026 the list is unchanged (Oregon SB 1511 failed; Maryland SB 211 died
  in committee). If the list changes, update the two membership assertions in
  `calculator.test.js` alongside the table.
- **How to verify:** for each jurisdiction, open the revenue department's own
  page or the statute, and read the exemption and top rate directly off it.
  Then update the value-pinning test in `src/__tests__/calculator.test.js`
  ("pins each estate-tax jurisdiction to its verified 2026 exemption and top
  rate"), including its per-line citation comment. That test cannot catch a
  wrong figure on its own — it exists so that changing a figure forces you to
  restate where it came from.
- **Graduated schedules:** `NY_ESTATE_SCHEDULE`, `MN_ESTATE_SCHEDULE`,
  `OR_ESTATE_SCHEDULE` and the other graduated tables near
  `STATE_ESTATE_INHERITANCE_TAX_TABLE` carry each state's own progressive
  schedule (and New York's 100%–105% credit cliff). When a state changes a
  rate band, edit its schedule, not just the table's top rate.

## 11b. Inheritance tax schedules (KY, MD, NE, NJ, PA)

- **Constant:** `STATE_INHERITANCE_SCHEDULES`, with the user-facing options in
  `HEIR_RELATIONSHIPS`. Separate from the estate table because inheritance tax
  depends on *who inherits*, which a single exemption/rate pair cannot express.
- **Source:** the state statute, or the revenue department's own form/booklet.
  KRS 140.070 and 140.080; Md. Tax-Gen. §§7-203 and 7-204; Neb. Rev. Stat.
  §§77-2004/2005/2006; N.J.S.A. 54:34-2 plus the Division of Taxation's class
  definitions; 72 P.S. §9116 as stated on PA REV-584 and the REV-1500
  computation lines.
- **These change rarely, but they DO change**, and not on the January cycle —
  they move when a legislature acts. Two live examples: Kentucky moved nieces
  and nephews into its exempt class effective for 2026 deaths (2026 Ky. Acts
  ch. 198 §40), and Nebraska's LB 310 rewrote all three of its rates and
  exemptions in a phase-in that completed for 2023 deaths.
- **Two specific traps, both of which produce a wrong number from a correct
  source:**
  1. **Statutes print superseded figures alongside current ones**, keyed to
     the decedent's date of death. Nebraska's sections still carry the
     pre-2023 rates. Read the date-of-death qualifier on every line.
  2. **A revenue department's forms can lag its own statute.** Kentucky's
     inheritance tax forms and guide still describe nieces and nephews as
     Class B. When the two disagree, the statute governs — and note the
     discrepancy in a comment so the next person doesn't "fix" it back.
- **How to verify a bracket schedule:** most of these states publish the
  *cumulative* tax at each bracket boundary (Kentucky: Class B "$22,960 + 16%
  of amount over $200,000"). Compute the schedule and check it hits those
  published totals exactly. That is a genuine independent check; comparing the
  code's brackets against a second copy of the same brackets is not, and is
  what let the NY and CA bracket bugs survive for months.
- **Structure to preserve when editing:** bands are measured on the **gross**
  bequest with any exemption written as a leading 0% band, because that is how
  the statutes are drafted and it is what reproduces the published cumulative
  figures. A de minimis threshold is a **cliff** and lives in a separate key —
  `exemptAtOrBelow` (MD: exempt *at* $1,000) or `exemptBelow` (NJ: taxable
  *at* $500). Do not merge those two keys; the states disagree about which
  side of the line the threshold itself falls on.
- **Known simplifications:** aunts, uncles and cousins are folded into the
  "Anyone else" option, which over-states the tax for them in KY and NE;
  Nebraska's under-22 exemption and Pennsylvania's 0% rate for a parent
  inheriting from a child aged 21 or under are not modelled (no age is
  collected for heirs or for the decedent at death).

## User-facing source links

`src/config/sources.js` carries the first-party URL for each rule the app
applies, rendered as "Where these figures come from" in the Input
Dictionary. It is the user-facing counterpart to this file: this document
says how *we* update a figure; that one says where a *user* can go and
check it.

Two rules for it, enforced by `src/__tests__/sources.test.js`: links go to
the agency that sets the rule (irs.gov, ssa.gov, medicare.gov) and never to
a summary or explainer, and every URL is fetched and confirmed before being
added. Anything not yet verified belongs in that file's `UNCITED` list,
which is rendered too — six of a dozen figures being cited would otherwise
read as complete coverage.

When you update a figure below, check whether its source link still
resolves and still says what it is cited for, and move an item out of
`UNCITED` if you verified it along the way.

## Year-end source review (every December)

An internal job for the maintainers, not a user feature. Help → **How the
numbers are figured** (`src/config/howFigured.js`) explains each rule in
plain language and links every one to its official page in
`src/config/sources.js`, with the date each page was last read. Those
links rot and those pages change, so once a year, in December, before the
January figure update above:

1. **Run the link check:** `npm run check:sources > source-check.md`
   (`scripts/checkSources.mjs`; behind a proxy add `NODE_USE_ENV_PROXY=1`).
   It fetches every source in turn and reports the HTTP status, any
   redirect, whether the page still contains each phrase in the source's
   `expect` list, and any `verified` date more than 12 months old. It lists
   which How-figured cards cite each source. It needs the network, so it is
   never part of the test suite. Some agencies refuse automated clients
   (the ASPE poverty-guidelines page did, and irs.gov can); a refused page
   is not a dead one, so open it in a browser before replacing it.
2. **For each flagged or changed source:** open the page and read it.
   If it moved, update `url` to the new official page (never to a summary
   or a news story). If the figures changed, update `note` and `expect`.
   Set `verified` to the day you read it, and start the note "Fetched and
   confirmed YYYY-MM-DD" with the same date (`sources.test.js` checks the
   two agree).
3. **Look for new figures and new rules.** Read, in this order:
   - the IRS newsroom (irs.gov/newsroom) for any new law or relief;
   - the annual inflation-adjustment Revenue Procedure (usually October or
     November) — brackets, standard deduction, capital gains, AMT, gift
     exclusion, estate and GST exemption;
   - the IRS retirement-plan limits notice (usually early November) —
     401(k), catch-ups, IRA, QCD, Roth IRA phase-outs, the Roth catch-up
     wage threshold;
   - the Rev. Proc. for the ACA applicable percentages and KFF's benchmark
     premiums (#7);
   - the HSA Revenue Procedure (usually May);
   - SSA's COLA and wage-base fact sheet (October) — wage base, earnings
     test amounts;
   - the CMS Part B and IRMAA announcement (usually November) and the Part D
     base premium (usually late July);
   - the Social Security Trustees Report (spring) — depletion year and
     payable percentage;
   - **IRS Publication 590-A (and 590-B):** the app cites the edition
     "for use in preparing" last year's returns for the IRA *rules*
     (`ira-phaseouts`, `inherited-ira`); the new year's dollar figures come
     from the retirement-plan limits notice above (currently Notice
     2025-67). When the IRS posts the new edition (usually January to
     March), swap it in: re-read the page, update the edition named in the
     source's `label`, `publisher` and `note`, re-check the `expect`
     phrases, and bump `verified`. If a 590-A edition still says the older
     year, keep the notice cited next to it on every card that quotes a
     figure (the Contribution limits card does);
   - each modeled state's new-year figures: California, New York (and New
     York City, Yonkers), Illinois, Colorado, Pennsylvania, Virginia,
     Washington (the capital gains standard deduction dor.wa.gov publishes
     each fall -- `WA_CAPITAL_GAINS_STD_DEDUCTION`, and from 2029 the income
     tax's biennial deduction, `WA_INCOME_TAX_STD_DEDUCTION`), and the
     estate and inheritance states in #11 and #11b;
   - any new federal law (congress.gov) that adds, ends or changes a rule the
     app models, such as the temporary senior deduction.
4. **Then follow the steps above** for anything that moved: add the
   published year-keyed tables now (#1, #4), and prepare the non-keyed
   figures and the copy for the January switch (#0) on a branch. Keep
   `TAX_RULES_SPEC.md` in step.
5. **Update `src/config/howFigured.js`:** the text of any card whose rule
   changed, `figuresYear`, `simplifies`, and a new card for any new rule
   (with its source added to `sources.js` first, fetched and read).
   Dollar figures come from the engine through `src/utils/copyFigures.js`;
   a figure the engine keeps inline is pinned in `howFigured.test.js`, which
   fails until the text and the engine agree.
6. **Bump the verified dates** of every source you read, trim `UNCITED` for
   anything you cited along the way, and **add a release note** (a new
   entry at the top of `src/config/changelog.js`) saying in plain words which
   figures moved.

## 12. SSA period life table (`src/config/lifeTable.js`)

Not a tax figure, but it ages the same way. Each spring's Trustees Report
carries a new period life table (2026's carries 2023 rates). To refresh:
replace `MALE_QX` / `FEMALE_QX` and `LIFE_TABLE_VINTAGE` from
https://www.ssa.gov/oact/STATS/table4c6.html, and update
`PUBLISHED_CHECKPOINTS` (number of lives and life expectancy at 0, 65 and
80, both sexes) from the same page. `lifeTable.test.js` then re-derives the
lives column and the expectancies from the new rates and fails on any
transcription slip. Nothing else in the app carries a copy.

## 13. Other yearly data files

- **`src/config/historicalReturns.js`:** append the just-finished calendar year's row (`[year, S&P 500 total return %, 10-year Treasury total return %, CPI-U Dec/Dec %]`) each January, from the same sources the file's header cites. `HISTORY_LAST_YEAR` follows automatically.
- **`src/config/jurisdictions/*.js`:** each foreign country summary carries a `vintage`, its bracket table and an `fxRate` with the date it was taken. Re-check each one's brackets against the country's own tax authority when its tax year rolls over (not all on January 1), and refresh the FX rate; bump `vintage`.
- **`src/config/lifeTable.js`:** see #12.

## What does *not* need annual updates

- `getRMDDivisor` — IRS Pub 590-B's Uniform Lifetime Table, which is stable and only changes on rare IRS rule revisions (last major revision was 2022), not annually.
- Tax bracket *rates* (10/12/22%, etc.) and the general shape of the IRMAA tier structure — only the dollar breakpoints move each year.

## Verifying an update

Run the full suite (`npx vitest run`, a few minutes) and `npm run lint`; both must pass. For a quick look at a new table before the suite, a script run with `npx vite-node <file>` from the repo root (downloaded by `npx`; not a dependency):

```js
import { runProjection, DEFAULT_INPUTS, FEDERAL_TAX_TABLES, getTaxBracketLimit, federalTaxContextAtRate, getFederalPovertyLevel, calculateIRMAA } from './src/calculator.js';

// 1. The new table reads as published, and its year is exact.
console.log(FEDERAL_TAX_TABLES[2027].standardDeduction);
console.log(getTaxBracketLimit('MFJ', 0.12, federalTaxContextAtRate(2027, 2.5, 1.025))); // 104050

// 2. A plan's rows say which table each year read.
const proj = runProjection(DEFAULT_INPUTS);
for (const y of proj.years.slice(0, 4)) console.log(y.year, y.federalTaxYear, y.federalTaxFactor, y.stdDeduction);

// 3. The non-keyed figures.
console.log(getFederalPovertyLevel(1), getFederalPovertyLevel(2), calculateIRMAA(300000, 'MFJ', 2));
```

Then check every moved golden has an explanation, and that the Learn lesson figures and the demo fixture were handled (#1).

## Checklist

Tick every line each annual pass; a line that did not change still gets a
tick once its source has been read.

**As each is published (October to January)**
- [ ] `FEDERAL_TAX_TABLES[next year]` added: brackets MFJ / Single / MFS / HOH; standard deductions MFJ / Single / MFS / HOH; 65+ amounts; capital-gains 0% and 15% ceilings for all four; AMT exemption and phase-out MFJ / Single / MFS and the 28% breakpoint (joint and MFS); estate and GST exclusion; pin test added; moved goldens explained (#1)
- [ ] `SS_ANNOUNCED[next year]`: COLA, wage base, earnings-test amounts (#4)
- [ ] `FPL_TABLES[this year]` added in January, governing next year's coverage (#8)

**December: year-end source review, and the switch prepared on a branch**
- [ ] `npm run check:sources` run, every flagged source re-read, `howFigured.js` cards and verified dates updated (Year-end source review)
- [ ] Senior-deduction window still 2025–2028 (#1)

**January 1: the `TAX_YEAR` switch (#0)**
- [ ] `TAX_YEAR` bumped; `FEDERAL_TAX_TABLES[TAX_YEAR]` present
- [ ] Part B premium, IRMAA tiers MFJ / Single / MFS-together, Part D base premium and surcharges, top-tier freeze (#5)
- [ ] 401(k)/IRA limits, catch-ups, §415(c), Roth catch-up wage threshold, Roth IRA phase-outs; HSA limits; QCD limit (#6)
- [ ] Annual gift exclusion (#3)
- [ ] ACA applicable percentages and benchmark premiums; Medicaid non-expansion list (#7)
- [ ] Copy that prints a 2026 constant beside `{TAX_YEAR}` reads the new year's figure (#0 step 3)
- [ ] Anything not yet published listed in the commit message as carried by the factor

**State, estate and other data**
- [ ] CA brackets, standard deduction, exemption credit and phase-out, BHS threshold; NY eras, recapture, standard deduction, NYC; VA standard deduction schedule (#9)
- [ ] Illinois exemption allowance; IL / PA / CO rates; Colorado caps and AGI limits (#10)
- [ ] `src/config/stateTaxRules.js` (the 35 other states and DC): each state's new-year figures
- [ ] State estate / inheritance table and graduated schedules (#11, #11b)
- [ ] Trustees Report default (#4); life table (#12); historical-returns row; foreign jurisdiction summaries (#13)
- [ ] `sources.js` links re-checked, `UNCITED` trimmed (User-facing source links)
- [ ] `TAX_RULES_SPEC.md` tables changed to match; value-pinning tests updated with their citations
- [ ] Release note added (`src/config/changelog.js`)
