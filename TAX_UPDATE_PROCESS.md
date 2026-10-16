# Annual Tax-Year Update Process

Every dollar figure and threshold this app uses for federal/state tax, Medicare, Social Security, and ACA calculations is a snapshot of a specific tax year (currently 2026), hardcoded into `src/calculator.js`. The IRS, CMS, SSA, and each state publish updated figures every year, almost always in the October-January window before the new tax year. This doc is the checklist for rolling the app forward each year, in order, with sources and a verification step for each.

Do this once a year, ideally in early-to-mid January once IRS Revenue Procedures and the CMS Medicare fact sheet for the new year are both out (some figures — the SS wage base, IRS contribution limits — are published earlier, in October/November of the prior year, and can be updated as soon as they're announced).

> **Keep `TAX_RULES_SPEC.md` in step.** That document restates every rule
> and figure below in plain language for professional review. When a figure
> here changes, change it there too (Sections 2–5 carry the same tables).

## 0. Bump `TAX_YEAR`

`TAX_YEAR` (exported near the top of `src/calculator.js`) is the vintage year every hardcoded dollar figure below (tax brackets, IRMAA thresholds, contribution limits, the federal poverty level, state estate tax tables, the SS wage base, etc.) was last verified against. Bumping it is step 0 of this checklist so the rest of the figures below are being verified against the correct year — but note it is **not** the thing that decides what year a given user's plan currently thinks it's in anymore.

That's a separate, per-plan value: `inputs.planYear`, defaulted to `TAX_YEAR` in `DEFAULT_INPUTS` for every new plan, but independently advanceable by the user via the "Plan Year" sub-tab in Plan Settings (`PlanYearPanel.jsx`) without needing an app update. `runProjection`, `runMonteCarlo`, `findOptimalRetirementAge`, `computeStressComparisonData`, and `computeAgeFinderResultsReal` all read `inputs.planYear` (not the module-level `TAX_YEAR`) for "what year does this projection start in." The legacy `currentAge` migration in `sanitizeInputs` and the demographics summary in `App.jsx`'s print view still read `TAX_YEAR` directly, since those handle data that predates `birthYear`/`planYear` existing at all.

Bumping `TAX_YEAR` here only moves the tax-figure vintage forward — it does **not** retroactively move any existing user's `inputs.planYear` (correctly so: a plan sitting at planYear 2027 shouldn't silently jump to 2028 just because this app got updated). A brand-new plan created after this update still starts with `planYear` equal to the new `TAX_YEAR`, same as before.

## 1. Federal ordinary income tax brackets & standard deduction

- **Constants:** `BRACKETS_MFJ`, `BRACKETS_SINGLE`, `BRACKETS_MFS`, `DEDUCTION_MFJ`, `DEDUCTION_SINGLE`, `DEDUCTION_MFS` (the `_PRETCJA` variants are derived from these; only the stress toggle uses them)
- **Source:** IRS Revenue Procedure for the new tax year (search "IRS tax inflation adjustments tax year `<year>`" — it's usually irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-`<year>`).
- **What to do:** Replace the `limit`/`rate` pairs in all three bracket arrays and the three deduction constants with the new year's figures. MFS brackets are half of MFJ except at the 35% ceiling; check that one against the Rev. Proc. rather than halving. Rates themselves (10/12/22/24/32/35/37%) essentially never change year to year — only the dollar breakpoints do.
- **Downstream, no separate edit needed:** `TaxEstateTab.jsx`'s bracket-limit chart derives its `limit10`-`limit35` values directly from `BRACKETS_MFJ`/`BRACKETS_SINGLE` rather than keeping its own copy, so it updates automatically.
- **Age-65 add-on (same Rev. Proc., "additional standard deduction for the aged or the blind"):** `ADDITIONAL_DEDUCTION_AGED_MARRIED_2026` ($1,650 per aged spouse, married returns) and `ADDITIONAL_DEDUCTION_AGED_SINGLE_2026` ($2,050, unmarried). Rename the suffix with the year when you refresh them.
- **OBBBA senior bonus (`SENIOR_BONUS_*`):** $6,000 / $75k / $150k / 6% are statutory and NOT indexed &mdash; do not touch unless Congress amends s 151(d)(5). The window is hard-coded 2025&ndash;2028 (`SENIOR_BONUS_LAST_YEAR`); if it is extended, bump that constant. **In the January 2029 pass**, confirm it actually expired and, if so, leave the code alone (it returns 0 for 2029+ already) and drop the sentence about it from the Guide/Input Dictionary.

## 2. Capital gains / qualified dividend brackets

- **Constants:** `thresh15`, `thresh20` (inline in `calculateCapitalGainsTaxes`)
- **Source:** same IRS Revenue Procedure as #1 (capital gains breakpoints are published alongside ordinary brackets).
- **What to do:** Update the dollar figures (MFJ/Single × 15%/20% breakpoints, and the MFS 20% breakpoint, which is half of MFJ, not the Single figure).

## 3. IRA / 401(k) contribution limits

- **Constants:** `ELECTIVE_DEFERRAL_LIMIT_2026`, `CATCHUP_50_2026`, `CATCHUP_60_63_2026`, `IRA_LIMIT_2026`, `IRA_CATCHUP_50_2026`, `ANNUAL_ADDITIONS_LIMIT_2026` (§415(c), drives the mega-backdoor room), `MANDATORY_ROTH_CATCHUP_WAGE_THRESHOLD_2026` (SECURE 2.0 wage test for Roth-only catch-ups, used by both the "401(k)" and "max" Auto-Max modes), `ROTH_IRA_PHASEOUT_MFJ` / `ROTH_IRA_PHASEOUT_SINGLE` (indexed; `ROTH_IRA_PHASEOUT_MFS_TOGETHER` is the statutory $0–$10,000 and does not move)
- **Source:** IRS Notice for the new year (search "401k limit increases IRA limit increases `<year>`" — irs.gov/newsroom).
- **What to do:** Update every indexed figure above. Note the age 60-63 "super" catch-up (SECURE 2.0) *replaces* the regular 50+ catch-up rather than stacking with it — `getElectiveDeferralLimit` already encodes that, don't add them together.
- Rename the constants to match the new year (`_2026` → `_2027`, etc.) for clarity, though this is cosmetic — nothing outside `getElectiveDeferralLimit`/`getIRAContributionLimit` references them by name.

## 3b. HSA contribution limits

- **Constants:** `HSA_LIMIT_SELF_2026`, `HSA_LIMIT_FAMILY_2026`, `HSA_CATCHUP_55_2026`
- **Source:** IRS HSA/HDHP inflation adjustments for the new year (search "IRS HSA HDHP limits `<year>`").
- **What to do:** Update the self-only and family limits. The $1,000 55+ catch-up (`HSA_CATCHUP_55_2026`) is fixed by §223(b)(3)(B) and is NOT indexed; leave it unless Congress changes it (the projection indexes only the base limit).

## 3c. Qualified Charitable Distribution (QCD) limit

- **Constant:** `QCD_LIMIT_2026`
- **Source:** IRS QCD inflation adjustment for the new year (indexed since SECURE 2.0; search "QCD annual limit `<year>`"). Per-person, so an MFJ household's effective cap is double this figure (each spouse's own IRA).
- **What to do:** Update the single dollar figure.

## 3d. Alternative Minimum Tax (AMT) exemption, phase-out, and rate breakpoint

- **Constants:** `AMT_EXEMPTION_MFJ_2026`, `AMT_EXEMPTION_SINGLE_2026`, `AMT_EXEMPTION_MFS_2026`, `AMT_PHASEOUT_MFJ_2026`, `AMT_PHASEOUT_SINGLE_2026`, `AMT_PHASEOUT_MFS_2026`, `AMT_RATE_BREAKPOINT_2026`, `AMT_RATE_BREAKPOINT_MFS_2026`
- **Source:** same IRS Revenue Procedure as #1 (AMT figures are published alongside ordinary brackets). `AMT_PHASEOUT_RATE` (0.5, i.e. the exemption phases out $0.50 per $1 of AMTI over the threshold) is set by statute and essentially never changes — don't update it without checking the Revenue Procedure explicitly says otherwise.
- **What to do:** Update the two exemption amounts, the two phase-out thresholds, and the 26%/28% rate breakpoint.
- **Known limitation, re-confirm on each update:** this app only computes AMTI as `baseOrdinaryTaxableIncome` (i.e. it doesn't add back itemized deductions or ISO exercise spread, the two dominant real-world AMT triggers) — see the comment above `calculateAMT` in `calculator.js`. As of 2026 this means `amtTax` reads $0 for every scenario the app can realistically produce, verified by sweeping AMTI from $90k-$10M+ (Single) and $140k-$5M (MFJ) against `calculateTaxes`. If a future year's exemption/standard-deduction relationship changes enough that this stops holding, the Dashboard's "AMT Triggered" plan-feedback warning (`DashboardTab.jsx`) will start surfacing — treat that as a signal to revisit whether itemized/ISO modeling is now needed for AMT to stay meaningful, not just to re-check the constants.

## 4. Social Security wage base, earnings test, and trust-fund default

- **Constant:** `ssLimit` (inline in `calculateFICATaxes`). Since 2026-08-29 it is multiplied by a wage-index factor (the plan's inflation factor) for later projection years, so only the base-year figure needs refreshing.
- **Source:** ssa.gov, "Contribution and Benefit Base" (usually announced in October).
- **Retirement Earnings Test:** `SS_EARNINGS_TEST_EXEMPT_UNDER_FRA` and `SS_EARNINGS_TEST_EXEMPT_FRA_YEAR`, from ssa.gov/oact/cola/rtea.html, published with the COLA in October. The $1-per-$2 / $1-per-$3 rates are statutory.
- **Trust-fund depletion default:** `ssDepletionYear` / `ssCutPercent` in `DEFAULT_INPUTS` (and the fallback values and tooltip in `LegislativeRisksSection.jsx`, the Input Dictionary row, and the `ssa-trustees-2026` entry in `src/config/sources.js`). Refresh from the Trustees Report each spring (ssa.gov/oact/TR/`<year>`/II_A_highlights.html): the OASI depletion year and 100 minus the percent payable. Saved plans keep their own values; only new plans get the new default.

## 5. Medicare Part B premium & IRMAA thresholds

- **Constants:** `IRMAA_STANDARD_PREMIUM`, `IRMAA_TIER_PREMIUMS`, `IRMAA_THRESHOLDS_MFJ`, `IRMAA_THRESHOLDS_SINGLE`, `IRMAA_THRESHOLDS_MFS_TOGETHER`, `PART_D_BASE_PREMIUM`, `PART_D_IRMAA_SURCHARGES`, `IRMAA_TOP_TIER_FREEZE_THROUGH_YEAR`
- **Source:** CMS.gov Medicare Parts A&B premium/deductible fact sheet for the new year, usually published mid-November; the Part D national base beneficiary premium from CMS's late-July Part D bid release; Part D surcharges from the SSA POMS table.
- **What to do:** Update the standard premium, the five surcharge tiers, and the five MAGI thresholds for both filing statuses. The top tier ($500,000 / $750,000) is frozen in statute through `IRMAA_TOP_TIER_FREEZE_THROUGH_YEAR` (2027) and indexes from 2028 on an August-2026 base: from the 2028 pass, take the new top figures from CMS rather than leaving them. `IRMAA_THRESHOLDS_MFS_TOGETHER` carries the base-year MFS-together lower line and the top line; the engine derives the top as $500,000 less the lower line each year, so check CMS's printed MFS figures equal that identity.
- **Downstream, no separate edit needed:** `TaxEstateTab.jsx`'s IRMAA cliff lines derive from `IRMAA_THRESHOLDS_MFJ`/`SINGLE` the same way the bracket limits do.

## 6. Federal Poverty Level (ACA Subsidy Protection feature)

- **Constants:** `FPL_2026_BASE`, `FPL_2026_PER_ADDITIONAL_PERSON`
- **Source:** HHS/ASPE poverty guidelines, aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines — published every January, so this is the one figure in this list you can't get ahead of the calendar year for.
- **What to do:** Update the 1-person base and the per-additional-person increment (48 contiguous states + DC figures only — this app doesn't model Alaska/Hawaii's separate, higher guidelines).

## 7. Medicaid non-expansion state list (ACA Subsidy Protection feature)

- **Constant:** `ACA_NON_EXPANSION_STATES`
- **Source:** healthinsurance.org/medicaid/expansion (state-by-state tracker) or KFF's Medicaid expansion tracker.
- **Unlike everything else on this list, this can change at any point during the year, not just in January** — a state legislature or ballot initiative can expand Medicaid mid-year. Worth a quick check even outside the annual pass if you hear about Medicaid expansion news in a specific state.

## 8. State income tax brackets (CA, NY, VA)

- **Constants:** `BRACKETS_CA_SINGLE`, `BRACKETS_CA_MFJ`, `CA_STD_DEDUCTION_SINGLE`, `CA_STD_DEDUCTION_MFJ`, `CA_EXEMPTION_CREDIT` (+ `CA_EXEMPTION_PHASEOUT`), `CA_MILITARY_EXCLUSION_*`, `BRACKETS_NY_*` (2026 / `_2027` / `_2033` eras), `NY_RECAPTURE_*` (per era), `NY_TAX_ERAS`, `NY_STD_DEDUCTION_SINGLE`, `NY_STD_DEDUCTION_MFJ`, `BRACKETS_NYC_*`, `CA_BHS_TAX_THRESHOLD`, `BRACKETS_VA`, `VA_STD_DEDUCTION_*`, `VA_PERSONAL_EXEMPTION`, `VA_AGE_EXEMPTION`, `VA_AGE_DEDUCTION` (+ thresholds), `VA_MILITARY_SUBTRACTION_CAP`
- **California standard deduction** is CCPI-indexed like the brackets: refresh it from the same 540 booklet each January. **New York's** is statutory (Tax Law §614) and moves only by legislation.
- **Status:** both verified 2026-08-20 against primary sources. These were previously marked "estimated" and both were badly wrong &mdash; see the Fixed section of `KNOWN_ISSUES.md`. **The two states need completely different treatment, so read both bullets.**

### California &mdash; refresh EVERY January

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
- **What to watch instead — the standard deduction sunset:** the $8,750 single / $17,500 MFJ amounts (`VA_STD_DEDUCTION_*`) are temporary. They were enacted through TY2026 and are scheduled to revert to $3,000/$6,000 under pre-2019 law unless the General Assembly extends them — which it has done every cycle since 2019, usually in the biennial budget. **Each January, check tax.virginia.gov's Deductions page** for the current amounts and whether an extension passed; if the sunset ever actually bites, that's an ~$800/yr tax increase per couple the app must reflect.
- **Also check:** rate-reform bills. Virginia's legislature debates lowering the 5.75% top rate or raising the $17,000 threshold most sessions; none had passed as of the 2026-08-31 verification.

## 8b. Illinois, Pennsylvania and Colorado

These three are inline in `calculateStateTaxes` / nearby helpers rather than tables, which is exactly why they are easy to miss.

- **Illinois:** the 4.95% rate (inline, `ilTaxable * 0.0495`); `IL_EXEMPTION_ALLOWANCE` (indexed each year — IDOR announces it in an informational bulletin, e.g. FY 2026-15 set $2,925 for 2026), `IL_EXEMPTION_AGE_65` ($1,000, statutory), `IL_EXEMPTION_AGI_LIMIT_SINGLE` / `_MFJ` ($250,000 / $500,000, statutory). Source: tax.illinois.gov bulletins and the IL-1040 instructions, Step 4.
- **Pennsylvania:** the 3.07% rate (inline). Statutory; changes only by legislation. The compensation rules (retirement distributions exempt after retirement age, employee 401(k) deferrals taxable) are cited in `src/config/sources.js`.
- **Colorado:** the 4.4% rate (inline; TABOR can cut it for a single year — do not copy a one-year TABOR rate forward), the pension/annuity caps ($24,000 at 65+, $20,000 at 55–64), the 55–64 Social Security AGI limits ($75,000 / $95,000), and the under-55 military $15,000 (through 2028). Source: tax.colorado.gov "Social Security, Pensions, and Annuities" and the Individual Income Tax Guide. Remember the full SS subtraction uses up the same cap.

## 8c. Federal estate, gift and GST

- **Constants:** `FEDERAL_ESTATE_EXEMPTION_2026`, `GST_EXEMPTION_2026`, `ANNUAL_GIFT_EXCLUSION_2026`. The estate and GST exemptions are indexed from 2027 (§2010(c)(3)(B), §2631(c)); the annual exclusion is indexed in $1,000 steps (§2503(b)(2)). All three are in the same IRS Revenue Procedure as #1.
- **Do not touch:** `FEDERAL_ESTATE_TOP_RATE` / `GST_RATE` (40%, statutory), `FEDERAL_2011_CREDIT_TABLE` and `ADJUSTED_TAXABLE_ESTATE_OFFSET` (the frozen pre-2005 §2011 table some states still key on).

## 9. State estate & inheritance tax table

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

## 9b. Inheritance tax schedules (KY, MD, NE, NJ, PA)

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
     estate and inheritance states in #9 and #9b;
   - any new federal law (congress.gov) that adds, ends or changes a rule the
     app models, such as the temporary senior deduction.
4. **Then follow the constant-update steps above** (#0 to #11) for anything
   that moved, and keep `TAX_RULES_SPEC.md` in step.
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

## 10. SSA period life table (`src/config/lifeTable.js`)

Not a tax figure, but it ages the same way. Each spring's Trustees Report
carries a new period life table (2026's carries 2023 rates). To refresh:
replace `MALE_QX` / `FEMALE_QX` and `LIFE_TABLE_VINTAGE` from
https://www.ssa.gov/oact/STATS/table4c6.html, and update
`PUBLISHED_CHECKPOINTS` (number of lives and life expectancy at 0, 65 and
80, both sexes) from the same page. `lifeTable.test.js` then re-derives the
lives column and the expectancies from the new rates and fails on any
transcription slip. Nothing else in the app carries a copy.

## 11. Other yearly data files

- **`src/config/historicalReturns.js`:** append the just-finished calendar year's row (`[year, S&P 500 total return %, 10-year Treasury total return %, CPI-U Dec/Dec %]`) each January, from the same sources the file's header cites. `HISTORY_LAST_YEAR` follows automatically.
- **`src/config/jurisdictions/*.js`:** each foreign country summary carries a `vintage`, its bracket table and an `fxRate` with the date it was taken. Re-check each one's brackets against the country's own tax authority when its tax year rolls over (not all on January 1), and refresh the FX rate; bump `vintage`.
- **`src/config/lifeTable.js`:** see #10.

## What does *not* need annual updates

- `getRMDDivisor` — IRS Pub 590-B's Uniform Lifetime Table, which is stable and only changes on rare IRS rule revisions (last major revision was 2022), not annually.
- Tax bracket *rates* (10/12/22%, etc.) and the general shape of the IRMAA tier structure — only the dollar breakpoints move each year.

## Verifying an update

After changing any constant above, run a quick Node script rather than trusting the edit by eye — this project can't run its full test suite in every environment, so this is the fallback pattern used throughout its history:

```js
import { runProjection, DEFAULT_INPUTS, calculateIRMAA, getFederalPovertyLevel } from './src/calculator.js';

// 1. Sanity-check the changed constants directly
console.log(getFederalPovertyLevel(1), getFederalPovertyLevel(2));
console.log(calculateIRMAA(300000, 'MFJ', 2));

// 2. Full smoke test — should run without throwing and return a plausible result
const proj = runProjection(DEFAULT_INPUTS);
console.log('isSuccessful:', proj.isSuccessful, 'endingBalance:', proj.endingBalance, 'years:', proj.years.length);
```

Then run the existing `src/__tests__/calculator.test.js` suite (`npx vitest run`) in an environment that can execute it — the sandbox this app has been maintained in so far cannot run `npm run build`/`vitest` directly, so that step has consistently been done by re-implementing the relevant assertions as standalone Node scripts and confirming they pass, then mirroring those same assertions into the actual test file for the next environment that *can* run it.

## Checklist

Tick every line each annual pass; a line that did not change still gets a
tick once its source has been read.

- [ ] `TAX_YEAR` bumped (#0)
- [ ] Federal brackets MFJ / Single / MFS, standard deductions MFJ / Single / MFS (#1)
- [ ] §63(f) age-65 add-ons (#1); senior-bonus window still 2025–2028 (#1)
- [ ] LTCG 15% / 20% breakpoints, MFS included (#2)
- [ ] 401(k)/IRA limits, catch-ups, §415(c) annual additions, mandatory-Roth catch-up wage threshold, Roth IRA phase-outs (#3)
- [ ] HSA self / family limits; catch-up left at $1,000 (#3b)
- [ ] QCD limit (#3c)
- [ ] AMT exemptions, phase-outs, breakpoints — MFJ / Single / MFS (#3d)
- [ ] SS wage base, earnings-test exempt amounts, Trustees depletion default (#4)
- [ ] Part B premium, IRMAA tiers MFJ / Single / MFS-together, Part D base premium and surcharges, top-tier freeze year (#5)
- [ ] Federal Poverty Level (#6); Medicaid non-expansion list (#7)
- [ ] CA brackets, standard deduction, exemption credit and phase-out, BHS threshold; NY eras, recapture, standard deduction, NYC; VA deduction sunset (#8)
- [ ] Illinois exemption allowance; IL / PA / CO rates; Colorado caps and AGI limits (#8b)
- [ ] Federal estate and GST exemptions, annual gift exclusion (#8c)
- [ ] State estate / inheritance table and graduated schedules (#9, #9b)
- [ ] `sources.js` links re-checked, `UNCITED` trimmed (User-facing source links)
- [ ] December: `npm run check:sources` run, every flagged source re-read, `howFigured.js` cards and verified dates updated (Year-end source review)
- [ ] Life table (#10); historical-returns row; foreign jurisdiction summaries (#11)
- [ ] `TAX_RULES_SPEC.md` tables changed to match; value-pinning tests updated with their citations
