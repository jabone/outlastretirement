import React, { useContext, useState, useEffect, useRef } from 'react';
import SimulationContext from '../context/SimulationContext';
import { BookOpen, Search, Settings, Target, TrendingUp, HelpCircle, AlertCircle, CheckCircle, Activity, Link2, ExternalLink } from 'lucide-react';

import { NOT_ASKED_IN_INTERVIEW, SETTINGS_DOMAINS } from '../config/inputCoverage';
import { SOURCES, UNCITED, SOURCE_VERIFIED_ON } from '../config/sources';
import {
  usd, TAX_YEAR, ACA_CLIFF_COUPLE, ACA_CLIFF_SINGLE, TOP_RATE_START_MFS, TOP_RATE_START_SINGLE,
  AMT_EXEMPTION_MFS_2026, AMT_EXEMPTION_SINGLE_2026, SS_EARNINGS_TEST_EXEMPT_UNDER_FRA, SS_EARNINGS_TEST_EXEMPT_FRA_YEAR,
  ADDITIONAL_DEDUCTION_AGED_SINGLE_2026, ADDITIONAL_DEDUCTION_AGED_MARRIED_2026, SENIOR_BONUS_DEDUCTION,
  SENIOR_BONUS_FIRST_YEAR, SENIOR_BONUS_LAST_YEAR, SENIOR_BONUS_PHASEOUT_SINGLE, SENIOR_BONUS_PHASEOUT_MFJ,
  ANNUAL_GIFT_EXCLUSION_2026, QCD_LIMIT_2026, FEDERAL_ESTATE_EXEMPTION_2026, NY_RECAPTURE_AGI_FLOOR,
} from '../utils/copyFigures';

const sectionStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '30px',
    padding: '30px',
    backgroundColor: 'var(--bg-main)',
    color: 'var(--text-primary)',
    minHeight: '100%',
    fontFamily: 'inherit'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px'
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    margin: 0
  },
  description: {
    fontSize: '15px',
    color: 'var(--text-secondary)',
    maxWidth: '800px',
    lineHeight: '1.5'
  },
  card: {
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid var(--card-border)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'var(--accent-text)',
    borderBottom: '1px solid var(--card-border)',
    paddingBottom: '12px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left'
  },
  th: {
    padding: '12px 16px',
    backgroundColor: 'var(--bg-tertiary)',
    fontWeight: '600',
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
    borderBottom: '2px solid var(--card-border)'
  },
  td: {
    padding: '16px',
    borderBottom: '1px solid var(--card-border)',
    fontSize: '14px',
    verticalAlign: 'top',
    lineHeight: '1.5'
  },
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    color: 'var(--accent-text)',
    fontSize: 'var(--fs-xs)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '8px'
  }
};

// This is the "Input Dictionary" -- every input/widget/column in the app
// should have a row somewhere below. When you add or change one, add/edit
// its row here too -- see the "Documentation checklist" in DEVELOPMENT.md.
// Usually goes hand-in-hand with a changelog.js entry and a GuideTab.jsx
// prose update for the same change.
// Phones: fold every card to its heading (see the effect below).
const NARROW_QUERY = '(max-width: 600px)';

const InputReference = () => {
  // Optional: the Dictionary also renders bare in tests and could in a
  // future standalone page, so the context is read without insisting on it.
  const sim = useContext(SimulationContext);
  const seeded = sim ? sim.dictionaryQuery : '';
  const [query, setQuery] = useState(seeded || '');
  useEffect(() => { if (seeded) setQuery(seeded); }, [seeded]);
  const containerRef = useRef(null);
  const [matchCount, setMatchCount] = useState(null);

  // Filtering is done imperatively over the rendered rows rather than by
  // restructuring this file's content into data.
  //
  // Normally reaching into the DOM from React is a smell. It's the right
  // call here specifically because every row below is static JSX with no
  // state of its own -- there's nothing for React to reconcile against, so
  // toggling `display` can't fight the renderer. The alternative was
  // rewriting ~750 lines of hand-authored prose tables into a data array,
  // which would be a large, risky change to content whose whole value is
  // that it's carefully worded. This keeps the words exactly as they are
  // and makes an 11-card, ~65,000-character page actually searchable,
  // which was the real complaint.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const q = query.trim().toLowerCase();
    const rows = root.querySelectorAll('tbody tr');
    let shown = 0;
    rows.forEach((row) => {
      const hit = !q || row.textContent.toLowerCase().includes(q);
      row.style.display = hit ? '' : 'none';
      if (hit) shown += 1;
    });
    // Hide a whole card once none of its rows survive the filter, so the
    // page collapses to just the sections that actually matched.
    root.querySelectorAll('[data-reference-card]').forEach((card) => {
      const visible = [...card.querySelectorAll('tbody tr')].some((r) => r.style.display !== 'none');
      card.style.display = q && !visible ? 'none' : '';
    });
    setMatchCount(q ? shown : null);
  }, [query]);

  // On a phone the full Dictionary runs to well over a hundred thousand
  // pixels, so at 600px and narrower every card starts folded to its
  // heading, which becomes a button. A search unfolds everything it
  // matches (the filter above already hides the cards that don't match),
  // so searching works exactly as it does on a wide screen.
  const [narrow, setNarrow] = useState(() => {
    try { return !!window.matchMedia?.(NARROW_QUERY).matches; } catch { return false; }
  });
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia?.(NARROW_QUERY); } catch { mq = null; }
    if (!mq) return undefined;
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  const [openCards, setOpenCards] = useState(() => new Set());
  const searching = query.trim() !== '';
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    root.querySelectorAll('[data-reference-card]').forEach((card, i) => {
      const folded = narrow && !searching && !openCards.has(i);
      const heading = card.querySelector('h2');
      [...card.children].forEach((child) => {
        if (child !== heading) child.style.display = folded ? 'none' : '';
      });
      if (!heading) return;
      if (narrow && !searching) {
        heading.setAttribute('role', 'button');
        heading.setAttribute('tabindex', '0');
        heading.setAttribute('aria-expanded', String(!folded));
        heading.dataset.cardIndex = String(i);
        heading.style.cursor = 'pointer';
      } else {
        heading.removeAttribute('role');
        heading.removeAttribute('tabindex');
        heading.removeAttribute('aria-expanded');
        heading.style.cursor = '';
      }
    });
  }, [narrow, searching, openCards]);
  const toggleCard = (e) => {
    if (!narrow || searching) return;
    const heading = e.target.closest?.('[data-reference-card] > h2');
    if (!heading || !containerRef.current?.contains(heading)) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (e.type === 'keydown') e.preventDefault();
    const i = Number(heading.dataset.cardIndex);
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };
  const setAllCards = (open) => {
    const count = containerRef.current?.querySelectorAll('[data-reference-card]').length || 0;
    setOpenCards(open ? new Set(Array.from({ length: count }, (_, i) => i)) : new Set());
  };

  return (
    <div style={sectionStyles.container} ref={containerRef} onClick={toggleCard} onKeyDown={toggleCard}>
      <div>
        <div style={sectionStyles.header}>
          <BookOpen size={32} color="var(--accent-primary)" />
          <h1 style={sectionStyles.title}>Input Dictionary</h1>
        </div>
        <p style={sectionStyles.description}>
          This guide provides a comprehensive dictionary of every widget, input field, and control toggle found across the application. It details the purpose of each item, how it affects the simulation engine, and what valid values can be provided. Number fields accept digits with optional commas, a leading $ or a trailing %; an entry that is out of range or not a number is refused when you leave the field, with a message under it, and the previous value stays. Emptying a money field sets it to $0. Prefer a guided walkthrough instead of hunting through this list? <strong>Plan &rarr; Guided</strong> covers the same fields section by section, skipping anything that doesn&rsquo;t apply to your household.
        </p>
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: '480px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="search"
              className="form-input"
              aria-label="Search the Input Dictionary"
              placeholder="Search every input, control, and definition..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: '34px', width: '100%' }}
            />
          </div>
          {matchCount !== null && (
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
              {matchCount === 0
                ? 'No matches — try a shorter word, or the name as it appears on screen.'
                : `${matchCount} matching ${matchCount === 1 ? 'entry' : 'entries'}`}
            </span>
          )}
          {narrow && !searching && (
            <span style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-outline" onClick={() => setAllCards(true)}>Expand all</button>
              <button type="button" className="btn-outline" onClick={() => setAllCards(false)}>Collapse all</button>
            </span>
          )}
        </div>
      </div>

      {/* Generated from src/config/inputCoverage.js rather than hand-written,
          so it can't drift out of date the way this file's location
          breadcrumbs repeatedly have. A test re-derives the same list from
          InterviewTab/SettingsTab source on every run. */}
      <div style={sectionStyles.card} data-reference-card>
        <h2 style={sectionStyles.cardTitle}>
          <HelpCircle size={20} />
          Options Plan (Guided) doesn&rsquo;t ask about
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Plan (Guided) is a first pass and skips the more specialized options to stay short.
          Nothing here is required &mdash; your plan projects fine without any of it &mdash; but if one applies to you,
          this is where it lives. The Guided view also points at these in context, section by section.
        </p>
        <table style={sectionStyles.table}>
          <thead>
            <tr>
              <th style={sectionStyles.th}>Option</th>
              <th style={sectionStyles.th}>What it adds</th>
              <th style={sectionStyles.th}>Where to find it</th>
            </tr>
          </thead>
          <tbody>
            {NOT_ASKED_IN_INTERVIEW.map((entry) => (
              <tr key={entry.id}>
                <td style={sectionStyles.td}><strong>{entry.title}</strong></td>
                <td style={sectionStyles.td}>{entry.blurb}</td>
                <td style={sectionStyles.td}>Plan (Advanced) &rarr; {SETTINGS_DOMAINS[entry.domain]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The other half of the disclaimer. "Not advice" says what the
          output isn't; this says where each statutory figure came from, so
          a skeptical reader &mdash; or the advisor they were told to consult --
          can check it instead of taking it on trust. Placed near the top
          because it is the question a doubtful reader arrives with. */}
      <div style={sectionStyles.card} data-reference-card>
        <h2 style={sectionStyles.cardTitle}>
          <BookOpen size={20} />
          Where these figures come from
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Every tax rule below is set by a government agency, not by this app. Each link goes to that agency&rsquo;s own page &mdash;
          never to a summary or an explainer &mdash; and each row says when it was last checked (the list as a whole on {SOURCE_VERIFIED_ON}). If a figure here ever looks
          wrong to you, the link is the place to settle it.
        </p>
        <table style={sectionStyles.table}>
          <thead>
            <tr>
              <th style={sectionStyles.th}>Rule</th>
              <th style={sectionStyles.th}>What it drives here</th>
              <th style={sectionStyles.th}>Source</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((src) => (
              <tr key={src.id}>
                <td style={sectionStyles.td}><strong>{src.label}</strong></td>
                <td style={sectionStyles.td}>
                  {src.drives}
                  {src.note ? <><br /><em style={{ color: 'var(--text-muted)' }}>{src.note}</em></> : null}
                </td>
                <td style={sectionStyles.td}>
                  <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)' }}>
                    {src.publisher} <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'baseline' }} />
                  </a>
                  <br /><span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Checked {src.verified || SOURCE_VERIFIED_ON}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '14px', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Not yet cited.</strong> These figures are just as real and just as
          checked in the code, but their sources haven&rsquo;t been verified for this list yet, so they aren&rsquo;t linked
          rather than linked on trust: {UNCITED.join('; ')}.
        </p>
      </div>

      {/* Navigation is not an input, so it has no natural home in the
          per-field tables below &mdash; but "how do I get back to where I was"
          is exactly the kind of thing someone opens the Dictionary to
          answer, and nothing else documents it. */}
      <div style={sectionStyles.card} data-reference-card>
        <h2 style={sectionStyles.cardTitle}>
          <Link2 size={20} />
          Getting around: addresses, reload, and the Back button
        </h2>
        <table style={sectionStyles.table}>
          <thead>
            <tr>
              <th style={sectionStyles.th}>Input / Widget</th>
              <th style={sectionStyles.th}>Purpose &amp; Effect</th>
              <th style={sectionStyles.th}>Valid Inputs / Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Sidebar</span><br/><strong>Explore more</strong></td>
              <td style={sectionStyles.td}>The sidebar always shows Dashboard, Plan, Retirement Readiness, Year by Year, Detailed Holdings (or, without Premium, a locked <strong>Premium</strong> entry that opens the page describing all four Premium areas) and Help. Optimizers, Risk &amp; Stress, Tax &amp; Estate, Scenarios, What Will You Do? and Preferences sit behind an Explore more entry.</td>
              <td style={sectionStyles.td}>Click to open or close; the choice is remembered on this browser. The fold opens itself whenever the current page is one of the entries inside it, so an address, a Plan Feedback link or a Back button never lands on a hidden entry. Nothing moved: every page keeps its address.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Address Bar</span><br/><strong>Tab &amp; section addresses</strong></td>
              <td style={sectionStyles.td}>Every tab, and every section within a tab, has its own address shown after the <code>#</code> in your browser&rsquo;s address bar. Reloading the page keeps you exactly where you were instead of returning to the Dashboard, and you can bookmark or share a link to one specific spot.</td>
              <td style={sectionStyles.td}>Read-only &mdash; it updates itself as you navigate, but you can also type or paste one. Format is <code>#/tab</code> or <code>#/tab/section</code>: <code>#/settings/taxes</code>, <code>#/risk/montecarlo</code>, <code>#/portfolio/rebalance</code>, <code>#/guide/dictionary</code>. A tab&rsquo;s first section is left off (<code>#/settings</code> means Household). An address naming a tab that doesn&rsquo;t exist falls back to the Dashboard; one naming a real tab but an unknown section keeps the tab and opens its first section.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Browser</span><br/><strong>Back / Forward buttons</strong></td>
              <td style={sectionStyles.td}>Move between tabs and sections you&rsquo;ve visited, in order. This matters most after following a &ldquo;go fix this&rdquo; link from the Dashboard&rsquo;s Plan Feedback or from Plan (Guided): Back returns you to where the link came from.</td>
              <td style={sectionStyles.td}>Works like any website. Back from the first thing you opened leaves the app, as usual. Switching sections within a tab is its own step, so Back undoes a section change before it undoes a tab change.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Behavior</span><br/><strong>What is and isn&rsquo;t remembered</strong></td>
              <td style={sectionStyles.td}>Your position is carried by the address, not saved separately. Opening the app with no address after the <code>#</code> always starts on the Dashboard.</td>
              <td style={sectionStyles.td}>Deliberate: closing the browser mid-form and coming back days later starts you on the overview rather than dropping you into that form with no memory of why. Your plan <em>data</em> is saved separately and independently of this &mdash; see Backup &amp; Restore under Preferences.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Tab</span><br/><strong>Retirement Readiness (<code>#/readiness</code>)</strong></td>
              <td style={sectionStyles.td}>The questions a retiree asks out loud, answered from the projection you already have: where your first five years of money come from and how it reaches you, and what working one, two, three or five more years would buy. Nothing on it asks for a new input or recomputes a figure the engine already publishes.</td>
              <td style={sectionStyles.td}>Not an input. <strong>Free:</strong> each question, answered with your own headline figure. <strong>Premium:</strong> the working behind each answer &mdash; the first five years one by one, and the working-longer comparison for one, two, three or five more years beside a &ldquo;Leave now&rdquo; column. When walking away today falls short, Premium also shows what would make it a yes (spend less, keep working, a one-time sum, or earnings for the first few years out), each found by running the plan itself. With a ledger that marks essentials, <strong>How exposed you are</strong> shows how much of them the portfolio must pay in the first year. Social Security here is the benefit you entered, and your life expectancy does not move.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Help</span><br/><strong>How the numbers are figured (<code>#/guide/howfigured</code>)</strong></td>
              <td style={sectionStyles.td}>One card per tax or benefit rule the projection applies &mdash; federal brackets and deductions, capital gains, Social Security, required minimum distributions, Roth conversions, Medicare premiums and IRMAA, the ACA credit, estate and inheritance taxes, and each modeled state &mdash; in a few plain sentences, with the tax year its figures come from, what the app simplifies, and the official page that sets the rule and the date it was last checked. Education about the app&rsquo;s method, not tax advice.</td>
              <td style={sectionStyles.td}>Not an input. A search box filters the cards; on a phone each group folds to its heading. The <strong>How is this figured?</strong> links beside the tax figures on Year by Year (federal, state, Social Security, Medicare and IRMAA, RMD) and on Tax &amp; Estate (the bracket chart, the Medicare panel, the state and federal estate tax totals) open this section at the matching card. Links open the agency&rsquo;s page in a new tab.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Columns</span><br/><strong>Year by Year &rarr; Balances &amp; draws: Health, Income Tax, shading</strong></td>
              <td style={sectionStyles.td}>Health is the whole health cost &mdash; pre-Medicare cover, Medicare with IRMAA, long-term care, cover abroad, HSA-paid care &mdash; with Medicare on its own line carrying the IRMAA note and SSA-44 badge. Total Exp names each year&rsquo;s life events.</td>
              <td style={sectionStyles.td}>Not inputs. Lifestyle Exp, Health and Income Tax are shaded because they carry exactly the same figures as Where the money goes; a legend above the table names them and links to that view. The CSV export uses its own column names.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Display</span><br/><strong>Year by Year &rarr; Balances &amp; draws: pinned Year, phone column groups</strong></td>
              <td style={sectionStyles.td}>The Year column stays put while the table scrolls sideways. On a phone (768 pixels wide or less) the table shows Year plus one group of columns at a time, with the ages under each year.</td>
              <td style={sectionStyles.td}>Summary (default: Salary, Lifestyle Exp, Income Tax, Total Exp, Total Draw, Ending Portfolio); Income &amp; spending (pay, RSU/GSU, Social Security and pensions, lifestyle, health, total expenses, state); Taxes (filing status, income tax, bracket, RMD, Roth conversions and their tax, foreign tax and credit, ACA check, loss carryforward, basis); Accounts (draws and ending balances by account, growth rate, cash reserve, deferred comp, concentrated stock, debt, home equity). The choice is remembered on that device. Wider screens show every column.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Columns</span><br/><strong>Year by Year &rarr; Column glossary: Basis Left, US Credit, Cash Reserve, NQDC, Home Equity, Concentrated Stock</strong></td>
              <td style={sectionStyles.td}><strong>Basis Left</strong> is the after-tax basis remaining inside your Pre-Tax bucket, from Backdoor Roth contributions or a basis you entered; Roth conversions return this portion tax-free under the IRS pro-rata rule, shrinking it as it is used up. <strong>US Credit</strong> is the US foreign tax credit: how much of the year&rsquo;s foreign tax reduces your US tax, already netted out of Income Tax; tax on Social Security, on your Roth and local contributions, and the 3.8% investment income tax never earn a credit. <strong>Cash Reserve</strong> is the year-end Cash Floor balance: spent first in a down-market retirement year (a draw, shielding Taxable, Pre-Tax and Roth from being sold at a loss), topped back off in an up year as far as the accounts can pay for it, spent in any year the accounts run short, and built from leftover cash flow while working when Build Up Gradually is on (a +). <strong>NQDC Balance</strong> is both spouses&rsquo; deferred compensation, an unsecured bookkeeping account separate from the other buckets; a payout this year shows beside the balance and is not included in Salary; Salary is pay alone. <strong>Home Equity</strong> is home value minus the reverse mortgage balance. <strong>Conc.</strong> is the year-end value of a concentrated stock position and its share of net worth; anything diversified this year has already moved to Taxable, and a + is this year&rsquo;s routed vests.</td>
              <td style={sectionStyles.td}>Not inputs. Each column appears only when the plan uses the feature behind it. The help popup on the column header gives the one-line version and links here.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Readout</span><br/><strong>Range in 8 of 10 simulated markets (P10&ndash;P90)</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Ending Balance card, Dashboard chart band, Year by Year note</em></td>
              <td style={sectionStyles.td}>The Monte Carlo runs your plan through many simulated markets (1,000 by default). Sort the ending balances from worst to best: the <strong>P10</strong> is the figure one-tenth of the way up, the <strong>P90</strong> nine-tenths of the way up. Eight trials in ten ended between the two &mdash; &ldquo;8 of 10 simulated markets&rdquo; is that band in plain words. One in ten ended below it and one in ten above. The Dashboard&rsquo;s shaded band is the same two figures for every year, not only the last; the card and the Year by Year note quote the final year.</td>
              <td style={sectionStyles.td}>Not an input. It is the typical spread, not the odds of success: a band that sits entirely above zero can still belong to a plan that ran short in 15% of trials, because running short happens along the way, not at the end. The <strong>Will It Last?</strong> card carries the success share. The 10th&ndash;90th band is the one most planning tools quote; the extreme tails (P5, P1) swing with the volatility assumption and the seed, so they are not shown. The band steps aside when the plan changes (&ldquo;plan changed since the Monte Carlo ran&rdquo;) and is hidden while a crash test is on.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Card</span><br/><strong>Will It Last? (verdict card)</strong></td>
              <td style={sectionStyles.td}>One verdict for the plan that combines two views: the projection at your average returns, and the share of Monte Carlo markets in which the money lasts. The sidebar badge, the phone&rsquo;s top bar, the summary bar and Plan Feedback all state the same verdict.</td>
              <td style={sectionStyles.td}>Not an input. <strong>On track</strong>: lasts at average returns and in at least 90% of markets. <strong>Mostly on track</strong>: 75&ndash;89%. <strong>At risk</strong>: under 75%. <strong>Runs short</strong>: even average returns do not cover the spending. While the Monte Carlo is still running it states what average returns already show (for example <em>Lasts on average</em>) and says the market check is under way; until a Monte Carlo result for this plan is in (during the first run, and in the phone apps, where it does not run on its own) the same bands are read from every real retirement since 1928 (&ldquo;through 84 of 98 real retirements since 1928&rdquo;), and the Monte Carlo replaces it once it has run (the 1928 count then stays as a second sentence); <em>Lasts on average</em> only when neither is available. The share is rounded to a whole percent once and the verdict is read from that same number, so 89.6% shows as 90% and <em>On track</em> on every surface, Scenarios included.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Card</span><br/><strong>Dashboard &rarr; First safe year to retire</strong></td>
              <td style={sectionStyles.td}>The earliest year the household could stop work and the plan still lasts to its end: the app runs the plan with retirement set to this year, then next year, and so on, and reports the first success. Reads Today when stopping this year already lasts, Retired when the plan already has you retired, and Not found when no year up to the search horizon lasts.</td>
              <td style={sectionStyles.td}>Not an input. Both spouses stop in the year tried (each spouse&rsquo;s retirement age becomes their age that year); a spouse already retired today stays retired. Life expectancy and every other setting are untouched. The search runs at most 25 years out, and no further than the first spouse&rsquo;s life expectancy. The note beneath compares the year found with the plan&rsquo;s own retirement year.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Card</span><br/><strong>Dashboard &rarr; Retirement bridge fund</strong></td>
              <td style={sectionStyles.td}>The sum of lifestyle spending and pre-Medicare health coverage across the years the household is retired but not yet claiming Social Security.</td>
              <td style={sectionStyles.td}>Not an input. Shown only when there is such a gap. A year counts once every enabled spouse has retired and before every enabled spouse has claimed.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>View</span><br/><strong>Year by Year &rarr; Cash flow</strong> (<code>#/yearledger/cashflow</code>)</td>
              <td style={sectionStyles.td}>One year&rsquo;s money drawn as a flow: salary, fixed inflows (Social Security, pensions, annuities, rent) and portfolio draws in; lifestyle, taxes, health, savings and reinvested surplus out. Sankey or Classic diagram, a year slider, Autoplay, and a full-screen zoom.</td>
              <td style={sectionStyles.td}>Not an input. The figures are the Year by Year row&rsquo;s own: salary, fixed income, portfolio draws, lifestyle, taxes, health and contributions. Surplus is what comes in less what goes out, never below zero. Phones open on Classic, which reads better narrow.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>View</span><br/><strong>Year by Year &rarr; Where the money goes</strong></td>
              <td style={sectionStyles.td}>Every year from now, working years included, split by what the year&rsquo;s money was used for, so you can see where it went rather than only what was left. A working year&rsquo;s columns add up to your pay; a retired year&rsquo;s to what income and withdrawals had to cover.</td>
              <td style={sectionStyles.td}>Not an input. Columns: <strong>Lifestyle</strong> (with Premium, <strong>Essentials</strong> and <strong>Flexible</strong> in retired years when your spending categories mark what you could not cut; the early-retirement travel extra counts as Flexible), <strong>Health</strong> (pre-Medicare cover, Medicare with IRMAA and any late-enrollment penalty, long-term care, cover abroad, including HSA-paid care), <strong>Debt</strong>, <strong>Life events</strong> (named; externally funded ones excluded; ones paid straight from a named account included), <strong>Gifts</strong>, <strong>Income tax</strong> (federal, state, payroll while working &mdash; never property tax, which is in Housing), <strong>Saved</strong> (your contributions after any cut to balance a short year, cash reserve built while working, unspent money reinvested; not the employer match), <strong>Total out</strong>. Columns zero in every year are hidden. Total out &minus; Saved equals Total Exp plus HSA-paid care plus account-paid life events, to the dollar. Follows <strong>Show figures in</strong>; the CSV export follows the view on screen.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Tab</span><br/><strong>What Will You Do? (<code>#/lifeplan</code>)</strong></td>
              <td style={sectionStyles.td}>A non-financial reflection space addressing the human half of retirement (structure, identity, people, and purpose). Has deliberately no math, no score, and no dollar inputs.</td>
              <td style={sectionStyles.td}>Text responses to structured prompts across four life pillars plus freeform notes. Saved in browser storage independently of financial scenario inputs (switching or resetting scenarios never erases your life roadmap) and preserved in Backup Everything.</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Preferences: app-level settings, deliberately documented as its
          own card so the Plan Settings card stays about plan data only. */}
      <div style={sectionStyles.card} data-reference-card>
        <h2 style={sectionStyles.cardTitle}>
          <Settings size={20} />
          Preferences
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Preferences (in the sidebar under <strong>Explore more</strong>) holds everything that changes the app rather than your
          projection. None of it affects your numbers, and none of it is captured in a saved Scenario.
        </p>
        <table style={sectionStyles.table}>
          <thead>
            <tr>
              <th style={sectionStyles.th}>Input / Widget</th>
              <th style={sectionStyles.th}>Purpose &amp; Effect</th>
              <th style={sectionStyles.th}>Valid Inputs / Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Theme / Large Text</strong></td>
              <td style={sectionStyles.td}>Switches between the dark and light color schemes, and increases the base font size across every tab. Both themes meet the standard text contrast for low vision, and every control has a spoken name for screen readers (sliders include their units). Every chart carries a written summary a screen reader reads as the chart's name. The Accessibility page (linked in the footer) has the details.</td>
              <td style={sectionStyles.td}>Per-browser. Not part of your plan or any Scenario. Until you choose, the theme follows your device&rsquo;s light or dark setting (and changes when it does); once you choose, the choice sticks, and the public pages &mdash; home, privacy, terms, verify and the rest &mdash; follow it too.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Button</span><br/>
                <strong>Save Current Scenario</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sidebar; Scenarios tab</em>
              </td>
              <td style={sectionStyles.td}>Snapshots the plan exactly as it stands under a name you choose, along with its ending balance, success flag, peak portfolio worth and Monte Carlo success probability. Saving runs a full 1,000-lifetime simulation to get that probability, in the background so the app stays responsive. Odds saved under an earlier version of the app are recalculated in the background the next time you open it, and read &ldquo;Calculating&hellip;&rdquo; until then, so they always match the balances beside them.</td>
              <td style={sectionStyles.td}>Name is required and is matched case-insensitively &mdash; saving under an existing name replaces that scenario rather than creating a duplicate. While a save is running the button reads &ldquo;Saving&hellip;&rdquo; and is disabled; a second click is ignored rather than starting a duplicate simulation. On a browser that cannot create a background worker the simulation still runs, just on the main thread.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Show figures in</strong> (Today&rsquo;s Dollars / Future Dollars)</td>
              <td style={sectionStyles.td}>Today&rsquo;s Dollars discounts every future figure back to present-day purchasing power; Future Dollars shows the raw nominal amounts. Affects display only &mdash; the underlying projection is identical either way.</td>
              <td style={sectionStyles.td}>Applies to every chart, headline figure and table in the app at once, including the Year by Year CSV export, the Tax Optimizer Hub cards, the Roth Ladder Optimizer grids, the Action Plan, the Monte Carlo figures, the Guardrails grid and the printed report, which notes the basis in its header. A balance at the end of a year is adjusted by the price level at the end of that year; a year&rsquo;s income, spending and tax by that year&rsquo;s own. Rates, percentages and ages are unaffected.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Input</span><br/><strong>Live Pricing Connection</strong></td>
              <td style={sectionStyles.td}>The Apps Script Web App URL (main connection: live quote reads + new-ticker registration) and an optional published-CSV URL (fallback read path) for your own copy of the pricing Google Sheet, which supplies prices, dividends, yields and payout frequency to the premium Detailed Holdings tab. Only bare ticker symbols are ever sent there. Only Google addresses are accepted: links must start with https://docs.google.com/ or https://script.google.com/, or be a googleusercontent.com address; anything else shows an error under the field and is never contacted.</td>
              <td style={sectionStyles.td}>Without the Apps Script URL, Refresh still prices tickers already on the Sheet via the CSV (which lags the live Sheet by Google&rsquo;s ~5-minute republish cadence) but won&rsquo;t register new ones. If your deployed Apps Script falls behind the current version, a redeploy notice appears here with the specific changes.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Input</span><br/><strong>Premium Access Key</strong></td>
              <td style={sectionStyles.td}>The signed access key that unlocks Premium. Live Pricing does not depend on it &mdash; each user connects their own Sheet for that.</td>
              <td style={sectionStyles.td}>Paste a key to activate it; submit an empty field to remove it. The status (Not set / Active until &lt;date&gt; / Invalid or expired) shows beside it. A key lasts 30 days and is renewed by email; every key carries an expiry date, and one without it, or whose expiry is more than 400 days away, shows as invalid. A notice appears at the top of the page seven days before it expires, and again if it lapses, with a pre-filled renewal email. <strong>Nothing is deleted at expiry:</strong> your holdings and every other figure stay in this browser and come back when a new key is entered. Hiding the notice hides it for that key only, so next month&rsquo;s warning still arrives.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Action</span><br/><strong>Backup Everything / Restore Backup</strong></td>
              <td style={sectionStyles.td}>The same pair as in the sidebar, documented in full further down this page. Everything in this app lives only in this browser&rsquo;s storage, so a copy kept outside it &mdash; a download, or the linked save file below &mdash; is the only durable one.</td>
              <td style={sectionStyles.td}>Identical file format either way &mdash; the sidebar copy exists so recovery is never more than one click from any tab.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Action</span><br/><strong>Encrypted Backup</strong></td>
              <td style={sectionStyles.td}>Downloads the same file as Backup Everything, locked with a password you choose. Meant for copies that leave this computer &mdash; a cloud folder, an email, a USB stick &mdash; where the plain file would expose your whole plan and, when Premium is active, a working access credential. Encrypted in the browser with AES&#8209;256&#8209;GCM; the key is derived from the password with PBKDF2 (SHA&#8209;256, 600,000 rounds). Nothing about the plan is readable from the file without the password.</td>
              <td style={sectionStyles.td}>Asks for the password twice; at least 8 characters, no other rule. Mismatched or too-short entries download nothing. Restore Backup opens these files and prompts for the password &mdash; a wrong one asks again, Cancel abandons the restore. <strong>No recovery exists for a lost password</strong>; the plan in this browser is unaffected. Paused in demo mode like every other backup. The linked save file is always written unencrypted.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Setting</span><br/><strong>Data Freshness Reminders</strong></td>
              <td style={sectionStyles.td}>Keeps the plan&rsquo;s inputs honest: a banner reminds you to back up when the plan has changed with no backup for 14 days (5 in a Safari tab, which can erase a site&rsquo;s data after 7 days without a visit), and to import a new statement (or run Quick Update) on your chosen cadence. The sidebar status line shows both dates and turns amber when overdue.</td>
              <td style={sectionStyles.td}>Cadence dropdown in Preferences &rarr; Your Data: Monthly / Quarterly (default) / Never. Dismissing a banner snoozes it 7 days (the backup reminder 3 days in a Safari tab); &ldquo;Mark as current&rdquo; resets the portfolio clock without an import. Dates travel with Backup Everything.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Local-Only Mode</strong></td>
              <td style={sectionStyles.td}>While ON, the app sends none of your data and makes no optional connections: anonymous page-view analytics are not loaded, and every Live Pricing fetch is refused at the code level (fail-closed at the network choke point, not just a hidden button). While OFF, the only outbound requests are the Live Pricing refresh (ticker symbols only, and only with a connected Sheet) and &mdash; only if Usage Analytics is switched on &mdash; anonymous page-view counts; both are off by default. Fonts are self-hosted, so no request to Google either way. Plan data never left the device either way; this makes it enforced. A pill at the top of the app shows while active, with a one-click Turn off. Separately, with this mode on or off, the site&rsquo;s Content-Security-Policy has the browser refuse any connection except to this site and Live Pricing&rsquo;s Google addresses. The Verify it yourself page (outlastretirement.com/verify) lists every feature that can use a connection and what each sends.</td>
              <td style={sectionStyles.td}>Toggle in Preferences &rarr; Your Data. Every tab is stored on this device in the background after your first visit (Detailed Holdings and its PDF statement import once you have opened them), so the app works offline even though most tabs load on first open. Device-level preference (own storage key) &mdash; not part of plan data, not included in backups, not affected by scenario switches. Independent of the always-on offline support: the app works without a connection after the first visit regardless (see the Guide&rsquo;s &ldquo;airplane-mode test&rdquo;), and an update toast offers a reload when a new version ships.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Anonymous Usage Analytics</strong></td>
              <td style={sectionStyles.td}>Off by default. When on, shares anonymous page-view counts (which tabs get opened, how often) with the developer via the hosting provider &mdash; never anything you type, never plan data. Sent to our own domain and processed by Vercel, our host; left off, no usage beacon is ever sent, including the first page-view. Local-Only Mode overrides it: while that is on, nothing is sent regardless.</td>
              <td style={sectionStyles.td}>Toggle in Preferences &rarr; Your Data, directly under Local-Only Mode. Device-level preference (own storage key), not part of plan data or backups. The switch is disabled and shows &ldquo;Paused&rdquo; while Local-Only Mode is on.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Action</span><br/><strong>Try the Demo Plan</strong></td>
              <td style={sectionStyles.td}>Loads a complete fictional household (Sam &amp; Riley Carter) so every feature &mdash; including a read-only preview of Premium Detailed Holdings &mdash; can be explored with realistic data. Pairs with the video walkthrough series. Opens on the Dashboard with no setup chooser or What&rsquo;s New popup in the way (both wait until you exit the demo).</td>
              <td style={sectionStyles.td}>The home page, and buttons on the Scenarios tab and Premium page. Everything this browser has stored is copied on entry and put back exactly on Exit Demo (top banner), so a visitor with no plan of their own leaves with none; display preferences you set during the demo, such as the theme, are kept, and every other change is discarded. Backup and Restore are paused while the demo is loaded. A demo link opened in a browser that already holds your own plan asks first (Open the Demo / Stay on My Plan); a first visit goes straight in. It comes with eleven saved scenarios: four one-lever pairs plus three standalone what-ifs. Two pairs are failing plans with the one change that rescues each ($180,000 a year, rescued by Sam working to 64; $170,000 a year, rescued by spending guardrails). <strong>A $1.3M</strong> and <strong>a $1.45M inheritance</strong> sit either side of New York&rsquo;s estate-tax cliff. <strong>Sam consults to 67</strong> and <strong>Sam consults to 67, but claims at 62</strong> differ only in claiming age, which shows the Social Security retirement earnings test. Loading runs a full Monte Carlo for each scenario in the background, counting them off (&ldquo;scenario 3 of 11&rdquo;), and your own plan is set aside only once the demo is ready.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Action</span><br/><strong>Save to a file in your cloud folder</strong></td>
              <td style={sectionStyles.td}>Links one file on your computer &mdash; typically inside a folder your machine already syncs (Google Drive, Dropbox, iCloud Drive, OneDrive) &mdash; and writes your whole plan to it on demand, skipping the download step. The app has no connection to any of those services: it writes a file, and your own sync client uploads it. Same JSON as Backup Everything, so a file saved this way restores through Restore Backup on any browser.</td>
              <td style={sectionStyles.td}><strong>Requires a desktop sync app you already have</strong> (Google Drive for Desktop, Dropbox, iCloud Drive, OneDrive) and a file picked <em>inside</em> the folder it syncs &mdash; the app cannot verify this, since the browser exposes only the file&rsquo;s name and never its path, so it prompts you to confirm the file appeared in your cloud service after the first save. A collapsed &ldquo;How to set one up&rdquo; section on the same panel covers installing each of the four services and what the resulting folder is called. Outside a synced folder you get a local copy, not a cloud one. Free, no account, no sign-in. <strong>Saving is manual</strong> &mdash; nothing is written until you press Save Now. That is deliberate: with no server between your devices there is no way to merge two edited copies, so an automatic sync could silently overwrite work done elsewhere. Unlinking only makes the app forget the file; it never deletes or moves it. Needs a Chromium desktop browser (Chrome, Edge, Arc, Brave) for the File System Access API &mdash; Safari, iOS, and the mobile apps don&rsquo;t have it, and there the section is hidden rather than shown broken.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Dropdown</span><br/><strong>Filing Status</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Household</em></td>
              <td style={sectionStyles.td}>Married Filing Jointly, Married Filing Separately, or Single/Widowed. Drives every tax figure in the projection &mdash; brackets, standard deduction, AMT, capital gains rates, Medicare surcharges, Social Security taxation and the estate exemption.</td>
              <td style={sectionStyles.td}><strong>MFS is not the same as Single.</strong> Its thresholds are exactly half the joint ones by statute, so they match a single filer for most of the range and then diverge sharply: the top 37% rate starts at {usd(TOP_RATE_START_MFS)} rather than {usd(TOP_RATE_START_SINGLE)}, the AMT exemption is {usd(AMT_EXEMPTION_MFS_2026)} rather than {usd(AMT_EXEMPTION_SINGLE_2026)} ({TAX_YEAR} figures), and NIIT and the additional Medicare tax begin at $125,000 rather than $200,000. Modeled from the IRS&rsquo;s own tables rather than derived. An MFS household is spread across its <em>two</em> returns rather than piled onto one: see <strong>Separate-Return Income Split</strong> below.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Input</span><br/><strong>Separate-Return Income Split (MFS only)</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Household</em></td>
              <td style={sectionStyles.td}>What share of the household&rsquo;s taxable income lands on the first of the two separate returns. Married filing separately means two filings, and the standard deduction (with each spouse&rsquo;s own age-65 amount), the brackets, the 0/15/20% capital-gains bands, the $125,000 NIIT threshold, the AMT exemption, state income tax and the Medicare surcharge all apply <em>per return</em> &mdash; so how the income divides is what decides the bill. Appears only when the filing status is MFS and a second spouse is enabled.</td>
              <td style={sectionStyles.td}>0&ndash;100, default <strong>50</strong>. At 50 an evenly-earning couple lands close to where Married Filing Jointly would, which is the real answer &mdash; the separate-filing penalty comes from the other rules, not the brackets. Set it to 100 for a genuine one-earner couple, where everything sits on one return. A plan with no second spouse enabled always uses one return regardless, because there is only one person to file it.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Lived with your spouse (MFS only)</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Household</em></td>
              <td style={sectionStyles.td}>Whether you lived with your spouse at any point during the year. Only appears when filing status is MFS, where this one fact switches three separate rules between their ordinary and punitive versions.</td>
              <td style={sectionStyles.td}><strong>Lived together at any point:</strong> Social Security gets a <strong>$0</strong> exempt amount (taxation starts at your first dollar of other income, where every other status shelters $25,000&ndash;$32,000); Roth IRA eligibility phases out between $0 and $10,000; and Medicare&rsquo;s surcharge uses a three-bracket schedule that jumps straight to the second-highest premium above $109,000 of each spouse&rsquo;s own income. <strong>Lived apart all year:</strong> all three revert to ordinary single-filer treatment. Community property states are not modeled.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>List of Moves</span><br/><strong>Where you live</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Life Events</em></td>
              <td style={sectionStyles.td}>Planned moves between US states. Each move is a year, a month and a state; from that month the plan is taxed as the new state &mdash; state income tax, including the tax on your withdrawals and Roth conversions &mdash; and the ACA coverage-gap check uses the new state. Your estate is taxed by the state you live in at the <em>end</em> of the plan, not the one you live in today. Before the first move, the plan uses your State of Residence and State Income Tax Jurisdiction settings.</td>
              <td style={sectionStyles.td}>Any year from the plan year to the plan&rsquo;s last year. Every state and DC is priced by its own 2026 rules: California, New York, Illinois, Colorado, Pennsylvania, Virginia and Washington in full detail, the eight no-income-tax states at nothing, and every other state from the app&rsquo;s table of its brackets, deductions and retirement-income rules, unless you tick <strong>Use a flat rate I set instead</strong> and enter a rate, with your choice of whether it taxes Social Security and pensions. A move to New York can add the New York City tax or the Yonkers surcharge. One move per year &mdash; adding a second replaces the first. <strong>Month:</strong> January by default; a later month shares that year by months &mdash; state tax, tax abroad, health coverage and living costs &mdash; and Year by Year shows it as &ldquo;(from Jul)&rdquo;. A move home from abroad always takes effect on January 1. <strong>Living costs there:</strong> 10&ndash;300% of your lifestyle spending now (default 100); country summaries suggest a national average (Numbeo) you can apply with one click. The list is empty by default.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Form (Premium)</span><br/><strong>Where you live &rarr; Another country</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Life Events</em></td>
              <td style={sectionStyles.td}>A move abroad, priced on top of the US tax a citizen keeps owing. Local income tax (one overall rate, or its brackets in local currency with an exchange rate), its rate on dividends and gains, and whether it taxes your Social Security, pensions and IRA withdrawals, and investments. The US foreign tax credit reduces US tax only up to the US tax on the same income, in two separate baskets (pensions and wages; investments), with unused credit carried forward ten years; the 3.8% investment income tax is never reduced. Your last state keeps taxing you until you tick that you have cut ties (a state with no income tax, such as Texas, charges nothing either way, and the checkbox says so). Abroad, the ACA marketplace and its credit switch off; your health coverage cost replaces them.</td>
              <td style={sectionStyles.td}><strong>Roth:</strong> required &mdash; respected, taxed like a brokerage account (its dividends yearly and the gains in each withdrawal, at the investment rate), or withdrawals taxed at a rate you set; never credited. <strong>Treaty credit:</strong> off by default; without it, foreign tax on US pensions and investments earns no credit (wages earned abroad always do). <strong>US does not tax my Social Security:</strong> for Canada, Germany, Ireland, Israel, Italy (Italian citizens), Romania, the UK and a few others. <strong>Contribution:</strong> a % of income up to a cap, never credited. <strong>Medicare Part B:</strong> kept by default; dropped, no premium abroad and +10% of the standard premium per year without it once you are back. <strong>Estate estimate:</strong> a % of the estate, blank = not included, used only if you are abroad in the plan&rsquo;s last year, added on top of US estate tax. Not modeled: currency risk on spending.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Dropdown (Premium)</span><br/><strong>Where you live &rarr; Another country &rarr; Country</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Life Events</em></td>
              <td style={sectionStyles.td}>Pick one of our eighteen country summaries (listed A to Z) to fill the form with that country&rsquo;s rules, or &ldquo;Another country&rdquo; to enter your own. The summary card shows the month it was checked, a confidence level, what is unsettled, and its sources as a list of links. The exchange rate says which summary it came from and when it was checked. The move remembers which summary it came from; changing any figure marks it as yours, and the notice on every screen with a year abroad switches from &ldquo;estimates&rdquo; to &ldquo;your own figures&rdquo;.</td>
              <td style={sectionStyles.td}><strong>Opt-in assumptions:</strong> Mexico&rsquo;s pension exemption (off by default; unconfirmed for US pensions); private cover instead of IMSS; Panama network plan; Costa Rica rentista (CAJA on USD 2,500 a month); Costa Rica private cover on top of CAJA; Colombia public EPS instead of private cover; Colombia heirs living abroad. <strong>Health coverage</strong> is filled in per person for your household. <strong>Rules any country can use:</strong> tax a couple on halves (brackets only); tax-free allowance on pensions per person, local currency; it credits the US tax on my Social Security; investments on its income-tax scale; extra tax on dividends (%); contribution on an income I declare; Roth earnings taxed as income. Summaries older than 18 months are flagged.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Card + Dropdown (Premium)</span><br/><strong>Where you live &rarr; Staying vs moving</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Life Events</em></td>
              <td style={sectionStyles.td}>Runs the plan with and without one move abroad and leads with the difference in what your heirs receive (the Estate Legacy Planner&rsquo;s net inherited amount, after US and foreign estate tax), then lifetime totals of state tax, federal tax before the credit, tax abroad, the US credit, health coverage and Medicare premiums, and the Medicare penalty. Says in which year either side runs out of money.</td>
              <td style={sectionStyles.td}>Shown only with a move abroad. <strong>Compare with the plan:</strong> appears with two or more moves abroad &mdash; take out one of them, or all. Taking a move out leaves the residence before it in place until the next move. Follows the app&rsquo;s today&rsquo;s-dollars setting. Nothing is recomputed: every figure is a ledger or estate field.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Form (Premium)</span><br/><strong>Where you live &rarr; Special regime / Yearly tax on your account balances</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Life Events</em></td>
              <td style={sectionStyles.td}>A regime for new residents replaces the normal tax on foreign income for a number of years counted from the move: a flat rate on all foreign income (wages earned there stay on the ordinary scale), or a fixed yearly amount plus an amount for a spouse. When it ends the ordinary rules apply from the next year &mdash; a step, shown in Year by Year. The balance tax charges bands of rates, per person, on the accounts you tick (taxable, Roth, traditional IRA/401(k)).</td>
              <td style={sectionStyles.td}><strong>Regime:</strong> rate (%) or yearly amount and spouse amount in local currency, not indexed; years (1&ndash;30); <strong>The US credits it</strong> off by default; can exempt the balance tax. <strong>Balance tax:</strong> bands in local currency per person, not indexed; never credited. <strong>Also added:</strong> investments on a scale of their own; Roth earnings as investment income; the treaty re-sourcing Social Security; a contribution on investment income only. <strong>Summaries:</strong> Italy (7% regime and EUR 300k lump sum as options, IVAFE 0.2%), Spain (savings scale, solidarity tax above EUR 3M), France (7.5% levy on investment income, 18.6% option).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Form (Premium)</span><br/><strong>Where you live &rarr; Inheritance tax / Taxed on what I bring in</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Life Events</em></td>
              <td style={sectionStyles.td}>If you still live abroad at the end of the plan: <strong>our summary&rsquo;s schedule</strong> (Italy, France, Philippines), <strong>a rate on each heir&rsquo;s share</strong> (a tax-free amount and rate for a child or parent, and for anyone else; a spouse exempt or not), <strong>one rate on the whole estate</strong>, or not included. Each heir&rsquo;s relationship comes from Tax &amp; Estate. <strong>Taxed on what I bring in:</strong> foreign income is taxed only up to what you spend there that year.</td>
              <td style={sectionStyles.td}><strong>Amounts</strong> in local currency, not indexed. <strong>Years before it taxes your worldwide estate:</strong> 0&ndash;30 (France 5); before that, nothing is charged on US assets. Relationships without their own rate: a parent is taxed as a child; a sibling, niece or nephew, or in-law as anyone else. <strong>Share brought in:</strong> 0&ndash;100% of spending there (default 100). <strong>Also added:</strong> it gives a credit for US tax on my investment income. <strong>Summaries:</strong> Thailand (remittance, LTR option), Philippines (6% estate tax), Belize, Uruguay (11-year holiday).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Form (Premium)</span><br/><strong>Where you live &rarr; More rules any country can use</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Life Events</em></td>
              <td style={sectionStyles.td}>Rules that Germany, Ireland, Greece, Malaysia, the UK and Australia need, open to any country you enter: the share of your Social Security the country taxes; a tax-free amount of investment income per person; a credit for the US tax on your pensions and IRA withdrawals (item by item, never more than its own tax on them); how much of the US tax it credits; a regime that ends after a set calendar year whatever year you arrived; and inheritance bands whose rate applies to the whole taxable amount (Germany) rather than slice by slice.</td>
              <td style={sectionStyles.td}><strong>Share of Social Security taxed:</strong> 0&ndash;100% (default 100; Germany 84). <strong>Tax-free investment income:</strong> local currency per person, not indexed (Germany EUR 1,000). <strong>Share of US tax credited:</strong> 0&ndash;100% (default 100; Malaysia 50, no treaty). <strong>Regime end year:</strong> 0 = none (Malaysia 2036). <strong>Share of a capital gain taxed:</strong> 0&ndash;100% (default 100; Australia 50). <strong>Share of each IRA/401(k) withdrawal taxed:</strong> 0&ndash;100% (default 100; pensions always in full) &mdash; Australia taxes only the growth, so lower it to your account&rsquo;s growth share. <strong>Capital gains on a scale of their own:</strong> a rate and tax-free amount separate from dividends (UK 24% above GBP 3,000); leave it off and gains join the dividend pool. <strong>Bands that start where your other income ends:</strong> for a scale of investment bands, the UK way of taxing dividends as a top slice. <strong>Summaries:</strong> Germany, Ireland (taxed on what you bring in), Greece (7% art. 5B regime as an option), Malaysia; the United Kingdom (Roth respected, 4-year exemption as an option, inheritance tax after 10 years) and Australia (half of gains, an optional two-thirds growth estimate for an IRA, no inheritance tax), each flagged for having no open retirement visa.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle + 4 Numbers</span><br/><strong>Lifetime Gifting</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Life Events</em></td>
              <td style={sectionStyles.td}>Models giving money away while you&rsquo;re alive: a number of recipients, an amount each per year, a starting age and a duration. Each gifting year is a real cash outflow funded by your normal withdrawal strategy, so an unaffordable plan produces a shortfall rather than passing silently &mdash; and the gifted money stops compounding, which the projection reflects.</td>
              <td style={sectionStyles.td}>Gifts within the annual exclusion ({usd(ANNUAL_GIFT_EXCLUSION_2026)} per recipient for {TAX_YEAR}; doubled with <strong>Split gifts with spouse</strong>) use none of your lifetime exemption and need no gift tax return. Anything above it still triggers no tax &mdash; it reduces the exemption sheltering your estate, which the Estate Legacy Planner subtracts. Growing with inflation grows the exclusion alongside the gift, so an at-the-exclusion plan stays there. <strong>Not modeled:</strong> direct tuition/medical payments (unlimited and excluded), 529 front-loading, charitable giving, and gifts to a non-citizen spouse &mdash; see Help &rarr; Guide.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Action</span><br/><strong>Educational Tool Disclaimer</strong></td>
              <td style={sectionStyles.td}>Reopens the disclaimer shown on your first visit, word for word.</td>
              <td style={sectionStyles.td}>Opens read-only with a Close button; it does not ask you to accept anything again and does not hide the app behind it. The same link appears in the one-line disclaimer at the foot of every tab.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Links</span><br/><strong>Terms of Use &amp; Privacy Policy</strong></td>
              <td style={sectionStyles.td}>The two legal documents behind the app, opened as ordinary web pages. The Terms say what the app is, what you may do with it, who owns what &mdash; we own the software, you own your plan &mdash; and what it does not promise. The Privacy Policy says what we hold, which for your plan data is nothing.</td>
              <td style={sectionStyles.td}>Both open outside the app and nothing is sent when you follow them. The same pair is linked from the one-line disclaimer at the foot of every tab. <strong>Worth reading once:</strong> because your plan lives on this device and we keep no copy, a lost browser profile takes it with it and we cannot restore it &mdash; which is what Backup Everything is for.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Action</span><br/><strong>Reset Plan to Defaults</strong></td>
              <td style={sectionStyles.td}>Clears every value you&rsquo;ve entered in the plan you have open and returns it to its starting defaults. It resets that plan only: saved scenarios, Detailed Holdings, the estate checklist, the Life Plan and your preferences stay. To remove everything the app keeps in this browser, use <strong>Erase everything on this device</strong>.</td>
              <td style={sectionStyles.td}>Cannot be undone &mdash; back up first. It sits at the bottom of Preferences &rarr; Your Data.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Action</span><br/><strong>Erase everything on this device</strong></td>
              <td style={sectionStyles.td}>Removes everything OutlastRetirement keeps in this browser: the plan, saved scenarios, Detailed Holdings, the estate checklist, the Life Plan, the annual review, the Premium Access Key, the Live Pricing connection and preferences, then reopens the app as on a first visit.</td>
              <td style={sectionStyles.td}>Asks first, offers <strong>Back Up Everything First</strong>, and needs ERASE typed before the button works. Backup files you have saved and a linked save file in your own folder are not touched. Cannot be undone. Last in Preferences &rarr; Your Data, below Reset Plan to Defaults.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Save warnings and the error screen</strong></td>
              <td style={sectionStyles.td}>When this browser&rsquo;s storage is full (or refuses to store anything), a banner says your latest change couldn&rsquo;t be saved and offers <strong>Download a backup</strong>. When the plan is changed in another tab, this tab says so and stops saving until you choose <strong>Load the newer version</strong>, so neither tab overwrites the other. If the app hits an error it cannot recover from, the error screen offers <strong>Download my data</strong> (everything the app keeps in this browser, as one file) and <strong>Reset this app&rsquo;s storage</strong> beside Try Again.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic. The storage banner stays until a later save of the same data works, or you close it. Reset this app&rsquo;s storage asks first and cannot be undone.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Display</span><br/><strong>Version and build</strong></td>
              <td style={sectionStyles.td}>The app&rsquo;s version number (the same number as the newest What&rsquo;s New entry) and the build it is running, for support questions.</td>
              <td style={sectionStyles.td}>Shown at the foot of Preferences, beside the copyright line; hover it for the build date. The sidebar shows the version alone.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyles.card} data-reference-card>
        <h2 style={sectionStyles.cardTitle}>
          <Settings size={20} />
          Plan Settings
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          <strong>Plan</strong> in the sidebar holds the assumptions and financial inputs that drive the projection. They apply across every tab unless an optimizer overrides one for its own comparison. Plan (Guided) asks for the same values one section at a time and Plan (Advanced) shows them all at once &mdash; both write the same plan.
        </p>
        <table style={sectionStyles.table}>
          <thead>
            <tr>
              <th style={sectionStyles.th}>Input / Widget</th>
              <th style={sectionStyles.th}>Purpose & Effect</th>
              <th style={sectionStyles.th}>Valid Inputs / Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Number Input</span><br/>
                <strong>Annual Lifestyle Spending</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Spending &rarr; Retirement Spending Target</em>
              </td>
              <td style={sectionStyles.td}>Your target annual spend <em>once retired</em>, in today&rsquo;s dollars, inflated forward each year. The single most consequential number in the plan: it&rsquo;s what the portfolio has to sustain, and it&rsquo;s also the basis for the FI/CoastFIRE target (spend &divide; Safe Withdrawal Rate) and for the three-phase Go-Go/Slow-Go/No-Go multipliers. Distinct from Current Household Spending, which is what you spend <em>while still working</em>.</td>
              <td style={sectionStyles.td}>Any positive dollar amount. The <strong>Annual Lifestyle</strong> slider in the header edits this same field (range $30k&ndash;$300k) &mdash; the gear icon next to it jumps here. On a phone the header cards fold into one line on every page but the Dashboard; tap that line to reach the slider. The Spending section also offers month-by-month entry; when that mode is active this field shows the twelve-month total read-only.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Toggle + Number</span><br/>
                <strong>Current Household Spending (Pre-Retirement)</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Spending &rarr; Current Household Spending</em>
              </td>
              <td style={sectionStyles.td}>What you actually spend <em>while still working</em>, kept separate from the retirement target above. Without it the model can show retirement accounts being drawn down years before you retire to cover a gap that is really just the difference between what you spend now and what you plan to spend later.</td>
              <td style={sectionStyles.td}><strong>Auto</strong> (default): recalculated every working year as salary + pensions/other income &minus; taxes &minus; savings contributions. The resulting figure is <strong>shown on the page</strong>, annually and monthly, with the four lines that produce it. Because it is money in minus money that provably was not spent, it cannot miss a spending category the way a budget built up from categories can. Two limits are printed alongside it: it is a residual, so any error in your salary, tax or contribution figures lands in it; and it absorbs one-off years, so a year with a large one-time purchase reads as ordinary spending. Mortgage and other debt payments are paid out of this figure while you are working, and the page shows that share and what is left for everything else; they do not reduce your contributions. If a year does not balance and the plan trims spending to fund it, the trim is reported separately so you can see both what your income supported and what was actually spent. <strong>Custom</strong>: enter your real budget in today&rsquo;s dollars, leaving out mortgage and debt payments, which are charged beside it; the model inflates it each year. Only the working years are affected &mdash; retirement spending always comes from Annual Lifestyle Spending.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Category Ledger</span><br/>
                <strong>Break it down by category</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Spending &rarr; under Retirement Spending Target</em>
              </td>
              <td style={sectionStyles.td}>A third way to enter Annual Lifestyle Spending, alongside a single annual figure and the twelve monthly boxes. Seven categories &mdash; housing, food and groceries, transport, ongoing health, insurance, personal and discretionary, other &mdash; each holding as many labeled lines as you want, summing to the same annual total every projection function reads. Free. A separate <strong>Health coverage before 65</strong> line sits outside the seven and is left out of the total, because the plan adds that cost on its own line per spouse under 65. Each category carries an <strong>essential</strong> tick. It drives the guaranteed-income floor, floor-aware guardrails and the phase curve.</td>
              <td style={sectionStyles.td}>Saved with the plan, in scenarios and backups. A line keeps its category even if you rename it. While the ledger is in use, Annual Lifestyle Spending goes read-only, and the ledger also drives <strong>Housing Share of Spending</strong> (your housing category&rsquo;s share of the total) and <strong>Healthcare Bridge Cost</strong> plus its premium split (from the pre-65 line) &mdash; both shown disabled with a &ldquo;from your categories&rdquo; badge. <strong>Unlink</strong> hands either field back to you and is never entitlement-gated; it does not delete the ledger. Switching back to a single annual figure also keeps it. An unrecognized category from an old backup is kept as a custom line rather than discarded. The categories also drive inflation: housing grows at Housing Inflation, ongoing health at Medical Inflation, and everything else at the general rate. Annual Lifestyle Spending stays a single figure, so the sensitivity chart, Die With Zero and the required-portfolio search work the same either way.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Premium Import</span><br/>
                <strong>Fill the ledger from a bank or card export</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Spending &rarr; below the category ledger</em>
              </td>
              <td style={sectionStyles.td}>Reads a transactions CSV from a bank or card issuer and sorts it into the category ledger. Institution-agnostic: it looks for a description column and an amount (or a debit/credit pair) rather than matching a per-bank template. It detects whether spending is written as negative or positive amounts and reports which, flags likely transfers and card payments (counting a card payment <em>and</em> the card&rsquo;s charges double-counts the card) and excludes them by default while still showing them, and measures the real date span so a partial year can be scaled up with the factor stated. Categorization is a simple keyword match: recognized merchants are assigned, everything else is marked &ldquo;guessed&rdquo; and lands in Other. Requires categories mode. Nothing is parsed or uploaded anywhere &mdash; the file is read in your browser.</td>
              <td style={sectionStyles.td}>Every row is shown with a checkbox and a category dropdown, and <strong>nothing is written until you press &ldquo;Add these to my ledger&rdquo;</strong>. Rows it could not read at all are counted and reported rather than dropped silently. &ldquo;Scale to a full year&rdquo; is on by default and shows its multiplier; under 60 days of data it warns that the extrapolation is large. When you add them, lines from any previous import are replaced and lines you typed yourself are kept.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Premium Readout + Toggle</span><br/>
                <strong>Does your guaranteed income cover the essentials?</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Spending &rarr; below the category ledger</em>
              </td>
              <td style={sectionStyles.td}>Compares the categories you ticked essential against <strong>guaranteed</strong> income &mdash; Social Security, pensions and a purchased annuity. Rental income is excluded (a tenant can leave) and so is a reverse-mortgage payout (borrowing, not income). Reports whether the floor is covered, the first year it is, and the widest shortfall. Needs the category ledger with at least one category ticked essential; without that it says so rather than inventing a floor of zero. The essential share itself is free &mdash; it is the answer that is Premium.</td>
              <td style={sectionStyles.td}>Output only. Alongside it, <strong>Cut discretionary spending, not everything, after a crash</strong> (off by default) changes what the spending guardrail does after a retirement-entry crash: instead of a flat 10% off the whole budget, the cut comes only from discretionary spending and can never reach the essentials. <strong>Cut this much of discretionary spending</strong> (25% by default) sets how hard. Expect it to cut deeper than 10% of total for a household with lots of discretionary and shallower for one that is nearly all essentials &mdash; both directions are the point. Requires the spending guardrail to be on and a ledger to exist; otherwise inert.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Premium Worksheet</span><br/>
                <strong>Turn that into a retirement target</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Spending &rarr; below Current Household Spending</em>
              </td>
              <td style={sectionStyles.td}>Bridges the gap between what you spend today and Annual Lifestyle Spending. It exists because that field is <strong>not</strong> total retirement spending &mdash; it is total retirement spending minus every cost the plan already adds on its own line (mortgage and other debt, the pre-65 healthcare bridge, Medicare and IRMAA, long-term care, Life Events, and gifting). Including those in your lifestyle figure charges them twice for the whole of retirement. The worksheet subtracts your current debt payments, read from Mortgage Payment and Other Debt Payment and shown as two lines (a mortgage may continue into retirement; consumer debt carried past your last paycheck is paid from taxable withdrawals), plus the health and work costs you enter, adds the retirement increases you enter, and lists every excluded cost with where it lives instead.</td>
              <td style={sectionStyles.td}>Three currency inputs ($/yr, today&rsquo;s dollars): health premiums and out-of-pocket while working; costs that stop when work does; what goes up in retirement. All default to 0, so the bridge does nothing until used, and all three are saved with the plan, in scenarios and backups. <strong>Use this as my Annual Lifestyle Spending</strong> writes the result once &mdash; the field is not locked, linked or badged afterwards, and re-editing it by hand is expected. If the subtractions exceed the starting figure the target is held at zero and says so rather than showing a silent zero. Premium; free users see the explanation and their starting figure with nothing to fill in.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>2 Numbers</span><br/>
                <strong>Investment Fees &mdash; Fund Expenses / Advisor Fee</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Assumptions &amp; Risk &rarr; Investment Fees</em>
              </td>
              <td style={sectionStyles.td}>What your investments cost each year, as a percent of what you hold: your funds&rsquo; expense ratios, and any percent-of-assets fee to an advisor or managed account. Every return in the plan is <strong>before</strong> fees; each year, after the year&rsquo;s return, the plan takes both off your Pre-Tax, Roth, Taxable and HSA balances (not the cash reserve, the home or a concentrated stock position), and the same fees apply to an heir&rsquo;s inherited accounts. They are not deductible. Risk &rarr; <strong>What fees cost you</strong> shows your plan beside the same plan with a 1% advisor fee, or without the one you pay: fees paid, what is left, historical starts lasted, and the most you could safely spend.</td>
              <td style={sectionStyles.td}>Percentages, 0 to 5. Fund expenses default to 0.10% (broad index funds); the advisor fee defaults to 0. The Year by Year CSV has a column for each.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Number Input</span><br/>
                <strong>Keep at Least</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Assumptions &amp; Risk &rarr; Keep at Least</em>
              </td>
              <td style={sectionStyles.td}>A balance, in today&rsquo;s dollars, you never want to go below once retired. With it set, the Monte Carlo success rate, the historical starts and the most you could spend and still last through every start count a run as lasting only if your Pre-Tax, Roth, Taxable and HSA accounts plus the cash reserve never end a retired year below it. It does not change your spending; it changes what counts as success. The verdict says when even average returns would dip below it.</td>
              <td style={sectionStyles.td}>Dollars, today&rsquo;s. Default 0 (off). Grows with inflation.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Number Input</span><br/>
                <strong>Investment Return &mdash; Working / Retired</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Assumptions &amp; Risk &rarr; Return Assumptions</em>
              </td>
              <td style={sectionStyles.td}>The flat average annual return applied to the portfolio before and after retirement. Used whenever <strong>Dynamic Asset Allocation</strong> is switched off (the default); when it&rsquo;s on, return is derived from your stock/bond mix instead and these two are ignored. The Retired rate is usually set lower, reflecting a more conservative allocation.</td>
              <td style={sectionStyles.td}>Percentages, 0.1 steps. Whichever model is inactive shows an &ldquo;Currently Overridden&rdquo; notice so it&rsquo;s always clear which one the projection is actually using.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Toggle + 2 Numbers</span><br/>
                <strong>Get more conservative each year in retirement</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Assumptions &amp; Risk &rarr; Return Assumptions</em>
              </td>
              <td style={sectionStyles.td}>Steps your <strong>Investment Return &mdash; Retired</strong> figure down by a fixed amount for each year you&rsquo;ve been retired, rather than holding it flat for life, and stops once it reaches a floor you set. Models a portfolio that shifts toward bonds and cash as you age without having to describe an actual stock/bond mix. Your first retired year always uses the full retired return &mdash; the reduction counts years <em>already</em> retired, so it starts applying in year two.</td>
              <td style={sectionStyles.td}><strong>Annual Return Reduction</strong> (percentage points removed per retired year, 0.05 steps) and <strong>Return Floor</strong> (the return never drops below this). The panel states which retirement year the floor is reached in, and says so plainly if your figures would produce no change at all. Applies to the Monte Carlo simulation as well as the main projection. Unavailable while <strong>Dynamic Asset Allocation</strong> is on, because the projection ignores it there &mdash; use <strong>Glide Allocation</strong> in that section instead, which does the same job by reducing your stock percentage.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Number Input</span><br/>
                <strong>Market Volatility &mdash; Working / Retired</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Assumptions &amp; Risk &rarr; Return Assumptions</em>
              </td>
              <td style={sectionStyles.td}>The standard deviation of annual returns &mdash; how far a typical year lands from your assumed average. Read <strong>only</strong> by the Monte Carlo simulation (Risk &amp; Stress &rarr; Monte Carlo), where it is the dominant influence on the reported success probability; the main projection, Dashboard, and year-by-year ledger never see it. Lowering it raises your success probability without making the plan safer &mdash; you have only assumed a calmer market. The trials are drawn lognormal around your <em>compound</em> return, so the middle trial grows at the rate you typed and the volatility sets the spread around it.</td>
              <td style={sectionStyles.td}>Percentages, 0.5 steps. A stock-heavy portfolio has historically run about 15&ndash;18%; a 60/40 mix about 10&ndash;12%. Set to 0 and every trial draws the same return, collapsing the simulation to the main projection. When <strong>Dynamic Asset Allocation</strong> is on these are ignored and volatility is derived from your stock/bond mix (16% assumed for stocks, 5% for bonds); the panel shows the two derived figures. Defaults: 15% working, 11.6% retired &mdash; the retired figure is the same derivation at the default 60/40 mix, so switching Dynamic Asset Allocation on or off does not change the assumed retirement risk.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Toggle + 2 Numbers</span><br/>
                <strong>Inflation Uncertainty (Monte Carlo)</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Assumptions &amp; Risk &rarr; Return Assumptions</em>
              </td>
              <td style={sectionStyles.td}>Off, every Monte Carlo trial inflates at your Inflation Rate exactly. On, each trial year also draws its own inflation around that rate, correlated with the same year&rsquo;s return draw, so bad markets and high inflation tend to arrive together. The difference from your planned rate is added to lifestyle spending&rsquo;s general, Housing and Health slices for that year; salary, Life Events, Social Security COLA and the other category-specific inflation rates stay on their planned figures. Read <strong>only</strong> by the Monte Carlo.</td>
              <td style={sectionStyles.td}><strong>Inflation Volatility</strong>: standard deviation of one year&rsquo;s inflation, 0&ndash;10%, default 1.5 (US CPI since 1990; since 1928 closer to 4). <strong>Return Correlation</strong> (between a year&rsquo;s return and its inflation): &minus;1 to 1, default &minus;0.2; 0 draws the two independently. Off by default, and off it changes nothing at all.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Number + Button</span><br/>
                <strong>Trial Seed / Reshuffle</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Risk &amp; Stress &rarr; Monte Carlo</em>
              </td>
              <td style={sectionStyles.td}>The Monte Carlo draws its 1,000 trials from this seed, so the same plan and seed give the same success probability and percentile curves every run. It travels with the plan (backups, scenarios). <strong>Reshuffle</strong> picks a new seed for a fresh set of trials; a result that moves by more than a point or two between seeds means the plan sits near the edge.</td>
              <td style={sectionStyles.td}>Any positive whole number; Reshuffle draws one at random. The result cards show the seed they were produced with, and say so if you have reshuffled since.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Toggle</span><br/>
                <strong>Planning with a spouse or partner?</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Household</em>
              </td>
              <td style={sectionStyles.td}>Adds a second person to the plan, with their own birth year, retirement age, Social Security and pensions, and makes the joint filing statuses available.</td>
              <td style={sectionStyles.td}>On or off.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Dropdown</span><br/>
                <strong>Sex</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Household, per person</em>
              </td>
              <td style={sectionStyles.td}>Selects which Social Security life-table curve is used for the odds shown under Life Expectancy and on Retirement Readiness, and for the Monte Carlo&rsquo;s Longevity Uncertainty option. Nothing in the tax, benefit or estate calculations reads it.</td>
              <td style={sectionStyles.td}><strong>Not stated</strong> (default; a 50/50 blend of the two curves), <strong>Female</strong>, <strong>Male</strong>. A plan without this setting reads as Not stated.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Read-only</span><br/>
                <strong>Life-table odds</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Under each Life Expectancy; Retirement Readiness</em>
              </td>
              <td style={sectionStyles.td}>From the SSA&rsquo;s 2023 period life table (2026 Trustees Report): the chance a person of this age and sex reaches the Life Expectancy typed, the age half of them reach, and the ages one in four and one in ten reach. Readiness adds the year the plan runs to, each person&rsquo;s planned age and the year it falls in, and, for a couple, the chance that at least one is alive when the plan ends (the two treated as independent, which slightly overstates it). A period table freezes today&rsquo;s death rates and covers the whole population, so a healthy, well-off household&rsquo;s real odds run a few years better.</td>
              <td style={sectionStyles.td}>Informational. Changing Life Expectancy, birth year, plan year or Sex updates it. It does not change the projection; the plan still runs to the Life Expectancy you set.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Toggle</span><br/>
                <strong>Longevity Uncertainty (Monte Carlo)</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Assumptions &amp; Risk &rarr; Return Assumptions</em>
              </td>
              <td style={sectionStyles.td}>Off, every Monte Carlo trial runs to the Life Expectancy ages exactly. On, each trial draws an age at death per person from the life table (conditioned on their current age and Sex) and the trial&rsquo;s plan ends at its last death, earlier or later than the planned horizon, with the survivor transition happening whenever the first death lands. Success counts the whole trial. The result card reports the share of trials that outlived the planned horizon.</td>
              <td style={sectionStyles.td}>ON/OFF, default OFF. Read <strong>only</strong> by the Monte Carlo; the main projection is unchanged. The percentile chart keeps the planned horizon as its width, and a later year&rsquo;s band comes from the trials still running then.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Select + Fields</span><br/>
                <strong>Return Model (Monte Carlo)</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Assumptions &amp; Risk &rarr; Return Assumptions</em>
              </td>
              <td style={sectionStyles.td}><strong>Lognormal</strong> (default) draws each year independently from a lognormal whose median is the stated compound return, with the volatility above. <strong>Historical bootstrap</strong> builds each trial from blocks of consecutive real calendar years, 1928 onward (S&amp;P 500 total return and 10-year Treasury total return per Damodaran/NYU Stern; CPI-U per the Minneapolis Fed), blended at your stock/bond allocation for the phase, each year carrying its own inflation &mdash; so downturns cluster, the left tail is history&rsquo;s, and a bad market can arrive with high inflation. <strong>Block length</strong> sets how many consecutive years each draw copies (5 keeps 1929&ndash;32, 1973&ndash;74, 2000&ndash;02 intact). <strong>Level</strong>: re-centered on your assumptions multiplies every sampled return so the history&rsquo;s compound mean becomes your stated rate and shifts inflation so its mean becomes your inflation rate; as history uses the raw figures.</td>
              <td style={sectionStyles.td}>Default lognormal, block 5, re-centered. Monte Carlo only. Under the bootstrap, inflation is always sampled (the Inflation Uncertainty toggle and its correlation are not used) and the volatility inputs are not used. The history runs through the last full calendar year.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Toggle</span><br/>
                <strong>Long-Term Care Uncertainty (Monte Carlo)</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Assumptions &amp; Risk &rarr; Return Assumptions</em>
              </td>
              <td style={sectionStyles.td}>Off, the trials charge long-term care exactly as Healthcare &amp; LTC says (a fixed episode or none). On, each trial draws per person whether a paid-care episode happens (62% for a woman, 48% for a man, 56% unstated &mdash; rounded from the HHS/ASPE and Urban Institute projections for people turning 65), its length (exponential, mean 3.7 / 2.2 / 3.0 years, capped at ten, so about one in five runs past five years), and its start, placed uniformly in the eight years before that trial&rsquo;s age at death and cut off at death, so the care a trial actually pays for is on average shorter than the average episode. The person&rsquo;s own annual LTC cost on Healthcare &amp; LTC is charged, inflated at the LTC rate. A fixed episode set there is replaced in the trials.</td>
              <td style={sectionStyles.td}>ON/OFF, default OFF. Monte Carlo only. Simplifications: no home-versus-facility split, one episode per person, and needing care does not shorten the trial&rsquo;s life. The result card shows the share of trials with an episode.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Text Input</span><br/>
                <strong>Birth Year / Retirement Age</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Household, per person</em>
              </td>
              <td style={sectionStyles.td}>Birth Year sets each person&rsquo;s age in every year of the plan, and with it their full retirement age for Social Security. Retirement Age is when that person&rsquo;s salary and contributions stop.</td>
              <td style={sectionStyles.td}>Birth Year: 1926&ndash;2008. Retirement Age: 40&ndash;90, in whole years. A person already past their Retirement Age is treated as retired.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Text Input</span><br/>
                <strong>Life Expectancy</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Household, per person</em>
              </td>
              <td style={sectionStyles.td}>The age the plan runs to for that person. The plan ends when the last person reaches theirs.</td>
              <td style={sectionStyles.td}>A whole number from the Retirement Age up to 120; 90&ndash;95 is common. The life-table odds under the field show how likely that age is.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Number Input</span><br/>
                <strong>Annual Salary ($/yr)</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Income, per person</em>
              </td>
              <td style={sectionStyles.td}>What each person earns from work before tax, in today&rsquo;s dollars. It grows with the general Inflation Rate and stops at that person&rsquo;s Retirement Age. It pays for spending and savings while working and is taxed as wages, including Social Security and Medicare payroll tax.</td>
              <td style={sectionStyles.td}>Dollars per year, $0 or more (default $75,000 and $45,000). Part-time work after retiring is entered separately, under Phased / Part-Time Retirement Income.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Switch + 3 Fields</span><br/>
                <strong>Survivor Stress Test: Who passes away prematurely? / Age they pass away / Household Expense Reduction (%)</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Household, shown with a spouse in the plan</em>
              </td>
              <td style={sectionStyles.td}>Tests the plan if one of you dies early. From the chosen age the plan runs as a single survivor: Single tax brackets and standard deduction, the larger of the two Social Security checks, and household spending cut by the reduction you set.</td>
              <td style={sectionStyles.td}>Off by default. <strong>Who passes away prematurely?</strong>: either person. <strong>Age they pass away</strong>: 30&ndash;110 (default 75). <strong>Household Expense Reduction (%)</strong>: 0&ndash;100 (default 20), applied to spending from that year on.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Text Input</span><br/>
                <strong>Starting Balances (Pre-Tax, Roth, Taxable) &mdash; Balances &amp; Debt</strong>
              </td>
              <td style={sectionStyles.td}>The money the projection starts from, by tax treatment. Each account type is taxed its own way on the way out. Balances are treated as of January 1 of the plan&rsquo;s first year, and that year counts as a full year of income, spending and growth. The Guided view asks for the same fields in its Account Balances step.</td>
              <td style={sectionStyles.td}>Dollars, $0 or more. Pre-Tax is a traditional IRA or 401(k); Roth grows tax-free; Taxable is an ordinary brokerage account; HSA is the fourth field. Linked to Detailed Holdings (see below), all four go read-only and follow your holdings; Unlink switches back to typing them.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Number + Percent</span><br/>
                <strong>Known Cost Basis of Taxable Brokerage / Starting Capital Gains Ratio</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Spending &rarr; Withdrawals &amp; Taxable Account</em>
              </td>
              <td style={sectionStyles.td}>What you actually paid for your taxable holdings decides how much of each taxable withdrawal is a taxable capital gain. Enter the basis from a brokerage statement, or link it to real per-lot data from Detailed Holdings; leave it at $0 and the engine instead seeds basis from the Starting Capital Gains Ratio (the assumed unrealized-gain share of today&rsquo;s balance). Either way basis is tracked dynamically from there as the account grows, is contributed to, and is drawn down. Reinvested dividends add to it &mdash; they were already taxed as income the year they arrived, so taxing them again as a gain on sale would charge the same dollar twice.</td>
              <td style={sectionStyles.td}>Basis in dollars ($0 means work it out from the ratio). The ratio is a number field, 0&ndash;100% (default 60%), and is used only while the basis is $0. From the first year on, the basis moves with the account: contributions and reinvested dividends add to it, and withdrawals take their share out.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Link / Button</span><br/>
                <strong>Detailed Account Tracking (Premium)</strong>
              </td>
              <td style={sectionStyles.td}>A card above the Initial Account Balances fields that opens Detailed Holdings (Premium): your individual holdings, each tagged with its tax treatment. <strong>Link to Detailed Holdings</strong> ties the four Initial Balances fields to your holdings&rsquo; totals, so they follow the holdings as they change; you can unlink back to typing them at any time. While unlinked and different from the holdings (any bucket off by $1 or more, after netting out linked concentrated and cash positions), the Initial Nest Egg card shows &ldquo;Typed in by hand&rdquo; with the holdings&rsquo; Pre-Tax + Roth + Taxable total, the Holdings sub-tab shows both four-bucket totals above Sync, and statement-import confirmations say the plan was not changed.</td>
              <td style={sectionStyles.td}>Without Premium, the card opens the Premium page, which says what Premium includes and how to ask for access (invite-only and free while in beta). With a valid Premium Access Key it opens Detailed Holdings.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Text Prompt</span><br/>
                <strong>Premium Access Key</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Preferences</em>
              </td>
              <td style={sectionStyles.td}>Unlocks Premium: Detailed Holdings, Retirement Spending, Readiness in Full, and Relocation &amp; Residency. It is a signed key, not an account or a login, and it carries no name or email. Live Pricing does not depend on it.</td>
              <td style={sectionStyles.td}>Sent to you by email when Premium is enabled; paste it into Preferences &rarr; Premium Access Key. Submitting an empty field removes it. A key lasts 30 days and is renewed by email; Preferences shows its status (not set / active until a date / invalid or expired).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Text Input (Premium)</span><br/>
                <strong>Pricing Source (Holdings sub-tab &rarr; Import / Export)</strong>
              </td>
              <td style={sectionStyles.td}>Two URLs &mdash; an Apps Script Web App URL (the main connection: quotes read live from your Sheet, plus automatic new-ticker registration in one batched call) and an optional published-CSV URL (fallback read path) &mdash; that connect the Holdings sub-tab's "Refresh Prices & Dividends (Live)" action to your own free Google Sheet, instead of typing Current Price/Annual Dividend/Payout Frequency in by hand. No Premium Access Key or purchase involved &mdash; this is a per-browser connection to a Sheet you own and run yourself. Only a ticker symbol is ever sent to it; share counts, account labels, and dollar totals never leave the browser. The Sheet&rsquo;s script then looks the symbol up with Google Finance and Yahoo Finance from Google&rsquo;s servers; those services see the symbol, not you, and the answers are cached in the script&rsquo;s own storage on your Google account.</td>
              <td style={sectionStyles.td}>The one-time setup (about five minutes: copy the pricing Sheet, deploy its script in your Google account, paste its address here) is at outlastretirement.com/pricing-script. The Sheet then refreshes itself every 6 hours so prices stay current without being open. Without the Apps Script URL, Refresh still prices tickers already on your Sheet through the CSV, but won&rsquo;t add new ones and reads lag the live Sheet by a few minutes. Saved in this browser with the rest of your holdings and included in Backup Everything; Restore Backup shows both links and restores them only if you switch on <strong>Also restore my Live Pricing connection</strong>. Only Google addresses are accepted (docs.google.com, script.google.com or googleusercontent.com, over https); anything else shows an error under the field and is never contacted. After each refresh, the time it finished shows beside the button (for example, Last refreshed today at 4:41 PM); that time is kept on this device only and is not in backups.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>File Upload (Premium)</span><br/>
                <strong>Import from Portfolio Tracker Backup (Holdings sub-tab &rarr; Import / Export, last item)</strong>
              </td>
              <td style={sectionStyles.td}><strong>Use this if you have a Portfolio Tracker app backup file (.json).</strong> Loads its &ldquo;Complete System Backup&rdquo; export and brings in its holdings, with dividend rate, purchase date, and full lot and sale history when present. Read entirely in your browser. The only one of the three Holdings sub-tab import options that brings in real historical detail, not just a current snapshot.</td>
              <td style={sectionStyles.td}>Accepts a .json file. Groups holdings by account and requires you to confirm/correct a guessed tax treatment (Pre-Tax/Roth/Taxable/HSA) per account before committing &mdash; the source file has no tax-treatment field of its own. Choose "Add to Existing" or "Replace All". For a plain spreadsheet instead, see Upload Holdings CSV below; for a real brokerage statement, see Import from a Brokerage Statement below.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>File Upload/Download (Premium)</span><br/>
                <strong>Upload/Download Holdings CSV (Holdings sub-tab &rarr; Import / Export)</strong>
              </td>
              <td style={sectionStyles.td}><strong>Use this only for a plain spreadsheet</strong> &mdash; Download Holdings CSV exports every holding's summary fields (symbol, shares, price, account, etc.) as a CSV; Upload Holdings CSV reads one back in using those same column headers and adds the rows to your existing holdings. Handy for bulk edits in Excel/Sheets, but it doesn't carry lot/dividend/liquidation history.</td>
              <td style={sectionStyles.td}>Not for a Portfolio Tracker app backup (.json) or a brokerage statement &mdash; those need the two import options above/below instead and won't be read correctly here. Use Backup Everything instead of this CSV round trip if you need full fidelity. Numbers may include $ signs, thousands commas, or parentheses for negatives. A text cell that begins with =, +, - or @ is exported with a leading apostrophe so a spreadsheet shows it as text rather than running it as a formula; reading the file back removes the apostrophe.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>File Upload / Paste (Premium)</span><br/>
                <strong>Import from a Brokerage Statement (Holdings sub-tab &rarr; Import / Export)</strong>
              </td>
              <td style={sectionStyles.td}><strong>Use this if you have a real brokerage statement</strong> &mdash; upload the PDF (one with real embedded text, not a scanned image) or paste text copied from one. A reader built for that brokerage&rsquo;s layout turns it into rows for you to review before importing; a statement from a brokerage without its own reader goes through a general, best-effort one.</td>
              <td style={sectionStyles.td}>Imported holdings carry today&rsquo;s Current Price. Avg Buy Price comes from the statement when it prints the position&rsquo;s cost, and otherwise starts at 0 (fill it in, or add Lots, for cost-basis/CAGR tracking). A statement never carries purchase history. For a Portfolio Tracker app backup instead, use Import from Portfolio Tracker Backup above.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Form (Premium)</span><br/>
                <strong>Ann. Dividend/Share (Distributions sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>Each holding's trailing annual dividend/distribution per share (a full year, not a quarterly rate). Drives that holding's Annual Income (shares &times; this value) and its contribution to the Pre-Tax/Roth/Taxable/HSA dividend-income totals. Frequency below only estimates a per-payment split of this total for display &mdash; it's never multiplied back in.</td>
              <td style={sectionStyles.td}>Currency value ($0 or positive), per share. The Dividends table itself is read-only &mdash; click a row's pencil <strong>Edit</strong> action to open the dialog and change this. Defaults to $0; Live Pricing fills it when connected.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Form (Premium)</span><br/>
                <strong>Frequency (Distributions sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>How often this holding actually pays (Monthly/Quarterly/Semi-Annual/Annual/Irregular). Used only to derive an estimated per-payment dollar amount from Ann. Dividend/Share above &mdash; no payment dates or schedule are tracked.</td>
              <td style={sectionStyles.td}>Dropdown inside the row's pencil <strong>Edit</strong> dialog, optional &mdash; the table itself displays it read-only as a badge. Defaults to "Not Set / Unspecified." Irregular and Unspecified show &ldquo;&mdash;&rdquo; for the per-payment estimate rather than guessing an even split for a holding with no fixed cadence.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Form (Premium)</span><br/>
                <strong>Distribution Character (Distributions sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>How a taxable-account distribution is taxed when it's paid &mdash; Qualified Dividend, Ordinary (Non-Qualified) Dividend, Long-Term Capital Gain Distribution, Return of Capital, or Mixed/Fund-Dependent for a fund that pays a real blend. There is no short-term capital gain option: a fund reports short-term gains among ordinary dividends on the 1099-DIV. Separate from Tax Treatment (Holdings sub-tab), which is about the account, not the distribution. It feeds the &ldquo;By Character&rdquo; breakdown above the table, and it reaches the tax projection in two ways: Return of Capital keeps that holding out of the linked taxable yield (it reduces basis instead of being income), and Ordinary Dividend sets how much of a linked yield is taxed as ordinary income.</td>
              <td style={sectionStyles.td}>Dropdown inside the row's pencil <strong>Edit</strong> dialog, optional, with a hover note beside its label; not shown as a table column. Defaults to &ldquo;Not Set / Unspecified.&rdquo; A logged payment can carry its own type, which wins over the holding&rsquo;s character for that one payment.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Toggle (Premium)</span><br/>
                <strong>DRIP status (Distributions sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>Whether this holding's distributions reinvest (DRIP) or pay out to cash &mdash; drives the "DRIP vs Cash Destination" KPI card's split of total dividend income. Purely a label on the holding; it doesn't simulate actually buying new shares with reinvested cash.</td>
              <td style={sectionStyles.td}>A colored "Reinvesting" (green) / "Cash" (gray) pill button, click to flip &mdash; shown directly on the table row and on each card in Distribution Schedule &amp; Timeline, and also settable from inside the pencil Edit dialog. Defaults to Reinvesting (true) for a new holding.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Display (Premium)</span><br/>
                <strong>Distribution matrix (Distributions sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>A row per kind of distribution against two different bases, side by side on purpose. The Est. columns look FORWARD: each holding's Ann. Dividend/Share times its shares, so they exclude capital gain distributions and return of capital &mdash; often a fund's largest payout of the year &mdash; and land in the row named by that holding's Distribution Character, since a dividend rate carries no type of its own. The Received columns look BACK at what actually arrived, of every type, from logged payments and from tax lots marked DRIP Reinvestment; there a distribution event's own type wins, and a reinvestment lot (which has no type) falls back to the holding's Character. Return of capital gets a row but is excluded from taxable income, hence two total lines.</td>
              <td style={sectionStyles.td}>Not an input. The two bases are not expected to match; a large gap usually means a fund paying mostly capital gains, or lots still unlabeled (the count on the same sub-tab). Yield is last complete year&rsquo;s distributions over current value. &ldquo;Last 12 mo&rdquo; is the twelve complete months ending last month, and is the figure the Retirement Income sub-tab can be built from. Click a row&rsquo;s name to list the holdings behind it and open one &mdash; the way to empty a &ldquo;Kind not stated&rdquo; row, which only means those holdings have no Distribution Character. A payment logged as Dividend or Other follows the holding&rsquo;s character; a more specific type (Return of Capital, Interest, Capital Gain Distribution) wins over it. Neither card feeds the plan: the yield that does (Taxable Brokerage Dividend Yield) counts every taxable distribution from Taxable holdings only, and a distribution inside an IRA, 401(k), Roth or HSA never reaches your tax projection.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Action (Premium)</span><br/>
                <strong>Edit / Remove lot (Tax Lots, Asset History &amp; Distribution Ledger)</strong>
              </td>
              <td style={sectionStyles.td}>Corrects a tax lot where you see it. The pencil opens the lot&rsquo;s date, shares and price for editing; the trash can removes the lot after you confirm. Two lots with the same shares and price dated within five days of each other carry a note that they may have been entered twice.</td>
              <td style={sectionStyles.td}>Shares must be above zero to save. Either action changes the holding&rsquo;s share count and cost basis at once, and removing a DRIP Reinvestment lot also removes its dividend from the income figures unless the same payment is logged on the Distribution Ledger tab. The duplicate note is a prompt only: nothing is removed for you.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Dropdown (Premium)</span><br/>
                <strong>Source (Tax Lots, Asset History &amp; Distribution Ledger)</strong>
              </td>
              <td style={sectionStyles.td}>
                Says how you came to own the shares in that lot. This is not cosmetic: it decides whether those shares are
                treated as dividend income you received, on the Dividends month chart and in Lifetime Distributions. There
                are four values, and only one of them counts as income:
                <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                  <li><strong>Purchase</strong> &mdash; new money you put in: a buy, a contribution, a transfer in. Adds to your
                    cost basis. <em>Not income</em> &mdash; it is money going out of your pocket, not coming back to you.</li>
                  <li><strong>DRIP Reinvestment</strong> &mdash; shares bought with a distribution the holding paid you. Adds to
                    your cost basis too (you were taxed on the payment, so those dollars are already yours).
                    <em>Counts as income</em>, valued at the shares bought times the price they were bought at, in the month
                    of the lot&rsquo;s date. This is the one to get right &mdash; a purchase mislabeled here overstates your
                    income by the entire value of the lot.</li>
                  <li><strong>Opening Balance (Imported)</strong> &mdash; not something you pick; the importer creates it. When
                    imported history records a sale of more shares than the imported history can account for, those extra
                    shares must have been held before the record began. Rather than invent a fake purchase or leave the sale
                    impossible, one lot is added, sized to exactly the shortfall and labeled for what it is: shares of
                    unknown origin that predate your data. <em>Not income.</em> Its price is a best estimate, so it is worth
                    replacing with a real lot if you know the actual date and price.</li>
                  <li><strong>Not specified</strong> &mdash; imported shares whose origin the source data never stated. <em>Not
                    income</em>, and deliberately so: the app will not guess between a contribution and a reinvestment, because
                    guessing wrong reports your own contributions back to you as dividends. This is the value waiting for
                    your answer, and the Distributions sub-tab shows a running count of how many lots are still sitting on it.</li>
                </ul>
              </td>
              <td style={sectionStyles.td}>Any of the four, editable in place from the same table where you see it (and from the Holdings sub-tab's lot editor, which also edits the lot's date, shares and price). A lot you add by hand starts as Purchase. Imported lots arrive as "Not specified" unless the source data actually stated where the shares came from, with Opening Balance (Imported) used only for the shortfall case above. Changing Source takes effect immediately, and never alters the lot's cost basis, its shares, or your holding's value &mdash; only whether those shares are treated as income you received. Setting a lot back to Not specified is always safe: it simply stops counting.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Number</span><br/>
                <strong>Qualified share of that yield (Plan &rarr; Balances &amp; Debt)</strong>
              </td>
              <td style={sectionStyles.td}>How much of the Taxable Brokerage Dividend Yield is taxed at the lower qualified-dividend / capital-gains rates. The rest is ordinary income: it is taxed on your brackets and counts everywhere other ordinary income does (Social Security taxation, IRMAA and ACA income, the 3.8% investment tax, state tax).</td>
              <td style={sectionStyles.td}>0&ndash;100%. By default the figure is not used: the switch <strong>Follow the plan&rsquo;s stock/bond split</strong> is on, and each year&rsquo;s share follows that year&rsquo;s stock allocation (Working or Retired, walked down by the glide path if one is on), weighted by what each side pays &mdash; a brokerage account holding the plan&rsquo;s mix earns qualified dividends on its stock side and interest on its bond and cash side, and bonds pay more: with stocks at 1.3% and bonds at 4% (the two yields beside the switch, both editable), a 60/40 account&rsquo;s income is about a third qualified, not 60%. Interest is ordinary income. Turn the switch off to type a share of your own (100 treats the whole yield as qualified), and a plan saved with a figure of its own keeps it. Locked while the yield is linked to Detailed Holdings, where it follows each Taxable holding&rsquo;s Distribution Character: Ordinary Dividend and logged interest are ordinary; a holding whose character is Not Set is ordinary too when it is a bond or cash fund, a REIT, an option-income or covered-call fund or a business development company (by ticker or name); Mixed / Fund-Dependent counts half; and everything else except Return of Capital (not income at all) is qualified.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Dropdown</span><br/>
                <strong>In retirement, dividends</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Spending &rarr; Withdrawals &amp; Taxable Account</em>
              </td>
              <td style={sectionStyles.td}>What the taxable account&rsquo;s dividends do from your first retired year: <strong>Reinvest them, as now</strong> (the default); <strong>Take only what the year needs</strong>, leaving the rest invested; or <strong>Take them all as cash</strong>. Dividends taken as cash meet the year&rsquo;s spending before the cash reserve is touched and before anything is sold, so fewer shares are sold and fewer gains realized. It does not change the tax on the dividend itself, nor the income IRMAA and the ACA are priced on: a dividend is taxed the year it arrives either way. Anything taken and not spent returns to Taxable as fresh basis, so taking dividends you do not need leaves the plan worth the same to the dollar.</td>
              <td style={sectionStyles.td}>Reinvest / Take only what the year needs / Take them all as cash. Has no effect in working years. Year by Year carries the amount taken, and it appears under &ldquo;arrives on its own&rdquo; on the Retirement Readiness paycheck card.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Table (Premium)</span><br/>
                <strong>Wealth Milestones: New money, Investment growth</strong>
              </td>
              <td style={sectionStyles.td}>Each year&rsquo;s total by institution, from the prices on file, with the money you added that year and the growth on what you already had.</td>
              <td style={sectionStyles.td}>Not an input. <strong>New money:</strong> the cost of every lot dated in the year except DRIP reinvestments (a holding with no lots counts its purchase). <strong>Investment growth:</strong> (end value &minus; start value &minus; new money) &divide; (start value + half the new money). A holding that went stale that year, or came back after being stale, is left out of that year&rsquo;s growth. The first year shows &mdash;; the current year is marked &ldquo;to date&rdquo;. <strong>Columns:</strong> one per Institution as typed (free text, so two spellings are two columns); <strong>Unassigned</strong> is every holding with none. Click a heading to list its holdings (account, value, largest first) and open one to edit. A statement import fills Institution from the statement when it names one, never over one you typed. A holding with no lots and no purchase date (a statement or website import) counts its current shares from its first recorded price, and that first value is new money; a holding worth $0 adds no column.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Display (Premium)</span><br/>
                <strong>Source (Price History Snapshots, Asset History &amp; Distribution Ledger)</strong>
              </td>
              <td style={sectionStyles.td}>Where each recorded price came from. The app keeps one price per day for every holding, whenever it learns one, so the trajectory chart and Wealth Milestones can value the holding on past dates.</td>
              <td style={sectionStyles.td}>Not an input. <strong>Live price (Google Sheet)</strong> &mdash; a Refresh; <strong>Manual entry</strong> &mdash; you typed a price; <strong>Statement import</strong> &mdash; the price on a pasted or uploaded statement; <strong>Price when added</strong> &mdash; the price a holding was created with; <strong>CSV upload</strong>; <strong>Portfolio Tracker import</strong> (with the backup&rsquo;s entry type). A later price on the same day replaces the earlier one, source included. Dates are your local day.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Chart (Premium)</span><br/>
                <strong>Month bars: actual vs estimated (Estimated Payout Schedule &amp; Timeline, Distributions sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>Shows dividend income month by month for the current year on whichever basis is the more truthful one for that month. A finished month that has real payments logged in its holdings' Ledgers is drawn from those payments (solid bar, "Actual"); every other month is drawn from the projection built out of Frequency &times; annual dividend per share (hatched bar, "Estimated"). The legend beneath the chart names both, and the hover says which basis it used along with the dollar amount and payment count. The panel header adds an "actually logged so far" total beside the "est. this year" total once any month is showing actuals.</td>
              <td style={sectionStyles.td}>Not an input &mdash; it reads your holdings. A month flips to Actual only when BOTH are true: the month has already ended, and at least one distribution is logged in it. A finished month with nothing recorded keeps showing its estimate rather than $0, since the app can't tell "nothing was paid" from "nothing was entered." A month counts as recorded if it has a logged distribution OR a tax lot whose Source is DRIP Reinvestment (shares bought with a payment ARE the payment, valued at shares &times; the price they were bought at) &mdash; so change a lot's Source in the lot editor if an import guessed wrong, and a payment logged with Shares Added is never double-counted against the lot it created. The month currently in progress stays Estimated even with payments logged, so a partial month doesn't read as a drop. Every distribution type counts toward an actual month (dividend, capital gain distribution, return of capital, interest, other), matching Lifetime Distributions in the Ledger. Bars stay clickable as the month filter. Estimated months are only projected from when you owned the holding &mdash; its earliest tax lot, or its purchase date when it has no lots &mdash; so a position bought partway through the year has no estimated income before that point. A holding with no acquisition date on file is still projected across the full year.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Filter</span><br/>
                <strong>Quarter/Annual/Month filter (Estimated Payout Schedule &amp; Timeline, Distributions sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>Narrows the panel's payment list to a single quarter or calendar month, so you can see what's coming due (or what already came due) in a specific period instead of only "everything upcoming." Picking a month the chart draws from real data switches that list from the forecast to the payments actually received, each row naming whether it came from a logged payment or from reinvested shares. The Q1-Q4 boxes and the Annual box double as read-only totals for their period even when not selected.</td>
              <td style={sectionStyles.td}>A row of 5 clickable boxes (Q1/Q2/Q3/Q4 + Annual) above a row of month buttons &mdash; one per month of the chart's ROLLING window (last 12 completed months, the month in progress, and 5 ahead), in the same order as the bars. All share one filter, as does clicking a month's column on the chart itself (the whole column is the target, so a near-zero month is as clickable as a large one). The quarter and Year boxes stay CALENDAR-year even though the chart rolls: they answer a tax-year question and line up with a 1099. Their amounts use the chart's rule &mdash; received for a finished month with anything logged, estimated for every other month &mdash; so they equal the bars; the tooltip splits received from estimated. Click a quarter or month to filter to it (clicking a month while a quarter is active switches to that month instead of stacking); click the active one again to clear it. Annual always clears back to the default "upcoming only" view, it isn't a toggle. Purely a display filter &mdash; doesn't affect any KPI totals.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Behavior</span><br/>
                <strong>Checking for a new version</strong>
              </td>
              <td style={sectionStyles.td}>An open tab asks about once an hour whether a new version of the app has been released, and again when the tab is brought back into view or the device comes back online. When one is found, the &ldquo;A new version is ready &mdash; Reload&rdquo; notice appears; nothing changes until you take it.</td>
              <td style={sectionStyles.td}>Not an input. Each check is one small request for the app&rsquo;s own service-worker file, nothing else. With Local-Only Mode on, no check is made at all; the notice then appears only after you reload the page yourself.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Display</span><br/>
                <strong>Help popups and Look it up</strong>
              </td>
              <td style={sectionStyles.td}>A dotted label with a question mark opens a short popup: a definition, a sentence or two. A popup with more behind it ends with a Look it up in the Input Dictionary link that opens this page with the term in the search box above.</td>
              <td style={sectionStyles.td}>Not an input. The popup stays open while the mouse is on it so the link can be reached; Escape or moving away closes it. The search box filters every row on this page by that term; clear it to see everything again.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Read-only table</span><br/>
                <strong>When to Claim Social Security, in plain words (Optimizers)</strong>
              </td>
              <td style={sectionStyles.td}>Your plan re-run with only your own claiming age changed. Monthly Benefit is your own benefit (not your spouse&rsquo;s, not the household total) in the first full year it is paid. Bridge Years counts the years you are retired before your own check starts; Portfolio Draws Before Benefits is what the plan withdraws in those years. Lifetime Benefits is the household total, since your claim changes your spouse&rsquo;s survivor benefit too.</td>
              <td style={sectionStyles.td}>Not an input. Your spouse&rsquo;s claiming age stays as set; the heatmap above varies both. Change your own claiming age on Plan, Income.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Action</span><br/>
                <strong>Print / PDF Report</strong>
              </td>
              <td style={sectionStyles.td}>Opens a short dialog of what to print: the analysis report (readiness answers, action plan, taxes, estate, risk, year by year), every plan setting (each value in the Plan page&rsquo;s labels and groups, with life events and heirs), an account summary (balances by tax type, other assets and debts, and holdings combined by fund or stock, with no account names, firms or account numbers), the spending review, and what a planner will also ask for (the documents the app does not hold). The analysis report uses the names on your plan, heads its year table with each person&rsquo;s age (one age column for a single plan), and states on every page whether its dollar figures are in today&rsquo;s or future dollars, following Show figures in, so its lifetime totals and Monte Carlo range match the screen. Leave out names prints Spouse 1, Spouse 2 and Heir 1, 2&hellip; on every page. The estate documents checklist and the What Will You Do? answers can be added too; both start unticked. The same dialog opens from the Print / PDF Report buttons on Readiness and the Action Plan card.</td>
              <td style={sectionStyles.td}>Not an input. Your choices are remembered in this browser. Every plan setting skips values left at zero or blank and anything inside a feature that is switched off. Save as PDF in the print dialog to send the packet; the app sends nothing.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Action</span><br/>
                <strong>Print for review (Plan, Spending)</strong>
              </td>
              <td style={sectionStyles.td}>Prints the retirement budget on its own for someone to check with a pen: the yearly and monthly total, the essential share, every line in every category with how often it is paid, which month, each payment and the yearly amount, a box to tick beside each and a column to write a change. Then health cover before 65, how spending changes with age, and what the figures leave out on purpose (mortgage and debt, taxes, Medicare, long-term care, one-off events).</td>
              <td style={sectionStyles.td}>Not an input. Only this sheet prints, not the app or the full report. Choose Save as PDF in the print dialog to keep or send a copy; nothing is sent anywhere by the app. A plan using one annual figure prints that figure and suggests switching to categories.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Display</span><br/>
                <strong>Find a setting</strong>
              </td>
              <td style={sectionStyles.td}>The search box in the Plan header, in both the Guided and Advanced views. Type part of a field&rsquo;s name (or the words from a section title) and pick a result: the app switches to the sub-tab or Guided step that holds it, opens the section fold and More options if the field sits behind them, scrolls it into view and highlights it for a moment. Pages show up too, so &ldquo;optimizers&rdquo; offers the Optimizers page beside the Roth fields. The last result always searches this dictionary for the same words.</td>
              <td style={sectionStyles.td}>Not an input. Ctrl+K (Cmd+K on a Mac) puts the cursor in the box from any page, going to Plan first if needed. Arrow keys move through results, Enter picks, Escape closes. A field whose section switch is off (or whose Guided yes/no question is answered no) cannot be shown; the box says so instead of jumping to nothing.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Display</span><br/>
                <strong>Control vocabulary</strong>
              </td>
              <td style={sectionStyles.td}>A sliding switch is one setting that is on or off. A dropdown is one choice among several. A checkbox is for picking several rows from a list (rows to import, scenarios to compare, checklist items, essential categories, chart lines to show).</td>
              <td style={sectionStyles.td}>Not an input. Two deliberate exceptions choose among cards instead of a dropdown, because their options are worth reading side by side: the stress scenarios (Risk &amp; Stress, Dashboard) and the heir distribution strategies (Tax &amp; Estate). New York City / Yonkers residency is one Local income tax dropdown.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Preference</span><br/>
                <strong>Round far-future dollars</strong>
              </td>
              <td style={sectionStyles.td}>Switch, Exact / Rounded (default Exact), under Preferences &rarr; Display. Rounded shows headline figures that sit more than ten years past the plan's first year to three significant figures: $3,408,199 as $3,410,000, $916,432 as $916,000. Kept per browser, like the theme; not part of the plan or its backups.</td>
              <td style={sectionStyles.td}>Not a plan input. Applies to the Dashboard's Peak Portfolio Worth and Ending Balance cards and the P10&ndash;P90 range beneath, the Readiness tab's ending balances and lifetime taxes, and the printed report's summary and lifetime totals. The Initial Nest Egg, the first years' money, the Year by Year ledger and every chart keep the exact figure. Figures under $100 are never rounded.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Chart</span><br/>
                <strong>Chart hover card (every chart)</strong>
              </td>
              <td style={sectionStyles.td}>Hovering a point on any chart opens one shared card: the year (or label) as a headline, then one row per series with a small color square, the series name and the figure. On a phone, a tap opens it and it stays until you tap somewhere else.</td>
              <td style={sectionStyles.td}>Not an input. The square is the series' own line or fill color, so a figure can be matched to its line without reading colored text; the text itself stays in the theme's ink, and the card follows the light or dark theme. A bar drawn with a pattern rather than a color shows its outline color instead.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Chart</span><br/>
                <strong>Tax Bracket chart income layers (Tax &amp; Estate)</strong>
              </td>
              <td style={sectionStyles.td}>The stacked layers of each year's ordinary income: Wages (Taxable), Stock vesting (RSUs), Deferred comp payouts, Pension, Taxable SS, Forced RMDs (taxable part), Pre-Tax Draws, Roth Conversions (taxable part) and Other ordinary income. Together they are the income the plan taxes; the standard deduction is the dotted 0% line, and each bracket line is labeled at its right end. Bars and lines are in the same dollars.</td>
              <td style={sectionStyles.td}>Not inputs. One list defines the layers' names and colors, and the bars, the legend beneath the chart and the hover card all draw from it. The hover card lists the layers that are above $0 that year (wages always), then Total Ordinary Income, Less standard deduction and Taxable Income.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Chart (Premium)</span><br/>
                <strong>How Retirement Is Funded, Year by Year (Retirement Income sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>Each retired year's spending need (dashed line, taxes included) and what pays for it, stacked bottom-up: Social Security, Pensions &amp; annuities, Other income (rental, work, deferred comp), Dividends taken as cash, Shares sold. A lighter dashed layer above the line is a required minimum distribution withdrawn but not needed, which the plan reinvests.</td>
              <td style={sectionStyles.td}>Not an input. Hover shows the year's sources top-down with their share of spending, leaves out any that are $0, and ends with how much is paid without selling shares. A source no year uses is left out of the legend. The Year-by-year table below has the same columns. The Social Security &amp; Pensions card above it adds, when Social Security starts after you retire, the year it reaches its full level.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Dropdown (Premium)</span><br/>
                <strong>Dividend income from your holdings (Retirement Income sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>Which dividend figure the sub-tab projects forward &mdash; the dividend layer of the funding chart, coverage percentages, the glide-path simulation, and the funding gap. It is only what your holdings pay out; Social Security and pensions come from your plan projection and are never part of it. "Forward dividend estimate" is Ann. Dividend/Share &times; shares: repeatable, but it cannot see a capital gain distribution, which for a fund portfolio is often the year's largest payment. "Last 12 months, recurring" is the dividends and interest actually received over the last twelve COMPLETE months. "Last 12 months, everything" adds capital gains and return of capital.</td>
              <td style={sectionStyles.td}>Defaults to the forward estimate. Remembered per browser. Recurring counts real money of the kinds that tend to recur: capital gains are excluded because a fund distributes them when its manager realizes gains, so extrapolating one projects a windfall, and return of capital is excluded because it is your own principal returning, not income. The panel prints all three figures and the difference between them. If nothing has been recorded in the last twelve months, the trailing options fall back to the estimate rather than projecting $0, and say so. Affects this sub-tab only &mdash; it does not touch your plan's tax numbers.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Text Input (Premium)</span><br/>
                <strong>Assumed Dividend Growth Rate (Retirement Income sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>How fast your total dividend income is assumed to grow year over year, compounding forward from your current holdings' income to project coverage in future retirement years. Separate from the plan's own investment-return assumptions on Plan &rarr; Assumptions &amp; Risk.</td>
              <td style={sectionStyles.td}>Percentage, can be negative. Defaults to 5%/yr (a common long-run historical estimate for dividend growth investing, not a guarantee).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Form (Premium)</span><br/>
                <strong>Retirement Planning &amp; Glide Path inputs (Retirement Income sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>A separate self-contained "what-if" planner below the real coverage table: Target Retirement Horizon (years), Target Monthly Income ($/mo &mdash; shared across the KPI strip, Stage 2 card, and Income Stack goal), Annual 401k + Match ($/yr), Employer RSU Vesting ($/yr), a Strategy dropdown (Conservative/Balanced/Aggressive &mdash; descriptive label only, doesn't change the simulation), a Target Dividend Yield slider (1.0%-7.0%), and a Non-Portfolio Income Stack (Social Security Benefit $/mo, a reference-only Claiming Age of 62/67/70, and Pension/Rental Net $/mo). Right below the Action Plan simulation, a <strong>Retirement Roadmap: Step 1 / 2 / 3</strong> card row adds no inputs of its own &mdash; it's pure output, citing your real largest overweight holding (from the Rebalance sub-tab's own Target %s) and your real DRIP-enabled holdings for Step 1, and reusing this same simulation's own milestone years for Step 2/3.</td>
              <td style={sectionStyles.td}>Kept on this sub-tab only, separate from your plan. The Social Security fields here are not your plan&rsquo;s Social Security benefit (Plan &rarr; Income &rarr; Social Security) or claiming age (Plan &rarr; Household): this planner doesn&rsquo;t read them or reduce for early claiming, so you enter your own already-adjusted monthly estimate. The simulation uses flat assumed rates (6%/yr net-worth growth, 6.5% sustainable yield) rather than your actual plan assumptions. Defaults: Horizon 10 years, Target Income $8,000/mo, 401k $20,000/yr, RSU $0/yr, Yield 4.0%, Strategy Balanced, SS/Pension $0/mo, Claiming Age 67.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Date Input (Premium)</span><br/>
                <strong>Purchase Date (Holdings sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>Optional. When set, unlocks that holding's row in the Analytics sub-tab (annualized return since purchase, compared against S&amp;P 500/Nasdaq-100 over the same window). Every other field on a holding works fine without it. Models one purchase lot &mdash; if this holding reinvests dividends (DRIP), those reinvested shares were actually bought at their own later dates/prices that aren't tracked separately, so treat the resulting CAGR as directional for a DRIP holding, not precise. Disabled once the holding has any lots (see "Lots panel" below) &mdash; the lots' own dates take over.</td>
              <td style={sectionStyles.td}>Date, optional. Pulled automatically from a Portfolio Tracker backup import when the source file has one, otherwise left blank. Leaving it blank simply excludes that holding from the Analytics CAGR table &mdash; it still counts in Analytics' total unrealized gain.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Table (Premium)</span><br/>
                <strong>Lots panel (Holdings sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>Click "Lots" on any holding's row to track individual purchase/DRIP lots (each with its own Date, Shares, Price/Share, and Source &mdash; Purchase or DRIP Reinvestment) instead of one flat Shares/Avg Buy Price/Purchase Date for the whole holding. With lots, Shares, Value, Yield on Cost, and Unrealized Gain all sum from the real per-lot data, and Analytics CAGR becomes a true money-weighted return (XIRR) computed across every lot's actual cash flow rather than a single-date estimate. Each lot also shows its own long-term/short-term classification (more than one year counted from the day after purchase, so a sale on the anniversary itself is still short-term, as in IRS Pub 550; for your information, not used by the projection) and its own individual CAGR.</td>
              <td style={sectionStyles.td}>Optional, entirely additive. Adding a holding's first lot automatically seeds one lot from its existing Shares/Avg Buy Price/Purchase Date before adding the new one, so nothing already entered is lost. A holding with no lots uses its flat Shares, Avg Buy Price and Purchase Date. Remove all of a holding's lots to fall back to the flat fields again.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Dropdown (Premium)</span><br/>
                <strong>Asset Class (Holdings sub-tab, Edit panel)</strong>
              </td>
              <td style={sectionStyles.td}>Stock / Bond / Cash Equivalent / Other &mdash; a separate axis from Type: Type says what kind of vehicle a holding is (a single stock vs. an ETF vs. a mutual fund), Asset Class says what it actually invests in, which Type alone can't answer (an ETF can be all-stock or all-bond). Feeds the Holdings sub-tab's "Portfolio Mix" readout and the "Link to Working Allocation" action below.</td>
              <td style={sectionStyles.td}>Defaults to "Auto" (a best-effort guess from the symbol/name against common bond and money-market tickers, falling back to Stock) until you explicitly pick a value here to override it. The guess is never silently baked in &mdash; saving other fields on the same holding without touching this dropdown keeps it on "Auto," so a future improvement to the guess still applies retroactively to anything you haven't explicitly classified.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Dollars (Premium)</span><br/>
                <strong>Current price per share (Holdings sub-tab, Edit panel)</strong>
              </td>
              <td style={sectionStyles.td}>The holding&rsquo;s price, typed by hand: from a statement, the fund&rsquo;s own website, or anywhere you trust more than the quote. Click a price in the Live Price column to open the Edit panel with this field ready. Saving a new price clears that day&rsquo;s gain or loss, which belonged to the old quote, and records the price with today&rsquo;s date for the value-over-time charts.</td>
              <td style={sectionStyles.td}>Pre-filled with the current price. The next Refresh replaces a typed price with your pricing Sheet&rsquo;s, so if the Sheet&rsquo;s price is wrong, also turn on Manual pricing (below) to keep yours. For a holding with a pricing proxy ticker, Refresh moves the price by the proxy&rsquo;s return starting from the price you typed.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Text (Premium)</span><br/>
                <strong>Research URL (Holdings sub-tab, Edit panel)</strong>
              </td>
              <td style={sectionStyles.td}>An optional link to wherever you look up that security &mdash; a quote page, a fund fact sheet, your broker's research page, anything. Shows as a small clickable link icon next to the holding's symbol on the Holdings table.</td>
              <td style={sectionStyles.td}>Starts empty. If you're using "Pricing Source" (above), the first time "Refresh Prices &amp; Dividends (Live)" resolves that symbol it auto-fills this field with that symbol's Yahoo Finance quote link from your Sheet. A link you type is never overwritten. A link the Sheet filled in follows the holding: when you change the Pricing proxy ticker, or the link points at a different ticker than the one the holding is priced by, the next Refresh replaces it with the right one. Only a plain Yahoo quote link (finance.yahoo.com/quote/TICKER) counts as filled in; to keep a Yahoo link for a different ticker, add anything after the ticker, such as /news.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Tool (Premium)</span><br/><strong>Reconcile (Holdings sub-tab)</strong></td>
              <td style={sectionStyles.td}>Account activity for a period, to check against a brokerage statement: each holding&rsquo;s opening position, its purchases, distributions and sales, and its closing position, with totals for the account. Print for review prints one account to a page with a blank &ldquo;Statement says&rdquo; column.</td>
              <td style={sectionStyles.td}><strong>How often:</strong> Monthly, Quarterly or Annually (starts on your statement reminder&rsquo;s cadence). <strong>Period:</strong> the last finished one by default; the one in progress is listed as &ldquo;so far&rdquo;. <strong>Account:</strong> all, or one. Opening shares are the shares held the day before the period, with later sales put back. Prices are the last one recorded on or before each date, and the line says when that is not the date itself. A symbol opens that holding&rsquo;s ledger, where corrections are made. Two lots with the same shares and price dated within five days of each other each carry a note that they may have been entered twice. <strong>Mark reconciled</strong> is yours to press, per account and period, once it agrees with the statement; Undo removes it, and a period in progress cannot be marked. <strong>Statements for this account arrive:</strong> Monthly (the default), Quarterly (calendar quarters) or Annually, set per account. An account on a longer schedule than the period on screen has no statement to check against, so it cannot be marked, is not counted, and is left out when all accounts are printed. Marks are part of Backup Everything. Not shown: deposits, withdrawals, fees, transfers and interest on uninvested cash, which the app does not record. A holding with no lots and no purchase date is held from its first recorded price and flagged as having no dated history.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Read-only</span><br/><strong>Symbol status badge (Holdings table)</strong></td>
              <td style={sectionStyles.td}>The mark beside each symbol, from your last Refresh: a green tick is synced from your Sheet; an amber tick is priced, but Yahoo Finance returned no details for the symbol, so its type and dividend may be missing (set them in Edit); a dashed circle means your Sheet has no entry for it yet; a red cross is not found and unpriced (check the symbol); a red triangle is a Sheet-side error with no price; a pencil is a holding you price by hand, left out of the sync.</td>
              <td style={sectionStyles.td}>Not an input. Hover the mark for the message behind it. Manual pricing is set on the holding&rsquo;s pencil Edit.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Checkbox (Premium)</span><br/>
                <strong>Manual Pricing (Holdings sub-tab, Edit panel)</strong>
              </td>
              <td style={sectionStyles.td}>Excludes this holding's symbol from Live Pricing entirely: Refresh never registers it with your pricing Sheet, never tries to price it, never counts it in the "updated X of Y" tally, and its per-symbol badge shows a neutral gray "Manual" instead of the red "Not found." For symbols that can never resolve on public quote services through no fault of yours &mdash; employer-plan internal tickers (a 401(k)'s target-date trust, a plan-internal fund) and money-market funds, which quote services don't price at all (their NAV is pegged at $1.00 by construction). You keep the holding's Current Price up to date by hand.</td>
              <td style={sectionStyles.td}>Off by default &mdash; an unflagged holding syncs normally. As a convenience, turning it on for a holding whose Asset Class resolves to Cash Equivalent and whose Current Price is still unset fills the price in as $1.00; it never overwrites a price that's already entered. If another holding shares the same symbol without the flag, that one still syncs &mdash; the flag is strictly per-holding.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Link Action (Premium)</span><br/>
                <strong>Link to Working Allocation (Holdings sub-tab) / Stock Allocation (Working) (Plan &rarr; Assumptions &amp; Risk)</strong>
              </td>
              <td style={sectionStyles.td}>The Holdings sub-tab computes your real stock/bond/cash mix from every holding's Asset Class (above) and shows it as "Portfolio Mix" (stock % of stock+bond+cash value &mdash; Crypto/Other is excluded from that split but still counts toward your total net worth). "Link to Working Allocation" sets the plan's "Stock Allocation (Working)" field &mdash; part of the Dynamic Asset Allocation &amp; Rebalancing model used when that toggle is on &mdash; to that real %, and keeps it in sync automatically from then on, the same pattern as the Initial Balances and Known Cost Basis links (independent of both). "Stock Allocation (Retired)" never links &mdash; it's a target for after you retire, and there's no current-holdings equivalent to sync it to, so it always stays a manual assumption.</td>
              <td style={sectionStyles.td}>Guarded against linking with nothing classified (would otherwise sync to a meaningless 0%). Once linked, "Stock Allocation (Working)" goes read-only with a green "Linked to Detailed Holdings" badge and an Unlink control on Plan itself; unlinking returns it to manual entry without touching your holdings data.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Read-Only</span><br/>
                <strong>Analytics sub-tab</strong>
              </td>
              <td style={sectionStyles.td}>Total unrealized gain across all holdings, plus per-holding annualized return (CAGR) since purchase for any holding with a Purchase Date or lots set, compared against the S&amp;P 500 and Nasdaq-100 over that holding's own purchase-to-today window (not one shared window for the whole portfolio). Portfolio-level CAGR and benchmark figures are weighted by each holding's current market value. Holdings tracked by lots show a "money-weighted" badge next to their symbol &mdash; their CAGR is XIRR across every lot, not the single-date approximation used for other holdings.</td>
              <td style={sectionStyles.td}>Not editable &mdash; computed from your holdings. Benchmark figures use real historical index annual returns, manually refreshed periodically (no live market-data feed). Holdings without a Purchase Date or lots are shown in the gain totals but omitted from the CAGR table rather than estimated.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Chart + Toggle (Premium)</span><br/>
                <strong>Portfolio Trajectory vs. Benchmarks (Analytics sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>A whole-portfolio version of the CAGR comparison above, shown as a chart instead of a single number. "Amount Invested" is a real, exact line built from every holding's Purchase Date/Lot dates and dollar amounts. The S&amp;P 500 / Nasdaq-100 lines show what those same dollars, invested on those same real dates, would be worth today in each index, using the same historical return tables as the CAGR figures above. "Your Portfolio (Today)" is a single highlighted marker at the current date &mdash; not a full line &mdash; since this app has no historical per-holding price feed and won't fabricate what your holdings were worth at past dates it never tracked.</td>
              <td style={sectionStyles.td}>Read-only chart with a 1Y / 3Y / 5Y / All timeframe toggle above it that narrows the chart to the most recent calendar years (the underlying data is unaffected). Hidden entirely if no holding has a Purchase Date or lots &mdash; same qualifying condition as the CAGR table above.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Text Input (Premium)</span><br/>
                <strong>Target % (Holdings sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>What fraction of your whole Detailed Holdings portfolio (by current market value, across every holding) you want this specific holding to be. Feeds the Rebalance sub-tab's suggested buy/sell list. Not a hardcoded asset-class guess &mdash; you set it directly on the holding it applies to.</td>
              <td style={sectionStyles.td}>Percentage, 0-100, optional. Leaving it blank (the default) excludes that holding from the Rebalance sub-tab's table entirely, though its current value still counts toward the portfolio total every other holding's target is measured against. An explicit 0% is different from blank &mdash; it means "I want zero allocation here," and will show up as a full "Sell" suggestion.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Table + Chart (Premium)</span><br/>
                <strong>Rebalance sub-tab</strong>
              </td>
              <td style={sectionStyles.td}>Turns every holding's Target % into a suggested buy/sell list: Current Value/%, Target Value/%, and a "Buy $X (~N sh)" / "Sell $X (~N sh)" / "Balanced" verdict per holding (a holding within 0.5 percentage points of its target is called Balanced rather than flagged as an action). A bar chart above the table compares Current % to Target % per holding. Two 1-click buttons fill in every holding's Target % at once &mdash; Equal-Weight (100% ÷ number of holdings) or Lock In Current Mix (target = today's actual %) &mdash; and a Clear All Targets button resets them. This calculator never executes anything &mdash; no trade is placed, no money moves; you review the suggestions yourself.</td>
              <td style={sectionStyles.td}>Read-only table/chart, driven entirely by each holding's Target % field above. Shows a warning banner if the set Target %s don't sum to ~100%, and a note when holdings without a Target % hold money, since the suggestions then buy more than they sell. Hidden (shows an empty-state message instead) if no holding has a Target % set yet.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Form (Premium)</span><br/>
                <strong>Liquidate action (Holdings sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>The $ button on any holding's row opens a sale form: shares to sell (with 25/50/100% quick-fill buttons), sale price per share, sale date, and an optional note. It live-previews proceeds, cost basis, realized gain/loss, and long/short-term classification as you edit the form, before anything is recorded. Cost basis is drawn FIFO (oldest lot first, the IRS default absent a specific-lot election) from the holding's Lots if it has any, otherwise from its flat Avg Buy Price. Confirming records an entry on the Liquidations sub-tab and reduces the holding's shares/lots &mdash; selling everything removes the holding from the active Holdings table entirely. Never places a real trade; this app has no brokerage connection.</td>
              <td style={sectionStyles.td}>Disabled if the holding currently has 0 shares. The form's Confirm Sale button is disabled until shares/price are valid and don't exceed what the holding actually has.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Table (Premium)</span><br/>
                <strong>Liquidations sub-tab</strong>
              </td>
              <td style={sectionStyles.td}>An immutable, append-only audit trail of every sale recorded via the Liquidate action &mdash; symbol, account, sale date, shares sold, sale price, proceeds, cost basis, realized gain/loss ($ and %), and term (Long-Term/Short-Term/Mixed). A record survives even after its holding is fully sold and no longer appears in Holdings, since it stores its own snapshot of symbol/account/tax treatment rather than looking the holding back up. Totals above the table split realized gain/loss into long-term vs. short-term. Informational only, not tax advice &mdash; consult a tax professional for how these figures apply to your actual return.</td>
              <td style={sectionStyles.td}>Read-only except for a per-row delete button (removes the record from your audit trail only &mdash; it does not restore the sold shares to the holding). Included in Backup Everything / Restore Backup, same as Detailed Holdings.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Import (Premium)</span><br/>
                <strong>Statement Import panel (Holdings sub-tab)</strong>
              </td>
              <td style={sectionStyles.td}>Two ways to bulk-add holdings from a real brokerage statement instead of typing each one by hand: upload a PDF that has real embedded text (read in your browser; a scanned image-only PDF has no text to read), or paste text copied from the statement. The text goes to a reader built for that brokerage&rsquo;s layout, which knows which column is quantity, price and value, and each row&rsquo;s confidence is flagged (High when the statement&rsquo;s market value confirms shares × price; Low otherwise) for your review before anything is imported.</td>
              <td style={sectionStyles.td}><strong>Statement format:</strong> Detect automatically (the default), Charles Schwab, Fidelity, Morgan Stanley / E*TRADE, PNC Investments (National Financial Services), T. Rowe Price, Vanguard 401(k) / employer plan, or Another brokerage (the general, best-effort reader). The panel says which reader was used; changing the choice reads the same statement again, and a reader that finds nothing hands over to the general one and says so. A statement covering several accounts adds an <strong>Account on this statement</strong> picker: each account is reviewed and imported on its own and the panel then moves to the next. Under the rows, the panel compares their total with the total the statement prints for the account and warns when they differ. Every row can be edited (symbol, shares, price) and ticked before &ldquo;Import Selected Holdings&rdquo;; one Account and Tax Treatment apply to the account under review, both taken from the statement, with your own label for that account preferred when the rows update holdings you already track. A row updates a holding of the same symbol only at the same institution; a cash balance only matches cash in that account or at that institution. New holdings take Avg Buy Price from the statement&rsquo;s cost when it prints one; otherwise it starts at 0, to be added afterward with a Purchase Date or Lots. Everything runs in your browser. The same box recognizes three other kinds of paste. A position&rsquo;s <strong>lot list</strong> (Fidelity&rsquo;s layout, or Morgan Stanley at Work&rsquo;s for employer stock): you pick the holding it belongs to, matching lots are left alone, new ones are added with a Source you choose, and a lot whose figures don&rsquo;t add up is left out rather than guessed at. A <strong>transaction history</strong>: each Reinvest Shares entry can be recorded as a DRIP lot plus a ledger entry, buys and sells are listed but not imported, and entries already recorded are skipped. And lots for a <strong>new holding</strong>: choose &ldquo;+ New holding&rdquo; in the picker and give it a symbol, account and tax treatment.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Text Input</span><br/>
                <strong>Social Security at FRA ($/yr)</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Income &rarr; Social Security; Plan (Guided) &rarr; Household &amp; Identity</em>
              </td>
              <td style={sectionStyles.td}>Your estimated <em>annual</em> benefit if you claim at your Full Retirement Age (FRA), per spouse. The SS Claiming Age (62&ndash;70) field on Household applies the early-claim reduction or delayed-retirement credit; both screens show the resulting multiplier as a hint. The FRA itself comes from each spouse&rsquo;s birth year per the SSA table &mdash; 66 for 1943&ndash;1954, rising two months a year to 67 for 1960 and later &mdash; so someone born in 1957 claiming at 66 is six months early (96.7%), not twelve, and earns 42 months of delayed credits by 70 (128%). The reduction or credit is worked out to the month.</td>
              <td style={sectionStyles.td}>Currency value ($/yr). Check your own estimate on ssa.gov.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Ledger Column</span><br/>
                <strong>Taxable SS</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Year by Year</em>
              </td>
              <td style={sectionStyles.td}>How much of that year&rsquo;s Social Security is federally taxable &mdash; never more than 85% of the benefit. It follows the IRS worksheet against your &ldquo;provisional income&rdquo;: your other income for the year plus half your benefits, measured against $32,000/$44,000 joint ($25,000/$34,000 single; $0 for separate filers who lived together). That other income includes <em>the withdrawals the plan takes to fund your spending</em> &mdash; the discretionary Pre-Tax draw, realized gains on a Taxable draw, and the taxable earnings of an early Roth draw &mdash; not just pensions, RMDs and dividends. Well above the upper threshold it reads 85% of your benefit.</td>
              <td style={sectionStyles.td}>Output only, not an input. Reads $0 up to the lower threshold, then phases in; caps at 85% of the year&rsquo;s benefit. Compare it against the Income Tax and Health columns beside it &mdash; in the phase-in band an extra dollar of IRA income drags up to 85 cents of benefit in with it, so a nominal 12% bracket really costs about 22%.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Number Input</span><br/>
                <strong>SS Claiming Age (62&ndash;70)</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Household</em>
              </td>
              <td style={sectionStyles.td}>The age at which you plan to claim Social Security. The engine applies the statutory SSA multiplier to your FRA benefit automatically: 5/9 of 1% per month for the first 36 months before your full retirement age (67 if born 1960 or later) and 5/12 of 1% per month beyond that, and 2/3 of 1% per month of delayed credit after it. With a full retirement age of 67: 62 = 70%, 63 = 75%, 64 = 80%, 65 = 86.7%, 66 = 93.3%, 70 = 124%. For a single-person plan the benefit begins exactly at this age; for a couple, each spouse's benefit begins at their own claiming age. A survivor draws the larger each year of their own benefit and the survivor benefit on the deceased's record: available from 60 at 71.5% of what the deceased received (or would have, with delayed credits to the death), rising to 100% at the survivor's own FRA and fixed at the age it starts; if the deceased claimed early, capped at the larger of that reduced benefit and 82.5% of their full benefit.</td>
              <td style={sectionStyles.td}>A whole-year number from 62 to 70. The resulting &ldquo;Benefit multiplier&rdquo; shows under the field.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Checkbox</span><br/>
                <strong>Use the spousal benefit if higher (per spouse)</strong>
              </td>
              <td style={sectionStyles.td}>Models the Social Security spousal benefit for a spouse whose own record is small. When on, that spouse receives their own retirement benefit plus the excess of 50% of the <em>other</em> spouse&rsquo;s FRA benefit over their own FRA benefit. The top-up is reduced for claiming before your full retirement age (67 if born 1960 or later) on the spousal schedule (25/36 of 1% per month for 36 months, then 5/12 of 1%: with a full retirement age of 67, 65% of it at 62 and 75% at 64) and earns no delayed credits after it. It is payable only once the other spouse has filed; if they file after you, the top-up begins then, at the reduction for your age at that point (deemed filing). The trust-fund depletion stress cuts it like any benefit; it ends at the worker&rsquo;s death, when the survivor logic pays the greater of the two benefits. Off, the engine pays exactly the two FRA amounts you typed.</td>
              <td style={sectionStyles.td}>ON/OFF per spouse, default OFF; shown only when a spouse is enabled, next to each Social Security at Full Retirement Age field on Plan &rarr; Income &rarr; Social Security. Has no effect when that spouse&rsquo;s own FRA benefit is already at least half of the other&rsquo;s.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Text Input &times; 2</span><br/>
                <strong>Roth Contribution Basis Today / Converted to Roth in the Last 4 Years</strong>
              </td>
              <td style={sectionStyles.td}>Optional Roth basis figures under the Roth balance (Plan &rarr; Balances &amp; Debt). They only matter for Roth withdrawals taken before age 59&frac12;. The plan applies the IRS ordering rules: a withdrawal comes first from regular contributions (tax- and penalty-free), then from conversions oldest-first (penalty-free once five tax years old; before that, 10% on the part that was taxable when converted, never income-taxed again), then from earnings (ordinary income plus the 10% penalty). Conversions the plan itself makes &mdash; fixed, max-bracket, backdoor, ACA-protection &mdash; are added as layers automatically with their own five-year clocks. After 59&frac12; every Roth dollar is tax-free (the account is assumed at least five years old). The Year by Year rows carry the remaining basis and how each year&rsquo;s Roth draw split (basis / taxed earnings / penalized).</td>
              <td style={sectionStyles.td}>Currency values, default 0 = unknown, in which case every pre-59&frac12; Roth dollar is treated as earnings (taxed + penalized) &mdash; enter your basis if you plan to spend Roth money early. Contribution basis: custodian history or Form 8606 Part III. Recent conversions: the total converted in the last four calendar years, assumed spread evenly across them; conversions older than that are already past their clock and belong in contribution basis.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Toggle + Fields</span><br/>
                <strong>Legislative &amp; Policy Risks (Plan &rarr; Assumptions &amp; Risk)</strong>
              </td>
              <td style={sectionStyles.td}>Three "what if a current protection goes away" stress toggles. <strong>Simulate SS Trust Fund Depletion:</strong> {/* TRUSTEES-FIGURES */}the 2026 Trustees Report projects the Social Security OASI trust fund to run out in 2032, after which incoming taxes would pay about 78% of scheduled benefits (a 22% cut) unless Congress acts. Depletion Year and Benefit Cut % are both adjustable, applied on top of your early or delayed claiming adjustment. <strong>Assume TCJA Rates Are Later Repealed:</strong> current law makes the TCJA's rates permanent, so this is a hypothetical future-repeal scenario (not a scheduled event) reverting to the pre-2018 10/15/25/28/33/35/39.6% rate schedule with a roughly-halved standard deduction. <strong>Freeze Medicare IRMAA Brackets:</strong> CMS normally adjusts IRMAA's income thresholds for inflation every year (same as tax brackets); this models Congress freezing them <em>all</em> instead, which pushes more retirees into a surcharge tier every year from ordinary income growth alone. Note this toggle is the hypothetical only. The very top threshold &mdash; $500,000 single / $750,000 joint &mdash; is frozen through 2027 by law, and the plan applies that freeze whether or not this toggle is on. Leaving this toggle off is the accurate setting for current law; turning it on to &ldquo;fix&rdquo; the top tier would wrongly freeze the four lower tiers as well.</td>
              <td style={sectionStyles.td}>All three toggle ON/OFF, default OFF (baseline assumes current law/full benefits continue). SS Depletion also shows Depletion Year (default {/* TRUSTEES-FIGURES */}2032) and Benefit Cut % (default 22%) once turned on.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Number</span><br/>
                <strong>Existing Annuity Income / Rental Income ($/yr)</strong>
              </td>
              <td style={sectionStyles.td}>Two flat annual income streams (Plan &rarr; Income) that start in the plan's first year and grow with the general inflation rate. Both are <strong>ordinary taxable income</strong>: they count toward federal and state income tax, Social Security's provisional-income test, IRMAA MAGI, the ACA coverage-gap check, and they reduce the headroom a max-bracket Roth conversion can fill. Enter <em>net</em> rental income (after expenses and depreciation) and the <em>taxable</em> part of an existing annuity.</td>
              <td style={sectionStyles.td}>Dollars per year, $0 to disable. A single-premium annuity bought through the Annuity Purchase feature is separate and applies its own exclusion ratio.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Number + Toggles</span><br/>
                <strong>Pension ($/yr) &mdash; per spouse, with detail</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Income &rarr; Annuities, Rentals &amp; Pensions</em>
              </td>
              <td style={sectionStyles.td}>A defined-benefit pension for each spouse, taxed as ordinary income. Once an amount is entered the detail appears: <strong>Starts at Age</strong>, <strong>Pension COLA (%)</strong> (not every pension has one &mdash; check the plan documents), <strong>Survivor Benefit (%)</strong> continuing to the spouse (shown only with a spouse enabled), a <strong>Military Pension</strong> switch (state-tax exempt where the state exempts it; turning it on also seeds the COLA to your inflation rate and the survivor benefit to the SBP&rsquo;s 55%), a <strong>Government Pension</strong> switch (state, local, or federal employer &mdash; New York exempts these in full instead of applying its $20,000 private-pension exclusion), and a <strong>lump-sum election</strong> that takes the pension as one payment at the start age instead of a monthly stream. The lump sum is taxed the way the law taxes it: taken in cash it is spendable money <em>and</em> ordinary income in the year received, carrying the same state treatment (military / government exempt, or private) the monthly pension would have had; tick the accompanying <strong>Roll over to Pre-Tax (no tax this year)</strong> box and it is a direct rollover instead &mdash; the money lands in the Pre-Tax bucket, no income is recognized now, and it is taxed as it comes back out. Enter the amount of the first year&rsquo;s payment (or this year&rsquo;s, if the pension has already started); the COLA raises it each year after it starts. A lump sum whose start age falls before the plan&rsquo;s first year counts as already received, so nothing is added.</td>
              <td style={sectionStyles.td}>$/yr ($0 = no pension); start age 40&ndash;100; COLA 0&ndash;20%; survivor 0&ndash;100%; lump-sum value in $ (default $250,000).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Dropdown</span><br/>
                <strong>State Income Tax Jurisdiction</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Taxes &amp; Roth</em>
              </td>
              <td style={sectionStyles.td}>Applies a state&rsquo;s income tax on top of federal tax. <strong>California</strong> and <strong>New York</strong> use their real graduated schedules, including New York&rsquo;s recapture of its lower brackets above {usd(NY_RECAPTURE_AGI_FLOOR)} of income and its rate changes already written into law for later years. California subtracts its standard deduction and exemption credits, adds back HSA contributions and earnings (California has no HSA deduction), and limits the military-pension exclusion. <strong>Virginia</strong> uses its 2%&ndash;5.75% schedule with its standard deduction, personal exemptions, age deduction (65+, reduced as income rises) and military subtraction. <strong>Illinois</strong> exempts IRA and 401(k) withdrawals, RMDs and Roth conversions at any age; <strong>Pennsylvania</strong> exempts distributions from 59&frac12; and conversions at any age, and taxes the wages you defer into a 401(k) or 403(b) (it does not exclude them the way federal law does; HSA contributions stay deductible); <strong>New York</strong>&rsquo;s $20,000-per-person exclusion covers pensions, IRA distributions and conversions from 59&frac12;. <strong>Colorado</strong> exempts Social Security from 65 (and at 55&ndash;64 under an income limit), gives a per-person subtraction for pensions, IRA withdrawals and conversions from 59&frac12; (Social Security subtracted in full uses up the same subtraction first), and applies its flat rate to federal taxable income. Where a state exempts Social Security, only the federally taxable part that is in the income base is removed. <strong>Washington</strong> charges 7% on long-term capital gains above its yearly standard deduction, plus 2.9% on the part over $1,000,000; from 2028 it also taxes income over $1,000,000 at 9.9%, starting from federal income with Social Security, pensions and IRA money included and capital gains counted only above their own deduction, and credits the capital gains tax against it. Spouses share one deduction for each, whether they file jointly or separately. Washington residents choose Washington, not Tax-Free State. <strong>The other 35 states and DC</strong> use their own rules: the choice named for your State of Residence applies that state&rsquo;s 2026 brackets or rate, standard deduction and exemptions, Social Security rule (exempt, taxed, or exempt below an income line), retirement exclusion (its amount, starting age, whether IRA money counts, and any phase-out with income), government and military pension exemptions, any surtax (Massachusetts 4% over about $1.1 million) and, in Maryland and Indiana, a typical county tax. Credits, itemized deductions and smaller exclusions are left out, and an exclusion each spouse gets separately is shared. <strong>Other State</strong> is a flat rate you set instead, with your choice of whether it taxes Social Security and pensions.</td>
              <td style={sectionStyles.td}>Tax-Free State (0%, e.g. TX/FL/NV); your State of Residence by its own rules (shown with its name and rate, for the 35 states and DC without a model below; picked automatically when you choose the state); Other State (a flat rate you set); California; New York; Illinois; Colorado; Pennsylvania; Virginia; Washington. New York adds a Local income tax select: None, New York City resident, or Yonkers resident. A plan whose State of Residence is Washington but whose jurisdiction is Tax-Free State shows a note pointing to the Washington choice.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Dropdown</span><br/>
                <strong>Withdrawal Order</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Spending &rarr; Withdrawals &amp; Taxable Account</em>
              </td>
              <td style={sectionStyles.td}>The order in which retirement spending is drawn from your accounts.</td>
              <td style={sectionStyles.td}>Options: Taxable First, Pre-Tax First, Roth First, Pro-Rata.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Number Input</span><br/>
                <strong>Taxable Brokerage starting capital gains ratio (%)</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Spending &rarr; Withdrawals &amp; Taxable Account</em>
              </td>
              <td style={sectionStyles.td}>The share of today&rsquo;s Taxable Brokerage balance that is unrealized gain, used to set the starting cost basis when Known Cost Basis is $0. From then on the basis is tracked year by year, so the gain share of each withdrawal moves with it.</td>
              <td style={sectionStyles.td}>A number field, 0&ndash;100%. Default is 60%.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Dropdown</span><br/>
                <strong>How the Taxable Brokerage Account Is Held</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Spending &rarr; Withdrawals &amp; Taxable Account (couples only)</em>
              </td>
              <td style={sectionStyles.td}>Decides how much of the household&rsquo;s taxable money takes a new cost basis at the first death (step-up in basis, IRC &sect;1014). What the spouse who died owned is reset to its market value that year, so the survivor&rsquo;s later sales show less gain, which lowers their tax and the income Medicare uses for IRMAA. <strong>Jointly:</strong> half is reset. <strong>In one spouse&rsquo;s name:</strong> all of it if that spouse dies first, none if the other does. <strong>Community-property states</strong> (AZ, CA, ID, LA, NM, NV, TX, WA, WI) reset all of it, whatever this says, using the state you live in that year; years abroad use the jointly-held rule. Concentrated stock positions follow the same rule. Pre-Tax accounts never get a new basis, and Roth accounts don&rsquo;t need one. Heirs get a full step-up at the second death either way.</td>
              <td style={sectionStyles.td}>Jointly (default), in Spouse 1&rsquo;s name, or in Spouse 2&rsquo;s name. Not shown for one person. Not modeled: property brought from a common-law state, California&rsquo;s quasi-community property, and opt-in community-property trusts (AK, TN, SD, KY, FL).</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyles.card} data-reference-card>
        <h2 style={sectionStyles.cardTitle}>
          <Settings size={20} />
          Granular Inflation Assumptions & Safe Withdrawal Rate
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Found on Plan &rarr; Assumptions &amp; Risk, alongside the general Inflation Rate and Tax Bracket Inflation.
        </p>
        <table style={sectionStyles.table}>
          <thead>
            <tr>
              <th style={sectionStyles.th}>Input / Widget</th>
              <th style={sectionStyles.th}>Purpose & Effect</th>
              <th style={sectionStyles.th}>Valid Inputs / Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Input</span><br/><strong>Tax Brackets Annual Inflation (%)</strong></td>
              <td style={sectionStyles.td}>How fast tax brackets, the standard deduction, IRMAA thresholds and contribution limits grow each year after the current one. It also carries the estate and gift exemptions forward to the year your estate is valued.</td>
              <td style={sectionStyles.td}>Percentage. Default 2.5%. Set it below the Inflation Rate to model &ldquo;bracket creep&rdquo;, where rising incomes drift into higher brackets.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Number Inputs</span><br/><strong>Assumed Stock Return Rate (%) / Assumed Bond Return Rate (%)</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Dynamic Asset Allocation</em></td>
              <td style={sectionStyles.td}>Used only while <strong>Dynamic Asset Allocation</strong> is on: each year&rsquo;s return is your stock share times the stock rate plus your bond share times the bond rate, in place of the flat Investment Return fields.</td>
              <td style={sectionStyles.td}>Percentages. Defaults 8.0% for stocks and 4.0% for bonds.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Input</span><br/><strong>Social Security COLA (%)</strong></td>
              <td style={sectionStyles.td}>Annual Cost-Of-Living Adjustment applied to Social Security benefits, separate from general inflation. While this stays at the default, a year SSA has already announced a COLA for uses the announced figure (3.6% for 2027, announced October 2026) and the default applies from the year after; a rate you enter yourself applies to every year, and the switch under the rate turns the announced figures off (the demo households keep their own assumption, so their story stays fixed).</td>
              <td style={sectionStyles.td}>Percentage. Default 2.5% (historically ~2-3%/yr).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Input</span><br/><strong>Medical Inflation (%)</strong></td>
              <td style={sectionStyles.td}>Growth rate applied to the Healthcare Bridge (pre-Medicare coverage) cost line.</td>
              <td style={sectionStyles.td}>Percentage. Default 5.0% (medical costs have historically outpaced general CPI).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Input</span><br/><strong>Long-Term Care (LTC) Inflation (%)</strong></td>
              <td style={sectionStyles.td}>Growth rate applied to both spouses' Long-Term Care Annual Cost, kept separate from Medical Inflation above, because long-term care costs have grown at a different pace from routine medical costs.</td>
              <td style={sectionStyles.td}>Percentage. Default 4.0%. Only affects anything if at least one spouse's Long-Term Care Active toggle is on (Plan &rarr; Spending, Special Expenses).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Inputs</span><br/><strong>Housing Inflation (%) / Housing Share of Spending (%)</strong></td>
              <td style={sectionStyles.td}>When Annual Lifestyle Spending is one figure rather than categories, Housing Share carves out the portion of that budget treated as housing-related (rent, property tax, insurance, maintenance) — that slice grows at Housing Inflation, while the rest keeps growing at the general Inflation Rate.</td>
              <td style={sectionStyles.td}>Housing Inflation: percentage, default 3.0%. Housing Share: percentage of total Lifestyle Expenses, default 30%.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Inputs</span><br/><strong>Medicare Part B / Part D Inflation (%)</strong></td>
              <td style={sectionStyles.td}>Separate growth rates for Medicare Part B (medical) and Part D (prescription drug) premiums plus their respective IRMAA surcharge tiers, instead of both riding the general inflation rate.</td>
              <td style={sectionStyles.td}>Percentage each. Default 5.0% for both (Part B and D premiums have both historically grown faster than general inflation).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Input</span><br/><strong>Safe Withdrawal Rate (for FI Crossover) (%)</strong></td>
              <td style={sectionStyles.td}>Sizes the "FI number" used by the Financial Independence / CoastFIRE Crossover markers — target expenses divided by this rate. 4% implies a 25x-expenses portfolio (the classic "4% rule"); lowering it demands a bigger portfolio before crossover is considered reached, raising it demands less.</td>
              <td style={sectionStyles.td}>Percentage. Default 4.0%. A value of 0 falls back to 4%.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyles.card} data-reference-card>
        <h2 style={sectionStyles.cardTitle}>
          <Settings size={20} />
          Plan Year & Advance Year
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Found on Plan &rarr; Plan Year &amp; Review.
        </p>
        <table style={sectionStyles.table}>
          <thead>
            <tr>
              <th style={sectionStyles.th}>Input / Widget</th>
              <th style={sectionStyles.th}>Purpose & Effect</th>
              <th style={sectionStyles.th}>Valid Inputs / Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Read-Only</span><br/><strong>Plan Year status cards</strong></td>
              <td style={sectionStyles.td}>Shows three separate years side by side so they can't be silently confused with each other: this plan&rsquo;s own current year (every age and the projection&rsquo;s first year come from it), the year the app&rsquo;s tax figures are for (brackets, IRMAA thresholds and contribution limits; only an app update moves it), and today&rsquo;s date. A warning banner appears if the plan year or the tax-figure year has fallen behind the real calendar.</td>
              <td style={sectionStyles.td}>N/A &mdash; informational only. Advancing the plan year (below) does not change the tax-figure year or vice versa.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Button + Flow</span><br/><strong>Advance Plan Year</strong></td>
              <td style={sectionStyles.td}>Moves the plan year forward by exactly one year &mdash; a calendar change only. Every age and the projection's starting point shift forward with it. Deliberately does NOT touch balances, salary, pensions, Social Security benefit estimates, or any other dollar figure; those are left exactly as they were for you to review and update yourself afterward.</td>
              <td style={sectionStyles.td}>Clicking it shows a warning dialog explaining the above, then (if you continue) a prompt offering to save a named backup of the plan exactly as it stands before advancing &mdash; leave the name blank or cancel to skip. A saved backup appears on the Scenarios tab tagged "Year Advance Backup" and can be restored any time via that list's "Load Plan" button, which is the rollback mechanism (no separate undo exists).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Checklist</span><br/><strong>Annual review</strong></td>
              <td style={sectionStyles.td}>Ten steps for a new year, in order, each with the reason and a Go button to the page where it is done: advance the year; balances to the January statements; salary, Social Security estimate and pension; carry last year&rsquo;s MAGI forward for the Medicare lookback; Roth conversions actually made; spending; life events the plan has passed (named); the tax-figure vintage; the Monte Carlo; a snapshot named &ldquo;Annual review &lt;year&gt;&rdquo;. Two are done by the app on a click: <strong>Carry forward</strong> writes Two Years Prior MAGI from Prior Year MAGI and Prior Year MAGI from the plan&rsquo;s own first-year estimate; <strong>Save snapshot</strong> saves a scenario.</td>
              <td style={sectionStyles.td}>Tick boxes, remembered per plan year in this browser. The calendar and tax-vintage steps tick themselves when satisfied. <strong>Mark the review complete</strong> unlocks once every step is ticked. Nothing here changes the plan except the two app-done steps.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyles.card} data-reference-card>
        <h2 style={sectionStyles.cardTitle}>
          <Target size={20} />
          Optimizers & Scenario Planning
        </h2>
        <table style={sectionStyles.table}>
          <thead>
            <tr>
              <th style={sectionStyles.th}>Input / Widget</th>
              <th style={sectionStyles.th}>Purpose & Effect</th>
              <th style={sectionStyles.th}>Valid Inputs / Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Interactive Tool</span><br/>
                <strong>Change one thing</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Scenarios tab, above the saved-scenario comparison</em>
              </td>
              <td style={sectionStyles.td}>Runs your plan exactly as it stands against the same plan with a <strong>single</strong> named input changed, and overlays both paths. A saved Scenario can&rsquo;t isolate one change, because two snapshots may differ in one input or in nine; here the gap between the lines is that one change and nothing else. Reports the difference in ending balance, lifetime taxes, lifetime Medicare premiums (including IRMAA), and the year the portfolio runs out. Neither side is marked better: a larger ending balance may be bought with years of lower spending.</td>
              <td style={sectionStyles.td}>Four levers: <strong>Roth conversion amount</strong>, <strong>claiming age</strong> (62&ndash;70, spouse 1 only), <strong>annual spending</strong>, and <strong>withdrawal order</strong>. A conversion amount does nothing unless a fixed conversion strategy is on, so that side turns one on and says so. With spending entered monthly or by category, the lever compares the annual total and leaves your breakdown alone. Nothing is saved and your plan is never edited. A single projection at your assumed returns; sequence risk lives on Risk &amp; Stress. Follows <strong>Show figures in</strong>: balances are adjusted year by year and lifetime totals are a present value.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Chart + Button</span><br/>
                <strong>Every retirement age, 50 to 75</strong> (Retirement Readiness, working-longer card)
              </td>
              <td style={sectionStyles.td}>The plan run once per retirement age from 50 to 75, both spouses moving together and keeping their age gap; a bar chart of ending balances with the earliest age that lasts to the end called out. Clicking a bar changes which age the working-longer table compares; nothing else changes.</td>
              <td style={sectionStyles.td}>Not an input. <strong>Make age N the plan's retirement age</strong> sets the Retirement Age (and a spouse&rsquo;s, keeping the gap, never below 50). Computed in the background with the other heavy results. Free. The Dashboard's First safe year to retire is the same question answered as a calendar year.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Interactive Tool</span><br/>
                <strong>Target Portfolio "What-If" Solver</strong> (Retirement Readiness, walk-away card, behind Try a scenario)
              </td>
              <td style={sectionStyles.td}>Reverse-calculates the starting portfolio size needed to survive a custom scenario (retire earlier, spend more). Models 10% early withdrawal penalties. The search stops at $20,000,000; when nothing up to that lasts, it shows More than $20,000,000 instead of a figure. A scratchpad: nothing typed here changes the plan.</td>
              <td style={sectionStyles.td}>Inputs: Age, Spend, Shortfall method (Taxable Only vs Proportional). Free.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Interactive Tool</span><br/>
                <strong>"Die with Zero" Simulator</strong> (Retirement Readiness, walk-away card: And retiring as planned?)
              </td>
              <td style={sectionStyles.td}>Calculates the exact maximum annual spending limit you can afford so that your portfolio ends exactly at $0 at your planned Life Expectancy. Beneath it <strong>the same ceiling at the odds of living</strong>: the spend-to-zero level re-solved for the year by which half of households like yours have no one left, one in four still do, and one in ten still do, from the Social Security life table (for a couple, the last year the chance that at least one of you is still here is at least that level; each row keeps both of you in the plan to that year).</td>
              <td style={sectionStyles.td}>Runs automatically. Output is a max spending limit, plus three more at the 50% / 25% / 10% longevity odds; the cautious end is the one-in-ten figure. The plan adopts it only through the Make $X the plan's budget button. When no spending level lasts, or the plan would support more than the $5,000,000 a year the search stops at, it says so (the odds rows read None lasts or More than $5,000,000/yr) and offers no button. Free.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Button</span><br/>
                <strong>Backup Everything / Restore Backup (Sidebar, every tab &mdash; and Preferences &rarr; Your Data)</strong>
              </td>
              <td style={sectionStyles.td}>The app&rsquo;s save and restore. Everything else lives only in this browser&rsquo;s storage, which a browser reset, &ldquo;Clear browsing data,&rdquo; a private window or a new machine erases for good. Backup Everything downloads one file with your active plan, every saved Scenario, your Detailed Holdings and Liquidations (if any), your Guided progress, your estate checklist ticks, your Life Plan answers, your annual review ticks, your Live Pricing connection, a snapshot of your headline figures, and your Premium Access Key if one is active. Restore Backup reads one back in, replacing everything in this browser and reloading the page.</td>
              <td style={sectionStyles.td}>Accepts a .json file made by Backup Everything, including older ones; any section an older file lacks is left as it is. Detailed Holdings and Liquidations are skipped (the confirm dialog says so first) unless Premium is active here or the file carries a working key; everything else restores. A Premium Access Key in the file is restored only if it is valid; an invalid or expired one is skipped and the key already in this browser stays. The file is checked before anything is written: if any part of it can&rsquo;t be read, nothing is restored and your current data stays as it was. A Live Pricing connection in the file is shown in the confirmation and restored only if you switch on <strong>Also restore my Live Pricing connection</strong> (off by default). With a Premium key inside, the file is a working credential as well as your plan: treat it like a password file. It is plain JSON unless you use Encrypted Backup.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyles.card} data-reference-card>
        <h2 style={sectionStyles.cardTitle}>
          <TrendingUp size={20} />
          Retirement Contributions & Employer Match
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Found on Plan &rarr; Savings.
        </p>
        <table style={sectionStyles.table}>
          <thead>
            <tr>
              <th style={sectionStyles.th}>Input / Widget</th>
              <th style={sectionStyles.th}>Purpose & Effect</th>
              <th style={sectionStyles.th}>Valid Inputs / Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Input</span><br/><strong>Pre-Tax Savings / Roth Savings ($/yr) — per spouse</strong></td>
              <td style={sectionStyles.td}>Separate Pre-Tax and Roth contribution fields for each spouse (labeled "Primary" and "Spouse" when Spouse 2 is enabled), so two working spouses can save different amounts. Each field is credited only while that spouse is still working (age below their own Retire Age).</td>
              <td style={sectionStyles.td}>Currency value ($0+). Each spouse's Pre-Tax + Roth combined is checked against the IRS elective deferral limit for their own age, with a warning shown if exceeded.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Dropdown</span><br/><strong>Auto-Max Contribution — per spouse</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Savings</em></td>
              <td style={sectionStyles.td}>Per-spouse override that replaces that spouse's manual savings figures with their current-year IRS limit instead, so you don't have to hand-update the numbers every year. Automatically accounts for age (the 50+ and 60-63 "super" catch-up amounts) and grows with your inflation assumption in future years. The overridden fields show the actual computed dollar amounts inline once enabled.</td>
              <td style={sectionStyles.td}><strong>Off</strong> (use the manual $/yr field), <strong>401(k)/403(b)/Gov Plan</strong> (the higher elective deferral limit — $24,500 base for {TAX_YEAR}, with the 50+ and 60&ndash;63 catch-up amounts, in the Pre-Tax field; when wages are over the $150,000 mandatory-Roth threshold the catch-up goes to Roth, added to that spouse&rsquo;s Roth savings), <strong>Traditional/Roth IRA</strong> (the lower IRA limit — $7,500 base for {TAX_YEAR}, Pre-Tax field only), or <strong>Contribute the Max</strong> — the one-click everything option: the full 401(k) deferral split Pre-Tax/Roth per the mandatory-Roth-catch-up rule (age 50+ with wages over $150,000 flips the catch-up to Roth), PLUS an IRA at its own separate stacking limit contributed as a backdoor Roth (replacing, never adding to, any manual backdoor amount for that spouse), PLUS the household HSA at its legal limit (self/family per the HDHP toggle, plus the 55+ catch-up, which the IRS does not index; only while working and under 65). Disables every field it overrides while active.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Input</span><br/><strong>Taxable Brokerage Savings ($/yr)</strong></td>
              <td style={sectionStyles.td}>Annual contribution to the taxable brokerage bucket. Kept as a single shared household figure (not split per spouse) since it isn't subject to per-person IRS contribution limits.</td>
              <td style={sectionStyles.td}>Currency value ($0+).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}>
                <span style={sectionStyles.badge}>Dropdown</span><br/>
                <strong>If Working-Years Income Falls Short</strong><br/>
                <em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Savings</em>
              </td>
              <td style={sectionStyles.td}>Determines how the simulation balances your budget during working years when living expenses, taxes, and planned savings exceed your earned income, avoiding unintended early withdrawals from your portfolio. A savings cut is made where the contribution is set, before the employer match and before tax, so a deferral you could not afford earns no match and is taxed as pay.</td>
              <td style={sectionStyles.td}>
                <strong>Reduce All Savings First, Then Lifestyle</strong> (default &mdash; cuts taxable savings to $0, then Pre-Tax and Roth savings to $0, then reduces spending); <strong>Reduce Taxable Savings, Then Lifestyle, Then Pre-Tax/Roth</strong> (protects tax-advantaged retirement accounts as long as possible by cutting lifestyle spending before touching 401(k)/IRA contributions); <strong>Reduce Lifestyle First, Then All Savings</strong> (keeps maintaining all savings goals by absorbing deficits from lifestyle spending first).
              </td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Dropdown + Fields</span><br/><strong>Employer Match Type</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Savings</em></td>
              <td style={sectionStyles.td}><strong>Flat $ Amount:</strong> a simple annual dollar figure, inflated forward like salary — credited only while that spouse works, on top of (not counted toward) their own elective deferral limit. <strong>Percent-Based Formula:</strong> models a real matching formula against that spouse's own Pre-Tax + Roth deferral for the year.</td>
              <td style={sectionStyles.td}>Percent mode fields: <strong>Tier A Match Rate (%)</strong> and <strong>Tier A Cap</strong> (as a % of that spouse's IRS deferral limit); optional <strong>Tier B</strong> with its own rate and a flat $ cap (inflation-adjusted); <strong>Combine Tiers As</strong> — Greater Of (pays whichever tier is larger; e.g. "50% up to the full limit, or 100% up to $3,000, whichever is more") or Sum Of Tiers (adds both together; e.g. a graduated "100% of the first 3%, 50% of the next 2%" schedule).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Input + Toggle</span><br/><strong>HSA Savings ($/yr) / HDHP Coverage Tier</strong></td>
              <td style={sectionStyles.td}>Health Savings Account: a fourth bucket alongside Pre-Tax/Roth/Taxable. Contributions reduce taxable salary like Pre-Tax savings, growth is tax-free, and withdrawals are tax-free when used against Healthcare Bridge, LTC, or IRMAA costs elsewhere in the plan. When every other account and the cash reserve are empty, the HSA pays the rest of the year&rsquo;s spending before a shortfall is shown: that money is taxed as ordinary income, plus a 20% additional tax before 65 (California does not tax it again), and appears on Year by Year as <strong>HSA for general spending</strong>.</td>
              <td style={sectionStyles.td}>Currency value ($0 = disabled). Checked against the year&rsquo;s IRS HSA limit (self-only vs. family coverage, with an age 55+ catch-up) with a warning shown if exceeded.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Pre-Tax vs. Roth Contribution Advisor</strong></td>
              <td style={sectionStyles.td}>Reads your (and your spouse's) contribution and salary inputs above and shows, per spouse: elective deferral usage against the IRS limit, remaining age-based catch-up room, whether SECURE 2.0's mandatory Roth catch-up rule applies (age 50+ with prior-year wages over $150,000 must direct catch-up contributions to Roth, not Pre-Tax &mdash; flagged in red if your Pre-Tax contribution breaks that rule), estimated employer match, and remaining Mega Backdoor Roth room under the total annual-additions limit (the IRS 415(c) limit) (only shown if your plan allows after-tax 401(k) contributions). A household-level box also shows Roth IRA contribution eligibility (full/partial/none) based on MAGI phase-out thresholds.</td>
              <td style={sectionStyles.td}>N/A — always on in the background, driven entirely by the contribution/salary/age fields already entered above it. No separate inputs of its own besides an "After-Tax Contributions Allowed" toggle per spouse that unlocks the Mega Backdoor Roth room display.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Read-only column</span><br/><strong>Survivor-Phase Taxes (Tax Strategy Matrix)</strong></td>
              <td style={sectionStyles.td}>Taxes paid in the years after the first spouse has died (from each spouse&rsquo;s Life Expectancy), once the household switches from Married Filing Jointly to Single. Single-filer brackets are narrower and the standard deduction smaller, so the same income &mdash; above all forced RMDs on a Pre-Tax balance built for two &mdash; is taxed harder once one spouse is left. Strategies that draw down or convert more of the Pre-Tax balance earlier tend to lower this figure, since less is left to reach the survivor at Single rates.</td>
              <td style={sectionStyles.td}>Not an input. $0 when the two Life Expectancies end the plan in the same year, or with no spouse enabled.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Readout</span><br/><strong>Net to heirs after every tax</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tax Optimizer Hub, Roth Ladder Optimizer, Contribution Split Optimizer, Action Plan</em></td>
              <td style={sectionStyles.td}>The figure every optimizer ranks on. A plan&rsquo;s ending balance adds a Pre-Tax dollar to a Roth dollar as if they were worth the same, so on that figure a strategy that leaves tax unpaid always looked best and a conversion that paid 22% today to spare the heirs 32% later always looked worse. This figure is what the heirs keep: the Pre-Tax balance at the end of the plan less the income tax they pay drawing it down (at the effective rate of the Legacy Planner&rsquo;s ten-year draw, at each heir&rsquo;s own income and state), the Roth and taxable accounts and the stepped-up assets at their value, the home and other estate assets, less federal and state estate tax. It is the Tax &amp; Estate tab&rsquo;s net to heirs with one difference: the Pre-Tax balance is taken at death rather than grown through the heirs&rsquo; ten years, so a strategy is not rewarded for leaving money in the account the heirs still owe tax on.</td>
              <td style={sectionStyles.td}>Not an input. Set the heirs&rsquo; income and filing status under Tax &amp; Estate; a high-earning heir makes conversions worth more, a low-earning one less. A plan that runs short ranks below any that lasts, whatever its heirs would have kept. The ending balance is still shown beside it everywhere, and the Roth Ladder Optimizer can be switched to rank on it or on lifetime taxes. Where a plan has a home or other assets this figure can exceed the ending balance, as the Tax &amp; Estate tab&rsquo;s does.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Pre-Tax vs. Roth Contribution Split Optimizer</strong></td>
              <td style={sectionStyles.td}>Goes a step further than the Advisor above, which doesn't compare the two: reruns your full plan at different Pre-Tax/Roth splits of each spouse's contribution — holding each spouse's TOTAL contribution amount fixed, so this only changes tax treatment, not how much is saved — and reports which split leaves your heirs the most after every tax (the figure below). Searches a 5-point grid (0/25/50/75/100% Roth) per spouse, shown against your current mix with the dollar improvement and an expandable table of every split tested.</td>
              <td style={sectionStyles.td}>N/A — always on, recomputes automatically whenever your contribution inputs change, no button to press. Doesn't apply (and says why) if no Pre-Tax/Roth contribution is configured, or if Auto-Max Contribution is on for every contributing spouse (which fixes Pre-Tax to that year's IRS limit, leaving no split to optimize).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Grant List + Toggle</span><br/><strong>Equity Compensation (RSU/GSU)</strong></td>
              <td style={sectionStyles.td}>Models stock grant vesting income separately from a flat salary number, since real grants vest on their own multi-year schedule and it's normal to hold several overlapping grants at once. <strong>Existing Grants</strong> is a list of grants you already have — each with its own spouse, grant year, total value, vesting years, and schedule (equal or a custom back-loaded split) — that vest independently and stack when they overlap. A separate <strong>Assumed Future Grants</strong> toggle (per spouse) synthesizes a new hypothetical grant of a given size every year that spouse is still working, with its own growth rate for how much bigger each year's assumed grant gets — kept apart from Existing Grants because it's a forward-looking assumption, not a known fact. Vesting income from either source is added on top of salary for tax/IRMAA/FICA/Social-Security-taxability purposes, and stops the instant that spouse retires — including forfeiting whatever hadn't vested yet on an existing grant, matching how most real equity plans treat a voluntary departure (some employers have retirement-eligibility carve-outs that let equity keep vesting after leaving; model that by extending Retirement Age or that grant's own Vesting Years to cover it).</td>
              <td style={sectionStyles.td}>Existing Grants: Spouse, Label, Grant Year, Enter Grant As — <strong>Total Value</strong> ($, today's/grant-date dollars — not re-inflated for later tranches) or <strong>Units</strong> (the RSU/GSU count off the grant letter; the grant is then worth units × that spouse's <strong>Current Share Price</strong> field, recomputed on every run so one price edit reprices every unit grant, unvested tranches included — flat at today's price, no assumed growth; with no price entered a unit grant vests $0 and shows an amber warning) — plus Vesting Years and Schedule (Equal or Custom %-per-year). Current Share Price: one per spouse ($0+, today's dollars, manual — not tied to Live Pricing); ignored by dollar-entered grants. Assumed Future Grants: on/off per spouse, Assumed Annual Grant ($), Vesting Years, Grant Growth Rate (%/yr), Schedule. A <strong>Refresh Interruption</strong> toggle (Applies To: either spouse or Both, Start Year, Duration) zeroes out only the assumed future grants for that window — grants already issued (including before the window starts) keep vesting untouched.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle + Fields</span><br/><strong>Concentrated Stock Position</strong></td>
              <td style={sectionStyles.td}>Tracks accumulated employer stock you've already vested and held onto (rather than sold) as its own risk bucket, separate from diversified Taxable Brokerage — a single-company holding carries a concentration risk a diversified portfolio doesn't. Grows at its own assumed rate. You can model selling (&ldquo;diversifying&rdquo;) a % of the balance into Taxable Brokerage each year. The gain each sale realizes is taxed like any other capital gain in that year&rsquo;s full tax picture &mdash; the 0/15/20% bands, the 3.8% net investment income tax, state tax, and the income Medicare and the ACA read &mdash; and shows in that year&rsquo;s Income Tax. The proceeds pay that year&rsquo;s spending first; what is left lands in Taxable as fresh basis. A <strong>Link to a Holding</strong> dropdown (Premium, restricted to Taxable-tagged Detailed Holdings positions since diversification proceeds always land in Taxable) sets Label/Current Value/Cost Basis % from that real holding and keeps them in sync automatically — same link/unlink pattern as Initial Balances, Known Cost Basis, and Stock Allocation (Working), but pointed at one specific holding rather than an aggregate bucket. A <strong>Track a Second Position</strong> toggle adds a second, fully independent position — for a household where each spouse holds a different employer's stock — with its own value, growth, diversification plan, vest routing, and holding link (the two positions can't link the same holding); both share one Risk Warning Threshold, and each gets its own Year by Year column headed by its Label.</td>
              <td style={sectionStyles.td}>Per position: <strong>Label</strong> (optional, e.g. "GOOG" — free text, nothing about the ticker is hardcoded; it names that position’s Year by Year column, which reads &ldquo;Conc. <em>Label</em>&rdquo;, or simply &ldquo;Concentrated Stock&rdquo; when left blank. While the position is linked to a holding the Label is overwritten with that holding’s ticker on every run and the field is read-only — unlink via &ldquo;Manual Entry&rdquo; to name it yourself), Current Value ($), Cost Basis (%, of current value — sizes the gain on each sale), Growth Rate (%/yr), Diversify (%/yr — 0 to simply hold), Diversify Tax Rate (%, not used by the projection; kept so older plans still open), and a shared Risk Warning Threshold (%, default 10) that the Year by Year concentrated-stock column(s) flag in red once crossed. When linked to a holding, Label/Current Value/Cost Basis % go read-only (an "Unlink" via the dropdown's "Manual Entry" option returns them to manual editing, untouched by the underlying holding); Growth Rate, Diversify %, Diversify Tax Rate, and the Risk Warning Threshold always stay manually set, linked or not. If the linked holding is later deleted from Detailed Holdings, this returns to manual entry rather than pointing at nothing.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle + Fields</span><br/><strong>Route New Vests Into This Position (Vest Routing)</strong></td>
              <td style={sectionStyles.td}>Models <strong>holding</strong> new RSU/GSU shares as they vest instead of the default assumption that every vest is sold and its after-tax value lands as diversified cash. Mirrors the common big-tech mechanic (e.g. Google): at vest the employer sells a fixed % of the shares to cover tax withholding ("sell-to-cover") and the remaining net shares land in your account. Each year, the held slice of that year's vesting value — vest income × (100% − Sold to Cover %) × % You Hold — moves into the Concentrated Stock Position instead of your cash flow, at <strong>full cost basis</strong> (basis at vest equals that day's market price, so a just-vested share carries no unrealized gain). While routing is on, the position's diversification tax uses a <strong>tracked blended basis</strong> — seeded by the Cost Basis % for today's balance, raised by each routed-in vest, decayed by growth — instead of the flat %, so newly-vested shares aren't overtaxed when later diversified. The vest itself is still taxed as ordinary income in full either way (holding shares doesn't change what the IRS collects at vest), and the withholding mechanics don't need modeling — the engine computes your actual tax on the full vest through the normal tax math. In Auto current-spending mode the derived spending correctly excludes the held value (it was never take-home cash); in Custom mode the held value simply reduces that year's investable surplus. The Year by Year concentrated-stock column shows each year's routed-in amount as a green "+".</td>
              <td style={sectionStyles.td}>Per position, shown once that position is enabled. Toggle ON/OFF. When on: <strong>Sold to Cover Taxes (%)</strong> (default 35 — the typical big-tech sell-to-cover rate), <strong>Of the Rest, % You Hold</strong> (default 100 = keep everything the employer leaves you; 0 = sell on vest, identical to routing off), and — when a second spouse is enabled — <strong>Whose Vests</strong> (Spouse 1 / Spouse 2 / Both; "Both" only when both spouses hold the same employer's stock; position 2 defaults to Spouse 2). Uses the grants entered in Equity Compensation (RSU/GSU) above; with no grants configured for the chosen spouse it routes nothing.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle + Fields</span><br/><strong>Non-Qualified Deferred Compensation (NQDC)</strong></td>
              <td style={sectionStyles.td}>Models a "top-hat" 409A plan letting a highly-compensated employee defer salary/bonus pre-tax with no IRS dollar limit, unlike a 401(k). The deferred balance is just an unsecured bookkeeping promise from the employer — not held in a protected trust the way a 401(k) is (employer credit/bankruptcy risk isn't separately modeled) — and the payout schedule must be elected in advance. The deferral reduces taxable salary the same way a Pre-Tax 401(k) contribution does, but — unlike a 401(k) — is still subject to FICA in the year it's deferred (only income tax is postponed, matching how NQDC actually works); distributions come back as fully taxable ordinary income (taxed like pay for tax/IRMAA/SS-taxability purposes, though Year by Year shows them apart from Salary) with no FICA owed a second time. A balance whose payout years are already past is paid in full in the plan&rsquo;s first year.</td>
              <td style={sectionStyles.td}>Toggle ON/OFF per spouse. When on: Existing Balance ($, for an already-accrued plan), Annual Deferral ($/yr, stops once that spouse retires), Credited Growth Rate (%/yr, this plan's own bookkeeping rate — separate from your portfolio's return), Distribution Start Age (the elected payout trigger, typically retirement), and Distribution Years (1 = lump sum; more = level installments recalculated against the remaining balance each year, so it fully drains by the end of the window). Year by Year gains an &ldquo;NQDC Balance&rdquo; column.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyles.card} data-reference-card>
        <h2 style={sectionStyles.cardTitle}>
          <AlertCircle size={20} />
          Advanced Tax Strategies
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Found on Plan &rarr; Taxes &amp; Roth (the &ldquo;Roth Conversion Optimization&rdquo; section and the always-visible &ldquo;Medicare Premiums (IRMAA)&rdquo; block beneath it for the SSA-44 appeal, a declared life-changing event and your last two returns) and Plan &rarr; Spending &rarr; Withdrawals &amp; Taxable Account (tax-loss harvesting and the cash reserve).
        </p>
        <table style={sectionStyles.table}>
          <thead>
            <tr>
              <th style={sectionStyles.th}>Input / Widget</th>
              <th style={sectionStyles.th}>Purpose & Effect</th>
              <th style={sectionStyles.th}>Valid Inputs / Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle + Dropdown</span><br/><strong>Stay under an IRMAA tier</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Taxes &amp; Roth, under the conversion strategy</em></td>
              <td style={sectionStyles.td}>A cap on whichever conversion strategy is active. In any year where one of you will be on Medicare two years later (alive, 65 or older then, and not still on an employer plan), the conversion is held back so this year&rsquo;s MAGI &mdash; ordinary income, the Social Security the conversion makes taxable, dividends &mdash; stays at or under the chosen IRMAA threshold minus the Buffer, using the thresholds that will be in force in that later year (indexed two more years, with the top tier&rsquo;s legal freeze and the IRMAA-freeze stress test applied). Other years are untouched. Withdrawals the plan sizes later in the year and realized gains can still lift the settled MAGI over the line; the year&rsquo;s Health column two years on shows what was charged.</td>
              <td style={sectionStyles.td}>Toggle ON/OFF (default OFF). <strong>Highest tier to allow</strong>: No surcharge (income at or under the first threshold) or surcharge tiers 1&ndash;4, labeled with this year&rsquo;s thresholds for your filing status. Shares the Buffer with the bracket fill. Year by Year shows the conversion held back and the ceiling used.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Dropdown + Fields</span><br/><strong>Roth Conversion Strategy</strong></td>
              <td style={sectionStyles.td}>Deliberate Pre-Tax &rarr; Roth conversions each year. <strong>None</strong> converts nothing. <strong>Fixed</strong> converts a set dollar amount (capped by the Pre-Tax balance). <strong>Maximize to Marginal Tax Bracket</strong> converts as much as fits under the chosen bracket&rsquo;s ceiling minus your Buffer, allowing for the Social Security the conversion makes taxable (the &ldquo;tax torpedo&rdquo;), the senior bonus deduction phasing out, and any after-tax basis in the Pre-Tax bucket. Year by Year shows three columns for a converting plan: <em>Roth Conv</em>, <em>Taxable Part</em> and <em>Conv Tax</em> (the year&rsquo;s tax with the conversion minus the same year without it). Nothing is withheld from a conversion, so its tax is paid from whatever your <strong>Withdrawal Order</strong> draws that year: with Taxable First that is the brokerage, which lets the whole conversion grow tax-free; with Pre-Tax First it is the Pre-Tax bucket, and because those draws also use up bracket room a max-bracket strategy converts much less (on the demo household, less than half as much).</td>
              <td style={sectionStyles.td}>Strategy: None / Fixed / Maximize to Marginal Tax Bracket. Fixed: Annual Conversion Amount ($). Maximize: Target Bracket (12/22/24/32%) and Buffer ($, headroom left unused below the ceiling). Both: Delay Until Retirement toggle and Duration (years; 0 = unlimited). The Year by Year ledger shows each year's Roth Conversion and the Dashboard's Tax &amp; Roth Conversion Analysis totals what was converted and what it cost.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Input</span><br/><strong>Qualified Charitable Distribution ($/yr)</strong></td>
              <td style={sectionStyles.td}>From the year the account owner turns 71 (the law allows it from 70&frac12;), routes this amount straight from your Pre-Tax account to charity instead of to you. It satisfies any required minimum distribution due that year, and any amount beyond the RMD is a further distribution; all of it is excluded from taxable income entirely, unlike a normal withdrawal.</td>
              <td style={sectionStyles.td}>Currency value ($0 = disabled). Capped by the Pre-Tax balance and by the annual IRS QCD limit ({usd(QCD_LIMIT_2026)} for {TAX_YEAR}, indexed after), applied once per household.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Spouse is the sole beneficiary of the Pre-Tax accounts</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Taxes &amp; Roth; two-spouse plans only</em></td>
              <td style={sectionStyles.td}>Required minimum distributions divide the Pre-Tax balance by a life-expectancy figure from an IRS table. When the account&rsquo;s sole beneficiary is a spouse more than 10 years younger, the law uses the Joint and Last Survivor table instead of the Uniform Lifetime table: the account is spread over both lives, so each year&rsquo;s required draw is smaller (a 75-year-old with a 60-year-old spouse divides by 28.3 rather than 24.6). The ledger says which table each year used.</td>
              <td style={sectionStyles.td}>On by default. Turn it off when a trust, a child or several people are named instead. Has no effect when the spouses are within 10 years of each other, and none once only one spouse is living. The plan&rsquo;s Pre-Tax balance is read as the first spouse&rsquo;s, so only a younger second spouse stretches the divisor. After the first death the plan assumes the survivor rolls the Pre-Tax balance into their own account (their own age and start age, and the under-59&frac12; penalty on draws); the alternative of keeping it as an inherited account &mdash; penalty-free draws at any age, required distributions deferred until the year the first spouse would have reached their start age &mdash; is not modeled, so a survivor under 59&frac12; who draws on it is priced with a penalty a planner would avoid.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Dropdown</span><br/><strong>Deduction</strong> (Federal Deductions)<br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Taxes &amp; Roth</em></td>
              <td style={sectionStyles.td}>Whether each year&rsquo;s federal return takes the standard deduction or the larger of that and the itemized deductions the plan can see: state income tax (the figure the plan computed for the year before, as what is paid in a year) plus property tax under the cap; mortgage interest from your Debt entries on up to $750,000 of acquisition debt; cash gifts to charity after a floor of 0.5% of income and up to 60% of it; and health costs &mdash; the pre-65 Healthcare Bridge net of its ACA credit, long-term care, Medicare Part B and D premiums with IRMAA, less what an HSA paid &mdash; over 7.5% of income. The age-65 add-on and the senior bonus apply with either. The Tax &amp; Estate view and the ledger say which the year used.</td>
              <td style={sectionStyles.td}>Larger of the two each year (the default, as a tax program does), or always the standard deduction, which is how every plan was taxed before. Two separate MFS returns always take the standard deduction. The cap on state and property tax is $40,400 for 2026, rising 1% a year to 2029 and $10,000 from 2030, reduced by 30% of income over $505,000 to a floor of $10,000 (half of each for MFS). Not counted: investment interest, casualty losses, the 35% ceiling on the value of deductions in the top bracket, and state rules on itemizing (Iowa, Montana and North Dakota, which start from federal taxable income, take whichever deduction the federal return used).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Number</span><br/><strong>Property tax ($/yr)</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Taxes &amp; Roth</em></td>
              <td style={sectionStyles.td}>The property tax on your home, in today&rsquo;s dollars, for the itemized deduction only &mdash; the cost itself stays inside your Housing spending, where it always was.</td>
              <td style={sectionStyles.td}>Dollars per year, $0 by default. Grows with your housing inflation rate.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Number</span><br/><strong>Cash gifts to charity ($/yr)</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Taxes &amp; Roth</em></td>
              <td style={sectionStyles.td}>Cash you give to charity each year, in today&rsquo;s dollars, for the deduction only &mdash; the giving itself stays inside your spending. Itemizing, it is deductible after a floor of 0.5% of income and up to 60% of it; taking the standard deduction, up to $1,000 ($2,000 on a joint return) of it is deductible from 2026. Qualified Charitable Distributions are separate and never counted here.</td>
              <td style={sectionStyles.td}>Dollars per year, $0 by default. Grows with inflation.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>The mortgage bought or built the home</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Taxes &amp; Roth; shown with a mortgage in Debt</em></td>
              <td style={sectionStyles.td}>Mortgage interest is deductible when the loan bought, built or improved the home (acquisition debt), on up to $750,000 of principal. A cash-out refinance or a home-equity loan is not.</td>
              <td style={sectionStyles.td}>On by default. Off leaves the mortgage out of the itemized total; the payment itself is unchanged.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle + Fields</span><br/><strong>Backdoor Roth Contributions</strong></td>
              <td style={sectionStyles.td}>Models the non-deductible-IRA-contribution-then-convert workaround high earners use when they're over the income limit for direct Roth contributions. If you already hold other Pre-Tax money, the IRS pro-rata rule means each Roth conversion is only partly tax-free — proportional to how much of your whole Pre-Tax bucket is after-tax basis, not just this year's contribution.</td>
              <td style={sectionStyles.td}><strong>Annual Backdoor Contribution ($/yr), one field per spouse</strong> — each spouse makes their own non-deductible IRA contribution and one spouse can be $0 (defaults are the {TAX_YEAR} IRA limit, $7,500) — and <strong>Existing After-Tax Basis Already in Pre-Tax Accounts ($)</strong> (from past non-deductible contributions, per IRS Form 8606). Requires the Roth Conversion Strategy above to be set to Fixed or Maximize to Marginal Tax Bracket — otherwise contributions just sit as basis and are never actually converted.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Tax-Loss Harvesting</strong></td>
              <td style={sectionStyles.td}>In a down market year, models realizing (harvesting) the Taxable brokerage account's paper loss for a tax benefit while staying invested. The harvested loss offsets realized capital gains dollar-for-dollar first &mdash; the gains on Life-Event Taxable withdrawals and on the Taxable draw the plan takes for spending &mdash; then up to $3,000 a year against ordinary income ($1,500 filing separately; the cap is statutory and not indexed), with any leftover carried forward. Qualified dividends are not capital gains, so the loss never offsets them.</td>
              <td style={sectionStyles.td}>Toggle ON/OFF. Only produces a benefit in years with a negative return — either from a Historical Stress Test (Risk & Stress tab) or a Monte Carlo trial's randomized down year; the standard single-average-return projection has no down years to harvest by itself.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle + Fields</span><br/><strong>Cash Floor / Emergency Reserve</strong></td>
              <td style={sectionStyles.td}>The classic retirement "bucket strategy" defense against sequence-of-returns risk: keeps a stable, low-yield cash reserve (a savings or money-market yield, not your portfolio's return) sized to a chosen number of months of spending. In the retirement year after a down market, spends the reserve FIRST instead of selling depressed Taxable/Pre-Tax/Roth holdings at a loss; after an up or flat year, when the reserve is below target, tops it back off out of that year's withdrawal. It reacts to the year just finished because a year's withdrawals are set when the year begins, before its return is known. A top-up happens only as far as the accounts can pay for it, and in any year the accounts cannot cover, the reserve is spent before a shortfall is counted. The draw/replenish mechanic itself is only active once retired — pre-retirement spending is covered by salary, not portfolio withdrawals, so there's no sequence-of-returns risk to protect against yet. An optional "Build Up Gradually While Working" sub-toggle lets you start filling the reserve before that: each working year, leftover cash flow (income minus taxes, living expenses, and planned contributions) that would otherwise flow entirely into Taxable Brokerage is redirected into the reserve first, up to its target, so it's already the right size on day one of retirement instead of requiring one large top-off withdrawal that year.</td>
              <td style={sectionStyles.td}>Toggle ON/OFF. When on: Starting Reserve Balance ($, its own bucket, not part of Taxable unless linked as below), Target Size (months of that year&rsquo;s total spending &mdash; lifestyle, healthcare, long-term care and IRMAA), Reserve Yield (%/yr), and a &ldquo;Build Up Gradually While Working&rdquo; toggle (off by default: the reserve then fills only once retired). Year by Year gains a "Cash Reserve" column showing the year-end balance, with inline markers (green +) for any year it was replenished, pre-funded from working-years surplus, or (red −) drawn down. <strong>Starting Reserve Balance can be linked to your holdings</strong> (Detailed Holdings users): it then tracks the market value of your Taxable-account cash equivalents &mdash; money-market funds, T-bill ETFs, and anything you set to Cash Equivalent yourself &mdash; and those holdings are netted OUT of the Taxable balance, since cash equivalents otherwise sit inside it and the same dollars would be counted in both. Only TAXABLE cash counts: the reserve is drawn before any account and never taxed because it is already-taxed money, whereas cash inside a Pre-Tax/Roth/HSA account is modeled by that bucket and drawing it is an income event. The link is opted into and unlinked from this screen, so it stays reachable without Premium, and unlinking leaves the last synced figure in place.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle + Fields</span><br/><strong>NUA Employer Stock Distribution</strong></td>
              <td style={sectionStyles.td}>Net Unrealized Appreciation: a one-time, in-kind lump-sum distribution of employer stock held inside your Pre-Tax 401(k). You owe ordinary income tax immediately only on the stock's original cost basis — the untaxed appreciation moves to your Taxable account instead, taxed at capital-gains rates only when eventually sold.</td>
              <td style={sectionStyles.td}><strong>Employer Stock Cost Basis ($)</strong>, <strong>Employer Stock Current Value ($)</strong>, and <strong>Distribution Age</strong> (the age it triggers, once). A warning appears if current value is set below cost basis.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Alternative Minimum Tax (AMT)</strong></td>
              <td style={sectionStyles.td}>No input required — every year's ordinary taxable income is automatically run through a simplified AMT calculation (exemption, phase-out, and 26%/28% breakpoint), and the excess over your regular tax (if any) is added to your total tax bill. Surfaces as a Dashboard warning when it's material to your plan.</td>
              <td style={sectionStyles.td}>N/A — always on in the background.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyles.card} data-reference-card>
        <h2 style={sectionStyles.cardTitle}>
          <CheckCircle size={20} />
          Estate & Legacy Planning
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Found on the Tax & Estate tab, in the Estate Legacy Planner's "Beneficiary Settings" panel.
        </p>
        <table style={sectionStyles.table}>
          <thead>
            <tr>
              <th style={sectionStyles.th}>Input / Widget</th>
              <th style={sectionStyles.th}>Purpose & Effect</th>
              <th style={sectionStyles.th}>Valid Inputs / Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Split the estate equally among heirs</strong></td>
              <td style={sectionStyles.td}>On (the default), every heir receives the same fraction of the estate &mdash; 1/3 each for three children &mdash; and the per-heir Split % is ignored, so nothing is ever left unassigned by rounding. Off, each heir's Split % rules, normalized to 100%.</td>
              <td style={sectionStyles.td}>On or off. Turn it off to give heirs different shares.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Per heir</span><br/><strong>State the heir lives in</strong></td>
              <td style={sectionStyles.td}>The income tax on the inherited Pre-Tax money (and any inherited HSA or deferred comp) is owed where the <em>heir</em> lives, so an heir in New Mexico pays New Mexico on each of the ten years of withdrawals while one in Texas pays none. Estate and inheritance tax are different: they follow the estate's own state, whatever the heir's. Shown per heir as part of the Income Tax column in the Per-Heir Breakdown.</td>
              <td style={sectionStyles.td}>Defaults to the estate's state. Every state and DC is priced by its own 2026 rules, at the heir&rsquo;s age, with the withdrawals stacked on the heir&rsquo;s income: the eight no-income-tax states owe nothing, and in Washington only an heir whose income is over $1,000,000 from 2028 owes tax on them.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Read-only figure</span><br/><strong>Total Heir Tax Drag</strong></td>
              <td style={sectionStyles.td}>The federal income tax your heirs pay on what they inherit, from each heir&rsquo;s filing status and income entered on their card, summed across heirs. State income tax where an heir lives is shown separately in the Per-Heir table&rsquo;s Income Tax column and is not part of this figure. Both are distinct from State Estate or Inheritance Tax, which depends on where <em>you</em>, the account owner, live.</td>
              <td style={sectionStyles.td}>Not an input. Follows each heir&rsquo;s distribution strategy (ten-year RMD, flat ten-year, lump sum) since the strategy sets which years the inherited income lands in.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Card List</span><br/><strong>Heirs (Name, Filing Status, Income, Split %, Age today)</strong></td>
              <td style={sectionStyles.td}>Splits your ending estate across multiple named heirs instead of assuming a single beneficiary. Each heir's own income and filing status drives their individual IRS 10-Year Rule tax schedule on the inherited Pre-Tax share, since their existing income determines what bracket that money lands in. <strong>Age today</strong> sets the single-life divisor for the annual required minimums an heir must take in years 1&ndash;9 when you die on or after your own RMD age: the plan ages the heir forward to the year after the last spouse&rsquo;s life expectancy and reads the IRS Single Life Table from there, shrinking the divisor by one each year.</td>
              <td style={sectionStyles.td}>Add/remove heirs freely. Split % across all heirs is normalized automatically if it doesn't add to exactly 100%. Age today is optional &mdash; blank assumes the heir is 30 years younger than the first spouse. The Plan Default withdrawal strategy applies to every heir unless overridden on the heir&rsquo;s own card: <strong>Annual RMDs, balance in Year 10</strong> (the default &mdash; what the final IRS regulations require when you die on or after your required beginning date; before it, nothing is required until year 10), <strong>Flat 10-Year</strong>, <strong>Lump Sum Year 1</strong>, or <strong>Lump Sum Year 10</strong> &mdash; the last is not permitted once the owner was past the RMD age, and the plan substitutes the annual-RMD schedule and says so above the schedule table.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>State Estate/Inheritance Tax</strong></td>
              <td style={sectionStyles.td}>Adds state-level estate or inheritance tax on top of the federal 10-Year Rule income tax, for the 16 states and DC that levy one (CT, HI, IL, KY, ME, MD, MA, MN, NE, NJ, NY, OR, PA, RI, VT, WA, DC). Driven by the state you live in at the end of the plan (<strong>State of Residence</strong>, or your last move). The two taxes work differently: an <em>estate</em> tax is charged once on the whole estate before anything is distributed, while an <em>inheritance</em> tax (KY, MD, NE, NJ, PA &mdash; Maryland levies both) is charged to each beneficiary individually at a rate set by their <strong>Relationship to you</strong>. That relationship is the single biggest lever in those five states: Pennsylvania charges a child 4.5% and a friend 15%, and New Jersey charges a child nothing and a niece 15&ndash;16%.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic, from your state at the end of the plan and each heir&rsquo;s share of the gross estate. Shown per heir in the &ldquo;Per-Heir Breakdown&rdquo; table and summarized in Transfer Metrics. <strong>Each state&rsquo;s real structure applies.</strong> Seven walk a graduated schedule: Oregon (from 10%), Washington (from 10%, above its $3,000,000 exclusion) and Minnesota (from 13%) their own, and Massachusetts, Rhode Island, Illinois and Maryland the frozen pre-2001 federal credit table (Massachusetts and Rhode Island less their own credit). <strong>New York&rsquo;s exclusion is a credit</strong> that phases out between 100% and 105% of the exclusion and is gone above it, so the whole estate is taxed &mdash; a near-200% marginal rate inside that band. <strong>Illinois&rsquo; $4,000,000 is a threshold</strong>, so crossing it taxes everything. <strong>Maryland subtracts inheritance tax paid</strong> from its estate tax instead of charging both, and all five inheritance-tax states leave <strong>life insurance paid to a named beneficiary</strong> out of the inheritance base (it stays in the estate base). Connecticut, Hawaii, Maine, Vermont and DC apply a single rate above their exemption.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Federal Estate Tax</strong></td>
              <td style={sectionStyles.td}>Adds federal estate tax on top of state estate/inheritance tax and the federal 10-Year Rule income tax, using current law: a {usd(FEDERAL_ESTATE_EXEMPTION_2026)} per-person exemption for {TAX_YEAR}, doubled to {usd(2 * FEDERAL_ESTATE_EXEMPTION_2026)} for a married couple, filing jointly or separately (assumes a portability election is filed on IRS Form 706), taxed at a flat 40% above that threshold. The first spouse&rsquo;s unused exemption is fixed at the first death; only the survivor&rsquo;s own grows with inflation to the end of the plan. Reads $0 for the large majority of plans — only estates above the exemption owe anything.</td>
              <td style={sectionStyles.td}>N/A — automatic based on your <strong>Filing Status</strong> (Plan &rarr; Household) and each heir's share of the gross estate. Shown per-heir in the "Per-Heir Breakdown" table and as its own card in the Transfer Metrics panel. <strong>The exemption is carried to the plan&rsquo;s final year</strong> at your Tax Bracket Inflation Rate, because the estate is valued in that year&rsquo;s dollars. The GST exemption moves with it, as do the state exemptions that are genuinely indexed and your heirs&rsquo; own brackets and income; exemptions fixed in statute do not. The <strong>Index estate thresholds for inflation</strong> toggle at the top of Tax &amp; Estate turns it off. State estate tax paid is deducted from the federal taxable estate.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Inherited HSA Tax</strong></td>
              <td style={sectionStyles.td}>An HSA has no beneficiary-friendly exit. A surviving spouse inherits it as their own HSA (which is why the first death in a couple passes it along intact), but any other heir owes ordinary income tax on the <em>entire</em> balance in the year of death &mdash; no ten-year stretch, no step-up, no Roth treatment. The plan&rsquo;s ending HSA balance is part of the gross estate, and each heir&rsquo;s share is taxed at their own filing status and income in year one, shown as its own line per heir and in the totals.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic from the projection&rsquo;s ending HSA balance and each heir&rsquo;s split. Reduce it by spending the HSA on medical costs in your own lifetime (the Healthcare Bridge, LTC and Medicare surcharge costs already draw on it) or by leaving it to your spouse. A charitable bequest never comes out of the HSA.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle + Fields</span><br/><strong>Charitable Bequest &mdash; which accounts fund it</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tax &amp; Estate &rarr; Estate Legacy Planner</em></td>
              <td style={sectionStyles.td}>Sets how much goes to charity at death (a percent or an amount) and, separately, <em>which assets pay for it</em>. The estate-tax deduction for a charitable bequest is unlimited, so the gift leaves the taxable estate outright &mdash; heirs receive less, and the estate tax on what remains is lower. Which bucket funds it changes the after-tax result on its own, because a charity owes no income tax on an inherited IRA while an heir owes their own marginal rate on every dollar of one under the 10-Year Rule. The panel shows what your chosen order is worth against spreading the gift proportionally.</td>
              <td style={sectionStyles.td}>A bequest is fundable from <strong>five</strong> buckets: Pre-Tax, Roth, Taxable, your <strong>cash reserve</strong> and a <strong>concentrated stock position</strong>. Cash and the stock position drain alongside Taxable (all three reach heirs with a step-up in basis, so they are worth the same to an heir); <strong>Roth is last in every order</strong>, being the most expensive dollar to give away. <strong>Never fundable:</strong> home equity (not liquid at death), unpaid NQDC (a claim on the employer&rsquo;s schedule), the HSA and life insurance (each passes to its own named beneficiary and is not the executor&rsquo;s to direct). One stated simplification: this model grows an inherited IRA across the heir&rsquo;s 10-year window while treating Roth, Taxable, cash and stock as paid out at once, so it credits Pre-Tax with growth the others do not get &mdash; the comparison panel says so on its face.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle + Fields</span><br/><strong>Life Insurance (Cash Value)</strong></td>
              <td style={sectionStyles.td}>Tracks each spouse's own permanent life insurance policy (Whole, Universal, or Variable Appreciable Life) as a fifth asset bucket, and its death benefit as a legacy transfer to heirs — fully independent per spouse, since it's common for each to carry a separate policy rather than one shared household policy. Each policy pays exactly once, at its insured's death, income-tax-free. If the insured spouse dies before the other: a Self-owned policy's net benefit is paid to the surviving spouse and invested in the Taxable account (arriving as 100% basis) in the year of death — the policy then ceases to exist; an ILIT-owned policy is instead frozen at its year-of-death value and held for the heirs outside the estate. A policy still unpaid at plan end (the last survivor's own, or a single planner's) passes to heirs and counts toward the taxable gross estate only when that policy's own <strong>Ownership</strong> is Self — an Irrevocable Life Insurance Trust (ILIT) is excluded entirely. One spouse's policy can be Self-owned (included) while the other's is ILIT-owned (excluded); the Tax & Estate tab's Life Insurance Proceeds card shows the included/excluded split when they differ.</td>
              <td style={sectionStyles.td}>Per spouse: Policy Type, Ownership (Self / ILIT), Cash Value ($) and its annual Growth Rate (%), Loan Balance ($) and Loan Interest Rate (%) if you've borrowed against the policy, Death Benefit ($) — optionally an Increasing Benefit (defaults on for Variable Appreciable Life) — and Annual Premium ($/yr).</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyles.card} data-reference-card>
        <h2 style={sectionStyles.cardTitle}>
          <Activity size={20} />
          Retirement Timing & Healthcare Costs
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Found on Plan &rarr; Income (Phased Income), Taxes &amp; Roth (ACA Subsidy Protection), and Spending (Three-Phase Lifestyle and long-term care).
        </p>
        <table style={sectionStyles.table}>
          <thead>
            <tr>
              <th style={sectionStyles.th}>Input / Widget</th>
              <th style={sectionStyles.th}>Purpose & Effect</th>
              <th style={sectionStyles.th}>Valid Inputs / Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Input + Toggle</span><br/><strong>Share of Bridge That Is Insurance Premiums (%)</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Spending, under Healthcare Bridge Cost</em></td>
              <td style={sectionStyles.td}>Splits the pre-Medicare Healthcare Bridge into the part that is insurance premiums and the part that is out-of-pocket care, because IRS rules let an HSA pay premiums in only four situations &mdash; long-term care insurance, COBRA continuation coverage, coverage while you are drawing unemployment, and Medicare and other coverage from 65 &mdash; and &ldquo;retired early and buying my own policy&rdquo; is none of them. Only the non-premium share is drawn tax-free from the HSA; the rest is funded like any other expense, from a taxable withdrawal.</td>
              <td style={sectionStyles.td}>0&ndash;100, default <strong>70</strong> (roughly the premium share of a typical early-retiree health budget). Set it to 0 to let the HSA pay the whole bridge. The <strong>Premiums qualify anyway (COBRA / on unemployment)</strong> toggle directly below makes the entire bridge a qualified expense again for the situations the IRS does allow. Medicare Part B/D premiums, IRMAA and long-term care costs are unaffected &mdash; those are qualified at any age and still draw on the HSA in full.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Fields + Toggle</span><br/><strong>Annuity Purchase</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Income &rarr; Buy an annuity in retirement</em></td>
              <td style={sectionStyles.td}>Buys a single-premium annuity at a chosen age with money from a chosen account, then pays a fixed percentage of the premium back every year for the rest of the plan. How much of each payout is taxable follows the account that bought it: Pre-Tax money makes the whole payout ordinary income, Roth money makes it entirely tax-free, and brokerage money gets the IRS exclusion ratio &mdash; premium divided by expected return &mdash; so part of every payment is your own capital coming back untaxed until the whole premium has been recovered, after which the payout is fully taxable. If the chosen account holds less than the purchase amount, the annuity is bought with what is there and pays on that. Buying with brokerage money sells holdings, so the gain on them is taxed that year.</td>
              <td style={sectionStyles.td}>Behind the <strong>Buy an annuity in retirement</strong> switch (on whenever a purchase amount is set; turning it off zeroes the purchase): <strong>Purchase Amount ($)</strong>, <strong>Purchase Age</strong>, <strong>Payout Rate (%)</strong>, <strong>Payout Indexation (%)</strong>, and <strong>Source Account</strong> (Taxable Brokerage / Pre-Tax / Roth). <strong>Tax Every Dollar of the Payout</strong> stays ON by default, which forces the whole payment to ordinary income regardless of source. Turn it off to use the source-based treatment above. The expected return behind the exclusion ratio is this plan&rsquo;s own projected payouts through Spouse 1&rsquo;s life expectancy, so shortening that life expectancy raises the excluded share of each payment (but never the total, which is capped at the premium).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Inputs</span><br/><strong>Phased / Part-Time Retirement Income</strong></td>
              <td style={sectionStyles.td}>Models reduced earned income (consulting, part-time work) after your Retire Age instead of a full stop of income. Treated exactly like pre-retirement salary — subject to income tax and FICA (Social Security/Medicare payroll tax) the same way — since it's real earned income, not a retirement account withdrawal.</td>
              <td style={sectionStyles.td}><strong>Part-Time Income ($/yr)</strong> per spouse and <strong>Part-Time Income End Age</strong> (the age it stops). Leave Part-Time Income at $0 to model a full stop of income at retirement (the default). Does not generate new Pre-Tax/Roth contributions on its own — savings contributions stop at the Retirement Age.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Switch + Fields</span><br/><strong>Enable Go-Go Travel Bumps</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Spending</em></td>
              <td style={sectionStyles.td}>A simpler alternative to the Three-Phase Lifestyle Curve: adds a percentage to lifestyle spending in the early retired years, until an end age, for travel and other active-retirement costs. Off while the curve is on; turning one on turns the other off.</td>
              <td style={sectionStyles.td}>Off by default. Extra spending: a percentage of lifestyle spending (default 10%). End age: default 75; the bump applies while either person is at or under it.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle + Fields</span><br/><strong>Three-Phase Lifestyle Curve</strong></td>
              <td style={sectionStyles.td}>Models the common real-world pattern where retirees spend more in early, active retirement ("Go-Go"), less as they slow down ("Slow-Go"), and least in late retirement ("No-Go") — instead of a single flat lifestyle spending target for the whole retirement. Mutually exclusive with the simpler Go-Go Travel Bump toggle (enabling one disables the other).</td>
              <td style={sectionStyles.td}><strong>Go-Go End Age</strong> / <strong>Go-Go Multiplier (%)</strong> (default 75 / 110% of base lifestyle spend), <strong>Slow-Go End Age</strong> / <strong>Slow-Go Multiplier (%)</strong> (default 83 / 85%), and a <strong>No-Go Multiplier (%)</strong> applied for every age after Slow-Go End Age (default 70%). Multipliers apply on top of your base Annual Lifestyle spend and still get the usual inflation adjustment. Entered as percentages (110 = 10% more).</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Apply the curve to discretionary spending only</strong></td>
              <td style={sectionStyles.td}>Shown once a category ledger drives the budget. Each phase multiplier then applies to the discretionary share only and the essential share stays whole: on a budget that is 65% essential, Go-Go 110% lifts the total about 3.5% and No-Go 70% cuts it about 10.5%, not 30%. The mortgage, insurance and groceries do not fall by a third at 84. Without a ledger the plan has no essential share and the multiplier scales the whole budget.</td>
              <td style={sectionStyles.td}>ON by default. Turn OFF to scale the whole budget, essentials included.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle + Fields</span><br/><strong>Long-Term Care (LTC) Active Assumption — per spouse</strong></td>
              <td style={sectionStyles.td}>Adds a long-term care cost starting at a chosen age, added on top of your regular lifestyle spending. Fully independent per spouse — each has their own Active toggle, Cost, Start Age, Duration, and Ends-in-Death setting, since one spouse may never need LTC at all while the other needs a very different kind or cost of care. If both spouses have LTC active in overlapping years, both costs stack. By default each spouse's LTC is a bounded episode — not a cost that lasts the rest of their life — but that spouse's "LTC Ends in Death" toggle can remove that bound for a scenario where their care is permanent instead of temporary.</td>
              <td style={sectionStyles.td}>Per spouse: <strong>Long-Term Care Annual Cost ($)</strong>, <strong>Long-Term Care Start Age</strong> (default 82), and either <strong>Long-Term Care Duration (years)</strong> (default 3 — care episodes average two to three years) or, if that spouse's <strong>Care Lasts for Life</strong> is toggled on, no duration field at all — their cost instead runs every year from their Start Age through their own Life Expectancy age. Set a spouse's main toggle off to disable LTC for just that person.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>ACA Subsidy Protection</strong></td>
              <td style={sectionStyles.td}>Relevant only if you retire before Medicare eligibility (65) and live in one of the nine states with a coverage gap (AL, FL, GA, KS, MS, SC, TN, TX, WY; Wisconsin did not expand Medicaid either, but covers adults to the poverty line, so it has no gap). In those states, income below 100% of the Federal Poverty Level qualifies for neither non-expanded Medicaid nor ACA marketplace subsidies — a real "coverage gap" with no affordable insurance option. When enabled, forces a small additional Roth conversion each year that would otherwise land in the gap, just large enough to clear the FPL floor and preserve subsidy eligibility. The gap test uses the year's full ACA MAGI — ordinary income including that year's Pre-Tax withdrawals, dividends, realized gains on Taxable withdrawals, and all Social Security — so a year funded mainly from Pre-Tax is usually already above the floor and needs no conversion; the forced amount is only the remaining shortfall. (Tax-exempt interest is not modeled.)</td>
              <td style={sectionStyles.td}>Toggle ON/OFF. Uses the same underlying Pre-Tax → Roth conversion mechanism as the Roth Conversion Strategy above (and is subject to the same Backdoor Roth pro-rata treatment if you have basis). If left off and the household is projected to land in the gap anyway, a Dashboard warning surfaces automatically. The state it checks is your State of Residence, set once on Plan &rarr; Household; Taxes &amp; Roth shows it with a link back there.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>ACA Cliff Protection</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Taxes &amp; Roth</em></td>
              <td style={sectionStyles.td}>The other edge of the pre-Medicare window. Marketplace premium tax credits end at 400% of the Federal Poverty Level &mdash; the app&rsquo;s line for {TAX_YEAR} is {usd(ACA_CLIFF_COUPLE)} of MAGI for a couple and {usd(ACA_CLIFF_SINGLE)} single &mdash; and one dollar over forfeits the entire year&rsquo;s credit, often $8,000&ndash;$20,000. Roth conversions are the usual cause for an early retiree. When on, in any year the household is retired and someone is still under 65, voluntary conversions (fixed or max-to-bracket) are capped so estimated ACA MAGI stays at or under the line. ACA MAGI is AGI plus the <em>untaxed</em> part of Social Security, so it counts all of your benefit. Applies in every state (the coverage-gap floor above only exists in non-expansion states).</td>
              <td style={sectionStyles.td}>Toggle ON/OFF (default ON since October 19; it does nothing in a plan with no marketplace year or no conversion, and a plan saved earlier keeps its own setting). Only voluntary conversions are capped; withdrawals the plan needs for spending can still cross the line, and those years get a red warning icon beside the Year in the Year by Year ledger (hover for the MAGI, the threshold, and any credit repaid). The line is the prior year&rsquo;s poverty guideline, as the marketplace uses. A separate Plan Feedback card appears when the premium the plan assumes is well under the benchmark plan for your ages and state, since the Healthcare Bridge default is not age-rated.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Number</span><br/><strong>ACA Premium Tax Credit</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Taxes &amp; Roth</em></td>
              <td style={sectionStyles.td}>The marketplace premium tax credit on the pre-65 Healthcare Bridge, in years the household is retired, under 65, and inside the 100%&ndash;400% FPL band. <strong>Computed</strong> (the default): the benchmark premium less the applicable percentage of ACA MAGI &mdash; 2.1% of income at the poverty line rising to 9.96% from 300% of it &mdash; capped at the premium share of the bridge cost. It is estimated before the year from last year&rsquo;s settled income (or this year&rsquo;s known income, if higher) and re-figured on the settled MAGI afterwards: a shortfall is repaid as tax and an excess is refunded, as the year-end reconciliation on the tax return does, so the Roth Ladder Optimizer and Tax Optimizer Hub see the real cost of a conversion that raises income or crosses the line. <strong>Typed</strong>: your own yearly figure in today&rsquo;s dollars, repaid in full in a year over the cliff or in a non-expansion coverage gap. Married filing separately cannot claim the credit, so the plan applies none in those years.</td>
              <td style={sectionStyles.td}>Computed or typed; a plan saved with a typed figure keeps it. The benchmark is the state&rsquo;s average second-lowest-cost silver premium for a 40-year-old (KFF, 2026), scaled by the federal age curve for each covered adult (New York and Vermont charge every age the same; Massachusetts half the climb) and the medical inflation rate, or your household&rsquo;s own figure from healthcare.gov&rsquo;s tax tool, in today&rsquo;s dollars. The applicable-percentage schedule is 2026&rsquo;s for every year.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Dropdown (per person)</span><br/><strong>Medicare while still on an employer plan</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Spending, below Healthcare Bridge Cost</em></td>
              <td style={sectionStyles.td}>Lets someone who turns 65 while covered by a current employer&rsquo;s group health plan &mdash; their own job or their spouse&rsquo;s &mdash; delay Part B and Part D, as the rules allow for an employer of 20 or more employees. While the covering job lasts, that person pays no Medicare premium or IRMAA in the plan; premiums start the year the covering worker reaches their retirement age.</td>
              <td style={sectionStyles.td}><strong>Enroll at 65</strong> (default), <strong>Delay: covered through own job</strong>, or <strong>Delay: covered through the spouse&rsquo;s job</strong>. Does not model the Part B penalty an employer under 20 employees would cause, the family premium (already inside the paycheck), or the eight-month enrollment window. Year by Year notes &ldquo;Medicare delayed&rdquo; in the affected years.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Assume a Form SSA-44 IRMAA appeal after retiring</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Taxes &amp; Roth &rarr; Medicare Premiums (IRMAA)</em></td>
              <td style={sectionStyles.td}>Medicare sets each year&rsquo;s IRMAA tier from the tax return filed <strong>two years earlier</strong>, and the projection does the same: each year&rsquo;s Medicare cost is priced off the income and filing status of two years before, against that year&rsquo;s thresholds. A high earner retiring at 65 therefore pays surcharges at 65 and 66 on salary income, and a Roth conversion at 63 shows up as a premium at 65. Social Security lets a beneficiary whose income has fallen after a <em>life-changing event</em> &mdash; stopping work, or the death of a spouse &mdash; file Form SSA-44 and have the current year&rsquo;s estimated MAGI used instead. This toggle models that filing: in the year of such an event and the two years after it, the plan charges the lower of the lookback premium and the current-year premium.</td>
              <td style={sectionStyles.td}>Toggle ON/OFF (default OFF, so the plan shows the overpayment that happens when nobody files). Hover the Medicare line of the Health cell in Year by Year to see which year&rsquo;s income set the tier. The income counted is adjusted gross income as the plan models it: Social Security at its taxable amount, plus the plan&rsquo;s own withdrawals, dividends and realized gains. Not modeled: tax-exempt interest. The saving is worked out whether or not the toggle is on, which is what drives the SSA-44 badge in Year by Year and the SSA-44 item in the Action Plan &mdash; so you are told the form is worth filing even with the toggle off.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Dropdown + Year</span><br/><strong>A Form SSA-44 life-changing event</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Taxes &amp; Roth &rarr; Medicare Premiums (IRMAA)</em></td>
              <td style={sectionStyles.td}>Declares one of the eight events Social Security accepts on Form SSA-44. The plan notices two on its own &mdash; someone stops working, and the death of a spouse. The other six (marriage, divorce, reduced work, loss of income-producing property, loss of a pension, an employer settlement) are things a projection can&rsquo;t represent, so you name the event and its year. That year and the two after it are priced off the current year&rsquo;s income wherever that gives the lower premium.</td>
              <td style={sectionStyles.td}>No year (the default) means nothing is declared. The year may be before the plan starts, which is the usual case. When a declared event and one the plan noticed both exist, the later one counts. A declared event can never raise a premium. The event type changes no figures; the Action Plan uses it to name the evidence Social Security will ask for. The form still has to be filed; this models the outcome only.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>2 Text Inputs</span><br/><strong>Income on your last two tax returns</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Taxes &amp; Roth &rarr; Medicare Premiums (IRMAA), shown only when someone is 63+ at the plan&rsquo;s start</em></td>
              <td style={sectionStyles.td}>The income on the two returns filed <em>before</em> the plan begins, so the plan&rsquo;s first two Medicare years are priced the way Medicare will price them. Without them, those years fall back to their own (usually lower, retired) income and understate the premium. Enter adjusted gross income plus any tax-exempt interest, from the return as filed.</td>
              <td style={sectionStyles.td}>Both default to $0, meaning <strong>not provided</strong> &mdash; never &ldquo;$0 of income&rdquo;. Each box works on its own. Filing status for those years is the plan&rsquo;s starting status. A household that retired just before the plan starts is treated as having stopped work then, so the Form SSA-44 appeal applies to it too.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic rule</span><br/><strong>Claiming Social Security while still working</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No input &mdash; applies whenever you claim before full retirement age with earned income</em></td>
              <td style={sectionStyles.td}>Claim before full retirement age while still earning and Social Security withholds <strong>$1 of benefit per $2 of earnings</strong> above {usd(SS_EARNINGS_TEST_EXEMPT_UNDER_FRA)}; in the calendar year you reach full retirement age the allowance rises to {usd(SS_EARNINGS_TEST_EXEMPT_FRA_YEAR)} and the rate falls to <strong>$1 per $3</strong>; from full retirement age the test stops ({TAX_YEAR} amounts, grown each year with inflation). <strong>The withheld months are credited back</strong> at full retirement age: the benefit is recomputed as though you had claimed that many months later, so it is permanently higher from then on. This is law rather than a scenario, so there is no toggle.</td>
              <td style={sectionStyles.td}>Applies per spouse, against that spouse&rsquo;s own benefit and earnings. <strong>Earned income only</strong> &mdash; salary, part-time income and RSU vesting. Pensions, annuities, rent, interest, dividends, gains, Roth conversions, deferred-compensation payouts and IRA or 401(k) withdrawals are not earnings. Withholding never exceeds the benefit. Year by Year shows the amount withheld. <strong>Not modeled:</strong> the monthly test in the first retired year; reducing a spousal top-up for the worker&rsquo;s earnings; and the month you reach full retirement age &mdash; the plan works in whole years, so the whole of that year gets the higher allowance.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Read-only panel</span><br/><strong>Filing Detail &mdash; Marginal Rate &amp; Effective Tax Rate</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tax &amp; Estate &rarr; Tax Brackets Visualizer, above the bracket bars</em></td>
              <td style={sectionStyles.td}>Both tiles come from the projection for the selected year. <strong>Effective Tax Rate</strong> is every tax the plan charges that year &mdash; federal and state income tax, capital-gains tax, the net investment income tax, AMT, FICA, and the tax on the withdrawal that funds your spending &mdash; over the income actually taxed; the dollar figure shows beneath it. <strong>Marginal Rate</strong> follows the <strong>Assume TCJA Rates Are Later Repealed</strong> toggle.</td>
              <td style={sectionStyles.td}>Display only. Beneath the rate, the year&rsquo;s tax splits into federal, state and FICA, and the three add up to the year&rsquo;s total. The federal 10% early-withdrawal penalty and any repaid ACA premium credit count as federal; a state&rsquo;s own extra tax on an early withdrawal (California&rsquo;s 2.5%) counts as state.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Read-only panel</span><br/><strong>Medicare IRMAA Status</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tax &amp; Estate &rarr; Tax Brackets Visualizer, beneath the selected year</em></td>
              <td style={sectionStyles.td}>Names the IRMAA tier the selected year is priced at, the income that set it, and the distance to the next cliff. Under Medicare&rsquo;s <strong>two-year lookback</strong> that is normally the return filed two years earlier, and the label names the year it came from. Where this year&rsquo;s own income differs, it shows separately as the figure that sets the premium two years out &mdash; which is why a Roth conversion at 63 raises a premium at 65.</td>
              <td style={sectionStyles.td}>Display only. Appears from the year the first spouse turns 63, the earliest income that can reach a Medicare premium. The label says whether the tier came from the return two years back, from this year (the plan&rsquo;s first two years, with no earlier year to read), or from a modeled Form SSA-44 appeal. No surcharge table is reprinted here: the premium charged is the Medicare line of the Health column in Year by Year. Medicare&rsquo;s income figure includes tax-exempt interest, which this plan does not model, so a household holding municipal bonds reads higher to Medicare than here; the panel says so.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionStyles.card} data-reference-card>
        <h2 style={sectionStyles.cardTitle}>
          <HelpCircle size={20} />
          Debt, Spending Strategy & Plan Feedback
        </h2>
        <table style={sectionStyles.table}>
          <thead>
            <tr>
              <th style={sectionStyles.th}>Input / Widget</th>
              <th style={sectionStyles.th}>Purpose & Effect</th>
              <th style={sectionStyles.th}>Valid Inputs / Behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Button</span><br/><strong>Suggest changes (Plan Feedback)</strong></td>
              <td style={sectionStyles.td}>Works out a set of changes that make the plan last with average returns: spending at 75% of household income (or a 4% draw on the nest egg when nobody is working), savings at 10% of income split Pre-Tax / Roth / Taxable, then retirement and claiming later for both spouses together, a year at a time, up to 70, and if that is still not enough, spending cut step by step.</td>
              <td style={sectionStyles.td}>Opens a preview listing every change, before and after, and changes nothing until you choose <strong>Apply these changes</strong>; <strong>Cancel</strong> leaves the plan alone. After Apply, <strong>Undo suggested changes</strong> beside the button puts the previous plan back while the page stays open.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Form</span><br/><strong>Life Events: Flow Type, Inflation Category, Taxable as Ordinary Income, funded outside this plan</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Life Events</em></td>
              <td style={sectionStyles.td}>The fields of each life event beyond its name, amount and ages. <strong>Flow Type</strong>: an Outflow (an expense) or an Inflow (money arriving, such as a home sale or an inheritance). <strong>Inflation Category</strong>: how the amount grows between now and the year it happens. Amounts are in today&rsquo;s dollars: General Lifestyle grows with your inflation rate, Housing with the housing rate, Medical / Healthcare with the medical rate, and None stays the exact amount you entered in every year it occurs. <strong>Taxable as Ordinary Income</strong>: for an inflow that is taxed as income in its year, such as a bonus. <strong>Already saved for this / funded outside this plan</strong>: an expense paid from money the plan does not track, so it is shown but never drawn from your accounts. An expense withdrawn from Pre-Tax before 59&frac12; also pays the 10% early-withdrawal penalty (and California&rsquo;s 2.5% on top for a California resident).</td>
              <td style={sectionStyles.td}>Flow Type: Outflow (Expense / Spend) or Inflow (Liquidity / Asset Sale). Inflation Category: General Lifestyle (default), Housing, Medical / Healthcare, or None (Fixed Amount). The two switches are off by default.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Number Input</span><br/><strong>Taxable Brokerage Dividend Yield (%/yr)</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Plan &rarr; Spending &rarr; Withdrawals &amp; Taxable Account</em></td>
              <td style={sectionStyles.td}>The share of the Taxable Brokerage balance paid out as dividends each year. The account&rsquo;s return already includes them, so they are not extra growth, but they are taxed every year and count in the income Medicare and the ACA read. How much is taxed at the lower qualified rate is set by <strong>Qualified share of that yield</strong>.</td>
              <td style={sectionStyles.td}>Percentage, default 2.0%. With Detailed Holdings linked, it follows your Taxable holdings&rsquo; real distributions and goes read-only.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Panel</span><br/><strong>Quick Update</strong><br/><em style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sidebar; the annual review; the data freshness reminder</em></td>
              <td style={sectionStyles.td}>A short panel with only the numbers people revisit often: account balances, salary, retirement age, Social Security claiming age and, optionally, the benefit estimates. It edits the same plan fields as Plan, and shows the verdict as you type.</td>
              <td style={sectionStyles.td}>Not a separate setting. <strong>Done</strong> closes it and records the date, which the sidebar&rsquo;s status line and the freshness reminder use.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Text Inputs</span><br/><strong>Mortgage / Other Debt (Plan &rarr; Balances &amp; Debt)</strong></td>
              <td style={sectionStyles.td}>Amortizes a mortgage and/or a separate other-debt balance (auto loan, personal loan, etc.) down to $0 based on a fixed annual payment, adding the payment to household expenses each year until paid off.</td>
              <td style={sectionStyles.td}>Balance ($), Interest Rate (%), and Annual Payment ($/yr) for each. Set balance or payment to $0 to disable. Year by Year gains a &ldquo;Debt Bal&rdquo; column once either is set.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Spending Guardrails (Risk & Stress tab)</strong></td>
              <td style={sectionStyles.td}>A simplified dynamic withdrawal strategy: after a year with a negative return, lifestyle spending skips that year&rsquo;s inflation raise (in a year prices fall, spending still falls with them), and a crash in the first retirement year cuts spending by 10% from the following year. Once the invested portfolio is back on the plan&rsquo;s own path in today&rsquo;s dollars (the same plan with no guardrails and no stress scenario), the skipped raises are restored and the cut is lifted; while it stays there, a down year freezes nothing. With floor-aware guardrails on, spending never falls below the share marked essential.</td>
              <td style={sectionStyles.td}>Toggle ON/OFF. Most visible when paired with a Historical Stress Test, the every-start history section or a Monte Carlo run, since the standard single-average-return projection has no down years to react to. The Guardrails vs Fixed Withdrawals grid shows what it costs in spending as well as what it leaves behind.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Withdrawal-Rate Guardrails (Risk &amp; Stress tab)</strong></td>
              <td style={sectionStyles.td}>Spends dynamically rather than on autopilot, and separately from the Spending Guardrails above. Each year the plan divides last year&rsquo;s lifestyle spending by the invested portfolio it started that year with, and compares that rate with the rate the plan&rsquo;s own path had in the same year (the same plan with no guardrails and no stress scenario). Scheduled changes &mdash; Social Security starting, the health bridge ending, a cash-reserve fill, a Life Event, conversion tax &mdash; appear on both sides and cancel, so on a smooth projection the rule never acts; only the markets and inflation move it. Above the upper rail, lifestyle spending steps down; below the lower rail, it steps up. With floor-aware guardrails on, a cut never takes spending below the share marked essential. Steps are permanent until the next trigger and compound, and both directions stop at a cap. Nothing else in the plan changes &mdash; only lifestyle spending moves.</td>
              <td style={sectionStyles.td}>Toggle ON/OFF, OFF by default; a plan projects identically until it is switched on. When on, five settings appear: <strong>Trigger band</strong> (% of the rate the plan expected that year, default 20 &mdash; an expected 4.0% acts above 4.8% and below 3.2%), <strong>Cut step</strong> and <strong>Raise step</strong> (% of current lifestyle spending, default 10 each), and <strong>Most you would ever cut</strong> / <strong>Most you would ever raise</strong> (default 20% each side). Year by Year carries the year&rsquo;s rate, the planned rate, the action taken, and the running multiplier.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Select</span><br/><strong>A real start year (Risk &amp; Stress tab)</strong></td>
              <td style={sectionStyles.td}>A stress scenario that replays one real calendar year and every year after it on record: the S&amp;P 500 and 10-year Treasury total returns at the plan&rsquo;s stock/bond mix (the retired mix, with any glide, once retired), and CPI inflation, applied under the Stress Inflation Strategy like the other scenarios. Social Security&rsquo;s cost-of-living raise and the tax brackets follow that year&rsquo;s CPI too (never below zero), whichever strategy is chosen. It starts in the year the Recession Start Year Configuration sets (Year 1 of retirement by default) and runs until the record ends, after which the plan&rsquo;s own assumptions resume. Started in Year 1 of retirement, it is exactly the run the every-start section reports for that year. The named crises (1929, 1966, 1973, 2000 and 2008) replay their own three or four real years the same way, at your stock/bond mix with that year&rsquo;s inflation, and then return to your own assumptions.</td>
              <td style={sectionStyles.td}>Pick the scenario card, then any year from 1928 (or 1871, with the market record set to 1871 under Every retirement) to the last full year on record (default 1966). Picking a year selects the scenario. The Dashboard banner and the printed report name the start while it is active.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Every retirement since 1928 or 1871 (Risk &amp; Stress tab)</strong></td>
              <td style={sectionStyles.td}>Runs the plan through each real stretch of market history with a full retirement behind it: the S&amp;P 500 and 10-year Treasury total returns at the plan&rsquo;s retired stock/bond mix, and CPI inflation, from the household&rsquo;s retirement year to the end of the plan. Raw history, not re-centered on your assumptions. Each spending rule (fixed, Spending Guardrails, Withdrawal-Rate Guardrails, and both when the plan uses both) runs over the same starts; a rule&rsquo;s deepest cut, years below plan and lifetime spending are measured against fixed spending in the same start, in real dollars. <strong>The most you could spend (SAFEMAX, or &ldquo;safe max&rdquo;)</strong> is searched for on the same starts, after William Bengen&rsquo;s SAFEMAX: the highest starting withdrawal that survived every historical retirement in his 1994 research, the origin of the 4% rule. Here it is the highest lifestyle spending, in today&rsquo;s dollars and under the plan&rsquo;s own spending rule, at which every start lasts (to about a quarter of a percent), the start that fails first just above it, and that spending as a share of the Pre-Tax, Roth, Taxable and HSA balances when you retire. Social Security and other income pay part of that spending, so the share is not the same thing as the 4% rule&rsquo;s withdrawal rate.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic, computed in the background. Free: how many starts the plan lasted in, the hardest start, the cost of any guardrail switched on, and the most you could spend and still last through every start. Premium: every rule side by side, the most you could spend at 95% and 90% of starts, and a row per start year. A retirement longer than the history on record has no start to test and says so. <strong>Market record from</strong> chooses where the starts begin: 1928 (default; Aswath Damodaran, NYU Stern, and the Minneapolis Fed&rsquo;s CPI) or 1871, which adds the years before from Robert J. Shiller&rsquo;s data (Yale), with bond returns rebuilt from yields. The Monte Carlo&rsquo;s historical bootstrap stays on 1928 onward.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Retirement Readiness &rarr; your paycheck</strong></td>
              <td style={sectionStyles.td}>Restates the projection&rsquo;s first five retired years as a paycheck: what the year pays out monthly, split into living costs, health cover, tax and one-time events, how much arrives on its own (Social Security, pension, rent), how much has to be moved out of the portfolio for the year, the tax to set aside each quarter, and the months of spending the cash reserve covers. Nothing is asked for and nothing is worked out again &mdash; every figure comes from the projection, summed or divided by twelve. Note that what leaves the portfolio exceeds what is paid out in any year part of the transfer rebuilds the reserve.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic. Reads the plan you already have; the reserve half is driven by Cash Floor / Emergency Reserve on Plan &rarr; Spending &rarr; Withdrawals &amp; Taxable Account, and reads as &ldquo;no reserve&rdquo; when that is off.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Spending bridge &rarr; &ldquo;Leave these out of the figure above&rdquo;</strong></td>
              <td style={sectionStyles.td}>The six costs the plan charges to retirement separately &mdash; debt service, pre-65 health insurance, Medicare/IRMAA, long-term care, one-off life events and lifetime gifting &mdash; each with the place in the app it IS entered. Including them in your spending figure as well pays for them twice.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic. The health row follows your setup: with the category ledger on it points at the ledger&rsquo;s own &ldquo;Health coverage before 65&rdquo; section and warns against the Insurance and Health categories; without it, at the Healthcare Bridge Cost field. Medicare says there is nothing to enter, because it is computed from income.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Layout</span><br/><strong>Plan &rarr; Spending, the four sections</strong></td>
              <td style={sectionStyles.td}>Retirement Spending Target, Current Household Spending (Pre-Retirement), Special Expenses (the spending phases, go-go bumps, healthcare and long-term care) and Withdrawals &amp; Taxable Account (withdrawal order, the taxable account&rsquo;s basis and dividends, tax-loss harvesting and the cash reserve) stack full width, one above the other, each foldable by its heading, so the ledger gets the whole width of the window.</td>
              <td style={sectionStyles.td}>Click a heading to fold or unfold, or Tab to it and press Enter or Space. The first two start open; Special Expenses opens itself when your plan uses any of the features in it (three-phase curve, go-go bump, long-term care, or delaying Medicare on an employer plan), and Withdrawals &amp; Taxable Account opens itself when tax-loss harvesting, a withdrawal order other than Taxable First, or the cash reserve is on.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Dropdown</span><br/><strong>Retirement Spending ledger &rarr; how often a line is paid</strong></td>
              <td style={sectionStyles.td}>Per line: Monthly (default), Quarterly, Twice a year, or Once a year, plus the month the first payment falls in for anything other than monthly. The amount box is what ONE PAYMENT costs, so $3,000 entered against Quarterly is $12,000 a year, and each line states its own &ldquo;&times; 4 = $12,000/yr&rdquo;. Changing the frequency alone keeps the year&rsquo;s cost and re-states the per-payment figure: a $7,000 bill moved to quarterly becomes four payments of $1,750. Only a within-year shape: the projection works in whole years and is the same whatever you set here. A line with no frequency reads as Monthly.</td>
              <td style={sectionStyles.td}>Monthly / Quarterly / Twice a year / Once a year; month 1&ndash;12. Feeds the month-by-month view below it; nothing else reads it.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Retirement Spending ledger &rarr; when it falls due</strong></td>
              <td style={sectionStyles.td}>A twelve-month view of a typical year built from the cadences above: what falls due in each month, the heaviest and lightest months named, and the gap between them. Appears only once at least one line is not paid monthly &mdash; a flat year is reported as flat rather than dressed up as a concern. The pre-65 health line is excluded, the same way it is excluded from the lifestyle total.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic. A typical year, not a forecast: no inflation, phase curve or guardrail is applied to the months. Point at a month (or Tab to it) for its total and the lines that fall due in it.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Retirement Spending ledger &rarr; what it costs</strong></td>
              <td style={sectionStyles.td}>Under the ledger total, the same money stated three ways &mdash; a year, a month, a day &mdash; split into the part ticked essential and the part that could flex, plus the tax the plan pays in your first retired year and what the budget therefore needs to be <em>funded</em>. Presentation only: it changes no projected figure.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic whenever the category ledger is on. The essential/flex split appears only once at least one category is ticked essential; the tax line appears once the plan has a retired year.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Retirement Readiness &rarr; walking away today</strong></td>
              <td style={sectionStyles.td}>Re-runs your plan with the leaving date moved to this year and everything else held as set, reporting whether it still reaches the end of the horizon (and, if not, the first year spending is not fully covered, the same year the verdict names), the largest lifestyle that standing-start plan supports, the first year&rsquo;s tax, and &mdash; with a ledger &mdash; whether guaranteed income covers the essentials. A spouse&rsquo;s date moves too; someone who already retired earlier is left alone rather than sent back to work.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic. The supported-spending figure is the Die With Zero search run on the walk-away plan, so it spends the portfolio to nothing by the end: a ceiling, not a recommendation.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Retirement Readiness &rarr; big expenses at bad times</strong></td>
              <td style={sectionStyles.td}>Flags every outflow life event landing in the first ten retired years that takes 5% or more of that year&rsquo;s starting portfolio, ranked by that share, at most one row per event (a recurring one is listed at its worst year) and at most three examined in depth. Events marked funded outside the plan, and all inflows, are excluded. With Premium each is priced where it sits &mdash; normal market and a 20% first-year fall &mdash; and two, three and five years later in that same fall, on a copy of the plan. Each flagged event is also stated as the number of years of normal withdrawals it equals &mdash; that year&rsquo;s drawdown with the life events taken back out &mdash; which is the same size in a unit that can be judged; omitted in a year with no ordinary draw to compare against.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic, driven by the events you entered under Life Events. Reports what the plan does under each timing; it does not recommend one.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Buttons</span><br/><strong>Life Events &rarr; &minus;1 / +1 / +5 yr on each event</strong></td>
              <td style={sectionStyles.td}>Moves a life event in time in place, instead of deleting it and entering it again. A one-off keeps its start and end ages together; a recurring range keeps its length. Ages never go below zero (the &minus;1 button disables at the floor).</td>
              <td style={sectionStyles.td}>Click. Affects only the event whose row the button sits in, and saves the change the same way the add and delete controls do.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Widow's/Widower's Tax Torpedo Warning (Dashboard)</strong></td>
              <td style={sectionStyles.td}>For spouse plans, scans the year-by-year projection for the point a spouse passes away and household filing status flips from Married Filing Jointly to Single. Flags it as a Dashboard warning if the survivor's marginal tax bracket jumps meaningfully — since Single brackets are roughly half as wide as MFJ at the same rate, and income sources like RMDs and pensions often don't drop proportionally.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic whenever a spouse is in the plan. Links to the Tax Optimizer Hub, where conversions made while both spouses are alive can be compared.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Own Your Home (Balances &amp; Debt &rarr; Home &amp; Other Property)</strong></td>
              <td style={sectionStyles.td}>Puts your residence in the plan. It appreciates each year at the Home Appreciation Rate, and its equity &mdash; value less the Mortgage Balance and any reverse-mortgage balance, both debts of the estate &mdash; is counted in the gross estate for federal and state estate tax and in Gross Inherited Wealth, passing to heirs with a stepped-up basis. Never drawn on for spending; a sale is a Life Events inflow.</td>
              <td style={sectionStyles.td}>Toggle ON/OFF, default off (renters). When on: Current Home Value ($), Home Appreciation Rate (%/yr). Turning it off also turns off the reverse mortgage. A warning appears if you have a mortgage balance but no home.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Input</span><br/><strong>Other Estate Assets ($) / Growth Rate (%/yr)</strong></td>
              <td style={sectionStyles.td}>One today&rsquo;s-dollar total for estate property that is neither a portfolio account nor your home: a second home or rental, land, a business interest, vehicles, jewelry, art, collectibles. Grows (or shrinks) at its own rate every year; enters the gross estate at full value and reaches heirs income-tax-free with a stepped-up basis. Shown as its own line in the Gross Inherited Wealth breakdown.</td>
              <td style={sectionStyles.td}>Dollars &ge; 0, default $0; the growth-rate field appears once the total is above zero. Rate may be negative. One figure on purpose &mdash; itemizing adds nothing to an estate projection. Never spent by the plan.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Toggle</span><br/><strong>Reverse Mortgage / Home Equity (Plan &rarr; Balances &amp; Debt)</strong></td>
              <td style={sectionStyles.td}>Models an HECM-style reverse mortgage: a non-recourse loan against your home's value that requires no monthly payments, with interest compounding on the growing loan balance instead. Draws either a lump sum at origination or a level monthly payout, both tax-free (loan proceeds, not income). The loan balance is capped at the home's value (non-recourse protection), so it can never leave the estate owing more than the house is worth. Any mortgage still owed is paid off out of the reverse mortgage first, as an HECM requires, so you receive that much less and the mortgage payments stop. If you're instead planning a one-time home sale/downsizing, use a Life Events inflow rather than this feature &mdash; Life Events can land one-time proceeds in any account.</td>
              <td style={sectionStyles.td}>Toggle ON/OFF; requires Own Your Home (the home's value and appreciation live there). When on: Start Age, Principal Limit (% of home value available to borrow — a simplified stand-in for HECM's actual age/rate-based actuarial tables), Loan Interest Rate (%), and Payout Type (Lump Sum or Monthly). Year by Year gains a &ldquo;Home Equity&rdquo; column showing home value minus the loan balance.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Dropdown</span><br/><strong>Stress Inflation Strategy (Risk & Stress tab)</strong></td>
              <td style={sectionStyles.td}>Shown only when a Historical Stress Test is active. Controls how the crash's own inflation figure interacts with your Housing and Social Security/Medical/Medicare Part B/D custom inflation rates from Plan &rarr; Assumptions &amp; Risk.</td>
              <td style={sectionStyles.td}><strong>Partial</strong> (default): the crash's inflation fully overrides Housing (same as it already does for general lifestyle spending) but leaves Social Security/Medical/Part B/Part D on their own configured rates. <strong>Delta:</strong> instead of a full override, each of those custom rates is nudged by the gap between the crash's inflation and your baseline Inflation Rate assumption, compounding permanently into future years. <strong>Strict Custom:</strong> ignores the crash's inflation entirely for Housing and every custom rate. Has no effect at all when no stress test is running. A real start year always indexes Social Security and the tax brackets to that year&rsquo;s inflation, whichever option is chosen.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Sensitivity / Tornado Analysis (Risk & Stress tab)</strong></td>
              <td style={sectionStyles.td}>A one-at-a-time (OAT) sensitivity test: reruns your plan with each of 4 core assumptions (Investment Returns, Inflation Rate, Life Expectancy, Annual Lifestyle Spending) nudged up and down individually, holding everything else at its current value, and measures the resulting swing in ending balance. Results are shown as a tornado chart, sorted with the assumption your plan is most sensitive to at the top. Unlike Historical Stress Tests or Monte Carlo (which model several things moving together, like a crash plus a spike in inflation), this isolates one variable at a time to show which single assumptions matter most.</td>
              <td style={sectionStyles.td}>N/A — always on, recomputes automatically whenever your inputs change, no button to press. Follows <strong>Show figures in</strong>.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Minimum Required Rate of Return (Risk & Stress tab)</strong></td>
              <td style={sectionStyles.td}>Binary-searches for the lowest flat annual investment return (applied both before and after retirement) your plan could earn, on average every year, and still avoid running out of money. Deliberately ignores your own stock/bond allocation, equity glide path, and any active Historical Stress Test during the search, so the answer is always one clean number rather than a moving target based on those settings — shown next to your actual assumed return and the "cushion" (the gap between the two) so you can see how much room your plan has to underperform. Flags a plan as infeasible if even a 30%/yr average return doesn't fix it (spending, retirement age, or savings need to change instead), or reports "&lt; -10%" if the plan is so well-funded that even losing money every year still works.</td>
              <td style={sectionStyles.td}>N/A — always on, recomputes automatically whenever your inputs change, no button to press.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>RMD Column &amp; Budget Warning Icon (Year by Year)</strong></td>
              <td style={sectionStyles.td}>The Year by Year tab shows an "RMD" column with the mandatory portion of that year's Pre-Tax withdrawal once Required Minimum Distributions begin — this amount is already included in the "Draw PreTax" column next to it, not additional on top. Each year&rsquo;s RMD is figured on the Pre-Tax balance at the end of the prior year (the opening balance in the plan&rsquo;s first year). RMDs follow whichever spouse currently owns the pooled Pre-Tax balance: Spouse 1 while alive, then the surviving Spouse 2 on their own age and their own SECURE 2.0 start age (73, or 75 if born 1960+). The Dashboard's Forced RMDs total is the sum of this column. Any row where that year triggered the spending-guardrail budget warning (expenses, taxes, and savings exceeding salary) also shows a small red warning icon next to its Year.</td>
              <td style={sectionStyles.td}>N/A — both are automatic, driven by the same underlying projection data as the rest of the table.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Age-65 Standard Deduction Add-on &amp; Senior Bonus Deduction (Std Deduction column)</strong></td>
              <td style={sectionStyles.td}>From the year each spouse turns 65 the federal standard deduction grows by the additional amount for age ({usd(ADDITIONAL_DEDUCTION_AGED_SINGLE_2026)} for a single filer, {usd(ADDITIONAL_DEDUCTION_AGED_MARRIED_2026)} per aged spouse on a joint or separate return in {TAX_YEAR}; indexed with the Tax Bracket Inflation Rate) and, for tax years {SENIOR_BONUS_FIRST_YEAR}&ndash;{SENIOR_BONUS_LAST_YEAR} only, by the senior bonus deduction: {usd(SENIOR_BONUS_DEDUCTION)} per person 65+, reduced by 6 cents per dollar of income over {usd(SENIOR_BONUS_PHASEOUT_SINGLE)} ({usd(SENIOR_BONUS_PHASEOUT_MFJ)} joint), unavailable to Married Filing Separately, not indexed. The bonus depends on income, and income depends on the year&rsquo;s withdrawals and conversions, so the plan solves them together: the withdrawal, a max-bracket Roth conversion and the Year by Year deduction and bracket columns all use the deduction that survives at the year&rsquo;s final income. A surviving spouse counts as one senior on a Single return. Inside the phase-out each extra dollar of income also costs 6&cent; of deduction, so a 22%-bracket dollar there is taxed at about 23.3% and a 24% dollar at about 25.4% &mdash; the Roth Ladder Optimizer sees that when it sizes a conversion.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic from birth years and filing status. The Tax Bracket Visualizer's 0% band and the Year by Year Std Deduction value include both amounts.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Button</span><br/><strong>Export Year by Year (CSV)</strong></td>
              <td style={sectionStyles.td}>Downloads the projection as a 43-column CSV: Year, Age 1, Age 2, Filing, Phase, Salary, Social Security, Pension, Fixed Inflows, Lifestyle Expenses, Healthcare, IRMAA, Taxes Paid, Total Expenses, Contributions, RMD, Draw PreTax / Roth / Taxable, Total Draw, Roth Conversion, Roth Conversion Taxable, Roth Conversion Tax, Shortfall, PreTax / Roth / Taxable / HSA Start and End balances, Ending Portfolio, Growth Rate %, a derived Investment Growth (end &minus; start &minus; contributions &minus; employer match + draws; life-event money paid straight into an account lands here), State, Country, Foreign Tax, US Foreign Tax Credit, Stock vesting and Deferred comp payout (Salary is pay alone), and HSA for general spending with its tax (not part of Total Draw). A deceased spouse&rsquo;s age is blank. Follows <strong>Show figures in</strong>.</td>
              <td style={sectionStyles.td}>N/A — button on the Year by Year tab. Not a backup and not restorable; use Backup Everything for that.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>ACA / FPL Column &amp; Coverage Gap Icon (Year by Year)</strong></td>
              <td style={sectionStyles.td}>Shows, per year, the result of the ACA Medicaid coverage-gap check that the Dashboard's "ACA Medicaid Coverage Gap Detected" card summarizes. An amber <strong>GAP</strong> badge means that year's taxable income falls below 100% of the Federal Poverty Level while retired before Medicare (65) in a non-expansion state — so no ACA premium subsidy would be available that year; the same rows also get an amber warning icon next to the Year (visible on mobile, where the column is hidden). A green <strong>+$amount</strong> is the forced Roth conversion ACA Subsidy Protection made that year to lift income to the FPL floor (already included in Taxes Paid and the Roth balance). "GAP +$amount" means Protection was on but the remaining Pre-Tax balance couldn't fully close the gap. "—" means no issue that year (still working, on Medicare, or income already above the floor).</td>
              <td style={sectionStyles.td}>N/A — automatic. The column only appears when State of Residence is a coverage-gap state (AL, FL, GA, KS, MS, SC, TN, TX, WY) <em>and</em> at least one projected year was in the gap or received a forced conversion; otherwise it stays hidden to keep the table narrow. A GAP year clears with ACA Subsidy Protection on (Plan &rarr; Taxes &amp; Roth), a later retirement, or more drawn from Pre-Tax in those years.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>SSA-44 Badge (Health column, Year by Year)</strong></td>
              <td style={sectionStyles.td}>An amber <strong>SSA-44</strong> badge beside the Medicare line of a year&rsquo;s Health cell means that year&rsquo;s Medicare premium is being priced off the income you had two years earlier, and that filing <strong>Form SSA-44</strong> (&ldquo;Medicare Income-Related Monthly Adjustment Amount &mdash; Life-Changing Event&rdquo;) with Social Security &mdash; on the strength of the work stoppage, work reduction or spousal death the plan already models &mdash; would have the current year&rsquo;s lower estimated income used instead. Hovering the badge gives that year&rsquo;s saving in dollars.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic, and deliberately only shown while <strong>Assume a Form SSA-44 IRMAA appeal</strong> is OFF: turning the toggle on means you are already modeling the filing, so the badge has nothing left to tell you and disappears. A year with no saving (income never fell, or nobody is on Medicare yet) never shows it.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>Your Action Plan (Dashboard) &mdash; savings &amp; SSA-44 items</strong></td>
              <td style={sectionStyles.td}>The Action Plan&rsquo;s <em>While You&rsquo;re Working</em> section reports the contributions the projection actually makes, read from the first year the plan saves anything &mdash; not the numbers in the contribution boxes. That distinction matters whenever <strong>Auto-Max</strong> is on for a spouse, because the engine then overrides the 401(k), IRA and HSA amounts with the year&rsquo;s statutory limits and routes the IRA as a backdoor Roth. Employer match and backdoor Roth contributions get their own lines. The <em>As You Retire</em> section gains a one-sentence <strong>Form SSA-44</strong> item naming the years an appeal would help and what it is worth in total, whenever the projection finds any.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic, and shared by the Dashboard card and the printable report so both say the same thing. The SSA-44 item appears only when an appeal would save something in at least one projected year. It stays visible with the appeal toggle on, reworded to say the plan already assumes the filing &mdash; because the saving still vanishes if the form is never actually sent. The ledger badge, by contrast, is hidden in that case.</td>
            </tr>
            <tr>
              <td style={sectionStyles.td}><span style={sectionStyles.badge}>Automatic</span><br/><strong>&ldquo;Medicare Premiums Billed on Your Working Income&rdquo; (Dashboard Plan Feedback)</strong></td>
              <td style={sectionStyles.td}>A Plan Feedback card for the overpayment nobody notices: because Medicare prices each year&rsquo;s Part B and Part D premium from the tax return filed <strong>two years earlier</strong>, the first Medicare years after retiring are surcharged on a salary you no longer earn. The card names the affected years and what an approved <strong>Form SSA-44</strong> appeal is worth on your own plan in dollars, lists all eight qualifying events (marriage, divorce or annulment, death of a spouse, work stoppage, work reduction, loss of income-producing property, loss of pension income, employer settlement payment), and links to the Year by Year ledger where those years carry an SSA-44 badge. It is written as paperwork to file, not a setting to change &mdash; the premium only falls if the form actually goes to Social Security with evidence attached.</td>
              <td style={sectionStyles.td}>N/A &mdash; automatic. Shown only when an appeal would save something in at least one projected year <em>and</em> <strong>Assume a Form SSA-44 IRMAA appeal</strong> is still OFF; once that toggle is on the card retires and the Action Plan carries the reminder instead, so the same point is never made twice. Its one-click apply turns that toggle on, which models the appeal succeeding &mdash; it does not file anything.</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default InputReference;
