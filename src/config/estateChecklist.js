// The estate paperwork checklist, as data.
//
// This list existed as prose in the Help guide first. It is a config file
// now because two surfaces render it -- the interactive tracker on Tax &
// Estate, and the print view -- and a hand-maintained second copy of
// twenty-odd items would drift within a release or two. Same discipline as
// disclaimer.js and premiumOffering.js.
//
// SCOPE, deliberately: everything here is something you decide or verify in
// advance, plus one section on what your executor will face. None of it is
// advice about WHAT to choose -- no "you should have a trust", no dollar
// thresholds at which one becomes worthwhile. The items are prompts to go
// look at something and confirm it says what you think it says, which is a
// different act from being told what to do, and it is the failure mode that
// actually costs families money: a beneficiary form naming an ex-spouse
// beats a will every single time, and nobody finds out until it is too late
// to fix.

import { safeSetItem } from '../utils/safeStorage';

export const CHECKLIST_STORAGE_KEY = 'cfe_estate_checklist_v1';

export const CHECKLIST_CATEGORIES = [
  {
    id: 'beneficiaries',
    title: 'Beneficiary designations',
    blurb: 'These override your will. If only one section gets done, make it this one.',
    items: [
      {
        id: 'ben-primary',
        title: 'Every retirement account has a primary beneficiary, and it is still the right person',
        detail: 'A 401(k), IRA, or annuity passes by its beneficiary form, not by your will. An ex-spouse named on a form from two jobs ago inherits the account, and no will can undo it.',
      },
      {
        id: 'ben-contingent',
        title: 'Every account has a contingent beneficiary',
        detail: 'If the primary dies first or at the same time and there is no contingent, the account falls back to the estate — which usually means probate, and can mean losing the stretch options a named person would have had.',
      },
      {
        id: 'ben-percentages',
        title: 'Percentages add to 100, and names match official ID',
        detail: 'Nicknames, maiden names, and misspellings cause real delays at the custodian. So do splits that add to 90% or 110%.',
      },
      {
        id: 'ben-reviewed',
        title: 'You have actually opened the forms and looked, recently',
        detail: 'Not "I remember setting it up." Marriage, divorce, birth, death, and job changes all invalidate assumptions. This is the item people are most confident about and most often wrong about.',
      },
      {
        id: 'ben-tod',
        title: 'Bank and brokerage accounts have TOD/POD designations where you want them',
        detail: 'Transfer-on-death and payable-on-death registrations move a taxable account outside probate the same way a beneficiary form does for an IRA.',
      },
      {
        id: 'ben-real-estate',
        title: 'You know how your home is titled, and therefore whether it goes through probate',
        detail: 'A will does not avoid probate; it tells the court what to do during it. What decides is the title. Joint tenancy with right of survivorship, a transfer-on-death deed (offered in many states, not all), or a deed into a funded revocable trust each pass the home directly. A home titled in one spouse\'s name alone can still go to court even for a married couple. Vehicles and bank accounts without a TOD/POD follow the same rule.',
      },
    ],
  },
  {
    id: 'documents',
    title: 'The four documents',
    blurb: 'Whether each exists, when it was last reviewed, and — the part people forget — where it physically is.',
    items: [
      {
        id: 'doc-will',
        title: 'A will',
        detail: 'Covers anything without a beneficiary designation, and names a guardian for minor children — which nothing else does.',
      },
      {
        id: 'doc-trust',
        title: 'A revocable living trust, if you have decided you need one',
        detail: 'Its usual jobs are avoiding probate and controlling the timing of distributions. Whether that is worth it depends on your state and your situation; an estate attorney answers this, not a checklist.',
      },
      {
        id: 'doc-trust-funded',
        title: 'If you have a trust, it is actually funded',
        detail: 'An unfunded trust is an empty box. Accounts and property have to be retitled into it. This is the single most common trust failure.',
      },
      {
        id: 'doc-poa',
        title: 'A durable power of attorney',
        detail: 'Lets someone manage money if you are alive but incapacitated. Without it the alternative is a court-appointed conservatorship.',
      },
      {
        id: 'doc-healthcare',
        title: 'A healthcare directive / medical power of attorney',
        detail: 'Names who decides medical questions, and records what you want. Separate from the financial power of attorney, and needed at exactly the moment nobody is thinking clearly.',
      },
      {
        id: 'doc-location',
        title: 'Someone who is not you knows where all of these are',
        detail: 'A perfect set of documents in a safe deposit box nobody can open, or a password manager nobody can unlock, is the same as no documents. Name the person and tell them.',
      },
    ],
  },
  {
    id: 'gifting',
    title: 'Lifetime gifting',
    blurb: 'The mechanics people most often get backwards.',
    items: [
      {
        id: 'gift-exclusion',
        title: 'You know the annual exclusion is per recipient, per giver',
        detail: 'A married couple with three children can move six exclusions a year without touching the lifetime exemption at all. Most people assume it is one number per year in total.',
      },
      {
        id: 'gift-over',
        title: 'You know that going over does not create a tax bill',
        detail: 'It files a return and draws down your lifetime exemption. Actual gift tax is owed only after that exemption is exhausted, which for most people never happens.',
      },
      {
        id: 'gift-tracking',
        title: 'You are tracking the drawdown, if it applies to you',
        detail: 'Every dollar of exemption used while alive is a dollar not available at death. Model it under Plan → Life Events → Lifetime Gifting.',
      },
    ],
  },
  {
    id: 'noncitizen',
    title: 'If your spouse is not a US citizen',
    blurb: 'Several of the rules above change, and the differences are large.',
    items: [
      {
        id: 'nc-marital',
        title: 'You know there is no unlimited marital deduction',
        detail: 'Transfers to a non-citizen spouse do not get the unlimited deduction a citizen spouse gets. The usual workaround at death is a QDOT.',
      },
      {
        id: 'nc-domicile',
        title: 'You know domicile, not residency, is the test',
        detail: 'Someone can live in the US for decades and remain non-domiciled. For a non-domiciled spouse the numbers are dramatically different from the ones this app models.',
      },
      {
        id: 'nc-treaty',
        title: 'You have checked whether a tax treaty applies',
        detail: 'Estate and gift tax treaties exist with a number of countries and can change the answer substantially.',
      },
    ],
  },
  {
    id: 'executor',
    title: 'What your executor will face',
    blurb: 'Not decisions you make in advance — logistics that go badly when nobody warned them.',
    items: [
      {
        id: 'exec-certificates',
        title: 'Whoever settles your estate knows to order plenty of certified death certificates',
        detail: 'Almost every institution — each bank, each brokerage, each insurer, the DMV, the pension, Social Security — wants its own certified copy, and most keep it. Executors commonly order ten to fifteen. Ordering more later costs more and takes weeks at the worst possible time. Your executor or estate attorney will know the right number for your state and the number of accounts involved.',
      },
      {
        id: 'exec-inventory',
        title: 'A list of accounts and institutions exists somewhere findable',
        detail: 'Not passwords — just which firms hold what. Reconstructing this from paper mail takes months, and small accounts get missed entirely.',
      },
      {
        id: 'exec-logins',
        title: 'Someone can actually get into the accounts, not just legally act on them',
        detail: 'A power of attorney gives legal authority; it does not give login credentials, and if nobody has both, nothing moves. The usual blockers: my Social Security (the SSA does not recognize a POA at all — a representative payee has to be designated separately), Medicare.gov, bank and brokerage logins, insurance portals (a claim needs the policy number and the login), the pension or annuity provider (survivor elections have deadlines that can be permanent), utilities and subscriptions, and the tax preparer\'s contact details. A password manager with an emergency-access contact solves most of it.',
      },
      {
        id: 'exec-letter',
        title: 'A letter of instruction exists: the informal notes a will never carries',
        detail: 'Not a legal document — a plain letter for the executor and family covering where the originals are, which advisor and preparer to call, funeral wishes, what to do with the house and its contents, digital accounts and devices, pets, and anything that would otherwise be reconstructed from guesswork. It is the single most useful thing an executor can be handed and the one most estates skip.',
      },
      {
        id: 'exec-named',
        title: 'The person named as executor knows they are named, and has agreed',
        detail: 'Finding out at the funeral is a poor introduction to a job that runs a year or more.',
      },
    ],
  },
];

export const ALL_CHECKLIST_ITEMS = CHECKLIST_CATEGORIES.flatMap(c =>
  c.items.map(i => ({ ...i, categoryId: c.id, categoryTitle: c.title })),
);

export const CHECKLIST_ITEM_COUNT = ALL_CHECKLIST_ITEMS.length;

// Stored shape: { [itemId]: { done: boolean, completedAt: 'YYYY-MM-DD' } }.
// Tolerant of unknown ids so a saved state from a future version, or one
// whose item was renamed, degrades to "unchecked" rather than throwing.
export function readChecklistState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(CHECKLIST_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch {
    return {};
  }
}

export function writeChecklistState(state, storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    // safeSetItem: a failed save raises the storage banner, and a
    // checklist another tab has since changed is not overwritten.
    return safeSetItem(CHECKLIST_STORAGE_KEY, JSON.stringify(state), storage);
  } catch {
    return false;
  }
}

// Toggling on stamps the date; toggling off clears the whole entry rather
// than leaving a stale completedAt behind for the next tick to resurrect.
export function toggleChecklistItem(state, itemId, today) {
  const next = { ...state };
  if (next[itemId]?.done) {
    delete next[itemId];
  } else {
    next[itemId] = { done: true, completedAt: today };
  }
  return next;
}

export function checklistProgress(state) {
  const done = ALL_CHECKLIST_ITEMS.filter(i => state[i.id]?.done).length;
  return { done, total: CHECKLIST_ITEM_COUNT, pct: CHECKLIST_ITEM_COUNT ? (done / CHECKLIST_ITEM_COUNT) * 100 : 0 };
}
