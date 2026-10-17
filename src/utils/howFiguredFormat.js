// Small helpers for Help -> How the numbers are figured, kept out of the
// component file so it exports only a component (fast refresh).
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "2026-09-30" -> "September 30, 2026", without a Date (no time zone drift).
export function checkedOn(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

// The DOM id of a rule's card, which "How is this figured?" links scroll to.
export const ruleAnchorId = (id) => `how-figured-${id}`;
