// One Plan destination, two modes (IA Phase 3 step 3, changelog 252).
//
// The sidebar shows a single "Plan" entry. Behind it are the two tabs that
// have always existed -- 'interview' (Guided: one step at a time, rarely
// needed fields folded) and 'settings' (Advanced: everything at once) --
// which since step 2 render the very same section components. Tab ids,
// hash routes and every setActiveTab('settings') deep link are unchanged;
// this module only remembers which mode the person used last and maps a
// section across the switch so changing mode keeps your place.
export const PLAN_MODE_KEY = 'retire_plan_plan_mode';
export const PLAN_MODES = ['guided', 'advanced'];

export const tabForMode = (mode) => (mode === 'guided' ? 'interview' : 'settings');
export const modeForTab = (tab) => (tab === 'interview' ? 'guided' : tab === 'settings' ? 'advanced' : null);

export function readPlanMode() {
  try {
    const v = localStorage.getItem(PLAN_MODE_KEY);
    return PLAN_MODES.includes(v) ? v : 'advanced';
  } catch { return 'advanced'; }
}

export function writePlanMode(mode) {
  if (!PLAN_MODES.includes(mode)) return;
  try { localStorage.setItem(PLAN_MODE_KEY, mode); } catch { /* storage unavailable: mode just isn't remembered */ }
}

// Interview step -> Plan Settings sub-tab holding the same sections.
export const INTERVIEW_TO_SETTINGS = {
  household: 'household',
  income: 'income',
  pensions: 'income',
  balances: 'balances',
  savings: 'savings',
  spending: 'spending',
  healthcare: 'spending',
  withdrawal: 'spending',
  roth: 'taxes',
  equity: 'income',
  milestones: 'milestones',
  debt: 'balances',
  estate: 'taxes',
  risk: 'assumptions',
  review: 'household',
};

// Plan Settings sub-tab -> the Interview step to land on. Where a sub-tab
// spans several steps, the first of them.
export const SETTINGS_TO_INTERVIEW = {
  household: 'household',
  income: 'income',
  savings: 'savings',
  balances: 'balances',
  spending: 'spending',
  taxes: 'roth',
  assumptions: 'risk',
  milestones: 'milestones',
  planyear: 'household',
};

export const settingsSubTabFor = (step) => INTERVIEW_TO_SETTINGS[step] || 'household';
export const interviewStepFor = (subTab) => SETTINGS_TO_INTERVIEW[subTab] || 'household';

// The Interview keeps its own position in localStorage (PROGRESS_KEY in
// InterviewTab.jsx). Switching Advanced -> Guided writes the target step
// there before navigating, so the Interview mounts on it.
export const INTERVIEW_PROGRESS_KEY = 'retire_plan_interview_progress';
export function setInterviewStep(step) {
  try {
    const saved = JSON.parse(localStorage.getItem(INTERVIEW_PROGRESS_KEY) || '{}');
    localStorage.setItem(INTERVIEW_PROGRESS_KEY, JSON.stringify({ ...saved, current: step }));
  } catch { /* ignore */ }
}
