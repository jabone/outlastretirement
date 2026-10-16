// @vitest-environment jsdom
// Every chart's hover card carries a color swatch per series (changelog 275).
//
// Recharts' stock tooltip colored each row's text in the series color --
// unreadable in one theme and, once the rows were forced to plain ink, no
// clue which series a row belonged to. ChartTooltip keeps the text in ink
// and puts the series color in a square beside the name. Also guards the
// two regressions this change fixed on the way: the Compare All stress
// chart drew nothing (percentage height inside a min-height box), and the
// stress-scenario cards had icons on two of six.
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import ChartTooltip from '../../components/ChartTooltip';
import { swatchColor } from '../../components/chartSwatchColor';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, '../../', rel), 'utf-8');
afterEach(cleanup);

const payload = [
  { name: 'Pre-Tax Account', dataKey: 'preTaxEnd', value: 2030111, color: 'var(--series-3)' },
  { name: 'Roth Account', dataKey: 'rothEnd', value: 23456, color: 'var(--series-2)' },
];
const swatches = () => [...document.querySelectorAll('.chart-tooltip td span[aria-hidden]')].map((s) => s.style.backgroundColor);

describe('ChartTooltip', () => {
  it('renders nothing until Recharts marks it active', () => {
    const { container } = render(<ChartTooltip active={false} payload={payload} label={2033} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the headline, one swatch per series in that series color, and ink text', () => {
    render(<ChartTooltip active payload={payload} label={2033} labelFormatter={(l) => `Year: ${l}`} formatter={(v, n) => [`$${v.toLocaleString('en-US')}`, n]} />);
    expect(screen.getByText('Year: 2033')).toBeInTheDocument();
    expect(screen.getByText('Pre-Tax Account')).toBeInTheDocument();
    expect(screen.getByText('$2,030,111')).toBeInTheDocument();
    expect(swatches()).toEqual(['var(--series-3)', 'var(--series-2)']);
    const card = document.querySelector('.chart-tooltip');
    expect(card.style.color).toBe('var(--text-primary)');
    expect(card.style.backgroundColor).toBe('var(--card-bg)');
    [...card.querySelectorAll('td')].forEach((td) => expect(td.style.color).toBe(''));
  });

  it('keeps the series name when a formatter returns only the value (the Monte Carlo percentile lines)', () => {
    render(<ChartTooltip active payload={[{ name: 'p10 (Pessimistic)', value: 1332157, stroke: '#f28b82' }]} label={2041} formatter={(v) => [`$${v}`]} />);
    expect(screen.getByText('p10 (Pessimistic)')).toBeInTheDocument();
    expect(screen.getByText('$1332157')).toBeInTheDocument();
    expect(swatches()).toEqual(['rgb(242, 139, 130)']);
  });

  it('falls back past a paint-server fill to the stroke, then to a neutral swatch', () => {
    expect(swatchColor({ color: 'url(#hatch)', fill: 'url(#hatch)', stroke: '#123456' })).toBe('#123456');
    expect(swatchColor({ fill: 'url(#hatch)' })).toBe('var(--text-muted)');
    expect(swatchColor({ payload: { fill: '#abcdef' } })).toBe('#abcdef');
  });

  it('every Recharts Tooltip in the charts renders through ChartTooltip or its own card; none use the stock tooltip', () => {
    const src = read('components/LazyCharts.jsx');
    expect(src).not.toMatch(/contentStyle=/);
    expect(src).not.toMatch(/itemStyle=/);
    // JSX only: the comment at the top of the file mentions <Tooltip> in prose.
    const tooltips = src.replace(/^\s*\/\/.*$/gm, '').match(/<Tooltip\s[\s\S]*?\/>/g) || [];
    expect(tooltips.length).toBeGreaterThanOrEqual(12);
    const stock = tooltips.filter((t) => !/content=/.test(t));
    expect(stock).toEqual([]);
    expect(read('index.css')).not.toMatch(/\.recharts-default-tooltip/);
  });

  it('the Compare All stress chart has a fixed height, so it draws inside the Risk tab min-height panel', () => {
    const src = read('components/LazyCharts.jsx');
    const fn = src.slice(src.indexOf('export function StressComparisonChart'), src.indexOf('const CustomSankeyNode'));
    // A number (taller on a phone, changelog 293), never a percentage.
    expect(fn).toMatch(/<ResponsiveContainer width="100%" height=\{[^"%]*400\}>/);
    expect(fn).not.toMatch(/<Legend[^>]*height=/);
    expect(fn).not.toMatch(/height="100%"/);
  });

  it('the stress-scenario cards carry no icons: all or none, and it is none', () => {
    const src = read('components/tabs/RiskTab.jsx');
    const cards = src.slice(src.indexOf('Select Stress Scenario Model'), src.indexOf('STRESS_LABELS'));
    expect(cards).toContain('1929 Great Depr.');
    expect(cards).not.toMatch(/<Flame\b/);
    expect(src).not.toMatch(/\bFlame\b/);
  });

  it('the Optimizers star is filled, not an outline', () => {
    const src = read('components/tabs/StrategyTab.jsx');
    const stars = src.match(/<Star\b[^>]*>/g) || [];
    expect(stars.length).toBeGreaterThanOrEqual(5);
    stars.forEach((s) => expect(s).toContain('fill="currentColor"'));
  });
});
