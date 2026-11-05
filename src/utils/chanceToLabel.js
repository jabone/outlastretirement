// The age a risk-based chance of lasting runs to (What's New 495), for
// the settings box, the printed report and Year by Year.
// " until age 95", or for a couple " until Pat is 95"; '' when unknown.
export function chanceToLabel(snapOrRow, inputs) {
  const age = snapOrRow?.toAge ?? snapOrRow?.riskGuardrailToAge;
  if (!Number.isFinite(age)) return '';
  if (!inputs?.spouse2Enabled) return ` until age ${age}`;
  const n = (snapOrRow.toWhom ?? snapOrRow.riskGuardrailToWhom) === 2 ? 2 : 1;
  const name = (n === 2 ? inputs.spouse2Name : inputs.spouse1Name) || `Spouse ${n}`;
  return ` until ${name} is ${age}`;
}

