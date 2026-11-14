// The newest What's New entries, newest first. Add each release's entry at
// the TOP of this list (the rules for an entry are at the top of
// changelog.js, which holds the full history and includes this list).
//
// This file is all the What's New popup downloads. Keep it to 30 entries
// or fewer: when changelogRecent.test.js says it is too long, move the
// oldest entries, unchanged, to the top of the older list in changelog.js.
export const CHANGELOG_RECENT = [
  {
    id: 511,
    date: '2026-11-14',
    title: 'Smoother typing, and faster lesson pages',
    summary: 'Typing in the plan is smoother, the next simulated-markets run starts sooner, and the lesson pages draw faster.',
    items: [
      "**Smoother typing.** The Dashboard's Three changes card and its first-year-that-lasts figure now wait until you stop typing before they work anything out, instead of re-checking the plan after every key.",
      "**Simulated markets start sooner.** The background worker that runs them now stays ready between runs, so a new run no longer waits for the engine to load again.",
      "**Faster lesson pages.** The lesson and information pages now carry their small style sheets inside the page, so they draw without waiting on extra files, and each lesson's first picture loads ahead of the rest.",
    ],
  },
  {
    id: 510,
    date: '2026-11-14',
    title: 'Instant Undo, and smaller updates',
    summary: 'Undo and switching between scenarios are now instant, and each update is a smaller download: the What\'s New window, the background workers and the fonts each ship less.',
    items: [
      "**Undo is instant.** Pressing Undo, switching back to a scenario or turning a setting back now shows the results the app worked out a moment ago, instead of running the simulations and analyses again. The last few results are kept in memory only, never stored, and a reload starts fresh.",
      "**Smaller updates.** After each release, returning visitors download less: the What's New window now loads only the latest entries (the full history is still in Help > What's New), the background calculations are one file instead of three copies of the engine, and the app uses the same font files as the home page instead of a second copy.",
    ],
  },
  {
    id: 509,
    date: '2026-11-14',
    title: 'A faster app',
    summary: 'The app opens and settles faster: a smaller first download, no more pauses during the market simulations, and the Dashboard\'s background figures arrive in a few seconds instead of over ten.',
    items: [
      "**Fixed: freezes while simulated markets ran.** Showing the odds for Three changes, saving a scenario and opening a demo ran their simulations in the background as intended, but read the first progress report as a failure and ran them again on the page itself, which could freeze it for several seconds. They now stay in the background.",
      "**A smaller first download.** The app now starts with only the icons it uses, about a third less to download before the Dashboard appears.",
      "**Background figures sooner.** The Action Plan, Tax Optimizer Hub, Roth grids and claiming grid now fill in as soon as their analyses are done, a second or two in, instead of waiting another ten seconds for the history replays. Two history tables that only Premium shows are no longer worked out for everyone.",
      "**Less work while you edit.** The Monte Carlo progress no longer redraws the whole page, and two searches that only Retirement Readiness and the printed report show no longer run after every change on other pages.",
      "**A quicker start.** The home page fetches the app's files quietly in the background, so the click through to the planner is faster, and the first simulated-markets run after opening starts at once instead of after a short pause. All of this is the app's own files from this site; nothing new is sent anywhere.",
    ],
  },
  {
    id: 508,
    date: '2026-11-12',
    title: 'Worth a closer look, on the Dashboard',
    summary: 'New on the Dashboard: Worth a closer look names the years and amounts in your own plan where a small change could matter, each with a link to the page that tests it.',
    items: [
      "**Worth a closer look.** A new card between the answers row and Plan Feedback. It reads your own year-by-year projection and names the years and amounts where a small change could matter: income just over or just under a Medicare surcharge (IRMAA) line or the marketplace (ACA) premium-credit line, room left in the 12% bracket in retired years, a withdrawal order or Social Security starting age that does better on your plan's own numbers, and gifts to charity that could come from an IRA. Each one links to the page that tests it. Amounts are in today's dollars, with average returns every year and the plan's set lifespans; How these are picked, at the bottom of the card, lists the thresholds.",
      "**Your plan's own figures.** The 12% bracket room, the withdrawal orders and the starting ages come from running your plan again with that one setting changed, so the tax on extra income (which can run above 12% once more of Social Security becomes taxable), the Medicare premiums and what is left after tax are the engine's own. A plan that runs short is named first, and ideas for paying less tax wait until it lasts. The card changes nothing in your plan.",
      "**Fixed.** A Plan Feedback link meant for a Year by Year sub-tab now opens that sub-tab instead of the first one.",
    ],
  },
  {
    id: 507,
    date: '2026-11-11',
    title: 'Live Pricing sends only tickers, and a Medicare fix in simulations',
    summary: 'Live Pricing now sends only symbols shaped like a ticker, never names or account numbers. The top Medicare surcharge tier is now right in market simulations and history replays.',
    items: [
      "**Live Pricing sends only tickers.** The Symbol field is free text, and some people type an account number, a plan name or a note there. Refresh now sends a Symbol only if it looks like a ticker (letters, digits and . - ^ = :, such as BRK.B, BTC-USD or MUTF:VFIAX). Anything else, such as a name, an account number or a single word of seven or more letters, stays on your device: the holding keeps its current price and shows Not refreshed.",
      "**Fixed.** The highest Medicare surcharge tier is fixed in law through 2027 and grows with inflation after that. In market simulations and history replays, inflation from the frozen years leaked into it, setting it a little too high in later years. It now grows only from 2028. Plans that use one inflation rate were already right and do not change.",
    ],
  },
  {
    id: 506,
    date: '2026-11-11',
    title: 'The IRS\u2019s 2027 tax figures, used from 2027 on',
    summary: 'Your plan now uses the IRS\u2019s published 2027 brackets, deductions and capital-gains bands for 2027 and later years, instead of 2026 figures grown by inflation. Your numbers may change a little.',
    items: [
      "**What changed.** The app keeps one set of federal tax figures per year. 2026 stays as it was. From 2027 it uses the figures the IRS published on November 5: brackets for every filing status, the standard deduction and the extra amount at 65, the 0% and 15% capital-gains bands, the AMT amounts and the estate exclusion. Years after 2027 grow from the 2027 figures by your plan\u2019s inflation rate.",
      "**How much.** The IRS raised most 2027 figures about 3%, a little more than the 2.5% the app had assumed, so most plans pay slightly less federal tax. For the Parkers demo it is about $540 less over their whole retirement, in today\u2019s dollars.",
      "**Still estimated.** Medicare premiums and surcharge thresholds, 401(k) and IRA limits and the IRA-to-charity limit for 2027 are not published yet. Until they are, those keep growing from 2026, as before.",
      "**Fixed.** The highest Medicare surcharge tier was set too high in some years for a plan that starts after 2026. Connecticut\u2019s estate exemption now follows the federal one each year, as its law says, and Arizona uses the 2027 amount at 65.",
    ],
  },
  {
    id: 505,
    date: '2026-11-11',
    title: 'No more analytics, and privacy wording that matches the code',
    summary: 'The optional usage analytics are gone, so the app counts nothing. The privacy page, Verify page and app now say exactly what Premium, Live Pricing and backups involve.',
    items: [
      "**No analytics.** The optional Anonymous Usage Analytics switch is gone, along with the code behind it. The app no longer counts visits or tabs at all, and if you had turned it on, it is off for good. An independent check had found it kept sending until the page was reloaded after you turned it off; it also told us very little, since only a few people ever switched it on.",
      "**What Premium sends, said everywhere.** With Premium, the app sends your key to our module server to fetch the Premium code (the demo sends a built-in demo key). The Premium FAQ said activating a key \u201csends nothing anywhere\u201d; the Local-Only card, the Guide and the privacy page now list this connection too. Your plan is still never sent.",
      "**Live Pricing, exactly.** It sends the ticker symbols of all your live-priced holdings together, as typed in each Symbol field, not one bare symbol.",
      "**Offline, exactly.** The free app works offline. Premium areas and the demo\u2019s Detailed Holdings need a connection again after each reload, because their code is not stored on your device.",
      "**Backups.** A backup file also holds your Premium key (with your email address inside) and your Live Pricing links, and a cloud-folder copy has no password. The backup screen, the crash screen and the privacy page now say so.",
      "**No referring address.** Our pages now ask your browser to send no referring address to any site, including sites you open from a link here.",
    ],
  },
  {
    id: 504,
    date: '2026-11-07',
    title: 'Retirement Income shows withdrawals by account',
    summary: 'Premium\u2019s Retirement Income page now shows each retired year\u2019s withdrawals by account (brokerage, IRA/401(k), Roth) instead of splitting them into dividends and share sales.',
    items: [
      "**Why.** A dividend inside an IRA is cash inside the IRA: spending it is still an IRA withdrawal, taxed like any other. Which account a dollar comes from is what your plan decides and what decides the tax, so that is how the page now shows it. Your plan\u2019s numbers and verdict are unchanged.",
      "**What your holdings pay out** is now split into brokerage accounts (cash you can spend without a withdrawal, taxed each year whether spent or reinvested) and IRAs, 401(k)s, Roth and HSA accounts (it stays in the account).",
      "**New cards.** Withdrawals From Savings gives the first retired year by account, in your withdrawal order. Brokerage Dividends shows what the plan taxes that year and how much of the brokerage withdrawal they would cover if taken as cash.",
      "**The year-by-year table** now has From Brokerage, From IRA/401(k) and From Roth, plus total taxes, Roth conversions, charity gifts from the IRA and any amount not covered, so every year adds up. Year and Age stay in view on a phone, and columns your plan never uses are left out.",
      "**Fixed.** When Plan Settings takes brokerage dividends as cash, the page counted them twice, and money sent from an IRA to charity could show as reinvested. Both now come straight from the plan.",
      "**The income-investing what-if** stays, collapsed, with a plain note: a dividend isn\u2019t extra money, because the share price drops by about the amount paid. The Assumed Dividend Growth Rate field is gone; the page now uses your plan\u2019s own figures.",
    ],
  },
  {
    id: 503,
    date: '2026-11-05',
    title: 'Head of household for a survivor with a dependent child',
    summary: 'After the two qualifying surviving spouse years, a survivor whose child is still a dependent now files as head of household, and the child counts for the health-insurance credit.',
    items: [
      "**Head of household.** Once the two qualifying surviving spouse years after a death end, a widow or widower whose child is still their dependent files as head of household, with wider brackets, a larger standard deduction ($24,150 in 2026) and a wider 0% band for capital gains than a single filer. The plan used to tax those years as Single. Year by Year shows HOH as the filing status.",
      "**The child counts for the health-insurance credit.** In every year the child is a dependent, the marketplace household for the credit before Medicare now includes the child, which lowers what the household is expected to pay. Enter the last year a child is your dependent under Household, with the survivor settings; your numbers change only if you have.",
    ],
  },
  {
    id: 502,
    date: '2026-11-05',
    title: 'A survivor benefit from full retirement age, to the month',
    summary: 'For a widow or widower whose full retirement age has months, such as 66 and 8 months, the survivor benefit can now start at that age instead of the next birthday.',
    items: [
      "**No months given up.** For people born 1957 to 1961, the survivors\u2019 full retirement age falls between birthdays, for example 66 and 8 months for someone born in 1960. The start-age choices used to stop at the next birthday, 67, which gave up up to ten months of the unreduced check. Now the last choice is the full retirement age itself, and the plan pays the survivor benefit from that month. Compare start ages and its switching strategies use it too, and the Survivor\u2019s Guide names the age with its months.",
    ],
  },
  {
    id: 501,
    date: '2026-11-05',
    title: 'A survivor\u2019s spending falls 30% for a new plan',
    summary: 'A new plan assumes everyday spending other than housing falls 30% when one of you is alone, up from 20%, a cautious reading of how much one person needs compared with two.',
    items: [
      "**Why 30%.** Studies of household costs find one adult needs about two-thirds to seven-tenths of what two do. With housing keeping its full cost (30% of spending by default), a 30% drop in the rest is about 21% of the whole budget, a cautious reading of those studies. A plan saved earlier keeps 20%. Change it under Household as the Household Expense Reduction.",
    ],
  },
  {
    id: 500,
    date: '2026-11-05',
    title: 'Counting the fall in death rates',
    summary: 'A new plan\u2019s odds of living to each age count the fall in death rates Social Security\u2019s actuaries expect, about 0.7% a year, so people live a little longer.',
    items: [
      "**Longer lives, a little.** Social Security\u2019s life table uses 2023\u2019s death rates as if they never change. They keep falling, and the 2025 Trustees Report expects about 0.7% a year more for people 65 and older. A new plan now counts that: the odds shown beside Life Expectancy, the lifespans drawn in Will It Last?, and the age the risk-based spending rule plans to. A 65-year-old\u2019s one-in-four age moves one to two years later. A plan saved earlier and the sample families keep the 2023 table; the switch is under Household, below the first Life Expectancy.",
      "**Your numbers may change.** With lifespans drawn, a few more simulated lives run longer, so the chance of lasting can come down a little.",
    ],
  },
  {
    id: 499,
    date: '2026-11-05',
    title: 'Qualifying Surviving Spouse: joint tax brackets for two more years',
    summary: 'A widow or widower with a dependent child keeps the joint tax brackets and standard deduction for the two years after the year of death, as the tax law allows.',
    items: [
      "**Two more years of joint brackets.** After a spouse dies, the survivor can file a joint return for that year. For the next two years, a survivor whose dependent child lives with them can file as a Qualifying Surviving Spouse, keeping the joint tax brackets and standard deduction. The plan used to tax those years as Single. Enter the last year a child is your dependent under Household, with the survivor settings, and it now figures them that way.",
      "**Pennsylvania and death benefits.** Pennsylvania does not tax death benefits an employer pays to an employee\u2019s beneficiary. A survivor benefit marked as taxed now stays off a Pennsylvania return, while still being taxed federally.",
      "**What stays the same.** The things the law ties to being unmarried stay at the single amounts: how much Social Security is taxed, Medicare\u2019s income surcharge (IRMAA), the senior deduction\u2019s income limit, the extra Medicare tax on pay, and your state return. Year by Year shows QSS as the filing status in those years. The Survivor\u2019s Guide says so too. Your numbers change only if you enter a year and a child is still your dependent in the years after a death in the plan.",
    ],
  },
  {
    id: 498,
    date: '2026-11-04',
    title: 'A survivor still working keeps the household budget',
    summary: 'When spending today comes from pay, a spouse still working after a death now keeps the household\u2019s spending, less the survivor drop and capped, with savings covering any gap.',
    items: [
      "**Spending no longer follows one paycheck.** When Current Spending is worked out from pay, the plan used to have a survivor still working spend exactly what their own pay left after taxes and savings. If the one who died earned most of the money, that cut the budget far below what the household really spends, and the plan looked better than it should; if the survivor earned most of it, the reverse. Now the survivor keeps what the plan had you spending together in your last working year, in today\u2019s dollars, less the Household Expense Reduction when it is on (housing excepted when that switch is on), but no more than the larger of what their own pay leaves and the plan\u2019s retirement budget for one. Pay covers what it can and retirement contributions continue; your accounts, life insurance included, cover the rest, and pay left over goes into them.",
      "**Where it is.** Household, with the survivor settings: on for a new plan, off for a plan saved earlier until you turn it on. The Survivor\u2019s Guide says which way the plan spends. Your numbers will change if you turn it on and the Survivor Stress Test, or a death in a simulated trial, comes before you both retire.",
    ],
  },
  {
    id: 497,
    date: '2026-11-04',
    title: 'An inherited IRA for a survivor under 59\u00bd',
    summary: 'A survivor under 59\u00bd can now keep the spouse\u2019s Pre-Tax accounts as an inherited IRA, taking money without the 10% penalty until 59\u00bd, then moving it into their own name.',
    items: [
      "**Without the 10% penalty.** A widow or widower under 59\u00bd who moves a spouse\u2019s IRA or 401(k) into their own IRA pays a 10% penalty on anything taken out before 59\u00bd. Kept as an inherited IRA, it has none. The plan now does that: from the year after a death, a survivor under 59\u00bd takes Pre-Tax money from the inherited share first, Life Event withdrawals included, without the penalty, and at 59\u00bd it moves into the survivor\u2019s own name.",
      "**The rules that come with it.** Once the one who died would have reached their required-withdrawal age (at once, if they had), the inherited IRA needs a yearly withdrawal based on the survivor\u2019s life expectancy, still without the penalty. A Roth conversion uses the survivor\u2019s own share first and moves any more into their name; money the survivor adds is their own.",
      "**Whose is whose.** Beside the Pre-Tax balance under Balances, a new field says how much of it is in each spouse\u2019s name (half each unless you change it). The switch is under Household, with the survivor settings: on for a new plan, off for a plan saved earlier until you turn it on. The Survivor\u2019s Guide tells the survivor to ask for an inherited IRA. Your numbers will change if you turn it on and the Survivor Stress Test, or a death in a simulated trial, leaves a survivor under 59\u00bd.",
    ],
  },
  {
    id: 496,
    date: '2026-11-04',
    title: 'A first-weeks page for the days right after a death',
    summary: 'The Survivor\u2019s Guide has a short first-weeks page: the steps that cannot wait, who to call, and the money for now. The survivor spending drop shows its share of the whole budget.',
    items: [
      "**The first weeks.** Tax & Estate \u2192 Survivor\u2019s Guide \u2192 Print the first weeks only prints one or two pages for each of you, for the days right after a death: the note, the steps that cannot wait in one line each (Social Security, the bills, health coverage, the insurance, the pension and employer, the retirement accounts), who to call, and that the money for now is covered. It is also a choice in Print / PDF Report.",
      "**What the survivor drop comes to.** With housing keeping its cost for the one left, the Household Expense Reduction applies to the rest of the budget; under the field the plan now says what it comes to overall, and what to enter for a 20% drop overall.",
    ],
  },
  {
    id: 495,
    date: '2026-11-04',
    title: 'Housing keeps its cost for a survivor, and the chance of lasting names its age',
    summary: 'After a death, housing now keeps its full cost for the one left. Risk-based guardrails show the age their chance of lasting runs to, and plan to an age measured from retirement.',
    items: [
      "**A survivor\u2019s home costs.** When one of you dies, the plan lowers spending by the Household Expense Reduction (20% unless you changed it). It now leaves the housing share of spending out of that drop: rent, property tax, home insurance and upkeep cost one person what they cost two (a mortgage you entered under Balances & Debt is paid in full either way). With a 30% housing share, spending falls 14% instead of 20%. On for a new plan; a plan saved earlier keeps the drop on the whole budget until you switch it on under Household. Your numbers will change if you switch it on.",
      "**The chance of lasting names its age.** Year by Year, the Risk-Based Guardrails box and the printed report now say how far ahead the chance looks: \u201c84% chance of lasting until age 95\u201d, or for a couple, \u201cuntil Lee is 95\u201d.",
      "**A cautious age measured from retirement.** The age the rule plans to, about 1 in 4 people (or couples) like you, is now read from the year you retire instead of from today. Someone who reaches retirement tends to live longer than the odds say from a younger age, so for anyone not yet retired the rule plans a year or two further ahead and spends a little more carefully.",
    ],
  },
  {
    id: 494,
    date: '2026-11-04',
    title: 'Better Social Security answers for a survivor, and benefits as a share of pay',
    summary: 'A survivor\u2019s benefit now uses Social Security\u2019s survivor ages, the start-age comparison tries taking one benefit first and switching, and a survivor benefit can be a share of pay.',
    items: [
      "**The survivor\u2019s own age table.** Social Security reaches an unreduced survivor benefit on its survivors table, which for people born 1957 to 1961 is 2 to 10 months earlier than the retirement age the plan used. A survivor born in those years now gets a slightly larger check when starting it before full retirement age. Your numbers will change if one of you was born 1957 to 1961.",
      "**Take one benefit first, then switch.** Compare start ages for this plan (Plan \u2192 Income \u2192 Social Security) now also runs the plan with the survivor\u2019s own reduced benefit from 62 and the survivor benefit from full retirement age, and with the survivor benefit at once and their own at 70, and flags one that leaves more than any single start age. The Survivor\u2019s Guide names it in the Social Security step.",
      "**A share of pay.** A survivor benefit under Tax & Estate \u2192 Survivor\u2019s Guide can be set as a share of that spouse\u2019s pay, such as half of salary, and follows any change to the salary.",
    ],
  },
  {
    id: 493,
    date: '2026-11-04',
    title: 'Survivor benefits from work, where the money is kept, and how to open the plan',
    summary: 'The Survivor\u2019s Guide now counts benefits like an employer\u2019s survivor income and group life insurance, lists where your money is kept, and explains how to open the plan in the app.',
    items: [
      "**Other survivor benefits.** Some employers pay a surviving spouse a share of salary for years if an employee dies while working there; many offer group life insurance through work; unions and associations have death benefits. Tax & Estate \u2192 Survivor\u2019s Guide now has a list for them: whose death pays it, a yearly amount and for how many years or a one-time amount, whether it pays only while that person is still working, whether it rises with inflation and is taxed, and who to contact. Counted in the plan, a yearly benefit is income from the year after the death and a one-time amount goes into savings, so the Survivor Stress Test, the simulated lifespans and the guide all include it. Your numbers change only if you add one.",
      "**Where the money is kept.** A list of firms and account names (never account numbers) so the one left knows where to look and whom to call, printed on the guide, plus, unless you switch it off, each firm and account from Detailed Holdings with its tax type and value.",
      "**Opening the plan in the app.** The guide explains how to open the plan on your own computer, how to restore it on another from the backup file and what that file is called, when the last backup was made, and where you keep it, in your own words.",
      "**In Print / PDF Report too.** For a two-person plan, the Survivor\u2019s Guide is now one of the choices in Print / PDF Report, so it can go in the same printout as the rest of the plan; it still prints on its own from Tax & Estate.",
    ],
  },
  {
    id: 492,
    date: '2026-11-04',
    title: 'A Survivor\u2019s Guide, and your Risk & Stress notes in print',
    summary: 'Tax & Estate has a Survivor\u2019s Guide: the plan on paper for the spouse who would carry it on, with your own note. The printed report now carries your Risk & Stress notes.',
    items: [
      "**A guide for the one left.** For a plan with two people, Tax & Estate \u2192 Survivor\u2019s Guide prints one guide for each of you, written as if the other died this year. It opens with the first steps, grouped by when they are due, each with a box and a date: death certificates, Social Security (including when to start the survivor benefit and when to switch to your own), insurance, pensions, retirement accounts, the house, debts, health coverage and taxes. Then it gives what the plan spends and how long it lasts, the income that keeps coming and what changes later, blank lines for where things are, and a table of each year whose rows add up: spending, healthcare, one-time costs, taxes, and which accounts to take the money from. Every dollar is in today\u2019s dollars, and words like RMD and inherited IRA are explained in plain English.",
      "**Your note to each other.** Each of you can write a note for the other, printed at the top of the other\u2019s guide: what the plan is trying to do, who to call first, what not to rush. The notes stay in this browser and in Backup Everything, and are never part of your plan settings.",
      "**The spending rule in dollars, for the survivor.** With risk-based guardrails on, the guide says at what savings to cut spending and to what, and when a raise is allowed, from the year the survivor retires.",
      "**Your Risk & Stress notes on paper.** The printed analysis report adds the notes the Risk & Stress page shows only on screen: your risk-based guardrails in dollars, how your plan did in every real retirement since 1871 or 1928, and what fees cost you.",
    ],
  },
  {
    id: 491,
    date: '2026-11-03',
    title: 'Risk-based guardrails plan to a cautious age',
    summary: 'Risk-based guardrails now measure the chance of lasting to a cautious age, not just your life expectancy, so they are less likely to cut sharply late in life.',
    items: [
      "**Plan the rule to a cautious age.** The rule measured your chance of lasting to your life expectancy, an age many people outlive; past it, the rule had only a few years to work with and often cut hard in the 90s. It now plans further ahead: a single person to the later of life expectancy and the age about 1 in 4 people of their age and sex reach, and a couple, the last survivor to the year by which about 1 in 4 couples like them still have one alive. The first of a couple to die stays at their life expectancy; if the other is the one left, they are planned to their own cautious age from then on, and a spouse whose short life expectancy you set for a health reason does not stretch the other\u2019s. Ages come from the Social Security life table. Your plan itself still ends at your life expectancy.",
      "**What it costs.** A little spending along the way. Across every real start since 1928, lifetime spending came out 1 to 3% lower than before for a 65-year-old single person and 3 to 6% lower for a couple, which for a tight couple\u2019s plan can mean spending a little below a fixed plan over a lifetime. It works like insurance against a long life: in return, simulated markets that also sample how long you live lasted about 1 to 3 points more often for a single person and 3 to 6 points for a couple. Every real-history start lasted either way. Someone who lives well past the cautious age can still see the rule cut to the floor.",
      "**Your choice.** Under Risk-Based Guardrails, Plan the rule to shows the ages it uses. If you set a short life expectancy for a health reason, choose your life expectancy there.",
    ],
  },
  {
    id: 490,
    date: '2026-11-03',
    title: 'Risk-based guardrails reset spending when your household changes',
    summary: 'After a spouse dies or someone outlives the age the plan assumes, risk-based guardrails now bring spending down to your target chance if the change left it lower.',
    items: [
      "**A fresh level after a death.** Before, after a spouse died the rule kept the survivor\u2019s spending where it was unless the chance of lasting fell below 50%, so a survivor could spend for years at a lower chance than a new plan would accept: on one sample couple, 66\u201377% for 18 years. Now, in the first year after a death, after someone lives past the age your plan assumes (and every five years after that), or, in the simulated markets, when a care need you did not enter begins: if the change lowered the chance below your Raise to level (80% by default), spending comes down to the level that gives it, where a new plan would start.",
      "**What it does not do.** It never raises spending, never goes below your floor, and skips a change that left you better off, for example when the survivor\u2019s lower spending more than makes up for the lost income. That one cut goes all the way, whatever How far to move says, and can be deeper than Cut back to. Life insurance paid to a survivor now counts as savings going into that year, so the rule does not cut the year the check arrives. Year by Year marks the year \u201creset after a death\u201d.",
      "**How much it changes.** On the sample couple the survivor\u2019s chance returns to 81% the year after the death and climbs from there, and spending stays above the plan\u2019s own level. Across every real start since 1928 the effect is small: every start lasted either way, and lifetime spending was 0.3% lower.",
      "**Life insurance in Year by Year.** The year a death benefit is paid to the survivor, Year by Year now shows it under income, as money received into Taxable and free of income tax, and Where the money goes counts it under Saved. In today\u2019s dollars it also says the amount in the dollars of the year it is paid, so a $127,000 policy paid in 2059 does not look like a smaller one. Before, it went into the balance without a line saying so. A policy whose death benefit is $0 pays nothing at a death; if yours shows nothing that year, check the death benefit under your policy.",
      "**Your plan.** Only plans with risk-based guardrails on, and only after a death, a long life or sampled care, will read differently. You can turn it off under Risk-Based Guardrails.",
    ],
  },
  {
    id: 489,
    date: '2026-11-03',
    title: 'Risk-based guardrails: what spending becomes, and a smallest change',
    summary: 'Risk-based guardrails now say what your spending would become at each cut and raise amount, show the chance after each move, and can skip raises smaller than a size you choose.',
    items: [
      "**What spending becomes.** Beside the savings at which the plan would lower or raise your spending, the settings and Year by Year now say what it would spend after the change, as Income Lab\u2019s guardrail reports do. In a year the rule has just cut or raised, Year by Year now shows the amounts from the new spending, under After this change. The spreadsheet adds both as columns.",
      "**The chance after a move.** When the rule cuts or raises, Year by Year now also shows the chance at the new spending, for example \u201c41% chance of lasting \u00b7 spending cut 18% \u00b7 chance now 70%\u201d. A raise can leave it above 80%, because no single raise is more than 20%.",
      "**Smallest change it makes.** A new setting skips a raise smaller than 2%, 5% or 10% of lifestyle spending, so spending holds steady through small moves, though a last small step back up to your plan\u2019s own spending is still made. A cut is never skipped: one smaller than the minimum is made at the minimum. It is off by default.",
      "**Your plan.** Nothing changes unless you turn the new setting on.",
    ],
  },
  {
    id: 488,
    date: '2026-11-03',
    title: 'Risk-based guardrails: your cut and raise amounts in dollars, and updates after a death',
    summary: 'Risk-based guardrails now show the savings at which your spending would be cut or raised each year, and update from the year a spouse dies. Premium adds the largest cut in one year.',
    items: [
      "**Guardrails in dollars.** With risk-based guardrails on, the settings now say what you retire with, the savings below which the plan would lower your spending (and what it would then spend), and, from the year raises are allowed, the savings at which it would raise it. Savings here means your Pre-Tax, Roth, Taxable and HSA accounts together. Year by Year shows each year\u2019s savings going in and both amounts, or says when spending is already at its lowest or at your raise ceiling, and the spreadsheet adds them as columns. A cut happens only in a year that starts with savings below the cut amount, and a raise only in one that starts at or above the raise amount.",
      "**After a death or a long life.** The rule used to measure every year against the plan you expected, and the Survivor Stress Test\u2019s early death was counted from the start. Now, from the year a spouse dies, it measures with the survivor\u2019s income and spending; if you live past the age your plan assumes, it plans for up to five more years from there; and when the simulated markets draw a care episode you did not enter, it counts those costs from the year they begin. Like a household, it does not see these coming. Care you entered in your plan is counted from the start, as before.",
      "**Getting back to your plan.** After cuts, a raise back up to your plan\u2019s own spending now only needs your chance to reach the raise line over the years you have left. Before, a raise needed it over at least ten more years, so a cut late in life could almost never be undone. Raises above your plan still need the ten years.",
      "**A ceiling on raises by default.** A new plan\u2019s risk-based guardrails now raise spending no higher than 50% above your plan. Tested against every real start since 1928, raises with no limit sometimes reached twice the plan and then ran out of money in starts that fixed spending survived; with the 50% ceiling every start lasted and still spent about a third more over a lifetime. A plan saved since What\u2019s New 487 keeps the setting it was saved with, and you can change it under Highest raises can take spending.",
      "**Largest cut in one year (Premium).** Beside the deepest cut, the comparison of spending rules now shows the biggest cut the rule made from one year to the next, as a share of the year before, in both tables and the every-start spreadsheet. It can be larger than the deepest cut when a cut gives back an earlier raise.",
      "**Your plan.** Nothing changes unless risk-based guardrails are on. With them on, plans with the Survivor Stress Test, sampled lifespans or sampled care, and plans whose spending was cut late in retirement, will read differently.",
    ],
  },
  {
    id: 487,
    date: '2026-11-03',
    title: 'Risk-based guardrails',
    summary: 'A new spending rule moves your spending on your plan\u2019s chance of lasting, re-measured every retired year against real markets since 1928, instead of on a withdrawal rate.',
    items: [
      "**How it works.** Under Risk & Stress, turn on Risk-Based Guardrails. Your chance of lasting is how many of every 100 real market histories since 1928 (or 1871) your savings would survive at your current spending, with the Social Security, pensions and other income you expect and what each dollar of spending costs you in tax. The plan checks it again at the start of each retired year. While it stays between 50% and 99%, spending stays put. Below 50% it is cut back to the level with a 70% chance; at 99% it is raised to the 80% level, but not in your first five years of retirement and never by more than 20% at a time. Essential spending is never cut, and with no spending categories set it is never cut below half. Fees and any Keep at Least floor count.",
      "**Your settings.** All four numbers and how far to move are yours to change, and the section explains what each choice trades away. The defaults act sooner than Michael Kitces\u2019s published version, which cuts below 25% back to 45% and raises at 100% to 80%. A review of the first draft found that cutting all the way back to 80% made cuts too big, and that raises right after retiring were often taken back, so cuts now go back about 20 points and raises wait five years. You can also set a ceiling on how far raises take your spending above your plan.",
      "**Where it shows.** The section says what the rule means for your plan when you retire, in dollars, and whether it cuts on your plan\u2019s own projection. Year by Year shows the chance each year and the size of any cut or raise, in the table and the spreadsheet. Will It Last? says when guardrails are cutting spending and how often the simulated markets needed a cut, and the printed report names the rule. Every retirement since 1928 compares it with fixed spending and the other guardrails; the side-by-side of every rule, and each raise-to setting, are part of Premium.",
      "**Your plan.** Nothing changes unless you turn it on.",
      "**When the app is working.** A small card now says when the simulated markets, the history checks or the optimizers are running, with how far the simulated markets have got, so a pause never looks like something broken.",
    ],
  },
  {
    id: 486,
    date: '2026-11-03',
    title: 'Compare with the textbook test',
    summary: 'Every retirement since 1928 now has a one-click textbook test: your balance and spending with no taxes, Social Security or fees, the way FI Calc and the 4% rule run it.',
    items: [
      "**The textbook test.** Under Every retirement since 1928 on Risk & Stress, Compare with the textbook test runs your balance and lifestyle spending when you retire through the same real starts with nothing else: no taxes, Social Security, pensions, Medicare or fees. Spending is taken at the start of each year and raised by the previous year\u2019s inflation, as FI Calc and FIRECalc do, so the same inputs there should land close. It shows how many starts last, the years that run out and the most you could spend in every one. The gap with your plan\u2019s own count is what taxes, benefits and costs do to it.",
      "**Which years the bootstrap uses.** The Monte Carlo\u2019s historical bootstrap samples real years from 1928 on, even when your history checks reach back to 1871; it now says so.",
      "**Using your plan on another device.** Preferences \u2192 Your Data now explains how: there is no account and no sync on purpose, so an Encrypted Backup restored on the other device is how a plan moves.",
    ],
  },
  {
    id: 485,
    date: '2026-11-03',
    title: 'Where should my bonds go? now starts from your plan as it is',
    summary: 'The bond placement comparison now puts your plan, exactly as it is, beside the same plan with its bonds in Pre-Tax first, following your mix year by year. Holdings can be filtered by tax type.',
    items: [
      "**Your plan as it is.** The comparison used to hold your mix today for the whole plan, so a plan that moves toward bonds at retirement showed a different ending balance from its own. Its first column is now your plan exactly, and Bonds in Pre-Tax first follows the same overall mix every year (your working mix, then your retired mix and any yearly move toward bonds), placing each year\u2019s bonds in Pre-Tax first, then Taxable, then HSA, then Roth. A plan that sets its own mix for each account still sees its placement beside an even mix and Bonds in Pre-Tax first. Premium.",
      "**Filter holdings by tax type.** The account filter on Detailed Holdings now also offers All Pre-Tax, All Roth, All Taxable and All HSA, so every 401(k) and IRA can be seen together. Premium.",
    ],
  },
];
