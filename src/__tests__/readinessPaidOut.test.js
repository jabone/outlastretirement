// U12: the first-years headline said "$19,787 a month to live on" beside a
// Dashboard lifestyle of $8,000 a month, and "$4,126 arrives on its own, the
// rest from one transfer of $341,946" did not add up to it either. The total
// is everything the year pays out (tax, health cover and one-time events
// included), and it is now shown as parts that add up.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection } from '../calculator';
import { buildDemoInputs } from '../config/demoPlan';
import {
  firstYearsPlan, paidOutFigures, paidOutBreakdown, joinParts,
  PAID_OUT_PARTS, PAYCHECK_AUTOMATIC, PAYCHECK_TRANSFER, FUNDING_SOURCES,
} from '../utils/retirementReadiness';
import { readinessSummary } from '../utils/readinessSummary';
import { deflateProjectionForDisplay, ROW_FIELD_CLASS } from '../utils/displayDollars';

const plan = (over) => {
  for (const k of Object.keys(over)) if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  return { ...DEFAULT_INPUTS, ...over };
};
const demo = { ...DEFAULT_INPUTS, ...buildDemoInputs() };
const PLANS = {
  demo,
  demoDividendsAsCash: { ...demo, dividendPayoutMode: 'cash' },
  defaults: DEFAULT_INPUTS,
  withReserve: plan({ cashFloorEnabled: true, cashFloorInit: 150000 }),
};
// Today's dollars the way the app converts rows (utils/displayDollars.js;
// App.jsx's hand-kept DOLLAR_FIELDS list was replaced by it).
const real = (proj) => deflateProjectionForDisplay(proj, true);
const converted = (k) => ROW_FIELD_CLASS[k] === 'year' || ROW_FIELD_CLASS[k] === 'yearEnd';
const fmt = (v) => '$' + Math.round(v).toLocaleString('en-US');
const dollars = (s) => Number(s.replace(/[$,]/g, ''));

describe('the first years pay out exactly what arrives and is moved, in parts that add up', () => {
  for (const [name, inputs] of Object.entries(PLANS)) {
    for (const inReal of [false, true]) {
      it(`${name}, ${inReal ? "today's" : 'future'} dollars`, () => {
        const raw = runProjection(inputs);
        const fy = firstYearsPlan(inReal ? real(raw) : raw);
        let checked = 0;
        for (const r of fy.rows) {
          const f = paidOutFigures(r);
          expect(f.parts.reduce((t, p) => t + p.amount, 0)).toBe(f.paidOut);
          expect(f.arrives + f.fromPortfolio - f.toReserve).toBe(f.paidOut);
          // No unexplained remainder on any of these plans.
          expect(f.parts.find((p) => p.id === 'other')).toBeUndefined();
          // The living-costs part is the plan's own lifestyle line.
          const row = (inReal ? real(raw) : raw).years.find((y) => y.year === r.year);
          expect(f.parts.find((p) => p.id === 'living').amount).toBeCloseTo(row.lifestyleExpenses, -1);
          checked++;
        }
        expect(checked).toBe(5);
      });
    }
  }

  it('the printed sentence adds up too', () => {
    const line = readinessSummary(demo, real(runProjection(demo)), { formatCurrency: fmt }).find((l) => l.id === 'paycheck').answer;
    const m = line.match(/pays out (\$[\d,]+), about \$[\d,]+ a month: (.*?)\. (\$[\d,]+) arrives on its own and one transfer of (\$[\d,]+) comes out of the portfolio.*?(?:, (\$[\d,]+) of it into the cash reserve)?;/);
    expect(m, line).not.toBeNull();
    const total = dollars(m[1]);
    const parts = [...m[2].matchAll(/\$[\d,]+/g)].map((x) => dollars(x[0]));
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.reduce((t, v) => t + v, 0)).toBe(total);
    expect(dollars(m[3]) + dollars(m[4]) - (m[5] ? dollars(m[5]) : 0)).toBe(total);
  });

  it('rounding is given to the largest part, never lost', () => {
    const b = paidOutBreakdown({ lifestyleExpenses: 1000.4, totalTaxesPaid: 200.4, healthcareBridge: 0.4 }, 1201.2);
    expect(b.total).toBe(1201);
    expect(b.parts.reduce((t, p) => t + p.amount, 0)).toBe(1201);
    expect(joinParts(b.parts, fmt)).toBe('$1,001 for living costs and $200 in tax');
  });

  it('every field it reads is converted to today’s dollars with the rest', () => {
    const reads = [
      ...PAID_OUT_PARTS.flatMap((p) => [...p.keys, ...(p.less || [])]),
      ...PAYCHECK_AUTOMATIC, ...PAYCHECK_TRANSFER, ...FUNDING_SOURCES.map((s) => s.key),
      'cashReserveReplenish', 'salary',
    ];
    expect(reads.filter((k) => !converted(k))).toEqual([]);
  });
});
