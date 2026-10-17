# Premium module contract

Version 1.2 (2026-10-15). Companion to `OPEN_CORE_PLAN.md` step 1.

This is the interface between the open app (the **host**) and a Premium
**module** — a JavaScript chunk that lives in the private Premium repo, is
served by the key-verifying endpoint, and is mounted by the host at a small
number of named points. The host never imports a module by path; a module never
imports the host by path. Everything each side needs from the other crosses
this contract and nothing else.

The contract exists for three reasons, in priority order:

1. **Trust.** The privacy page can state, as a checkable fact, exactly what a
   Premium module can see and touch.
2. **Separation.** The public tree builds and its tests pass with no module
   present. Modules compile against the contract, not against `App.jsx`.
3. **Later contributions.** A reviewed partner module or an engine extension
   can use the same seam without a plugin system being designed for it now.

## 1. Vocabulary

- **Host**: the open app. Owns inputs, the projection, storage, dialogs, the
  key, and the mount points.
- **Module**: one chunk per Premium area (`holdings`, `spending`, `readiness`,
  `relocation`). One key unlocks all of them; the loader fetches each on first
  need.
- **Mount point**: a named place in the host UI where a module may render a
  component. The host renders a locked card there when no module is loaded.
- **Host API**: the single object the host passes to a module. Everything the
  module may read or call is on it.

## 2. What the host provides (`host`)

The host API is a plain object, built once per render of the provider and
stable between renders except where noted. Modules receive it as the only
argument to their factory (section 4) and again as a prop on every mounted
component.

### 2.1 Plan data (read only)

| Key | Type | Notes |
|---|---|---|
| `inputs` | object | The sanitized plan inputs (`DEFAULT_INPUTS` shape). Frozen. |
| `projection` | object | The current `runProjection` result. Frozen. |
| `kpis` | object | Headline figures derived from the projection. |
| `verdict` | object | The plan verdict (`planVerdict` output). |
| `useRealDollars` | boolean | Display mode. |
| `formatCurrency` | function | The host's whole-dollar formatter. |

Modules never call `runProjection` themselves. If a module needs a what-if, it
asks through `host.projectWith(overrides)` (2.5), so the engine stays a single
host-owned function.

### 2.2 Plan mutations

| Key | Type | Notes |
|---|---|---|
| `updateInput(key, value)` | function | Only keys in `DEFAULT_INPUTS`; the host rejects unknown keys (the fake-key trap). |

A module changes plan inputs only through these. The host records the source
(`initialBalancesSource`, `source` on ledger lines) so a user can see what a
module wrote.

### 2.3 Module stores

Each area owns a storage namespace. The host persists it, backs it up, restores
it, and includes it in the encrypted backup — so a lapsed user keeps their data
readable and restorable, which is a stated promise.

| Area | Namespace (localStorage) | Host-owned store hook |
|---|---|---|
| holdings | `cfe_premium_holdings_v1`, `cfe_premium_liquidations_v1`, `cfe_premium_pricing_source_v1`, `cfe_premium_pricing_script_ack_v1`, `cfe_last_price_refresh` | `host.holdings` (the `usePortfolioHoldings` surface: `holdings`, `liquidations`, `addHolding`, `updateHolding`, `removeHolding`, `addHoldings`, `replaceHoldings`, `liquidateHolding`, `removeLiquidation`, `addLiquidations`, `bucketTotals`, `taxableCostBasis`, `assetClassMix`, `balanceGap`) |
| spending | none — every field the module writes (`spendingBridge`, `spendingBlueprint` lines, `floorAwareGuardrailsEnabled`, `discretionaryCutPct`) is a plan input, written through `updateInput` and kept in the plan backup like any other | — |
| readiness | none (reads projection only) | — |
| relocation | none — a move abroad is a plan input (`residencyTimeline[]`), written through the host panel's `commit` and priced by the open engine; the module snapshots the notice's summary lines onto it as `foreign.presetNotes` | — |

Modules do not touch `localStorage` directly. The data layer that defines these
records (`portfolioHoldings.js`, `holdingsCore.js`) stays in the host, because
backup, reconciliation and the ledger CSV need the schema with no module loaded.

### 2.4 Dialogs and navigation

| Key | Notes |
|---|---|
| `showAlert(message, title)` | Second argument is a plain string. |
| `showConfirm(message, options)` | Options object. |
| `showPrompt(message, options)` | Options object; `inputType: 'password'` allowed. |
| `setActiveTab(tab)`, `setSubTab(tab, sub)` | Navigation. |
| `subTab` | The module's own sub-tab state, host-owned so routes survive reload. |

### 2.5 Engine access

| Key | Notes |
|---|---|
| `projectWith(overrides)` | Runs the host engine on `{ ...inputs, ...overrides }` and returns the result. Memoized by the host. This is how Readiness in Full and the relocation compare get their alternates. |
| `engineHooks` | Reserved (section 7). Empty in v1. |

### 2.6 Entitlement (read only)

| Key | Notes |
|---|---|
| `isPremium` | boolean |
| `licensedTo` | string or null — the identity claim on the key, for display. |
| `expiresAt` | Date or null |
| `preview` | boolean — read-only demo rendering; stores reject mutations. |

In preview (Demo Mode, no valid key) the host loads only the areas on its demo
list (`src/config/demoDeliveryKey.js`, today `holdings`), with the demo
delivery key described in section 6; every other mount shows its locked
element. A mount never fetches without a key.

### 2.7 Shared UI

Modules render with the host's design tokens (CSS variables). Shared
components arrive two ways: on the API for things a component picks at
render time (`host.ui = { Tooltip, ChartFigure, SortableTh, useColumnSort,
DistributionMatrix, PrefSection }`), and through `@host/` imports for the
rest (2.8). Anything not on either list, a module ships itself.

### 2.8 Host code a module may import (`@host/...`)

A module names the host code it uses with the `@host/<path>` specifier,
never a relative path. The allowlist is `src/premium/hostLib.js` in the host:
React itself (so a separately built chunk never carries a second copy),
`lucide-react`, the open data-layer utilities (`utils/portfolioHoldings`,
`utils/holdingsCore`, `utils/pricingSource`, …), the engine entry
(`calculator`, published whole since 1.2 so a module computes with the same
functions the host does) and a handful of shared components. Inside the host repo `@host/` is a build alias onto `src/`; in
the Premium repo the same specifier is rewritten at build time to a lookup
on `window.__OR_HOST__`, published by the host loader before a chunk runs.
Adding an entry to `hostLib.js` is a minor contract bump; removing one is
major.

## 3. What the host does not provide

- Direct `localStorage`, `sessionStorage` or IndexedDB access.
- `fetch` to anything except the one user-configured pricing URL (section 6).
- The key itself. The module knows `isPremium` and `licensedTo`, never the token.
- Any other module. Modules do not import each other; shared needs go through
  the host.
- The host's internal React context. `useSimulation()` and `useEntitlement()`
  are host-only; a module gets their contents through `host`.

## 4. What a module provides

A module is an ES module whose default export is a factory:

```js
export default function createModule(host) {
  return {
    area: 'holdings',          // one of the four area ids
    version: '2026.10.1',      // shown in Preferences; must match the chunk manifest
    mounts: {
      portfolioTab: PortfolioTab,                 // React components, receive { host }
      preferencesPricing: PricingSection,
      initialBalancesCta: SyncFromHoldingsCta,
    },
    // optional
    backup: { describe, sanitize },                // extra validation for its namespace on restore
    onUnload() {},                                 // key lapsed/revoked: drop timers, close modals
  };
}
```

`mounts` keys are the host's mount-point ids (section 5). A module may fill any
subset; the host renders its locked card for the rest.

The factory must be pure: no side effects on import or on call. A module that
needs setup does it inside its components.

## 5. Mount points (v1)

| Id | Where in the host | Locked-card copy comes from |
|---|---|---|
| `portfolioTab` | Sidebar "Detailed Holdings" tab | `PREMIUM_AREAS.holdings` |
| `preferencesPricing` | Preferences > Live Pricing Connection | same |
| `initialBalancesCta` | Plan Settings > Initial Balances | same |
| `spendingBridge` | Plan Settings > Spending | `PREMIUM_AREAS.spending` |
| `spendingFloor` | Plan Settings > Spending | same |
| `spendingImport` | Plan Settings > Spending | same |
| `readinessDetail` | Readiness tab, below the free summary | `PREMIUM_AREAS.readiness` |
| `historicalStarts` | Readiness tab | same |
| `relocationCompare` | Plan Settings > Life Events | `PREMIUM_AREAS.relocation` |
| `residencyTimeline` | Plan Settings > Life Events | same |

Adding a mount point is a host change: a new id here, a `<PremiumMount id>`
in the host tree, and copy in `premiumOffering.js`. It is never a module-only
change.

## 6. Network

A module makes **no network calls**, with one declared exception: the holdings
module may `fetch` the pricing URL the user typed into Preferences (their own
Google Apps Script deployment). The host passes it as `host.holdings.pricingSource`
and the module may call only that origin. The privacy page states this
exception in the same sentence as the rule.

The chunk itself is fetched by the **host loader**, not by any module: the
loader sends the key to the endpoint, verifies the returned chunk's signature
and version against the manifest, and evaluates it. Modules never see this.

**The demo delivery key.** The endpoint serves a chunk to a valid Premium key
(`premium: true`) for any area, and to the demo delivery key (`demo: true`,
no premium flag, no address; `src/config/demoDeliveryKey.js`) for the demo
areas only. The demo key ships in the app bundle and is sent only in preview.
It carries no entitlement: the host requires `premium: true` of a pasted key,
so the demo key unlocks nothing, and what it exposes is the demo areas' code,
which every Premium holder receives anyway.

## 7. Engine extensions (reserved, not in v1)

Decision 7 of `OPEN_CORE_PLAN.md` leaves Relocation's foreign-residence math
inside the private tree for the first release. If it is later extracted, it
will attach through `host.engineHooks` — a documented set of points in
`runProjection` (for example `foreignTaxForYear(ctx)`) that the host calls when
an extension is registered and skips otherwise. The shape is reserved here so
v1 modules do not invent their own way into the engine. Nothing in v1 reads
`engineHooks`.

## 8. Versioning

- The contract has a version (`CONTRACT_VERSION`, exported by the host loader).
  A module declares the contract version it was built against; the host refuses
  a mismatch with a locked card that says the module needs updating, never a
  blank tab.
- Adding a key to `host` or a new mount point is a minor bump. Removing or
  renaming is a major bump and is done only with every module updated in the
  same release.

## 9. Testing

- `CONTRACT_VERSION` lives in `src/premium/contract.js`; `host.lib`'s
  allowlist in `src/premium/hostLib.js`.
- The host test suite runs with **no module present** and must stay green:
  every mount point renders its locked card, backup/restore round-trips every
  namespace, the sync-to-Initial-Balances rollup works from stored holdings.
- Each module has its own suite in the Premium repo and tests against a
  `createTestHost()` fixture that implements this contract — the fixture is
  the executable form of this document and lives in the host repo so both
  sides compile against the same thing.
- The host keeps one integration test per area that loads a stub module and
  checks the mount points fill.

## 10. What this contract deliberately does not do

- It is not a public plugin API. Nothing is promised to anyone outside the two
  repos; the version rules above exist so the two repos stay in step, not so
  third parties can target it.
- It does not sandbox. A module runs in the page with the privileges of any
  script there. The protection is review and the source-available Premium
  repo, not isolation. If third-party modules are ever wanted, that is the day
  to add an iframe boundary — and the host API above is already shaped so that
  boundary could be a `postMessage` bridge.
