# Relocation & Foreign Residency -- design spec

Status: **RUNG 1 SHIPPED (changelog 195, 2026-09-20). RUNG 2 + Custom Country SHIPPED (changelog 196, 2026-09-20, Premium). RUNG 3 SHIPPED: wave-1 presets (changelog 197) and the stay-vs-move compare (198). RUNG 4 SHIPPED (changelog 199): special regimes with expiry, the balance tax, wave-2 presets (Italy, Spain, France); remittance basis moved to rung 5. RUNG 5 SHIPPED (changelog 200): per-heir foreign inheritance with the residence rule, remittance basis, wave 3 (Thailand, Philippines, Belize, Uruguay). Action Plan items for a move abroad SHIPPED (changelog 201, section 8.2 surface 4). RUNG 6 SHIPPED (changelog 203): wave 4 (Germany, Ireland, Greece, Malaysia), a move in any month, cost of living per move. WAVE 5 SHIPPED (changelog 209): United Kingdom and Australia, both flagged for having no open retirement visa.** See changelogs 195 and 196 for what each rung actually did and where it departed from this spec. Written 2026-09-17 in response to a user ask:
"model a move to Europe on a specific date, coupled with other personal
events, and understand the taxing policies."

Decisions taken up front (John, 2026-09-17):
- Deliverable now is this spec. No code.
- Foreign tax is a **generic jurisdiction engine with country presets as
  pure data**. The engine can be right while a preset is wrong.
- It is a **Premium capability area** -- a third `PREMIUM_AREAS` entry
  alongside Detailed Holdings and Retirement Spending. One product that
  grows; no per-module SKU. See PRODUCT_STRATEGY.md.
- Target country is unspecified. Europe first, **Asia must be expressible
  in the same schema without an engine change.** That constraint drives
  most of the data-model choices below.

Read with: TAX_RULES_SPEC.md (US engine rules), KNOWN_ISSUES.md,
TAX_UPDATE_PROCESS.md (the maintenance bill this feature creates),
PRODUCT_STRATEGY.md (privacy constraint: client-side only, no server).

---

## 1. The one fact that governs the whole feature

**A US citizen is taxed by the US on worldwide income regardless of where
they live.** Moving abroad does not turn off the US engine. It adds a
*second* tax layer plus a credit mechanism, and switches off a handful of
US-residence-specific line items (ACA, Medicare utility, state tax if
domicile is actually severed).

The number a user cares about is therefore not "what does Portugal
charge." It is roughly:

```
total tax  ~=  max(US tax, local tax)  +  uncreditable residue
```

where the residue is the part that makes this feature worth building and
is the part every online "retire abroad, pay 7%!" article omits:

1. **NIIT gets no foreign tax credit.** Section 1411 sits in Chapter 2A;
   Sections 901/27 credit against Chapter 1. Two Court of Federal Claims
   taxpayer wins (Christensen 2023, Bruyea 2024) held a treaty could grant
   an independent credit -- **the Federal Circuit reversed both on
   2026-08-31** (Christensen, No. 2024-1284). Treaty-based FTC against
   NIIT is dead in the only appellate venue that mattered. Model NIIT with
   **zero** foreign offset.
2. **Foreign tax on a Roth distribution is pure additive cost.** A Roth
   distribution generates zero US tax, so there is nothing for a foreign
   credit to offset. A country that taxes Roth distributions (Germany,
   confirmed; Italy/Spain/Portugal, likely) can destroy a conversion
   strategy that the app itself recommended.
3. **Sourcing.** The FTC only offsets US tax on *foreign-source* income. A
   US retiree's income is overwhelmingly US-source. Without treaty
   **re-sourcing**, the Section 904 numerator is near zero and the credit
   is near-useless. Re-sourcing is what makes a high-tax treaty country
   survivable, and it is capped by the "would-have-paid-as-a-non-citizen"
   rule -- it relieves the incremental double tax, it does not zero out
   US tax on US-source income. Re-sourcing applies only to the share of
   the year lived there and, on a remittance basis, only to what was
   remitted -- the numerator is scaled like the local tax is (changelog
   405; before, a December move re-sourced the whole year). The passive
   basket is re-sourced only where the country taxes investment income at
   all, so a carryforward never shelters US tax on gains it exempts. The
   dividend surtax (Mexico) follows the same shares.
4. **Basket segregation.** Section 904(d) baskets (passive, general,
   re-sourced-by-treaty, with a separate Form 1116 per treaty country) do
   not blend. Excess credits on pension income cannot shelter US tax on
   dividends.
5. **Non-creditable wealth-style levies.** Spain's wealth + solidarity
   tax, Italy's IVAFE/IVIE on a US brokerage account, the Netherlands Box
   3 deemed return. These are not income taxes and never credit.

**Product consequence:** the headline output must be **net saving (or
cost) versus staying put**, not a local rate. A UI that shows "Greece: 7%"
is actively misleading, because the US floor usually swallows it.

**What is NOT a modeling concern, and the app should say so in plain
language:** the Section 877A exit tax. It applies only on *renouncing
citizenship* or a long-term green-card holder ceasing residency. Moving
abroad triggers nothing. It is the single most commonly misunderstood item
in this space. (If we ever do model it, note the dominant cost for a
retiree is not the mark-to-market -- it is that IRAs and other "specified
tax deferred accounts" are deemed distributed **in full**, with no
$910,000 exclusion.)

**Also not a concern any more:** WEP/GPO. The Social Security Fairness Act
(signed 2025-01-05) repealed both, effective for benefit months from
January 2024, and SSA expressly confirms the repeal covers people whose
work was covered by a *foreign* social security system. If any WEP logic
ever enters the engine, it must be date-gated to pre-2024.

---

## 2. What the engine assumes today

`runProjection` (`src/calculator.js:4412`) loops `for (let year = startYear;
year <= horizonYear; year++)` at `:4635`. **The loop variable is the
calendar year**, which is the single friendliest fact about this feature:
a `relocationYear` input compares directly against `year` with no
conversion.

Everything jurisdictional, however, is read plan-wide from `inputs`:

| # | Seam | Where | Today |
|---|---|---|---|
| 1 | State income tax | `calculateStateTaxes` (`:2857`) + 4 call sites (`:4124`, `:6319`, `:6348`, `:6820`) | `inputs.stateTaxState`, never per-year |
| 2 | State sub-flags | `:6319-6324`, `:6717` | `stateTaxFlatRate`, `stateTaxSocialSecurityTaxable`, `stateTaxPensionTaxable`, `nycResident`, `yonkersResident` |
| 3 | State early-distribution tax | `stateEarlyDistributionTax` (`:2237`), called `:4152` | same `stateType`; easy to miss |
| 4 | ACA marketplace machinery | `:5491-5521`, `:6177`, `:6786-6900` | `stateOfResidence`, `ACA_NON_EXPANSION_STATES` (`:1966`), `acaSubsidyAnnualValue`, both protection toggles, `getFederalPovertyLevel` (`:1951`) |
| 5 | Medicare Part B/D | `membersOver65` (`:5580`), `calculateIRMAA` (`:3765`), `calculateMedicarePartD` (`:3799`), charge at `:6445` | **age-only. There is no "not enrolled in Part B" concept anywhere.** |
| 6 | Estate / inheritance | `const stateCode = inputs.stateOfResidence` (`:9802`) | residence *now*, not residence *at death* |
| 7 | Ledger tax decomposition | `:7240-7254` | invariant `federalTax + stateTax + ficaTax === totalTaxesPaid` |
| 8 | Currency / FX | -- | **does not exist anywhere in the codebase.** Confirmed by exhaustive grep. `inflationRate` is single-rate and US-anchored. |

Two supporting facts:

- `stateExtrasForYear` (`:6307`) is **already built once per iteration**,
  already carries `calendarYear`, and already spreads into three of the
  four `calculateStateTaxes` call sites. It is the natural carrier for a
  per-year jurisdiction and the established precedent.
- `solveWithdrawals` (`:4045`) already takes `stateType` as a *parameter*
  (passed at `:6717`). Per-year jurisdiction needs no new plumbing shape
  there -- just a different value per year.
- `runMonteCarlo` (`:7443`) has its **own** second per-year loop at
  `:7475`. Any per-year jurisdiction concept must be visible to both.

**Big-ticket spending is already handled.** `inputs.milestones` (`:1252`,
consumed `:5717-5760`) covers dated one-off and recurring inflows and
outflows, with `targetAccount` routing to preTax/roth/taxable, an
`isTaxable` flag on inflows, and `fundedExternally` for money that never
touches the plan. The user's "other personal events" ask needs **no new
mechanism**. Two known limitations worth stating in the spec because
relocation makes them visible:

- Milestones match on **`age1` only** -- never `age2`, never calendar
  year. A move is naturally expressed as a calendar year; a relocation
  input should be calendar-year based and the UI should show the implied
  age, not the other way round.
- `inflationCategory` and `isRecurring` are written by the UI and **never
  read by the engine**. Do not build on them.

---

## 3. Data model

### 3.1 The residency timeline

One new structured input, following the `milestones: []` precedent quoted
at `src/calculator.js:837`: one key holding structured data, one
InputReference row, one inputCoverage entry, and it rides into saved
scenarios and `fullBackup` for free.

```js
// Residency Timeline (Relocation)
//
// The plan's jurisdiction is not a constant. A household can move states
// or move abroad, and the year they move changes state income tax, ACA
// eligibility, the usefulness of Medicare, and -- once abroad -- adds a
// whole second tax layer the US credits against but never fully.
//
// An EMPTY array means "one jurisdiction for the whole plan", and the
// engine behaves exactly as it did before this feature existed. That is
// the regression contract: a plan with no relocation must be
// bit-for-bit unchanged.
//
// Entries are sorted by `fromYear` and read as step changes: the entry
// with the greatest `fromYear` <= the projection year governs that year.
// Years before the first entry use the plan-wide stateTaxState /
// stateOfResidence inputs, so an existing plan needs no migration.
//
// Like every other structured input, sanitizeInputs passes this through
// UNCHECKED -- readResidencyTimeline() below is the normalizer.
residencyTimeline: [],
```

Entry shape:

```js
{
  id: '1757980800000',       // Date.now().toString(), milestones convention
  fromYear: 2032,            // calendar year the move takes effect
  kind: 'domestic',          // 'domestic' | 'foreign'

  // kind === 'domestic'
  stateOfResidence: 'FL',    // two-letter, drives ACA + estate
  stateTaxState: 'none',     // 'none'|'TX_FL'|'flat_5'|'ca'|'ny'|'il'|'co'|'pa'|'va'
  stateTaxFlatRate: 5.0,
  stateTaxSocialSecurityTaxable: false,
  stateTaxPensionTaxable: true,

  // kind === 'foreign'
  countryCode: 'PT',         // ISO 3166-1 alpha-2, key into the preset table
  jurisdiction: { ... },     // the resolved jurisdiction record, section 3.2
  stateDomicileSevered: false, // see the warning below -- default FALSE
}
```

**`stateDomicileSevered` defaults to `false`, and this is deliberate.**
Domicile persists until a new one is affirmatively established; moving
abroad does not terminate it. California (no retiree-usable safe harbor
-- the 546-day rule is employment-contract-based), New York (450 days
outside the US in 548, plus a very broad "permanent place of abode"
test), New Mexico (no safe harbor at all), South Carolina and Virginia all
continue to assert. **No state grants a foreign tax credit**, so a wrongly
severed CA domicile mis-states the entire remaining projection at up to
13.3%. Auto-zeroing state tax on a move-abroad flag is the single
highest-expected-cost modeling error available to us. The realistic
best-practice path -- establish residency in a no-tax state for 6+ months,
*then* depart -- is naturally expressed as **two timeline entries**, which
is a good argument for the timeline shape over a single `relocationYear`
field.

### 3.2 The jurisdiction record (the generic engine)

This is the contract between the engine and the presets. Presets fill it;
users can override every field; the engine never knows a country name.

```js
{
  label: 'Portugal',               // display only
  countryCode: 'PT',
  presetId: 'PT-standard-2026',    // or 'custom'
  presetVintage: '2026-09',        // staleness surfacing, see section 7

  // --- local income tax ---------------------------------------------
  // Either a bracket table in local currency, or a single effective
  // rate. `effectiveRate` is the honest default for a user who does not
  // know: it is a blunt instrument and the UI must label it as one.
  mode: 'brackets',                // 'brackets' | 'effectiveRate' | 'none'
  currency: 'EUR',
  brackets: [ { upTo: 8342, rate: 12.5 }, ... ],   // local currency
  surcharges: [ { name: 'Solidarity', over: 80000, rate: 2.5 }, ... ],
  investmentIncomeRate: 28.0,      // separate schedule where one exists
  effectiveRate: null,

  // --- what the local system reaches, by income type -----------------
  // Each is one of:
  //   'ordinary'  -- local progressive scale
  //   'investment'-- the separate investment schedule
  //   'exempt'    -- treaty or domestic law exempts it locally
  //   'remitted'  -- taxed only to the extent remitted (section 5.4)
  //   'unknown'   -- surface a warning, do NOT emit a number
  treatment: {
    socialSecurity:   'exempt',
    privatePension:   'ordinary',
    iraPeriodic:      'ordinary',
    iraLumpSum:       'ordinary',
    rothDistribution: 'unknown',
    rothAccrual:      'no',        // 'no' | 'yes' | 'unknown' -- annual tax on growth
    capitalGains:     'investment',
    dividends:        'investment',
    interest:         'investment',
    usRental:         'investment',
  },

  // --- treaty ---------------------------------------------------------
  treaty: {
    inForce: true,
    resourcingAvailable: true,     // makes the FTC work on US-source income
    resourcedTypes: ['dividends','interest','capitalGains','pension'],
    usExemptsSocialSecurity: false, // Pub 915 list, section 5.2
    sourceStateExclusivePensions: false, // France
  },

  // --- non-creditable levies -------------------------------------------
  wealthTax: { enabled: false, threshold: 0, rate: 0, base: 'worldwideNet' },
  // Italy's IVAFE and the Netherlands' Box 3 are expressed here too:
  // they are wealth-style levies on a US brokerage account, not income
  // taxes, and they NEVER credit.

  // --- social / health contributions on unearned income ----------------
  // Rare but decisive where it exists. Germany charges ~19-21% health +
  // care contributions on ALL income including pension, rental and
  // investment, for a voluntary statutory member, up to a ceiling.
  // Ireland charges PRSI on unearned income (but exempts 66+).
  unearnedContributions: { enabled: false, rate: 0, ceiling: 0 },

  // --- succession -------------------------------------------------------
  inheritance: {
    enabled: true,
    basis: 'beneficiary',          // 'beneficiary' | 'estate'
    worldwideAfterYears: null,     // Japan: 10 of 15; Ireland CAT: 5
    allowancePerHeir: 0,
    schedule: [ { upTo: 0, rate: 0 } ],
  },

  // --- non-tax consequences --------------------------------------------
  healthcare: {
    publicAccess: 'resident',      // 'resident'|'contributory'|'none'
    annualCost: 0,                 // local currency, or the private
                                   // alternative where publicAccess==='none'
  },
  socialSecurityPayable: true,     // SSA cannot pay into Cuba, North Korea,
                                   // and (policy) 7 Central Asian states
  specialRegime: null,             // section 3.3
}
```

### 3.3 Special regimes as a first-class field

Italy's 7% southern-municipality pensioner regime, Greece's 7% (15 years),
Greece's EUR 100k non-dom lump sum, Italy's Art. 24-bis lump sum
(EUR 200k -> **EUR 300k** by the 2026 Budget Law, with grandfathering by
entry vintage), Thailand's LTR Wealthy Pensioner exemption, Japan's
non-permanent-resident 5-of-10 remittance window, Korea's 5-of-10 rule,
Ireland's non-dom remittance basis.

These are not one shape, but they reduce to three:

```js
specialRegime: {
  id: 'IT-7pct-south',
  label: '7% flat tax, southern municipalities',
  form: 'flatRate',       // 'flatRate' | 'lumpSum' | 'exemption' | 'remittance'
  rate: 7.0,              // form === 'flatRate'
  lumpSumAmount: null,    // form === 'lumpSum' (Italy 300k, Greece 100k)
  scope: 'allForeignIncome', // 'foreignPensionOnly' | 'allForeignIncome'
  durationYears: 10,      // null = unlimited (Ireland non-dom)
  openToNewEntrants: true,
  vintage: '2026-09',
}
```

`durationYears` is the one that matters and the one an app can get right
where an article cannot: **these regimes expire mid-plan.** A 65-year-old
electing Greece's 15-year regime hits the full progressive scale at 80,
inside almost every projection horizon. Japan's NPR window and Korea's
5-of-10 rule are the same shape -- a cliff, not a rate -- and the whole
point of a cash-flow engine is that it can show the cliff. **Model regime
expiry as a mandatory step change in the timeline, auto-inserted and
visible in the ledger.**

---

### 3.4 What the Latin American research forced on the schema

`RELOCATION_RESEARCH.md` Part 3 carries the evidence. These are not
refinements -- each is a case where the record in 3.2 was the wrong shape.

1. **A bracket table is the wrong primitive for half the world.** Panama,
   Costa Rica, Belize and in-holiday Uruguay need a **boolean** -- is this
   income foreign-source? -> 0% -- not a bracket engine. `mode: 'none'`
   has to become the first-class path rather than a degenerate case,
   because for those countries the whole model reduces to social-insurance
   and healthcare cost.
2. **`unearnedContributions` is load-bearing, not an edge case.** Costa
   Rica's CAJA is **mandatory, income-assessed at roughly 7-11%, enforced
   at residency renewal -- in a country whose income tax on this persona
   is 0%.** A preset that sets the rate to zero and leaves contributions
   empty shows Costa Rica as free and is wrong by thousands a year. Four
   sources give four different CAJA rates and the most detailed is
   expressly stale at December 2025, so **ship a range, not a point
   value.** Note too that the assessment base is the income **declared to
   Immigration**, not actual worldwide income -- whether CCSS reassesses
   is unverified and is a large error in either direction.
3. **Healthcare needs age-at-arrival, not a per-country constant.** Three
   incompatible shapes in one region: Panama has **no public option for a
   foreign retiree at any price**, with local plans whose new-issue age
   closes at **55 and 65**; Mexico's IMSS has no age cap but **refuses
   enrollment outright for listed pre-existing conditions**; Costa Rica's
   CAJA has no age cutoff and covers pre-existing from day one. Add
   `healthcare.newIssueAgeCap` and `healthcare.preExistingRefused`, and
   make age-at-arrival an input.
4. **Private cover is sometimes ADDITIVE, not alternative.** CAJA is
   compulsory, so private insurance in Costa Rica is always an extra cost;
   Mexico's IMSS voluntary genuinely is elective. **Do not model these as
   mutually exclusive options** -- that is the natural UI mistake and it
   gets Costa Rica wrong.
5. **Immigration programmes move OUT of the tax preset.** Pensionado and
   rentista have **zero tax effect** in both Panama and Costa Rica -- the
   income is untaxed by territoriality, which applies to every resident
   regardless of category. Every marketing source blurs this. If they live
   in the tax preset, someone eventually wires one to a rate.
6. **"Lifetime pension" is a TYPE check, not an amount check.** Panama and
   Costa Rica both require a *guaranteed lifetime* pension. **Fixed-term
   annuities and systematic IRA withdrawals do not qualify at any
   amount**; Social Security and defined-benefit pensions do. The engine
   already knows which stream is which, so this is checkable -- and it is
   a common, expensive surprise.
7. **Residency triggers are not all day counts.** Mexico's is a **home**
   test (CFF Art. 9): sell the US home and buy in Mexico and you are
   resident on day one; keep the US home and the tiebreaker points back at
   the US. An app that asks "how many days will you spend there?" gives a
   **dangerously wrong answer for Mexico**, and every expat source
   asserting a flat 183-day Mexican rule is wrong. Make `residencyTrigger`
   typed -- `days` | `home` | `centreOfInterests` -- and have the UI ask
   the matching question.
8. **Indexed units drift over a 30-year projection.** Mexico's UMA,
   Colombia's UVT, Uruguay's UI and BPC all reset annually with inflation.
   Thresholds need an `indexedUnit` field rather than a hard-coded USD
   equivalent. Ecuador and Panama are the only places where USD is USD.
9. **FX moves brackets, not just balances -- and not always downward.**
   Costa Rica's colon has **appreciated** against the dollar, cutting
   USD-retirees' purchasing power. Model two-sided variance; do not assume
   an emerging-market depreciation tailwind.
10. **A wealth tax can reach the IRA balance itself.** Colombia taxes
    worldwide net assets annually regardless of distributions -- an engine
    driven by income events has no hook for that. Hence `wealthTax.base`
    must distinguish worldwide from situs-limited: Uruguay's reaches only
    Uruguayan assets, the exact opposite.
11. **Social Security taxability is inverted across the set.** The US taxes
    at most 85%; Panama, Costa Rica, Belize and Uruguay tax 0%; **Ecuador
    taxes 100%.** Carrying the US inclusion rule forward is wrong in every
    direction.
12. **Do not render treaty presence as a green check.** Panama and Costa
    Rica have no US treaty and it costs this persona **almost nothing** --
    there is no double tax to relieve. Mexico *has* one, and the saving
    clause means a US citizen gets allocation and credit mechanics, not
    relief. The naive UI reading is backwards.
13. **Some countries tax things with no US analogue at all.** Mexico taxes
    **FX movement on foreign debt principal** -- a US bond portfolio can
    generate taxable Mexican income from peso depreciation alone, with no
    USD economic gain -- and adds **10% on foreign dividends due by the
    17th of the following month**, a monthly self-assessment rather than a
    year-end event. Ecuador charges **5% on money leaving the country**, so
    repatriation, US obligations and estate settlement all carry a
    transfer cost. A model treating FX as display-layer conversion misses
    every one of these.

## 4. Engine changes

### 4.1 The central move

Build `jurisdictionForYear(inputs, year)` alongside `stateExtrasForYear`
(`src/calculator.js:6307`). Returns a resolved jurisdiction for that
iteration: either a domestic one (the existing `stateTaxState` family) or
a foreign one. Replace the four `inputs.stateTaxState` reads and their
sibling `inputs.stateTax*` reads with it, and pass the resolved value as
`solveWithdrawals`'s existing `stateType` parameter at `:6717`.

Do the same in `runMonteCarlo`'s second loop (`:7475`).

`calculateStateTaxes` already has 14 positional parameters. **Do not add a
15th.** The jurisdiction rides in `extras`, which is already the
per-year carrier.

Do not forget `stateEarlyDistributionTax` (`:2237`, called `:4152`).

### 4.2 The ledger row invariant

`src/calculator.js:7240-7254` asserts
`federalTax + stateTax + ficaTax === totalTaxesPaid` exactly, and
`taxSplitComplete.test.js` / `engineTaxSplit.test.js` enforce it.

Foreign tax must be a **fourth term**, not folded into `stateTax` -- the
semantics are different, the credit mechanics are different, and folding
them makes the Tax & Estate tab lie. So:

```
federalTax + stateTax + ficaTax + foreignTax - foreignTaxCredit === totalTaxesPaid
```

and both tests get updated in the same change. Add to the row:
`jurisdictionLabel`, `jurisdictionKind`, `foreignTax`,
`foreignTaxCredit`, `foreignTaxCarryforward`, `uncreditableForeignTax`,
`niitUncredited`.

**`uncreditableForeignTax` is the headline number of this whole feature.**
It is the money that exists only because of the move.

### 4.3 Order of operations

Per year, for a foreign-resident year:

1. Run the US engine unchanged (brackets, standard deduction, RMDs, SS
   inclusion, LTCG stacking, NIIT, AMT). Nothing about residence changes
   any of it.
2. Classify each income stream by `treatment[...]` to get a local taxable
   base. For `'remitted'` jurisdictions, see 5.4.
3. Compute local tax (brackets + surcharges + investment schedule, or the
   special regime if elected and unexpired).
4. Compute the FTC: cap at `US tax * (foreign-source taxable income /
   worldwide taxable income)`, per basket. Treat re-sourced income as
   foreign-source **only** where `treaty.resourcingAvailable` and the type
   is in `resourcedTypes`.
5. **Do not credit against NIIT.** Ever.
6. Carry excess credits forward (1 back, 10 forward, within basket). A
   simplified single-carryforward pool is acceptable for rung 2 but must
   be labelled as a simplification in the ledger tooltip, because basket
   blending flatters the answer.
7. Add wealth-style levies and unearned-income contributions. Never
   credit them.
8. Emit `uncreditableForeignTax = foreignTax - foreignTaxCredit`.

### 4.4 Currency

There is no FX anywhere in the codebase and the inflation machinery is
single-rate and US-anchored.

**Rung 1-3 decision: do not introduce multi-currency balances.** Keep
every balance in USD. Introduce exactly one input, `fxRate` (local units
per USD), used only to convert the jurisdiction's bracket thresholds into
USD at evaluation time, plus an optional `fxDrift` (annual %) so a user
can stress a weakening dollar. Show it as an assumption, prominently, with
the honest caveat that a 20% currency move swings a euro-denominated
retirement's purchasing power more than most tax differences between the
countries in our preset list.

Full multi-currency (local-currency spending, foreign-currency assets,
per-country inflation) is a rung 5+ question and probably its own spec.

---

## 5. The tax policy surface

### 5.1 What we model

- Local income tax by income type, from a bracket table or an effective
  rate.
- Special regimes, **including their expiry**.
- The foreign tax credit with the Section 904 limitation, and the
  re-sourcing switch that makes it function on US-source income.
- NIIT with zero foreign offset.
- Roth treatment as a first-class three-state flag.
- Wealth-style non-creditable levies.
- Health/social contributions on unearned income where they exist.
- Loss of ACA, loss of Medicare utility, Part B keep-or-drop.
- Foreign inheritance/succession tax on residents.
- The state-domicile question, as an explicit user assertion.

### 5.2 Specific rules worth hard-coding

- **US Social Security is exempt from *US* tax** for residents of Canada,
  Egypt, Germany, Ireland, Israel, Italy (recipient must also be an
  Italian citizen), Romania and the United Kingdom (IRS Pub 915). This is
  a real US-side exclusion, not just an allocation, and it is cheap to
  model: a boolean on the treaty record.
- **France is an outlier and deserves its own flag.** The treaty's Art. 18
  is source-state exclusive for pensions, and Art. 24(1)(b) extends a
  French credit to US-source dividends, interest and capital gains. Net
  French tax on a US retiree's US-source stack is close to zero. Two
  caveats the model must carry: *taux effectif* (exempt income still
  raises the rate on income France does tax), and CSG/CRDS scope for a
  non-affiliated resident, which is the most technically delicate item in
  the entire dataset.
- **Germany is the worst case for a Roth-heavy plan, and it is confirmed,
  not inferred.** Section 408A Roths are not qualified plans for German
  purposes; distributions can be ordinary German income while being
  tax-free in the US, so there is no US tax for the German tax to credit
  against. Germany also taxes US Social Security exclusively (the US
  exempts it), has no LTCG preference at all (flat ~26.4%
  Abgeltungsteuer), no special regime of any kind, and charges health/care
  contributions on unearned income. **If the app ever recommends Roth
  conversions to a user who has flagged a German move, that is a bug.**
- **Mexico is the Roth question the research could not answer, and it
  matters more than Germany's, because Mexico is the largest real
  destination.** No authority was found in either direction on whether
  Mexico taxes Roth distributions -- it has no domestic recognition of the
  wrapper. Worse: because it does not recognise the wrapper, there is a
  real argument SAT looks **through** the account and taxes dividends,
  interest and realised gains **annually inside it**, with no deferral at
  all. Mexico's REFIPRE anti-deferral regime (LISR Arts. 176 ff.) may or
  may not reach a US retirement account; **if it does, tax-deferred growth
  collapses entirely.** This is the top item for the cross-border CPA
  engagement.
- **Mexico's pension exemption is a 16-point swing on a coin flip.** Art.
  93-IV/V LISR exempts pensions up to 15x the daily UMA (about USD
  34,700/yr for 2026). If it reaches a foreign pension, USD 60k of
  retirement income goes from **23.2% to roughly 7.1%** effective. The
  statutory text ties it to IMSS/ISSSTE and Mexican retirement regimes;
  expat sources assert it covers foreign pensions; **no SAT criterio or
  court decision was found.** Ship it as a user-toggleable assumption
  **defaulted OFF**, and never present a single Mexico number.
- **Japan's inheritance tax is the highest-stakes item in the dataset.**
  10-55% on the beneficiary's share with a roughly JPY 30m + 6m/heir
  exclusion (about USD 200k + 40k) -- an order of magnitude below the US
  exclusion. Table 1 visa holders are exempt on overseas assets only while
  resident fewer than 10 of the last 15 years; past that, or on a Table 2
  status (spouse of a Japanese national, permanent residency), the entire
  worldwide estate is in scope. **Japan has no retirement visa**, so the
  realistic route in is precisely the status that loses the carve-out.
  This earns a hard warning, not a number.
- **Thailand: encode current law, not the pending relaxation.** Por.
  161/2566 (effective 2024-01-01) taxes foreign income whenever remitted;
  Por. 162/2566 permanently exempts pre-2024 income. The widely-reported
  2025 relaxation had **not** cleared Cabinet or the Royal Gazette as of
  mid-2026. The LTR Wealthy Pensioner exemption (Royal Decree 743) **is**
  in force and is the real answer for Thailand.
- **Malaysia's foreign-source exemption runs to 2036**, not 2026 -- it was
  extended ten years in Budget 2025. But it is conditioned on the income
  having been "subjected to tax in the country of origin," which **Roth
  distributions and muni interest arguably fail.** No source addresses
  this. Flag it; do not silently assume exemption.
- **No US treaty**: Malaysia, Singapore, Taiwan (the Expedited Double-Tax
  Relief Act status is unresolved), Vietnam (signed 2015, never entered
  into force). Vietnam is the only country in the set that taxes worldwide
  income with no treaty -- the worst structural combination -- and has no
  retirement visa. It ships as a warning, not a preset.

### 5.3 What we deliberately do NOT model

State plainly in the UI, because the honest list is a feature:

- Partial-year residency and split-year apportionment. We move on
  1 January of `fromYear`. Real moves are messy; the error is bounded and
  one-off.
- Form 1116 mechanics per basket per country. We approximate with two
  baskets (passive, general) plus a re-sourcing switch.
- PFIC taxation. Instead we **warn**: after moving abroad a US citizen
  should hold US-domiciled funds or individual securities only, because
  essentially every non-US mutual fund, ETF, UCITS and SICAV is a PFIC and
  the default Section 1291 regime taxes gain at the top ordinary rate with
  a compounding interest charge. This collides with EU PRIIPs/MiFID II,
  which bars EU-resident retail investors from buying US-domiciled ETFs.
  That collision is a real planning constraint and belongs in the Action
  Plan, not the arithmetic.
- FBAR / Form 8938 / Form 8833 compliance. Warn, with the Form 8833
  $1,000 penalty named. Add a **recurring compliance cost line** the user
  can set (practitioner-consensus range is $1,500-$5,000+/yr; label it an
  estimate, it has no authoritative source).
- Exit tax. Out of scope, with an explainer saying why (section 1).
- Totalization agreements, except as a warning for a user with residual
  self-employment income in a non-agreement country (Thailand, Malaysia,
  Vietnam, Taiwan, Philippines, Mexico and most of Latin America are all
  absent from the 31 agreements in force).
- Local wealth-tax valuation subtleties, situs rules, and every
  region-level variation we have not gathered.

### 5.4 Remittance-basis countries

Thailand, Japan (NPR window), Ireland (non-dom), and to a degree Malaysia
and Singapore tax foreign income only when brought in. This is not a rate
question; it is a **cash-flow** question, which is exactly what this
engine is.

Minimum viable model: a `remittedShare` input (% of the year's foreign
income brought into the country), defaulting to spending divided by total
draw. Two refinements that matter and can wait:

- Thailand's Por. 162 pre-2024 bucket: money earned before 2024 is exempt
  whenever remitted. That makes "which dollars did you remit" a real
  basis-tracking question, structurally similar to the Roth layer
  tracking the engine already does (`rothLayers`).
- Japan aggregates remittances against the year's total foreign income
  regardless of what the taxpayer says the money was. **Do not model it as
  source-tracing.**

---

## 6. Non-tax consequences that change the cash flow

These are not decoration. For most users they are larger than the tax
difference.

### 6.1 ACA goes away

Every ACA branch in the engine is already gated on `onMarketplace`
(`:5495`), which is the clean cut: make it **false** for foreign-resident
years. That switches off `acaSubsidyAnnualValue`, the cliff threshold,
`acaSubsidyProtectionEnabled`, `acaCliffProtectionEnabled`,
`inAcaCoverageGap`, `ACA_NON_EXPANSION_STATES` and
`getFederalPovertyLevel` in one move.

The Marketplace is organised by state of residence; an expat has no state
exchange, and a marketplace plan has no foreign provider network anyway.
Note the tension the app should surface: keeping a US state address to
stay marketplace-eligible directly undermines domicile severance.

Replace with a `foreignHealthcareCost` line, defaulted from the preset's
`healthcare.annualCost`, and be honest about the two realities:

- Where public access is residence-based (Portugal SNS, France PUMa after
  3 months, Ireland, Japan NHI, Taiwan NHI, Korea NHIS), cost is low and
  this is frequently the single biggest reason retiring abroad pencils
  out at all. Taiwan is the standout: comprehensive NHI at roughly
  USD 300-400/yr for a non-employed resident.
- Where it is not (Thailand, Malaysia, Singapore, Philippines, Vietnam;
  Germany in practice for a 65-year-old who cannot join GKV), the retiree
  is on international private cover, and that curve is steep: roughly
  USD 8k-23k/yr at 65 rising 71-77% by 75, with **most insurers refusing
  to write a new policy after about 75-80**. That uninsurability cliff is
  a hard constraint the model should express, because it interacts
  directly with the next section.

### 6.2 Medicare: the keep-or-drop decision

Medicare covers essentially nothing outside the US -- three narrow
exceptions, all of which require you to be in or adjacent to the US.
Medigap foreign-travel emergency benefit is 80% after a $250 deductible
with a **$50,000 lifetime cap**: a travel benefit, not expat coverage.

So Part B while abroad is a near-pure cost bought as an **option on a
penalty-free return**:

- 2026 standard Part B premium $202.90/mo ($2,434.80/yr), plus IRMAA.
- Dropping it incurs a Part B late-enrollment penalty of **+10% of the
  standard premium per full 12-month period, for life**, on re-enrollment.
  **Foreign coverage does not stop the clock** -- CMS is explicit that
  coverage "not from current active employment" does not count. There is
  no expat exception.
- Part D LEP is +1% of the national base premium (2026 base $38.99) per
  uncovered month, also for life.
- Part A is premium-free at 40 quarters; never decline it.

**IRMAA still applies regardless of residence.** Residence is not an IRMAA
variable. So a user who keeps Part B abroad keeps paying IRMAA surcharges
on Roth conversions they made to optimise a US retirement they are no
longer having.

Engine work: today enrollment is age-only (`membersOver65`, `:5580`) and
there is **no non-enrollment concept at all**. Add `medicarePartBRetained`
(default true). Critical implementation note from the seam map: gate the
**charge**, not the `irmaaMagiHistory` append -- the lookback is a pure
array index and the true-up logic breaks if history is sparse.

Surface the breakeven: dropping pays off for long or permanent moves; for
a ~5-year absence it is close to a wash, and the penalty compounds against
longevity. Pair it with the IPMI age-75 uninsurability constraint, because
the bad outcome is a retiree who dropped Part B, became uninsurable
abroad, and has no fallback but the penalty.

### 6.3 Social Security payability

SSA cannot pay into **Cuba and North Korea** (Treasury sanctions), and as
a policy matter not into **Azerbaijan, Belarus, Kazakhstan, Kyrgyzstan,
Tajikistan, Turkmenistan or Uzbekistan** without restricted-condition
exceptions. A boolean on the jurisdiction record; a hard warning, not a
number. Non-citizen spouses face a separate 6-month rule, which matters
for the mixed-nationality households the engine already models.

### 6.4 Estate and succession

Today `stateCode = inputs.stateOfResidence` at `:9802`, and the estate is
valued at plan end. **The correct jurisdiction is residence in the final
projection year, not residence today.** That is a behaviour change for
existing plans even before any foreign country is involved, and it needs
its own changelog line and its own test. The UI mirrors at
`TaxEstateTab.jsx:1187-1222` and `App.jsx:3722` read
`inputs.stateOfResidence` directly and would otherwise show the wrong
jurisdiction.

`STATE_ESTATE_INHERITANCE_TAX_TABLE` (`:8918`) already dispatches on
`estateMethod` (`'ny'`, `'threshold2011'`, `'credit2011'`,
`'scheduleOnExcess'`, `'scheduleOnWhole'`). A foreign entry slots in as a
new method rather than a parallel table. Note that foreign systems are
overwhelmingly **beneficiary-level** (France, Germany, Spain, Ireland CAT,
Japan) rather than estate-level, and the engine's per-heir loop
(`calculateHeirEstateTax`) already supports that shape.

Lookups fall back to $0 for an unknown code (`:9266`, `:9310`), so a
foreign code silently yields zero today. That is the safe failure mode and
should stay -- but it means an unmodelled country must **warn**, or a user
reads $0 as an answer.

Worth-flagging asymmetries already found: Ireland's CAT has a 5-year grace
period for a non-Irish-domiciled person; Japan's 10-of-15 rule; Korea
taxes the estate of a resident decedent on worldwide assets at up to 50%
and the residence test is a *different* test from the income-tax 5-of-10
rule; Portugal, Malaysia and Singapore have **no** inheritance tax at all.

---

## 7. Presets as data

`src/config/jurisdictions/` -- one file per country, each exporting one
jurisdiction record plus its special regimes.

**The engine must be correct independent of every preset.** A preset is a
prefill. Three rules make that real:

1. **Every record carries `vintage`.** The UI shows "Portugal preset, last
   verified September 2026" and turns that into a visible staleness
   warning after 18 months. We will not keep 14 foreign tax codes current
   and we should not pretend otherwise.
2. **`'unknown'` is a first-class treatment value that emits a warning
   instead of a number.** Roth treatment is `'unknown'` in most countries
   and we say so. It is better to show a user "we do not know how Portugal
   taxes your Roth, and neither does the internet -- ask a cross-border
   adviser" than to show a confident wrong figure. This is the same
   discipline `KNOWN_ISSUES.md` already applies to the US engine.
3. **Every preset ships with a citation and a confidence tier**, the same
   way `src/config/sources.js` works today. Tier 1 = national tax
   authority or PwC/Big-4 country guide fetched and quoted. Tier 3 = a
   practitioner blog. The UI shows the tier.

### 7.1 What we own, and what we hand to the user

**SETTLED 2026-09-18 (John).** Accuracy is owned for the destinations US
retirees actually go to. Everywhere else is served by a first-class
**Custom Country** option, not by a thin preset pretending to be one.

Applying that criterion required knowing where retirees actually go. That
research is in `RELOCATION_RESEARCH.md` Part 1, and it changed the answer
twice over.

#### The market is roughly a tenth of what the category's marketing implies

- **SSA: 733,078 beneficiaries residing in foreign countries, December
  2025**, growing about **1.2%/yr** -- slower than the US 65+ population.
  Retirement abroad is **not** booming. That figure is a floor (many keep
  a US address) and it includes many non-Americans.
- **No country-level breakdown exists.** Verified directly: the SSA 5.J
  table series has no country detail in any edition checked back to 2020.
  Every published ranking traces to Pinto/AARO (a citizenship-eligibility
  model with modeled second-generation extrapolation, built for tax
  advocacy), FVAP, or State's withdrawn 9 million. Pinto and FVAP disagree
  on Mexico by **2.2x**.
- **Mexico's famous ~800,000 US-born residents are mostly children.**
  500,000-600,000 are minors -- US-citizen children of Mexican return
  migrants. The 55+ share in the 2000 census was **7.9%**. Real US
  retirees in Mexico: **plausibly 60,000-80,000**, which independently
  matches the ~58,000 SSA figure journalists cite.
- **Where age data exists, the numbers are small.** Portugal: 12,443
  Americans, **~3,200 aged 65+**. Spain: 50,623, of whom 15.2% are 65+ --
  and 54% are under 50, so **Spain is a study-abroad destination that
  contains some retirees.** Portugal is the one country whose age curve
  genuinely leans old (55% of its Americans are 50+), and it is small.
- **Japan, Germany and Korea are military artifacts.** DMDC counts 54,288
  active duty in Japan alone against Pinto's 111,021 Americans. They reach
  the top of published lists through two unrelated errors pointing the
  same way.

**Consequence for the roadmap: a country RANKING cannot be shipped as a
factual claim, but TIERS can.** And the total addressable market for the
foreign half of this feature is far smaller than the ask implied -- which
is itself an argument for keeping the foreign layer cheap to maintain and
leaning on Custom Country.

#### Settled preset list

| Wave | Countries | Why |
|---|---|---|
| 0 | **Custom Country** | Ships with the engine, ahead of every preset. Section 7.2 |
| 1 | **Mexico, Portugal, Panama, Costa Rica** | The only defensible tier-1/tier-2 set. Mexico is the largest real population and the only one of the four that actually taxes this persona; Portugal has the one age curve that proves a retirement destination; Panama and Costa Rica are the two cleanest 0% cases and exercise the territorial path |
| 2 | Spain, France, Italy | The European ask. France is where the app changes the answer most; Italy has a live 7% regime |
| 3 | Thailand, Philippines, Belize, Uruguay | Tier-2 Asia plus the two genuine Latin American tax regimes |
| 4 | Ireland, Germany, Greece, Malaysia | Germany is the Roth cautionary tale and earns its place on that alone |
| 6 | **Colombia** | Asked for by John (2026-10-02, changelog 355) despite the earlier cut. RELOCATION_RESEARCH.md Part 9 |
| -- | Japan, Korea, Taiwan, Vietnam, Ecuador, Singapore | **Cut.** Custom Country serves them. Japan/Korea are military artifacts; the rest are low population and high maintenance |

**Wave 1 changed on the evidence.** The previous draft had the European
four. Portugal survives; Spain, France and Italy move to wave 2 on
population; Mexico, Panama and Costa Rica enter. **Germany stays in the
plan despite a trivial retiree population purely because it is the
worked example of a country destroying a Roth**, and that warning is worth
more than its market size.

### 7.2 Custom Country -- the generic bucket as a shipped feature

**SETTLED 2026-09-18 (John).** Not a fallback. A named, supported option
in the country picker, and the thing that makes the feature honest for the
long tail.

A user picks "Other country" and supplies:

- **Country name** (free text, display only -- it drives nothing).
- **Local tax treatment**: either a single **effective rate** on
  retirement income, or the full bracket table if they know it. Effective
  rate is the default, because a user who has talked to a local adviser
  knows their rate and not the schedule.
- **A separate investment-income rate**, optional, defaulting to the same
  figure.
- **Roth handling: an explicit toggle, taxable or not taxable.** This is
  the field the whole bucket exists for. It is a plain, unavoidable
  question -- *does your destination tax Roth withdrawals?* -- with a
  third option, "I do not know," which selects the `'unknown'` state and
  surfaces the warning rather than a number. A user who does not know is
  told that is a normal answer and that it is worth asking a cross-border
  CPA, because it is the single largest determinant of whether their
  conversion strategy survives the move.
- **Treaty**: a single "does the US have a tax treaty with this country"
  toggle plus a re-sourcing toggle, both defaulting to off. Off is the
  conservative direction -- it understates the credit and overstates the
  tax.
- **Wealth tax and inheritance tax**: optional, off by default.
- **Healthcare cost** and **whether Medicare Part B is retained**.

Everything else in the jurisdiction record takes a conservative default.
The output carries the same uncreditable-residue decomposition a preset
does, and the same extra disclaimer (section 8.1). **A Custom Country
answer is not marked as lower quality than a preset** -- a user who got
their rate from their own adviser has better data than our preset does.
What it is marked as is *user-supplied*, so nobody mistakes it for
something we verified.

This is also the release valve on the maintenance bill: if a preset goes
stale and we cannot refresh it, we can retire it to Custom Country with
its last-known figures as the prefill, rather than shipping a wrong
number under our own name.

**Known-stale or unverified items that must NOT ship without a
verification pass** (carried forward from the research, so the next person
does not have to rediscover them):

- Roth treatment in Portugal, Spain, Italy, Ireland, Greece, Japan, Korea,
  Taiwan, Thailand, Vietnam -- **unverified everywhere except France
  (likely protected) and Germany (confirmed not protected)**. This is the
  largest gap in the dataset and the one most likely to matter. It
  deserves its own research pass before wave 1 ships.
- Every treaty **article number**. None were verified against a treaty
  text except France. Do not encode article numbers.
- Italy's 7% regime: duration 9 vs 10 years, and the municipality
  population limit 20,000 vs 30,000, both conflict across sources.
- Greece's 2026 PIT reform -- the bracket table we have is almost
  certainly pre-reform. Also: the US-Greece treaty is a **1950** treaty
  with no modern pensions article. Do not build Greece by analogy.
- Ireland: whether foreign *pension* income sits inside or outside the
  non-dom remittance basis. That single question is the entire Irish
  preset.
- Germany: the 2026 GKV contribution rates and assessment ceiling -- a
  ~20-point marginal cost.
- Spain: regional PIT and inheritance scales, and the post-2013-protocol
  allocation of US Social Security.
- Philippines: the SRRV was restructured in 2026; schedule not obtained.
- Malaysia: whether Roth and muni interest fail the "subjected to tax"
  condition.

### 7.3 The maintenance bill

Be honest about this before committing, because it is the strongest
argument for the generic-engine-plus-data split.

`TAX_UPDATE_PROCESS.md` currently covers one tax code. The waves above add
roughly a dozen, each with brackets that move annually, special regimes that open
and close, and treaty positions that shift (HMRC reversed its US-pension
lump-sum position in March 2025; the Federal Circuit killed treaty-based
NIIT credits in August 2026; Italy's lump sum went EUR 200k -> 300k in the
2026 Budget).

Mitigations, in order of preference:

1. **The generic engine is the product; presets are a convenience.** A
   user who enters their own effective rate gets a correct answer from a
   stale build.
2. **Vintage stamps + staleness warnings** turn a maintenance failure into
   a disclosed limitation rather than a silent wrong number.
3. **An annual verification pass per wave**, not per country, scheduled
   the same way the US pass is.
4. Resist the tail. Vietnam and Korea cost as much to maintain as
   Portugal and serve a tiny fraction of the users -- which is why they
   are cut to Custom Country above. Apply the same test to wave 4 before
   building it.

---

## 8. Product surfaces

### 8.1 Disclaimer posture -- a second, heavier disclaimer for foreign years

**SETTLED 2026-09-18 (John): non-US modelling carries an EXTRA disclaimer,
separate from and on top of the app's standard one.**

The reason is not legal caution for its own sake. It is that the two
halves of this feature are not the same quality of thing and the user
cannot tell by looking. The US engine rests on a tax code we have read,
an EA review that closed 23 questions, and first-party IRS/SSA/CMS
citations enforced by `sources.test.js`. The foreign layer rests on PwC
country summaries, practitioner blogs, and in several places an explicit
"nobody knows." Rendering both in the same table in the same typeface is
itself a claim, and it is a false one.

Rules:

1. **Every surface that shows a foreign-resident year carries the extra
   disclaimer**, not just the settings screen where the move was entered.
   A user who lands on the Year Ledger from a bookmark must see it.
2. **It names the specific weakness**, not a generic "consult a
   professional." Wording to the effect of: *this projection models
   non-US tax law from secondary sources, it is not reviewed by a
   cross-border tax professional, treaty positions and special regimes
   change without notice, and the figures for [country] were last
   verified [vintage]*.
3. **It is not dismissible for the session.** Standard disclaimers can be
   acknowledged once. This one persists on foreign-year surfaces, because
   the risk is not "did you read it once" but "are you looking at a number
   we cannot stand behind right now."
4. **`'unknown'` fields escalate it.** If any income type in the active
   jurisdiction resolves to `'unknown'` -- Roth above all -- the
   disclaimer gains a line naming that field and saying the projection
   excludes it. A silently omitted tax is worse than a flagged one.
5. **Custom Country gets its own variant**: the figures are the user's
   own, we have verified nothing, and the output is only as good as what
   they entered.
6. **Domestic years do not get it.** Rung 1 is US state law, same sourcing
   discipline as the rest of the engine, and burying a US state move under
   an international-law warning devalues the warning where it counts.

The standard disclaimer stays exactly as it is. This is additive, and it
is scoped to foreign-resident years only.

### 8.1a Disclaimer wording -- APPROVED by John (2026-09-19); Custom Country banner shipped in changelog 196

Placement: a banner at the top of every surface that shows a year spent
abroad (Dashboard, Year by Year, Tax & Estate, Cash Flow, the printable
report, and the Where you live panel). It cannot be dismissed. The first
paragraph always shows; the lines under it appear only when their
condition is true. `[...]` is filled in from the plan.

**Banner, Custom Country (rung 2):**

> **Years abroad use your own figures.** From [2033] this plan treats you
> as a resident of [Portugal] and taxes you using the rates and rules you
> entered. We have not checked them. The app works out the US side itself
> -- US tax on your worldwide income, and the credit for tax you pay
> abroad -- but the foreign side is only as good as what you put in.
> Before you act on these numbers, check them with an adviser who handles
> both US and [Portugal] tax.

**Banner, preset country (rung 3 -- drafted now so one approval covers
both):**

> **Years abroad are estimates.** From [2033] this plan treats you as a
> resident of [Portugal], using our summary of its rules, last checked
> [September 2026]. It has not been reviewed by a cross-border tax
> professional, and foreign tax law, tax treaties and special regimes can
> change without notice. Before you act on these numbers, check them with
> an adviser who handles both US and [Portugal] tax.

**Always shown under either banner:**

> As a US citizen you owe US tax wherever you live. Moving abroad does not
> end it, and some of it -- including the 3.8% tax on investment income --
> cannot be reduced by tax you pay abroad.

**Conditional lines:**

- *Roth choice (a), respect the Roth:*
  > You told this plan [Portugal] does not tax your Roth. Many countries
  > do, and for most there is no settled answer. If yours does, this plan
  > understates your tax.
- *Roth choice (b) or (c):* no warning. The ledger labels the Roth tax as
  having no US credit.
- *Final year abroad, no foreign estate estimate entered:*
  > Foreign inheritance or estate tax is not included. Many countries
  > charge one, and it can be large. You can add your own estimate under
  > Life Events > Where you live.
- *Final year abroad, estimate entered:*
  > Foreign inheritance tax uses your estimate of [12]% of the estate. It
  > is added on top of US estate tax; the two are not credited against
  > each other, so this may overstate the total.
- *Old state still assumed to tax you (ties not cut):*
  > [California] can keep taxing a former resident who has not clearly cut
  > ties, and it gives no credit for foreign tax. This plan keeps charging
  > [California] tax until you tell it you have cut ties.

**Texas-route hint** (in the Where you live panel, when a move goes
straight abroad from CA, NY, NM, SC or VA -- a hint, not part of the
banner):

> Leaving [California] straight for another country? [California] can keep
> taxing a former resident who has not clearly cut ties. A common route is
> to move to a state with no income tax -- Texas, Florida or Nevada -- and
> live there for six months or more before leaving the US. You can plan
> that here as two moves.

**Country-summary lines -- APPROVED by John (2026-09-21), shipped in
changelog 197.** They live in `src/config/jurisdictions/*` (per-country
Roth and inheritance lines, assumption warnings) and
`ForeignYearsNotice.jsx`:

- *Roth, when the move keeps our answer:* "Our Portugal summary taxes the
  earnings in your Roth withdrawals as income. That rests on advisers'
  practice, not an official ruling." (Panama and Costa Rica: our summary
  does not tax your Roth, because the country taxes only income earned
  there.)
- *Edited:* "You changed some of our [country] figures. The plan uses
  yours, and we have not checked them."
- *Stale:* "Our [country] summary was last checked [month], more than 18
  months ago. Its figures may be out of date."
- *Mexico pension exemption on:* "You applied Mexico's pension exemption to
  your US pensions. No Mexican authority has confirmed that it covers them;
  if it does not, this plan understates your Mexican tax."
- *Inheritance, per country:* e.g. "Our Portugal summary finds no tax on US
  assets passing to a spouse, children or parents."

### 8.2 Surfaces

Premium area id `relocation`, name **"Relocation & Residency"**. Per the
settled packaging principle, this is one entry in `PREMIUM_AREAS` and no
component or test change.

Free / paid split (chosen to match the "split" instinct without making the
free tier *wrong*):

- **Free: the domestic residency timeline.** Moving from Texas to
  California in 2033 changes the plan's arithmetic materially, and a free
  user who cannot express it gets a wrong answer, not a limited one. This
  also fixes the existing estate-jurisdiction bug (section 6.4) for
  everyone.
- **Premium: everything foreign.** The jurisdiction engine, presets,
  FTC/NIIT modelling, Roth-abroad analysis, the Medicare keep-or-drop
  decision, and the stay-vs-move compare.

Surfaces:

1. **Settings -> Life Events** (already labelled that, `SettingsTab.jsx:4385`)
   gains a "Where you live" panel above the milestone editor. Relocation
   and big-ticket events are the same user mental model -- "things that
   happen on a date" -- and they should share a screen.
2. **A stay-vs-move compare.** One lever, two projections, one number:
   lifetime after-tax spending difference, decomposed into state tax
   saved, foreign tax added, uncreditable residue, healthcare delta, and
   Medicare penalty exposure. `src/utils/oneLeverCompare.js` is the
   existing pattern -- **and `cashflowengine_irmaa_compare_174_175`
   records two traps in it (pure-module and silent-no-op) that this must
   not repeat.**
3. **Year Ledger** gains a jurisdiction column and the foreign tax /
   credit / uncreditable columns, so the regime-expiry cliff and the
   Part B decision are visible year by year.
4. **Action Plan** (`src/utils/actionPlan.js`) gains the items that are
   not arithmetic: the domicile-severance checklist, the Form 8833 filing,
   the PFIC portfolio constraint, the Part B decision deadline, the
   special-regime application window (Greece's is 1 January - 31 March;
   missing it costs a year), and the Canadian-style "no Roth conversions
   after you become resident" rule where it applies.
5. **The display-drift rule applies with full force.** Per
   `cashflowengine_roadmap_2026_09_14`, this app has shipped the same bug
   twice: a display surface recomputing a value the engine already emits.
   A feature this arithmetic-heavy is the most likely place for a third.
   **Every figure on every relocation surface reads a field off the ledger
   row. No UI-side recomputation. No exceptions.**

---

## 9. Build order

Each rung ships and is useful alone.

**Rung 1 -- domestic residency timeline (free). SHIPPED, changelog 195.**
As built: row fields are `residenceState` / `stateTaxJurisdiction` and the
estate result carries `estateStateCode`; Monte Carlo needed no change (its
second loop only draws returns, then calls runProjection); the
state-to-jurisdiction map is now shared with the Settings soft-link, which
fixed Virginia mapping to a 5% flat rate. Original scope:
`residencyTimeline` input, `readResidencyTimeline()` normalizer,
`jurisdictionForYear()`, the four call sites,
`stateEarlyDistributionTax`, the Monte Carlo loop, jurisdiction on the
ledger row, the Life Events UI panel. Plus the estate fix: `stateCode`
becomes residence in the final projection year.
*Gate: a plan with an empty timeline is bit-for-bit unchanged.*

**Rung 2 -- the foreign engine AND Custom Country (Premium).** Merged
2026-09-18 (John): an engine with no screen can only be tested in code.
`kind: 'foreign'`, the jurisdiction record, local tax from user-entered
brackets or an effective rate, the FTC with the 904 limitation in two
baskets (passive / general) with carryforward and the re-sourcing switch,
**NIIT with no offset**, the fourth ledger term and the updated invariant,
`fxRate`. ACA off, `medicarePartBRetained` with the late-enrollment
penalty on a return to the US, `foreignHealthcareCost`, unearned-income
contributions, the Pub 915 "US does not tax my Social Security here"
toggle, the three-way Roth choice and the foreign estate estimate (both in
section 11). Free users see a locked card with nothing to fill in.
*Gate: a user who knows their own numbers gets a correct answer with no
preset in the build. Ship gate: the section 8.1 disclaimer wording is
approved.*

**Rung 3 -- presets wave 1 + the compare.**
Wave 1 presets with vintage stamps and confidence tiers, plus the
stay-vs-move compare. **Blocked on two gates: the Roth research pass, and
the CPA engagement it feeds.** (Custom Country moved to rung 2.)

**Rung 4 -- special regimes and their expiry.**
Italy 7%, Greece 7% and the EUR 100k lump sum, Italy Art. 24-bis with
vintage grandfathering, remittance basis. Auto-inserted expiry step
changes. Presets wave 2.

**Rung 5 -- the estate layer and Asia.**
Foreign inheritance via a new `estateMethod`, the residence-duration rules
(Japan 10-of-15, Ireland 5-year CAT grace). Presets wave 3. Japan ships
with the hard warning.

**Rung 6 -- if it earns it.**
Wave 4, multi-currency, per-country inflation, partial-year apportionment.

---

## 10. Tests

Clone `src/__tests__/stateRetirementIncome.test.js`. Its structure is the
right one: a header comment naming the changelog id and the question the
test exists for, named imports from `../calculator`, a small `args()`
builder to tame the positional signature, unit assertions, then
`runProjection(...).years[n]` end-to-end assertions against a baseline.

Non-negotiable cases:

- **The regression contract.** Empty `residencyTimeline` -> every ledger
  field identical to the pre-feature run, across several plan shapes.
  Model it on that file's existing "leaves every other jurisdiction
  unchanged" test.
- The move year itself: year N-1 uses the old jurisdiction, year N the
  new, no double-count.
- The tax-split invariant with a foreign layer, in
  `taxSplitComplete.test.js` / `engineTaxSplit.test.js`.
- **NIIT is never reduced by foreign tax.** A direct assertion, because
  this is the rule most likely to be "helpfully" broken by a future
  change, and because the law on it moved in August 2026.
- Roth distribution in a `rothDistribution: 'ordinary'` jurisdiction
  produces foreign tax with **zero** credit.
- Special-regime expiry: the year after `durationYears` jumps to the
  ordinary scale.
- Part B dropped: no `irmaaCost`, but `irmaaMagiHistory` still appends.
- Estate uses final-year residence, not `inputs.stateOfResidence`.
- `inputCoverage.test.js` and `sources.test.js` both pass -- they fail in
  both directions and are not optional.

**Heed the fake-key trap in DEVELOPMENT.md**: `sanitizeInputs` passes unknown
keys through silently, so a test that sets a misspelled input key gets
default behaviour and passes green while asserting nothing. This has
shipped a dozen fake keys before. Mutate every fix and confirm the test
goes red. Note also that the sandbox cannot run vitest (see
`cashflowengine_sandbox_limits`) -- verify by executing the real test file
under a shim in the cloud container, never by reimplementing its
assertions.

---

## 11. Decisions, and what is still open

### Settled 2026-09-18 (John)

1. **The Roth research pass happens before wave 1. It is a hard gate on
   rung 3.** No country preset ships until it is done. It is the largest
   verified gap -- unknown in 10 of the 14 jurisdictions researched, with
   a defensible answer only for France (likely protected) and Germany
   (confirmed not protected) -- and it is the question a US retiree with a
   converted Roth actually has. Expect it to need a **cross-border CPA**
   rather than more searching; the general sources genuinely do not answer
   it. Same shape and same standard as the EA review that closed out
   TAX_RULES_SPEC section 6.
2. **Own accuracy for the destinations US retirees actually go to; serve
   everywhere else with Custom Country.** Sections 7.1 and 7.2. Taiwan,
   Korea and Vietnam are cut from the preset list on that basis.
3. **Rung 1 ships free on its own.** Domestic residency timeline plus the
   estate-jurisdiction fix. A free user who moves states currently gets a
   wrong answer rather than a limited one, and that is not a good place to
   put a paywall.
4. **Foreign years carry an extra disclaimer** on top of the standard one,
   on every surface, non-dismissible, escalating on `'unknown'` fields.
   Section 8.1.

### Rung 2 decisions -- settled 2026-09-18 (John)

1. **Rung 2 and Custom Country ship together.**
2. **Roth abroad is a three-way user choice, not a known/unknown flag.**
   Replaces the earlier taxable / not taxable / "I don't know" toggle:
   - **(a) Respect the Roth** -- no foreign tax on withdrawals or growth.
   - **(b) Treat it as a taxable account** -- the country looks through
     the wrapper and taxes the account's dividends, interest and realised
     gains each year at its investment-income rate, as it would a
     brokerage account. The worst case (Mexico's possible look-through,
     Colombia).
   - **(c) Tax withdrawals at a rate I enter** -- a flat foreign rate on
     each Roth withdrawal. Covers Germany-style "taxed on distribution."
   No option is preselected: the move cannot be saved until one is chosen,
   so the flattering answer is never a silent default. Foreign tax on a
   Roth never earns a US credit (there is no US tax on it to offset), so
   (b) and (c) are pure added cost, and the ledger says so.
3. **The Texas route.** Old-state domicile is still assumed until the user
   says ties are cut. When a move goes straight abroad from CA, NY, NM, SC
   or VA, the panel suggests planning a move to a no-income-tax state
   first, which rung 1 already expresses as two moves.
4. **Estate when the final year is abroad:** apply the last US state's
   estate/inheritance tax if ties were not cut, show the "foreign
   inheritance tax" warning, AND offer a user field for a **blended foreign
   estate/inheritance tax estimate**, a percentage applied to the gross
   estate after any charitable bequest. Added on top of US federal and
   state estate tax, with no credit between them (IRC s 2014 and the estate
   treaties can credit foreign death taxes; not modelled, and disclosed).
5. **Medicare Part B:** retained by default; if dropped and the timeline
   returns to the US, charge the lifetime late-enrollment penalty (10% of
   the standard premium per full year without coverage).
6. **FTC depth:** two baskets (passive, general) plus carryforward.
7. **Disclaimer:** drafted in section 8.1, approved before rung 2
   ships.
8-14. **Defaults accepted:** one FX input for brackets only; healthcare
   abroad as a user-entered cost on medical inflation; unearned-income
   contributions in rung 2, wealth tax deferred to the Spain preset;
   remittance-basis countries deferred to rung 4; the Pub 915 SS toggle;
   free users see a locked card; NIIT never credited, with its own test.

### Rung 3 decisions -- settled 2026-09-20 (John)

1. **The CPA gate is relaxed to a labelled ship.** The Roth research pass
   ran (`RELOCATION_RESEARCH.md` Part 4) and wave 1 ships without a
   cross-border CPA review, each preset showing its confidence, the month
   it was checked, and its sources. Items with no authority behind them
   (Mexico's Roth, Mexico's pension exemption) are never prefilled. A CPA
   review later raises confidence; it no longer blocks.
2. **Presets prefill the Roth answer where the research supports one.**
   Panama and Costa Rica: respect (territorial, high confidence). Portugal:
   a new fourth option, *earnings taxed as ordinary local income*
   (practitioner consensus, low-medium). Mexico: blank -- the move cannot
   be saved until the user chooses.
3. **The stay-vs-move compare is split out** to the next pass (changelog
   198), so rung 3 lands as two reviewable commits.

### Rung 6 decisions -- settled 2026-09-21 (John)

1. **All four of wave 4 ship**: Germany, Ireland, Greece (with the art. 5B
   7% regime as an opt-in, and Greece crediting US tax item by item --
   the relief direction rung 4 deferred), Malaysia (foreign-income
   exemption to 2036, then remittance basis with a 50% credit for US tax,
   no treaty).
2. **Cost of living is one % per move**, not per-country inflation or a
   second currency. Presets carry a Numbeo 2026 national average as a
   suggestion; it is never applied without a click.
3. **Split year by month.** A move takes effect from a chosen month; that
   year's state tax, foreign layer, health cover and living costs are
   month-weighted. **A move home from abroad is always January** -- the
   foreign layer is priced only for the months of a move out; the
   normalizer enforces it.
4. The two new warning lines (regime end, per-heir foreign inheritance
   on the user's own figures) are approved as written.
5. Multi-currency and per-country inflation stay out.

### Rung 4 decisions -- settled 2026-09-21 (John)

1. **Italy, Spain and France** ship as wave 2. Greece waits for wave 4: its
   1950 treaty has no citizen re-sourcing, so where its 7% is relieved
   (Greece crediting US tax, not the US crediting Greece) needs its own
   treatment. Any user can still enter a regime under Another country.
2. **Lump-sum regimes are modelled** (Italy art. 24-bis EUR 300k + 50k per
   family member, 15 years), not creditable by default -- the preset says
   plainly it is added on top of full US tax.
3. **A wealth-style tax on balances is in the engine now** (Italy's IVAFE,
   Spain's solidarity tax), never credited.
4. **Remittance basis moves to rung 5** with Thailand and Malaysia.


1. **RESOLVED 2026-09-18 -- the preset list is locked** (section 7.1),
   and the answer is not a ranking. A defensible country ranking of US
   retirees abroad **does not exist**: SSA publishes no country breakdown,
   State withdrew its estimate, and the two most-cited sources disagree on
   Mexico by 2.2x. Tiers are defensible where ranks are not, so the list
   is built on tiers plus one deliberate exception (Germany, kept for its
   Roth warning rather than its population). See `RELOCATION_RESEARCH.md`
   Part 1. **The finding that should inform everything else: the market is
   roughly a tenth of what the category's marketing implies, and it is
   growing at about 1.2%/yr.** If anyone wants to close this properly, the
   only real route is a FOIA to SSA for beneficiaries by country
   cross-tabulated by benefit type *and citizenship*.
2. **Does the Roth pass cover the whole preset list or just wave 1?** A
   cross-border CPA engagement scoped to four countries costs less than
   one scoped to twelve, but a second engagement later costs more than
   doing it once. Depends on how firm the preset list is when the pass is
   commissioned -- which is another reason to settle open item 1 first.
3. **Does the market size change the Premium packaging call?** The
   foreign layer now looks like a small-audience, high-maintenance
   capability. That is an argument for leaning harder on Custom Country
   and shipping fewer presets, not for abandoning it -- the users who do
   move need it badly and nothing else serves them -- but it is worth
   deciding deliberately rather than by momentum.
4. **Exact disclaimer wording**, per the constraints in 8.1. Worth a pass
   by someone who is not the person who wrote the feature.
5. **Does Custom Country need the Roth toggle surfaced in the Interview**,
   not only in Settings? It is the highest-consequence single field in the
   feature and the Interview is where users who do not know what they do
   not know get caught.

---

## 12. Sources

US mechanics: IRS Pub 514, Pub 915, the FTC and FEIE pages, Rev. Proc.
2025-32, Form 8938/FBAR comparison, Form 8854 instructions, expatriation
tax page; Treasury 2016 US Model Convention; CAFC *Christensen v. United
States*, No. 2024-1284 (Fed. Cir. 2026-08-31); CMS 2026 Parts A & B fact
sheet and the National Training Program expat module; Medicare Pub 11037;
SSA EN-05-10137, the Social Security Fairness Act page, and the
international agreements overview.

Migration, destination and Latin American country data: see
**`RELOCATION_RESEARCH.md`**, which carries the full record with per-claim
sourcing, confidence grades and an explicit list of what could not be
verified.

Country records: PwC Worldwide Tax Summaries per country; Italy's 2026
Budget Law reporting for the Art. 24-bis increase; Thai Revenue Department
Orders Por. 161/2566 and 162/2566 plus Royal Decree 743; Malaysia Budget
2025 for the FSI extension; CRA Folio S5-F3-C1 for the Canadian Roth
election mechanics.

Full citation set, per-claim, with the explicit uncertainty register, is
in the research transcript for this session. **Before any preset ships,
its figures get re-verified and cited in `src/config/sources.js` under the
existing first-party-URL rule.**
