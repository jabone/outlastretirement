// A request written for the person in the web mail they already use.
//
// A mailto: link only works where a mail app is set up, and many people
// read their mail in the browser, where it does nothing at all. Each of
// these opens that service's own compose window in a new tab with the
// address, subject and message already filled in. Nothing is sent until
// the person presses Send, and this page learns nothing about it.
const enc = encodeURIComponent;

export function gmailComposeUrl(email, subject, body) {
  const q = ['view=cm', 'fs=1', `to=${enc(email)}`, subject ? `su=${enc(subject)}` : '', body ? `body=${enc(body)}` : '']
    .filter(Boolean).join('&');
  return `https://mail.google.com/mail/?${q}`;
}

// Outlook.com and Hotmail (personal accounts).
export function outlookComposeUrl(email, subject, body) {
  const q = [`to=${enc(email)}`, subject ? `subject=${enc(subject)}` : '', body ? `body=${enc(body)}` : '']
    .filter(Boolean).join('&');
  return `https://outlook.live.com/mail/0/deeplink/compose?${q}`;
}

export function yahooComposeUrl(email, subject, body) {
  const q = [`to=${enc(email)}`, subject ? `subject=${enc(subject)}` : '', body ? `body=${enc(body)}` : '']
    .filter(Boolean).join('&');
  return `https://compose.mail.yahoo.com/?${q}`;
}

export const WEBMAIL_SERVICES = [
  { id: 'gmail', label: 'Gmail', url: gmailComposeUrl },
  { id: 'outlook', label: 'Outlook.com', url: outlookComposeUrl },
  { id: 'yahoo', label: 'Yahoo Mail', url: yahooComposeUrl },
];
