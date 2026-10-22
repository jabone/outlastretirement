// "Your three answers" (changelog 453): three short notes a household
// writes about a plan -- what it should maximize, what it must not risk,
// what they would give up. The current plan's answers live in their own
// browser-storage key (not in `inputs`, so typing one never re-runs the
// engine or makes a saved Monte Carlo result stale); a saved scenario
// carries a copy as `answers`. Plain text, never sent anywhere, carried in
// Backup Everything like the rest of the plan.
export const PLAN_ANSWERS_KEY = 'retire_plan_answers_v1';
export const ANSWER_MAX_LENGTH = 140;

export const ANSWER_FIELDS = Object.freeze([
  { key: 'maximize', question: 'What do you want to maximize?', short: 'Maximize' },
  { key: 'protect', question: 'What are you unwilling to risk?', short: 'Won’t risk' },
  { key: 'giveUp', question: 'What would you give up?', short: 'Would give up' },
]);

// Only the three known keys, as trimmed strings of at most
// ANSWER_MAX_LENGTH characters; anything else is dropped.
export function sanitizeAnswers(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const { key } of ANSWER_FIELDS) {
    const v = raw[key];
    if (typeof v !== 'string') continue;
    const t = v.replace(/\s+/g, ' ').trim().slice(0, ANSWER_MAX_LENGTH);
    if (t) out[key] = t;
  }
  return out;
}

// The same, for text still being typed: known keys and the length cap, but
// spaces kept (trimming each keystroke would eat the space before the next
// word). What is stored goes through sanitizeAnswers.
export function sanitizeAnswersForEditing(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const { key } of ANSWER_FIELDS) {
    if (typeof raw[key] === 'string') out[key] = raw[key].replace(/[\r\n]+/g, ' ').slice(0, ANSWER_MAX_LENGTH);
  }
  return out;
}

export function hasAnswers(raw) {
  return Object.keys(sanitizeAnswers(raw)).length > 0;
}

// "Maximize: travel while we're healthy · Won't risk: the house" -- blank
// answers are left out; '' when there are none.
export function answersSummary(raw) {
  const a = sanitizeAnswers(raw);
  return ANSWER_FIELDS.filter((f) => a[f.key]).map((f) => `${f.short}: ${a[f.key]}`).join(' · ');
}

export function readPlanAnswers(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    const raw = storage ? storage.getItem(PLAN_ANSWERS_KEY) : null;
    return raw ? sanitizeAnswers(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}
