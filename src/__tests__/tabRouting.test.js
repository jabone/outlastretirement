// Two jobs in this file.
//
// The first half is ordinary unit testing of parseHash/formatHash -- the
// edge cases a URL actually arrives in (truncated, uppercased, alias,
// trailing slash, percent-mangled by an email client) and what each one
// should resolve to.
//
// The second half is the part worth reading. ROUTES in tabRouting.js has
// to list every sub-tab id, but those ids are DECLARED in the tab
// components themselves. That's a hand-maintained copy of information that
// already exists in code, and the failure is silent: an id missing from
// ROUTES doesn't throw, it just makes '#/settings/newsection' quietly fall
// back to Household. So the test below re-derives the real ids from the
// components' source on every run and fails if the table disagrees in
// either direction.
//
// Same approach, and the same reason, as inputCoverage.test.js -- once a
// list in one file has to match a list in another, only a test can hold
// them together.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ROUTES, TAB_ALIASES, DEFAULT_TAB, parseHash, formatHash, canonicalTab, initialSubTab } from '../utils/tabRouting';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

describe('parseHash', () => {
  it('parses a tab-only hash', () => {
    expect(parseHash('#/settings')).toEqual({ tab: 'settings', subTab: null });
  });

  it('parses a tab + sub-tab hash', () => {
    expect(parseHash('#/settings/taxes')).toEqual({ tab: 'settings', subTab: 'taxes' });
  });

  it.each([
    ['#settings/taxes', 'no leading slash'],
    ['#/settings/taxes/', 'trailing slash'],
    ['#/SETTINGS/TAXES', 'uppercase'],
    ['#//settings//taxes', 'doubled slashes'],
    ['#/ settings / taxes ', 'stray whitespace'],
  ])('tolerates %s (%s)', (hash) => {
    expect(parseHash(hash)).toEqual({ tab: 'settings', subTab: 'taxes' });
  });

  it.each([[''], ['#'], ['#/'], [null], [undefined], [42]])('returns null for the empty/garbage hash %p', (hash) => {
    expect(parseHash(hash)).toBeNull();
  });

  it('returns null for a tab that does not exist, rather than guessing', () => {
    expect(parseHash('#/nonsense')).toBeNull();
    expect(parseHash('#/nonsense/taxes')).toBeNull();
  });

  // The asymmetry here is deliberate and is the whole point of the
  // "forgiving in one direction" comment in tabRouting.js: a real tab with
  // a junk section still lands you on the right tab, because a truncated
  // URL should degrade to something useful rather than to Dashboard.
  it('keeps a valid tab when the sub-tab is unknown', () => {
    expect(parseHash('#/settings/notasection')).toEqual({ tab: 'settings', subTab: null });
  });

  it('does not accept a sub-tab that belongs to a different tab', () => {
    // 'montecarlo' is a Risk section, not a Settings one.
    expect(parseHash('#/settings/montecarlo')).toEqual({ tab: 'settings', subTab: null });
    expect(parseHash('#/risk/montecarlo')).toEqual({ tab: 'risk', subTab: 'montecarlo' });
  });

  it('survives a malformed percent-escape instead of throwing', () => {
    // decodeURIComponent throws on this. An email client mangling a link
    // is not a reason to fail App's first render.
    expect(() => parseHash('#/%E0%A4%A')).not.toThrow();
    expect(parseHash('#/%E0%A4%A')).toBeNull();
  });

  it('resolves aliases to their current tab', () => {
    expect(parseHash('#/ledger')).toEqual({ tab: 'yearledger', subTab: null });
    expect(parseHash('#/reference/dictionary')).toEqual({ tab: 'guide', subTab: 'dictionary' });
  });
});

describe('formatHash', () => {
  it('omits the sub-tab segment when it is the default', () => {
    expect(formatHash('settings', 'household')).toBe('#/settings');
    expect(formatHash('risk', 'stress')).toBe('#/risk');
  });

  it('includes a non-default sub-tab', () => {
    expect(formatHash('settings', 'taxes')).toBe('#/settings/taxes');
  });

  it('omits a sub-tab the tab does not have', () => {
    expect(formatHash('settings', 'montecarlo')).toBe('#/settings');
  });

  it('emits the canonical name for an alias, which is what rewrites the address bar', () => {
    expect(formatHash('ledger')).toBe('#/yearledger');
    expect(formatHash('reference', 'dictionary')).toBe('#/guide/dictionary');
  });

  it('falls back to the default tab rather than emitting an unroutable hash', () => {
    expect(formatHash('bogus')).toBe(`#/${DEFAULT_TAB}`);
    expect(formatHash(undefined)).toBe(`#/${DEFAULT_TAB}`);
  });

  // The round-trip property: anything formatHash can emit, parseHash must
  // read back to the same place. Without this, state -> URL -> reload could
  // land somewhere other than where the user was.
  it('round-trips every tab and sub-tab', () => {
    for (const [tab, route] of Object.entries(ROUTES)) {
      const ids = route.subTabs.length ? route.subTabs : [null];
      for (const subTab of ids) {
        const parsed = parseHash(formatHash(tab, subTab));
        expect(parsed.tab, `${tab}/${subTab}`).toBe(tab);
        // A default sub-tab is intentionally not in the URL, so it parses
        // back as null and the app supplies the same default.
        const expectedSub = subTab === route.defaultSubTab ? null : subTab;
        expect(parsed.subTab, `${tab}/${subTab}`).toBe(expectedSub);
      }
    }
  });
});

describe('canonicalTab / initialSubTab', () => {
  it('maps aliases and rejects unknowns', () => {
    expect(canonicalTab('ledger')).toBe('yearledger');
    expect(canonicalTab('YEARLEDGER')).toBe('yearledger');
    expect(canonicalTab('nope')).toBeNull();
    expect(canonicalTab(null)).toBeNull();
  });

  it('applies an incoming route to the one sub-tab it names and no others', () => {
    const route = { tab: 'settings', subTab: 'taxes' };
    expect(initialSubTab(route, 'settings', 'household')).toBe('taxes');
    expect(initialSubTab(route, 'risk', 'stress')).toBe('stress');
    expect(initialSubTab(null, 'settings', 'household')).toBe('household');
    expect(initialSubTab({ tab: 'settings', subTab: null }, 'settings', 'household')).toBe('household');
  });
});

// --- the drift guard ---

describe('ROUTES matches the sub-tab ids the components actually declare', () => {
  // Every setter call with a string literal, across the whole app -- not
  // just inside the owning tab. Cross-tab deep links (DashboardTab's Plan
  // Feedback, the Interview's jump-to-Settings buttons) call these setters
  // too, and an id used by one of those links but missing from ROUTES is
  // exactly as broken as one the tab itself declares.
  const APP_SOURCES = [
    'App.jsx',
    'components/layout/Sidebar.jsx',
    'components/tabs/DashboardTab.jsx',
    'components/tabs/SettingsTab.jsx',
    // Plan Settings' sections live in their own files since IA Phase 3 step 1 (2026-09-24).
    ...readdirSync(join(SRC, 'components/plan/sections')).map((f) => 'components/plan/sections/' + f),
    'components/plan/sectionShared.jsx',
    'components/tabs/InterviewTab.jsx',
    'components/tabs/RiskTab.jsx',
    'components/tabs/StrategyTab.jsx',
    'components/tabs/TaxEstateTab.jsx',
    'components/tabs/GuideTab.jsx',
    'components/InputReference.jsx',
  ].map(read).join('\n');

  const declaredIds = (setterName) =>
    new Set([...APP_SOURCES.matchAll(new RegExp(`${setterName}\\('([a-zA-Z0-9_]+)'\\)`, 'g'))].map((m) => m[1]));

  const SETTERS = {
    settings: 'setSettingsSubTab',
    risk: 'setRiskSubTab',
    strategy: 'setStrategySubTab',
    taxestate: 'setTaxestateSubTab',
    guide: 'setGuideSubTab',
  };

  it.each(Object.entries(SETTERS))('%s: ROUTES lists exactly the ids %s is called with', (tab, setter) => {
    const found = declaredIds(setter);
    expect(found.size, `no ${setter}('...') calls found -- has it been renamed?`).toBeGreaterThan(0);
    const listed = new Set(ROUTES[tab].subTabs);

    const missing = [...found].filter((id) => !listed.has(id));
    expect(missing, `ROUTES.${tab}.subTabs is missing ${JSON.stringify(missing)}. Add them, or '#/${tab}/<id>' will silently fall back to '${ROUTES[tab].defaultSubTab}'.`).toEqual([]);

    const extra = [...listed].filter((id) => !found.has(id));
    expect(extra, `ROUTES.${tab}.subTabs lists ${JSON.stringify(extra)}, which nothing sets any more. Remove them, or the URL advertises a section that no longer exists.`).toEqual([]);
  });

  // YearLedgerTab renders its views from LEDGER_VIEWS (changelog 284).
  it('yearledger: ROUTES matches YearLedgerTab.jsx\'s LEDGER_VIEWS array', () => {
    const src = read('components/tabs/YearLedgerTab.jsx');
    const block = src.match(/const LEDGER_VIEWS = \[([\s\S]*?)\];/);
    expect(block).toBeTruthy();
    const found = [...block[1].matchAll(/id: '([a-zA-Z0-9_]+)'/g)].map((m) => m[1]);
    expect(ROUTES.yearledger.subTabs).toEqual(found);
    expect(ROUTES.yearledger.defaultSubTab).toBe('balances');
  });

  // Detailed Holdings is a Premium module; its sub-tab ids are checked
  // against ROUTES in premium/builtChunk.test.jsx, which loads the real
  // built module. Here we only pin what the host declares.
  it('portfolio: ROUTES declares the holdings sub-tabs the module is built with', () => {
    expect(ROUTES.portfolio.subTabs).toEqual(['holdings', 'dividends', 'retirement', 'analytics', 'rebalance', 'liquidations']);
  });

  it('every tab with sub-tabs declares a default that is one of them', () => {
    for (const [tab, route] of Object.entries(ROUTES)) {
      if (!route.subTabKey) {
        expect(route.subTabs, `${tab} has no subTabKey but lists sub-tabs`).toEqual([]);
        continue;
      }
      expect(route.subTabs, `${tab} has a subTabKey but no sub-tabs`).not.toHaveLength(0);
      expect(route.subTabs, `${tab}'s defaultSubTab is not in its own list`).toContain(route.defaultSubTab);
    }
  });

  it('every routable tab id is actually rendered by App.jsx, and vice versa', () => {
    const app = read('App.jsx');
    const rendered = new Set([...app.matchAll(/activeTab === '([a-zA-Z0-9_]+)'/g)].map((m) => m[1]));
    const routable = new Set([...Object.keys(ROUTES), ...Object.keys(TAB_ALIASES)]);

    const unrendered = [...routable].filter((t) => !rendered.has(t));
    expect(unrendered, `${JSON.stringify(unrendered)} can be reached by URL but App.jsx renders nothing for them -- a deep link would show a blank panel.`).toEqual([]);

    const unroutable = [...rendered].filter((t) => !routable.has(t));
    expect(unroutable, `App.jsx renders ${JSON.stringify(unroutable)} but no URL reaches them.`).toEqual([]);
  });
});
