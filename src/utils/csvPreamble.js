// The lines every CSV the app writes starts with (changelog 450): what the
// file is, when and from which version it came, which dollars its figures
// are in, and the assumptions that produced them -- so a file opened months
// later explains itself. Each line is one quoted cell starting with "#", so
// a spreadsheet shows it as a note above the table, and tools that skip
// comment lines (pandas' comment='#') read straight to the header row.
//
// No names, labels or account details from the plan: an export is often
// shared, and these lines are the assumptions, not the household.
import { APP_VERSION } from '../config/buildInfo';

const pct = (v) => {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  return `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
};
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

const NAMED = {
  1929: '1929 Great Depression', 1966: '1966 Lost Decade', 1973: '1973 Stagflation',
  2000: '2000 Dot-Com Bear', 2008: '2008 Financial Crisis',
};

export function scenarioLabel(inputs) {
  const t = inputs?.stressType;
  if (!t || t === 'none') return 'Your plan as set (no stress test)';
  if (t === 'history') return `Stress test: a real ${inputs.stressHistoryStartYear} start (actual returns and inflation)`;
  if (t === 'crashYear') return `Stress test: a custom market drop of ${inputs.stressCrashReturn}%`;
  if (NAMED[t]) return `Stress test: ${NAMED[t]}`;
  return `Stress test: ${t}`;
}

export function returnsLabel(inputs) {
  if (inputs?.rebalancingEnabled) {
    return `stocks ${pct(inputs.stockReturnRate)}, bonds ${pct(inputs.bondReturnRate)}, ${pct(inputs.stockAllocationPre)} stocks working and ${pct(inputs.stockAllocationPost)} retired`;
  }
  return `${pct(inputs?.preRetireReturn)} working, ${pct(inputs?.postRetireReturn)} retired`;
}

// The preamble's lines, in order (plain strings, for tests and reuse).
export function csvPreambleLines({ title, inputs = {}, useRealDollars = true, extra = [], date = new Date() }) {
  const day = date.toISOString().slice(0, 10);
  const planYear = Number(inputs.planYear) || date.getFullYear();
  const lines = [
    `OutlastRetirement export: ${title}`,
    `Exported ${day} from version ${APP_VERSION} of the app`,
    useRealDollars
      ? `Dollars: today's dollars (${planYear} prices)`
      : 'Dollars: future dollars (each year at its own prices)',
    scenarioLabel(inputs),
    `Returns before fees: ${returnsLabel(inputs)}`,
    `Inflation: ${pct(inputs.inflationRate)} a year`,
    `Investment fees: fund expenses ${pct(inputs.fundExpenseRatioPct)}, advisor fee ${pct(inputs.advisorFeePct)} a year`,
  ];
  if (Number(inputs.portfolioFloorReal) > 0) lines.push(`Keep at least: ${money(inputs.portfolioFloorReal)} in today's dollars`);
  lines.push(...extra);
  lines.push('A projection from your own assumptions, not tax, legal or financial advice.');
  return lines;
}

// The preamble as CSV text: one quoted cell per line, then a blank line.
export function csvPreamble(args) {
  const quote = (s) => `"# ${String(s).replace(/"/g, '""')}"`;
  return `${csvPreambleLines(args).map(quote).join('\n')}\n\n`;
}

// Triggers a download of `text` as a .csv file named `name`.
export function downloadCsv(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
