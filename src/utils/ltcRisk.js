// Long-term care as a risk rather than a date (changelog 266).
//
// The deterministic plan charges long-term care as a fixed cost at a fixed
// age for a fixed number of years -- a stress test, not an expectation.
// With this on, each Monte Carlo trial draws for each person whether a
// paid-care episode happens at all, when, and for how long, and charges
// the plan's own annual cost for those years.
//
// Parameters are rounded from the HHS/ASPE and Urban Institute projections
// for people turning 65 (Favreault & Dey, "Long-Term Services and Supports
// for Older Americans: Risks and Financing", 2015, updated 2022): about
// 56% will develop a need serious enough for paid or family care (women
// more often than men), the average duration among those who do is about
// three years (women ~3.7, men ~2.2), and roughly one in five of them
// needs care for more than five years. An exponential duration with those
// means reproduces the one-in-five tail (e^(-5/3) = 19%). Onset is placed
// in the last stretch of life -- uniformly across the eight years before
// the trial's age at death, never before 65 -- because that is where need
// concentrates; the episode is cut off at death. Simplifications, all
// stated in the Guide: no distinction between home and facility care, no
// second episode, and no link between needing care and dying sooner.
export const LTC_NEED_PROBABILITY = Object.freeze({ female: 0.62, male: 0.48, unstated: 0.56 });
export const LTC_MEAN_YEARS = Object.freeze({ female: 3.7, male: 2.2, unstated: 3.0 });
export const LTC_MAX_YEARS = 10;
export const LTC_ONSET_WINDOW_YEARS = 8;
export const LTC_EARLIEST_ONSET_AGE = 65;

const sexKey = (sex) => (sex === 'female' || sex === 'male' ? sex : 'unstated');

// Three uniform draws in [0, 1): need, duration, onset. Returns null (no
// episode) or { startAge, years } with the episode already truncated at
// the age of death (the last year charged is the year of death).
export function sampleLtcEpisode(sex, deathAge, uNeed, uDuration, uOnset) {
  const k = sexKey(sex);
  if (!(uNeed < LTC_NEED_PROBABILITY[k])) return null;
  const death = Math.max(LTC_EARLIEST_ONSET_AGE, Math.round(Number(deathAge) || 0));
  // Exponential with the sex's mean, capped.
  const raw = -LTC_MEAN_YEARS[k] * Math.log(1 - Math.min(0.999999, Math.max(0, uDuration)));
  const years = Math.max(1, Math.min(LTC_MAX_YEARS, Math.round(raw)));
  const earliest = Math.max(LTC_EARLIEST_ONSET_AGE, death - LTC_ONSET_WINDOW_YEARS + 1);
  const startAge = earliest + Math.floor(uOnset * (death - earliest + 1));
  const truncated = Math.max(1, Math.min(years, death - startAge + 1));
  return { startAge, years: truncated };
}
