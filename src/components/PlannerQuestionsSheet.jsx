import React from 'react';

// "What a planner will also ask for" (changelog 298). The plan covers the
// numbers; a planner's intake asks for documents and facts the app does
// not hold. Listing them next to what IS in the packet lets someone walk
// into the meeting knowing what to bring rather than finding out there.
const PLANNER_ASKS = [
  { topic: 'Your accounts', inPlan: 'The account summary: balances by tax type, other assets and debts, and holdings combined by fund or stock, with no account names or numbers.', bring: 'Usually nothing more. Statements only if the planner asks, for example to check fees or cost basis.' },
  { topic: 'Employer plans', inPlan: 'Contributions, employer match, stock grants and deferred compensation as entered.', bring: 'The plan summaries: vesting, in-plan Roth conversion, loan and withdrawal rules, the fund menu and its costs.' },
  { topic: 'Pensions and Social Security', inPlan: 'Your estimate at full retirement age and the ages you plan to claim; any pension or annuity entered.', bring: 'Your Social Security statements (ssa.gov/myaccount) and any pension benefit estimate and survivor options.' },
  { topic: 'Taxes', inPlan: 'Filing status, state, and the tax the plan estimates year by year.', bring: 'Your last two tax returns, and any capital-loss carryforward.' },
  { topic: 'Insurance', inPlan: 'Health coverage before 65, long-term care if switched on, and life insurance if entered.', bring: 'Policy details: life, disability, long-term care, umbrella; premiums, benefits and beneficiaries.' },
  { topic: 'Beneficiaries and estate', inPlan: 'Who inherits and in what shares, as modeled.', bring: 'The beneficiary designation on each account (they override a will), and your will, trusts and powers of attorney.' },
  { topic: 'Debts and the house', inPlan: 'Mortgage and other debt payments and payoff; the home if entered.', bring: 'The mortgage statement (rate, balance, payoff date) and any home-equity line.' },
  { topic: 'Spending', inPlan: 'The retirement budget by category (see the spending review page).', bring: 'Nothing more, if both of you have checked the spending review.' },
  { topic: 'Goals and worries', inPlan: 'Life events, gifting and legacy goals as entered.', bring: 'What matters most to each of you, in your own words. The What Will You Do? page is a good start.' },
];

export default function PlannerQuestionsSheet() {
  return (
    <div className="packet-page" data-testid="planner-questions-sheet">
      <h1>What a planner will also ask for</h1>
      <p className="review-lede">
        This packet holds the plan&rsquo;s numbers. A planner&rsquo;s intake usually asks for documents too. Tick what
        you have ready.
      </p>
      <table className="packet-table">
        <thead><tr><th className="review-check">Ready</th><th>Topic</th><th>In this packet</th><th>Bring separately</th></tr></thead>
        <tbody>
          {PLANNER_ASKS.map((a) => (
            <tr key={a.topic}>
              <td className="review-check"><span className="review-box" aria-hidden="true" /></td>
              <td><strong>{a.topic}</strong></td><td>{a.inPlan}</td><td>{a.bring}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
