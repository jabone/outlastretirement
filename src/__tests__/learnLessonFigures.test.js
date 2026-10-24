// Every exact figure the Learn lessons quote from the app for the Parkers.
//
// The lessons (config/learnLessons.js) show screenshots of Ray and Angie's
// plan and read its numbers aloud: the $159,000 they start with, the peak of
// $345,812 in 2036, the 2037 ledger row, the monthly Social Security checks.
// demoPlanParkers.test.js pins the story's milestones (which year the money
// runs out, which scenarios last); this file pins the DOLLAR FIGURES the
// narration quotes, so an engine or tax-year change that moves one fails
// here naming the lesson and slide, instead of leaving a published lesson
// quoting a number the app no longer shows.
//
// Each pin does two things:
//   1. asserts the quoted string is still on that slide (so a lesson edit
//      that reworks the wording retires its pin in the same change), and
//   2. recomputes the figure from runProjection and asserts it still rounds
//      to the quoted number the way the narration rounded it (to the dollar
//      for ledger rows, to the nearest hundred or thousand where the slide
//      says "about").
//
// The app's ledger and charts show today's dollars: flows divide by the
// row's own price level (row.inflFactor), end-of-year balances by the NEXT
// year's (utils/displayDollars.js, END_OF_YEAR_BALANCES). The pins convert
// the same way, so they match what a reader of the lesson sees on screen.
import { describe, it, expect } from 'vitest';
import { runProjection, runMonteCarlo, TAX_YEAR } from '../calculator';
import { firstShortfallRow, verdictPct } from '../utils/planVerdict';
import { yearEndFactor } from '../utils/displayDollars';
import { buildParkersInputs, PARKERS_SCENARIO_DEFS } from '../config/demoPlanParkers';
import { LEARN_LESSONS } from '../config/learnLessons';

const plan = buildParkersInputs();
const scenario = (name) => PARKERS_SCENARIO_DEFS.find((d) => d.name === name).mutate(plan);

const proj = runProjection(plan);
const years = proj.years;
const row = (year) => years.find((y) => y.year === year);
// A flow from one year, in today's dollars, as the ledger prints it.
const real = (year, field) => row(year)[field] / row(year).inflFactor;
// An end-of-year balance in today's dollars, as the Dashboard chart plots it.
const realEndingBalance = (year) => {
  const i = years.findIndex((y) => y.year === year);
  return years[i].totalPortfolioEnding / yearEndFactor(years, i);
};
// The year the Dashboard chart's green line is highest, in today's dollars.
const peakYear = years.reduce((best, y) => (realEndingBalance(y.year) > realEndingBalance(best) ? y.year : best), years[0].year);

// The narration's roundings: to the dollar for a ledger figure, to the
// nearest hundred for "about $19,400", to the nearest thousand for
// "$346,000". A quoted figure holds when it is within half a step of the
// engine value — the lesson may round an exact midpoint either way (Angie's
// $12,750-a-year check is written $12,700 so the two checks still add up to
// the rounded $34,400 total).
const toNearest = (v, step) => Math.round(v / step) * step;

const lessonSlide = (slug, n) => {
  const lesson = LEARN_LESSONS.find((l) => l.slug === slug);
  const s = lesson.slides[n - 1];
  return { s, where: `${slug} slide ${n} ("${s.title}")`, text: `${s.title}\n${s.alt}\n${s.say}` };
};

// One pin: the quoted text is still on the slide, and the engine value
// rounds to the number inside it. `quoted` is copied verbatim from the
// lesson, commas and all ("In: $34,417", "empty at 82", "83 of 100"). The
// first number in the quote is the one pinned; pass pick = 'last' when the
// figure sits at the end ("Spend $500 less: 2061").
const pin = (slug, n, quoted, engineValue, step = 1, pick = 'first') => {
  const { where, text } = lessonSlide(slug, n);
  expect(text, `${where} no longer says "${quoted}" — if the slide was reworded, retire this pin`).toContain(quoted);
  const numbers = quoted.match(/\d[\d,]*(\.\d+)?/g);
  const number = Number(numbers[pick === 'last' ? numbers.length - 1 : 0].replace(/,/g, ''));
  const off = Math.abs(engineValue - number);
  expect(off <= step / 2 + 1e-9, `${where} quotes "${quoted}" but the engine now gives ${engineValue} (${toNearest(engineValue, step)} at this rounding) — update the lesson (and its picture) or re-tune demoPlanParkers.js`).toBe(true);
};
// A figure the narration spells out in words instead of digits: assert the
// phrase, with the matching arithmetic asserted beside the call.
const says = (slug, n, phrase) => {
  const { where, s } = lessonSlide(slug, n);
  expect(s.say, `${where} narration no longer spells out "${phrase}"`).toContain(phrase);
};

// The years the lessons point at: the year both retire (Ray turns 65) and
// the year the plan runs short, derived once so the pins read as prose.
const yearRayIs = (age) => plan.birthYear1 + age;
const retirementYear = yearRayIs(plan.retireAge1); // 2037
const shortfall = firstShortfallRow(years);

describe('the figures the lessons quote are the ones the app shows', () => {
  it('the household the lessons describe is the fixture (lesson 1, slides 3-4)', () => {
    // Ray, 54, $62,000; Angie, 52, $38,000; $150,000 at work plus $9,000 in
    // the bank is $159,000. These are inputs, so a fixture re-tune that
    // changes one must re-record the slide that reads it out.
    pin('will-my-money-last', 3, 'Ray, 54', TAX_YEAR - plan.birthYear1);
    pin('will-my-money-last', 3, '$62,000', plan.salary1);
    pin('will-my-money-last', 3, 'Angie, 52', TAX_YEAR - plan.birthYear2);
    pin('will-my-money-last', 3, '$38,000', plan.salary2);
    pin('will-my-money-last', 4, '$150,000', plan.preTaxInit);
    pin('will-my-money-last', 4, '$9,000', plan.taxableInit);
    pin('will-my-money-last', 4, '$159,000', plan.preTaxInit + plan.rothInit + plan.taxableInit + plan.hsaInit);
    says('will-my-money-last', 4, 'one hundred fifty-nine thousand dollars');
  });

  it('the monthly contributions on the growth slide (lesson 1 slide 6; lesson 3 slide 3)', () => {
    const first = years[0];
    expect(first.year).toBe(TAX_YEAR);
    // "$433 a month" of their own pay and "$154 a month" from Ray's employer.
    const own = first.preTaxContribution1 + first.preTaxContribution2;
    pin('will-my-money-last', 6, '$433 a month', own / 12);
    pin('will-my-money-last', 6, '$154 a month', first.employerMatchAmount / 12);
    pin('what-will-retirement-cost-me', 3, '$433 a month', own / 12);
    pin('what-will-retirement-cost-me', 3, '$914 a month', first.currentSpending.debtPayments / 12);
  });

  it('the savings curve: $159,000 up to about $346,000 at 64, empty at 82 (lessons 1 and 5)', () => {
    // The chart's highest point must still be the year before they retire
    // (2036, Ray 64), or lesson 1 slide 8 and lesson 5 slide 6 point their
    // circle at the wrong year.
    expect(peakYear, 'the peak moved off the year before retirement').toBe(retirementYear - 1);
    expect(row(peakYear).age1).toBe(64);

    pin('will-my-money-last', 6, '$159,000 to $346,000', plan.preTaxInit + plan.rothInit + plan.taxableInit + plan.hsaInit);
    pin('will-my-money-last', 6, '$346,000', realEndingBalance(peakYear), 1000);
    pin('will-my-money-last', 8, 'highest at 64', row(peakYear).age1);
    pin('will-my-money-last', 8, 'about $346,000', realEndingBalance(peakYear), 1000);
    says('will-my-money-last', 8, 'about three hundred forty-six thousand dollars');
    pin('will-my-money-last', 8, 'empty at 82', shortfall.age1);

    // Lesson 5 reads the same chart more closely: the left edge, the exact
    // peak the circle points at, the sentence under the chart, and the year
    // the line touches the floor.
    pin('how-do-i-read-my-answer', 5, '$159,000', plan.preTaxInit + plan.rothInit + plan.taxableInit + plan.hsaInit);
    says('how-do-i-read-my-answer', 5, 'one hundred fifty-nine thousand dollars');
    pin('how-do-i-read-my-answer', 6, '$345,812 in 2036', realEndingBalance(peakYear));
    expect(peakYear).toBe(2036);
    says('how-do-i-read-my-answer', 6, 'about three hundred forty-six thousand dollars');
    pin('how-do-i-read-my-answer', 7, '2054, when Ray is 82', shortfall.year);
    expect(shortfall.age1).toBe(82);
    pin('how-do-i-read-my-answer', 9, '$173,000 at the end of this year', realEndingBalance(TAX_YEAR), 1000);
    pin('how-do-i-read-my-answer', 9, '$346,000 in 2036', realEndingBalance(peakYear), 1000);
    pin('how-do-i-read-my-answer', 9, '2054', shortfall.year);
  });

  it('the site tour reads the same chart: 2026 to 2068, peak 2036, zero 2054', () => {
    pin('site-tour', 4, 'from 2026 to 2068', years[0].year);
    pin('site-tour', 4, '2068', years[years.length - 1].year);
    pin('site-tour', 4, 'a peak in 2036', peakYear);
    pin('site-tour', 4, 'zero in 2054', shortfall.year);
    says('site-tour', 4, 'runs short in 2054');
    pin('site-tour', 6, 'from 2026', years[0].year);
  });

  it('the Social Security checks, as the first retirement year pays them (lesson 2 slide 4)', () => {
    // Both claim the year the paychecks stop (2037). The slide quotes each
    // check in today's dollars: yearly to the nearest hundred, monthly to
    // the nearest ten.
    const r = row(retirementYear);
    expect(r.age1).toBe(65);
    expect(r.age2).toBe(63);
    const ray = real(retirementYear, 'ssOwn1');
    const angie = real(retirementYear, 'ssIncome') - ray;
    pin('who-pays-me-when-i-stop-working', 4, 'Ray starts at 65', plan.claimingAge1);
    pin('who-pays-me-when-i-stop-working', 4, '$21,700 a year', ray, 100);
    pin('who-pays-me-when-i-stop-working', 4, '$1,810 a month', ray / 12, 10);
    pin('who-pays-me-when-i-stop-working', 4, 'Angie starts at 63', plan.claimingAge2);
    pin('who-pays-me-when-i-stop-working', 4, '$12,700 a year', angie, 100);
    pin('who-pays-me-when-i-stop-working', 4, '$1,060 a month', angie / 12, 10);
    pin('who-pays-me-when-i-stop-working', 4, '$34,400 a year', ray + angie, 100);
    pin('who-pays-me-when-i-stop-working', 4, '$2,870 a month', (ray + angie) / 12, 10);
    says('who-pays-me-when-i-stop-working', 4, 'thirty-four thousand four hundred dollars a year');
    // "about twenty-nine hundred dollars a month": $2,868 to the nearest hundred.
    says('who-pays-me-when-i-stop-working', 4, 'twenty-nine hundred dollars a month');
    expect(toNearest((ray + angie) / 12, 100)).toBe(2900);
  });

  it('the first retirement year: what they need, its parts, and the gap (lesson 2 slides 5-7)', () => {
    // $68,100 = $46,800 living costs + $19,400 health care + $1,900
    // mortgage (each to the nearest hundred, in today's dollars). The
    // health bar is the ACA bridge plus Medicare premiums; income tax that
    // year is a few dollars and is left off the bar.
    const need = real(retirementYear, 'totalExpenses');
    const living = real(retirementYear, 'lifestyleExpenses');
    const health = real(retirementYear, 'healthcareBridge') + real(retirementYear, 'irmaaCost');
    const mortgage = real(retirementYear, 'mortgagePaymentThisYear');
    pin('who-pays-me-when-i-stop-working', 5, '$68,100', need, 100);
    pin('who-pays-me-when-i-stop-working', 5, '$46,800 living costs', living, 100);
    pin('who-pays-me-when-i-stop-working', 5, '$19,400 health care', health, 100);
    pin('who-pays-me-when-i-stop-working', 5, '$1,900 mortgage', mortgage, 100);
    says('who-pays-me-when-i-stop-working', 5, 'sixty-eight thousand dollars');

    // The gap: need minus Social Security, filled from savings.
    pin('who-pays-me-when-i-stop-working', 6, 'need $68,100', need, 100);
    pin('who-pays-me-when-i-stop-working', 6, 'pays $34,400', real(retirementYear, 'ssIncome'), 100);
    pin('who-pays-me-when-i-stop-working', 6, 'the gap: $33,700', real(retirementYear, 'drawdown'), 100);

    // Two years on, Angie reaches Medicare (Ray is 67) and the need falls
    // to about $55,000.
    const rayIs67 = yearRayIs(67);
    expect(row(rayIs67).healthcareBridge, 'the ACA bridge should end when Angie reaches Medicare').toBe(0);
    pin('who-pays-me-when-i-stop-working', 7, 'from $68,100', need, 100);
    pin('who-pays-me-when-i-stop-working', 7, 'about $55,000 at 67', real(rayIs67, 'totalExpenses'), 1000);
  });

  it('the 2037 ledger row, to the dollar (lesson 2 slide 8)', () => {
    // The screenshot highlights the year Ray is 65. In is Social Security,
    // Out is everything spent including tax, From savings is the draw; all
    // in today's dollars, rounded to the dollar as the ledger prints them.
    expect(retirementYear).toBe(2037);
    pin('who-pays-me-when-i-stop-working', 8, 'the 2037 row', retirementYear);
    pin('who-pays-me-when-i-stop-working', 8, 'the year Ray is 65', row(retirementYear).age1);
    pin('who-pays-me-when-i-stop-working', 8, 'In: $34,417', real(retirementYear, 'ssIncome'));
    pin('who-pays-me-when-i-stop-working', 8, 'Out: $68,128', real(retirementYear, 'totalExpenses'));
    pin('who-pays-me-when-i-stop-working', 8, 'From savings: $33,711', real(retirementYear, 'drawdown'));
  });

  it('what they spend today, from the shortcut (lesson 3 slides 2 and 5)', () => {
    // Pay minus taxes minus savings is what they spent: the engine's own
    // auto-spending derivation for the first year.
    const spending = years[0].currentSpending;
    pin('what-will-retirement-cost-me', 2, 'pay $100,000', spending.income);
    pin('what-will-retirement-cost-me', 2, 'taxes $14,700', spending.taxes, 100);
    pin('what-will-retirement-cost-me', 2, 'savings $5,200', spending.contributions);
    pin('what-will-retirement-cost-me', 2, '$80,100 spent', spending.derived, 100);
    pin('what-will-retirement-cost-me', 2, '$6,678 a month', spending.derived / 12);
    pin('what-will-retirement-cost-me', 2, '$914 mortgage', spending.debtPayments / 12);
    says('what-will-retirement-cost-me', 2, 'sixty-seven hundred dollars a month');
    expect(toNearest(spending.derived / 12, 100)).toBe(6700);

    // Slide 5: today's spending outside the mortgage, and the retirement budget.
    pin('what-will-retirement-cost-me', 5, '$46,000 a year', plan.lifestyleExpense);
    pin('what-will-retirement-cost-me', 5, '$5,764 a month', (spending.derived - spending.debtPayments) / 12);
    pin('what-will-retirement-cost-me', 5, '$3,833 a month', plan.lifestyleExpense / 12);
  });

  it('the one cost that grows: health cover until Medicare (lesson 3 slide 4)', () => {
    // Angie buys her own coverage at 63 and 64 (the first two retirement
    // years); the slide quotes the first year's cost in today's dollars.
    pin('what-will-retirement-cost-me', 4, '$15,600 a year', real(retirementYear, 'healthcareBridge'), 100);
    says('what-will-retirement-cost-me', 4, 'fifteen thousand six hundred dollars a year');
    expect(row(retirementYear).healthcareBridge).toBeGreaterThan(0);
    expect(row(retirementYear + 1).healthcareBridge).toBeGreaterThan(0);
    expect(row(retirementYear + 2).healthcareBridge).toBe(0);
  });

  it('inflation: $46,000 of living costs $60,400 by the retirement year (lesson 3 slide 6)', () => {
    const factor = row(retirementYear).inflFactor;
    const yearsOut = retirementYear - TAX_YEAR;
    expect(yearsOut, 'the "eleven years" on slide 6').toBe(11);
    pin('what-will-retirement-cost-me', 6, '2.5% a year', (factor ** (1 / yearsOut) - 1) * 100, 0.1);
    pin('what-will-retirement-cost-me', 6, '$60,400', plan.lifestyleExpense * factor, 100);
    pin('what-will-retirement-cost-me', 6, '31% more in eleven years', (factor - 1) * 100);
    // "about sixty thousand by the time Ray retires" in the narration.
    says('what-will-retirement-cost-me', 6, 'about sixty thousand');
    expect(toNearest(plan.lifestyleExpense * factor, 1000)).toBe(60000);
  });

  it('what spending does to the run-out age (lesson 3 slides 7-8)', () => {
    // $52,000 a year empties at 77; the plan's $46,000 at 82; $43,000 at 85.
    const emptyAt = (lifestyleExpense) => firstShortfallRow(runProjection({ ...plan, lifestyleExpense }).years).age1;
    pin('what-will-retirement-cost-me', 7, 'from $46,000 to $52,000', plan.lifestyleExpense);
    pin('what-will-retirement-cost-me', 7, 'empty at 77, not 82', emptyAt(52000));
    expect(shortfall.age1).toBe(82);
    pin('what-will-retirement-cost-me', 8, '$52,000 a year: empty at 77', 52000);
    expect(emptyAt(52000)).toBe(77);
    pin('what-will-retirement-cost-me', 8, '$46,000 a year: empty at 82', plan.lifestyleExpense);
    expect(emptyAt(plan.lifestyleExpense)).toBe(82);
    pin('what-will-retirement-cost-me', 8, '$43,000 a year: empty at 85', 43000);
    expect(emptyAt(43000)).toBe(85);
    // The narration calls the $3,000-a-year trim "two hundred fifty dollars
    // less each month" and gives it the 85.
    says('what-will-retirement-cost-me', 8, 'two hundred fifty dollars less');
    expect((plan.lifestyleExpense - 43000) / 12).toBe(250);
    says('what-will-retirement-cost-me', 8, 'lasts until 85');
  });

  it('the three levers, each dated (lesson 6 slides 1, 4, 6, 8 and 9)', () => {
    const shortRow = (name) => firstShortfallRow(runProjection(scenario(name)).years);
    const planEnds = shortfall.year; // 2054, Ray 82
    pin('my-plan-runs-short', 1, 'runs out when Ray is 82', shortfall.age1);
    pin('my-plan-runs-short', 4, 'ends in 2054, when Ray is 82', planEnds);

    const workTwoMore = shortRow('Demo: Work two more years');
    pin('my-plan-runs-short', 4, 'ends in 2065, when Angie is 91', workTwoMore.year);
    expect(workTwoMore.age2).toBe(91);
    const { text: slide4 } = lessonSlide('my-plan-runs-short', 4);
    expect(slide4).toContain('eleven more years');
    expect(workTwoMore.year - planEnds, 'slide 4 says "eleven more years"').toBe(11);

    const spendLess = shortRow('Demo: Spend $500 a month less in retirement');
    pin('my-plan-runs-short', 5, '$40,000 a year in retirement, down from $46,000', scenario('Demo: Spend $500 a month less in retirement').lifestyleExpense);
    pin('my-plan-runs-short', 6, 'ends in 2061, when Ray is 89', spendLess.year);
    expect(spendLess.age1).toBe(89);
    expect(lessonSlide('my-plan-runs-short', 6).text).toContain('seven more years');
    expect(spendLess.year - planEnds, 'slide 6 says "seven more years"').toBe(7);

    const saveMore = shortRow('Demo: Save $500 a month more');
    pin('my-plan-runs-short', 8, 'ends in 2061, when Ray is 89', saveMore.year);
    expect(saveMore.age1).toBe(89);
    expect(lessonSlide('my-plan-runs-short', 8).text).toContain('seven more years');
    expect(saveMore.year - planEnds, 'slide 8 says "seven more years"').toBe(7);

    // The five-bar summary names all four dates again.
    pin('my-plan-runs-short', 9, 'The plan as it stands: 2054', planEnds);
    pin('my-plan-runs-short', 9, 'Work two more years: 2065', workTwoMore.year);
    pin('my-plan-runs-short', 9, 'Spend $500 less: 2061', spendLess.year, 1, 'last');
    pin('my-plan-runs-short', 9, 'Save $500 more: 2061', saveMore.year, 1, 'last');
  });

  it('what saving $500 more a month puts in (lesson 6 slide 7)', () => {
    // Ray adds $6,000 a year; the employer match (half of what he puts in)
    // adds $3,000 more; so $9,000 a year more goes in, for the eleven
    // working years left.
    const first = runProjection(scenario('Demo: Save $500 a month more')).years[0];
    const extraOwn = first.preTaxContribution1 - years[0].preTaxContribution1;
    const extraMatch = first.employerMatchAmount - years[0].employerMatchAmount;
    pin('my-plan-runs-short', 7, '$6,000 a year more', extraOwn);
    pin('my-plan-runs-short', 7, 'his employer adds $3,000', extraMatch);
    pin('my-plan-runs-short', 7, '$9,000 a year more goes in for eleven years', extraOwn + extraMatch);
    const contributingYears = years.filter((y) => y.preTaxContribution1 > 0).length;
    expect(contributingYears, 'the "for eleven years" on slide 7').toBe(11);
  });

  it('the two verdicts: 83 of 100 and 92 of 100 simulated futures (lesson 6 slide 10)', () => {
    // The Monte Carlo is seeded, so the same plan gives the same 1,000
    // futures every run; the slide quotes the whole-percent rate the
    // verdict prints (utils/planVerdict.js).
    const allThree = verdictPct(runMonteCarlo(scenario('Demo: All three changes together')).successProbability);
    const waitSS = verdictPct(runMonteCarlo(scenario('Demo: All three, and wait longer for Social Security')).successProbability);
    pin('my-plan-runs-short', 10, '83 of 100', allThree);
    pin('my-plan-runs-short', 10, '92 of 100', waitSS);
    // "about four out of five possible futures" in the narration.
    says('my-plan-runs-short', 10, 'four out of five');
    expect(Math.round(allThree / 20)).toBe(4);
  });

  it("lesson 7's two plans quote their own levers (slide 5)", () => {
    // Ray keeps the $46,000 lifestyle; Angie trims $750 a month; both save
    // $500 a month more. The scenario definitions are the slide's source.
    const ray = scenario("Demo: Ray's plan: keep spending, work to 67");
    const angie = scenario("Demo: Angie's plan: protect the house, trim travel");
    pin('three-questions', 5, '$46,000 a year', ray.lifestyleExpense);
    pin('three-questions', 5, 'both work to 67', ray.retireAge1);
    pin('three-questions', 5, '$750 a month', (plan.lifestyleExpense - angie.lifestyleExpense) / 12);
    pin('three-questions', 5, '$500 a month more saved', (ray.preTaxContribution1 - plan.preTaxContribution1) / 12);
    expect(angie.preTaxContribution1 - plan.preTaxContribution1).toBe(6000);
    says('three-questions', 5, 'seven hundred fifty dollars a month less');
    says('three-questions', 5, 'five hundred dollars a month more');
  });

  it('the plan retires at 65 on $46,000, with the mortgage done that year (lessons 1 and 3)', () => {
    pin('will-my-money-last', 7, 'working until 65', plan.retireAge1);
    pin('will-my-money-last', 7, '$46,000 a year', plan.lifestyleExpense);
    says('will-my-money-last', 7, 'forty-six thousand dollars a year');
    // "the mortgage is paid off the same year they stop working" (lesson 3
    // slide 3): a payment still falls in the retirement year, and the
    // balance ends it at zero.
    says('what-will-retirement-cost-me', 3, 'the mortgage is paid off the same year they stop working');
    expect(row(retirementYear).mortgagePaymentThisYear).toBeGreaterThan(0);
    expect(row(retirementYear).mortgageBalance).toBe(0);
    expect(row(retirementYear - 1).mortgageBalance).toBeGreaterThan(0);
  });
});
