// The public Free and Premium page (outside review, 2026-09-28) is generated
// from the same config the app uses, and must not go stale.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PREMIUM_AREAS } from '../config/premiumOffering';
import { FREE_GROUPS } from '../config/freeOffering';

const ROOT = path.resolve(__dirname, '..', '..');
const page = fs.readFileSync(path.join(ROOT, 'public', 'premium.html'), 'utf8');
const text = page.replace(/&amp;/g, '&').replace(/&rsquo;/g, '’');

describe('public/premium.html', () => {
  it('is current with the config (run node scripts/generatePremiumPage.mjs)', () => {
    expect(() => execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'generatePremiumPage.mjs'), '--check'], { stdio: 'pipe' })).not.toThrow();
  });
  it('lists every free group and every Premium area and feature', () => {
    for (const g of FREE_GROUPS) expect(text).toContain(`<h3>${g.title}</h3>`);
    for (const a of PREMIUM_AREAS) {
      expect(text).toContain(`<h3>${a.name}</h3>`);
      for (const f of a.features) expect(text).toContain(`<strong>${f.title}.</strong>`);
    }
  });
  it('says Premium is free in beta and gives the contact', () => {
    expect(page).toMatch(/invite-only and free while we are in beta/);
    expect(page).toMatch(/mailto:support@outlastretirement\.com/);
  });
  it('is reachable at /premium and linked from the home page and the app', () => {
    const rewrites = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).rewrites;
    expect(rewrites).toContainEqual({ source: '/premium', destination: '/premium.html' });
    expect(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')).toContain('href="/premium"');
    expect(fs.readFileSync(path.join(ROOT, 'src', 'components', 'tabs', 'PremiumTab.jsx'), 'utf8')).toContain('href="/premium"');
  });
});

describe('Readiness in Full lists every Readiness lock', () => {
  it('one point per LockedDetail on the Readiness tab', () => {
    const tab = fs.readFileSync(path.join(ROOT, 'src', 'components', 'tabs', 'ReadinessTab.jsx'), 'utf8');
    const locks = (tab.match(/<LockedDetail\b/g) || []).length;
    const area = PREMIUM_AREAS.find((a) => a.id === 'readiness');
    expect(area.tab).toBe('readiness');
    expect(area.features[0].points).toHaveLength(locks);
  });
});
