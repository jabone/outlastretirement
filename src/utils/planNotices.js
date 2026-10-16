// Plain-English text for the two kinds of notice runProjection returns
// alongside the rows:
//   result.warnings       [{ code, message }]: the plan ran as entered, but
//                         something in it probably isn't what was meant
//                         (a debt payment below its interest, a lump-sum
//                         pension whose start age has already passed).
//   result.invalidInputs  [{ key, value, reason, usedValue }]: an input the
//                         plan could not run as entered, so it used another
//                         value (Spouse 1's life expectancy below today's age).
// Dashboard > Plan Feedback shows the warnings; a plan with invalid inputs
// gets one "Check these inputs" card in place of the Readiness answers.

const WARNING_TEXT = {
  'mortgage-payment-below-interest': {
    title: 'Mortgage balance grows every year',
    desc: 'Your mortgage payment doesn’t cover the interest, so the balance grows every year. Check that it’s a yearly amount.',
    action: { tab: 'settings', subTab: 'balances', label: 'Open Balances & Debt →' },
  },
  'debt-payment-below-interest': {
    title: 'Other debt balance grows every year',
    desc: 'Your other debt payment doesn’t cover the interest, so the balance grows every year. Check that it’s a yearly amount.',
    action: { tab: 'settings', subTab: 'balances', label: 'Open Balances & Debt →' },
  },
};

function pensionLumpSumText(n, inputs) {
  const who = n === 2 ? (inputs?.spouse2Name || 'Spouse 2') : (inputs?.spouse1Name || 'Spouse 1');
  return {
    title: 'Lump-sum pension already paid',
    desc: `${who}’s lump-sum pension starts at an age before this plan’s first year, so the plan counts it as already received and doesn’t pay it again. If it hasn’t arrived yet, check the start age.`,
    action: { tab: 'settings', subTab: 'income', label: 'Open Income →' },
  };
}

// Plan Feedback cards (the shape getPlanFeedback returns) for a projection's
// warnings. Unknown codes fall back to the engine's own message.
export function planWarningFeedback(projection, inputs) {
  const warnings = Array.isArray(projection?.warnings) ? projection.warnings : [];
  return warnings.map((w) => {
    const lump = /^pension([12])-lump-sum-already-paid$/.exec(w.code || '');
    const text = lump ? pensionLumpSumText(Number(lump[1]), inputs) : WARNING_TEXT[w.code];
    return {
      type: 'warning',
      code: w.code,
      title: text ? text.title : 'Check this input',
      desc: text ? text.desc : w.message,
      ...(text && text.action ? { action: text.action } : {}),
    };
  });
}

const INPUT_LABEL = {
  lifeExpectancy1: (inputs) => `${inputs?.spouse1Name || 'Spouse 1'}’s life expectancy`,
  lifeExpectancy2: (inputs) => `${inputs?.spouse2Name || 'Spouse 2'}’s life expectancy`,
};

// One sentence per invalid input.
export function invalidInputLines(projection, inputs) {
  const list = Array.isArray(projection?.invalidInputs) ? projection.invalidInputs : [];
  return list.map((item) => {
    const label = INPUT_LABEL[item.key] ? INPUT_LABEL[item.key](inputs) : item.key;
    if (item.reason === 'below-current-age') {
      return `${label} (${item.value}) is below today’s age (${item.usedValue}), so the plan ran with ${item.usedValue}: a plan that ends this year.`;
    }
    return `${label} (${item.value}) could not be used as entered, so the plan ran with ${item.usedValue}.`;
  });
}

export const CHECK_INPUTS_TITLE = 'Check these inputs';
