import React, { useState } from 'react';
import { Mail, Copy, Check, ExternalLink } from 'lucide-react';
import { copyText } from '../utils/copyText';
import { WEBMAIL_SERVICES } from '../utils/webmailCompose';
import { CONTACT_EMAIL, REQUEST_SUBJECT, REQUEST_BODY } from '../config/premiumOffering';

// How to ask for Premium (replaces the single Request Access button).
//
// A mailto: button did nothing for anyone without a mail app set up, which
// is most people who read mail in a browser. So: one button per web mail
// service, each opening that service's compose window already addressed,
// titled and written; and, for every other kind of email, the address and
// subject to copy and what to say. Nothing is sent from this page.
function CopyButton({ text, label, testId }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={async () => setDone(await copyText(text))}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 4px', marginLeft: '4px', minHeight: 0, background: 'none', border: 'none', color: 'var(--accent-text)', fontWeight: 600, fontSize: 'var(--fs-xs)', cursor: 'pointer', whiteSpace: 'nowrap', verticalAlign: 'baseline' }}
    >
      {done ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      {done ? 'Copied' : label}
    </button>
  );
}

export default function RequestAccessPanel({ id = 'request-access' }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-testid="request-access" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h3 id={`${id}-title`} style={{ fontSize: '15px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Mail size={16} style={{ color: 'var(--accent-text)' }} aria-hidden="true" /> Ask for Premium by email
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Send it from the address you want your key sent to. Nothing is sent from this page, and nothing else is asked.
        </p>
      </div>

      <div style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--card-border)', background: 'var(--bg-secondary)' }}>
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>If you use Gmail, Outlook.com or Yahoo Mail</div>
        <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Your mail opens in a new tab with the message already written and addressed. Check it and press Send.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {WEBMAIL_SERVICES.map((s, i) => (
            <a
              key={s.id}
              href={s.url(CONTACT_EMAIL, REQUEST_SUBJECT, REQUEST_BODY)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`request-${s.id}`}
              className={i === 0 ? 'btn-primary' : 'btn-outline'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
            >
              Write it in {s.label}
              <ExternalLink size={13} aria-hidden="true" />
              <span style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}> (opens in a new tab)</span>
            </a>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--card-border)', background: 'var(--bg-secondary)' }} data-testid="request-other">
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Any other email (Apple Mail, a work account, your phone)</div>
        <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <li>
            Write to <strong style={{ color: 'var(--text-primary)' }}>{CONTACT_EMAIL}</strong>{' '}
            <CopyButton text={CONTACT_EMAIL} label="Copy the address" testId="request-copy-address" />
          </li>
          <li>
            Use the subject <strong style={{ color: 'var(--text-primary)' }}>{REQUEST_SUBJECT}</strong>{' '}
            <CopyButton text={REQUEST_SUBJECT} label="Copy the subject" testId="request-copy-subject" />
          </li>
          <li>Nothing else is needed: no name, no account, no figures from your plan.</li>
          <li>Send it from the address you want the key sent to. The reply has your key and how to turn it on. To reach us about anything else, write to the same address.</li>
        </ol>
      </div>
    </section>
  );
}

// The same choices in one sentence, for a small notice (the Premium key
// renewal banner): the three web mail links, or the address to copy.
export function WebmailInline({ subject, body }) {
  return (
    <span data-testid="webmail-inline">
      Write it in{' '}
      {WEBMAIL_SERVICES.map((s, i) => (
        <React.Fragment key={s.id}>
          {i > 0 && (i === WEBMAIL_SERVICES.length - 1 ? ' or ' : ', ')}
          <a href={s.url(CONTACT_EMAIL, subject, body)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)', fontWeight: 600 }}>{s.label}</a>
        </React.Fragment>
      ))}
      , or email <strong>{CONTACT_EMAIL}</strong>
      <CopyButton text={CONTACT_EMAIL} label="Copy the address" testId="webmail-inline-copy" />
      {' '}with the subject <em>{subject}</em>
    </span>
  );
}
