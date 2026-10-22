// "Your three answers" (changelog 453): the plan's own notes on what it is
// for, carried by saved scenarios, Backup Everything and the demo.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PLAN_ANSWERS_KEY, ANSWER_MAX_LENGTH, ANSWER_FIELDS,
  sanitizeAnswers, sanitizeAnswersForEditing, hasAnswers, answersSummary, readPlanAnswers,
} from '../utils/planAnswers';
import { buildFullBackupPayload, applyFullBackupToStorage, summarizeBackupPayload } from '../utils/fullBackup';
import { migrateScenarios, DEFAULT_INPUTS } from '../calculator';
import { hasOwnPlanData } from '../utils/demoEntryGuard';
import { maskNamesInText } from '../utils/printNames';
import { PLAN_KEYS, WATCHED_PLAN_KEYS } from '../utils/storageKeys';

const ANSWERS = { maximize: 'Travel while we are healthy', protect: 'The house', giveUp: 'A newer car' };

describe('the answers themselves', () => {
  it('asks the three questions, in order', () => {
    expect(ANSWER_FIELDS.map((f) => f.question)).toEqual([
      'What do you want to maximize?', 'What are you unwilling to risk?', 'What would you give up?',
    ]);
  });

  it('keeps only the three fields, trimmed, single-line and capped', () => {
    const long = 'x'.repeat(ANSWER_MAX_LENGTH + 50);
    expect(sanitizeAnswers({ maximize: '  a \n b  ', protect: long, giveUp: 7, other: 'no' }))
      .toEqual({ maximize: 'a b', protect: 'x'.repeat(ANSWER_MAX_LENGTH) });
    expect(sanitizeAnswers(null)).toEqual({});
    expect(sanitizeAnswers(['a'])).toEqual({});
    expect(sanitizeAnswers({ maximize: '   ' })).toEqual({});
  });

  it('keeps a trailing space while typing, but not a line break', () => {
    expect(sanitizeAnswersForEditing({ maximize: 'time with ', protect: 'a\nb' })).toEqual({ maximize: 'time with ', protect: 'a b' });
  });

  it('summarizes in one line, leaving blanks out', () => {
    expect(answersSummary(ANSWERS)).toBe('Maximize: Travel while we are healthy · Won’t risk: The house · Would give up: A newer car');
    expect(answersSummary({ protect: 'The house' })).toBe('Won’t risk: The house');
    expect(answersSummary({})).toBe('');
    expect(answersSummary(undefined)).toBe('');
    expect(hasAnswers({ giveUp: ' ' })).toBe(false);
  });

  it('is plan data: backed up and watched across tabs', () => {
    expect(PLAN_KEYS).toContain(PLAN_ANSWERS_KEY);
    expect(WATCHED_PLAN_KEYS).toContain(PLAN_ANSWERS_KEY);
  });
});

describe('backup and restore', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips the current plan’s answers and each scenario’s', () => {
    localStorage.setItem('retire_plan_inputs', JSON.stringify({ inputs: DEFAULT_INPUTS }));
    localStorage.setItem(PLAN_ANSWERS_KEY, JSON.stringify(ANSWERS));
    localStorage.setItem('retire_plan_scenarios', JSON.stringify({
      scenarios: [
        { id: 'a', name: 'With answers', inputs: DEFAULT_INPUTS, metrics: { endingBalance: 1, isSuccessful: true, peakPortfolioWorth: 1 }, answers: { protect: 'The house' } },
        { id: 'b', name: 'Without', inputs: DEFAULT_INPUTS, metrics: { endingBalance: 1, isSuccessful: true, peakPortfolioWorth: 1 } },
      ],
    }));
    const payload = JSON.parse(JSON.stringify(buildFullBackupPayload()));
    expect(payload.planAnswers).toEqual(ANSWERS);
    expect(summarizeBackupPayload(payload)).toContain('your three answers');

    localStorage.clear();
    applyFullBackupToStorage(payload);
    expect(readPlanAnswers()).toEqual(ANSWERS);
    const saved = JSON.parse(localStorage.getItem('retire_plan_scenarios')).scenarios;
    expect(saved.find((s) => s.id === 'a').answers).toEqual({ protect: 'The house' });
    expect(saved.find((s) => s.id === 'b')).not.toHaveProperty('answers');
  });

  it('an older backup without answers restores cleanly and leaves this browser’s answers alone', () => {
    localStorage.setItem(PLAN_ANSWERS_KEY, JSON.stringify(ANSWERS));
    const old = {
      version: 'cfe-full-backup-1',
      activeInputs: DEFAULT_INPUTS,
      savedScenarios: [{ id: 'x', name: 'Old', inputs: DEFAULT_INPUTS }],
    };
    expect(() => applyFullBackupToStorage(old)).not.toThrow();
    expect(readPlanAnswers()).toEqual(ANSWERS);
    const saved = JSON.parse(localStorage.getItem('retire_plan_scenarios')).scenarios;
    expect(saved[0]).not.toHaveProperty('answers');
  });

  it('cleans what a file carries: unknown fields dropped, long text capped', () => {
    applyFullBackupToStorage({
      activeInputs: DEFAULT_INPUTS,
      planAnswers: { maximize: 'y'.repeat(500), script: '<b>x</b>' },
      savedScenarios: [{ id: 's', name: 'S', inputs: DEFAULT_INPUTS, answers: { giveUp: 42, protect: ' ok ' } }],
    });
    expect(readPlanAnswers()).toEqual({ maximize: 'y'.repeat(ANSWER_MAX_LENGTH) });
    expect(JSON.parse(localStorage.getItem('retire_plan_scenarios')).scenarios[0].answers).toEqual({ protect: 'ok' });
  });

  it('an unreadable stored value reads as no answers', () => {
    localStorage.setItem(PLAN_ANSWERS_KEY, '{not json');
    expect(readPlanAnswers()).toEqual({});
  });
});

describe('around the app', () => {
  beforeEach(() => localStorage.clear());

  it('saved scenarios keep their answers through loading', () => {
    const [sc] = migrateScenarios({ scenarios: [{ id: '1', name: 'A', inputs: {}, answers: { maximize: ' Time ' } }] });
    expect(sc.answers).toEqual({ maximize: 'Time' });
    const [plain] = migrateScenarios([{ id: '2', name: 'B', inputs: {} }]);
    expect(plain).not.toHaveProperty('answers');
  });

  it('written answers count as the user’s own data before the demo opens', () => {
    expect(hasOwnPlanData(localStorage)).toBe(false);
    localStorage.setItem(PLAN_ANSWERS_KEY, JSON.stringify({ protect: '   ' }));
    expect(hasOwnPlanData(localStorage)).toBe(false);
    localStorage.setItem(PLAN_ANSWERS_KEY, JSON.stringify({ protect: 'The house' }));
    expect(hasOwnPlanData(localStorage)).toBe(true);
  });

  it('"Leave out names" masks names inside the answers', () => {
    const inputs = { spouse1Name: 'Ray', spouse2Name: 'Angie', heirs: [{ name: 'Mia' }] };
    expect(maskNamesInText("If I outlive Ray, Ray's check; Angie and mia. Rayburn stays.", inputs, true))
      .toBe("If I outlive Spouse 1, Spouse 1's check; Spouse 2 and Heir 1. Rayburn stays.");
    expect(maskNamesInText('Ray', inputs, false)).toBe('Ray');
  });
});
