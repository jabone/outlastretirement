import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyText } from '../utils/copyText';

// A mailto: link that admits when it did nothing.
//
// John, 2026-10-12: people were clicking "Email for Premium access" and
// assuming the request had gone. On a Mac with no mail account in Mail,
// or a browser that was once told not to open the mail app, a mailto:
// link does nothing at all -- no window, no error -- and the person walks
// away believing they have written to us. The link stays (it is still the
// right thing where a mail app exists, and sends nothing from this page),
// but after the click we watch for the hand-off: a mail app or a web mail
// tab takes focus away from this page. If that has not happened within a
// moment, the page says so, states the address and the subject to use, and
// offers to copy the address. If it has, a quieter note still shows the
// address in case the hand-off went somewhere unexpected. Either way the
// person is never left thinking a message was sent.
//
// How long to wait before concluding nothing opened. Mail apps take focus
// within a few hundred milliseconds; web mail in a new tab is faster.
export const MAILTO_HANDOFF_WAIT_MS = 1500;

export default function MailtoLink({ email, subject, body, className, style, children, ariaLabel }) {
  // 'idle' | 'waiting' | 'opened' | 'nothing'
  const [state, setState] = useState('idle');
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  const query = [
    subject ? `subject=${encodeURIComponent(subject)}` : '',
    body ? `body=${encodeURIComponent(body)}` : '',
  ].filter(Boolean).join('&');
  const href = `mailto:${email}${query ? `?${query}` : ''}`;

  useEffect(() => {
    if (state !== 'waiting') return undefined;
    const handedOff = () => {
      if (timer.current) clearTimeout(timer.current);
      setState('opened');
    };
    const onVisibility = () => { if (document.hidden) handedOff(); };
    window.addEventListener('blur', handedOff);
    document.addEventListener('visibilitychange', onVisibility);
    timer.current = setTimeout(() => setState('nothing'), MAILTO_HANDOFF_WAIT_MS);
    return () => {
      window.removeEventListener('blur', handedOff);
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state]);

  const onClick = () => {
    setCopied(false);
    setState('waiting');
  };

  const copy = async () => {
    const ok = await copyText(email);
    setCopied(ok);
  };

  const showNote = state === 'opened' || state === 'nothing';

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '8px', maxWidth: '100%' }}>
      <a href={href} className={className} style={style} onClick={onClick} aria-label={ariaLabel}>
        {children}
      </a>
      {showNote && (
        <span
          role="status"
          style={{
            display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px',
            fontSize: 'var(--fs-xs)', lineHeight: 1.5, color: 'var(--text-secondary)',
            padding: '8px 10px', borderRadius: '8px',
            border: `1px solid ${state === 'nothing' ? 'var(--danger)' : 'var(--card-border)'}`,
            backgroundColor: 'var(--bg-secondary)', whiteSpace: 'normal',
          }}
        >
          <span style={{ flex: '1 1 240px' }}>
            {state === 'nothing'
              ? <><strong>Your email app did not open, so nothing has been sent.</strong> Write to <strong>{email}</strong>{subject ? <> with the subject <em>{subject}</em></> : null} from the email you normally use.</>
              : <>Your email app should have opened. If it did not, nothing has been sent: write to <strong>{email}</strong>{subject ? <> with the subject <em>{subject}</em></> : null} from the email you normally use.</>}
          </span>
          <button
            type="button"
            className="btn-outline"
            onClick={copy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Address copied' : 'Copy the address'}
          </button>
        </span>
      )}
    </span>
  );
}
