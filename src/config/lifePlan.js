// "What will you actually do?" -- the non-financial half of a retirement
// plan.
//
// Work hands you four things without ever asking: a shape for the week, an
// answer to "what do you do", a set of people you see by default, and
// something that needs doing. Retirement removes all four on the same
// Friday. Most people have an answer ready for the trips -- three weeks a
// year -- and have never been asked about the other three hundred and
// forty days.
//
// This is a thought exercise, not a model. Deliberately:
//   * No score, no completion meter, no "3 of 8 answered". A page that
//     grades you on whether you have figured out your life is worse than
//     no page at all.
//   * No dollars. Attaching a cost box to every answer makes people edit
//     the answer to fit the box, and the honest first answer -- "I don't
//     know yet" -- stops being available. What the plan already models
//     (spending phases, part-time income, one-off milestones) is reachable
//     from here later if the user wants; nothing here feeds it.
//   * Nothing is required, nothing is validated, nothing nags. An empty
//     page says it is empty and stops talking.
//
// State lives in its own localStorage key, NOT in `inputs` -- same
// reasoning as the estate checklist: switching from "retire at 62" to
// "retire at 67" must not rewrite what you want your life to be. It IS in
// Backup Everything, because losing it would be losing real thinking.

import { safeSetItem } from '../utils/safeStorage';

export const LIFE_PLAN_STORAGE_KEY = 'cfe_life_plan_v1';

// Four groups, two prompts each, in plain language. The pillar each group
// comes from is named quietly in `pillar` for anyone who recognizes the
// framing; the UI leads with the question, not the taxonomy.
export const LIFE_PLAN_SECTIONS = [
  {
    id: 'week',
    pillar: 'Structure',
    title: 'Your week',
    blurb: 'Work decides what a Tuesday looks like. After it stops, something else has to.',
    prompts: [
      {
        id: 'ordinaryTuesday',
        question: 'What does an ordinary Tuesday look like?',
        hint: 'Not a holiday and not a trip — a normal weekday in your first year. Morning, afternoon, evening.',
      },
      {
        id: 'weekAnchors',
        question: 'What will put a shape on the week?',
        hint: 'Standing plans, a class, a gym, a volunteer shift, a part-time job, a regular lunch — or nothing fixed at all, which is also an answer.',
      },
    ],
  },
  {
    id: 'identity',
    pillar: 'Identity',
    title: 'What work gave you',
    blurb: 'Besides the money, a job hands you a role and a way to answer a question at parties.',
    prompts: [
      {
        id: 'missFromWork',
        question: 'Besides the money, what did work give you that you will miss?',
        hint: 'Being good at something. Being needed. Somewhere to be. Being the person people asked.',
      },
      {
        id: 'whatDoYouDo',
        question: 'When someone asks what you do, what would you like to say?',
        hint: 'Some people have an answer ready for this on day one. Most people take a couple of years to find one.',
      },
    ],
  },
  {
    id: 'people',
    pillar: 'Community',
    title: 'People',
    blurb: 'An office supplies company whether you arrange it or not. Nothing replaces it by accident.',
    prompts: [
      {
        id: 'whoYouSee',
        question: 'Who do you see in a normal week, if you are not going in to work?',
        hint: 'Family, neighbors, friends, a group, a team, strangers at the same coffee shop.',
      },
      {
        id: 'whoYouArrange',
        question: 'Which of those happen on their own, and which will you have to make happen?',
        hint: 'The ones that need arranging are the ones that quietly disappear.',
      },
    ],
  },
  {
    id: 'purpose',
    pillar: 'Purpose',
    title: 'What you are for',
    blurb: 'Something that needs doing, and would not get done without you.',
    prompts: [
      {
        id: 'learnOrMake',
        question: 'Is there something you have been meaning to learn, make, or get good at?',
        hint: 'A hobby you keep putting off. An instrument. A language. A workshop. A garden.',
      },
      {
        id: 'byTheEnd',
        question: 'Is there anything you would want to have done by the end of all this?',
        hint: 'For someone else, for somewhere, or for yourself.',
      },
    ],
  },
];

export const FREEFORM_PROMPT = {
  id: 'anythingElse',
  question: 'Anything else',
  hint: 'Whatever this page did not ask about.',
};

export const LIFE_PLAN_PROMPTS = [
  ...LIFE_PLAN_SECTIONS.flatMap((s) => s.prompts.map((p) => ({ ...p, sectionId: s.id }))),
  { ...FREEFORM_PROMPT, sectionId: 'freeform' },
];

const PROMPT_IDS = new Set(LIFE_PLAN_PROMPTS.map((p) => p.id));

// { [promptId]: { text, updatedAt, history: [{ text, date }] } }
export function readLifePlan(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(LIFE_PLAN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Drop anything that isn't a prompt this build knows about, so a
    // renamed prompt can't leave orphaned text sitting in storage forever.
    const clean = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (!PROMPT_IDS.has(id) || !entry || typeof entry !== 'object') continue;
      clean[id] = {
        text: typeof entry.text === 'string' ? entry.text : '',
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : null,
        history: Array.isArray(entry.history)
          ? entry.history.filter((h) => h && typeof h.text === 'string').map((h) => ({ text: h.text, date: typeof h.date === 'string' ? h.date : null }))
          : [],
      };
    }
    return clean;
  } catch {
    return {};
  }
}

// Through safeSetItem: a failed save raises the storage banner, and a Life
// Plan another tab has since changed is not overwritten.
export function writeLifePlan(state, storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    return safeSetItem(LIFE_PLAN_STORAGE_KEY, JSON.stringify(state), storage);
  } catch {
    return false;
  }
}

// Saves one answer. Rewriting on the same day overwrites in place -- a
// morning's edits are one thought, not five revisions. Rewriting on a
// later day pushes the previous answer into history, because the useful
// thing about this page is looking back in 2029 at what you wrote in 2027
// and noticing it didn't happen. An answer cleared to blank is kept as a
// revision too, rather than silently erasing what was there.
export function setLifePlanAnswer(state, promptId, text, today) {
  if (!PROMPT_IDS.has(promptId)) return state;
  const trimmed = String(text ?? '').trim();
  const prev = state[promptId] || { text: '', updatedAt: null, history: [] };
  if (trimmed === prev.text) return state;

  const isNewDay = Boolean(prev.text) && prev.updatedAt !== today;
  const history = isNewDay
    ? [{ text: prev.text, date: prev.updatedAt }, ...(prev.history || [])].slice(0, 20)
    : (prev.history || []);

  const next = { ...state };
  if (!trimmed && history.length === 0) {
    delete next[promptId];
    return next;
  }
  next[promptId] = { text: trimmed, updatedAt: trimmed ? today : prev.updatedAt, history };
  return next;
}

// How many prompts have something in them. Used ONLY to decide whether the
// page is empty (and to label the print sheet) -- never rendered as a
// score or a fraction. See this file's header.
export function answeredCount(state) {
  return LIFE_PLAN_PROMPTS.filter((p) => (state?.[p.id]?.text || '').trim()).length;
}
