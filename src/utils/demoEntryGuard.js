// /app?demo=1 on a browser that already holds the user's own plan (S15).
//
// The landing page's "Try the Demo Plan" links go to /app?demo=1, and a
// returning user who clicks one used to be switched straight into demo
// mode. Nothing was lost -- demo mode snapshots the plan and Exit Demo
// puts it back -- but their own plan vanished from the screen with no
// warning. Now they are asked first, whenever there is a plan of their own
// to be surprised about.
import { DEFAULT_INPUTS, migrateInputs } from '../calculator';

function readJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// True when this browser holds anything the user made: a plan that differs
// from the defaults, a saved scenario, a holding or a Life Plan answer.
// A first-time visitor (nothing stored) and someone who opened the app but
// changed nothing (the defaults, as saved on first load) both get false.
export function hasOwnPlanData(storage = globalThis.localStorage) {
  if (!storage) return false;
  const scenarios = readJson(storage, 'retire_plan_scenarios');
  const list = Array.isArray(scenarios) ? scenarios : scenarios?.scenarios;
  if (Array.isArray(list) && list.length > 0) return true;
  const holdings = readJson(storage, 'cfe_premium_holdings_v1');
  if (Array.isArray(holdings) && holdings.length > 0) return true;
  const lifePlan = readJson(storage, 'cfe_life_plan_v1');
  if (lifePlan && typeof lifePlan === 'object' && Object.keys(lifePlan).length > 0) return true;
  const stored = readJson(storage, 'retire_plan_inputs');
  if (!stored || typeof stored !== 'object') return false;
  let inputs;
  try { inputs = migrateInputs(stored); } catch { return true; }
  return Object.keys(inputs).some((k) => JSON.stringify(inputs[k]) !== JSON.stringify(DEFAULT_INPUTS[k]));
}

export const DEMO_OVER_OWN_PLAN_QUESTION = 'Open the demo? Your own plan is kept and comes back when you exit the demo.';

// Hand-built DOM, like main.jsx's demo splash: nothing is mounted yet.
// Resolves true (open the demo) or false (keep my plan on screen).
export function askBeforeDemo(host = document.getElementById('root')) {
  return new Promise((resolve) => {
    if (!host) { resolve(true); return; }
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'demo-guard-title');
    wrap.style.cssText = 'min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:2rem;text-align:center;font-family:system-ui,sans-serif;';
    const title = document.createElement('p');
    title.id = 'demo-guard-title';
    title.textContent = DEMO_OVER_OWN_PLAN_QUESTION;
    title.style.cssText = 'margin:0;font-size:1.125rem;font-weight:600;max-width:32rem;line-height:1.4;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:.75rem;flex-wrap:wrap;justify-content:center;';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn-primary';
    yes.textContent = 'Open the Demo';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn-outline';
    no.textContent = 'Stay on My Plan';
    const done = (answer) => { host.innerHTML = ''; resolve(answer); };
    yes.addEventListener('click', () => done(true));
    no.addEventListener('click', () => done(false));
    row.append(yes, no);
    wrap.append(title, row);
    host.appendChild(wrap);
    yes.focus();
  });
}
