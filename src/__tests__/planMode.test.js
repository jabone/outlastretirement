// @vitest-environment jsdom
// utils/planMode.js (changelog 252): the one-Plan-entry plumbing.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  readPlanMode, writePlanMode, tabForMode, modeForTab, settingsSubTabFor, interviewStepFor,
  INTERVIEW_TO_SETTINGS, SETTINGS_TO_INTERVIEW, setInterviewStep, INTERVIEW_PROGRESS_KEY,
} from '../utils/planMode';
import { ROUTES } from '../utils/tabRouting';
import { SECTIONS } from '../components/tabs/interviewSections';

beforeEach(() => { localStorage.clear(); });

describe('plan mode memory', () => {
  it('defaults to advanced, remembers a valid mode, ignores junk', () => {
    expect(readPlanMode()).toBe('advanced');
    writePlanMode('guided');
    expect(readPlanMode()).toBe('guided');
    writePlanMode('sideways');
    expect(readPlanMode()).toBe('guided');
    localStorage.setItem('retire_plan_plan_mode', 'nonsense');
    expect(readPlanMode()).toBe('advanced');
  });

  it('maps modes to the two existing tab ids and back', () => {
    expect(tabForMode('guided')).toBe('interview');
    expect(tabForMode('advanced')).toBe('settings');
    expect(modeForTab('interview')).toBe('guided');
    expect(modeForTab('settings')).toBe('advanced');
    expect(modeForTab('dashboard')).toBeNull();
  });
});

describe('section mapping across the switch', () => {
  it('every Interview step maps to a real Plan Settings sub-tab', () => {
    const subTabs = new Set(ROUTES.settings.subTabs);
    for (const s of SECTIONS) {
      expect(INTERVIEW_TO_SETTINGS[s.id], s.id).toBeDefined();
      expect(subTabs.has(INTERVIEW_TO_SETTINGS[s.id]), `${s.id} -> ${INTERVIEW_TO_SETTINGS[s.id]}`).toBe(true);
    }
  });

  it('every Plan Settings sub-tab maps to a real Interview step, and round-trips', () => {
    const steps = new Set(SECTIONS.map((s) => s.id));
    for (const sub of ROUTES.settings.subTabs) {
      const step = SETTINGS_TO_INTERVIEW[sub];
      expect(steps.has(step), `${sub} -> ${step}`).toBe(true);
      // Going Advanced -> Guided -> Advanced lands back on the same sub-tab
      // (except Plan Year, which has no Interview step of its own).
      if (sub !== 'planyear') expect(settingsSubTabFor(step)).toBe(sub);
    }
    expect(interviewStepFor('nope')).toBe('household');
  });

  it('setInterviewStep writes the step the Interview resumes on, keeping visited', () => {
    localStorage.setItem(INTERVIEW_PROGRESS_KEY, JSON.stringify({ current: 'household', visited: ['household', 'income'] }));
    setInterviewStep('roth');
    expect(JSON.parse(localStorage.getItem(INTERVIEW_PROGRESS_KEY))).toEqual({ current: 'roth', visited: ['household', 'income'] });
  });
});
