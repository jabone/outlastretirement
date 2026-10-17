// Covers the /app?demo=1 entry point the landing page's CTAs use.
//
// The load-bearing assertions here are the two that protect against a
// reload loop and against demo-over-demo:
//   - main.jsx strips the parameter BEFORE enterDemoMode's location.reload()
//     (which preserves the query string), so a stripped URL is the only
//     thing standing between a visitor and re-entering demo mode forever.
//   - the guard is `!isDemoModeActive()`, because entering a second time
//     would snapshot the demo plan as if it were the user's own.
// Both are checked against main.jsx's source, since neither is reachable
// from a unit test of the module itself.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseDemoDeepLink, DEMO_DEEP_LINK_DEFAULT_TAB } from '../utils/demoDeepLink';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('parseDemoDeepLink', () => {
  it('accepts ?demo=1 and lands on Scenarios by default', () => {
    expect(parseDemoDeepLink('?demo=1')).toEqual({ landOnTab: 'dashboard' });
    expect(DEMO_DEEP_LINK_DEFAULT_TAB).toBe('dashboard');
  });

  it('accepts the other truthy spellings, with or without a leading ?', () => {
    expect(parseDemoDeepLink('demo=true')).toEqual({ landOnTab: 'dashboard' });
    expect(parseDemoDeepLink('?demo=YES')).toEqual({ landOnTab: 'dashboard' });
    expect(parseDemoDeepLink('?demo=')).toEqual({ landOnTab: 'dashboard' });
  });

  it('ignores an explicit opt-out rather than treating any value as truthy', () => {
    expect(parseDemoDeepLink('?demo=0')).toBeNull();
    expect(parseDemoDeepLink('?demo=false')).toBeNull();
    expect(parseDemoDeepLink('?demo=maybe')).toBeNull();
  });

  it('ignores a search string that does not ask for the demo', () => {
    expect(parseDemoDeepLink('')).toBeNull();
    expect(parseDemoDeepLink('?utm_source=newsletter')).toBeNull();
    expect(parseDemoDeepLink(null)).toBeNull();
  });

  it('honours an explicit ?tab=, including an alias', () => {
    expect(parseDemoDeepLink('?demo=1&tab=portfolio')).toEqual({ landOnTab: 'portfolio' });
    expect(parseDemoDeepLink('?demo=1&tab=ledger')).toEqual({ landOnTab: 'yearledger' });
  });

  it('falls back to the default rather than routing to a tab that does not exist', () => {
    expect(parseDemoDeepLink('?demo=1&tab=nosuchtab')).toEqual({ landOnTab: 'dashboard' });
  });
});

describe('main.jsx wiring', () => {
  const main = readFileSync(join(SRC, 'main.jsx'), 'utf8');

  it('strips the demo parameter before enterDemoMode can reload with it still set', () => {
    const strip = main.indexOf('stripDemoParams()');
    const enter = main.indexOf('enterDemoMode(');
    expect(strip).toBeGreaterThan(-1);
    expect(enter).toBeGreaterThan(-1);
    expect(strip).toBeLessThan(enter);
  });

  it('refuses to enter demo mode when a demo session is already active', () => {
    expect(main).toMatch(/demoRequest\s*&&\s*!isDemoModeActive\(\)/);
  });

  it('still renders the app when entry declines, so the splash cannot strand a visitor', () => {
    expect(main).toMatch(/if\s*\(!entered\)/);
    expect(main).toMatch(/\.catch\(/);
  });
});

describe('landing page CTAs', () => {
  const landing = readFileSync(join(SRC, '..', 'index.html'), 'utf8');

  it('points every demo CTA at the parameter the app actually parses', () => {
    const hrefs = [...landing.matchAll(/href="(\/app[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs.filter((h) => h.includes('demo'))) {
      expect(parseDemoDeepLink(href.slice(href.indexOf('?')))).not.toBeNull();
    }
  });

  it('gives every link into the app a trailing slash', () => {
    // '/app' resolves only where a server rewrite says so; '/app/' resolves
    // on any static server because the app is a folder. Where the rewrite is
    // missing -- the dev server, vite preview -- a bare '/app' falls back to
    // the landing page, so the button silently reloads this same page
    // instead of opening the app. This is the guard against that shipping.
    // (The lookahead keeps /apple-touch-icon.png out of the match.)
    const hrefs = [...landing.matchAll(/href="(\/app(?=[/?"])[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toMatch(/^\/app\/($|\?)/);
    }
  });
});

// The landing page is the one file in the repo that a first-time visitor
// loads before anything else, and it is where the privacy claim is made in
// so many words. A single third-party URL on it -- a font, an icon set, a
// tag manager someone pastes in later -- would contradict the page's own
// copy on the page itself. Same discipline as fontsSelfHosted.test.js,
// applied to the marketing side.
describe('landing page privacy posture', () => {
  const landing = readFileSync(join(SRC, '..', 'index.html'), 'utf8');

  it('loads nothing from another origin', () => {
    // The site's own absolute URL is allowed -- <link rel="canonical"> and
    // og:url have to be absolute. Anything on a different host is not.
    const remote = [...landing.matchAll(/(?:src|href)="(https?:)?\/\/([^/"]+)[^"]*"/g)]
      .filter((m) => !['outlastretirement.com', 'www.outlastretirement.com'].includes(m[2]))
      .map((m) => m[0]);
    expect(remote).toEqual([]);
  });

  it('pulls no stylesheet or font in through CSS either', () => {
    // A @import or a url() pointing off-origin is the loophole an
    // href/src scan misses -- it is how the app itself was reaching
    // fonts.googleapis.com before changelog 148.
    expect(landing).not.toMatch(/@import/);
    const urls = [...landing.matchAll(/url\(\s*['"]?(https?:)?\/\/[^)]*\)/g)].map((m) => m[0]);
    expect(urls).toEqual([]);
  });

  it('sends an installed PWA launch to /app before the page paints', () => {
    // The redirect lives in public/home-installed.js (no inline scripts, so
    // the Content-Security-Policy can stay script-src 'self'), loaded
    // blocking from the head.
    const script = readFileSync(join(SRC, '..', 'public', 'home-installed.js'), 'utf8');
    expect(script).toContain("window.location.replace('/app/')");
    const headEnd = landing.indexOf('</head>');
    const tag = landing.indexOf('<script src="/home-installed.js"></script>');
    expect(tag).toBeGreaterThan(-1);
    expect(tag).toBeLessThan(headEnd);
  });
});

// The OutlastRetirement brand system (locked 2026-09-11). The rules worth a
// test are the ones that are invisible when broken: a mark paired with the
// wrong ground, alt text that calls the product "OR", a second teal, or the
// tokens file quietly diverging from the copy in the brand folder.
describe('OutlastRetirement brand assets', () => {
  const BRAND = join(SRC, '..', 'public', 'brand');
  const tokens = readFileSync(join(BRAND, 'outlastretirement.tokens.css'), 'utf8');
  const page = readFileSync(join(BRAND, 'index.html'), 'utf8');
  const landing = readFileSync(join(SRC, '..', 'index.html'), 'utf8');
  // The landing page's own <style>, with comments stripped -- a comment
  // sitting above a rule is not part of its selector.
  const landingStyle = () => landing
    .slice(landing.indexOf('<style>'), landing.indexOf('</style>'))
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('locks the four brand colors', () => {
    for (const [name, hex] of [
      ['--or-navy', '#0f2744'], ['--or-cream', '#fffaf4'],
      ['--or-paper', '#eae6dd'], ['--or-teal', '#2a7f7a'],
    ]) {
      expect(tokens).toContain(`${name}: ${hex}`);
    }
  });

  it('introduces no second teal', () => {
    // The supplied rasters sample around #356D72 on the full path, and both
    // the tokens file and the brand page say so in as many words -- that is
    // documentation and it should stay. What must never happen is a second
    // teal reaching a DECLARATION, so this reads color-bearing properties
    // rather than scanning for the string anywhere in the file.
    const declared = (t) => [...t.matchAll(/(?:background|color|stroke|fill|border(?:-[a-z]+)?)\s*:\s*([^;{}]*)/gi)]
      .flatMap((m) => [...m[1].matchAll(/#[0-9a-f]{3,8}/gi)].map((h) => h[0].toLowerCase()));
    const allowed = new Set(['#0f2744', '#fffaf4', '#eae6dd', '#2a7f7a']);
    for (const hex of [...declared(tokens), ...declared(page)]) {
      expect(allowed.has(hex), `${hex} is not an OutlastRetirement color`).toBe(true);
    }
  });

  it('defines the teal exactly once', () => {
    expect(tokens.match(/--or-teal:/g)).toHaveLength(1);
  });

  it('names the product in alt text, never the monogram', () => {
    // The brand marks only. The home page's product screenshots (changelog
    // 311) carry descriptive alt text of their own, checked below.
    const logoAlts = (html) => [...html.matchAll(/<img[^>]*class="[^"]*or-logo[^"]*"[^>]*>/g)]
      .map((m) => (m[0].match(/alt="([^"]*)"/) || [])[1]);
    const alts = logoAlts(page).concat(logoAlts(landing));
    expect(alts.length).toBeGreaterThan(0);
    for (const alt of alts) expect(alt).toBe('OutlastRetirement');
  });

  it('describes each product screenshot, and says the household is fictional', () => {
    const shots = [...landing.matchAll(/<img[^>]*src="\/brand\/screens\/[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(shots.length).toBe(3);
    for (const tag of shots) {
      const alt = (tag.match(/alt="([^"]*)"/) || [])[1] || '';
      expect(alt.length).toBeGreaterThan(40);
      expect(alt).toMatch(/fictional/);
      expect(tag).toMatch(/width="\d+" height="\d+"/); // no layout shift while loading
    }
  });

  it('pairs every mark with the ground it was drawn for', () => {
    // A light mark on a navy panel is invisible, not merely wrong -- both
    // marks are keyed to transparency. Sections are split by data-or-theme.
    for (const [theme, wanted, banned] of [['light', '-light.png', '-dark.png'], ['dark', '-dark.png', '-light.png']]) {
      const blocks = page.split(/data-or-theme="/).filter((b) => b.startsWith(`${theme}"`));
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        const srcs = [...block.matchAll(/src="\/brand\/([^"]+\.png)"/g)].map((m) => m[1]);
        for (const src of srcs) {
          expect(src).toContain(wanted);
          expect(src).not.toContain(banned);
        }
      }
    }
  });

  it('keeps the tokens file live on the marketing side', () => {
    expect(landing).toContain('/brand/outlastretirement.tokens.css');
  });

  it('keeps the MARK teal off every piece of text on the landing page', () => {
    // Teal is 3.17:1 on navy: fine for the mark, rules and accents, not for
    // words. This used to allow exactly one exception -- the tick glyph at
    // 19px bold, which sits in WCAG's large-text bracket -- because the page
    // had no teal that could carry text at all. Changelog 172 gave it the
    // app's: --accent-text, the same hue stepped to 5.6:1 on navy. So the
    // rule is now the app's rule with NO exception: --or-teal never colors
    // text, and anything teal-and-textual uses --accent-text instead.
    const style = landingStyle();
    const tealText = [...style.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /(?<!-)\bcolor:\s*var\(--or-teal\)/.test(body))
      .map(([, sel]) => sel.trim());
    expect(tealText, 'selectors putting the 3.17:1 mark teal on text').toEqual([]);
    // ...and the exception it replaced still has to be legible: the tick is
    // the smallest teal thing on the page.
    const tick = [...style.matchAll(/ul\.ticks li::before\s*\{([^}]*)\}/g)][0][1];
    expect(tick).toMatch(/color:\s*var\(--accent-text\)/);
    expect(tick).toMatch(/font-size:\s*19px/);
    expect(tick).toMatch(/font-weight:\s*800/);
  });

  it('takes its surface and text colors from the app, not lookalikes', () => {
    // The landing page used to derive its own grays with color-mix, so a
    // nudge to either side drifted them apart and the two halves of the site
    // stopped matching -- which is the bug changelog 172 fixed. Same
    // discipline as the brand hexes: restate, then assert they agree.
    // Changelog 368: the public pages' colors moved to one shared file with
    // a dark and a light set, each checked against the app's own theme.
    const site = readFileSync(join(SRC, '..', 'public', 'brand', 'site-theme.css'), 'utf8');
    const style = site.slice(site.indexOf(':root {'), site.indexOf('@media (prefers-color-scheme: light)'));
    const siteLight = site.slice(site.indexOf(':root[data-theme="light"] {'));
    const appCss = readFileSync(join(SRC, 'index.css'), 'utf8');
    const appDark = appCss.slice(appCss.indexOf(':root {'), appCss.indexOf('[data-theme="light"]'));
    const appLight = appCss.slice(appCss.indexOf('[data-theme="light"] {'));
    const valueIn = (css, name) => {
      const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
      return m && m[1].trim().toLowerCase();
    };
    for (const [landingToken, appToken] of [['--panel', '--card-bg'],
                                            ['--panel-hover', '--card-hover'],
                                            ['--panel-2', '--bg-secondary'],
                                            ['--border', '--card-border'],
                                            ['--text-2', '--text-secondary'],
                                            ['--muted', '--text-muted'],
                                            ['--accent-text', '--accent-text']]) {
      const mine = valueIn(style, landingToken);
      const theirs = valueIn(appDark, appToken);
      expect(mine, `index.html ${landingToken} is missing`).toBeTruthy();
      expect(theirs, `index.css ${appToken} is missing`).toBeTruthy();
      expect(mine, `${landingToken} has drifted from the app's ${appToken}`).toBe(theirs);
      const mineLight = valueIn(siteLight, landingToken);
      const theirsLight = valueIn(appLight, appToken);
      expect(mineLight, `light ${landingToken} has drifted from the app's light ${appToken}`).toBe(theirsLight);
    }
  });

  it('gives the static pages the app\'s two UI faces, self-hosted', () => {
    // @fontsource is imported in src/main.jsx, which Vite bundles into the
    // APP entry only -- so the landing page and the privacy policy silently
    // rendered in the system UI face while /app/ rendered in Outfit, and the
    // front door looked like a different product. The shared stylesheet is
    // what closes that, so both pages have to link it.
    const privacyPage = readFileSync(join(SRC, '..', 'public', 'privacy.html'), 'utf8');
    const termsPage = readFileSync(join(SRC, '..', 'public', 'terms.html'), 'utf8');
    // The LINK ELEMENT, not a mention of the path: index.html names
    // /brand/fonts.css in a CSS comment too, and a substring check passed
    // happily with the actual <link> deleted.
    const linksFonts = (html) => /<link[^>]+href="\/brand\/fonts\.css"/.test(html);
    for (const [name, html] of [['index.html', landing], ['privacy.html', privacyPage], ['terms.html', termsPage]]) {
      expect(linksFonts(html), `${name} does not load the shared faces`).toBe(true);
      expect(html, `${name} sets no heading face`).toMatch(/--font-heading:\s*'Outfit Variable'/);
      expect(html, `${name} sets no body face`).toMatch(/--font-body:\s*'Plus Jakarta Sans Variable'/);
    }
    // Every face the stylesheet names must actually be on disk -- a missing
    // .woff2 fails back to the system font, which is the exact bug, silently.
    const fontsCss = readFileSync(join(SRC, '..', 'public', 'brand', 'fonts.css'), 'utf8');
    const files = [...fontsCss.matchAll(/url\(\/brand\/fonts\/([^)]+\.woff2)\)/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(existsSync(join(SRC, '..', 'public', 'brand', 'fonts', f)), `${f} is declared but not shipped`).toBe(true);
    }
  });

  it('keeps the brand reference page out of search results', () => {
    expect(page).toMatch(/<meta name="robots" content="noindex/);
  });

  it('carries the name on both halves of the site', () => {
    // The staged cutover is over: the landing page and the app agree. This
    // guard used to assert the opposite -- that the app still said
    // CashFlowEngine -- and it is kept, inverted, because the failure it
    // protects against is the same one either way: the two halves of the
    // site disagreeing about what the product is called.
    const app = readFileSync(join(SRC, '..', 'app', 'index.html'), 'utf8');
    expect(landing).toMatch(/<title>[^<]*OutlastRetirement/);
    expect(app).toMatch(/<title>[^<]*OutlastRetirement/);
    expect(app).not.toMatch(/<title>[^<]*CashFlowEngine/);
  });

  it('invents no domain for the new name', () => {
    // The rename turned strings like "CashFlowEngine.app" into
    // "OutlastRetirement.app" -- a host that does not exist. The site is
    // still served from cashflowengine.app and every URL must say so.
    for (const f of [landing, readFileSync(join(SRC, '..', 'app', 'index.html'), 'utf8'),
                     readFileSync(join(SRC, 'config', 'branding.js'), 'utf8')]) {
      expect(f).not.toMatch(/outlastretirement\.app/i);
    }
  });

  it('carries the real contact address, and only that one', () => {
    // The mailbox moved to outlastretirement@gmail.com with the rename
    // (2026-09-12). The old one had three spellings in the tree at once, so
    // this checks the whole page rather than a single occurrence: a missed
    // link here is a Premium request that reaches nobody.
    expect(landing).toContain('outlastretirement@gmail.com');
    expect(landing).not.toMatch(/cashflowengine[._]?app@gmail\.com/i);
    // The app reads it from one constant; the landing page is static HTML and
    // carries the literal, so this is the only place the two can drift.
    const offering = readFileSync(join(SRC, 'config', 'premiumOffering.js'), 'utf8');
    const constant = /CONTACT_EMAIL = '([^']+)'/.exec(offering)[1];
    expect(constant).toBe('outlastretirement@gmail.com');
    for (const m of landing.matchAll(/mailto:([^"?]+)/g)) expect(m[1]).toBe(constant);
  });

  it('keeps the app reading the address from one constant', () => {
    // GuideTab and the welcome announcement used to hardcode their own
    // copies, which is how the old address ended up spelled three ways.
    for (const f of ['components/tabs/GuideTab.jsx', 'config/announcements.js']) {
      const src = readFileSync(join(SRC, f), 'utf8');
      expect(src).toMatch(/CONTACT_EMAIL/);
      expect(src).not.toMatch(/@gmail\.com/);
    }
  });

  it('points every public URL at the host that returns 200', () => {
    // The apex 308s to www, so www is the URL users actually land on and the
    // only one that answers directly. A canonical on the apex points search
    // engines at a redirect instead of at the page being indexed, and an
    // og:image on a redirect is the classic reason a share card comes up
    // blank. Checked as "no bare apex anywhere", not "www appears somewhere":
    // one missed line is the whole bug.
    const apex = [...landing.matchAll(/https:\/\/outlastretirement\.com/g)];
    expect(apex.map(() => 'bare apex URL on the landing page')).toEqual([]);
    for (const tag of [/rel="canonical" href="([^"]+)"/, /property="og:url" content="([^"]+)"/,
                       /property="og:image" content="([^"]+)"/, /name="twitter:image" content="([^"]+)"/]) {
      const m = tag.exec(landing);
      expect(m, `missing ${tag}`).not.toBeNull();
      expect(m[1]).toMatch(/^https:\/\/www\.outlastretirement\.com\//);
    }
    // .app was never registered -- it is what a careless rename produces.
    expect(landing).not.toMatch(/outlastretirement\.app/i);
  });

  it('keeps the tab title and the share title doing different jobs', () => {
    // The document title says what the thing IS, for a tab and a search
    // result. og/twitter keep the question, which is what earns a click when
    // someone shares it. Swapping one for the other loses a job.
    // Kept as "planner" on purpose (2026-09-28): it is the search term. The
    // locked line opens the meta description instead.
    expect(landing).toMatch(/<title>OutlastRetirement — Local-first retirement planner<\/title>/);
    for (const tag of [/property="og:title" content="([^"]+)"/, /name="twitter:title" content="([^"]+)"/]) {
      expect(tag.exec(landing)[1]).toBe('OutlastRetirement — Does your money outlast you?');
    }
  });

  it('carries structured data on the landing page and nowhere else', () => {
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(landing);
    expect(ld, 'landing page has no JSON-LD').not.toBeNull();
    const data = JSON.parse(ld[1]);
    expect(data['@graph'].map((n) => n['@type'])).toEqual(['WebSite', 'SoftwareApplication']);
    for (const node of data['@graph']) expect(node.url).toBe('https://www.outlastretirement.com/');
    // Invented ratings and review counts are a manual-action risk, and there
    // is nothing here to count honestly. price "0" is true today: Premium is
    // invite-only with no checkout.
    const app = data['@graph'][1];
    expect(app.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'USD' });
    expect(JSON.stringify(data)).not.toMatch(/aggregateRating|reviewCount|ratingValue|downloadCount/i);
    // /app is noindex; structured data there would ask to have it indexed.
    expect(readFileSync(join(SRC, '..', 'app', 'index.html'), 'utf8')).not.toContain('ld+json');
  });

  it('keeps /app out of the sitemap and noindex', () => {
    const sitemap = readFileSync(join(SRC, '..', 'public', 'sitemap.xml'), 'utf8');
    expect(sitemap).not.toMatch(/<loc>[^<]*\/app/);
    expect(readFileSync(join(SRC, '..', 'app', 'index.html'), 'utf8'))
      .toMatch(/<meta name="robots" content="noindex/);
  });

  it('uses the serving host in the sitemap and robots too', () => {
    for (const f of ['public/sitemap.xml', 'public/robots.txt']) {
      const text = readFileSync(join(SRC, '..', f), 'utf8');
      expect(text, f).not.toMatch(/https:\/\/outlastretirement\.com/);
      expect(text, f).toMatch(/https:\/\/www\.outlastretirement\.com/);
    }
  });

  it('carries the wordmark as the asset, never as live type', () => {
    // Brand rule: the lockup is the PNG. A text brand in the header would
    // be the letterforms redrawn in CSS, which the system forbids.
    const header = landing.slice(landing.indexOf('<header'), landing.indexOf('</header>'));
    expect(header).toMatch(/<img[^>]*class="[^"]*or-logo[^"]*"[^>]*alt="OutlastRetirement"/);
    expect(header).not.toMatch(/>\s*OutlastRetirement\s*</);
  });
});

// A surface that is dark in BOTH themes cannot take its text color from a
// theme token. --text-primary is paper in dark mode and NAVY in light mode,
// so a tooltip pinned to a dark ground renders navy-on-navy for every light-
// theme user -- and tooltips only exist on hover, which is exactly why the
// rendered-page contrast sweep never saw them. This shipped once (the
// sidebar nav tooltips, 2026-09-11) and the fix is a rule, not a patch:
// forced-dark surfaces wear --or-paper explicitly.
describe('forced-dark surfaces do not take flipping text tokens', () => {
  const FLIPPING = /color:\s*'var\(--(?:text-primary|text-secondary|text-muted|accent-text)\)'/;
  // An opaque dark literal. Low-alpha washes are excluded: those tint a
  // themed surface rather than replacing it, so a theme token is correct.
  const DARK_GROUND = /(?:background|backgroundColor)\s*:\s*'(#(?:0|1|2)[0-9a-f]{5})'/i;
  const DARK_GROUND_G = new RegExp(DARK_GROUND.source, 'gi');

  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(full); }
      else if (e.name.endsWith('.jsx')) files.push(full);
    }
  };
  walk(join(SRC, 'components'));
  files.push(join(SRC, 'App.jsx'));

  it('finds no dark-on-dark style object', () => {
    const offenders = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // Walk outward from each dark ground rather than trying to match a
      // style object with a regex: these objects carry comments and nested
      // braces, and a fixed-width window silently misses the long ones --
      // which is how the first version of this guard passed while the bug
      // it was written for was sitting in the file.
      for (const m of src.matchAll(DARK_GROUND_G)) {
        const start = src.lastIndexOf('{', m.index);
        const end = src.indexOf('}}', m.index);
        const block = src.slice(start === -1 ? m.index : start, end === -1 ? m.index + 1200 : end);
        if (FLIPPING.test(block)) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${f.split('/src/')[1]}:${line} pins ${m[1]} but takes a flipping text token`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// The modal used to be pinned dark in both themes, with the whole dark
// palette redefined on its subtree. That was a workaround for a real bug --
// a dark card whose text tokens flipped light -- but once the app had a real
// light theme it meant a near-black dialog opening on a cream page, which is
// how it was reported (editing a holding, 2026-09-12). The surface now comes
// from the same tokens as every other card, and this is what stops the
// workaround being reintroduced the next time something looks half-flipped.
describe('modals follow the theme', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8');
  const block = css.slice(css.indexOf('.modal-content {'), css.indexOf('@keyframes slideUp'));

  it('takes its surface from the theme, not a pinned literal', () => {
    expect(block).toMatch(/background:\s*var\(--card-bg\)/);
    expect(block).not.toMatch(/background:\s*#[0-9a-f]{6}/i);
  });

  it('does not redefine the palette on its own subtree', () => {
    // Redefining --text-primary etc. here is how a surface gets pinned to
    // one theme: everything inside stops following the app.
    for (const token of ['--bg-primary', '--card-bg', '--text-primary', '--text-secondary', '--accent-primary']) {
      expect(block).not.toMatch(new RegExp(`\\s${token}:`));
    }
  });
});

// The privacy policy is the page that promises a way to reach us, so a
// contact address there that nobody can receive mail at is worse than no
// address. It pointed at privacy@retireplan.app -- a domain this project does
// not own -- until 2026-09-12.
describe('privacy policy', () => {
  const privacy = readFileSync(join(SRC, '..', 'public', 'privacy.html'), 'utf8');

  it('can actually be replied to', () => {
    const mailtos = [...privacy.matchAll(/mailto:([^"?]+)/g)].map((m) => m[1]);
    expect(mailtos.length).toBeGreaterThan(0);
    for (const a of mailtos) expect(a).toBe('outlastretirement@gmail.com');
  });

  it('names no domain this project does not own', () => {
    expect(privacy).not.toMatch(/retireplan\.app/i);
    // OutlastRetirement.app does not exist either -- the site is served from
    // cashflowengine.app and the product name carries no suffix.
    expect(privacy).not.toMatch(/outlastretirement\.app/i);
  });

  it('carries the product name, with changes recorded rather than silent', () => {
    expect(privacy).toContain('OutlastRetirement');
    expect(privacy).toMatch(/Update, September 12, 2026/);
    // The date moved on 2026-09-12: disclosing the email channel exposed a
    // data flow that had always happened but was never written down, which is
    // the bar this policy sets for moving it. (The rename alone would not
    // have been.)
    // And on 2026-09-30: the host's own request logs, Yahoo Finance behind
    // the Live Pricing Sheet, and names typed into a plan were disclosed.
    // And on 2026-10-17: the host's short-lived request logs, which two
    // sentences had said we neither receive nor keep (changelog 413).
    expect(privacy).toMatch(/Effective Date: October 17, 2026/);
    expect(privacy).toMatch(/Update, October 17, 2026/);
    expect(privacy).toMatch(/Update, October 16, 2026/);
    expect(privacy).toMatch(/Update, September 30, 2026/);
    // And again on 2026-09-28: analytics had been sending more of each
    // address than the policy described (tab, sub-page, link parameters).
    expect(privacy).toMatch(/Update, September 28, 2026/);
  });

  it('does not claim we collect no email addresses', () => {
    // It said exactly that, without qualification, while email was the ONLY
    // route to Premium. The claim has to be scoped to the App, and the
    // exception has to be findable from the bullet that used to deny it.
    expect(privacy).toMatch(/Names, email addresses, or contact information <em>through the App<\/em>/);
    expect(privacy).toMatch(/<h2 id="email">If You Email Us<\/h2>/);
    expect(privacy).toMatch(/href="#email"/);
  });

  it('says what happens to correspondence, in terms that can be kept', () => {
    // Retention, the processor, the purpose, and a deletion route. A policy
    // that promises a schedule nobody runs is the bug we just fixed, pointed
    // the other way -- so it says "indefinitely", which is true.
    expect(privacy).toMatch(/indefinitely/i);
    expect(privacy).toMatch(/Gmail/);
    expect(privacy).toMatch(/delete/i);
  });

  it('does not describe payment handling that does not exist', () => {
    // Premium is invite-only and free; there is no processor. Describing
    // card handling before there is any is the same error as denying the
    // email we do hold.
    expect(privacy).toMatch(/no payment processor/i);
    expect(privacy).not.toMatch(/stripe|paddle|credit card number/i);
  });

  // The minting script ships only in the private repository.
  it.skipIf(!existsSync(join(SRC, '..', 'scripts', 'mint-premium-jwt.mjs')))('the key carries exactly what the policy says it carries', () => {
    // The policy says the key holds the address it was sent to, the Premium
    // flag and its expiry, and nothing else. If a future token ever gains
    // another claim, this is what catches the policy becoming false.
    const minter = readFileSync(join(SRC, '..', 'scripts', 'mint-premium-jwt.mjs'), 'utf8');
    // Two mints: the Premium key, and the demo delivery key (changelog 401),
    // which carries no address and no Premium flag -- only { demo: true }.
    const claims = [...minter.matchAll(/new SignJWT\(([^)]*)\)/g)].map((m) => m[1].replace(/\s/g, '')).sort();
    expect(claims).toEqual(['{demo:true}', '{premium:true,licensedTo}']);
    expect(privacy).toMatch(/carries three things: the email address we sent it to, the fact that Premium is enabled, and when it expires/);
    expect(privacy).not.toMatch(/no name, no email address, and no identifier/);
  });
});

// Every brand mark in the app is a link home. Three of them (sidebar
// expanded, sidebar collapsed, mobile top bar) and it is easy to add a
// fourth that is just a picture.
describe('the brand marks are links home', () => {
  const sources = ['App.jsx', 'components/layout/Sidebar.jsx']
    .map((f) => [f, readFileSync(join(SRC, f), 'utf8')]);

  it('wraps every BrandMark in a link, never a bare div', () => {
    for (const [name, src] of sources) {
      for (const m of src.matchAll(/<BrandMark\b/g)) {
        // The nearest opening tag before it must be the anchor.
        const before = src.slice(0, m.index);
        const openTag = before.lastIndexOf('<');
        expect(before.slice(openTag, openTag + 2), `${name}: a BrandMark is not inside a link`).toBe('<a');
      }
    }
  });

  it('points them at the router default rather than a typed-in hash', () => {
    // A literal '#/dashboard' silently stops matching if DEFAULT_TAB moves.
    for (const [name, src] of sources) {
      expect(src, name).toMatch(/href=\{formatHash\(DEFAULT_TAB\)\}/);
      expect(src, name).not.toMatch(/href="#\/dashboard"/);
    }
  });

  it('gives each one a name and a visible focus ring', () => {
    for (const [name, src] of sources) {
      expect(src, name).toMatch(/aria-label="OutlastRetirement — go to Dashboard"/);
    }
    // A logo-as-link with no focus ring is a keyboard trap in disguise.
    const css = readFileSync(join(SRC, 'index.css'), 'utf8');
    expect(css).toMatch(/\.brand-home:focus-visible\s*\{[^}]*outline:/);
  });
});

// Before the split, "/" was the app and every link pointing at it was
// correct. After it, "/" is the marketing page -- so links did not break
// loudly, they quietly started going somewhere else. And the traffic only
// ever ran one way: the landing page sent people in, with nothing bringing
// them back out.
describe('the two halves of the site link both ways', () => {
  const app = readFileSync(join(SRC, 'App.jsx'), 'utf8');
  const privacy = readFileSync(join(SRC, '..', 'public', 'privacy.html'), 'utf8');
  const landing = readFileSync(join(SRC, '..', 'index.html'), 'utf8');

  it('gives the app a way back to the marketing page', () => {
    expect(app).toMatch(/<a href="\/" className="app-disclaimer-footer-link">/);
  });

  it('does not call the marketing page the app', () => {
    // This exact link read "Back to App" and pointed at "/" -- accurate
    // until the day the app moved to /app.
    expect(privacy).not.toMatch(/href="\/"[^>]*>\s*Back to (the )?[Aa]pp/);
    expect(privacy).toMatch(/href="\/app\/"[^>]*>\s*Open the app/);
  });

  it('sends every in-app destination to /app/, not to /', () => {
    for (const m of landing.matchAll(/href="(\/[^"#]*)"/g)) {
      const href = m[1];
      // The legal pages are static documents beside the landing page, not
      // app routes (the Terms page arrived 2026-09-20, Accessibility 2026-09-27,
      // Verify it yourself 2026-09-28, the release notes and How the math works
      // 2026-10-02, Learn 2026-10-07).
      if (href === '/' || href.startsWith('/learn') || href.startsWith('/privacy') || href.startsWith('/terms') || href.startsWith('/accessibility') || href.startsWith('/premium') || href.startsWith('/verify') || href.startsWith('/changelog') || href.startsWith('/how-the-math-works') || href.startsWith('/brand') || /^\/(favicon|apple-touch-icon)/.test(href)) continue;
      expect(href, 'a landing-page link into the app').toMatch(/^\/app\//);
    }
  });
});

// The text-decoration SHORTHAND resets decoration-color to currentColor, so
// setting the color BEFORE it silently does nothing. This shipped that way
// once; the underline was meant to be teal and was the text color instead.
describe('underline color survives the shorthand', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8');

  it('never sets text-decoration-color before the shorthand in the same rule', () => {
    const offenders = [];
    for (const m of css.matchAll(/\{[^{}]*\}/g)) {
      const body = m[0];
      const color = body.indexOf('text-decoration-color');
      const shorthand = body.search(/text-decoration:\s/);
      if (color !== -1 && shorthand !== -1 && color < shorthand) {
        offenders.push(css.slice(0, m.index).split('\n').length);
      }
    }
    expect(offenders, 'index.css lines where the shorthand wipes the color').toEqual([]);
  });
});

// The collapsed rail width lives in three rules that have to agree: the grid
// column, the rail itself, and the collapse toggle floating on its edge. As
// three literals they drift, and the failure is a toggle sitting in the
// middle of nowhere or a gap beside the sidebar.
describe('collapsed rail width is one value', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8');

  it('defines it once and reads it everywhere', () => {
    expect(css).toMatch(/--rail-w:\s*\d+px/);
    for (const rule of [/grid-template-columns:\s*var\(--rail-w\)/,
                        /width:\s*var\(--rail-w\)/,
                        /left:\s*var\(--rail-w\)/]) {
      expect(css).toMatch(rule);
    }
  });

  it('is wide enough for the monogram and its clearspace', () => {
    // The OR mark is 65px at its 32px brand minimum, and the brand asks for
    // 0.6 x height of clearspace. Anything under ~99px and the mark is
    // crowded against the rail edge again, which is what 80px looked like.
    const width = Number(/--rail-w:\s*(\d+)px/.exec(css)[1]);
    expect(width).toBeGreaterThanOrEqual(99);
  });
});

// "Never leaves your device" was unqualified, and the App has three features
// whose whole purpose is to move data off it -- Backup, save-to-a-synced-
// folder, and Live Pricing. All user-initiated, none routed through us, but
// a reader who had just used one would call that sentence false.
describe('privacy policy describes the ways data can leave', () => {
  const privacy = readFileSync(join(SRC, '..', 'public', 'privacy.html'), 'utf8');

  it('does not claim data can never leave the device', () => {
    expect(privacy).not.toMatch(/<li>Never leaves your device<\/li>/);
    expect(privacy).toMatch(/Is never sent anywhere by the App/);
  });

  it('names all three exits', () => {
    expect(privacy).toMatch(/<h2>Moving Your Data Off Your Device<\/h2>/);
    for (const feature of ['Backup Everything', 'Save to a cloud folder', 'Live Pricing']) {
      expect(privacy, feature).toContain(feature);
    }
  });

  it('is accurate about the cloud-folder feature having no provider account', () => {
    // cloudFileSync.js talks to no provider: no OAuth, no API key, no server.
    // It writes a local file and the user's own sync client moves it. Saying
    // otherwise would overstate our involvement in both directions.
    // Comments stripped: that file explains at length why it does NOT use
    // OAuth, and scanning the prose for the word finds the explanation.
    const sync = readFileSync(join(SRC, 'utils', 'cloudFileSync.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(sync).not.toMatch(/oauth|client_id|googleapis\.com/i);
    expect(privacy).toMatch(/no account with any of those providers/);
  });

});
