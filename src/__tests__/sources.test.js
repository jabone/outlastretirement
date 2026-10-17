// The sources list exists so a skeptical user -- or the advisor this app
// keeps telling them to consult -- can verify a statutory figure instead of
// trusting it. That only works if the links go where they claim, so the
// properties worth enforcing are structural: first-party domains, safe
// link handling, and no silent shrinking of the "not yet cited" list into
// something that reads as complete coverage.
import { describe, it, expect } from 'vitest';
import { SOURCES, UNCITED, SOURCE_DOMAINS, SOURCE_VERIFIED_ON } from '../config/sources';

describe('methodology sources', () => {
  it('every entry is complete enough to be useful', () => {
    expect(SOURCES.length).toBeGreaterThan(0);
    for (const src of SOURCES) {
      expect(src.id, 'needs a stable id').toBeTruthy();
      expect(src.label.length, `${src.id} needs a label`).toBeGreaterThan(5);
      // "What it drives here" is the part that makes a citation useful
      // rather than decorative -- it connects the rule to the number the
      // user is actually looking at.
      expect(src.drives.length, `${src.id} must say what it drives`).toBeGreaterThan(20);
      expect(src.publisher, `${src.id} needs a publisher`).toBeTruthy();
    }
  });

  // The rule that matters most. A brokerage explainer or a news summary
  // moves, sells things, and gets details wrong; the agency that sets the
  // rule does not.
  it('links only to the agency that actually sets the rule', () => {
    for (const src of SOURCES) {
      const { protocol, host } = new URL(src.url);
      expect(protocol, `${src.id} must be https`).toBe('https:');
      const firstParty = SOURCE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
      expect(firstParty, `${src.id} points at ${host}, which is not a first-party source`).toBe(true);
    }
  });

  it('has no duplicate ids or duplicate URLs', () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
    expect(new Set(SOURCES.map((s) => s.url)).size).toBe(SOURCES.length);
  });

  it('records when the links were last confirmed', () => {
    expect(SOURCE_VERIFIED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // Guards the honesty of the feature rather than its function: the list
  // covers six figures out of many, and a reader who can't see that would
  // reasonably assume everything is sourced.
  it('still declares what is not cited yet', () => {
    expect(UNCITED.length).toBeGreaterThan(0);
    for (const item of UNCITED) expect(item.length).toBeGreaterThan(5);
    // Nothing should be in both lists.
    const labels = SOURCES.map((s) => s.label.toLowerCase());
    for (const item of UNCITED) {
      expect(labels).not.toContain(item.toLowerCase());
    }
  });
});

describe('per-row check dates', () => {
  it('a row that says when it was fetched shows that date, never an earlier one', () => {
    const dated = SOURCES.filter((s) => s.verified);
    expect(dated.length).toBeGreaterThan(20);
    const bad = dated.filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s.verified) || s.verified < SOURCE_VERIFIED_ON).map((s) => s.id);
    expect(bad).toEqual([]);
    const mismatched = SOURCES
      .map((s) => [s, /(?:Fetched and confirmed|Re-fetched) (\d{4}-\d{2}-\d{2})/.exec(s.note || '')])
      .filter(([s, m]) => m && s.verified !== m[1])
      .map(([s]) => s.id);
    expect(mismatched).toEqual([]);
  });

  it('carries no internal file, symbol or changelog names in what users read', () => {
    for (const src of [...SOURCES.map((s) => `${s.label} ${s.drives} ${s.note || ''}`), ...UNCITED]) {
      expect(src).not.toMatch(/changelog|\.md\b|[A-Z]{3,}_[A-Z_]{3,}|\bengine\b/);
    }
  });
});
