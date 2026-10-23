// The Learn section of the website: /learn and one page per lesson.
//
// scripts/generatePublicPages.mjs turns this list into public/learn.html
// and public/learn/<slug>.html. Each slide is a picture
// (public/learn/img/<slug>/NN.webp, drawn from the lesson's slide deck) with
// the words the narrator says written out beneath it as ordinary text, so
// the whole lesson can be read, searched and translated without playing
// anything.
//
// These pages are part of the website, not the app. They are never stored
// for offline use (vite.config.js leaves learn.html and learn/** out of the
// service worker's precache), so an installed copy of the app does not
// carry them, and a reader always gets the current lesson.
//
// Every name and number in a lesson is invented (the Parkers,
// src/config/demoPlanParkers.js). A lesson may only quote figures the app
// shows for that household.

export const LEARN_STANDING_LINE = 'This is an educational walkthrough using a fictional family. It is not financial advice, and the right answers for you depend on facts a lesson cannot know.';

export const LEARN_PARKERS_HREF = '/app/?demo=parkers';

// A lesson may carry `video`: the address of its narrated video on YouTube.
// The page then shows one plain link that opens YouTube in a new tab. It is
// never embedded, so reading a lesson contacts no other site.
//
// A lesson is written out either as `slides` (pictures with the narration
// beneath) or, until its slides and narration exist, as `text`: sections of
// plain paragraphs, with an optional list. A lesson with neither is
// announced on the hub as coming soon and has no page yet.
//
// `group` places it on the hub (LEARN_GROUPS, in order); the lessons run in
// this list's order within and across groups. A `standalone` page (with its
// own `standing` line and `backHref`) is on neither the hub nor the path.
export const LEARN_GROUPS = [
  { id: 'start', title: 'Start here' },
  { id: 'basics', title: 'The basics', intro: 'Read them in order. Each one builds on the last.' },
  { id: 'decisions', title: 'Big decisions', intro: 'For when you have more than one plan that works, and have to choose.' },
];

export const LEARN_LESSONS = [
  {
    slug: 'site-tour',
    video: 'https://www.youtube.com/watch?v=oeWbBKSPU1s',
    group: 'start',
    label: 'Site tour',
    title: 'A two-minute tour of OutlastRetirement',
    h1: 'A two-minute tour',
    description: 'What OutlastRetirement does and where everything lives: the Dashboard, the Plan page, Year by Year and Scenarios, in eight pictures.',
    summary: 'What the site does and where everything lives.',
    minutes: 2,
    tryLabel: 'Open Ray and Angie’s plan',
    slides: [
      { title: 'A two-minute tour', alt: 'Title slide: A two-minute tour, with portraits of Ray and Angie Parker.', say: 'Welcome to OutlastRetirement. In two minutes, here is what the site does and where everything lives. This is an educational walkthrough using a fictional family. It isn’t financial advice.' },
      { title: 'One question: will my money last?', alt: 'Three boxes in a row: you put in a few numbers, the planner adds up every year, you get a plain answer. Below: free to use, no account, private.', say: 'The site answers one question: will my money last? You put in a few numbers. The planner adds up every year of your life, what comes in and what goes out. Then it gives you a plain answer. It is free to use. There is no account to create, and your plan stays in your browser.' },
      { title: 'Everything is in the menu on the left', alt: 'The app’s left menu beside a table of four pages: Dashboard, the answer; Plan, where your numbers go; Year by Year, every year one row at a time; Scenarios, ask what if.', say: 'Everything is in the menu on the left. Four pages matter most. Dashboard is the answer. Plan is where your numbers go. Year by Year shows every year, one row at a time. Scenarios, under Explore more, is where you ask what if. And Backup Everything saves your plan to a file that you keep.' },
      { title: 'Dashboard: the answer', alt: 'The Dashboard chart of Ray and Angie’s savings from 2026 to 2068, rising to a peak in 2036 and reaching zero in 2054.', say: 'The Dashboard. At the top, a verdict in plain words. Below it, a chart of your savings from today to the end of the plan. This is Ray and Angie, the family in our lessons. Their plan runs short in 2054.' },
      { title: 'Plan: where your numbers go', alt: 'The Plan page, open on Household, with tabs for Income, Savings, Balances and Debt, and Spending.', say: 'The Plan page holds your numbers: your ages, your pay, what you have saved, and what you spend. New here? Quick Setup asks for the basics and builds a first plan in a few minutes. You can fill in the rest later.' },
      { title: 'Year by Year: the plan with nothing hidden', alt: 'The Year by Year table: one row for each year from 2026, with columns for ages, salary, Social Security and spending.', say: 'Year by Year is the plan with nothing hidden. Each row is one year of your life. You can see the paychecks, the Social Security, the spending, the taxes, and what is left at the end of the year.' },
      { title: 'Scenarios: ask “what if?”', alt: 'The Scenario Comparison Chart with six lines, one for each change Ray and Angie could make, such as working two more years or spending less.', say: 'Scenarios is where you try things. Work two more years. Spend a little less. Each idea becomes a line on the chart, so you can see which one helps most before you change anything in real life.' },
      { title: 'Start here: three steps', alt: 'Three steps: open Ray and Angie’s plan and look around, watch lesson 1, build your own plan with Quick Setup.', say: 'That is the tour. To start, open Ray and Angie’s plan and look around. Nothing you change there is saved. Then read lesson one, will my money last. When you are ready, build your own plan. This is education, not financial advice.' },
    ],
  },
  {
    slug: 'will-my-money-last',
    video: 'https://www.youtube.com/watch?v=yQ0UeDhok-A',
    group: 'basics',
    label: 'Lesson 1',
    title: 'Will my money last?',
    description: 'How a retirement plan follows your savings year by year and arrives at one answer, shown with Ray and Angie Parker, a fictional couple nearing retirement.',
    summary: 'How a plan follows your savings, year by year, and arrives at one answer.',
    minutes: 4,
    tryLabel: 'Open Ray and Angie’s plan',
    slides: [
      { title: 'Will my money last?', alt: 'Title slide: Will my money last? With portraits of Ray and Angie.', say: 'Here is the question this whole course answers. If you keep doing what you are doing today, will your money last as long as you do?' },
      { title: 'Education, not advice', alt: 'A notice: this is an educational walkthrough using a fictional family. The family is invented. The arithmetic is real.', say: 'One thing first. This is an educational walkthrough using a fictional family. It isn’t financial advice, and the right answers for you depend on facts a lesson can’t know.' },
      { title: 'Meet Ray and Angie Parker', alt: 'A table: Ray, 54, warehouse supervisor, $62,000. Angie, 52, school front office, $38,000. They own their home, with eleven years left on the mortgage. Neither has a pension.', say: 'Meet Ray and Angie Parker. Ray is 54 and runs a warehouse shift. Angie is 52 and works in a school office. They own their home and still have eleven years left on the mortgage. We made them up, so we can show you every number.' },
      { title: 'What they have saved', alt: '$159,000 in large figures: $150,000 in two retirement accounts at work and $9,000 in the bank.', say: 'Between two retirement accounts at work and a savings account, they have put away one hundred fifty-nine thousand dollars. They don’t know if that is a lot or a little. Most people don’t.' },
      { title: 'A plan follows one balance', alt: 'A diagram: money in (pay, Social Security, employer match) flows into your savings, and money out (living costs, health care, taxes) flows from it.', say: 'A retirement plan sounds complicated. It isn’t. Think of your savings as one balance. Some years money goes in. Some years money comes out. A plan just follows that balance, one year at a time, for the rest of your life.' },
      { title: 'While they work, the balance grows', alt: 'A bar chart of savings at each age from 54 to 64, rising from $159,000 to $346,000. From their pay, $433 a month; from Ray’s employer, $154 a month; investment growth is the rest.', say: 'While Ray and Angie work, the balance grows. Each month a little of their pay goes in. Ray’s employer adds some too. And the money already saved earns more money by being invested.' },
      { title: 'At 65, the paycheck stops', alt: 'A timeline from age 54 to 94, working until 65 and retired after. Planned spending: $46,000 a year.', say: 'They plan to stop working when Ray turns 65. The paychecks end. Social Security starts, but it does not cover everything. Each year, the rest comes out of their savings. They plan to live on forty-six thousand dollars a year.' },
      { title: 'The Parkers’ savings, year by year', alt: 'A line chart of the Parkers’ savings by Ray’s age: highest at 64, about $346,000, then falling to empty at 82, with twelve planned years left and no savings.', say: 'Here is their balance over time. It climbs while they work and reaches about three hundred forty-six thousand dollars. Then they stop, and it starts to fall. When Ray is 82, it is empty. He and Angie could easily live another ten years.' },
      { title: 'The answer, in plain words', alt: 'The app’s Dashboard for the Parkers, with the verdict at the top right circled: Runs short.', say: 'This is the same family inside OutlastRetirement. You don’t have to read a chart to get the answer. It is written in plain words at the top: runs short. Under it, the chart shows the same story you just saw, and the year the money runs out.' },
      { title: 'This is good news', alt: 'They found out at 54, not at 82. Three changes: work longer, spend less, save more.', say: 'That sounds like bad news. It is the opposite. Ray and Angie just found out with eleven years left to do something about it. A few changes, none of them drastic, fix their plan. We will make those changes together in lesson six.' },
      { title: 'Your turn: open the Parkers’ plan', alt: 'Three steps: find the answer at the top of the page, find the year the chart reaches zero, and ask whether you know the answer for your own money.', say: 'Now you try. Open Ray and Angie’s plan with the link below. Find the answer at the top of the page. Then find the year the chart reaches zero. Nothing you click can break anything, and it is free. And ask yourself one question: do you know the answer for your own money? Next time: where the paycheck comes from when you stop working. As always, this is education, not financial advice.' },
    ],
  },
  {
    slug: 'who-pays-me-when-i-stop-working',
    video: 'https://www.youtube.com/watch?v=5BgymcX7s2s',
    group: 'basics',
    label: 'Lesson 2',
    title: 'Who pays me when I stop working?',
    description: 'The three places retirement money comes from, Social Security, your savings and everything else, and the yearly gap your savings have to fill.',
    summary: 'Social Security, your savings, and the gap between what comes in and what you need.',
    minutes: 4,
    tryHref: '/app/?demo=parkers&tab=yearledger',
    tryLabel: 'Open Ray and Angie’s Year by Year',
    slides: [
      { title: 'Who pays me when I stop working?', alt: 'Title slide: Who pays me when I stop working? The three places retirement money comes from, and the gap your savings have to fill. With portraits of Ray and Angie.', say: 'For forty years someone has handed you a paycheck. The day you stop working, that ends. So who pays you after that? You do. This lesson shows where the money comes from. As always: this is an educational walkthrough using a fictional family. It isn’t financial advice.' },
      { title: 'Three places the money comes from', alt: 'Three numbered columns: 1, Social Security, a monthly check for life; 2, your savings, what you have put away and what it has earned; 3, everything else, such as a pension, part-time work or rent.', say: 'Retirement money comes from three places. Social Security. Your own savings. And everything else: a pension if you have one, or part-time work, or rent from a property. Most people have the first two. Many have nothing in the third box, and that is normal.' },
      { title: 'Social Security', alt: 'Social Security: a check every month for the rest of your life. Three points: it rises as prices rise, you earned it by working, and its size depends on what you earned and the age you start.', say: 'Social Security is a check every month for the rest of your life. It goes up as prices go up. You earned it by working and paying into it. How big it is depends on how much you earned, and on the age you start taking it.' },
      { title: 'Their Social Security checks', alt: 'A table of the Parkers’ Social Security checks. Ray starts at 65: $21,700 a year, $1,810 a month. Angie starts at 63: $12,700 a year, $1,060 a month. Together: $34,400 a year, $2,870 a month.', say: 'Ray and Angie plan to start their checks the year they stop working. Together that comes to about thirty-four thousand four hundred dollars a year. That is about twenty-nine hundred dollars a month.' },
      { title: 'What they need in the first year', alt: '$68,100 in large figures: what Ray and Angie need in their first year without a paycheck. A bar splits it into $46,800 living costs, $19,400 health care and $1,900 mortgage.', say: 'Now the other side. In their first year of retirement, Ray and Angie need about sixty-eight thousand dollars. That is their living costs, plus health insurance, which gets expensive when it no longer comes from a job. We look closely at costs in the next lesson.' },
      { title: 'The gap', alt: 'Two bars side by side. They need $68,100; Social Security pays $34,400. The difference is labeled the gap: $33,700, paid from savings every year.', say: 'Social Security pays thirty-four thousand. They need sixty-eight. The difference, close to thirty-four thousand dollars, is called the gap. Remember that word. The gap is the whole reason you save.' },
      { title: 'Savings fill the gap, every year', alt: 'A bar chart of what the Parkers need each year at Ray’s ages 65, 66, 67, 70 and 75, each bar split into Social Security and savings. The need falls from $68,100 to about $55,000 at 67, when Angie reaches Medicare, and the savings part never disappears.', say: 'The gap gets filled from savings. Every year Ray and Angie are retired, they take what Social Security does not cover out of what they have saved. A big gap empties the savings fast. A small gap lets them last.' },
      { title: 'Year by Year: one row for every year', alt: 'App screenshot: the Year by Year table with the 2037 row highlighted, the year Ray is 65. In: $34,417. Out: $68,128. From savings: $33,711.', say: 'Here it is in OutlastRetirement. This page is called Year by Year. Every row is one year of Ray and Angie’s life. Find the year Ray turns 65. You can see the Social Security coming in, the costs going out, and the amount taken from savings to cover the gap.' },
      { title: 'Two ways to shrink a gap', alt: 'A diagram with the gap in the middle. From one side, bring more in: work a little longer, a larger Social Security check, part-time work. From the other, spend less: a smaller budget, a paid-off house, lower health costs.', say: 'There are only two ways to shrink a gap. Bring more in, or spend less. Everything else in this course is one of those two moves.' },
      { title: 'Open the Parkers’ Year by Year', alt: 'Three steps: find the first year with Social Security income, read across to see how much came out of savings, and look up your own estimate at ssa.gov. Below, the link to Ray and Angie’s Year by Year page.', say: 'Your turn. Open Ray and Angie’s Year by Year page with the link below. Find the first year with money in the Social Security column. Then look across that row and find how much came out of savings. And for your own plan: do you know what your Social Security check will be? You can look it up for free at ssa.gov. Write the number down. You will need it in lesson four. Next time: what retirement really costs. This is education, not financial advice.' },
    ],
  },
  {
    slug: 'what-will-retirement-cost-me',
    video: 'https://www.youtube.com/watch?v=AbugIL7MEkU',
    group: 'basics',
    label: 'Lesson 3',
    title: 'What will retirement cost me?',
    description: 'How to work out what you spend today without a budget, which costs stop and which grow in retirement, and why spending is the number you control most.',
    summary: 'What you spend now, what changes when work stops, and why it matters most.',
    minutes: 4,
    tryLabel: 'Open Ray and Angie’s plan',
    slides: [
      { title: 'What will retirement cost me?', alt: 'Title slide: What will retirement cost me? What you spend decides how long the money lasts, and it is the number you control most. With portraits of Ray and Angie.', say: 'Last time we found the gap between what comes in and what goes out. Today we look at what goes out. It is the number that matters most, and the one you have the most say over. As always: this is an educational walkthrough using a fictional family. It isn’t financial advice.' },
      { title: 'What is left is what you spend', alt: 'A subtraction for Ray and Angie this year: pay $100,000, minus taxes $14,700, minus savings $5,200, leaves $80,100 spent. That is $6,678 a month, the $914 mortgage included.', say: 'Nobody likes writing a budget, so here is a shortcut. Take your pay. Take away taxes. Take away what you save. Whatever is left, you spent. For Ray and Angie that is about sixty-seven hundred dollars a month.' },
      { title: 'Some costs stop', alt: 'A table of three costs that stop in retirement: commuting and work costs, saving for retirement ($433 a month), and the mortgage ($914 a month, paid off the year they stop).', say: 'Some of that goes away when you retire. No more driving to work. No more saving for retirement, because you are in it. And for Ray and Angie, the mortgage is paid off the same year they stop working.' },
      { title: 'One cost grows', alt: 'One cost that grows: health insurance until Medicare at 65, $15,600 a year. A timeline of Angie’s age from 63 to 67 shows her buying her own coverage at 63 and 64, then Medicare from 65.', say: 'But one cost grows. Health insurance usually comes through a job. Stop working before 65, and you buy it yourself until Medicare starts. Angie is two years younger than Ray, so they pay for her coverage for two years. It is about fifteen thousand six hundred dollars a year.' },
      { title: 'What they plan to live on', alt: '$46,000 a year in large figures: what the Parkers plan to live on. Today, outside the mortgage, they spend $5,764 a month; in retirement, $3,833 a month.', say: 'Putting it together, Ray and Angie plan to live on forty-six thousand dollars a year once they retire. That covers food, the house, the car, fun, everything except health insurance and Medicare, which the plan counts separately.' },
      { title: 'Prices go up every year', alt: 'A row of bars from 2026 to 2037 rising from $46,000 to $60,400: the same living costs priced in each year’s dollars at 2.5% a year, 31% more in eleven years.', say: 'There is a catch, and it is called inflation. Prices rise a little every year. What costs forty-six thousand dollars today will cost about sixty thousand by the time Ray retires. The app handles this for you. It shows amounts in today’s dollars so the numbers stay easy to judge.' },
      { title: 'Spend $500 more a month', alt: 'App screenshot: the Dashboard with Annual Lifestyle raised from $46,000 to $52,000. The verdict now says the money is empty at 77, not 82: five years gone.', say: 'Watch what spending does. Ray and Angie’s money runs out when Ray is 82. If they spend five hundred dollars more each month, it runs out at 77. Five years gone.' },
      { title: 'How long the money lasts', alt: 'Three horizontal bars showing how long the money lasts by Ray’s age. Spending $52,000 a year: empty at 77. The plan, $46,000 a year: empty at 82. $43,000 a year: empty at 85.', say: 'Now the other way. Spend two hundred fifty dollars less each month, and the money lasts until 85. Three more years, from one small change.' },
      { title: 'The one number you control', alt: 'A table of what decides your retirement and who controls it. The stock market: not you. Prices: not you. What you spend: you.', say: 'You cannot control the stock market. You cannot control prices. You can control what you spend. In retirement every dollar you don’t spend is a dollar that stays in savings, every year, for thirty years.' },
      { title: 'Move the slider. Watch the answer.', alt: 'Three steps: find the Annual Lifestyle card on the Dashboard, drag its slider up and down, and for your own plan start from a month of pay less taxes and savings. Below, the link to Ray and Angie’s plan.', say: 'Your turn. Open Ray and Angie’s plan and find the card that says Annual Lifestyle. Drag the slider up and down, and watch the answer change. For your own plan, try the shortcut. Take one month of pay. Subtract taxes and what you saved. That is what you spend. Write it down for the next lesson, where you build your own plan. This is education, not financial advice.' },
    ],
  },
  {
    slug: 'build-my-own-plan',
    video: 'https://www.youtube.com/watch?v=tMNii4HGtLM',
    group: 'basics',
    label: 'Lesson 4',
    title: 'Can I build my own plan in ten minutes?',
    description: 'What to have ready and how to get a first retirement answer with Quick Setup: six short steps and a handful of rough numbers.',
    summary: 'Quick Setup, one step at a time, with rough numbers.',
    minutes: 4,
    tryHref: '/app/',
    tryLabel: 'Open the planner',
    tryNote: 'The planner opens in your browser. Your numbers stay on your device, and there is no account to create.',
    slides: [
      { title: 'Can I build my own plan in ten minutes?', alt: 'Title slide: Can I build my own plan in ten minutes? A handful of rough numbers is enough to get your first answer.', say: 'You have watched Ray and Angie’s plan for three lessons. Now it is your turn. You need about ten minutes and a few numbers. They can be rough. As always: this is an educational walkthrough. It isn’t financial advice.' },
      { title: 'Close beats perfect', alt: 'Close beats perfect. A rough answer today is worth more than a perfect one you never get to. Every number can be changed later; round to the nearest thousand and guess where you have to.', say: 'People put this off because they think they need exact figures. You don’t. A rough answer today is worth more than a perfect one you never get around to. You can fix any number later.' },
      { title: 'What to have ready', alt: 'A table of what to have ready and where to find it: your ages, when you would stop, what you earn (a pay stub), what you have saved (your latest statements), Social Security (your estimate at ssa.gov), and what you spend (the shortcut from lesson 3).', say: 'Here is what to have in front of you. How old you are and when you would like to stop working. What you earn. What you have saved, from your latest statements. Your Social Security estimate from ssa.gov. And what you spend, from the shortcut in lesson three.' },
      { title: 'Your numbers never leave your device', alt: 'Your numbers never leave your device. Three points: it runs in your browser, there is no account, and you keep the backup. You can check it yourself at outlastretirement.com/verify.', say: 'One thing before you type anything. OutlastRetirement runs inside your own browser. There is no account to create. Your numbers never leave your device. That also means you are the one who keeps the backup, and the app will remind you.' },
      { title: 'Open the app and choose how to start', alt: 'App screenshot: the welcome screen with two choices, Quick Setup Wizard and Full Guided Interview. Steps: accept the short notice, then choose Quick Setup Wizard, six short steps.', say: 'Open the app. The first time, it shows a short notice to accept, then asks how you would like to start. Choose Quick Setup Wizard.' },
      { title: 'About you', alt: 'App screenshot of step 1, About you. It asks for your name (optional), the year you were born, the age you would like to stop working, and whether you are planning with a spouse or partner.', say: 'Step one is about you. Your birth year, the age you would like to stop working, and whether you are planning with a spouse or partner.' },
      { title: 'Money coming in', alt: 'App screenshot of step 2, Money coming in. It asks what you earn in a year before taxes, your yearly Social Security figure, and a pension if you have one. With no statement yet, click Use the estimate.', say: 'Step two is money coming in. What you earn today, and the Social Security estimate you looked up. If you don’t have it yet, use the estimate the app offers and come back.' },
      { title: 'What you have saved', alt: 'App screenshot of step 3, What you have saved. Three boxes: Pre-Tax, for a 401(k) or traditional IRA; Roth; and Taxable, for brokerage accounts, savings and cash. If unsure, put the total in the first box.', say: 'Step three is your savings. Add up your retirement accounts at work, any IRAs, and other savings or investments. The app asks for them by type because they are taxed differently. If you are not sure which is which, put the total in the first box for now.' },
      { title: 'Spending, then saving', alt: 'App screenshots of steps 4 and 5. Step 4: what you plan to spend in a year of retirement, in today’s dollars. Step 5: what you save each year and any employer match. Skip the extra options for now.', say: 'Step four is what you plan to spend each year in retirement. Use the number from lesson three and trim what will stop. Step five is how much you add to savings each year, and anything your employer adds. Both steps show extra options. You can skip those for now.' },
      { title: 'A short tour, then your answer', alt: 'App screenshot of step 6: a short tour of where things live, then the Generate My Plan button. Your first answer appears at the top of the page.', say: 'The last step is a short tour of where things live. Then click Generate My Plan. The app runs your whole life, year by year, the same way it did for Ray and Angie. At the top is your answer. Whatever it says, you now know something most people never find out.' },
      { title: 'Build it. Then back it up.', alt: 'Three steps: open the app and choose Quick Setup Wizard, enter your own rough numbers, and click Backup Everything in the left sidebar. A picture shows where the Backup Everything button is.', say: 'Your turn, for real this time. Open the app and build your plan. When you finish, click Backup Everything and keep the file somewhere safe. It is the only copy. If the answer worries you, don’t change anything yet. Next lesson, we learn to read it properly. Then we fix it. This is education, not financial advice.' },
    ],
  },
  {
    slug: 'how-do-i-read-my-answer',
    video: 'https://www.youtube.com/watch?v=IK_pxQBcm7w',
    group: 'basics',
    label: 'Lesson 5',
    title: 'How do I read my answer?',
    description: 'How to read a retirement plan’s answer three ways: the verdict in words, the chart of your savings, and the year the money runs out.',
    summary: 'A verdict, a chart and a year.',
    minutes: 4,
    tryLabel: 'Open Ray and Angie’s plan',
    slides: [
      { title: 'How do I read my answer?', alt: 'Title slide: How do I read my answer? The Dashboard says the same thing three ways: a verdict, a chart, and a year. Beside it, a magnifying glass over a small chart.', say: 'You have a plan now, and a page full of numbers. Today we learn to read it. There are only three things to look at. As always: this is an educational walkthrough using a fictional family. It isn’t financial advice.' },
      { title: 'Three things to look at', alt: 'Three things to look at on the Dashboard: 1, the verdict, the answer in plain words; 2, the chart, your savings over your whole life; 3, the year the money runs out, if it does.', say: 'The verdict, in words. The chart, a picture of your savings over your whole life. And the year, when the money runs out, if it does. We will use Ray and Angie’s plan so you can follow along.' },
      { title: 'The answer, in plain words', alt: 'App screenshot: the row of cards at the top of the Dashboard, with the Will It Last? card at the top right outlined. It reads Runs short.', say: 'Start at the top right. This card answers the question in plain words. Ray and Angie’s says runs short. Yours might say on track, mostly on track, at risk, or runs short. You will see the same words in the corner of every page, so you always know where you stand.' },
      { title: 'What the words mean', alt: 'A table of what each verdict means. On track: the plan holds in good markets and bad. Mostly on track: it usually holds. At risk: it works only if the markets are kind. Runs short: even an average market is not enough.', say: 'On track means the plan holds up in good markets and bad. Mostly on track means it usually does. At risk means it only works if the markets are kind. Runs short means that even in an average market, the money ends before you do.' },
      { title: 'Left is today. Right is the rest of your life.', alt: 'App screenshot: the Dashboard savings chart from 2026 to 2068, with the start of the green line circled at $159,000. An arrow under the chart runs from today on the left to the end of the plan on the right.', say: 'Now the chart. The left edge is today. The right edge is the end of the plan. The height of the green line is how much you have saved. Ray and Angie start at one hundred fifty-nine thousand dollars.' },
      { title: 'The top of the hill', alt: 'App screenshot: the same chart with the highest point of the line circled: $345,812 in 2036, the year before they retire. After that the line goes downhill.', say: 'The line climbs while they work. The highest point is the year before they retire: about three hundred forty-six thousand dollars. From there it goes downhill, because now they are spending it.' },
      { title: 'Where the line touches the floor', alt: 'App screenshot: the same chart with the point where the line reaches zero circled: 2054, when Ray is 82.', say: 'Follow the line down. Where it touches the floor is the year the money runs out. For Ray and Angie that is 2054, when Ray is 82. If your line never touches the floor, your money outlasts your plan.' },
      { title: 'The gray band', alt: 'App screenshot: the same chart with an arrow spanning the gray band behind the line. The band is where savings ended in 8 out of 10 of a thousand simulated futures.', say: 'Notice the gray shape around the line. Nobody knows what the markets will do. The app tries a thousand different futures. The gray band is where savings ended up in eight out of ten of them. A wide band means a lot depends on luck.' },
      { title: 'Read the sentence under the chart', alt: 'App screenshot: the sentence under the chart, which says in words where savings start ($173,000 at the end of this year), where they peak ($346,000 in 2036), and that the plan cannot cover spending from 2054.', say: 'If charts are not your thing, read the sentence underneath. It says the same thing in words: where savings start, where they peak, and whether the plan covers your spending.' },
      { title: 'Find your verdict, your peak, your year', alt: 'Three steps: read the verdict at the top right, find the highest point on the green line, and find the year the line touches the floor, if it does. Below, the link to Ray and Angie’s plan.', say: 'Your turn. Open your own plan, or Ray and Angie’s. Find three things. The verdict. The highest point on the line. And the year the line touches the floor, if it does. If your plan runs short, you are in good company, and the next lesson is for you. We fix Ray and Angie’s plan with three changes. This is education, not financial advice.' },
    ],
  },
  {
    slug: 'my-plan-runs-short',
    video: 'https://www.youtube.com/watch?v=Rfddafcw5M8',
    group: 'basics',
    label: 'Lesson 6',
    title: 'My plan runs short. Now what?',
    description: 'Three ordinary changes, working longer, spending less and saving more, and how many years each one buys for a plan that runs short.',
    summary: 'Three levers that each buy years, and together fix Ray and Angie’s plan.',
    minutes: 5,
    tryHref: '/app/?demo=parkers&tab=scenarios',
    tryLabel: 'Open Ray and Angie’s Scenarios',
    slides: [
      { title: 'My plan runs short. Now what?', alt: 'Title slide: My plan runs short. Now what? Three levers each buy years. Together they fix the plan. With portraits of Ray and Angie.', say: 'Ray and Angie’s money runs out when Ray is 82. Maybe your plan said something like that too. Today we fix theirs, and you will see how to fix yours. As always: this is an educational walkthrough using a fictional family. It isn’t financial advice.' },
      { title: 'Three levers', alt: 'Three levers in numbered columns: 1, work longer, a little more time earning and saving; 2, spend less, a smaller gap to fill every year; 3, save more, more in the account with years left to grow.', say: 'There are three levers. Work a little longer. Spend a little less. Save a little more. That’s the list. We will pull each one for Ray and Angie and see what it does.' },
      { title: 'Work two more years', alt: 'Lever 1: both work until 67, not 65. Three effects: two more years of saving, two fewer years of spending, and bigger Social Security checks for life.', say: 'Lever one. Ray and Angie work two more years, to 67 instead of 65. That does three things at once. Two more years of saving. Two fewer years of spending. And bigger Social Security checks for life.' },
      { title: 'The money lasts eleven years longer', alt: 'Two bars on a timeline from 2040 to 2068. The plan as it stands ends in 2054, when Ray is 82. Working two more years ends in 2065, when Angie is 91: eleven more years.', say: 'Here is the result. Instead of running out when Ray is 82, the money lasts until Angie is 91. Eleven more years. It still falls a little short, but look how far one change moved it.' },
      { title: 'Spend $500 a month less', alt: 'Lever 2: spend $500 a month less, $40,000 a year in retirement, down from $46,000. Examples: one fewer trip a year, a smaller car when the next one is due, eating out a bit less.', say: 'Lever two. Back to the original plan, and this time they spend five hundred dollars a month less in retirement. One fewer trip. A smaller car. Eating out a bit less.' },
      { title: 'The money lasts seven years longer', alt: 'Two bars on a timeline. The plan as it stands ends in 2054, when Ray is 82. Spending $500 a month less ends in 2061, when Ray is 89: seven more years.', say: 'The money now lasts until Ray is 89. Seven more years.' },
      { title: 'Save $500 a month more', alt: 'Lever 3: save $500 a month more into Ray’s account at work, starting now. Ray adds $6,000 a year more, his employer adds $3,000, so $9,000 a year more goes in for eleven years.', say: 'Lever three. Starting now, Ray puts five hundred dollars a month more into his retirement account at work. His employer matches part of it, so more goes in than he gives up.' },
      { title: 'The money lasts seven years longer', alt: 'Two bars on a timeline. The plan as it stands ends in 2054, when Ray is 82. Saving $500 a month more ends in 2061, when Ray is 89: seven more years.', say: 'Again the money lasts until Ray is 89. Seven more years, from eleven years of saving a bit more.' },
      { title: 'All three together: the money lasts', alt: 'Five bars on a timeline from 2040 to 2068. The plan as it stands: 2054. Work two more years: 2065. Spend $500 less: 2061. Save $500 more: 2061. All three together: lasts to the end of the plan.', say: 'None of the three finished the job alone. Now pull all three. Work two more years. Spend five hundred less. Save five hundred more. The money lasts the rest of their lives.' },
      { title: 'The new verdict', alt: 'App screenshot: the saved scenarios list, beside two verdicts. All three together: Mostly on track, holding in 83 of 100 simulated futures. One more move, waiting longer for Social Security: On track, 92 of 100.', say: 'The verdict moves from runs short to mostly on track. That means the plan holds in about four out of five possible futures. To reach on track, there is one more move, about when to start Social Security. That is the first lesson of the next path.' },
      { title: 'No single big sacrifice', alt: 'No single big sacrifice. Not a lottery win, not working until 75: three ordinary changes started early enough. They found out at 54, with eleven years to act.', say: 'Here is the lesson. Ray and Angie did not need to win the lottery or work until 75. They needed three ordinary changes, started early enough. Time is what made them work.' },
      { title: 'Pull one lever in your own plan', alt: 'Three steps: open the Parkers’ Scenarios page and compare each one, open your own plan, and change one thing, such as retiring a year later or spending $100 less. Below, the link to Ray and Angie’s Scenarios page.', say: 'Your turn. Open the Scenarios page for Ray and Angie and look at each saved scenario next to their plan. Then open your own plan and pull one lever. Change your retirement age by one year, or your spending by a hundred dollars a month, and watch your answer move. That is the end of Start Here. You know what a plan is, where the money comes from, what it costs, how to build one, how to read it, and how to fix it. Next: the big decisions. This is education, not financial advice.' },
    ],
  },
  {
    slug: 'three-questions',
    video: 'https://www.youtube.com/watch?v=VyhB2jxfQQw',
    group: 'decisions',
    label: 'Lesson 7',
    eyebrow: 'Big decisions',
    title: 'What do you want your retirement to do?',
    description: 'When a retirement plan can go more than one way, three questions choose: what you want to maximize, what you will not risk, and what you would give up.',
    summary: 'Three questions that choose between plans, and Ray’s and Angie’s different answers.',
    minutes: 3,
    tryHref: '/app/?demo=parkers&tab=scenarios',
    tryLabel: 'Open Ray and Angie’s Scenarios',
    tryNote: 'Ray’s plan and Angie’s plan are saved there with their answers under each name. Nothing you change there is saved, and it does not touch a plan of your own.',
    // The deck is lesson7.html in the business repo's LEARN/decks; every
    // figure is the app's for the two plan scenarios (demoPlanParkers.test.js).
    slides: [
      { title: 'What are you planning for?', alt: 'Title slide: “Will my money last?” leads by an arrow to “It depends on what you’re planning for.” The answer is not a formula; it starts with what matters most to you. With portraits of Ray, 54, and Angie, 52.', say: 'In Lesson 1 we asked one question: will my money last? By now you’ve seen that the answer depends on something only you can decide, which is what you’re actually planning for. As always: this is an educational walkthrough using a fictional family. It isn’t financial advice.' },
      { title: 'What we’ve covered', alt: 'What we’ve covered in the first six lessons: will the money last (lessons 1 to 3: the answer, the gap and what retirement costs); build it and read it (lessons 4 and 5); and three levers (lesson 6: work longer, spend less, save more). Every lever moves something. So which ones should you pull?', say: 'Over the last six lessons, you asked whether the money lasts, found the gap, and saw what retirement costs. You built a plan of your own and learned to read its answer. And in lesson six, three levers fixed Ray and Angie’s plan: work longer, spend less, save more. Every lever moves something. So which ones should you pull?' },
      { title: 'Three questions', alt: 'Three questions in three boxes: 1, maximize, what outcome am I trying to maximize, such as lifestyle, legacy or early retirement; 2, protect, what outcome am I unwilling to risk, such as running out of cash or large medical bills; 3, trade off, what am I willing to give up to protect it, such as working longer or trimming expenses.', say: 'It comes down to three questions. First, what outcome are you trying to maximize? Second, what outcome are you unwilling to risk? And third, what are you willing to give up to protect it? Your answers shape your plan more than any formula.' },
      { title: 'Same household, different answers', alt: 'Ray’s and Angie’s answers side by side. Maximize: Ray, keep spending what we spend now; Angie, leave the house to the kids. Unwilling to risk: Ray, running out in our 80s; Angie, a care bill wiping us out. Willing to give up: Ray, work two more years; Angie, trim travel, not the house.', say: 'Ray and Angie answered separately. Ray wants to keep their lifestyle. Angie wants to leave the house to the kids. Ray’s biggest fear is running out in their eighties. Angie’s is a care bill that wipes them out. And what they’d give up is different too. Ray would work two more years. Angie would trim travel but keep the house.' },
      { title: 'Two scenarios: Ray’s plan and Angie’s plan', alt: 'Two scenario cards. Ray’s plan: priority, the current lifestyle of $46,000 a year; biggest risk, running out of cash in his 80s; lever, both work to 67, with spending kept and $500 a month more saved. Angie’s plan: priority, protect the home and a legacy for the kids; biggest risk, long-term care wiping out savings; lever, trim travel by $750 a month, with Ray still stopping at 65 and $500 a month more saved.', say: 'So they saved each set of answers as its own scenario. Same savings, same house, two plans. In Ray’s plan, they both work two more years and keep spending what they spend now. In Angie’s, they stop on time and spend seven hundred fifty dollars a month less, mostly on travel. Both start saving five hundred dollars a month more, the lever from lesson six. For the first several years the two paths look the same, then they drift apart. That gives them time to decide.' },
      { title: 'Neither plan is wrong', alt: 'Neither plan is wrong: the app doesn’t pick one for you. You decide what matters most and the app shows the cost and the reward. Tradeoffs, not formulas; your household’s values; private on your device.', say: 'Neither plan is wrong. OutlastRetirement shows you the tradeoff each answer makes. It doesn’t pick one for you. This is education, not financial advice.' },
      { title: 'Your turn: three steps for your plan', alt: 'Three steps: open your plan or Ray and Angie’s demo; enter your three answers, what to maximize, what to protect and what to give up; save scenarios and compare two or three side by side. Below, the link to Ray and Angie’s Scenarios page.', say: 'Now it’s your turn. Open your plan. Enter your own three answers in the app. And save it as a scenario, or a few, to compare. Your plan data and calculations stay on your device. Your answers, your plan. This is education, not financial advice.' },
    ],
  },
  {
    slug: 'live-pricing-setup',
    video: 'https://www.youtube.com/watch?v=PfwOs4P3Fqo',
    // Stands alone (2026-10-22): a how-to for a Premium tool, not part
    // of the Learn path, which teaches the free planner first. It has a page
    // but no place on the hub or in the lesson-to-lesson links; the pricing
    // script page links to it.
    standalone: true,
    standing: 'A walkthrough of a Premium tool, recorded in a demo Google account. Addresses are blurred.',
    backHref: '/pricing-script#first-time',
    backLabel: 'The written steps, with pictures',
    label: 'Inside Premium',
    eyebrow: 'Detailed Holdings',
    title: 'Set up Live Pricing',
    description: 'How to connect a free Google Sheet in your own Google account for live stock, ETF, and mutual fund prices and dividends in Detailed Holdings.',
    summary: 'A step-by-step walkthrough to set up private, automated stock prices and dividends with your own free Google Sheet.',
    minutes: 4,
    tryHref: '/app/#/preferences',
    tryLabel: 'Open Preferences in the planner',
    tryNote: 'Paste your Web app address into Live Pricing Connection. The app uses it only to ask your own Sheet for prices; your shares, accounts and amounts stay in your browser.',
    slides: [
      {
        title: 'Set up Live Pricing',
        alt: 'Title slide: Inside Premium, Set up Live Pricing. Five minutes, once.',
        say: 'Detailed Holdings can fill in prices, dividends and yields for you. To do that, it uses a free Google Sheet in your own Google account. Setting it up takes about five minutes, and you only do it once. Let’s walk through it.',
      },
      {
        title: 'What you need',
        alt: 'Three cards: a Google account, Premium Access, and about five minutes, with the privacy reminder.',
        say: 'You need three things: a Google account, and a free one is fine; Premium Access; and about five minutes. One thing first. The only thing the app ever sends to your Sheet is a ticker symbol, like VTI. Your shares, your accounts and your dollar amounts never leave your browser.',
      },
      {
        title: 'Step 1: make your copy',
        alt: 'The pricing-script page button, and Google’s Copy document page with the yellow script note.',
        say: 'Step one. Go to outlastretirement dot com slash pricing script, and press Make your copy of the Sheet. Google asks if you want to make a copy, and tells you the script comes with it. Press Make a copy. The copy is yours alone.',
      },
      {
        title: 'Step 2: open the script and deploy it',
        alt: 'Extensions menu with Apps Script selected; Deploy button with New deployment; Web app selected.',
        say: 'Step two. In your new Sheet, open the Extensions menu and choose Apps Script. The script is already there. Press Deploy, then New deployment. Press the little gear next to Select type, and choose Web app.',
      },
      {
        title: 'Who has access: Anyone',
        alt: 'Web app settings showing Execute as Me and Who has access set to Anyone.',
        say: 'Two settings. Execute as stays on Me. Who has access starts on Only myself. Change it to Anyone. Not Anyone with Google account. Just Anyone. The app asks your Sheet for prices without signing in to Google, so this is the setting it needs. Then press Deploy.',
      },
      {
        title: 'Step 3: allow it',
        alt: 'Google’s permission review screen showing access to spreadsheets, external services, and running when offline.',
        say: 'Step three. Google asks you to allow it. Press Authorize access and pick your account. Google notes the app hasn’t been verified. That’s because it is your own copy, and Google hasn’t reviewed it. It lists three things. Your Sheets: Google only offers this as all your Sheets, but the script only touches its own tab. An external service: that’s the price lookups. Running when you’re not there: that’s the refresh every six hours. Press Allow.',
      },
      {
        title: 'Step 4: copy the Web app address',
        alt: 'Google deployment dialog showing the Web app URL ending in slash exec with the Copy button.',
        say: 'Step four. Google shows your Web app address. It ends in slash exec. Press Copy, then Done.',
      },
      {
        title: 'Step 5: paste it into the app',
        alt: 'OutlastRetirement Preferences page under Live Pricing Connection with the URL pasted into the box.',
        say: 'Step five. Open the app, go to Preferences, and find Live Pricing Connection. Paste the address into Apps Script Web App URL. That’s the connection.',
      },
      {
        title: 'Step 6: refresh',
        alt: 'Detailed Holdings panel before and after pressing Refresh Prices and Dividends, showing live prices and change figures.',
        say: 'Step six. On Detailed Holdings, press Refresh Prices and Dividends. The first time, the app adds your tickers to your Sheet, so give it up to a minute. Then the prices, the day’s change and the values fill in. From now on, your Sheet refreshes itself every six hours.',
      },
      {
        title: 'Keeping it current',
        alt: 'Summary of background refreshes and how to update the script when a new version is released.',
        say: 'That’s it. Two things to know. Your Sheet keeps itself fresh, so there’s nothing to run. And now and then we improve the script. When we do, the app tells you. Copy the new script from the pricing script page, paste it over the old one in Apps Script, and save. Then choose Manage deployments, Edit, and New version. Your address stays the same. The written steps, with pictures, are at outlastretirement dot com slash pricing script.',
      },
    ],
  },
];

export const learnHref = (lesson) => `/learn/${lesson.slug}`;
export const learnHasPage = (lesson) => (Array.isArray(lesson.slides) && lesson.slides.length > 0)
  || (Array.isArray(lesson.text) && lesson.text.length > 0);
