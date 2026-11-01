// @vitest-environment jsdom
//
// First-time user review, round A (changelog 471): the sample plan says it
// is one, a first visit gets no news pop-up, Quick Setup folds what a
// beginner need not answer even when its sections load late, the unnamed
// first person is "you", the spending suggestion starts from take-home pay,
// and the sidebar's save note is in plain words.
import { describe, it, expect, beforeEach } from 'vitest';
import React, { useEffect, useState } from 'react';
import { render, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_INPUTS } from '../calculator';
import { isSamplePlan, sampleStatus, SAMPLE_IDENTITY_KEYS } from '../utils/samplePlan';
import { getPossessive } from '../components/plan/getPossessive';
import { whatsNewMayShow, WHATS_NEW_SEEN_KEY, DISMISSED_ANNOUNCE_KEY } from '../utils/whatsNewGate';
import { activeAnnouncements } from '../config/announcements';
import { GuidedSection } from '../components/plan/sectionShared';
import { buildActionPlan } from '../utils/actionPlan';
import { runProjection } from '../calculator';

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

describe('the sample plan says it is one', () => {
  it('is the sample until any figure that describes the person changes', () => {
    expect(isSamplePlan(DEFAULT_INPUTS)).toBe(true);
    for (const k of SAMPLE_IDENTITY_KEYS) {
      expect(isSamplePlan({ ...DEFAULT_INPUTS, [k]: Number(DEFAULT_INPUTS[k]) + 1 }), k).toBe(false);
    }
    // An assumption is not the person.
    expect(isSamplePlan({ ...DEFAULT_INPUTS, inflationRate: 3 })).toBe(true);
    // The demo households are never "the sample".
    expect(isSamplePlan(DEFAULT_INPUTS, { demoActive: true })).toBe(false);
  });
  it('the compact status is neutral and says whose figures they are', () => {
    const s = sampleStatus(DEFAULT_INPUTS);
    expect(s.tone).toBe('neutral');
    expect(s.label).toBe('Sample plan');
    expect(s.detail).toMatch(/made-up \d+-year-old, not you/);
  });
  it('App shows the banner and routes every compact status through it', () => {
    const app = read('App.jsx');
    expect(app).toMatch(/data-testid="sample-plan-banner"/);
    expect(app).toMatch(/Enter yours: 6 questions/);
    expect(app).toMatch(/mobile-topbar-verdict \$\{verdictClass\(statusVerdict\.tone\)\}/);
    const side = read('components/layout/Sidebar.jsx');
    expect(side).toMatch(/const verdict = statusVerdict \|\| sharedVerdict/);
  });
});

describe('a first visit gets no news pop-up', () => {
  beforeEach(() => localStorage.clear());
  it('catches a new visitor up on releases and on announcements not meant for them, so a later check stays quiet', () => {
    expect(whatsNewMayShow()).toBe(false);
    expect(localStorage.getItem(WHATS_NEW_SEEN_KEY)).not.toBeNull();
    const notForNew = activeAnnouncements().filter((a) => a.showToNewVisitors === false).map((a) => a.id);
    const dismissed = JSON.parse(localStorage.getItem(DISMISSED_ANNOUNCE_KEY) || '[]');
    for (const id of notForNew) expect(dismissed).toContain(id);
    // The second check in the same session (after Quick Setup) is quiet too.
    expect(whatsNewMayShow()).toBe(false);
  });
  it('the welcome announcement is not for new visitors', () => {
    const welcome = activeAnnouncements().find((a) => a.id === 'welcome-2026-09-30');
    if (welcome) expect(welcome.showToNewVisitors).toBe(false);
  });
});

describe('Quick Setup folds what a beginner need not answer, even when the section arrives late', () => {
  function LateSection() {
    const [ready, setReady] = useState(false);
    useEffect(() => { const t = setTimeout(() => setReady(true), 20); return () => clearTimeout(t); }, []);
    if (!ready) return null;
    return (
      <div>
        <div className="section-subtitle">A heading with no field</div>
        <div className="form-group"><label htmlFor="field-birthYear1">Birth year</label><input id="field-birthYear1" /></div>
        <div className="form-group"><label htmlFor="field-sex1" style={{ display: 'block' }}>Sex</label><select id="field-sex1" /></div>
        <div><button type="button">Print for review</button></div>
      </div>
    );
  }
  it('folds the unwanted field, a block with no field, and a label with an inline display', async () => {
    const { container } = render(<GuidedSection only={['birthYear']}><LateSection /></GuidedSection>);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    const hidden = (el) => !!el.closest('.guided-hidden');
    expect(hidden(container.querySelector('#field-birthYear1'))).toBe(false);
    expect(hidden(container.querySelector('#field-sex1'))).toBe(true);
    expect(hidden(container.querySelector('label[for="field-sex1"]'))).toBe(true);
    expect(hidden(container.querySelector('.section-subtitle'))).toBe(true);
    expect(hidden([...container.querySelectorAll('button')].find((b) => b.textContent === 'Print for review'))).toBe(true);
  });
  it('the stylesheet hides a folded element even when it has an inline display', () => {
    expect(read('index.css')).toMatch(/\.guided-section \.guided-hidden \{ display: none !important; \}/);
  });
});

describe('an unnamed first person is "you"', () => {
  it('labels read "Your", and the Action Plan says "You save"', () => {
    expect(getPossessive('Primary')).toBe('Your');
    expect(getPossessive('Ann')).toBe("Ann's");
    const plan = buildActionPlan(DEFAULT_INPUTS, runProjection(DEFAULT_INPUTS), (v) => `$${Math.round(v)}`);
    const labels = plan.sections.flatMap((s) => s.items.map((i) => i.label));
    expect(labels.some((l) => /^You save /.test(l))).toBe(true);
    expect(labels.some((l) => /Primary/.test(l))).toBe(false);
  });
});

describe('Quick Setup wording', () => {
  const app = read('App.jsx');
  it('suggests spending from take-home pay, not 75% of income', () => {
    expect(app).not.toMatch(/Use 75%/);
    expect(app).toMatch(/data-testid="wizard-spending-suggestion"/);
    expect(app).toMatch(/Start from what you spend now\./);
  });
  it('one recommended start, with the other two underneath', () => {
    expect(app).toMatch(/data-testid="onboarding-start-quick"/);
    expect(app).toMatch(/data-testid="onboarding-other-ways"/);
    expect(app).not.toMatch(/Full Guided Interview<\/div>/);
  });
  it('ends with what was assumed, and no keyboard shortcut', () => {
    expect(app).toMatch(/What we assumed for you/);
    expect(app).not.toMatch(/Ctrl\+K \(Cmd\+K on a Mac\) finds any setting by name/);
  });
});

describe('the sidebar save note', () => {
  it('is in plain words', () => {
    const side = read('components/layout/Sidebar.jsx');
    expect(side).not.toMatch(/data never reconciled/);
    expect(side).toMatch(/Saved in this browser only\./);
  });
});
