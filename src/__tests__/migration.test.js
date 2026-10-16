// The cashflowengine.app -> outlastretirement.com move.
//
// The whole reason this needs a banner and not a redirect: localStorage is
// PER-ORIGIN. A plan saved on the old host does not exist on the new one, and
// nothing -- not a 301, not DNS, not a cookie -- carries it across. A silent
// redirect would look like a success and leave people at an empty form.
//
// So these tests protect three things: that the notice appears on exactly the
// right host, that it says the same date everywhere, and that it cannot be
// permanently dismissed by someone who then loses their plan.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  isLegacyHost, LEGACY_HOSTS, NEW_HOST, SUNSET_DATE, daysUntilSunset, sunsetDateLabel,
} from '../config/migration';
import { BRAND_DOMAIN } from '../config/branding';
import { DISCLAIMER_PARAGRAPHS, DISCLAIMER_PRINT } from '../config/disclaimer';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SRC, '..');

// Nothing tied the name the UI SHOWS to the host actually serving it, so
// BRAND_DOMAIN sat at cashflowengine.app after the move and the first-visit
// modal greeted people with "Welcome to cashflowengine.app" on a site called
// something else -- while this very file listed that host as retired.
describe('the host the UI shows is the host we serve from', () => {
  it('never greets anyone with a retired host', () => {
    expect(LEGACY_HOSTS, 'BRAND_DOMAIN is a host we are switching off')
      .not.toContain(BRAND_DOMAIN);
    expect(BRAND_DOMAIN).toBe(NEW_HOST);
  });

  it('shows it where the user actually reads it', () => {
    // The disclaimer is the one piece of text every visitor accepts, and the
    // print footer may be read months later by someone who never saw the app.
    expect(DISCLAIMER_PARAGRAPHS[0]).toContain(NEW_HOST);
    expect(DISCLAIMER_PRINT).toContain(NEW_HOST);
    for (const text of [DISCLAIMER_PARAGRAPHS.join(' '), DISCLAIMER_PRINT]) {
      for (const legacy of LEGACY_HOSTS) expect(text).not.toContain(legacy);
    }
  });
});

describe('the notice appears on exactly one host', () => {
  const at = (hostname, search = '') => isLegacyHost({ hostname, search });

  it('shows on the host being retired', () => {
    for (const host of LEGACY_HOSTS) expect(at(host), host).toBe(true);
  });

  it('never shows on the new host', () => {
    // Telling someone on the new domain to migrate off it is worse than
    // saying nothing -- they would back up and restore in a circle.
    expect(at(NEW_HOST)).toBe(false);
    expect(at(`www.${NEW_HOST}`)).toBe(false);
  });

  it('does not fire on a host that merely contains the old name', () => {
    // A substring check would light this up on every preview deployment.
    expect(at('cashflowengine-app-git-main.vercel.app')).toBe(false);
    expect(at('notcashflowengine.app')).toBe(false);
    expect(at('cashflowengine.app.evil.test')).toBe(false);
  });

  it('stays out of the way in development, but can be previewed', () => {
    expect(at('localhost')).toBe(false);
    expect(at('localhost', '?migration=preview')).toBe(true);
  });
});

describe('the deadline is one value', () => {
  it('is a date, not a countdown baked into prose', () => {
    // "45 days" is true on exactly one of the forty-five days it is shown.
    expect(SUNSET_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const file of ['components/MigrationNotice.jsx']) {
      // Comments stripped. That file's own comment explains WHY "45 days" is
      // wrong, and a naive scan finds the explanation -- the third guard this
      // session to trip on prose describing the thing it forbids.
      const code = readFileSync(join(SRC, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/\b45 days\b/);
    }
  });

  it('counts down and floors at zero', () => {
    const before = new Date(`${SUNSET_DATE}T12:00:00Z`).getTime();
    expect(daysUntilSunset(new Date(before - 10 * 86400000))).toBe(10);
    expect(daysUntilSunset(new Date(before + 5 * 86400000))).toBe(0);
  });

  it('does not slip a day for users west of Greenwich', () => {
    // A date-only string parses as UTC midnight, which is the PREVIOUS
    // evening in every US timezone -- the label would read one day early.
    expect(sunsetDateLabel()).toMatch(/\b1\b/);
    expect(sunsetDateLabel()).not.toMatch(/30/);
  });

  it('says the same date on the landing page as in the app', () => {
    // The landing page is static HTML and carries its own copy, which is
    // exactly the kind of thing that drifts once and is never noticed.
    const landing = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const shown = /id="moving-date">([^<]+)</.exec(landing);
    expect(shown, 'landing page must show the sunset date').not.toBeNull();
    expect(shown[1].trim()).toBe(sunsetDateLabel());
  });

  it('uses the same host list on the landing page as in the app', () => {
    // The host check runs from public/home-returning.js (kept out of the
    // page itself so the Content-Security-Policy needs no inline scripts).
    const landing = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const script = readFileSync(join(ROOT, 'public', 'home-returning.js'), 'utf8');
    expect(landing).toContain('<script src="/home-returning.js"></script>');
    for (const host of LEGACY_HOSTS) expect(script).toContain(`'${host}'`);
    expect(landing).toContain(NEW_HOST);
  });
});

describe('the notice protects the plan', () => {
  const notice = readFileSync(join(SRC, 'components', 'MigrationNotice.jsx'), 'utf8');

  it('runs the backup itself rather than telling people where to find it', () => {
    // "Go to Preferences and click Backup" is a step someone can get wrong,
    // and getting it wrong costs them the plan.
    expect(notice).toMatch(/useFullBackupActions/);
    expect(notice).toMatch(/onClick=\{backupEverything\}/);
  });

  it('cannot be permanently dismissed', () => {
    // Collapsing leaves a line that still names the date; nothing is written
    // to storage, so it returns in full on the next visit. A user who
    // dismisses this and forgets loses everything.
    expect(notice).not.toMatch(/localStorage|sessionStorage/);
    expect(notice).toMatch(/setCollapsed/);
  });

  it('says plainly that the plan does not move by itself', () => {
    expect(notice).toMatch(/will not move by itself/i);
    const landing = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(landing).toMatch(/will not move by itself/i);
  });

  it('keeps the migration itself local, like everything else', () => {
    // Backup -> file -> restore. No upload, no account, no transfer service.
    expect(notice).toMatch(/Nothing is sent anywhere in this process/);
  });
});
