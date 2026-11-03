// Risk-based guardrails (What's New 487): what each setting trades away,
// in plain words, for the settings block (RiskGuardrailsSettings.jsx).
// `target` is where a raise goes back to, `cutTo` where a cut goes back to.
export function riskGuardrailAdvice({ target, cutAt, raiseAt, cutTo = 70, move = 100, raiseCap = 0 }) {
  const notes = [];
  if (!(cutAt < cutTo && cutTo <= target && target < raiseAt)) {
    notes.push({ tone: 'warn', text: 'The four numbers should rise in order: cut below, cut back to, raise to, raise at. Otherwise the app moves the out-of-order ones to fit, as shown below.' });
  }
  if (cutAt >= 70) notes.push({ tone: 'info', text: `Cutting below ${cutAt}% acts early, once the chance of running short reaches ${100 - cutAt}%: cuts come more often, and each is smaller.` });
  else if (cutAt <= 30) notes.push({ tone: 'info', text: `Cutting only below ${cutAt}% waits until things are clearly going wrong, a ${100 - cutAt}% chance of running short: fewer cuts, but they come later.` });
  else if (cutAt === 50) notes.push({ tone: 'info', text: 'Cutting below 50% acts once running short becomes about as likely as not.' });
  else notes.push({ tone: 'info', text: `Cutting below ${cutAt}% acts once the chance of running short reaches ${100 - cutAt}%.` });
  const gap = cutTo - cutAt;
  if (gap < 15) notes.push({ tone: 'info', text: `Cutting back only to ${cutTo}% keeps each cut small, but another bad year is likely to cut again.` });
  else if (gap >= 30) notes.push({ tone: 'info', text: `Cutting back to ${cutTo}% makes each cut bigger, though a second cut is less likely.` });
  else notes.push({ tone: 'info', text: `Cutting back to ${cutTo}%, about 20 points above the cut line as Kitces does, keeps cuts moderate.` });
  if (target >= 90) notes.push({ tone: 'info', text: `Raising only to the ${target}% level keeps each raise small and safer, but is likely to leave more unspent.` });
  else if (target <= 70) notes.push({ tone: 'info', text: `Raising to the ${target}% level gives bigger raises, which a bad run of markets is more likely to take back.` });
  else notes.push({ tone: 'info', text: `Raising to the ${target}% level is where Kitces's raises go back to.` });
  if (raiseAt < 95) notes.push({ tone: 'info', text: `Raising at ${raiseAt}% gives raises sooner, which a later fall is more likely to take back.` });
  else notes.push({ tone: 'info', text: `Raising at ${raiseAt}% waits until almost every past market would have lasted. A bad run soon after can still take a raise back.` });
  if (raiseCap > 0) notes.push({ tone: 'info', text: `Capping raises at ${raiseCap}% above your plan keeps spending from climbing far in long good markets, at the cost of leaving more unspent if good markets continue.` });
  else notes.push({ tone: 'info', text: 'With no limit on raises, a long run of good markets can raise spending to several times your plan, a 20% step at a time; a later fall can take it back.' });
  if (move < 100) notes.push({ tone: 'info', text: `Moving ${move}% of the way makes many small changes instead of a few larger ones; spending can stay outside the band for several years.` });
  return notes;
}
