// "67" or "67, starting in May": a claiming age with its optional start
// month (changelog 464), for sentences that state when a benefit starts.
export const CLAIM_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function claimAgeLabel(age, month) {
  const m = Number(month) || 0;
  return m > 0 && m < 12 ? `${age}, starting in ${CLAIM_MONTH_NAMES[m]}` : `${age}`;
}
