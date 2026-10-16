// Mobile speed pass (2026-09-28): tabs outside the first screen load on
// first open. These pins keep the split from being undone by one stray
// static import, and keep offline use intact.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8');
const LAZY = ['SettingsTab', 'InterviewTab', 'GuideTab', 'TaxEstateTab', 'YearLedgerTab', 'ScenariosTab', 'RiskTab', 'ReadinessTab', 'StrategyTab', 'LifePlanTab', 'PreferencesTab', 'PremiumTab'];

describe('secondary tabs are code-split', () => {
  for (const t of LAZY) {
    it(t, () => {
      expect(app).toContain(`const ${t} = lazyWithRetry(() => import('./components/tabs/${t}'));`);
      expect(app).not.toMatch(new RegExp(`^import ${t} from`, 'm'));
    });
  }
  // Detailed Holdings is a Premium module (PREMIUM_MODULE_CONTRACT.md): the
  // host never imports it statically; the registry loads it through a
  // dynamic import only once an entitlement asks for it.
  it('PortfolioTab is loaded through the Premium registry, not imported by App.jsx', () => {
    expect(app).not.toMatch(/import\(.*PortfolioTab|from '.*PortfolioTab'/);
    const registry = fs.readFileSync(path.join(SRC, 'premium', 'registry.js'), 'utf8');
    expect(registry).not.toMatch(/import\(['"]\.\/modules/);
    expect(registry).toContain('loadRemote');
  });
  it("What's New (and with it the whole changelog) is code-split", () => {
    expect(app).toContain("const WhatsNewPopup = lazyWithRetry(() => import('./components/WhatsNewPopup'));");
    // Nothing on the startup path imports the changelog directly.
    const offenders = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== '__tests__') walk(f); } else if (/\.jsx?$/.test(e.name) && /from '[./]*config\/changelog'|from '\.\/changelog'/.test(fs.readFileSync(f, 'utf8'))) offenders.push(path.relative(SRC, f)); } };
    walk(SRC);
    // The Help tab's history lives in WhatsNewHistory, which only the lazy
    // GuideTab imports.
    expect(offenders.sort()).toEqual(['components/WhatsNewHistory.jsx', 'components/WhatsNewPopup.jsx']);
  });
  // Review 2026-09-30 (H3): the Plan tabs, the Quick Setup sections, the
  // print packet, the field index and jose left the startup chunk.
  it('nothing on the startup path imports the Plan sections, the print packet, FindSetting or jose statically', () => {
    const staticImports = (src) => [...src.matchAll(/^import[^;]*?from '([^']+)'/gm)].map((m) => m[1]);
    const appImports = staticImports(app);
    for (const bad of ['./components/plan/sectionShared', './components/PrintPacket', './components/FindSetting', './components/tabs/SettingsTab', './components/tabs/InterviewTab']) {
      expect(appImports, bad).not.toContain(bad);
    }
    expect(appImports.filter((m) => m.startsWith('./components/plan/sections/'))).toEqual([]);
    for (const f of ['components/layout/Sidebar.jsx', 'components/ActionPlanCard.jsx']) {
      expect(staticImports(fs.readFileSync(path.join(SRC, f), 'utf8')), f).not.toContain('./PrintPacket');
      expect(staticImports(fs.readFileSync(path.join(SRC, f), 'utf8')), f).not.toContain('../PrintPacket');
    }
    expect(staticImports(fs.readFileSync(path.join(SRC, 'utils/premiumJwt.js'), 'utf8'))).not.toContain('jose');
  });
  // Review 2026-09-30 (H3 leftovers): the Detailed Holdings model beyond
  // what startup needs, the demo plan and the country summaries.
  it('nothing reachable from main.jsx by static imports pulls in portfolioHoldings, the demo plan or the country summaries', () => {
    const resolveImport = (from, spec) => {
      const base = path.resolve(path.dirname(from), spec);
      for (const f of [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js')]) {
        if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
      }
      return null;
    };
    const seen = new Set();
    const stack = [path.join(SRC, 'main.jsx')];
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      const src = fs.readFileSync(f, 'utf8');
      const specs = [...src.matchAll(/^(?:import|export)[^;'"]*?from\s+'([^']+)'|^import\s+'([^']+)'/gm)].map((m) => m[1] || m[2]);
      for (const spec of specs) {
        if (!spec.startsWith('.')) continue;
        const r = resolveImport(f, spec);
        if (r) stack.push(r);
      }
    }
    const reached = [...seen].map((f) => path.relative(SRC, f));
    expect(reached).toContain('App.jsx');
    expect(reached).toContain('utils/holdingsCore.js');
    expect(reached).not.toContain('utils/portfolioHoldings.js');
    expect(reached).not.toContain('config/demoPlan.js');
  });
  it('every lazy import in App.jsx goes through lazyWithRetry', () => {
    expect(app).not.toMatch(/React\.lazy\(/);
  });
  it('the service worker precaches every built JS chunk, so lazy tabs still work offline', () => {
    const vite = fs.readFileSync(path.join(SRC, '..', 'vite.config.js'), 'utf8');
    expect(vite).toMatch(/globPatterns[^\]]*js/);
  });
});
