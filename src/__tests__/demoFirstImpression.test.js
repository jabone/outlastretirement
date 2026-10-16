// The demo's first screen (outside review, 2026-09-28): the Carters' answer,
// not three stacked popups and a warning about their sample holdings.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEMO_DEEP_LINK_DEFAULT_TAB, parseDemoDeepLink } from '../utils/demoDeepLink';

const app = fs.readFileSync(path.resolve(__dirname, '..', 'App.jsx'), 'utf8');

describe('the demo opens on its answer', () => {
  it('lands on the Dashboard', () => {
    expect(DEMO_DEEP_LINK_DEFAULT_TAB).toBe('dashboard');
    expect(parseDemoDeepLink('?demo=1')).toEqual({ landOnTab: 'dashboard' });
  });
  it('does not open the setup chooser over the demo', () => {
    expect(app).toMatch(/localStorage\.getItem\('retire_plan_onboarding_completed'\) !== 'true' && !isDemoModeActive\(\)/);
  });
  it('holds What\'s New until the demo is exited', () => {
    expect(app).toMatch(/\{!showDisclaimer && !showOnboarding && !demoActive && whatsNewPending && \(\s*(<React\.Suspense[^>]*>\s*)?<WhatsNewPopup \/>/);
    // The gate that loads it is held by the same three conditions.
    expect(app).toMatch(/const whatsNewEligible = !showDisclaimer && !showOnboarding && !demoActive;/);
  });
  it('does not warn that the sample holdings differ from the plan', () => {
    expect(app).toMatch(/demoActive \? null : unlinkedBalanceGap\(/);
  });
});
