import { CONTACT_EMAIL } from '../config/premiumOffering';

// The words the app says about a Premium key (changelog 516): in the notice
// shown once a pasted key has been checked, and on the status line under
// Premium Access Key in Preferences. `result` is what verifyPremiumJwt
// returned for the key.

const dateOf = (d) => (d instanceof Date ? d : new Date(d)).toLocaleDateString();

export function premiumKeyExpiredMessage(expiresAt) {
  return `Expired on ${dateOf(expiresAt)}. Email ${CONTACT_EMAIL} for a new key.`;
}

export function premiumKeyResultMessage(result) {
  const r = result || {};
  if (r.valid && r.expiresAt) {
    return `Premium is on. Active until ${dateOf(r.expiresAt)}${r.licensedTo ? `, licensed to ${r.licensedTo}` : ''}.`;
  }
  if (r.unavailable) return 'Couldn’t check the key just now. Try again in a moment.';
  if (r.expired && r.expiresAt) return premiumKeyExpiredMessage(r.expiresAt);
  return `That key didn’t work. Make sure you copied the whole thing (it starts with eyJ), or email ${CONTACT_EMAIL} for a new one.`;
}
