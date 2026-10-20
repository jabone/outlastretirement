import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, ExternalLink, Search } from 'lucide-react';
import SimulationContext from '../context/SimulationContext';
import { FIGURE_VINTAGES, HOW_FIGURED_GROUPS, HOW_FIGURED_RULES } from '../config/howFigured';
import { SOURCES, SOURCE_VERIFIED_ON } from '../config/sources';
import { TAX_YEAR } from '../utils/copyFigures';
import { checkedOn, ruleAnchorId } from '../utils/howFiguredFormat';

// Help -> "How the numbers are figured". Loaded on first open (GuideTab
// imports it through lazyWithRetry), so none of it is in the startup chunk.
//
// Data lives in src/config/howFigured.js; the official links in
// src/config/sources.js. Phones fold each group to its heading, the way the
// Input Dictionary folds its cards (same breakpoint, same Expand all /
// Collapse all), and a search unfolds everything it matches.

const NARROW_QUERY = '(max-width: 600px)';
const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

const ruleText = (rule) => [
  rule.title, rule.group, rule.summary, rule.simplifies || '', rule.sourceNote || '',
  ...rule.sources.map((id) => `${SOURCE_BY_ID[id]?.publisher || ''} ${SOURCE_BY_ID[id]?.label || ''}`),
].join(' ').toLowerCase();

const styles = {
  card: {
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: '12px',
    padding: '18px 20px',
    border: '1px solid var(--card-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    scrollMarginTop: '80px',
    outline: 'none',
  },
  meta: { fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 },
  label: { fontWeight: 600, color: 'var(--text-primary)' },
};

const HowFigured = () => {
  const sim = useContext(SimulationContext);
  const target = sim ? sim.howFiguredTarget : null;
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);

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
  const [openGroups, setOpenGroups] = useState(() => new Set());

  const q = query.trim().toLowerCase();
  const searching = q !== '';
  const shown = useMemo(
    () => (q ? HOW_FIGURED_RULES.filter((r) => ruleText(r).includes(q)) : HOW_FIGURED_RULES),
    [q],
  );

  // A "How is this figured?" link elsewhere in the app parks a rule id in
  // SimulationContext and opens this sub-tab: clear any search that would
  // hide it, unfold its group, then scroll to the card and move focus there
  // so a keyboard or screen-reader user lands on it too.
  const targetId = target?.id || null;
  const targetSeq = target?.seq || 0;
  const pendingScroll = useRef(null);
  useEffect(() => {
    if (!targetId) return;
    const rule = HOW_FIGURED_RULES.find((r) => r.id === targetId);
    if (!rule) return;
    pendingScroll.current = targetId;
    setQuery('');
    setOpenGroups((prev) => (prev.has(rule.group) ? prev : new Set([...prev, rule.group])));
  }, [targetId, targetSeq]);
  useEffect(() => {
    const id = pendingScroll.current;
    if (!id) return undefined;
    const t = setTimeout(() => {
      const el = containerRef.current?.querySelector(`#${ruleAnchorId(id)}`);
      if (!el) return;
      pendingScroll.current = null;
      try { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch { el.scrollIntoView?.(); }
      try { el.focus({ preventScroll: true }); } catch { /* focus is a courtesy */ }
    }, 60);
    return () => clearTimeout(t);
  }, [targetSeq, openGroups, query]);

  const toggleGroup = (group) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(group)) next.delete(group); else next.add(group);
    return next;
  });

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '22px', padding: '24px', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <Calculator size={30} color="var(--accent-primary)" aria-hidden="true" />
          <h1 style={{ fontSize: '26px', fontWeight: 700, margin: 0 }}>How the numbers are figured</h1>
        </div>
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)', maxWidth: '800px', lineHeight: 1.55, margin: '0 0 8px' }}>
          Each card explains one tax or benefit rule the projection uses: what it does, which year&rsquo;s figures it
          quotes, what the app leaves out, and the government page that sets the rule, so you can check the app&rsquo;s
          work against the source. Figures are the {TAX_YEAR} amounts unless a card says otherwise; later years grow them as the card describes.
        </p>
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', maxWidth: '800px', lineHeight: 1.55, margin: 0 }}>
          This is education about how the app works, not tax, legal or financial advice. For your own return, check with a tax professional.
        </p>
        {/* The same rules as a printable page: the public How the math works
            page, which prints black on white with every source's address
            written out. ?print=1 opens the print dialog once it loads. */}
        <p style={{ fontSize: 'var(--fs-sm)', margin: '8px 0 0' }}>
          <a href="/how-the-math-works?print=1#rules" target="_blank" rel="noopener" style={{ color: 'var(--accent-text)' }}>
            Print these rules
          </a>
          <span style={{ color: 'var(--text-muted)' }}> (opens the printable page, with every source&rsquo;s web address written out)</span>
        </p>
        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: '480px' }}>
            <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="search"
              className="form-input"
              aria-label="Search how the numbers are figured"
              placeholder="Search the rules, e.g. RMD, Medicare, California..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: '34px', width: '100%' }}
            />
          </div>
          {searching && (
            <span role="status" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
              {shown.length === 0
                ? 'No matches. Try a shorter word, or the name of a tax.'
                : `${shown.length} matching ${shown.length === 1 ? 'rule' : 'rules'}`}
            </span>
          )}
          {narrow && !searching && (
            <span style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-outline" onClick={() => setOpenGroups(new Set(HOW_FIGURED_GROUPS))}>Expand all</button>
              <button type="button" className="btn-outline" onClick={() => setOpenGroups(new Set())}>Collapse all</button>
            </span>
          )}
        </div>
      </div>

      {!searching && (
        <section aria-labelledby="how-figured-vintages-title" style={{ ...styles.card, gap: '10px' }}>
          <h2 id="how-figured-vintages-title" style={{ fontSize: '16px', fontWeight: 650, margin: 0 }}>Which year&rsquo;s figures this plan uses</h2>
          <p style={{ ...styles.meta, color: 'var(--text-primary)' }}>
            Every figure is the newest its agency has published. Where that is older than {TAX_YEAR}, the plan grows it forward and this table says so.
          </p>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--fs-sm)', lineHeight: 1.5 }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: '4px 10px 4px 0', borderBottom: '1px solid var(--card-border)', whiteSpace: 'nowrap' }}>Area</th>
                <th scope="col" style={{ textAlign: 'left', padding: '4px 10px 4px 0', borderBottom: '1px solid var(--card-border)', whiteSpace: 'nowrap' }}>Figures from</th>
                <th scope="col" style={{ textAlign: 'left', padding: '4px 0', borderBottom: '1px solid var(--card-border)' }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {FIGURE_VINTAGES.map((row) => (
                <tr key={row.area} data-figure-vintage={row.area}>
                  <th scope="row" style={{ textAlign: 'left', fontWeight: 600, padding: '5px 10px 5px 0', verticalAlign: 'top', borderBottom: '1px solid var(--card-border)' }}>{row.area}</th>
                  <td style={{ padding: '5px 10px 5px 0', verticalAlign: 'top', whiteSpace: 'nowrap', borderBottom: '1px solid var(--card-border)', fontWeight: row.year !== TAX_YEAR ? 600 : 400 }}>Tax year {row.year}</td>
                  <td style={{ padding: '5px 0', verticalAlign: 'top', color: 'var(--text-secondary)', borderBottom: '1px solid var(--card-border)' }}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {HOW_FIGURED_GROUPS.map((group) => {
        const rules = shown.filter((r) => r.group === group);
        if (rules.length === 0) return null;
        const folded = narrow && !searching && !openGroups.has(group);
        const headingId = `how-figured-group-${group.toLowerCase().replace(/[^a-z]+/g, '-')}`;
        return (
          <section key={group} aria-labelledby={headingId} data-how-figured-group={group} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2 id={headingId} style={{ fontSize: '19px', fontWeight: 700, margin: 0, color: 'var(--accent-text)', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
              {narrow && !searching ? (
                <button
                  type="button"
                  aria-expanded={!folded}
                  onClick={() => toggleGroup(group)}
                  style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                >
                  {group} <span style={{ fontWeight: 400, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>({rules.length})</span>
                </button>
              ) : group}
            </h2>
            {!folded && rules.map((rule) => {
              const isTarget = rule.id === targetId;
              return (
                <article
                  key={rule.id}
                  id={ruleAnchorId(rule.id)}
                  tabIndex={-1}
                  aria-labelledby={`${ruleAnchorId(rule.id)}-title`}
                  data-how-figured-rule={rule.id}
                  style={{ ...styles.card, borderColor: isTarget ? 'var(--accent-primary)' : 'var(--card-border)', boxShadow: isTarget ? '0 0 0 2px color-mix(in srgb, var(--accent-primary) 35%, transparent)' : 'none' }}
                >
                  <h3 id={`${ruleAnchorId(rule.id)}-title`} style={{ fontSize: '16px', fontWeight: 650, margin: 0 }}>{rule.title}</h3>
                  <p style={{ fontSize: '14.5px', lineHeight: 1.6, margin: 0, color: 'var(--text-primary)' }}>{rule.summary}</p>
                  <p style={styles.meta}><span style={styles.label}>Figures from:</span> {typeof rule.figuresYear === 'number' ? `tax year ${rule.figuresYear}` : rule.figuresYear}</p>
                  {rule.simplifies && (
                    <p style={styles.meta}><span style={styles.label}>What the app simplifies:</span> {rule.simplifies}</p>
                  )}
                  <div style={styles.meta}>
                    <span style={styles.label}>{rule.sources.length > 1 ? 'Official sources:' : 'Official source:'}</span>
                    <ul style={{ margin: '4px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {rule.sources.map((id) => {
                        const src = SOURCE_BY_ID[id];
                        if (!src) return null;
                        return (
                          <li key={id}>
                            <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)' }}>
                              {src.publisher} <ExternalLink size={11} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'baseline' }} />
                            </a>
                            {' '}&mdash; checked {checkedOn(src.verified || SOURCE_VERIFIED_ON)}
                          </li>
                        );
                      })}
                    </ul>
                    {rule.sourceNote && <p style={{ ...styles.meta, marginTop: '4px', fontStyle: 'italic' }}>{rule.sourceNote}</p>}
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
};

export default HowFigured;
