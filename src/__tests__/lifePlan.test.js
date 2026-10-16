import { describe, it, expect } from 'vitest';
import {
  LIFE_PLAN_SECTIONS, LIFE_PLAN_PROMPTS, LIFE_PLAN_STORAGE_KEY,
  readLifePlan, writeLifePlan, setLifePlanAnswer, answeredCount,
} from '../config/lifePlan.js';

const store = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), _map: map };
};

describe('life plan prompts', () => {
  it('is four sections of two prompts plus a free-form box, with unique ids', () => {
    expect(LIFE_PLAN_SECTIONS).toHaveLength(4);
    for (const s of LIFE_PLAN_SECTIONS) expect(s.prompts).toHaveLength(2);
    expect(LIFE_PLAN_PROMPTS).toHaveLength(9);
    expect(new Set(LIFE_PLAN_PROMPTS.map((p) => p.id)).size).toBe(9);
    for (const p of LIFE_PLAN_PROMPTS) {
      expect(p.question.length).toBeGreaterThan(0);
      expect(p.hint.length).toBeGreaterThan(0);
    }
  });

  it('asks no question about money', () => {
    const words = LIFE_PLAN_PROMPTS.map((p) => `${p.question} ${p.hint}`).join(' ').toLowerCase()
      + LIFE_PLAN_SECTIONS.map((s) => `${s.title} ${s.blurb}`).join(' ').toLowerCase();
    for (const term of ['$', 'cost', 'budget', 'spend', 'afford', 'expense', 'price']) {
      expect(words, `prompt copy mentions "${term}"`).not.toContain(term);
    }
  });
});

describe('answers', () => {
  const today = '2027-03-01';

  it('saves an answer, and rewriting the same day overwrites rather than making a revision', () => {
    let s = setLifePlanAnswer({}, 'ordinaryTuesday', '  Gym, then the workshop.  ', today);
    expect(s.ordinaryTuesday).toEqual({ text: 'Gym, then the workshop.', updatedAt: today, history: [] });
    s = setLifePlanAnswer(s, 'ordinaryTuesday', 'Gym, then the workshop. Lunch with Dave.', today);
    expect(s.ordinaryTuesday.text).toBe('Gym, then the workshop. Lunch with Dave.');
    expect(s.ordinaryTuesday.history).toEqual([]);
  });

  it('keeps the earlier answer when it is rewritten on a later day', () => {
    let s = setLifePlanAnswer({}, 'whatDoYouDo', 'No idea yet.', '2027-03-01');
    s = setLifePlanAnswer(s, 'whatDoYouDo', 'I teach woodworking on Thursdays.', '2029-06-14');
    expect(s.whatDoYouDo.text).toBe('I teach woodworking on Thursdays.');
    expect(s.whatDoYouDo.updatedAt).toBe('2029-06-14');
    expect(s.whatDoYouDo.history).toEqual([{ text: 'No idea yet.', date: '2027-03-01' }]);
  });

  it('clearing a never-revised answer removes it; clearing one with history keeps the history', () => {
    let s = setLifePlanAnswer({}, 'learnOrMake', 'Spanish.', today);
    expect(setLifePlanAnswer(s, 'learnOrMake', '', today).learnOrMake).toBeUndefined();
    s = setLifePlanAnswer(s, 'learnOrMake', 'Spanish, then Italian.', '2028-01-02');
    s = setLifePlanAnswer(s, 'learnOrMake', '', '2029-01-02');
    expect(s.learnOrMake.text).toBe('');
    expect(s.learnOrMake.history.map((h) => h.text)).toEqual(['Spanish, then Italian.', 'Spanish.']);
  });

  it('ignores unknown prompt ids and no-op edits', () => {
    expect(setLifePlanAnswer({}, 'notAPrompt', 'hello', today)).toEqual({});
    const s = setLifePlanAnswer({}, 'byTheEnd', 'Finish the boat.', today);
    expect(setLifePlanAnswer(s, 'byTheEnd', 'Finish the boat.', today)).toBe(s);
  });

  it('counts only prompts with real text', () => {
    let s = setLifePlanAnswer({}, 'byTheEnd', 'Finish the boat.', today);
    s = setLifePlanAnswer(s, 'whoYouSee', '   ', today);
    expect(answeredCount(s)).toBe(1);
    expect(answeredCount({})).toBe(0);
    expect(answeredCount(null)).toBe(0);
  });
});

describe('storage', () => {
  it('round-trips through localStorage and survives junk', () => {
    const st = store();
    const s = setLifePlanAnswer({}, 'weekAnchors', 'Tuesday shift at the food bank.', '2027-03-01');
    expect(writeLifePlan(s, st)).toBe(true);
    expect(readLifePlan(st)).toEqual(s);
    expect(st._map.get(LIFE_PLAN_STORAGE_KEY)).toContain('food bank');

    for (const junk of ['', 'not json', '[]', 'null', '{"ordinaryTuesday":"a string"}']) {
      st.setItem(LIFE_PLAN_STORAGE_KEY, junk);
      expect(readLifePlan(st)).toEqual({});
    }
  });

  it('drops answers for prompts this build no longer has', () => {
    const st = store();
    st.setItem(LIFE_PLAN_STORAGE_KEY, JSON.stringify({
      byTheEnd: { text: 'Kept.', updatedAt: '2027-01-01', history: [] },
      retiredPromptFromAnOlderBuild: { text: 'Dropped.', updatedAt: '2027-01-01', history: [] },
    }));
    expect(Object.keys(readLifePlan(st))).toEqual(['byTheEnd']);
  });

  it('never throws when storage is unavailable', () => {
    const boom = { getItem: () => { throw new Error('nope'); }, setItem: () => { throw new Error('nope'); } };
    expect(readLifePlan(boom)).toEqual({});
    expect(writeLifePlan({}, boom)).toBe(false);
    expect(readLifePlan(undefined)).toEqual({});
  });
});
