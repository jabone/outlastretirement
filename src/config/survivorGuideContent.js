// The words of the Survivor's Guide (What's New 492) that do not come from
// the plan's numbers: the first steps after a death, the blanks for where
// things are, the yearly routine and the glossary. Written for someone who
// may never have handled the household's money, so each item says who to
// call and why in plain language, and only the items that fit this plan
// are printed. Educational, not legal or tax advice: the steps say where a
// professional or the firm decides. Reviewed by a panel (CPA, widow and
// survivor-benefits advisor, CFP, educator, DIY planner, novice) before
// release; the facts they checked are noted beside the items.

const money = (n) => `$${Math.round(n || 0).toLocaleString('en-US')}`;

// The first steps, grouped by when they are due. g: a buildSurvivorGuide
// result (status 'ok'). Each group { id, title, items: [{ id, title,
// detail }] }.
export function firstSteps(g) {
  const { deceased: d } = g.names;
  const f = g.flags;
  const week = [];
  const twoMonths = [];
  const year = [];

  week.push({
    id: 'go-slow',
    title: 'Wait before big decisions',
    detail: 'Nothing in this plan needs to change in the first months beyond these steps. People who work with widows and widowers often suggest waiting about a year before selling the house, moving, or lending or giving away large sums. Scammers watch obituaries: be wary of calls or visits offering investments or help with the estate.',
  });
  week.push({
    id: 'certificates',
    title: 'Order certified copies of the death certificate',
    detail: 'The funeral home can order them. Banks, insurers, Social Security and any pension each want one; ten is a common number to order.',
  });

  // Social Security: the $255 payment goes to a spouse living in the same
  // household (or one getting benefits on the record), applied for within
  // two years; survivor benefits are claimed by phone or in person, not
  // online; no benefit is paid for the month of death.
  let ss = 'Report the death (the funeral home often does this; call to be sure). Ask about the survivor benefit and the one-time $255 death payment, which goes to a spouse who lived in the same home and must be applied for within two years. Survivor benefits cannot be applied for online: call or make an appointment.';
  if (f.deceasedClaimedSS) ss += ' The payment that arrives in the month after the death pays for the month of death and must be returned; if it was deposited, the bank sends it back, so do not spend it.';
  if (g.ssStart?.bestAge) {
    ss += g.ssStart.bestAge === g.ssStart.planAge
      ? ` This plan starts your survivor benefit at ${g.ssStart.planAge}, about ${money(g.ssStart.planCheck)} a year, which in this plan leaves the most${g.ssStart.switchPlan ? ' of the single start ages' : ''}.`
      : ` This plan starts your survivor benefit at ${g.ssStart.planAge} (about ${money(g.ssStart.planCheck)} a year); starting it at ${g.ssStart.bestAge} pays a larger check for life (about ${money(g.ssStart.bestCheck)} a year) and in this plan leaves more at the end${g.ssStart.switchPlan ? ' than any other single start age' : ''}. It can start as early as 60, at a smaller amount.`;
  } else if (g.ssStart?.pastFra) {
    ss += ' You are past full retirement age, so the survivor benefit is not reduced whenever it starts; there is no reason to wait for it.';
  } else if (g.ssStart?.ownLarger) {
    ss += ` Your own benefit is larger than the survivor benefit, so you keep your own; ask whether ${d}'s record pays anything more.`;
  }
  const sw = g.ssStart?.switchPlan;
  if (sw && sw.moreAtEnd > 1000) {
    ss += sw.id === 'ownFirst'
      ? ` In this plan, starting your own benefit at ${sw.ownAge} and switching to the survivor benefit at ${sw.survivorAge} leaves the most: about ${money(sw.moreAtEnd)} more at the end than the best single start age (today\u2019s dollars).`
      : ` In this plan, taking the survivor benefit from ${sw.survivorAge} and switching to your own at ${sw.ownAge} leaves the most: about ${money(sw.moreAtEnd)} more at the end than ${g.ssStart.pastFra ? 'the plan as it is' : 'the best single start age'} (today\u2019s dollars).`;
  }
  ss += ' Unlike a spouse’s benefit, a survivor can take one benefit now and switch to the other later (for example the survivor benefit early and your own at 70, or the reverse): ask Social Security to show both, and to limit the application to the one you are starting.';
  if (g.income.ownSwitch) ss += ` This plan switches you to your own benefit at ${g.income.ownSwitch.age}, in ${g.income.ownSwitch.year}, about ${money(g.income.ownSwitch.amount)} a year: apply for it then, because Social Security may not switch you on its own.`;
  if (f.workingBeforeFra) ss += ' While you work before full retirement age, Social Security holds back part of the check if your pay is above its yearly limit.';
  ss += ' Children under 18 (19 if still in high school) may get a benefit too. Ask for the actual amounts; they can differ from this plan.';
  week.push({ id: 'social-security', title: 'Call Social Security: 1-800-772-1213', detail: ss });

  week.push({
    id: 'bills',
    title: 'Keep the bills paid',
    detail: `Find which bills are paid automatically and from which account, and move any that come out of, or any income that goes into, an account in ${d}'s name alone. Keep a few months of spending in a plain savings account for now${f.cashReserve ? `; this plan keeps a cash reserve of about ${money(g.accounts.cash)} for just this` : ''}.`,
  });

  // COBRA: 36 months for a surviving spouse, 60 days to elect; the
  // marketplace special enrollment window is 60 days after losing
  // coverage; Part B special enrollment runs 8 months after job-based
  // coverage ends, and COBRA does not count as job coverage.
  twoMonths.push({
    id: 'health',
    title: 'Health coverage',
    detail: f.under65
      ? `If you were covered through ${d}'s job, you can usually keep that coverage under COBRA for up to 36 months, at the full cost; you have 60 days to choose it. Losing coverage also opens a 60-day window to sign up for a marketplace (ACA) plan, which may cost less.`
      : `${f.deceasedWorking ? `If you put off Medicare Part B because you were covered through ${d}'s job, sign up within 8 months of that coverage ending to avoid a lifelong penalty; COBRA does not count as job coverage for this. ` : ''}If you had a retiree health plan through ${d}'s former employer, call that plan to ask whether it continues for you.`,
  });

  if (f.lifeInsuranceInTrust) {
    twoMonths.push({
      id: 'life-insurance',
      title: 'Tell the trustee about the life insurance',
      detail: `${d}'s policy is owned by a trust, so the trustee claims it and the money is held under the trust's terms; this plan does not add it to your savings.`,
    });
  } else if (f.lifeInsurance) {
    twoMonths.push({
      id: 'life-insurance',
      title: 'Claim the life insurance',
      detail: `Call the insurer with the policy number and a death certificate. The payout is generally free of income tax (interest paid on it, if you take it in installments, is taxable). This plan expects the policy's ${money(g.income.lifeInsurance)} and counts it as savings, but nothing needs it invested at first: a savings or money-market account is fine while you decide. Be cautious with anyone who suggests putting it into an annuity or a new investment soon after.`,
    });
  }

  if (f.deceasedPension) {
    twoMonths.push({
      id: 'pension',
      title: `Call ${d}'s pension administrator`,
      detail: f.deceasedPensionStarted
        ? `The pension continues for you only if ${d} chose a joint-and-survivor option when it started. This plan assumes ${f.pensionSurvivorPct}% of it continues; ask for the survivor amount in writing.`
        : `${d}'s pension had not started. Most pensions pay a surviving spouse a pre-retirement survivor benefit (often a reduced monthly amount, sometimes a lump sum or a refund of contributions instead), usually based on ${d}'s service up to the death, so it may be less than this plan assumes: ${f.pensionSurvivorPct}% of it from ${f.deceasedPensionStartYear}, when ${d} would have been ${f.deceasedPensionStartAge}. Ask what you are owed, the earliest date it can start and your choices, in writing, and compare before choosing.`,
    });
  }

  const employerExtras = [];
  if (f.deceasedStockAwards) employerExtras.push('any stock awards not yet vested (many plans vest some or all at death, and some must be claimed within a set time)');
  if (f.deceasedDeferredComp) employerExtras.push(`the deferred-compensation plan (about ${money(g.accounts.deceasedDeferredComp)}), which pays out on its own schedule and is taxed as income`);
  twoMonths.push({
    id: 'employer',
    title: f.deceasedWorking ? `Call ${d}'s employer` : `Call ${d}'s former employer`,
    detail: f.deceasedWorking
      ? `Ask about final pay and unused vacation, any group life insurance, the retirement plan (401(k) or similar) and who it names as beneficiary, and health coverage for you${employerExtras.length ? `; also ${employerExtras.join(', and ')}` : ''}. If ${d} served in the military, ask the VA about survivor benefits.`
      : `Ask whether any retiree life insurance or other benefit is owed${employerExtras.length ? `, and about ${employerExtras.join(', and ')}` : ''}. If ${d} served in the military, ask the VA about survivor benefits.`,
  });

  // The household's own list of other survivor benefits (What's New 493).
  const claim = (g.benefits || []).filter((b) => b.applies);
  if (claim.length) {
    const lines = claim.map((b) => {
      const each = b.payPct > 0 ? (b.value > 0.5 ? `${b.payPct}% of pay (about ${money(b.value)})` : `${b.payPct}% of pay (no pay is entered for ${d} in this plan, so it counts as $0)`) : money(b.value);
      const what = b.kind === 'once' ? `${each} once` : `${each} a year for ${b.years} year${b.years === 1 ? '' : 's'}`;
      return `${b.name || 'A benefit'}: ${what}${b.contact ? `; contact ${b.contact}` : ''}${b.details ? `. ${b.details}` : ''}${b.counted ? '' : ' (not counted in this plan\u2019s figures)'}.`;
    });
    twoMonths.push({
      id: 'other-benefits',
      title: claim.length === 1 ? 'Claim the other survivor benefit' : 'Claim the other survivor benefits',
      detail: `Your plan lists ${claim.length === 1 ? 'a benefit' : 'these benefits'} that may pay you, beyond Social Security${f.lifeInsurance ? ' and the life insurance' : ''}; each must be claimed, usually with a death certificate. ${lines.join(' ')} Amounts are in today\u2019s dollars; ask each for the real figure and how it is taxed. Payments often begin within weeks; this plan counts them from next year.`,
    });
  }
  const notNow = (g.benefits || []).filter((b) => !b.applies);
  if (notNow.length) {
    twoMonths.push({
      id: 'benefits-ended',
      title: 'Benefits that depended on work',
      detail: `${notNow.map((b) => b.name || 'A benefit').join(', ')} paid only if ${d} died while still working; ask the employer whether anything is still owed.`,
    });
  }
  if (f.preTax || f.roth) {
    // A spouse beneficiary can treat an IRA as their own or keep it as an
    // inherited (beneficiary) IRA; inherited-IRA payouts are free of the 10%
    // early-withdrawal penalty; an inherited IRA cannot be converted to Roth.
    let acc = 'As the spouse named as beneficiary you can usually move each IRA, 401(k) or similar account into an IRA of your own, or keep it as an inherited IRA. You do not have to decide quickly: you can keep it inherited now and move it into your own name later.';
    if (f.under595) acc += ' At your age this choice matters: money taken from an inherited IRA before 59½ has no 10% early-withdrawal penalty, while money taken from your own IRA usually does.';
    acc += ' This plan treats the accounts as your own';
    if (f.conversions) acc += ', so its Roth conversions assume they are in your name (an inherited IRA cannot be converted)';
    if (f.earlyPreTax) acc += ', and its taxes include the 10% penalty on Pre-Tax money taken before 59½, which keeping an inherited IRA would avoid';
    acc += '. Ask before cashing an account out: the whole amount from a Pre-Tax account would be taxable income in one year. The beneficiary form decides who inherits these accounts, not the will.';
    twoMonths.push({ id: 'retirement-accounts', title: 'Call each retirement account’s firm', detail: acc });
  }
  if (f.hsa) {
    twoMonths.push({ id: 'hsa', title: 'The HSA', detail: 'An HSA left to a spouse simply becomes your own HSA: ask the firm to move it into your name.' });
  }
  if (f.deceasedAtRmdAge && f.preTax) {
    twoMonths.push({
      id: 'final-rmd',
      title: `${d}'s required withdrawal for this year`,
      detail: `If ${d} had not yet taken this year's required withdrawal (RMD), it still has to be taken, by you, normally by December 31. Ask the firm for the amount.`,
    });
  }

  if (f.taxable) {
    // Date-of-death basis: half of a joint (spousal) holding, all of a
    // community-property one.
    twoMonths.push({
      id: 'taxable',
      title: 'Retitle the bank and investment accounts',
      detail: `A joint account usually passes to you with a death certificate, and so does one that names you as payable-on-death (POD) or transfer-on-death (TOD); an account in ${d}'s name alone may be frozen until the estate is settled. Ask the firm to update the cost basis: investments ${d} owned take a new basis equal to their value on the date of death, so selling them soon after costs little or no capital-gains tax. On a jointly owned account usually half gets the new basis; in a community-property state (such as Texas or California), usually all of it. A tax preparer can confirm which applies.`,
    });
  }

  year.push({
    id: 'debts',
    title: 'Debts and credit',
    detail: `Tell each credit-card and loan company about the death and close accounts in ${d}'s name alone. You usually do not owe ${d}'s own debts from your own money unless you co-signed or the account is joint (community-property states differ); the executor pays them from the estate, so do not agree to pay a collector over the phone. Send a death certificate to Equifax, Experian and TransUnion and ask them to mark ${d}'s file "deceased", and check your own report free at annualcreditreport.com.`,
  });

  if (f.home) {
    // A surviving spouse who sells within two years of the death keeps the
    // $500,000 home-sale exclusion; the house takes a new basis like the
    // investments; a lender cannot call a loan because the home passed to a
    // spouse at death.
    year.push({
      id: 'home',
      title: 'The house',
      detail: `Update the deed or title, the homeowner’s insurance and any property-tax exemption (some states add one for a surviving spouse).${f.mortgage ? ' Keep paying the mortgage: federal law generally stops the lender from demanding the whole loan back because the house passed to you.' : ''} The house takes a new cost basis at the death, half of it, or all of it in a community-property state. If you sell within two years of the death you can usually still exclude up to $500,000 of gain from tax, as a couple could; after that, $250,000.`,
    });
  }

  year.push({
    id: 'taxes',
    title: 'Taxes this year and next',
    detail: `For the year of the death you can still file a joint return, unless you remarry that year; it is due the following April. After that you file as single, or for two more years as a qualifying surviving spouse if a dependent child lives with you. Single tax brackets are narrower, so the same income costs more tax; this plan figures every later year as single.${f.irmaaAge ? ' Medicare’s income surcharge (IRMAA) is based on income from two years back; if it comes in high after the death, Form SSA-44 asks Social Security to use your newer, lower income, since a spouse’s death counts as a life-changing event.' : ''}`,
  });
  year.push({
    id: 'estate',
    title: 'Settle the estate',
    detail: 'The executor named in the will, or the trustee of a trust, settles the estate. An estate attorney can say whether probate is needed in your state and what has to be filed, including whether an estate-tax return is worth filing to pass on the unused part of the estate-tax exemption to you, which can matter even when no tax is due.',
  });
  year.push({
    id: 'own-documents',
    title: 'Update your own will, beneficiaries and powers of attorney',
    detail: `${d} was probably named on them. Name someone new on each account’s beneficiary form too. Before working with an adviser, look them up at adviserinfo.sec.gov or brokercheck.finra.org, and ask in writing whether they are a fiduciary and how they are paid.`,
  });

  return [
    { id: 'week', title: 'In the first week or two', items: week },
    { id: 'two-months', title: 'In the first two months', items: twoMonths },
    { id: 'year', title: 'During the first year', items: year },
  ];
}

// Blanks to fill in by hand: the app never stores account numbers, firms or
// passwords, so this page is the place to write where things are.
export const WHERE_THINGS_ARE = Object.freeze([
  { id: 'will', label: 'Will, trust and other estate papers are kept at' },
  { id: 'insurance', label: 'Life insurance company and phone' },
  { id: 'banks', label: 'Each bank and investment firm, and its phone number', lines: 3 },
  { id: 'pension', label: 'Pension administrator and phone' },
  { id: 'employer', label: 'Employer benefits office and phone' },
  { id: 'social-security', label: 'Social Security', prefill: '1-800-772-1213, ssa.gov' },
  { id: 'tax', label: 'Tax preparer or CPA' },
  { id: 'attorney', label: 'Estate attorney' },
  { id: 'helper', label: 'Someone you trust to help with money, and to print this guide again each year' },
  { id: 'logins', label: 'How to get into email, phones and online accounts (for example, a password manager)' },
  { id: 'box', label: 'Safe-deposit box, keys and where the important papers are' },
]);

// The yearly routine, in the order the year runs.
export function yearlyRoutine(g) {
  const f = g.flags;
  const r = g.rule;
  const out = [];
  if (r.kind === 'risk' && Number.isFinite(r.cutBelow) && r.cutBelow > 0.5) {
    out.push(`Each January, add up your savings: your Pre-Tax, Roth, Taxable and HSA accounts (not the house or the cash reserve). If the total is below about ${money(r.cutBelow)}, cut everyday spending to about ${money(r.spendIfCut)}, as the spending rule says; otherwise keep to the table.`);
  } else {
    out.push('Each January, add up your savings: your Pre-Tax, Roth, Taxable and HSA accounts (not the house or the cash reserve), and compare the total with last year’s “Savings at year end” in the table.');
  }
  out.push(`Every figure here is in ${g.deathYear} dollars. Your statements will show more as prices rise: if you have not printed the guide again, raise the figures by inflation since ${g.deathYear} before comparing (about 2.5% a year, so about a quarter more after nine years).`);
  out.push('Through the year, take the year’s money in about the amounts the table shows, from the accounts it names. Taking from Pre-Tax is taxable income. From Roth, what was put in comes out tax-free at any age, and growth is tax-free once the account is five years old and you are 59½ (or it is still an inherited Roth). From money already taxed, only the gain is taxed.');
  out.push(`Firms often hold back some tax, but rarely the right amount: an IRA usually holds back 10% unless you say otherwise, a 401(k) paid to you 20%, and a bank or brokerage sale or Social Security nothing unless you ask. Tell each firm how much to withhold, or pay quarterly estimates, so April holds no surprise.${f.conversions && f.under595 ? ' Before 59½, pay a Roth conversion’s tax from savings, not by withholding from the conversion.' : ''}`);
  if (f.rmd) out.push(`From ${f.rmdAge ? `${f.rmdAge}` : 'your 70s'}, take the required withdrawal (RMD) the table shows by December 31. Missing one costs a penalty of 25% of what was missed (10% if made up within two years); the firm can work out the amount and pay it automatically.`);
  if (f.conversions) out.push(`The Roth conversions in the table are optional: the plan makes them to lower taxes later. Skipping one does no lasting harm; you can convert in a later year. Ask a tax preparer before making one${f.firstConversion ? `, and let the ${g.firstYear} one wait until you have` : ''}.`);
  if (f.medicareYear) out.push(`In the three months before you turn 65 (${f.medicareYear}), sign up for Medicare at ssa.gov. The table assumes you do, and signing up late adds a lifelong penalty.`);
  out.push('Each year, update the balances in the app and print this guide again, or ask the person you trust to: the figures change with markets, age and spending.');
  return out;
}

// How to open the plan in the app (What's New 493): the plan lives in one
// browser on one computer, and on any other only through the backup file.
export function openingTheApp({ lastBackupAt, appNotes, domain }) {
  const last = lastBackupAt ? new Date(lastBackupAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
  return {
    steps: [
      `On the computer and browser where the plan was made, go to ${domain}/app. The plan opens as it was left: it is saved in that browser, not online. If it opens empty or shows the sample plan (some browsers clear a site that has not been visited for a while), restore it from the backup file.`,
      'On any other computer or browser, the plan comes from the backup file. It is named like outlastretirement_full_backup_2026-11-04.json, or outlastretirement_encrypted_backup_2026-11-04.json if it was saved with a password (the date is when it was made), and may have been saved to Downloads or to a synced folder such as Google Drive, Dropbox, iCloud Drive or OneDrive. Open the app, choose Backup Everything / Restore Backup, then Restore Backup, and pick the file.',
      'An encrypted backup asks for the password it was made with. The app cannot recover a forgotten password, so it should be written down somewhere safe (not on this page).',
      'Once it opens: Dashboard shows whether the plan lasts; Year by Year shows each year; Tax & Estate \u2192 Survivor\u2019s Guide prints this guide again with today\u2019s figures.',
    ],
    last: last ? `The last backup was made on ${last}.` : 'No backup had been made when this was printed: make one with Backup Everything.',
    notes: appNotes || '',
  };
}

export const GLOSSARY = Object.freeze([
  { term: 'Pre-Tax', text: 'A traditional IRA, 401(k), 403(b) or similar. Nothing was taxed going in, so almost every dollar taken out is taxable income.' },
  { term: 'Roth', text: 'A Roth IRA or Roth 401(k). Taxed going in, so money taken out is usually tax-free.' },
  { term: 'Taxable', text: 'An ordinary bank or brokerage account. Only interest, dividends and the gain when something is sold are taxed.' },
  { term: 'HSA', text: 'A health savings account. Nothing is taxed going in, and it is tax-free when spent on medical costs; spent on anything else it is taxed (with a penalty before 65).' },
  { term: 'Cash reserve', text: 'Money kept in savings or a money-market account for bills and bad years, so investments need not be sold when markets are down.' },
  { term: 'Inherited IRA', text: 'An account kept in the name of the person who died, for your benefit. You can take money out at any age without the 10% penalty, but you cannot convert it to Roth.' },
  { term: 'Beneficiary form', text: 'The form at each account naming who inherits it. It decides, not the will.' },
  { term: 'RMD', text: 'Required minimum distribution: the amount the IRS makes you take from Pre-Tax accounts each year, starting at 73 (75 if you were born in 1960 or later).' },
  { term: 'Roth conversion', text: 'Moving money from Pre-Tax to Roth on purpose and paying the tax now, in a low-tax year, so less is taxed later. It is not spent.' },
  { term: 'Withholding', text: 'Tax a firm holds back from a payment and sends to the IRS for you. Quarterly estimates are the other way to pay as you go.' },
  { term: 'Survivor benefit', text: 'The Social Security check a widow or widower can take on the spouse’s record. You are paid the larger of it and your own benefit, not both added together, but you can start one first and switch to the other later.' },
  { term: 'Full retirement age', text: 'The age (66 to 67) at which Social Security pays its full amount; starting earlier pays less for life.' },
  { term: 'Cost basis', text: 'What an investment cost; tax is owed only on the gain above it. At a death the deceased’s share of Taxable accounts and the house (not Pre-Tax or Roth accounts) takes a new basis at its value that day.' },
  { term: 'COBRA', text: 'A law that lets you keep a former employer’s health plan for a while if you pay the full premium.' },
  { term: 'Marketplace (ACA)', text: 'Health insurance bought at healthcare.gov or your state’s site, often with help paying the premium.' },
  { term: 'IRMAA', text: 'An extra Medicare premium for people with higher income, set from your tax return two years earlier.' },
  { term: 'Executor and probate', text: 'The executor is the person the will names to settle the estate; probate is the court process that oversees it.' },
  { term: 'Spending rule (guardrails)', text: 'A rule that lowers spending after bad markets and allows more after good ones, so savings last. The guide gives its lines in dollars.' },
  { term: 'Chance of lasting', text: 'Of every starting year in real market history since 1871 (or 1928), the share in which your savings would have lasted at your spending. 80% means 8 in 10 starting years lasted.' },
  { term: 'Average returns', text: 'The table assumes the same return every year. Real years go up and down, which is why the spending rule and printing the guide again matter.' },
  { term: 'Today’s dollars', text: 'Future amounts shrunk by inflation, so a figure for 2040 reads as what it would buy now.' },
]);

export const SURVIVOR_GUIDE_NOTE = 'Educational only, not legal, tax or investment advice. The first steps are the usual ones; an estate attorney, a tax preparer and each firm decide what applies to you. Printed on your own computer; nothing was sent anywhere.';
