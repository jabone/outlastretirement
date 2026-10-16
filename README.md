# OutlastRetirement

Local-first retirement education. OutlastRetirement projects a household's
retirement year by year — income, savings, withdrawals, federal and state tax,
Social Security, Medicare and IRMAA, Roth conversions, estate tax — and answers
one question: does the money outlast you? It runs entirely in the browser.
There are no accounts and no server holding anyone's plan.

- Live site: https://www.outlastretirement.com (the app is at `/app/`)
- The app models United States tax, Social Security and Medicare rules for
  U.S. taxpayers. It is educational software, not financial, tax or legal
  advice. See `/terms` and `/privacy` on the site.

## What is in this repository

Everything the app is made of, apart from the Premium modules:

- the projection engine — `src/calculator.js`, pure functions, every tax rule
  and figure, documented in `TAX_RULES_SPEC.md` with its sources;
- the interface — `src/App.jsx` and `src/components/`;
- the static site, the tests, and the specifications the engine follows.

**Premium** is a set of four areas — Detailed Holdings, Retirement Spending in
Full, Readiness in Full, and Relocation & Residency — that the app loads as
separate, signed modules from `premium.outlastretirement.com` when a Premium
Access key is present. Their source is not in this repository and is not
open source. Everything that *loads* them is: the loader
(`src/premium/`), the key check, the signature check, and the interface a
module is written against. That interface is `PREMIUM_MODULE_CONTRACT.md`,
and it is the same one a third party would use to build a module of their
own. The arithmetic a Premium area relies on — the spending bridge, the
guaranteed-income floor, the readiness searches, the pricing of a year
abroad — is part of the open engine; what Premium adds is the data, the
detail and the working behind the free answers.

## Run it

Requires Node.js 22 (`.nvmrc`).

```
npm install
npm run dev        # Vite dev server; open the address it prints, then /app/
```

The landing page is `index.html`; the app itself is `app/index.html`. The
static pages (privacy, terms, accessibility, premium, verify) live in
`public/` and are served at clean addresses (`/privacy`, `/terms`, …) by the
rewrites in `vercel.json`. The dev server serves them at their `.html` names.

Without a Premium key the app runs as the free product, which is complete in
itself: every question is answered, and the Premium parts show what the paid
detail would add. The demo (`/app/#/demo`) shows Detailed Holdings read-only.

## Test it

```
npm test                          # Vitest in watch mode
npx vitest run                    # the whole suite once (slow: 15–30 minutes)
npx vitest run src/__tests__/calculator.test.js   # one file
npm run lint                      # oxlint
npm run test:e2e                  # Playwright, against a local build
```

Several tests guard the copy rather than the code: American spelling, no
release-note phrasing in the Guide or Input Dictionary, the privacy promise,
the control vocabulary, accessible names, and help popups that link into the
Input Dictionary. Read a failing one's comment before changing it.

A few tests exercise a built Premium module against the host; they skip when
the module is not present, which it is not here.

## Build it

```
npm run build      # vite build, into dist/
```

`vercel.json` holds the headers (including the Content-Security-Policy that
keeps the privacy promise enforceable) and the rewrites. The site is a static
deployment; there is no server component in this repository.

## Repository layout

| Path | What is in it |
| --- | --- |
| `src/calculator.js` | The projection engine: pure functions, every tax rule and figure |
| `src/App.jsx`, `src/components/` | The app's interface; one file per tab in `src/components/tabs/` |
| `src/components/plan/sections/` | The Plan page's sections, shared by the Guided and Advanced views |
| `src/premium/` | The Premium module loader: contract, mount points, key and signature checks, the host API a module receives |
| `src/config/` | Product constants: changelog, announcements, Premium offering, branding, sources, the field index |
| `src/utils/` | Helpers the interface uses (action plan, feedback, formatting, imports) |
| `src/context/` | React context for the plan, entitlement and holdings |
| `src/__tests__/` | Vitest suites (engine, components, and copy guards) |
| `tests/e2e/` | Playwright end-to-end tests |
| `public/` | Static pages, icons, fonts and brand images served as-is |
| `scripts/` | Generator scripts (public pages, field index, demo backup) |
| `docs/` | Brand notes, license texts, state tax rule notes |

## Documents

- `DEVELOPMENT.md` — the rules for working in this codebase: the documentation checklist, American English, test rules, Premium, privacy.
- `CONTRIBUTING.md` — how to propose a change.
- `PREMIUM_MODULE_CONTRACT.md` — the host/module interface every Premium area is loaded through: what a module receives, what it returns, mount points, network rules.
- `TAX_RULES_SPEC.md` — every tax rule the engine implements, with its source.
- `TAX_UPDATE_PROCESS.md` — the yearly checklist for rolling the tax figures forward.
- `KNOWN_ISSUES.md` — confirmed gaps and simplifications, open and closed.
- `RETIREMENT_SPENDING_SPEC.md` — the Retirement Spending area.
- `SPENDING_RULES_SPEC.md` — spending guardrails and every-retirement-since-1928.
- `RELOCATION_SPEC.md` — moves between states and abroad.
- `docs/brand/README.md` — the brand marks and how to use them.

## Privacy

The app sends nothing about a plan anywhere. The one connection the free app
can make is Live Pricing to a Google Sheet the user connects themselves; the
one connection Premium adds is the fetch of a signed module, carrying the
Premium Access key and nothing else. Both are stopped by Local-Only Mode,
enforced in the code at the point a request would be made. `/privacy` on the
site says all of this in full, and `src/__tests__/privacyTenets.test.js`
keeps the code and the policy from drifting apart.

## License

See `LICENSE` (the GNU Affero General Public License, version 3) and
`NOTICE` (the copyright holder and what the license does not cover). The
open core of OutlastRetirement is published under the AGPL v3. The Premium modules are a separate
work under a separate license and are not covered by it. "OutlastRetirement"
and the brand marks in `public/brand/` identify the product as published by
OutlastRetirement LLC; a fork should carry its own name.
