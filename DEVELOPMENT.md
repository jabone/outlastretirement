# OutlastRetirement (formerly cashflowengine)

A personal retirement cash-flow / tax projection React app. `src/calculator.js`
is the pure-function projection engine; `src/components/tabs/*` is the UI;
`src/config/*` holds the product-level constants (changelog, announcements,
premium offering, branding). The product is OutlastRetirement
(outlastretirement.com); package name `outlastretirement` (renamed from
`retire-plan-beta` / `cashflowengine` on 2026-09-26). Older notes and specs
may still say "cashflowengine"; they mean this project.

Longer-form decisions live in root `*.md` files — `RETIREMENT_SPENDING_SPEC.md`,
`TAX_RULES_SPEC.md`, `TAX_UPDATE_PROCESS.md`, `KNOWN_ISSUES.md`. Check those
before designing something new; they usually already say why the current
shape is the current shape.

## Documentation checklist — update on every user-visible change

Whenever you add, change, or fix a user-visible feature (a new input, a
changed default, a new column/chart, a bug fix that changes numbers users
see, etc.), also update these three places in the same change. They are easy
to forget because they live outside the feature's own files, but users rely
on them to know what changed and what a field does:

1. **`src/config/changelog.js`** — add a new entry at the TOP of the
   `CHANGELOG` array (id = previous max + 1, never reuse/skip). This feeds
   both the "What's New" popup and the "What's New" sub-tab in the Guide.
   Every entry needs a `summary`: ONE plain-English sentence of the
   user-visible outcome, no statute numbers or function names — it's the
   headline most users will ever read (the detailed `items` sit behind a
   Details expander). A test fails without it. Then bump
   `LATEST_CHANGELOG_ID` in `src/config/changelogLatest.js` to the new id
   (the app reads it there so it can skip loading the changelog;
   `changelogLatest.test.js` fails until it matches).
2. **`src/components/tabs/GuideTab.jsx`** — update the relevant accordion
   section (Plan Settings, Tax & Estate, Ledger & Tools, etc.) so the guide's
   prose description of that area still matches what the UI actually does.
3. **`src/components/InputReference.jsx`** — the "Input Dictionary": add or
   edit a table row for the specific input/widget/column, following the
   existing Purpose & Effect / Valid Inputs & Behavior pattern.
4. **`src/config/fieldIndex.js`** — when a Plan section field, label, fold
   or sub-tab changes, run `node scripts/generateFieldIndex.mjs` so "Find a
   setting" knows about it. `fieldIndex.test.js` fails while it is stale.
5. **`src/config/howFigured.js`** — when a tax or benefit rule changes, the
   plain-language card in Help → How the numbers are figured changes with
   it, and so does its official source in `src/config/sources.js`. Every
   December the links are re-checked: see "Year-end source review (every
   December)" in `TAX_UPDATE_PROCESS.md` (`npm run check:sources`).
6. **`src/config/releaseNotes.js`** — the public release notes
   (/changelog). Put the new What's New id in a bullet for its week (a new
   week once the date passes Sunday), keeping a few plain lines per week.
   When a seventh week appears, fold the oldest into its quarter's summary.
   Then run `node scripts/generatePublicPages.mjs`, which also regenerates
   /how-the-math-works from methodology.js and howFigured.js.
   `releaseNotes.test.js` fails until every id is accounted for and both
   pages are current.

**Guide and Input Dictionary prose describes what the app does now, in the
present tense, and never cites a changelog number or a date** ("since
changelog 181", "(changelog 265)", "before 2026-08-29 ...") -- those are
release notes and live in `changelog.js`. `noReleaseNotesInCopy.test.js`
scans every source file's non-comment text for them; code comments may
cite changelogs freely.

**A `?` help popup (`<Tooltip text=…>`) is a definition, not an essay:** a
sentence or two, under 270 characters. When there is more to say, put it in
the Input Dictionary row and add `more="<search term>"` to the Tooltip; the
popup then ends with a "Look it up in the Input Dictionary" link that opens
the Dictionary with that term in its search box. The term must match at
least one Dictionary row and not more than 25. `TooltipMore.test.jsx`
enforces both (changelog 280).

**Controls speak one vocabulary (changelog 279):** one on/off setting is a
switch (`SwitchRow`), one of N options is a `<select>`, and a bare checkbox
appears only where the user picks several rows from a list. The two
click-a-card choices the owner kept -- the stress scenarios and the heir
distribution strategies -- are the only exceptions; `controlVocabulary.test.js`
names them. A label beside a switch or select carries no trailing colon (the
control is the punctuation); a circled `?` (`HelpCircle`) appears only as the
hover-help mark and on the Help destination, and note boxes open with `BookOpen`,
never a circled `i`.

Skipping these is the kind of thing that's invisible in code review but
leaves real users confused about a feature that exists but was never
explained, or a change nobody was told about. Treat them as part of the
feature, not optional follow-up.

A timed **announcement** (`src/config/announcements.js`) is the separate
channel for telling users something that isn't a release note — it shows to
everyone including first-time visitors, within an optional `showFrom` /
`showUntil` window. There is no email list and no web push: both need
accounts/PII this product deliberately avoids. Don't re-propose them.

## American English

User-facing text is American English: enroll, color, gray, check (not
cheque), modeled, license, recognize. `src/__tests__/americanSpelling.test.js`
scans the source and public pages and fails on British spellings
(changelog 246), including in comments, so nothing needs judging.

## Writing tests that actually test something

**`sanitizeInputs()` silently drops unknown keys** (it copies only the keys
`DEFAULT_INPUTS` has). A test that sets
a misspelled or non-existent input key gets DEFAULT behavior and passes green
while asserting nothing. This has shipped a dozen fake keys before. Verify
every input key you use against the defaults in `calculator.js`. Real names
worth memorizing: `salary1`, `preTaxInit` / `taxableInit` / `rothInit` /
`hsaInit`, `ss1`, `claimingAge1`, `retireAge1`, `birthYear1`,
`preRetireReturn` / `postRetireReturn`.

Two rules that follow from it:

- **Mutate the fix and confirm the test goes red.** A test never seen failing
  is not known to be load-bearing.
- **Never leave an assertion inside an `if`.** If the branch never runs, the
  test passes having checked nothing — count branch hits and assert on the
  count instead.

Also: `createHolding({ id })` MINTS a fresh id rather than honoring the one
passed. Capture `h.id` from the returned object; never assert on a literal id.

## Storage keys keep their old names

Everything a user has lives in their browser under keys named for the
product's earlier names: `retire_plan_*` (it began as RetirePlan) and
`cfe_*` (cashflowengine). **Never rename one.** A renamed key reads as empty,
so the user's plan, scenarios or Premium key silently disappear on the next
load; a migration that copies old to new is the only safe way, and it buys
nothing but tidier names. New keys may use either prefix; follow the file's
neighbors.

The inventory, so a search finds the owner:

- Plan and scenarios: `retire_plan_inputs`, `retire_plan_scenarios`,
  `retire_plan_monte_carlo_v1`, `retire_plan_mc_auto_run`,
  `retire_plan_annual_review_v1`, `retire_plan_interview_progress`,
  `retire_plan_last_quick_update`, `cfe_data_freshness_v1`,
  `cfe_retirement_planner_v1`, `cfe_retirement_income_basis`,
  `cfe_life_plan_v1`, `cfe_estate_checklist_v1`, `cfe_reconciliations_v1`,
  `cfe_demo_mode_v1`.
- Premium and Detailed Holdings: `cfe_premium_jwt`,
  `cfe_premium_holdings_v1`, `cfe_premium_liquidations_v1`,
  `cfe_premium_pricing_source_v1`, `cfe_premium_pricing_script_ack_v1`,
  `cfe_premium_expiry_dismissed_v1`, `cfe_last_price_refresh`,
  `cfe_lot_source_retraction_v1`, `cfe_dividends_help_v1`.
- Privacy switches: `cfe_local_only_mode`, `cfe_analytics_opt_in`.
- Consent and first-run: `retire_plan_disclaimer_accepted`,
  `retire_plan_onboarding_completed`, `retire_plan_whatsnew_last_seen_id`,
  `retire_plan_whatsnew_last_shown_date`, `retire_plan_announcements_dismissed`.
- Display preferences: `retire_plan_theme`, `retire_plan_large_text`,
  `retire_plan_sidebar`, `retire_plan_nav_more_open`, `retire_plan_plan_mode`,
  `retire_plan_folds_v1`, `retire_plan_print_choices`,
  `retire_plan_round_far_dollars`, `retire_plan_kpi_open_mobile`,
  `retire_plan_status_bar_hidden`, `cfe_bracket_lines_v1`,
  `cfe_growth_overlay_taxes_v1`, `cfe_growth_overlay_lifestyle_v1`.
- Retired (removed at startup by `removeRetiredKeys`, `utils/storageKeys.js`):
  `cfe_dev_premium`.
- sessionStorage: `retire_plan_chunk_reload` (the one-time reload after a
  deploy removed a chunk, `utils/lazyWithRetry.js`).

## Premium

**There is ONE Premium product, and it grows.** A new paid capability JOINS
Premium — it never becomes a separate SKU, tier, or per-module entitlement
flag. Plain `isPremium` carries everything. This is settled; don't reintroduce
a `modules: {...}` shape.

`src/config/premiumOffering.js` holds the naming split: `PREMIUM_NAME` is the
PRODUCT ('Premium') and each entry in `PREMIUM_AREAS` has its own area name
(currently Detailed Holdings, Retirement Spending, Readiness in Full, and
Relocation & Residency). **Headings take the
product name; navigation buttons take the area name.** `PREMIUM_FEATURES` is
derived by flat-mapping the areas, so adding another area is one entry there
and no component or test change. Read that file's header comment before
touching any of this.

## Privacy posture — the absolutes, and how they stay true

`public/privacy.html` makes claims with no weasel words in them. They are the
product's main promise, and a reader can check most of them in ten seconds
with a network tab. **Treat them as a contract the code has to honor, not as
marketing copy that describes it.**

The absolutes, as the policy states them:

1. **The App sends nothing on its own.** Nothing the user types is transmitted
   anywhere, ever, by us.
2. **Local-Only Mode stops the app's optional connections** (Live Pricing and
   analytics) — enforced at each call site via `assertNetworkAllowed`, never
   by hiding a button. The browser still loads the app and checks for updates
   when the user reloads, as `public/privacy.html` says.
3. **Nothing third-party loads on open.** No font host, no tag manager, no
   tracker. Fonts are self-hosted via `@fontsource-variable/*`.
4. **Analytics is off until the user opts in** (`analyticsOptIn.js`), and
   Local-Only overrides even that.
5. **The Premium key carries three things and nothing else** — the address
   it was sent to (`licensedTo`), `premium: true`, and an expiry rounded to
   a day. No issue time, no device, no id. Its header names the signing key
   (`kid`) so the key ring can be rotated. `privacyTenets.test.js` pins the
   claim set.
6. **Data leaves only when the USER moves it** — Backup, save to a synced
   folder, Print / Save as PDF, CSV exports, or Live Pricing (a bare ticker to
   the user's own Sheet, whose script looks it up with Google Finance and
   Yahoo Finance). Never automatically, never through us.

### On every change, before you commit

`src/__tests__/privacyTenets.test.js` enforces all six as a **census**: it
enumerates every way bytes can leave the browser (`fetch`, `XMLHttpRequest`,
`sendBeacon`, `WebSocket`, `EventSource`, CSS `@import`, remote `url()`,
off-origin `src`/`href`) and fails on anything not already allowlisted.

**When it fails, widening the allowlist is the last step, not the first.** Ask:

- Does this send anything the user typed? If yes, stop — that breaks absolute
  1 and is a product decision, not an implementation detail.
- Is it behind `assertNetworkAllowed`? If not, absolute 2 is now false.
- **Does `public/privacy.html` describe it?** If not, update it *in the same
  commit*. This is the rule that matters most: the policy has been wrong twice
  (2026-09-12 — it denied holding email addresses while email was the only
  route to Premium, and claimed data "never leaves your device" while three
  features existed to move it). Neither was deliberate. Both happened because
  the page was written once and the software kept moving.

A policy claim and the code that honors it must never move apart again. If a
change makes a sentence in that file untrue, the change is not done until the
sentence is fixed — and if the claim is one you cannot keep, weaken the claim
rather than quietly leaving it there.

### A guard that passes against a broken build is worse than none

Every guard in `privacyTenets.test.js` was mutation-tested: the violation was
introduced, the test watched to go red, then reverted. Two of them did NOT
fail the first time and were only found that way:

- The Local-Only check matched `/assertNetworkAllowed/`, which still matches a
  renamed-and-disabled symbol. It now checks the import and counts anchored
  call sites.
- The font check scanned `.js` and `.jsx` only — and the leak it exists to
  prevent was an `@import` in `index.css`. Stylesheets are scanned now.

Do the same for anything you add here. A privacy guard nobody has seen fail is
a guess.

## Commands

```
npm run dev              # vite dev server
npm test                 # vitest (watch)
npm run test:regression  # vitest run --coverage
npm run test:e2e         # playwright, against a production build (E2E_DEV=1: dev server)
E2E_WEBKIT=1 npx playwright test --project=webkit-iphone   # the four flows on Safari's engine as a phone (needs: npx playwright install webkit)
npm run lint             # oxlint
npm run build            # vite build
```

Node 22 (`.nvmrc`, `engines`). `.github/workflows/ci.yml` runs lint, the
suite and the build on every push as a backstop. Commit subjects follow
`Area: what changed in plain English` — e.g. `Dividends: Weekly payment
frequency`, `Detailed Holdings: every table column sorts`.

**Never put a backtick in a `git commit -m` string** when committing through a
shell tool — bash executes it. Write the message to a file and use
`git commit -F <file>`.

## Test/lint workflow note (sandboxed/remote sessions only)

When the repo is reached through a mounted sandbox rather than run directly on
the machine, the mounted copy can have a broken native binding
under `node_modules` (`@rolldown/binding-*` / oxlint bindings). If `vitest`
or `oxlint` fail with a "Cannot find module" native-binding error, rsync the
repo (excluding `node_modules`, `.git`, `dist`, `android`, `ios`) to a scratch
directory, run `npm install` there once, and run tests/lint from that copy
instead — re-syncing (still excluding `node_modules`) before each run to pick
up new edits. Running locally in this directory, just run the commands
above directly.

## Decision history — read before designing something new

The *why* behind this codebase lives in two places: the root `*.md` specs
(`RETIREMENT_SPENDING_SPEC.md`, `TAX_RULES_SPEC.md`, `SPENDING_RULES_SPEC.md`,
`KNOWN_ISSUES.md`, and `RELOCATION_SPEC.md` where the Premium country data lives) and the changelog entries in
`src/config/changelog.js`, which record what shipped and when. Check both
before designing something new; they usually already say why the current
shape is the current shape. If a note and the code disagree, the code wins —
but find out why the note is stale before overwriting the behavior it
describes.
