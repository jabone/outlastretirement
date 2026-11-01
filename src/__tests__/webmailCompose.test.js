import { describe, it, expect } from 'vitest';
import { gmailComposeUrl, outlookComposeUrl, yahooComposeUrl, WEBMAIL_SERVICES } from '../utils/webmailCompose';

describe('web mail compose links', () => {
  const body = 'Line one\nLine two';
  it('Gmail fills to, subject and body', () => {
    expect(gmailComposeUrl('a@b.com', 'Hi there', body)).toBe('https://mail.google.com/mail/?view=cm&fs=1&to=a%40b.com&su=Hi%20there&body=Line%20one%0ALine%20two');
  });
  it('Outlook.com and Yahoo Mail fill the same three', () => {
    for (const [fn, host] of [[outlookComposeUrl, 'outlook.live.com'], [yahooComposeUrl, 'compose.mail.yahoo.com']]) {
      const u = new URL(fn('a@b.com', 'Hi there', body));
      expect(u.host).toBe(host);
      expect(u.searchParams.get('to')).toBe('a@b.com');
      expect(u.searchParams.get('subject')).toBe('Hi there');
      expect(u.searchParams.get('body')).toBe(body);
    }
  });
  it('Gmail comes first', () => {
    expect(WEBMAIL_SERVICES.map((s) => s.id)).toEqual(['gmail', 'outlook', 'yahoo']);
  });
});
