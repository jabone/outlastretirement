// The fictional households demo mode can load. Tiny and dependency-free on
// purpose: demoMode.js and demoDeepLink.js are on the app's startup path,
// and the households' data (config/demoPlan.js, config/demoPlanParkers.js)
// must stay out of it.
//
//   carters  Sam & Riley Carter: every feature in use. What "Try the Demo
//            Plan" loads everywhere in the app and on the website.
//   parkers  Ray & Angie Parker: an ordinary late-start couple, used by the
//            Learn lessons. Reached by link only: /app/?demo=parkers
export const DEMO_HOUSEHOLD_DEFAULT = 'carters';

export const DEMO_HOUSEHOLDS = Object.freeze({
  carters: Object.freeze({ id: 'carters', names: 'Sam & Riley Carter' }),
  parkers: Object.freeze({ id: 'parkers', names: 'Ray & Angie Parker' }),
});

export function canonicalDemoHousehold(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(DEMO_HOUSEHOLDS, key) ? key : DEMO_HOUSEHOLD_DEFAULT;
}
