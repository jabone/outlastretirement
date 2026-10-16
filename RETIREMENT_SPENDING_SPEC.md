# Retirement Spending — Module Spec (v7, complete)

*(Renamed from `INCOME_BLUEPRINT_SPEC.md` / "Income Blueprint" on 2026-09-05 —
see §10.1 for why. Same document, continuous history; §1–§9 are unchanged from
v4 and remain settled.)*

**Project:** OutlastRetirement (formerly cashflowengine)
**Status:** **BUILT AND SHIPPED — all seven §9 steps complete**, changelogs
134, 135, 137, 138, 139, 140 (plus 136, the mortgage/consumer-debt split).
Seven decisions settled 2026-09-04 (§1a); the premium offering defined and
packaging settled 2026-09-05 (§10 — **one Premium, not two products**).

Free: the spending residual readout, the category ledger, per-category
inflation, the derived shape, the essential/discretionary flag.
Paid: the retirement bridge, the guaranteed-income floor + floor-aware
guardrails, and transaction import. All gated on plain `isPremium` — the
one-Premium decision meant zero entitlement work across the whole module.
**Read §1b first** — it states the problem the module exists to solve, and it is
not the one the phone draft (or v2/v3 of this file) was aimed at.
**Then read §10** if the question is commercial rather than technical: what the
paid surface is, what it is called, and why it joins the existing Premium
rather than becoming a second thing to buy (§10.6).
**Reconciled against:** `a6cba0d` (changelog 131), 2026-09-04.
**Supersedes:** the 2026-09-03 phone draft (`blueprint-module-spec.md`, sent by
email). That draft was written without the repo in context and
several of its premises are factually wrong about this app. Section 0 below
lists every correction; do not work from the emailed version.

---

## 0. Corrections to the phone draft

Read this section before anything else. The draft is not a small trim — its
central premise is wrong, and roughly half of what it proposes as premium
features already ship free.

**0.1 "The free app has one income number and one inflation rate." — False.**
`DEFAULT_INPUTS` in `src/calculator.js` already carries, all free:

| Draft called it "new" | Already shipped as |
|---|---|
| Phase curve (go-go / slow-go / no-go) | `lifestyleThreePhaseEnabled`, `goGoEndAge`, `goGoMultiplier`, `slowGoEndAge`, `slowGoMultiplier`, `noGoMultiplier` — plus a separate `goGoBumpEnabled`/`goGoBumpRate`/`goGoBumpEndAge` travel bump |
| Per-category inflation | `inflationRate`, `taxBracketInflationRate`, `ssCOLA`, `medicalInflationRate`, `medicarePartBInflationRate`, `medicarePartDInflationRate`, `ltcInflationRate`, `housingInflationRate` |
| Housing as its own category | `housingExpensePct` carves housing out of the blended budget and grows that share at `housingInflationRate` |
| Pre-Medicare coverage gap shock | `healthcareBridgeCost` per spouse pre-65, split by `healthcareBridgePremiumPct`, with `hsaPreMedicarePremiumsQualified` for the Pub. 969 exception cases |
| LTC shock | `ltcActive1/2`, `ltcCost1/2`, `ltcStartAge1/2`, `ltcDurationYears1/2`, `ltcEndsInDeath1/2` — fully independent per spouse, which is *better* than the single household LTC event the draft proposed |
| Monthly spending detail | `lifestyleExpenseInputMode: 'annual' \| 'monthly'` with a 12-month `lifestyleExpenseMonthly[]` |
| — | `currentSpendingMode` / `currentHouseholdSpendingCustom`: pre-retirement spending is already modelled separately from the retirement target |
| — | `survivorExpenseDropPct`, `spendingGuardrails`, `stressInflationStrategy` |

Rebuilding any of the above inside a paid module would be selling the user
something they already have. **The Blueprint's job is to derive
`lifestyleExpense` from a category ledger, not to re-invent the phase curve
sitting downstream of it.**

**0.2 §6.1 "gross-up requires an iterative solve" — already built.**
`solveWithdrawals()` (calculator.js ~L3423, comment: *"Withdrawal solver that
handles circular tax feedback loop"*) already solves the gross draw that nets
the required spend, per year, accounting for bracket movement, the OBBBA
senior-bonus phase-out, Roth ordering rules, pro-rata pre-tax basis, realized
gains at the tracked basis ratio, and capital-loss carryforward. This is not a
Blueprint deliverable and must not be re-specced as one.

**0.3 §6.2 "withdrawal sequencing" — already built.**
`withdrawalStrategy: 'TaxableFirst' | 'PreTaxFirst' | 'RothFirst' | 'ProRata'`.
The open question is not *whether* to sequence but whether the
essential/discretionary split should influence it (see §5.2).

**0.4 §6.3 "ACA vs. Roth conversions is the module's strongest premium
demo" — mostly already built, and free.** The app ships
`acaSubsidyProtectionEnabled` (forces Roth conversions up to the 100% FPL floor
in a non-expansion state), `acaCliffProtectionEnabled` (caps pre-65 conversions
so MAGI stays under 400% FPL), `acaSubsidyAnnualValue`, `ACA_NON_EXPANSION_STATES`
/ `getFederalPovertyLevel()`, an ACA/FPL column with GAP badges in the Year by
Year ledger, and two `planFeedback.js` cards explaining both states. Claiming
this as the headline premium payoff would be overselling. The honest, *narrow*
contribution Blueprint can make is stated in §5.4 — it is a real one, but it is
one input, not a new capability.

**0.5 `runProjection()` does not take named vectors.** Its real signature is
`runProjection(rawInputs = DEFAULT_INPUTS, monteCarloReturnOverride = null)`,
where `rawInputs` is the flat plan object that `sanitizeInputs()` normalizes.
Any `spendByYear[]` lives as a **key inside `inputs`**, not as a new parameter.
The draft's engine-contract snippet cannot be implemented as written.

**0.6 There is no tier integer to break.** `entitlementState` in `App.jsx` is
`{ tier: 'free' | 'premium', isPremium, portfolioPreview, ... }` and the JWT
payload carries a single `premium: true` claim. The draft's advice (independent
flags) is directionally right, but the migration it implies is different from
the one it describes — see §2.

**0.7 There are no SKUs, no prices, and no checkout.** `premiumOffering.js`
says so in the user's face: *"Access is invite-only right now. There is no
checkout, no subscription, and nothing to cancel"* and *"What does it cost?
Nothing today. There is no payment flow built, and no price set."* It also
carries a hard rule — *every entry in `PREMIUM_FEATURES` names something that
works in the shipped build today. Nothing aspirational.* Three-SKU pricing
mechanics are therefore premature; §2 keeps the entitlement *shape* decision
(which is cheap now and expensive later) and drops the pricing rules.
Separately, `INTEGRATION_STRATEGY.md` records that pricing leans
**subscription, specifically so access can be revoked** — the draft's
one-time-purchase / "upgrade for the price difference, no repurchase" framing
contradicts a decision already on the books.

**0.8 Holdings data is not scenario state.** `usePortfolioHoldings` stores to
its own keys (`cfe_premium_holdings_v1`, `cfe_premium_liquidations_v1`);
scenarios are separate (`retire_plan_scenarios`, snapshots of `inputs`). So
"mirror Holdings: own slice of scenario state" is self-contradictory — see §4.1
for why Blueprint should probably go the *other* way.

**0.9 The free-tier teaser as described would be dishonest.** "Show free users
a greyed line for what a phased curve would do to their number" — free users
already have the phased curve. See §4.3 for a teaser that is actually true.

**0.10 Scenario-save caps are a poor fit for this app.** All data is in the
user's own browser; there is no account, no server, and no user registry (the
Premium tab advertises exactly that as a feature). There is nobody to
"grandfather" because there is no list of who exists, and a localStorage cap is
trivially bypassed. See §7.

**0.11 Recurring lumpy replacements are ~90% already built, and free.**
`inputs.milestones[]` (calculator.js ~L4832) already does dated,
inflation-adjusted, account-targeted outflows across a `startAge`–`endAge`
span, with a `fundedExternally` flag for money set aside outside the modeled
accounts. The only thing missing for "a roof every 20 years" is an
every-N-years cadence inside that existing loop. That is a small free-tier
enhancement to Milestones, **not** a premium Blueprint feature — and removing
it from Blueprint's scope also removes one of the two arguments for a spending
vector (§3).

---

## 1. What this module is

The plan's retirement spending target, `lifestyleExpense` (default $48,000), is
its weakest input: one box, one guess, compounded by everything downstream.
Everything *after* that box is modelled well — phase curve, housing carve-out,
healthcare bridge, per-spouse LTC, guardrails, FI number — and all of it
inherits whatever went into it.

This work replaces the guess. **Not primarily with a category ledger** — see
§1b: the originating question was *"how do I know what I spend? I don't have a
budget"*, and a ledger asks the user to supply exactly the budget they said
they do not have. The module is a four-rung funnel from "what you actually
spend today" (which the engine already computes and never shows anyone) to a
retirement target the user can defend. The ledger is rung 3 of that funnel, not
the product.

## 1a. Settled decisions (2026-09-04)

Seven decisions, made with the code in front of us. Do not re-litigate these.

| # | Decision | Rationale |
|---|---|---|
| 1 | **Engine shape: level × shape.** `lifestyleExpense` stays the scalar level. Blueprint adds an optional normalized `spendShapeByYear[]` (mean 1.0) as one more factor in the L4602 chain, and a separate `essentialShareByYear[]` fraction. | §3 |
| 2 | **Ledger is FREE; the essential/discretionary analytics are paid.** | §2, §5 |
| 3 | **Ledger lives in `inputs`, as a third input mode.** `lifestyleExpenseInputMode: 'annual' \| 'monthly' \| 'categories'`, in Plan Settings → Spending. | §4 |
| 4 | **The ledger OWNS `housingExpensePct` and `healthcareBridgeCost`** when categories mode is on — derived, read-only, badged, with an ungated Unlink. | §4.2 |
| 5 | **The essential/discretionary flag is free; only what it computes is paid.** | §5.2 |
| 6 | **The module is a discovery funnel, and the retirement bridge leads.** Rung 1 (surface the residual, free) then rung 2 (current → retirement worksheet, paid), before the ledger. | §1b, §9 |
| 7 | **Transaction import is in scope as the endgame**, built last — but the ledger's data shape must be import-ready from day one. | §5.4 |

---

## 1b. The real problem: discovery, not structuring

**The question that started this (John, 2026-09-04):** *"How do I know how much
I need in living expenses each month? I am guessing because I don't have a good
budget. I could be very wrong."*

A category ledger does not answer that question. It turns one guess into seven
guesses. That is a real improvement — categories jog memory, and independent
errors partly cancel instead of compounding — but someone without a budget
cannot fill in a ledger from knowledge they do not have. The ledger **structures**
a number; the question asks how to **discover** one.

**The app already computes the answer and never says so.** `currentSpendingMode`
defaults to `'auto'`, and calculator.js L5601 runs, every pre-retirement year:

```js
currentSpendingCost = salary + fixedInflows
  - baseTaxes - harvestTaxSavings
  - totalContributions - concentratedStockVestedInTotal;
```

That is the correct method for a household without a budget: money in, minus
money that provably was not spent, equals money that was. It **cannot miss a
category, because it never enumerates categories** — the failure mode of every
bottom-up budget. The surrounding comments show the subtractions were reasoned
about carefully (why debt is deliberately excluded, why harvested tax savings
and vested-in shares must come out).

Today it is used only as an internal pre-retirement input. It is never surfaced
as a figure, never labelled as what the household spends, and never connected
to `lifestyleExpense` — the retirement target the user is guessing at. In auto
mode, Plan Settings shows no number at all; the value appears only, unlabelled,
in the Year Ledger's Lifestyle Expenses column.

### The funnel

Four rungs, increasing effort and accuracy. The module is the funnel, not the
ledger.

| Rung | What it does | Tier | Effort |
|---|---|---|---|
| 1. **Top-down residual** | "You spend about $X/yr today." | Free | Tiny — the math already runs |
| 2. **Retirement bridge** | Current spend → a defensible `lifestyleExpense` | **Paid** | Moderate |
| 3. **Category ledger** | Refine and shape the number (§5.1) | Free | Moderate |
| 4. **Transaction import** | Build the ledger from real bank/card data | **Paid** | Large |

Rung 1 is free because it is a readout of arithmetic the engine already
performs; metering it would be charging for the app's own honesty. Rungs 2 and
4 are the paid module — that is a far stronger answer to "why would anyone pay
for this" than the ledger alone, which was the phone draft's entire pitch.

**Decided 2026-09-04: build rung 2 first** (with rung 1 as its input), then
rung 3, then rung 4. Rung 4 is **in scope as the endgame**, so the ledger's data
shape must be import-ready from day one (§5.4) — that is cheap now and a
painful retrofit later.

### Rung 1 — surface the residual (free)

Show the computed figure in Plan Settings → Spending whenever
`currentSpendingMode === 'auto'`, with its derivation visible (income, minus
taxes, minus savings) rather than as a bare number. Two honest caveats belong
in the UI copy, not buried in the Guide:

- It absorbs one-off years. The year you replaced a car reads as high spending.
  Offer the prior year alongside, or a two-to-three-year average.
- It is only as good as the salary, tax and contribution inputs behind it. It
  is a residual, so every error upstream lands in it.

### Rung 2 — the retirement bridge (paid)

A guided worksheet from "what you spend now" to `lifestyleExpense`. This is the
module's actual product.

**The double-counting rule, which is what makes this hard.** In retirement,
L5617 computes:

```js
expensesExcludingTaxes = lifestyleCost + goGoBump + healthcareBridge
  + ltcCost + irmaaCost + milestoneOutflowGeneral + totalDebtPayment
  + giftThisYear.gifted;
```

So `lifestyleExpense` is **not** total retirement spending — it is total
retirement spending *minus everything the model already adds as its own line*.
The bridge's output must therefore **exclude**: health costs before 65
(`healthcareBridge`), long-term care (`ltcCost`), Medicare and IRMAA
(`irmaaCost`), mortgage and other debt service (`totalDebtPayment`, which the
model amortizes on its own schedule and stops automatically at payoff),
lifetime gifting, and one-off life events (`milestones`). A bridge that
subtracts current debt service and current health premiums but forgets to, will
overstate the target by five figures a year, silently.

Sketch, all of it reconciled against what the engine already models:

| Step | Direction | Why | Already modelled? |
|---|---|---|---|
| Start: residual or confirmed current spend | — | Rung 1 | — |
| Payroll taxes, FICA | already out | The residual subtracts `baseTaxes` | Yes |
| Savings and contributions | already out | The residual subtracts `totalContributions` | Yes |
| Current debt service | **subtract** | The model adds `totalDebtPayment` separately, on its own amortization | Yes — must not be inside the target |
| Current health premiums / out-of-pocket | **subtract** | `healthcareBridge` (pre-65) and `irmaaCost` (post-65) are separate lines | Yes — must not be inside the target |
| Work costs that stop: commuting, parking, lunches, work clothes, dues, a second car | **subtract** | Not modelled anywhere | No — safe to subtract |
| Retirement lifestyle increases: travel, hobbies, grandchildren | **add** | The phase curve shapes the *level* over time; it does not set it | Shape yes, level no |
| One-off events (a wedding, a new roof, a move) | **exclude** | Belongs in Milestones | Yes |

Output: a `lifestyleExpense` the user can defend line by line, plus a plain
statement of what it deliberately does not include and where each excluded item
lives in the app instead. That last part is most of the value — the current
single box gives no hint that health, debt and LTC are modelled elsewhere, so
users almost certainly double-count them today.

---

## 2. Free / paid line

**Free:** the top-down residual readout (rung 1, §1b), the category ledger,
per-category inflation, the derived shape, the essential/discretionary
checkbox, and the Milestones every-N-years cadence (§0.11).

**Paid:** the retirement bridge (rung 2, §1b) — the guided walk from current
spending to a defensible `lifestyleExpense`; the guaranteed-income-floor
readout (does SS + pension + annuity cover the essentials, and from what
year?) and floor-aware guardrails (§5.2); and transaction import (rung 4,
§5.4).

Why the residual and the ledger are free: `lifestyleExpense` is the single
input most likely to be wrong in every plan in the wild, free and paid alike.
Fixing it upgrades the credibility of the whole app, which is the product's
actual moat. Metering it would be charging for the app's own accuracy — and
rung 1 in particular is a readout of arithmetic the engine already performs
whether anyone paid or not.

Why this is a defensible upsell: a free user sees what they spend today (rung
1) and marks each ledger line essential or discretionary. They then see, in
their own numbers, that $52,000 of their $71,000 is essential. What they cannot
get without paying is the translation of today's spending into a retirement
target that does not double-count the health, debt and LTC lines the model adds
separately — and whether their guaranteed income covers the floor. The teaser
is their own data, not a hypothetical, which is the standard
`premiumOffering.js` sets for itself.

**Entitlement shape (smaller than the draft assumed).** No locked tab, no
second nav item — the ledger is in Plan Settings like every other plan input.
The flag gates a readout and a guardrail behavior.

> **⚠️ SUPERSEDED 2026-09-05 by §10.6.** John chose **one Premium** rather than
> two separately-purchasable modules, so the per-module `modules: { holdings,
> spending }` shape below is NOT being built. Plain `isPremium` covers it. The
> block is kept because it is the design to return to if Premium is ever split;
> §10.6 explains why that stays possible. **Do not implement it as written.**

The shape that was designed for separable purchase:

```js
entitlementState = {
  modules: { holdings: bool, spending: bool },
  isPremium,        // = any module true (back-compat alias)
  portfolioPreview, // unchanged
}
```

A legacy token (`premium: true`, no `modules` claim) maps to
`{ holdings: true, spending: false }`. The minted keys are the registry, which
is why this grandfathering is solvable where §7's was not.
`scripts/mint-premium-jwt.mjs` gains a modules argument; the Preferences key
field reports which modules a pasted key carries.

**Audit before flipping any `isPremium` call site.** Several are deliberately
not about entitlement — `initialBalancesSource` is documented as ungated so a
lapsed user is never locked out, and SettingsTab's Unlink is ungated for the
same reason. Blueprint inherits that rule (§4.2). *(Under §10.6's one-Premium
decision no existing `isPremium` site changes at all — all 43 of them keep
meaning exactly what they mean today. This audit only becomes necessary if
Premium is ever split.)*

---

## 3. Engine contract — level × shape

**The choke point.** calculator.js L4602:

```js
lifestyleCost = inputs.lifestyleExpense
  * blendedLifestyleMultiplier    // housingSharePct blend of housing vs general inflation
  * phaseMultiplier               // go-go / slow-go / no-go
  * lifestyleSpendingCutMultiplier
  * survivorExpenseMultiplier;
```

**Why a dollar vector was rejected.** Four shipped features treat
`lifestyleExpense` as a scalar dial they scale or overwrite:

1. Tornado sensitivity, `×(1 ± 10%)` — two call sites (~L7005 nominal, ~L7074
   real-deflated).
2. `findDieWithZeroSpending()` (~L7148) — a **40-iteration binary search that
   sets `lifestyleExpense` to a probe value**.
3. The required-portfolio solver (~L8898) — `lifestyleExpense: targetLifestyleExpense`.
4. The Action Plan's Auto-Max levers, which lean on the same machinery.

A `spendByYear[]` in dollars replaces the scalar, so all four need rework and
Die-With-Zero loses the variable it searches over. The phone draft called the
vector the single most important decision in the file; it is, but the answer
runs the other way.

**The contract.** Blueprint contributes a *shape*, never a level:

```
inputs.spendingBlueprint = {
  categories: [{ id, label, amount, inflationRate, essential: bool }, ...],
  // derived, written by the UI, not hand-edited:
  //   lifestyleExpense      = sum(amount)          -- the level, unchanged in role
  //   housingExpensePct     = housing share        -- see 4.2
  //   healthcareBridgeCost  = pre-65 premium line  -- see 4.2
}
```

and the engine gains, at most, two optional per-year series:

- `spendShapeByYear[]` — normalized to mean 1.0, multiplied into the L4602
  chain as one more factor.
- `essentialShareByYear[]` — a **fraction**, not dollars.

Everything keeps working because the solvers scale the level and the shape
rides along multiplicatively. And a floor expressed as a share stays coherent
under Die-With-Zero's search, which a dollar floor would not.

**The shape is not a premium construct.** `blendedLifestyleMultiplier` is
already an N-way inflation blend with N = 2 (housing at `housingInflationRate`,
the rest at `inflationRate`). Seven categories at seven rates is the same
arithmetic with more terms. The shape generalizes a free feature and therefore
belongs on the free side of §2 — consistent, not a concession.

**No premium branch in `runProjection()`.** `essentialShareByYear` is either
present in `inputs` or it is not. Absent, guardrails behave exactly as today
(freeze the inflation multiplier on a negative-growth year; 10% cut after a
retirement-entry crash). The engine branches on **data presence, never on
entitlement** — which is the rule the draft wanted and, unlike its version,
this one is actually enforceable.

**Nice consequence for Die-With-Zero.** The solver overwrites `lifestyleExpense`
on a throwaway inputs copy, so the ledger's categories no longer sum to the
probe — but the shape and essential share are ratios and stay valid. Report the
result as a **scale factor on the ledger** ("you could spend 8% more across the
board, or $340/mo more on travel alone"), which is more useful than a bare
number anyway.

**Hardening note.** `sanitizeInputs()` coerces numbers and booleans but passes
objects and arrays through **untouched**, defaulting only when `undefined`. A
malformed or partial `spendingBlueprint` from an old backup would reach the
engine unchecked. The ledger needs its own normalizer — clamp rates, drop
malformed rows, recompute the sum — called where `makeRothLayers` is called,
not left to `sanitizeInputs`.

---

## 4. UI

**4.1 A third input mode.** `lifestyleExpenseInputMode` is already
`'annual' | 'monthly'`, and its own comment says it is *"purely a data-entry
convenience: calculator.js and every projection function only ever read the
annual `lifestyleExpense` total."* Categories mode is that idea one level
deeper: the ledger sums to `lifestyleExpense` exactly as the twelve monthly
boxes do (SettingsTab L1064 is the branch to extend). Free-tier plan inputs
belong in Plan Settings → Spending, where `SETTINGS_DOMAINS.spending` already
exists.

Precedent for structured data inside `inputs`: `milestones: []` is a single
`DEFAULT_INPUTS` key holding an array of objects, documented as one concept —
one `InputReference` row, one `inputCoverage` entry, and it rides into saved
scenarios and `fullBackup` for free. `spendingBlueprint` follows it exactly.
This is also why the ledger does **not** get a Holdings-style sibling
localStorage key: "what if we spent $20k less" is a scenario question, and
scenario comparison is the app's best analytical tool.

**4.2 The ledger owns two existing fields.** Both traps are structural, not
documentation problems:

- *Housing.* `housingExpensePct` carves a share of the blended budget to grow
  at `housingInflationRate`. A housing category states the same fact. Both
  active = housing weighted twice.
- *Health.* Worse, because it is **additive**, not a blend. L5617 sums
  `lifestyleCost + goGoBump + healthcareBridge + ltcCost + ...`, where
  `healthcareBridge` is `healthcareBridgeCost` **per living spouse under 65**
  (L4615), net of `acaSubsidyAnnualValue`. A user with "health — $9,000" in the
  ledger *and* the $12,000 bridge default double-pays in exactly the pre-65
  years the ACA cliff logic is most sensitive to.

So in categories mode the ledger **derives and owns** them, copying
`initialBalancesSource` including its safety properties: the field goes
`disabled` with a source badge, and the **Unlink button is not
entitlement-gated** and does not destroy the ledger.

- `housingExpensePct` ← the housing line's share of the total.
- `healthcareBridgeCost` ← a dedicated **pre-65 premium** line, which also
  derives `healthcareBridgePremiumPct` from its own premium/out-of-pocket
  split. Keep this line distinct in the UI from routine ongoing health
  spending, which is a normal category running all years.
- `acaSubsidyAnnualValue` stays **manual**. It is an estimated *subsidy*, not a
  cost; the ledger cannot know it. Blueprint's contribution to the ACA work is
  making the cost side real, which is what the cliff cap and the subsidy
  estimate are both measured against.

**4.3 Field states for `lifestyleExpense`.** `lifestyleExpenseSource` is not
needed as a separate key — the existing `lifestyleExpenseInputMode` already
carries it. `'categories'` implies derived: show the computed total, read-only,
badged, with the mode switch itself as the revert path. Switching back to
`'annual'` must preserve the ledger, exactly as switching out of `'monthly'`
preserves `lifestyleExpenseMonthly` today.

**4.4 Documentation is part of the feature.** Per `DEVELOPMENT.md`: a
`changelog.js` entry at the top of the array (unique id, one-sentence
`summary`, or a test fails), a `GuideTab.jsx` accordion update, and an
`InputReference.jsx` row. Plus `inputCoverage.js` — `inputCoverage.test.js`
re-derives the Interview/Settings gap from source on every run and fails if the
file disagrees, so a new free-tier input either gets asked in the Interview or
gets listed as a known gap. Decide which for the ledger (§8).

---

## 5. Scope

**5.1 Category ledger (free).** Line items in categories, each with its own
inflation rate, summing to `lifestyleExpense`. Default set chosen to reconcile
with what the engine already knows: housing (owns `housingExpensePct`), health
— routine, plus a separate pre-65 premium line (owns `healthcareBridgeCost`) —
food, transport, travel, gifts/support, other.

The reconciliation *back into existing inputs* is the highest-value plumbing
here and is what makes this more than a budgeting calculator.

**5.2 Essential/discretionary (flag free, analytics paid).** The checkbox is
one control per row and ships free, so the upsell can quote the user's own
numbers. Paid:

- **Guaranteed-income-floor readout** — does SS + pension + annuity cover the
  essential floor, in which years, and by how much?
- **Floor-aware guardrails** — today `spendingGuardrails` freezes the inflation
  multiplier after a down year and cuts 10% after a retirement-entry crash,
  uniformly. With a floor it can trim discretionary *toward* the floor instead
  of cutting the whole budget, which is what a real household does.

**5.3 Milestones every-N-years (free, separate work).** See §0.11. Worth
shipping on its own regardless of Blueprint.

**5.4 Transaction import (paid, last phase — but shape for it NOW).** Point the
existing statement machinery at a checking / credit-card export instead of a
brokerage statement. `statementImport.js` is already deliberately
institution-agnostic ("no hardcoded per-brokerage column template, no whitelist")
and `StatementImportPanel.jsx` already implements the
**extract → edit → confirm → commit** pattern with human review before anything
is committed. A bank CSV is the same architecture aimed at a different document
— which is why this is the endgame rather than a different product.

It is the last phase because bank data is the messiest input in the app and
auto-categorization is a rabbit hole. But the ledger must be **import-ready from
day one**, or rung 4 forces a migration of everyone's hand-built ledger:

- Line items are a **flat array carrying a category id**, not a fixed
  seven-key object. Import produces many lines per category; a fixed shape
  cannot hold them.
- Category ids are **stable canonical strings** (`housing`, `health`, …),
  never array indices or display labels. Import rules, and any future rule the
  user writes, key off them.
- Every line carries `source: 'manual' | 'import'` and an optional
  `importedAt`, so a re-import can replace imported lines without destroying
  hand-entered ones. This is the single cheapest decision now with the largest
  payoff later.
- Line items keep an optional free-text label, so an imported line can retain
  the merchant description that justifies it.

**Explicitly NOT in scope** — all already shipped, all free: the phase curve,
per-spouse LTC, the pre-65 bridge mechanism itself, tax gross-up
(`solveWithdrawals`), withdrawal sequencing (`withdrawalStrategy`), and the ACA
subsidy/cliff machinery. See §0. A *probabilistic* LTC event is the one
arguable addition and belongs with Monte Carlo, not here.

---

## 6. Tax-side integration

1. **Gross-up** — done (`solveWithdrawals`). No work.
2. **Sequencing** — done (`withdrawalStrategy`). Open only as: should
   `essentialShareByYear` inform guardrail trimming? Yes — that is §5.2.
3. **ACA** — done. Blueprint only sources `healthcareBridgeCost` /
   `healthcareBridgePremiumPct` from the ledger (§4.2). **Ordering constraint:
   the ACA gap check runs *after* `solveWithdrawals` because Pre-Tax draws
   count toward MAGI (2026-08-28 fix). Do not move it.**

---

## 7. Scenario limits — dropped

The draft proposed free = working scenario + one save. Rejected: all data is in
the user's browser (`retire_plan_scenarios`), there is no account, server, or
registry — the Premium tab advertises exactly that — so there is nobody to
grandfather and the cap is a localStorage check anyone can clear. It also
throttles scenario comparison, which is the free tier's own best sales pitch.

If a free limit is ever wanted, gate something that costs real compute (Monte
Carlo iterations: `monteCarloWorker.js`, `monteCarloAsync.js`). Saves stay
unlimited.

---

## 8. Remaining open questions

All small enough to settle while building.

1. Default category set — is seven right, and is a custom-category escape hatch
   needed to keep the ledger from becoming a chore? (A ledger nobody finishes
   is worse than the one box it replaced.)
2. Essential flag at category level or line-item level.
3. Does the Full Interview ask about categories, or does `inputCoverage.js`
   list it as a known gap? (The test forces an explicit answer.)
4. ~~Naming.~~ **SETTLED 2026-09-05: the module is "Retirement Spending."**
   Rationale and the alternatives considered are in §10.1.
5. Deferred until billing is real: prices, bundling, upgrade paths. Note
   `INTEGRATION_STRATEGY.md` already chose **subscription over one-time
   purchase**, so the draft's "upgrade for the price difference, no repurchase"
   framing does not apply.

---

## 9. Build order

Ordered so the thing that answers the original question ships first, and so
each step is independently useful if the next never happens.

1. ~~**Rung 1 — surface the residual**~~ **SHIPPED 2026-09-05, changelog 134.**
   The figure, annual and monthly, with its four-line derivation and both
   caveats on the page. `runProjection` now reports a `currentSpending` object
   per pre-retirement row (income / taxes / contributions / non-cash
   adjustments / `derived` / `applied` / `trimmedByDeficit`); `SettingsTab`
   renders it in the auto branch that previously showed prose and no number.
   Pure reporting — GOLDEN and the whole demo are unchanged.

   **One thing in §1b did not survive contact with the code.** That section
   suggested offering "the prior year alongside, or a two-to-three-year
   average" to soften the one-off-year caveat. **The app has no prior-year
   data** — the projection starts at `planYear`, so every year available is a
   modelled future one. Averaging them would smooth modelled changes (a raise,
   Auto-Max switching on), not real one-off purchases, and would read as
   history the app does not have. What shipped instead: state the caveat
   plainly and point at the Custom toggle directly above, which is the actual
   remedy. Revisit only if rung 4's transaction import ever gives the app real
   history to average.
2. ~~**Rung 2 — the retirement bridge**~~ **SHIPPED 2026-09-05, changelog 135.**
   Plan Settings → Spending, below the rung-1 readout. `computeSpendingBridge`
   / `currentDebtService` / `readSpendingBridge` in calculator.js hold the
   arithmetic (pure, no projection change); `SpendingBridgePanel` in
   SettingsTab renders it. Three inputs in one `spendingBridge` key following
   the `milestones` precedent; current debt service is **derived** from
   `mortgagePayment + otherDebtPayment` rather than asked, per the module's own
   ask-only-what-cannot-be-derived rule.

   **Two decisions John settled while building.** *Apply is one-way*: a button
   writes `lifestyleExpense` once and the field stays editable — no source key,
   no badge, no disabled input. The `initialBalancesSource` live-link pattern
   was considered and rejected for the app's single most-edited input. *A free
   user gets a locked card with nothing to fill in* — the explanation and their
   own starting figure, but no worksheet fields, so nobody does the work and
   then meets a paywall. Both follow the one-Premium principle in §10.6: the
   burden is on us not to nickel-and-dime.

   Gated on plain `isPremium`, as §10.6 promised — no entitlement work was
   needed. `inputCoverage.test.js` failed on the new key exactly as §4.4
   predicted; `spendingBridge` is listed in `NOT_ASKED_IN_INTERVIEW` rather
   than added to the Interview, because the Interview is the free walkthrough.
   Inert by default (all three figures zero), so GOLDEN and the whole demo are
   unchanged.
3. **Milestones every-N-years cadence** (free, §0.11) — small, independently
   useful, touches nothing else. Slot it wherever it fits; it blocks nothing.
4. ~~**Ledger, annual-only**~~ **SHIPPED 2026-09-05, changelog 137.** Seven
   canonical categories plus a pre-65 health line and an escape hatch for
   custom ones; `spendingBlueprint` holds `{ lines, essentialCategoryIds,
   unlinkedFields }`. `readSpendingBlueprint` / `spendingBlueprintDerived` in
   calculator.js; `SpendingLedgerPanel` in SettingsTab. Engine untouched — the
   ledger sums at edit time exactly as the twelve monthly boxes do, and GOLDEN
   plus the whole demo are unchanged.

   §4.2's ownership is implemented: while the ledger is active it drives
   `housingExpensePct` and `healthcareBridgeCost` (+ premium split), both
   disabled with a "from your categories" badge and an **ungated Unlink that
   never destroys the ledger**. The pre-65 health line is excluded from
   `lifestyleExpense` because the projection adds `healthcareBridge` on its
   own line per living spouse under 65.

   **§8.1 and §8.2 settled by John:** seven categories with a custom escape
   hatch, and the essential flag at **category** level, not line-item — a
   per-line flag turns the ledger into bookkeeping, and a ledger nobody
   finishes is worse than the single box it replaces.

   **§8.3 settled, and it needed a correction.** `inputCoverage.test.js`
   flagged both `spendingBlueprint` AND `lifestyleExpenseInputMode`. The
   ledger is a genuine unasked option and is listed in
   `NOT_ASKED_IN_INTERVIEW`. `lifestyleExpenseInputMode` is NOT: the Interview
   does offer it, via `MonthlySpendingField`, which builds the key as
   `` `${k}InputMode` `` from a variable so the extractor cannot see a literal
   to match. Listing it as "never asked" would have been false, so it went to
   `LINK_STATE_KEYS` as the data-entry plumbing its own DEFAULT_INPUTS comment
   says it is.
5. ~~**The shape**~~ **SHIPPED 2026-09-05, changelog 138.** The first real
   engine change of the module. `blendedLifestyleMultiplier` generalized from
   a two-way blend (housing / everything else) to three-way when a ledger is
   driving the shape, adding a `currentMedicalMultiplier` that compounds at
   `medicalInflationRate` alongside the existing housing and general slices.
   `spendingShapeShares(inputs)` is the exported helper; rows now carry
   `medicalMultiplier` and `lifestyleShape`.

   **Deliberately mapped onto the three inflation rates the app already has**
   — general, housing, medical — rather than inventing a per-category rate
   nobody has set. `SPENDING_CATEGORY_INFLATION_GROUP` is that mapping.

   **The level × shape contract held exactly as §3 predicted.**
   `lifestyleExpense` is untouched as the scalar, so the tornado sensitivity,
   `findDieWithZeroSpending()`'s 40-iteration search and the
   required-portfolio solver all needed **zero changes** — the whole reason a
   dollar vector was rejected.

   **The safety property, asserted as a test:** a ledger whose housing share
   equals `housingExpensePct` and which budgets no ongoing health is
   **bit-identical** to the old two-way blend. GOLDEN and the whole demo are
   unchanged. The guardrail freeze pauses all three slices together.

   Verified by mutation: routing the medical slice back to the general rate
   makes the suite fail. Also note the DEFAULT_INPUTS plan is razor-thin
   (~$128k ending), so ANY added cost tips it to depletion — measure a shape
   change on a plan with margin or the effect looks like a cliff.

6. ~~**The essential flag** (free), then the **floor readout + floor-aware
   guardrails** (paid)~~ **SHIPPED 2026-09-05 — flag in changelog 137, the
   rest in changelog 139.** The module's second paid surface.

   `essentialShareOf(inputs)` returns a **fraction or null**, per §3 — never
   dollars, so it stays coherent under Die-With-Zero's search. Null means "say
   nothing", not "a floor of zero". Rows carry `guaranteedIncome`,
   `essentialSpending`, `essentialShare`, `floorGap`, `floorCovered`.

   **"Guaranteed" is deliberately narrow:** Social Security + pensions +
   a purchased annuity. Rental income is excluded (a tenant can leave) and so
   is a reverse-mortgage payout (borrowing, not income). `essentialSpending`
   is measured against the SETTLED `lifestyleCost`, so it already carries
   inflation, the phase curve, any guardrail cut and the survivor drop.

   **Floor-aware guardrails, and what they actually change.** The flat 10%
   post-crash cut quietly assumed every dollar was equally cuttable. With
   `floorAwareGuardrailsEnabled` the cut comes out of discretionary only and
   is capped at the discretionary share, so essentials are untouchable. This
   cuts BOTH ways and that is the point: at 20% essential the cut is 20% of
   total (deeper than today), at 75% essential it is 6.25% (shallower,
   because the household could never have made a 10% cut). Off by default;
   `discretionaryCutPct` (25%) is the user's policy, not ours.

   **Engine branches on the flag and on data presence, never entitlement** —
   §3's rule, so a lapsed subscriber's plan keeps projecting the same numbers.
   GOLDEN and the demo unchanged.

   **Testing note:** the guardrail only fires when
   `initialRetirementCrashOccurred`, which needs `returnRate < 0` in the
   household retirement year. Use `stressType: '1929'` with
   `stressStartMode: 'retirement'`; without it, on and off are identical and
   a comparison proves nothing.

7. ~~**Rung 4 — transaction import** (paid, §5.4)~~ **SHIPPED 2026-09-06,
   changelog 140. The module is complete.** `src/utils/spendingImport.js`
   (parser, pure) + `src/components/SpendingImportPanel.jsx` (the review
   gate), mirroring StatementImportPanel's extract → edit → confirm → commit
   rather than inventing a second import UX.

   **The day-one shaping paid off exactly as §5.4 predicted.** `source` and
   `importedAt` on every line since the ledger shipped meant
   `mergeImportedLines` is four lines and needs no migration: previously
   imported lines are replaced, hand-entered ones survive. Canonical category
   ids meant import rules key off strings that cannot drift.

   **Three bank-data problems handled explicitly, not hopefully:**
   - *Sign conventions disagree.* Detected from the data (whichever sign
     dominates an Amount column IS spending) and reported, so a user can see
     the file was read the way they meant.
   - *Transfers are not spending.* A card payment in a checking export plus
     the card's own charges double-counts the entire card. Likely transfers
     are flagged and excluded BY DEFAULT but still shown — a silently dropped
     row is a silently wrong budget.
   - *A CSV covers weeks, a ledger holds years.* The annualization factor is
     computed from the real date span and stated; under 60 days the UI says
     plainly that this is a large extrapolation rather than a measurement.

   Categorization is deliberately shallow — a keyword map, everything else
   marked "guessed" and landing in `other`, nothing that learns. §5.4 called
   auto-categorization a rabbit hole and it is: a confident wrong guess costs
   more than an honest shrug.

   No new input key (it writes `spendingBlueprint`), so `inputCoverage` needed
   nothing. GOLDEN and the demo unchanged; the parser is pure and the panel
   commits only on an explicit press.


**There is no entitlement work.** v4 and v5 of this file said the `modules`
change in §2 was first needed at step 2; §10.6's one-Premium decision removed
it entirely. Every paid surface here gates on the `isPremium` that already
exists, exactly as the holdings tab does. Step 2 is the first paid surface, and
all it needs is that existing flag.

Do not add anything to `PREMIUM_FEATURES` in `premiumOffering.js` until the
step it describes actually ships — that file's hard rule is that every entry
names something working in the shipped build today.

---

## 10. The premium offering

§2 settled *where the free/paid line falls*. This section settles *what the
paid thing is called, how it is described, whether it is a separate product
(§10.6: it is not), and what has to change in the code that describes it*.
Added 2026-09-05; §10.4/§10.6/§10.7 revised the same day after the
one-Premium decision.

Nothing here may be copied into `src/config/premiumOffering.js` yet — see
§10.5.

### 10.1 Name: "Retirement Spending"

Settles §8.4. **It names a capability area inside Premium, not a product for
sale** — see §10.6 and §10.7. The reasoning below is unchanged by that: an area
name has to do the same job of telling a user what they are getting. Detailed Holdings is the house style to match: two words, a
description rather than a slogan, and it says what you get rather than how it
will make you feel.

**Why not the alternatives.** "Income Blueprint" named the ledger, and the
ledger is free — the name would advertise the half nobody pays for. "Spending
Plan" fails the same way and more quietly: a category ledger *is* a spending
plan, so a free user who has built one would reasonably think they already had
the paid module. "Spending Bridge" describes the build-order lead feature but
not the thing with recurring value (§10.2).

**Why this one works.** It draws the free/paid line inside the name. Free is
about what you spend **now** — the residual readout, the ledger, the
essential/discretionary checkbox. Paid is about what you will need **then** —
the bridge, the income floor, floor-aware guardrails. When a user asks why the
checkbox is free but the floor readout is not, the answer is the module's own
name.

### 10.2 The one-time-wizard problem, and the fix

**The risk.** The bridge (rung 2) is the module's lead feature in §9's build
order and it is used *once*, at setup. Walk the worksheet, get a defensible
`lifestyleExpense`, never open it again. `INTEGRATION_STRATEGY.md` chose
**subscription over one-time purchase**, so a module whose headline feature is
a wizard is a module that feels unnecessary by month three. Detailed Holdings
does not have this problem — prices refresh, dividends land, allocations drift,
so there is a reason to open it every month.

**The fix costs nothing to build**, because the recurring value is already in
the paid set (§2); it is simply not leading:

- **The income-floor readout re-evaluates on every projection.** Change a
  claiming age, add a pension, move state, take the trust-fund stress — "do
  Social Security, pensions and annuities cover your essentials, and from which
  year" answers differently every time. It is a dashboard reading, not a
  worksheet.
- **Floor-aware guardrails run in every year of every run** (§5.2). Without a
  floor, a guardrail cuts spending uniformly; with one, it trims discretionary
  *toward* the floor and stops. That is the module working forever, invisibly,
  including inside Monte Carlo.
- **Statement import is monthly** by nature (rung 4).

**So: build in §9's order, describe in §10.3's order.** The bridge still ships
first — it answers the question that started this module and needs no engine
change — but the floor is what the offering leads with, because the floor is
what someone is still paying for in month six. These are not in conflict; §9 is
an engineering sequence and §10.3 is a page of copy.

### 10.3 The offering, ordered by recurring value

Three groups, mirroring `PREMIUM_FEATURES`' shape (`id`, `title`, `blurb`,
`points`). Target content — not shippable copy until each part exists.

**1. Income Floor** — *Whether the income you are guaranteed covers the
spending you cannot avoid.*
- Does Social Security, plus pensions and annuities, cover your essential
  spending — in which years, and by how much
- The first year the floor is covered, and the gap before it
- Guardrails that trim discretionary spending toward the floor instead of
  cutting everything uniformly
- Reads off the essential/discretionary marks you make for free

**2. Retirement Spending Bridge** — *From what you spend today to a retirement
number you can defend line by line.*
- A guided walk from your current spending to `lifestyleExpense`
- Subtracts what stops at retirement — commuting, parking, work lunches, dues
- Excludes what the plan already models on its own lines, and says where each
  one lives instead
- Ends with a figure you can explain to a spouse or an adviser, item by item

**3. Statement Import** — *Your ledger, filled in from the statements you
already have.*
- Bank and card CSVs mapped into ledger categories
- Re-importing replaces imported lines and leaves anything you typed by hand
  alone
- Same extract → edit → confirm → commit flow as the brokerage statement import

**The strongest single line in the pitch is inside group 2**, and it is not the
worksheet: *the current Lifestyle Expense box gives no hint that health, debt,
LTC and Medicare are separate lines the model adds itself*, so users are almost
certainly double-counting them today. "Your number has been wrong by five
figures a year and nothing told you" sells better than "here is a worksheet",
and unlike most upsell copy it is verifiable — the user can check it against
their own ledger.

### 10.4 What has to change in `premiumOffering.js` — much less than v5 assumed

The v5 draft of this section proposed a `PREMIUM_OFFERINGS` array so two
products could be described side by side. **§10.6's one-Premium decision makes
that refactor unnecessary.** `PREMIUM_FEATURES` is already a flat array of
feature groups, and `PremiumTab.jsx` already renders it generically as a card
grid. So the whole change is:

**Append three groups to the existing array.** No component change. And
because `PremiumTab.test.jsx` iterates `PREMIUM_FEATURES` generically —
asserting every group's title and every bullet renders — the new groups are
covered by the existing test the moment they are added. The v5 warning about
that test silently losing coverage no longer applies; it applied only to the
offerings refactor.

Two smaller things still need doing:

- **`PREMIUM_LINKED_FIELDS` becomes per-group, or gets a companion.** It names
  the four free-planner fields holdings takes over (Initial Account Balances,
  Known Cost Basis, Stock Allocation, Concentrated Stock), and the tab renders
  them under "It feeds the plan you already have". Retirement Spending has its
  own two — `housingExpensePct` and `healthcareBridgeCost` become derived and
  read-only in categories mode (§1a.5) — and that section is one of the
  strongest on the page, so it should cover both. Either add an `area` to each
  entry or add a second labelled list.
- **Seven groups is a long page.** Consider an optional `area:
  'holdings' | 'spending'` on each group so the grid can carry two subheadings.
  Cosmetic, and it keeps the flat array and the generic test intact.

### 10.5 The hard rule still applies

`premiumOffering.js` states that every `PREMIUM_FEATURES` entry names something
working in the shipped build **today** — nothing aspirational, nothing "coming
soon". Everything in §10.3 is aspirational until it ships. It lives here, in
the spec, and moves into the config one group at a time as each is built.

This is not pedantry about a comment: `PREMIUM_FACTS` currently tells users in
writing that there is no checkout, no price and nothing to cancel. A page that
honest about billing cannot carry a feature list that overstates what exists.

### 10.6 Packaging: SETTLED 2026-09-05 — one Premium

**Decision (John): one premium option, which grows.** Retirement Spending is
not a second product to buy; it becomes more of what a Premium subscriber
already gets. His reasoning, recorded because it should govern the next feature
too: two SKUs would confuse users about which one they need, and the revenue
upside is not worth nickel-and-diming people.

That reasoning is worth keeping as a standing principle. Every future paid
capability should default to *joining* Premium rather than becoming a new
purchasable thing, and the burden of proof sits on splitting.

**What this deletes.** All of it was real work that no longer needs doing:

| Dropped | Why it existed |
|---|---|
| `modules: { holdings, spending }` entitlement shape | Per-module purchase |
| `modules` argument in `scripts/mint-premium-jwt.mjs` | Minting partial keys |
| "Which modules does this key carry" in Preferences | Telling users what they bought |
| Legacy `premium: true` → `{ holdings: true, spending: false }` grandfathering | Not stranding existing keys |
| **The audit of all 43 `isPremium` call sites** | Deciding holdings vs spending vs either |
| The `PREMIUM_OFFERINGS` refactor (§10.4) | Describing two products |
| A `PREMIUM_FACTS` entry on "do I have to buy both?" | A question that no longer exists |

Plain `isPremium` carries the whole thing. Every existing call site keeps
meaning exactly what it means today, which is why §2's audit warning is now
conditional.

**This stays reversible.** If Premium is ever split, the design is preserved in
§2 and the grandfathering problem is still solvable for the same reason it was
then: there is no account or server, so **the minted keys are the registry**,
and a split just means minting keys that carry a `modules` claim while old
keys keep working as full access. Choosing one Premium now costs nothing later.

**Still deferred:** price, and whether there is ever a checkout at all.
`INTEGRATION_STRATEGY.md`'s subscription-over-one-time-purchase choice stands
and is unaffected — it was about revocability, not about how many things are
for sale.

### 10.7 ~~The consequence nobody asked for: Premium needs its own name~~ DONE 2026-09-06 (changelog 141)

One Premium containing two capability areas breaks a naming assumption that has
been safe until now. `PREMIUM_NAME = 'Detailed Holdings'` is used as though it
names *the product*, but it will name only half of it. The tab would say
"Detailed Holdings is unlocked" to someone whose reason for subscribing was the
spending module.

**SHIPPED as recommended.** `PREMIUM_NAME` is `'Premium'`; `PREMIUM_AREAS`
carries `{ id, name, tab, tagline, features, linkedFields }` per area, and
`PREMIUM_FEATURES` is a derived flat view tagged with `area`/`areaName` so
`PremiumTab` keeps one generic grid and its test keeps covering new groups
automatically. `PREMIUM_LINKED_FIELDS` became per-area, as §10.4 warned it
must: holdings links four planner fields, Retirement Spending links
`housingExpensePct` and `healthcareBridgeCost`. The unlocked state renders one
CTA per area (navigation must name where it lands), and `PREMIUM_FACTS` gained
the "do I have to pick one?" answer §10.6 said the page could not stay silent
on. The three Retirement Spending feature groups from §10.3 moved into the
config now that all three actually ship, so the hard rule is satisfied.

**Original recommendation, for the record:**

**Recommendation: separate the product name from the area name.**

- **Product name: "Premium."** Plain, already what the tab and
  `PREMIUM_FACTS` call it, and it does not over-claim. `PREMIUM_NAME` becomes
  `'Premium'`, `PREMIUM_TAGLINE` describes the whole thing rather than
  holdings.
- **Area names: "Detailed Holdings" and "Retirement Spending."** These are what
  users navigate to and what the feature groups sit under.

Three call sites in `PremiumTab.jsx` need to pick one or the other, and they do
not all want the same answer:

| Line | Today | Should use |
|---|---|---|
| `{PREMIUM_NAME} is unlocked` | "Detailed Holdings is unlocked" | **Product** — the whole thing is unlocked |
| `<h2>{PREMIUM_NAME}</h2>` | Page heading | **Product** |
| `Open {PREMIUM_NAME} →` | CTA that navigates to the holdings tab | **Area** — it goes to one specific tab |

That last row is the one that would go wrong silently: it is a navigation
button, so it must name where it lands. With two areas it becomes two CTAs, or
one CTA per area card.

`REQUEST_BODY` ("I would like access to Detailed Holdings") should say Premium
too, once there is more than one reason to ask.
