# Spending rules and historical starts — rescope

Status: **BUILT, changelog 335 (2026-09-29).** Phases 0–3 shipped; see "As built" at the end for where the build refined the scope. Written 2026-09-29 against the repo at
changelog 334 (`b53e7a9`). Started from a look at historical-backtest
retirement calculators, then rescoped after reading the engine and running experiments against it.

## Why the first idea changed

The first idea borrowed two things from historical-backtest calculators: run the plan through every
historical start year, and show what a spending rule costs in *income
swings*, not just whether the money lasts.

Reading the code changed the order. The app already has the parts: 98 years
of history (`historicalReturns.js`), per-year return and inflation overrides
on `runProjection`, and two guardrail rules. But the two rules have problems
of their own, and nothing in the app shows them, because every surface
reports whether the money lasts and none reports what the rule did to
spending. **A historical-starts feature built on top of today's rules would
show wrong numbers with more authority.** So the rules get fixed first, then
the spending-cost measure goes in, then the history run uses it.

## What the experiments found

Method: the demo plan (retires 2031 at 60, 33 retired years, 60% stocks),
run through every real 33-year sequence from 1928 (66 starts) by feeding
`historicalPortfolioReturn` and CPI into `runProjection`'s override
arguments, the way the Monte Carlo does. Spending was scaled ×1.0, ×1.6 and
×1.9 so some starts fail. The scratch scripts lived in the session VM and
aren't kept; the method is in Working notes.

### 1. The withdrawal-rate guardrail raises spending 20% for life, with no market event

`withdrawalGuardrailsEnabled` (changelog 216) anchors on the first retired
year's `drawdown / portfolio start`. For the demo, that year's draw is
$386,881 (14.5% of the portfolio) because it includes filling the cash
reserve ($174k), a wedding ($30k) and Roth-conversion tax ($57k). Every later
year looks far below the anchor, so the rule steps up +10%, +10% and sits at
its +20% cap from 2034 to the end. That's on the **smooth** projection, with
no crash at all.

Consequences:

| Demo spending | Fixed spending lasts | WR guardrail lasts | WR guardrail, raises off |
|---|---|---|---|
| ×1.6 | 51 / 66 starts | **42 / 66** | 53 / 66 |
| ×1.9 | 34 / 66 | **14 / 66** | 40 / 66 |

The rule meant to make a plan safer makes it fail more often, and median
lifetime spending runs at 118–119% of plan. The Readiness Q2 card forces this
rule on for its "adapted" column and describes 27 raise years as "the upper
rail doing its job." Here they're caused by the anchor, not by the markets.

The rate is also measured on total drawdown, so it moves whenever Social
Security starts, the pre-65 health bridge ends, a conversion runs or an
inheritance lands. None of those says anything about the markets.

### 2. The crash guardrail wins by cutting spending, and nothing shows the cut

`spendingGuardrails` freezes the inflation raise after any down year, and
cuts 10% if the first retired year is a down year. It never catches up. In
historical sequences with inflation, the freezes compound:

- It lasts **66 / 66** at ×1.6 (fixed: 51) and 51 / 66 at ×1.9 (fixed: 34).
- Median lifetime spending is **82% of plan**.
- The worst starts leave spending **47% (1946), 41% (1940) and 40% (1957)
  below plan**, in real terms, every retired year.

The Risk tab's "Stress Scenario x Guardrails Grid" compares ending balance,
worst-year balance and taxes, so guardrails always look like a free win. The
floor-aware work (changelog 139) protects essentials from the one-time 10%
cut, but not from the freeze, and the WR guardrail cuts total spending,
essentials included.

### 3. Today's dollars use the plan's inflation, not the inflation that happened

`inflFactor` (calculator.js ~L6084) compounds `inputs.inflationRate` whatever
inflation a run actually used. `deflateProjectionForDisplay` divides by it.
Any run that overrides inflation (the named stress years, historical starts,
the Monte Carlo bootstrap in "as history" mode) is deflated by the wrong
index. Across a 1970s sequence, balances in "today's dollars" come out
overstated by roughly a quarter. This has to be fixed before any historical
figure is shown in real terms.

### 4. The named stress years are a different question, not a wrong one

Each named scenario overrides 3–4 years, then returns to the plan's own
assumption. Lowest real balance for the demo, compared with the full real
sequence deflated by actual CPI:

| Start | Named scenario | Real sequence |
|---|---|---|
| 1929 | $0.70M | $1.52M |
| 1966 | $1.68M | **$1.22M** |
| 1973 | $0.87M | $1.07M |

The 1929 and 1973 scenarios are harsher than history was, because the
recovery years are cut off. "1966 Lost Decade" is milder than history,
because its pain was 16 years of inflation, not a 4-year crash. Keep the
named scenarios as "a crash like X". Historical starts answer the other
question: "what did every real retirement look like?"

## The build, in order

### Phase 0: fix the two rules (engine; both are off by default, so GOLDEN does not move)

**0a. WR guardrail measures a clean spending rate.**
Rate = (lifestyle spending + healthcare bridge − guaranteed income) /
portfolio start. Reserve fills, milestones, conversion taxes and other
one-offs are left out. The anchor is the first retired year of that same
measure. This is closer to what Guyton-Klinger meant, and it stops Social
Security, bridge endings and one-off events from moving the rule.
*Decision for the owner: this definition, or keep total drawdown and only exclude
reserve fills and milestones?*

**0b. Crash guardrail gets a catch-up and a limit.**
Freezes accumulate as a real-terms shortfall. When the portfolio is back at
or above its real value at retirement, the shortfall is restored. The total
freeze is capped at the discretionary share × `discretionaryCutPct`, so the
freeze can't cut into essentials. *Decision: restore on recovery, or never
restore but cap?*

**0c. Both rules become floor-aware**, through the one `essentialShareOf`
path changelog 139 uses. Neither can take spending below the essential floor.

Tests: equivalence tests per the Q4 lesson ("asserting that something moved
is not asserting that it moved correctly"). One test uses a smooth plan with a
big first-year reserve fill and must show zero raises. One uses a 1946-style
inflation run and must show the freeze shortfall capped.

### Phase 1: the spending-cost measure (engine + one pure util)

- New row field `priceIndex`: the realized cumulative price level, using
  whatever inflation the year actually had. `deflateProjectionForDisplay`
  uses it when present. Fixes finding 3 everywhere at once.
- `utils/spendingCost.js`, pure: `spendingCost(proj, refProj)` → deepest cut,
  years below plan, lifetime spending as a share of plan (present value),
  and `essentialsTouched` (did spending ever fall below
  `essentialSpending`). The reference is the same run with the rule off, so
  the comparison isolates the rule from the market.
- The Readiness Q2 card and the Stress × Guardrails grid read it. The grid
  gets "deepest cut" and "lifetime spending" columns. This is the first
  place a user sees what a guardrail costs.

### Phase 2: every historical start (heavy worker)

- `runHistoricalStarts(inputs, { center: 'history' | 'plan' })` in
  calculator.js, reusing the bootstrap's `historicalPortfolioReturn` and glide
  handling. One run per start year that has a full horizon of data (66 for
  the demo), times rule on/off. That's about 130 projections, well under the
  Monte Carlo's 1,000. It goes in `heavyComputeWorker.js`.
- Output per start: lasts or runs out (and the year), plus `spendingCost`.
  Summary: count lasting, worst start, the three deepest cuts, median
  lifetime spending.
- Where it shows: a "Every start since 1928" section on Risk & Stress, beside
  the named scenarios. A small table with one row per rule the plan uses:
  **lasts in**, **deepest cut**, **years below plan**, **lifetime spending**.
  Clicking a start year loads that sequence into the stress chart.
- Readiness Q2 gets one sentence: "In N of 66 real retirements since 1928
  this plan lasted; the worst start was 19xx."
- *Decision: raw history (recommended; it's the point of the feature, and
  it's how historical-backtest calculators work) or re-centered on the plan's
  assumptions, as the bootstrap does by default?*

### Phase 3: Monte Carlo reports the cost too (small)

The trial loop already has every trial's rows. Collect `spendingCost` per
trial when a guardrail is on and publish "cut spending in X% of trials,
median deepest cut Y%" next to the success rate, so `planVerdict` never
states a guardrail-flattered percentage without its cost.

### Not now: more strategies

A long menu of strategies isn't the gap. The gap is that the app's own
three (fixed, crash guardrail, WR guardrail) are hard to compare. Once
phases 0–2 ship, the three-row table *is* the strategy comparison. Add
percent-of-portfolio or VPW later only if users ask. It's a new engine
spending rule, not a display.

## Free and Premium

One Premium that grows (DEVELOPMENT.md, "Premium"). Suggested line: the
**survival count and the one-line cost of any rule the user has switched on
are free**. A success rate that depends on a guardrail shouldn't hide what
the guardrail costs behind a paywall. The per-start table and click-through
are Premium. *Decision for the owner.*

## Decisions (the owner, 2026-09-29)

1. 0a: **spending-only rate**, as recommended. Reserve fills, one-off
   events and conversion tax are out, and guaranteed income is netted.
2. 0b: **restore after a recovery, when appropriate.** Read as: restore the
   frozen raises once the portfolio is back to its real value at
   retirement, and keep the cap as the backstop, so a run that never
   recovers can't erode past the discretionary cut.
3. Phase 2: **raw history.**
4. Free/Premium: **as proposed.** The survival count and the cost of any rule
   the user has switched on are free. The per-start table is Premium.

## Working notes

- `node_modules` on the mount is macOS-only. Experiments ran from a tar copy
  at `$HOME/cfe` in the device VM with a standalone esbuild in
  `$HOME/tools` (`npm install esbuild@0.25` there; a full `npm install` hits
  a peer-dependency conflict). Bundle with
  `esbuild x.mjs --bundle --platform=node --format=esm`.
- The spending row field is `lifestyleExpenses` (plural). `lifestyleCost` is
  a local in calculator.js, not a row field.
- `isSuccessful` means no year had a `shortfall`. A failing run can end with
  a small positive balance, so report the shortfall year, not a zero balance.

## As built (changelog 335)

Two refinements to the scope above, both found while building:

1. **Both guardrails measure against the plan's own path.** A spending-only
   rate anchored on the first retired year still drifts when Social Security
   starts or the health bridge ends, and a rate netted of guaranteed income is
   leveraged: a 10% cut moves a small net need by 30% or more, so the rule
   oscillates. The build compares last year's gross spending rate with the
   rate the same plan had in the same year with no guardrails and no stress.
   Scheduled events appear on both sides and cancel, and a smooth projection
   is bit-identical to the rule being off.
2. **"Recovered" means back on the plan's own path in real terms,** not back
   to the portfolio's value at retirement. A plan that spends down never gets
   back to its retirement value, even after the markets fully recover.

Demo plan at 1.6× spending, 66 real starts, after the build:

| Rule | Lasts | Deepest cut | Typical lifetime spending |
|---|---|---|---|
| Fixed | 60 | — | 100% |
| Spending guardrails | 66 | 38% | 100% |
| Withdrawal-rate guardrails | 66 | 20% | 113% |

Recomputed 2026-09-30 after the mechanics review (the build-time figures were
51 / 62 / 59, and had drifted to 49 / 66 / 60 before these fixes): a replayed
start now indexes Social Security and the brackets to that era's CPI, the cash
reserve is spent before a run is counted as failed, and a start-of-year
balance of $0 is no longer read as the opening balance.

The demo's "$170,000 a year, with spending guardrails" scenario read 88% in
the Monte Carlo after the build, down from 97.7%: the old figure was partly
bought with spending cuts that never ended. It reads 97.8% after the
2026-09-30 fixes, for a different reason: trials that ran short while the
cash reserve still held two years of spending now spend the reserve first.

Loading one start's whole sequence into the stress chart shipped as
changelog 336: a `history` stress type with a start-year input, and the
historical-starts run now uses it, so a replayed row is exactly the run the
table describes.

## Later: history from 1871 (changelog 449, 2026-10-20)

A plan can set **Market record from** (on the historical panel; input `historyFromYear`) to 1871. The starts then run from 1871: the years 1871-1927 come from Robert J. Shiller's monthly data (Yale), annualized January to January by `scripts/buildPre1928History.mjs` into `src/config/historicalReturnsPre1928.js`; from 1928 the Damodaran / Minneapolis Fed table is unchanged. Over 1928-2022 the Shiller-built series and the Damodaran table differ in geometric mean by +0.01 (stocks), +0.07 (bonds) and +0.03 (inflation) points a year, correlation 0.97 / 0.96 / 0.84 (`historicalReturnsPre1928.test.js`). Default stays 1928; the Monte Carlo bootstrap stays on 1928 onward. The SAFEMAX search, the counts, the verdict's history line and the replay all follow the setting; any year from 1871 can be replayed.

## Later: two more rules in the comparison (changelog 451, 2026-10-21)

`HISTORICAL_START_RULES` adds `pct` (spend `r` x the portfolio at the start of each retired year) and `clyatt` (Bob Clyatt's 95% rule, *Work Less, Live More*: max(`r` x portfolio, 95% of last year's spending), in nominal dollars). `r` is the plan's first retired year's lifestyle spending over the invested portfolio it opened that year with, so both start where the plan starts. Implemented as the engine input `spendingRule` ('none' | 'pctPortfolio' | 'clyatt95'), comparison-only (not a plan setting, never the plan's own rule), applied after the floor-aware block; phase multipliers and the survivor drop no longer move spending once a rule is running, since the portfolio sets it. Costs are measured against fixed spending in the same start, as for the guardrails.

