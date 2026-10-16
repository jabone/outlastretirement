// The sidebar (changelog 287). Six entries always show -- the ones a
// person opens on every visit -- and the rest sit behind "Explore more",
// which remembers whether it was left open (per browser) and opens itself
// whenever the current tab is one of the entries inside it, so nothing is
// ever unreachable. Order here is display order. `matches` lists every
// tab id the entry marks as current; `tab` is what a click opens (Plan
// resolves at click time to whichever view was used last, see Sidebar).
import { PREMIUM_NAME, PREMIUM_AREAS } from './premiumOffering';

export const NAV_MORE_OPEN_KEY = 'retire_plan_nav_more_open';

// "Detailed Holdings, Retirement Spending, Readiness in Full and Relocation &
// Residency" -- read from the area list, so a new area joins the tooltip on
// its own.
const AREA_LIST = (() => {
  const names = PREMIUM_AREAS.map((a) => a.name);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
})();

export const NAV_PRIMARY = [
  { id: 'dashboard', label: 'Dashboard', icon: 'TrendingUp', matches: ['dashboard'],
    tip: 'Dashboard: where you are, where it is going, what is in the way, and what to do' },
  { id: 'plan', label: 'Plan', icon: 'Settings', matches: ['settings', 'interview'],
    tip: 'Plan: your ages, income, balances, savings, spending and assumptions — guided one step at a time, or everything at once' },
  { id: 'readiness', label: 'Retirement Readiness', icon: 'Gauge', matches: ['readiness'],
    tip: 'Retirement Readiness: the questions a retiree actually asks, answered from your own plan' },
  { id: 'yearledger', label: 'Year by Year', icon: 'FileText', matches: ['yearledger', 'ledger'],
    tip: 'Year by Year: the numbers behind every chart — balances and draws, where the money goes, and each year as a cash flow' },
  // Detailed Holdings for Premium; the Premium explainer in the same slot
  // for everyone else, so the nav keeps its shape across the upgrade. A
  // button is named for where it lands (premiumOffering.js): the paid entry
  // opens the holdings tab, the locked one the Premium page, which covers
  // every area -- so it says Premium, not Detailed Holdings (changelog 366).
  { id: 'portfolio', label: 'Detailed Holdings', icon: 'PieChart', matches: ['portfolio'], premium: true,
    tip: 'Detailed Holdings (Premium): track individual accounts and holdings, then link the totals to your Initial Balances so they stay in sync automatically' },
  { id: 'premium', label: PREMIUM_NAME, icon: 'Sparkles', matches: ['premium'], premiumLocked: true,
    tip: `${PREMIUM_NAME}: ${AREA_LIST}. See what each does and how to unlock it` },
  { id: 'guide', label: 'Help', icon: 'HelpCircle', matches: ['guide', 'reference'],
    tip: 'Help: a walkthrough of every feature, a searchable dictionary of every input, and what changed recently' },
];

export const NAV_MORE = [
  { id: 'strategy', label: 'Optimizers', icon: 'Trophy', matches: ['strategy'],
    tip: 'Optimizers: the tax strategy matrix, the Social Security claiming heatmap and the Roth conversion ladder \u2014 every combination tried and ranked' },
  { id: 'risk', label: 'Risk & Stress', icon: 'ShieldAlert', matches: ['risk'],
    tip: 'Risk & Stress: stress-test your plan against past market crashes and run probability simulations' },
  { id: 'taxestate', label: 'Tax & Estate', icon: 'BarChart2', matches: ['taxestate'],
    tip: 'Tax & Estate: see your tax brackets, Medicare surcharges, and what your heirs would owe' },
  { id: 'scenarios', label: 'Scenarios', icon: 'Copy', matches: ['scenarios'],
    tip: 'Scenarios: save alternate versions of your plan and compare them side by side' },
  { id: 'lifeplan', label: 'What Will You Do?', icon: 'Compass', matches: ['lifeplan'],
    tip: 'What Will You Do?: the non-financial half of a retirement plan — structure, identity, people and purpose. No numbers, nothing required' },
  { id: 'preferences', label: 'Preferences', icon: 'SlidersHorizontal', matches: ['preferences'],
    tip: 'Preferences: theme, text size, how figures are shown, your Live Pricing connection, Premium Access, and backup/restore — everything that is not part of your plan' },
];

export const NAV_MORE_TABS = new Set(NAV_MORE.flatMap((e) => e.matches));

export function readNavMoreOpen() {
  try { return localStorage.getItem(NAV_MORE_OPEN_KEY) === 'true'; } catch { return false; }
}
export function writeNavMoreOpen(open) {
  try { localStorage.setItem(NAV_MORE_OPEN_KEY, String(!!open)); } catch { /* per-browser convenience only */ }
}
