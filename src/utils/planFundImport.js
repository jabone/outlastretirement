// Employer-plan (401(k) / 403(b)) statement support for the statement
// importer. Plan menus are mostly TICKERLESS -- collective trusts, commingled
// pools, separately managed "funds" that exist only inside the plan -- so
// nothing here can key on a symbol. Instead, positions are identified by
// NAME, given a stable generated symbol (so the rest of the app, which keys
// holdings by symbol, keeps working), and flagged for manual pricing (there
// is nothing to quote).
//
// Two sources are handled:
//   * The recordkeeper's WEBSITE holdings table, copied and pasted. Copying a
//     rendered table gives one field per line (name / quantity / price /
//     change block / balance row), so records must be re-assembled across
//     lines. This is the only Vanguard source that carries units and prices.
//   * The quarterly PDF statement, whose "Investment Activity" table lists
//     balances only (no units, no prices), with abbreviated fund names
//     ("Target Retire 2035 Tr", "Fid Div Int'l Com Pl Cl C") that must be
//     matched against the website's full names.

// --- Fund-name normalization ------------------------------------------------
// Recordkeepers abbreviate aggressively on paper and spell out online. Both
// forms need to normalize to the same tokens for matching and for the
// generated symbol to be stable across sources.
const ABBREVIATIONS = {
  instl: 'institutional', inst: 'institutional', tr: 'trust', cl: 'class',
  fid: 'fidelity', intl: 'international', "int'l": 'international',
  div: 'diversified', com: 'commingled', pl: 'pool', retire: 'retirement',
  ret: 'retirement', tgt: 'target', idx: 'index', eq: 'equity', gr: 'growth',
  grth: 'growth', val: 'value', sm: 'small', lg: 'large', mkt: 'market',
  ttl: 'total', tot: 'total', stk: 'stock', bd: 'bond', govt: 'government',
  inv: 'investor', adm: 'admiral', intr: 'intermediate', tm: 'term',
  ep: 'earnest partners', us: 'us', 'u.s.': 'us', 'u.s': 'us',
};
// Words that carry no identity: share-class boilerplate and legal filler.
const NAME_STOPWORDS = new Set([
  'fund', 'funds', 'class', 'shares', 'share', 'the', 'of', 'and', 'a', 'an',
  'portfolio', 'inc', 'co', 'llc', 'plan', 'series',
]);

export function normalizeFundName(name) {
  return String(name || '')
    .replace(/[®™©]/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9'.&\s-]/g, ' ')
    .split(/[\s/-]+/)
    .filter(Boolean)
    .map((w) => w.replace(/^[.']+|[.']+$/g, ''))
    .filter(Boolean)
    .flatMap((w) => (ABBREVIATIONS[w] || w).split(' '))
    .map((w) => w.replace(/[^a-z0-9&]/g, ''))
    .filter((w) => w && !NAME_STOPWORDS.has(w));
}

// Do two fund names describe the same fund? True when the shorter (usually
// abbreviated, PDF) token set is contained in the longer one AND every
// number agrees -- "Target Retirement 2035" and "Target Retirement 2070" are
// different funds even though every word matches. Two tokens minimum, so a
// lone "index" or "trust" can't glue unrelated funds together.
export function fundNamesMatch(a, b) {
  const ta = normalizeFundName(a);
  const tb = normalizeFundName(b);
  if (ta.length < 2 || tb.length < 2) return false;
  const numsA = ta.filter((t) => /^\d+$/.test(t)).sort().join(',');
  const numsB = tb.filter((t) => /^\d+$/.test(t)).sort().join(',');
  if (numsA !== numsB) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longSet = new Set(long);
  return short.every((t) => longSet.has(t));
}

// A stable, readable symbol for a tickerless fund: the normalized name's
// first few tokens, upper-cased and hyphenated. Deterministic, so the same
// fund pasted next quarter maps to the same symbol.
export function planFundSymbol(name) {
  const tokens = normalizeFundName(name).slice(0, 4);
  const sym = tokens.join('-').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return sym || 'PLAN-FUND';
}

// Best-effort asset class from the name, for the holding's allocation view.
// null means "let the app's default apply" (stock-ish).
export function guessAssetClass(name) {
  const n = String(name || '').toLowerCase();
  if (/money market|stable value|cash reserve|treasury money|cash management/.test(n)) return 'cash';
  if (/\bbond\b|fixed income|treasury|\btips\b|government securities|total return|core plus/.test(n)) return 'bond';
  if (/target|retirement 20\d\d|balanced|lifecycle|life ?path|wellington|wellesley|allocation/.test(n)) return 'other';
  return 'stock';
}

// Expands a display name back to spelled-out words, keeping the original
// casing for words that weren't abbreviations. Used for the holding's name
// when only the PDF's abbreviated form is available.
export function expandFundName(name) {
  return String(name || '')
    .replace(/[®™©]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const key = w.toLowerCase().replace(/[^a-z'.]/g, '');
      const full = ABBREVIATIONS[key];
      if (!full || full === key) return w;
      return full.split(' ').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    })
    .join(' ');
}

// --- Website table paste (multi-line records) -------------------------------
// Copying a rendered holdings table yields fragments like:
//   Vanguard Target Retirement 2070 Trust
//   1,106.165<TAB>
//   $180.03
//   (
//   -$0.70
//   |
//    -0.58%
//   )
//   $199,142.89<TAB>57.13%<TAB>100.00%
// A record = a NAME line followed by one or more FIGURE-ONLY lines (no
// letters). Parenthesized change blocks and percentages are dropped; the
// remaining numbers must contain a quantity x price = balance triple.
const FIGURE_ONLY_LINE = /^[\s\d$,.%()|+-]*$/;
const NAME_LINE_NOISE = /\b(total|subtotal|quantity|balance|price|change|mix|investment|contributions?|as of|page)\b/i;

function isNameLine(line) {
  if (!line || (line.match(/[A-Za-z]/g) || []).length < 3) return false;
  if (/^[\d$(]/.test(line) || line.includes('$') || line.includes('%')) return false;
  return !NAME_LINE_NOISE.test(line);
}

export function parseMultiLineRecords(rawLines, { parseNumericToken, resolveSharesPriceValue, isSane }) {
  const holdings = [];
  const consumed = new Set();
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i].trim();
    if (!isNameLine(line)) { i += 1; continue; }
    let j = i + 1;
    const fragments = [];
    while (j < rawLines.length && FIGURE_ONLY_LINE.test(rawLines[j])) {
      if (rawLines[j].trim()) fragments.push(rawLines[j]);
      j += 1;
      if (rawLines[j] !== undefined && !rawLines[j].trim() && (rawLines[j + 1] === undefined || !rawLines[j + 1].trim())) break;
    }
    if (fragments.length >= 2) {
      const cleaned = fragments.join(' ').replace(/\([^)]*\)/g, ' ');
      const tokens = cleaned.split(/[\s|]+/).filter((t) => t && !t.includes('%'));
      const numbers = tokens.map(parseNumericToken).filter((n) => n !== null);
      const resolved = resolveSharesPriceValue(numbers);
      if (resolved && resolved.confidence === 'high' && isSane(resolved)) {
        const name = line.replace(/[®™©]/g, '').replace(/\s+/g, ' ').trim();
        holdings.push({
          symbol: planFundSymbol(name),
          name,
          shares: resolved.shares,
          price: resolved.price,
          value: resolved.value,
          confidence: 'high',
          sourceLine: line,
          isPlanFund: true,
        });
        for (let k = i; k < j; k++) consumed.add(k);
        i = j;
        continue;
      }
    }
    i += 1;
  }
  return { holdings, consumed };
}

// --- PDF "Investment Activity" table (balances only) ------------------------
//   Investment Activity
//   Beginning Other Market Dividends/ Ending
//   Balance Contributions Transactions* Gain/Loss Capital Gains Balance
//   Target Retire 2035 Tr $151,420.36 $15,846.99 $0.82 $15,108.17 $0.00 $182,376.34
//   EP Smid Cap Core $17,121.59 $0.00 - $0.07 $2,385.06 $0.00 $19,506.58
//   Founders                                  <- wrapped tail of the name above
//   Total Invested ...
// The LAST figure on each row is the ending balance. No units, no prices.
const MONEY_TOKEN = /^-?\$?-?[\d,]*\.\d{2}$/;
const ACTIVITY_HEADER = /^investment activity\b/i;
const ACTIVITY_END = /^total\b|^\*|^your fee|^connect with|^page\b/i;

export function parsePlanBalanceTable(rawLines) {
  const holdings = [];
  const consumed = new Set();
  const start = rawLines.findIndex((l) => ACTIVITY_HEADER.test(l.trim()));
  if (start < 0) return { holdings, consumed };
  for (let i = start + 1; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;
    if (ACTIVITY_END.test(line)) break;
    const tokens = line.split(/\s+/);
    // Peel trailing figures ("-" followed by a figure is a negative).
    const figures = [];
    let end = tokens.length;
    while (end > 0) {
      const t = tokens[end - 1];
      if (MONEY_TOKEN.test(t)) { figures.unshift(t); end -= 1; continue; }
      if (t === '-' && figures.length > 0 && tokens[end] && MONEY_TOKEN.test(tokens[end])) { end -= 1; continue; }
      break;
    }
    const nameTokens = tokens.slice(0, end);
    if (figures.length < 3 || nameTokens.length === 0) {
      // A letters-only line right after a row is that row's wrapped name.
      const last = holdings[holdings.length - 1];
      if (last && figures.length === 0 && /[A-Za-z]/.test(line) && !/\d/.test(line) && consumed.has(i - 1)) {
        last.name = `${last.name} ${line}`;
        last.symbol = planFundSymbol(last.name);
        consumed.add(i);
      }
      continue;
    }
    const ending = parseFloat(figures[figures.length - 1].replace(/[$,]/g, ''));
    if (!(ending > 0)) { consumed.add(i); continue; }
    const name = expandFundName(nameTokens.join(' '));
    holdings.push({
      symbol: planFundSymbol(name),
      name,
      shares: ending,
      price: 1,
      value: ending,
      confidence: 'high',
      sourceLine: line,
      isPlanFund: true,
      balanceOnly: true,
    });
    consumed.add(i);
  }
  return { holdings, consumed };
}

// --- Account context --------------------------------------------------------
// Employer-plan and IRA statements say what kind of account they are; the
// importer's tax-treatment default follows. Vanguard's participant statement
// can label the account "ROTH BROKERAGE" while its Source Activity table
// shows only Pre-Tax 401(k) + Employer Matching money -- so a pre-tax source
// wins over a "Roth" label, with a note for the user to double-check.
export function inferAccountContext(text) {
  const t = String(text || '');
  const hasPreTax = /pre-tax|pretax|traditional ira|rollover ira|\bsep ira\b|\bsimple ira\b/i.test(t);
  const hasRoth = /\broth\b/i.test(t);
  const hasHsa = /health savings|\bhsa\b/i.test(t);
  const planKind = (t.match(/401\s?\(?k\)?|403\s?\(?b\)?|457\s?\(?b\)?|\bTSP\b/i) || [null])[0];
  const kind = planKind ? planKind.replace(/\s/g, '').replace(/^(\d{3})\(?([kb])\)?$/i, (_, n, l) => `${n}(${l.toLowerCase()})`) : null;
  let taxTreatment = null;
  let note = null;
  if (hasHsa) taxTreatment = 'hsa';
  else if (hasPreTax && hasRoth) {
    taxTreatment = 'preTax';
    note = 'This statement mentions both Roth and pre-tax money. Defaulted to Pre-Tax because the contribution sources are pre-tax — change it if your balance is actually Roth.';
  } else if (hasRoth) taxTreatment = 'roth';
  else if (hasPreTax || kind) taxTreatment = 'preTax';

  const money = (re) => { const m = t.match(re); return m ? parseFloat(m[1].replace(/[$,]/g, '')) : null; };
  const employee = money(/your contributions\s+\$?([\d,]+\.\d{2})/i);
  const employer = money(/employer contributions\s+\$?([\d,]+\.\d{2})/i);
  const contributions = employee !== null || employer !== null ? { employee, employer } : null;

  return { taxTreatment, taxTreatmentNote: note, accountKind: kind, contributions };
}
