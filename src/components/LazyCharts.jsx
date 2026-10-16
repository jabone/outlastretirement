import React, { useState } from 'react';
import { compactDollars } from '../utils/compactDollars';
import { createPortal } from 'react-dom';
import {
  Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ComposedChart, Legend, BarChart, Bar, Cell, ReferenceLine, ReferenceDot, Sankey, Layer, Rectangle,
  PieChart, Pie
} from 'recharts';
import { readResidencyTimeline, planWideResidence } from '../calculator';
import { US_STATE_NAME } from '../config/usStates';
import ChartTooltip from './ChartTooltip';
import { installChartTouchDismiss } from '../utils/chartTouch';
import { cashFlowSankeyFlows, wrapSankeyLabel } from '../utils/cashFlowSankeyFlows';
import { TAX_INCOME_SERIES, TAX_BRACKET_LINES, IRMAA_TIER_LINES } from '../config/taxIncomeSeries';
import { MARKER_ICONS } from './chartMarkerIcons';
import { evenYearTicks } from './chartTicks';
import { resolveChartMonthIndex } from './chartMonthIndex';

// Tap a chart on a phone and its details stay until you tap elsewhere
// (utils/chartTouch.js). Installed once, when the first chart loads.
installChartTouchDismiss();

const moveIcon = (m) => (m.kind === 'foreign' ? MARKER_ICONS.moveAbroad : MARKER_ICONS.moveState);

const getFormatter = (formatCurrency) => {
  if (typeof formatCurrency === 'function') return formatCurrency;
  return (val) => `$${Math.round(val).toLocaleString()}`;
};

const CustomLabel = (props) => {
  const { viewBox, value, icon: Icon, tooltipText, fill, position, offset = 10, fontSize = 16, setTooltip } = props;
  const x = viewBox?.x || 0;
  const y = viewBox?.y || 0;
  const height = viewBox?.height || 400;

  let textAnchor = "middle";
  let dx = 0;
  let dy = 0;

  if (position === "insideTopLeft") {
    textAnchor = "start"; dx = offset; dy = offset + fontSize;
  } else if (position === "insideTopRight") {
    textAnchor = "end"; dx = -offset; dy = offset + fontSize;
  } else if (position === "insideTop") {
    textAnchor = "middle"; dy = offset + fontSize;
  } else if (position === "insideBottomLeft") {
    textAnchor = "start"; dx = offset; dy = height - offset - 5;
  } else if (position === "insideBottomRight") {
    textAnchor = "end"; dx = -offset; dy = height - offset - 5;
  }

  const handlers = {
    onMouseEnter: (e) => setTooltip && setTooltip({ text: tooltipText, x: e.clientX, y: e.clientY }),
    onMouseMove: (e) => setTooltip && setTooltip({ text: tooltipText, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTooltip && setTooltip(null),
  };
  if (Icon) {
    // A nested <svg> positions like text would: the anchor point is the
    // icon's left / center / right edge to match textAnchor, and its
    // baseline sits where the glyph's would.
    const left = textAnchor === 'start' ? x + dx : textAnchor === 'end' ? x + dx - fontSize : x + dx - fontSize / 2;
    return (
      <Icon
        x={left}
        y={y + dy - fontSize}
        width={fontSize}
        height={fontSize}
        color={fill}
        strokeWidth={2}
        style={{ pointerEvents: 'auto', cursor: 'pointer', overflow: 'visible' }}
        aria-label={tooltipText}
        {...handlers}
      />
    );
  }
  return (
    <text
      x={x + dx}
      y={y + dy}
      fill={fill}
      fontSize={fontSize}
      textAnchor={textAnchor}
      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
      {...handlers}
    >
      {value}
    </text>
  );
};

// Instant floating tooltip for chart milestone markers — shows immediately on
// hover instead of relying on the browser's native title-tooltip delay.
const MilestoneTooltip = ({ tooltip }) => {
  if (!tooltip) return null;
  // Rendered via a portal straight into <body> so it positions relative to
  // the real viewport — some ancestor panel in this app has a CSS transform,
  // which would otherwise make position:fixed anchor to that ancestor
  // instead of the screen, throwing the tooltip far from the icon.
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: tooltip.x + 6,
        top: tooltip.y - 26,
        transform: 'translateX(-25%)',
        background: 'var(--or-navy)',
        border: '1px solid var(--card-border)',
        borderRadius: '8px',
        padding: '6px 10px',
        fontSize: 'var(--fs-sm)',
        fontWeight: '600',
                  // This card is dark in BOTH themes, so it cannot take a theme
          // token for its text: --text-primary flips to navy in light mode
          // and the label goes dark-on-dark. Paper is the ink for a
          // permanently dark surface -- the same reason the Recharts
          // tooltip rules in index.css force it too.
          color: 'var(--or-paper)',
        pointerEvents: 'none',
        zIndex: 9999,
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {tooltip.text}
    </div>,
    document.body
  );
};

// 1. Reusable Asset Growth and Taxes Area/Line Chart (Dashboard & Asset Balances)
// The hover card lists the series in the legend's order.
const GROWTH_SERIES_ORDER = ['preTaxEnd', 'rothEnd', 'taxableEnd', 'totalTaxesPaid', 'conversionTaxCost', 'lifestyleExpenses', 'mcRange'];

export function AssetGrowthChart({
  data: rawData,
  inputs,
  taxesOverlay,
  lifestyleOverlay,
  formatCurrency,
  onYearSelect,
  // The plot's own height; the maximized view passes a taller one so the
  // chart fills its panel instead of sitting 400px tall in an 800px box.
  chartHeight = 400,
  // Changelog 363: the Monte Carlo range, rows of { year, p10, p90 }
  // (utils/growthRange.js), shaded behind the average path. Omitted: none.
  range = null,
}) {
  const [tooltip, setTooltip] = useState(null);
  // The band rides on each year's row as a [low, high] pair, which a
  // recharts Area draws as a range.
  const showRange = Array.isArray(range) && range.length > 0;
  const byYear = showRange ? new Map(range.map((r) => [r.year, [r.p10, r.p90]])) : null;
  const data = showRange ? rawData.map((d) => (byYear.has(d.year) ? { ...d, mcRange: byYear.get(d.year) } : d)) : rawData;
  const currencyFormatter = getFormatter(formatCurrency);

  // A tap shows the details card; it stays until the next tap elsewhere
  // (utils/chartTouch.js) rather than closing itself on a timer.
  // Milestone markers below are gated to fall within the chart's own year
  // range. Derive that range from the projection data itself (data[0].year
  // is inputs.planYear's value once the projection runs) rather than a
  // hardcoded year, so markers stay correctly positioned after a plan's
  // year is advanced (see inputs.planYear in calculator.js).
  const chartStartYear = data[0]?.year || inputs.planYear || 2026;
  const chartEndYear = chartStartYear + data.length;
  const moves = readResidencyTimeline(inputs.residencyTimeline, planWideResidence(inputs));

  const bY1 = inputs.birthYear1 || (chartStartYear - (inputs.currentAge1 || 65));
  const bY2 = inputs.birthYear2 || (chartStartYear - (inputs.currentAge2 || 65));
  const retireYear1 = bY1 + (inputs.retireAge1 || 65);
  const retireYear2 = inputs.spouse2Enabled ? bY2 + (inputs.retireAge2 || 65) : 0;
  const claimYear1 = bY1 + (inputs.claimingAge1 || 67);
  const claimYear2 = inputs.spouse2Enabled ? bY2 + (inputs.claimingAge2 || 67) : 0;
  const survivorStressYear = inputs.survivorStressEnabled && inputs.spouse2Enabled
    ? (inputs.survivorStressSpouse === 1 ? bY1 : bY2) + (inputs.survivorStressAge || 75)
    : 0;

  // Baseline Life Expectancy passing -- distinct from the Survivor Stress
  // Event above. Every two-spouse plan already assumes each spouse dies at
  // their own Life Expectancy age (that's what actually flips filing status
  // to Single, stops that spouse's income, etc.), regardless of whether the
  // separate, opt-in Survivor Stress Test is enabled. Only shown for
  // two-spouse households -- for a single filer this would just mark the
  // end of the chart, which isn't the "a partner has died" case this is for.
  const lifeExpectancyYear1 = inputs.spouse2Enabled ? bY1 + (inputs.lifeExpectancy1 || 90) : 0;
  const lifeExpectancyYear2 = inputs.spouse2Enabled ? bY2 + (inputs.lifeExpectancy2 || 90) : 0;

  // Long-Term Care start -- fully independent per spouse (their own
  // Active/Cost/Start Age/Duration/EndsInDeath), so each spouse's marker
  // year and tooltip text is computed from their own fields.
  const ltcStartYear1 = inputs.ltcActive1 ? bY1 + (inputs.ltcStartAge1 || 82) : 0;
  const ltcStartYear2 = inputs.ltcActive2 && inputs.spouse2Enabled ? bY2 + (inputs.ltcStartAge2 || 82) : 0;
  const ltcTooltipSuffix1 = inputs.ltcEndsInDeath1
    ? ' — continues through end of life'
    : ` — ${inputs.ltcDurationYears1 || 3}-year episode`;
  const ltcTooltipSuffix2 = inputs.ltcEndsInDeath2
    ? ' — continues through end of life'
    : ` — ${inputs.ltcDurationYears2 || 3}-year episode`;

  const coastFireYear = data.find(d => d.isCoastFireCrossover)?.year || 0;
  const fiCrossoverYear = data.find(d => d.isFICrossover)?.year || 0;
  // A phone gives 35 years about 300px: half the ticks and smaller marker
  // icons keep the years from running together (changelog 292).
  const isNarrow = typeof window !== 'undefined' && window.innerWidth <= 600;
  const yearTicks = evenYearTicks(data, isNarrow ? 6 : 12);
  const markerSize = isNarrow ? 12 : 16;

  // Which event markers are actually drawn, so the legend below the chart
  // explains only what is on it (changelog 271).
  const inRange = (y) => y >= chartStartYear && y <= chartEndYear;
  const legendItems = [
    survivorStressYear && inRange(survivorStressYear) ? [MARKER_ICONS.survivor, 'Survivor Stress Event', 'var(--warning)'] : null,
    (inputs.spouse2Enabled && (inRange(lifeExpectancyYear1) || inRange(lifeExpectancyYear2))) ? [MARKER_ICONS.lifeExpectancy, 'Life Expectancy Reached', 'var(--text-secondary)'] : null,
    ((ltcStartYear1 && inRange(ltcStartYear1)) || (ltcStartYear2 && inRange(ltcStartYear2))) ? [MARKER_ICONS.ltc, 'LTC Care Begins', 'var(--danger)'] : null,
    coastFireYear && inRange(coastFireYear) ? [MARKER_ICONS.coastFire, 'CoastFIRE Reached', '#14b8a6'] : null,
    fiCrossoverYear && inRange(fiCrossoverYear) ? [MARKER_ICONS.fiCrossover, 'FI Crossover Reached', 'var(--accent-text)'] : null,
    (inRange(retireYear1) || (inputs.spouse2Enabled && inRange(retireYear2))) ? [MARKER_ICONS.retirement, 'Retirement', 'var(--success)'] : null,
    (inRange(claimYear1) || (inputs.spouse2Enabled && inRange(claimYear2))) ? [MARKER_ICONS.ssClaim, 'Social Security Claim', 'var(--text-secondary)'] : null,
    (inputs.milestones || []).some((m) => inRange(bY1 + (m.startAge || 60))) ? [MARKER_ICONS.milestone, 'Custom Milestone', '#8b5cf6'] : null,
    moves.some((m) => m.kind === 'foreign') ? [MARKER_ICONS.moveAbroad, 'Move Abroad', '#14b8a6'] : null,
    moves.some((m) => m.kind !== 'foreign') ? [MARKER_ICONS.moveState, 'Move to Another State', '#14b8a6'] : null,
  ].filter(Boolean);

  return (
    <div style={{ width: '100%' }}>
      <ResponsiveContainer width="99%" height={chartHeight}>
      <ComposedChart
        // The chart is a keyboard stop (arrow keys step through the years),
        // so it needs a name: the SVG's <title>.
        title="Portfolio projection chart, one point per year"
        data={data}
        margin={{ top: 25, right: 15, left: 10, bottom: 25 }}
        onClick={(state) => {
          if (state && state.activeLabel && typeof onYearSelect === 'function') {
            onYearSelect(parseInt(state.activeLabel));
          }
        }}
      >
        <defs>
          <linearGradient id="colorPreTax" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-3)" stopOpacity={0.8}/>
            <stop offset="60%" stopColor="#6366f1" stopOpacity={0.3}/>
            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.05}/>
          </linearGradient>
          <linearGradient id="colorRoth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-2)" stopOpacity={0.8}/>
            <stop offset="60%" stopColor="#f43f5e" stopOpacity={0.3}/>
            <stop offset="100%" stopColor="#e11d48" stopOpacity={0.05}/>
          </linearGradient>
          <linearGradient id="colorTaxable" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--success)" stopOpacity={0.8}/>
            <stop offset="60%" stopColor="#0ea5e9" stopOpacity={0.3}/>
            <stop offset="100%" stopColor="#0284c7" stopOpacity={0.05}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis dataKey="year" stroke="var(--text-secondary)" fontSize={12} ticks={yearTicks} interval={0} />
        <YAxis yAxisId="left" stroke="var(--text-secondary)" fontSize={12} tickFormatter={(v) => compactDollars(v)} />
        {(taxesOverlay || lifestyleOverlay) && (
          <YAxis yAxisId="right" orientation="right" stroke="var(--accent-secondary)" fontSize={12} tickFormatter={(v) => compactDollars(v)} />
        )}
        <Tooltip 
          content={<ChartTooltip />}
          formatter={(value, name) => [Array.isArray(value) ? `${currencyFormatter(value[0])} – ${currencyFormatter(value[1])}` : currencyFormatter(value), name]}
          labelFormatter={(label) => `Year: ${label}`}
          itemSorter={(item) => GROWTH_SERIES_ORDER.indexOf(item.dataKey)}
        />
        <Legend itemSorter={(item) => GROWTH_SERIES_ORDER.indexOf(item.dataKey)} />
        {showRange && (
          <Area yAxisId="left" type="monotone" name="Range in 8 of 10 simulated markets" dataKey="mcRange"
            stroke="none" fill="var(--text-secondary)" fillOpacity={0.14} isAnimationActive={false}
            activeDot={false} tooltipType="none" legendType="rect" />
        )}
        <Area yAxisId="left" type="monotone" name="Pre-Tax Account" dataKey="preTaxEnd" stackId="1" stroke="var(--series-3)" strokeWidth={2.5} fill="url(#colorPreTax)" />
        <Area yAxisId="left" type="monotone" name="Roth Account" dataKey="rothEnd" stackId="1" stroke="var(--series-2)" strokeWidth={2.5} fill="url(#colorRoth)" />
        <Area yAxisId="left" type="monotone" name="Taxable Account" dataKey="taxableEnd" stackId="1" stroke="var(--success)" strokeWidth={2.5} fill="url(#colorTaxable)" />
        {taxesOverlay && (
          <>
            <Line yAxisId="right" type="monotone" name="Taxes Paid" dataKey="totalTaxesPaid" stroke="var(--warning)" strokeWidth={2} dot={false} />
            {/* conversionTaxCost (calculator.js) isolates the marginal
                fed+state tax caused by that year's Roth conversion, out of
                the total line above — shown as its own dashed overlay
                (same purple used for "Roth Conversions" on the Waterfall
                chart and the Cash Flow Sankey's node) so a conversion year's
                tax spike is visibly explained on this chart too, not just
                a jump in the undifferentiated total. Renders flat at $0 in
                years/plans with no conversion, which is the point — it's
                meant to show exactly when and how much this is contributing. */}
            <Line yAxisId="right" type="monotone" name="Roth Conversion Tax" dataKey="conversionTaxCost" stroke="var(--series-5)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
          </>
        )}
        {lifestyleOverlay && (
          <Line yAxisId="right" type="monotone" name="Annual Lifestyle Spending" dataKey="lifestyleExpenses" stroke="#fb923c" strokeWidth={2} dot={false} />
        )}

        {/* Survivor Stress Test Milestone */}
        {survivorStressYear >= chartStartYear && survivorStressYear <= chartEndYear && (
          <ReferenceLine 
            yAxisId="left"
            x={survivorStressYear} 
            stroke="var(--warning)" 
            strokeWidth={2}
            strokeDasharray="3 3"
            label={<CustomLabel icon={MARKER_ICONS.survivor} tooltipText={`Survivor Stress Event (${survivorStressYear})`} position="insideTopLeft" fill="var(--warning)" fontSize={markerSize} setTooltip={setTooltip} />}
          />
        )}
        {/* Life Expectancy Passing -- the baseline death assumption, shown
            for each spouse independently. Coexists with the Survivor Stress
            marker above rather than replacing it, since they represent two
            different things: this is the "naturally" modeled death age,
            the other is a forced earlier death for stress-testing. */}
        {lifeExpectancyYear1 >= chartStartYear && lifeExpectancyYear1 <= chartEndYear && (
          <ReferenceLine
            yAxisId="left"
            x={lifeExpectancyYear1}
            stroke="#64748b"
            strokeWidth={1.5}
            strokeDasharray="2 4"
            label={<CustomLabel icon={MARKER_ICONS.lifeExpectancy} tooltipText={`${inputs.spouse1Name || 'Primary'}'s Life Expectancy (${lifeExpectancyYear1})`} position="insideTopLeft" fill="#64748b" offset={40} fontSize={markerSize} setTooltip={setTooltip} />}
          />
        )}
        {lifeExpectancyYear2 <= chartEndYear && lifeExpectancyYear2 >= chartStartYear && (
          <ReferenceLine
            yAxisId="left"
            x={lifeExpectancyYear2}
            stroke="#64748b"
            strokeWidth={1.5}
            strokeDasharray="2 4"
            label={<CustomLabel icon={MARKER_ICONS.lifeExpectancy} tooltipText={`${inputs.spouse2Name || 'Spouse'}'s Life Expectancy (${lifeExpectancyYear2})`} position="insideTopRight" fill="#64748b" offset={40} fontSize={markerSize} setTooltip={setTooltip} />}
          />
        )}
        {/* Long-Term Care Begins */}
        {ltcStartYear1 >= chartStartYear && ltcStartYear1 <= chartEndYear && (
          <ReferenceLine
            yAxisId="left"
            x={ltcStartYear1}
            stroke="#06b6d4"
            strokeWidth={1.5}
            strokeDasharray="1 3"
            label={<CustomLabel icon={MARKER_ICONS.ltc} tooltipText={`${inputs.spouse1Name || 'Primary'}'s LTC Care Begins (${ltcStartYear1})${ltcTooltipSuffix1}`} position="insideTop" fill="#06b6d4" offset={55} fontSize={markerSize} setTooltip={setTooltip} />}
          />
        )}
        {ltcStartYear2 >= chartStartYear && ltcStartYear2 <= chartEndYear && (
          <ReferenceLine
            yAxisId="left"
            x={ltcStartYear2}
            stroke="#06b6d4"
            strokeWidth={1.5}
            strokeDasharray="1 3"
            label={<CustomLabel icon={MARKER_ICONS.ltc} tooltipText={`${inputs.spouse2Name || 'Spouse'}'s LTC Care Begins (${ltcStartYear2})${ltcTooltipSuffix2}`} position="insideTop" fill="#06b6d4" offset={55} fontSize={markerSize} setTooltip={setTooltip} />}
          />
        )}
        {/* Crossover Points */}
        {coastFireYear >= chartStartYear && coastFireYear <= chartEndYear && (
          <ReferenceLine 
            yAxisId="left"
            x={coastFireYear} 
            stroke="#14b8a6" 
            strokeWidth={1.5}
            strokeDasharray="4 4"
            label={<CustomLabel icon={MARKER_ICONS.coastFire} tooltipText={`CoastFIRE Reached (${coastFireYear})`} position="insideTopLeft" fill="#14b8a6" fontSize={markerSize} setTooltip={setTooltip} />}
          />
        )}

        {fiCrossoverYear >= chartStartYear && fiCrossoverYear <= chartEndYear && (
          <ReferenceLine 
            yAxisId="left"
            x={fiCrossoverYear} 
            stroke="#0ea5e9" 
            strokeWidth={2}
            strokeDasharray="3 3"
            label={<CustomLabel icon={MARKER_ICONS.fiCrossover} tooltipText={`FI Crossover Reached (${fiCrossoverYear})`} position="insideTopRight" fill="#0ea5e9" offset={25} fontSize={markerSize} setTooltip={setTooltip} />}
          />
        )}

        {/* Planned moves (changelog 202; bigger flag, 212): a US state or another country,
            read through the engine's own normalizer so the chart marks the
            same moves the projection prices. */}
        {moves.filter((m) => m.fromYear >= chartStartYear && m.fromYear <= chartEndYear).map((m) => {
          const abroad = m.kind === 'foreign';
          const where = abroad ? m.countryName : (US_STATE_NAME[m.stateOfResidence] || m.stateOfResidence);
          return (
            <ReferenceLine
              key={`move-${m.id}`}
              yAxisId="left"
              x={m.fromYear}
              stroke="#14b8a6"
              strokeWidth={2.5}
              strokeDasharray="6 3"
              label={<CustomLabel icon={moveIcon(m)} tooltipText={`Move to ${where} (${m.fromYear})`} position="insideTop" fill="#14b8a6" fontSize={isNarrow ? 16 : 24} setTooltip={setTooltip} />}
            />
          );
        })}

        {/* Custom User Milestones */}
        {(inputs.milestones || []).map((m) => {
          const mYear = bY1 + (m.startAge || 60);
          if (mYear >= chartStartYear && mYear <= chartEndYear) {
            return (
              <ReferenceLine 
                key={m.id}
                yAxisId="left"
                x={mYear} 
                stroke="#8b5cf6" 
                strokeWidth={1.5}
                strokeDasharray="3 3"
                label={<CustomLabel icon={MARKER_ICONS.milestone} tooltipText={`${m.name} (${mYear})`} position="insideTop" fill="#8b5cf6" fontSize={markerSize} setTooltip={setTooltip} />}
              />
            );
          }
          return null;
        })}

        {/* Retirement Milestones */}
        {inputs.spouse2Enabled ? (
          retireYear1 === retireYear2 ? (
            retireYear1 >= chartStartYear && retireYear1 <= chartEndYear && (
              <ReferenceLine 
                yAxisId="left"
                x={retireYear1} 
                stroke="var(--success)" 
                strokeWidth={2}
                strokeDasharray="4 4"
                label={<CustomLabel icon={MARKER_ICONS.retirement} tooltipText={`Everyone Retired (${retireYear1})`} position="insideTopLeft" fill="var(--success)" fontSize={markerSize} setTooltip={setTooltip} />}
              />
            )
          ) : (
            <>
              {retireYear1 >= chartStartYear && retireYear1 <= chartEndYear && (
                <ReferenceLine 
                  yAxisId="left"
                  x={retireYear1} 
                  stroke="var(--success)" 
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  label={<CustomLabel icon={MARKER_ICONS.retirement} tooltipText={`${inputs.spouse1Name || 'Primary'} Retired (${retireYear1})`} position="insideTopLeft" fill="var(--success)" fontSize={markerSize} setTooltip={setTooltip} />}
                />
              )}
              {retireYear2 >= chartStartYear && retireYear2 <= chartEndYear && (
                <ReferenceLine 
                  yAxisId="left"
                  x={retireYear2} 
                  stroke="#0ea5e9" 
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  label={<CustomLabel icon={MARKER_ICONS.retirement} tooltipText={`${inputs.spouse2Name || 'Spouse'} Retired (${retireYear2})`} position="insideTopRight" fill="#0ea5e9" fontSize={markerSize} setTooltip={setTooltip} />}
                />
              )}
            </>
          )
        ) : (
          retireYear1 >= chartStartYear && retireYear1 <= chartEndYear && (
            <ReferenceLine 
              yAxisId="left"
              x={retireYear1} 
              stroke="var(--success)" 
              strokeWidth={2}
              strokeDasharray="4 4"
              label={<CustomLabel icon={MARKER_ICONS.retirement} tooltipText={`${inputs.spouse1Name || 'Primary'} Retired (${retireYear1})`} position="insideTopLeft" fill="var(--success)" fontSize={markerSize} setTooltip={setTooltip} />}
            />
          )
        )}

        {/* Social Security Claiming Milestones */}
        {inputs.spouse2Enabled ? (
          claimYear1 === claimYear2 ? (
            claimYear1 >= chartStartYear && claimYear1 <= chartEndYear && (
              <ReferenceLine 
                yAxisId="left"
                x={claimYear1} 
                stroke="var(--warning)" 
                strokeWidth={1.5}
                strokeDasharray="6 3 1 3"
                label={<CustomLabel icon={MARKER_ICONS.ssClaim} tooltipText={`Both Claim SS (${claimYear1})`} position="insideBottomLeft" fill="var(--warning)" fontSize={markerSize} setTooltip={setTooltip} />}
              />
            )
          ) : (
            <>
              {claimYear1 >= chartStartYear && claimYear1 <= chartEndYear && (
                <ReferenceLine 
                  yAxisId="left"
                  x={claimYear1} 
                  stroke="var(--warning)" 
                  strokeWidth={1.5}
                  strokeDasharray="6 3 1 3"
                  label={<CustomLabel icon={MARKER_ICONS.ssClaim} tooltipText={`${inputs.spouse1Name || 'Primary'} Claims SS (${claimYear1})`} position="insideBottomLeft" fill="var(--warning)" fontSize={markerSize} setTooltip={setTooltip} />}
                />
              )}
              {claimYear2 >= chartStartYear && claimYear2 <= chartEndYear && (
                <ReferenceLine 
                  yAxisId="left"
                  x={claimYear2} 
                  stroke="#f97316" 
                  strokeWidth={1.5}
                  strokeDasharray="6 3 1 3"
                  label={<CustomLabel icon={MARKER_ICONS.ssClaim} tooltipText={`${inputs.spouse2Name || 'Spouse'} Claims SS (${claimYear2})`} position="insideBottomRight" fill="#f97316" fontSize={markerSize} setTooltip={setTooltip} />}
                />
              )}
            </>
          )
        ) : (
          claimYear1 >= chartStartYear && claimYear1 <= chartEndYear && (
            <ReferenceLine 
              yAxisId="left"
              x={claimYear1} 
              stroke="var(--warning)" 
              strokeWidth={1.5}
              strokeDasharray="6 3 1 3"
              label={<CustomLabel icon={MARKER_ICONS.ssClaim} tooltipText={`${inputs.spouse1Name || 'Primary'} Claims SS (${claimYear1})`} position="insideBottomLeft" fill="var(--warning)" fontSize={markerSize} setTooltip={setTooltip} />}
            />
          )
        )}
      </ComposedChart>
    </ResponsiveContainer>

    {/* Legend for the event markers actually drawn on this chart
        (changelog 271: it used to list every marker the chart knew about,
        drawn or not). */}
    {legendItems.length > 0 && (
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '16px',
        marginTop: '12px',
        fontSize: 'var(--fs-xs)',
        color: 'var(--text-secondary)'
      }}>
        {legendItems.map(([Icon, label, color]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Icon size={14} style={{ color }} /> {label}
          </span>
        ))}
      </div>
    )}

    <MilestoneTooltip tooltip={tooltip} />
  </div>
  );
}

// A line label drawn once, at the right end of the line. When the last
// years file differently from the first (a survivor's Single years after
// Married Filing Jointly), every line steps down there and the labels would
// pile up; they then sit above the last year that files like the first.
function endLabel(data, text, color) {
  const rows = Array.isArray(data) ? data : [];
  const last = rows.length - 1;
  const status = rows[0]?.householdStatus;
  let at = last;
  if (last > 0 && rows[last]?.householdStatus !== status) {
    for (let i = last; i >= 0; i--) if (rows[i]?.householdStatus === status) { at = i; break; }
  }
  const atEnd = at === last;
  return function EndLabel({ index, x, y }) {
    if (index !== at || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return (
      <text x={atEnd ? x + 4 : x} y={y} dy={atEnd ? 3 : -4} fill={color} fontSize={10} fontWeight={600}
        textAnchor={atEnd ? 'start' : 'end'} stroke="var(--bg-secondary)" strokeWidth={3} paintOrder="stroke">
        {text}
      </text>
    );
  };
}

// 2. Progressive Tax Bracket Ordinary Stack Visualizer Chart
export function TaxBracketChart({ 
  data, 
  enabledBrackets, 
  showIrmaa,
  // Which IRMAA tiers are worth drawing for this plan. Undefined means
  // "all of them", so an older caller that doesn't pass it still works.
  enabledIrmaaTiers,
  formatCurrency, 
  onYearSelect 
}) {
  const currencyFormatter = getFormatter(formatCurrency);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        onClick={(state) => {
          if (state && state.activeLabel && typeof onYearSelect === 'function') {
            onYearSelect(parseInt(state.activeLabel));
          }
        }}
        margin={{ top: 10, right: 52, left: 10, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis dataKey="year" ticks={evenYearTicks(data)} interval={0} stroke="var(--text-secondary)" fontSize={11} />
        <YAxis tickFormatter={(v) => compactDollars(v)} stroke="var(--text-secondary)" fontSize={11} />
        <Tooltip
          content={({ active, payload }) => {
            if (!(active && payload && payload.length)) return null;
            const d = payload[0].payload;
            // Same rows, same words, same colors as the bars and the legend
            // beneath the chart (TAX_INCOME_SERIES); the two totals follow.
            const rows = TAX_INCOME_SERIES.filter((s) => s.always || d[s.key] > 0);
            const line = { display: 'flex', justifyContent: 'space-between', gap: '16px' };
            return (
              <div className="chart-tooltip glass-panel" style={{ padding: '12px', border: '1px solid var(--card-border)', backgroundColor: 'var(--bg-secondary)', fontSize: 'var(--fs-sm)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontWeight: '700', borderBottom: '1px solid var(--card-border)', paddingBottom: '4px', marginBottom: '4px' }}>
                  Year {d.year} (Age {d.age1 || '\u2014'})
                </div>
                {rows.map((s) => (
                  <div key={s.key} style={line}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      <span aria-hidden="true" style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', backgroundColor: s.color, border: '1px solid var(--card-border)', marginRight: '6px', verticalAlign: '-1px' }} />
                      {s.name}
                    </span>
                    <span style={{ fontWeight: '600' }}>{currencyFormatter(d[s.key] || 0)}</span>
                  </div>
                ))}
                <div style={{ ...line, borderTop: '1px solid var(--card-border)', paddingTop: '4px', marginTop: '4px', fontWeight: '700' }}>
                  <span>Total Ordinary Income</span>
                  <span>{currencyFormatter(d.totalOrdinaryGross)}</span>
                </div>
                <div style={line}>
                  <span style={{ color: 'var(--text-secondary)' }}>Less standard deduction (0%)</span>
                  <span>{currencyFormatter(d.stdDeduction || 0)}</span>
                </div>
                <div style={{ ...line, color: 'var(--accent-text)' }}>
                  <span>Taxable Income</span>
                  <span>{currencyFormatter(d.ordinaryTaxableIncome)}</span>
                </div>
              </div>
            );
          }}
        />

        {/* Stacked Bars representing income stack */}
        {TAX_INCOME_SERIES.map((s) => <Bar key={s.key} dataKey={s.key} stackId="income" fill={s.color} name={s.name} />)}
        
        {/* The standard deduction: income below this line is taxed at 0%. */}
        <Line type="monotone" dataKey="stdDeduction" stroke="var(--text-muted)" strokeDasharray="2 4" dot={false} strokeWidth={1.5} name="Standard deduction" label={endLabel(data, '0%', 'var(--text-muted)')} isAnimationActive={false} />

        {/* Bracket thresholds, labeled at the right end so each line says
            which bracket starts above it. */}
        {TAX_BRACKET_LINES.filter((b) => enabledBrackets[b.key]).map((b) => (
          <Line key={b.key} type="monotone" dataKey={b.key} stroke="var(--error)" strokeDasharray="3 3" dot={false} strokeWidth={1.5} name={`${b.label} limit`} label={endLabel(data, b.label, 'var(--error)')} isAnimationActive={false} />
        ))}

        {/* IRMAA thresholds */}
        {/* A separate (MFS) return's thresholds are per return, and its
            schedule skips tiers (null in the data, so not drawn). */}
        {showIrmaa && IRMAA_TIER_LINES.filter((t) => enabledIrmaaTiers?.[t.key] !== false && (data || []).some((r) => Number.isFinite(r[t.key]))).map((t) => {
          const label = (data || []).some((r) => r.irmaaPerReturn) ? `${t.label} (per return)` : t.label;
          return (
            <Line key={t.key} type="monotone" dataKey={t.key} stroke={t.color} strokeDasharray="5 5" dot={false} strokeWidth={2} name={label} label={endLabel(data, label, t.color)} isAnimationActive={false} />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// 3. Monte Carlo Percentile Horizon Curves
export function MonteCarloChart({ data, formatCurrency }) {
  const currencyFormatter = getFormatter(formatCurrency);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis dataKey="year" ticks={evenYearTicks(data)} interval={0} stroke="var(--text-secondary)" fontSize={12} />
        <YAxis stroke="var(--text-secondary)" fontSize={12} tickFormatter={(v) => compactDollars(v)} />
        <Tooltip 
          content={<ChartTooltip />}
          formatter={(value) => [currencyFormatter(value)]}
        />
        <Legend />
        <Line type="monotone" name="p90 (Optimistic)" dataKey="p90" stroke="var(--success)" strokeWidth={2} dot={false} />
        <Line type="monotone" name="p50 (Median)" dataKey="p50" stroke="var(--accent-primary)" strokeWidth={2} dot={false} />
        <Line type="monotone" name="p10 (Pessimistic)" dataKey="p10" stroke="var(--error)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// 4. Scenario Comparison Curves
export function ScenarioComparisonChart({ data, scenarios, formatCurrency }) {
  const currencyFormatter = getFormatter(formatCurrency);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis dataKey="year" ticks={evenYearTicks(data)} interval={0} stroke="var(--text-secondary)" />
        <YAxis 
          stroke="var(--text-secondary)" 
          tickFormatter={(v) => compactDollars(v)} 
        />
        <Tooltip 
          content={<ChartTooltip />}
          formatter={(value) => [currencyFormatter(value)]}
        />
        <Legend />
        {scenarios.map((sc, index) => {
          // The brand series slots, in their fixed order. Never cycled:
          // a seventh line folds into the existing slots rather than
          // generating a hue outside the validated set.
          // All eight slots, then the same eight dashed: every line has its
          // own color-and-dash pair, and no hue outside the validated set.
          const colors = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];
          const color = colors[index % colors.length];
          const dash = [undefined, '6 3', '2 3'][Math.floor(index / colors.length) % 3];
          return (
            <Line 
              key={sc.id} 
              type="monotone" 
              dataKey={sc.name} 
              stroke={color} 
              strokeDasharray={dash}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 6 }}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

// 5. Die With Zero Spending vs. Current Trajectory Chart
export function DieWithZeroChart({ data, formatCurrency }) {
  const currencyFormatter = getFormatter(formatCurrency);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis dataKey="year" ticks={evenYearTicks(data)} interval={0} stroke="var(--text-secondary)" fontSize={11} />
        <YAxis tickFormatter={(v) => compactDollars(v)} stroke="var(--text-secondary)" fontSize={11} />
        <Tooltip 
          content={<ChartTooltip />}
          formatter={(value) => [currencyFormatter(value)]}
        />
        <Legend />
        <Line type="monotone" name="Current Spending Trajectory" dataKey="currentBalance" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
        <Line type="monotone" name="Die with Zero Trajectory" dataKey="dwzBalance" stroke="var(--accent-primary)" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// 6. Optimal Retirement Age Finder BarChart
export function AgeFinderChart({ simulations, activeAge, earliestFundedAge, formatCurrency, onAgeSelect }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart 
        data={simulations}
        onClick={(state) => {
          if (state && state.activeLabel && typeof onAgeSelect === 'function') {
            onAgeSelect(parseInt(state.activeLabel));
          }
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis dataKey="age" label={{ value: 'Retirement Age', position: 'insideBottom', offset: -5, fill: 'var(--text-secondary)' }} stroke="var(--text-secondary)" fontSize={11} />
        <YAxis tickFormatter={(v) => compactDollars(v)} stroke="var(--text-secondary)" fontSize={11} />
        <Tooltip 
          content={<ChartTooltip />}
          formatter={(value) => [getFormatter(formatCurrency)(value), 'Ending Legacy']}
        />
        <Bar dataKey="endingBalance">
          {simulations.map((entry, idx) => {
            const isSelected = entry.age === activeAge;
            const isEarliest = entry.age === earliestFundedAge;
            let barColor = 'var(--accent-primary)';
            if (isSelected) {
              barColor = 'var(--accent-secondary)';
            } else if (isEarliest) {
              barColor = 'var(--success)';
            } else if (entry.endingBalance <= 0) {
              barColor = 'var(--error)';
            }
            return <Cell key={idx} fill={barColor} style={{ cursor: 'pointer' }} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// 7. Estate Planning Heir Legacy Chart (Gross vs Net Legacy by account type)
export function EstateLegacyChart({ data, formatCurrency }) {
  const currencyFormatter = getFormatter(formatCurrency);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11} />
        <YAxis tickFormatter={(v) => compactDollars(v)} stroke="var(--text-secondary)" fontSize={11} />
        <Tooltip 
          content={<ChartTooltip />}
          formatter={(value, name) => [currencyFormatter(value), name]} 
        />
        <Legend verticalAlign="top" height={36} />
        <Bar dataKey="Gross" name="Gross Portfolio Legacy" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Net" name="Net Beneficiary Kept" fill="var(--success)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// 8. Historical Stress Scenario Comparison Chart (LineChart showing decay curves)
export function StressComparisonChart({ data, formatCurrency, historyLabel = null }) {
  const currencyFormatter = getFormatter(formatCurrency);

  // A fixed height: the Risk tab sizes this panel with min-height so the
  // sibling Active-Scenario chart's legend has room, and a percentage
  // height inside a min-height box is zero (the Compare All view drew
  // nothing).
  return (
    <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth <= 600 ? 460 : 400}>
      <LineChart data={data} margin={{ top: 20, right: 15, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis dataKey="year" ticks={evenYearTicks(data, typeof window !== 'undefined' && window.innerWidth <= 600 ? 6 : 12)} interval={0} stroke="var(--text-secondary)" fontSize={11} />
        <YAxis 
          stroke="var(--text-secondary)" 
          fontSize={11}
          tickFormatter={(v) => compactDollars(v)} 
        />
        <Tooltip 
          content={<ChartTooltip />}
          formatter={(value, name) => [currencyFormatter(value), name]}
        />
        {/* No fixed height (changelog 293): six names wrap to four lines on
            a phone, and a 36px box let them spill over the plot. Measured
            and placed below, like the Dashboard chart's legend. */}
        <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: typeof window !== 'undefined' && window.innerWidth <= 600 ? 12 : 13, paddingTop: 8 }} />
        <Line type="monotone" name="Baseline Plan" dataKey="none" stroke="var(--series-3)" strokeWidth={2.5} dot={false} />
        <Line type="monotone" name="1929 Great Depression" dataKey="1929" stroke="var(--error)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        <Line type="monotone" name="1966 Lost Decade" dataKey="1966" stroke="#fb923c" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        <Line type="monotone" name="1973 Stagflation" dataKey="1973" stroke="var(--warning)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        <Line type="monotone" name="2000 Dot-Com Crash" dataKey="2000" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        <Line type="monotone" name="2008 Financial Crisis" dataKey="2008" stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        {historyLabel && (
          <Line type="monotone" name={historyLabel} dataKey="history" stroke="#a855f7" strokeWidth={2.5} dot={false} />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

// The label column beside each outer column of the Sankey: a label wraps to
// lines of at most maxChars characters, and the chart reserves that much
// margin, so no label runs past the chart's edge. Inflow labels sit left of
// the left column, outflow labels right of the right column; the one in the
// middle sits above its node.
const sankeyLabelLayout = (isNarrow) => {
  const fontSize = isNarrow ? 10 : 13;
  const maxChars = isNarrow ? 13 : 15;
  const gap = isNarrow ? 6 : 10;
  // The app's typeface at weight 600 averages about 0.52em a character;
  // 0.56em leaves slack, so the column is never too narrow for a full line.
  const margin = gap + Math.ceil(maxChars * fontSize * 0.56) + 4;
  return { fontSize, valueSize: isNarrow ? 9 : 12, lineHeight: isNarrow ? 11 : 15, maxChars, gap, margin };
};

const CustomSankeyNode = (props) => {
  const { x, y, width, height, index, payload, isNarrow } = props;
  const isMid = payload.name === 'Total Gross Cash Flow';
  const L = sankeyLabelLayout(isNarrow);

  // Recharts gives every node its column: depth 0 is the inflows.
  const isLeft = (payload.depth ?? 0) === 0;

  let textAnchor = isLeft ? 'end' : 'start';
  let textX = isLeft ? x - L.gap : x + width + L.gap;
  let textY = y + height / 2;
  let textDy = 4;

  // The middle label spans the diagram itself; on a phone the diagram is
  // narrower than the label, so it wraps there and rises by a line.
  const lines = isMid && !isNarrow ? [payload.name] : wrapSankeyLabel(payload.name, L.maxChars);

  if (isMid) {
    textAnchor = 'middle';
    textX = x + width / 2;
    textY = y - 15 - ((lines.length - 1) * L.lineHeight) / 2;
    textDy = 0;
  }

  // A wrapped label stays centered on its node; the value goes under it.
  const firstDy = textDy - ((lines.length - 1) * L.lineHeight) / 2;
  const valueY = textY + ((lines.length - 1) * L.lineHeight) / 2 + (isNarrow ? 13 : 16);

  return (
    <Layer key={`CustomNode${index}`}>
      {lines.join(' ') !== payload.name && <title>{payload.name}</title>}
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="var(--accent-primary)"
        stroke="none"
        strokeWidth={0}
      />
      <text
        textAnchor={textAnchor}
        x={textX}
        y={textY}
        fill="var(--text-primary)"
        fontSize={L.fontSize}
        fontWeight={isMid ? 'bold' : '600'}
        style={{ textShadow: '0px 1px 3px var(--bg-primary)' }}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={textX} dy={i === 0 ? firstDy : L.lineHeight}>{line}</tspan>
        ))}
      </text>
      {!isMid && height > 20 && (
        <text
          textAnchor={textAnchor}
          x={textX}
          y={valueY}
          dy={textDy}
          fill="var(--accent-primary)"
          fontSize={L.valueSize}
          fontWeight="700"
          style={{ textShadow: '0px 1px 2px var(--bg-primary)' }}
        >
          ${Math.round(payload.value).toLocaleString()}
        </text>
      )}
    </Layer>
  );
};

// 7. Dynamic Sankey Diagram for Cash Flows
export function CashFlowSankeyChart({ yearData, formatCurrency }) {
  if (!yearData) return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No data available</div>;

  const { inflows, outflows } = cashFlowSankeyFlows(yearData);

  // Create Node List
  const nodes = [...inflows.map(i => ({ name: i.name })), { name: 'Total Gross Cash Flow' }, ...outflows.map(o => ({ name: o.name }))];
  
  const midIndex = inflows.length; // Index of 'Total Gross Cash Flow'

  const links = [];
  
  // Link Inflows -> Total
  inflows.forEach((inflow, index) => {
    links.push({ source: index, target: midIndex, value: inflow.value });
  });

  // Link Total -> Outflows
  outflows.forEach((outflow, index) => {
    links.push({ source: midIndex, target: midIndex + 1 + index, value: outflow.value });
  });

  const sankeyData = { nodes, links };

  // The node labels render OUTSIDE the diagram body (left of the left column,
  // right of the right column), so the chart needs real margin reserved for
  // them, sized by sankeyLabelLayout to the widest wrapped line. On a narrow
  // phone the labels and values shrink and wrap shorter, so the margin
  // leaves room to see the flow bands too.
  const isNarrow = typeof window !== 'undefined' && window.innerWidth <= 600;
  const labelMargin = sankeyLabelLayout(isNarrow).margin;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Sankey
        data={sankeyData}
        nodePadding={isNarrow ? 18 : 30}
        margin={{ top: 30, right: labelMargin, bottom: 20, left: labelMargin }}
        link={{ stroke: 'var(--sankey-link)' }}
        node={<CustomSankeyNode isNarrow={isNarrow} />}
      >
        <Tooltip
          content={({ payload }) => {
            if (payload && payload.length) {
              const data = payload[0].payload;
              return (
                <div style={{ background: 'var(--bg-primary)', padding: '10px', border: '1px solid var(--card-border)', borderRadius: '6px' }}>
                  <p style={{ margin: 0, fontWeight: 'bold' }}>{data.name || `${data.source?.name} → ${data.target?.name}`}</p>
                  <p style={{ margin: 0, color: 'var(--accent-text)' }}>{formatCurrency(data.value)}</p>
                </div>
              );
            }
            return null;
          }}
        />
      </Sankey>
    </ResponsiveContainer>
  );
}

// 9. Portfolio vs. Benchmark Trajectory Chart (Detailed Holdings -> Analytics)
//
// "Amount Invested" and the two index lines are a real, exact reconstruction
// -- computeBenchmarkTrajectory (portfolioHoldings.js) feeds every dollar's
// actual investment date through compoundBenchmarkGrowth to show what that
// same dollar, invested on that same real date, would be worth in the S&P
// 500 / Nasdaq-100 today. "Your Portfolio (Today)" is deliberately plotted
// as a single marker at the current date rather than a full historical line
// -- this app has no historical per-holding price feed, so there's no
// honest way to show what your actual holdings were worth at each point in
// between; only today's real total value is known.
export function BenchmarkTrajectoryChart({ data, portfolioValueToday, formatCurrency }) {
  const currencyFormatter = getFormatter(formatCurrency);
  if (!data || data.length < 2) return null;
  const lastYear = data[data.length - 1].year;
  // The y-axis must include the "today" marker: Recharts sizes the axis
  // from the LINES only, so a portfolio that beat both indexes -- the
  // marker above every line -- was drawn off the top of the plot and
  // simply vanished, which read as "the chart says I underperformed".
  const lineMax = data.reduce((m, d) => Math.max(m, Number(d.invested) || 0, Number(d.spy) || 0, Number(d.qqq) || 0, Number(d.portfolio) || 0), 0);
  const rawMax = Math.max(lineMax, Number(portfolioValueToday) || 0) * 1.08;
  // Round up to a tidy tick ceiling (1/2/2.5/5 x 10^n) so the axis reads
  // "$1500k", not "$1494k".
  const mag = 10 ** Math.floor(Math.log10(rawMax || 1));
  const yMax = ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= rawMax)) || rawMax;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 24, right: 24, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis dataKey="year" ticks={evenYearTicks(data)} interval={0} stroke="var(--text-secondary)" fontSize={12} />
        <YAxis stroke="var(--text-secondary)" fontSize={12} domain={[0, yMax]} allowDataOverflow={false} tickFormatter={(v) => compactDollars(v)} />
        <Tooltip
          content={<ChartTooltip />}
          formatter={(value, name, item) => [
            name === 'Your Portfolio' && item?.payload?.coverage < 1
              ? `${currencyFormatter(value)} (reconstructed, ${Math.round(item.payload.coverage * 100)}% of invested dollars)`
              : currencyFormatter(value),
            name,
          ]}
          labelFormatter={(label) => `Year: ${label}`}
        />
        <Legend />
        <Line type="monotone" name="Amount Invested" dataKey="invested" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
        <Line type="monotone" name="If Invested in S&P 500" dataKey="spy" stroke="var(--series-1)" strokeWidth={2} dot={false} />
        <Line type="monotone" name="If Invested in Nasdaq-100" dataKey="qqq" stroke="var(--series-3)" strokeWidth={2} dot={false} />
        {/* Reconstructed actual value -- see computeBenchmarkTrajectory.
            Dots mark the real points (one per year the history covers);
            gaps are years the history doesn't. Not connected across gaps. */}
        <Line type="monotone" name="Your Portfolio" dataKey="portfolio" stroke="var(--success)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--success)', strokeWidth: 0 }} connectNulls={false} />
        <ReferenceDot
          x={lastYear}
          y={portfolioValueToday}
          r={7}
          fill="var(--success)"
          stroke="var(--bg-primary)"
          strokeWidth={2}
          isFront
          label={{ value: 'Your Portfolio (Today)', position: 'left', fill: 'var(--success)', fontSize: 12, fontWeight: 700 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// 10. Target vs. Current Allocation Chart (Detailed Holdings -> Rebalance)
//
// One grouped pair of bars per holding that has a Target % set (see
// computeRebalancePlan, portfolioHoldings.js) -- Current % is this app's
// real, computed-from-market-value figure; Target % is whatever the user
// entered on the Holdings sub-tab. Purely a visual complement to the
// rebalance table below it, not a separate calculation.
export function RebalanceAllocationChart({ data }) {
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 15, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
        <XAxis dataKey="symbol" stroke="var(--text-secondary)" fontSize={11} />
        <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} stroke="var(--text-secondary)" fontSize={11} />
        <Tooltip
          content={<ChartTooltip />}
          formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
        />
        <Legend verticalAlign="top" height={30} />
        <Bar dataKey="Current %" fill="var(--series-1)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Target %" fill="var(--accent-primary)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// 11. Portfolio Composition Donut (Detailed Holdings -> Analytics)
//
// One slice per SECURITY_TYPES bucket that has a nonzero market value (see
// computeAllocationByType, portfolioHoldings.js) -- AuraPortfolio's
// Stock/ETF/Mutual Fund allocation donut, generalized to every security
// type this app's Holdings sub-tab actually supports rather than a
// hardcoded 3-way split.
const DONUT_COLORS = ['var(--series-1)', 'var(--series-3)', 'var(--series-4)', 'var(--series-2)', 'var(--series-7)', 'var(--text-muted)'];

// `colors` (optional): a { [slice.type]: color } map so each entity keeps
// ITS color regardless of which slices happen to be present -- "Bond" is
// the same hue whether or not the portfolio has any cash. Without it the
// slices take the index palette in order.
export function AllocationDonutChart({ data, formatCurrency, colors = null, showLegend = true }) {
  const format = getFormatter(formatCurrency);
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="55%"
          outerRadius="85%"
          paddingAngle={2}
        >
          {data.map((entry, i) => (
            <Cell key={entry.type || i} fill={(colors && colors[entry.type]) || DONUT_COLORS[i % DONUT_COLORS.length]} stroke="var(--bg-primary)" strokeWidth={1} />
          ))}
        </Pie>
        <Tooltip
          content={<ChartTooltip />}
          formatter={(value, _name, item) => [`${format(value)} (${Number(item?.payload?.pct || 0).toFixed(1)}%)`, item?.payload?.label]}
        />
        {showLegend && <Legend verticalAlign="bottom" height={30} />}
      </PieChart>
    </ResponsiveContainer>
  );
}

// 12. Dividend Income by Month (Detailed Holdings -> Dividends)
//
// Twelve bars, one per calendar month of the current year. Each bar shows
// EITHER what actually landed (a settled month with logged distributions)
// or the projection (everything else) -- computeMonthlyDividendTimeline in
// portfolioHoldings.js owns that rule and hands each row a `basis`.
//
// The two bases are told apart by TEXTURE, not by hue: actual months are a
// solid fill, estimated months a diagonal hatch of the same color. Hue is
// already carrying the selected/unselected state, and a second meaning on
// the same channel would collide with it -- texture also survives
// greyscale, colorblind vision, and print, so the legend below the chart is
// a reminder rather than the only way to read it. The hover says which
// basis it is in words as well.
//
// Bars are clickable and drive the same filter as the month pills beneath
// the chart, which remain the keyboard/screen-reader control.
const DIVIDEND_BAR_COLOR = 'var(--series-1)';

// One 45-degree hatch, drawn in `color` on a transparent ground so the
// Cell's own fillOpacity still applies to it (past/selected months keep
// their existing emphasis).
function HatchPattern({ id, color }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <rect width="6" height="6" fill={color} fillOpacity={0.28} />
      <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="3" />
    </pattern>
  );
}

function DividendBasisLegend() {
  const swatch = { width: '11px', height: '11px', borderRadius: '2px', display: 'inline-block', flexShrink: 0 };
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ ...swatch, backgroundColor: DIVIDEND_BAR_COLOR }} />
        Actual (logged payments)
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            ...swatch,
            backgroundColor: 'rgba(42, 127, 122, 0.28)',
            backgroundImage: `repeating-linear-gradient(45deg, ${DIVIDEND_BAR_COLOR} 0 3px, transparent 3px 6px)`,
          }}
        />
        Estimated
      </span>
    </div>
  );
}

export function DividendMonthChart({ data, activeMonth = null, onSelectMonth, formatCurrency }) {
  const format = getFormatter(formatCurrency);
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      {/* The click target is the whole COLUMN, not the bar. A month worth a
          few dollars draws a bar a pixel or two high next to one worth
          $30k, and a one-pixel target may as well not be there — clicking
          February did nothing while April and August worked. Recharts hands
          the hovered category index to the chart's own onClick, which is
          the same category the cursor highlight and tooltip already track,
          so the target becomes the full-height band the user is aiming at.
          The Bar itself deliberately has NO onClick: with both, a click on
          a tall bar would fire twice and toggle the filter straight back
          off. */}
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
        barCategoryGap="28%"
        onClick={(state) => {
          if (!onSelectMonth) return;
          const key = resolveChartMonthIndex(state, data);
          if (key !== null) onSelectMonth(key);
        }}
        style={{ cursor: onSelectMonth ? 'pointer' : 'default' }}
      >
        <defs>
          <HatchPattern id="dividendHatchBase" color={DIVIDEND_BAR_COLOR} />
          <HatchPattern id="dividendHatchActive" color="var(--accent-primary)" />
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
        <XAxis dataKey="label" stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `$${v}`)} />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: 'rgba(42, 127, 122, 0.08)' }}
          formatter={(value, _name, item) => {
            const row = item?.payload || {};
            const n = Math.round(row.count || 0);
            const actual = row.basis === 'actual';
            return [
              `${format(value)} across ${n} payment${n === 1 ? '' : 's'}`,
              actual ? 'Actual income' : 'Estimated income',
            ];
          }}
          labelFormatter={(label, payload) => {
            const row = payload && payload[0] && payload[0].payload;
            if (!row) return label;
            // Always the full month AND year: the window spans a year
            // boundary, so a bare "Dec" is ambiguous on this chart.
            return `${row.longLabel} \u2014 ${row.basis === 'actual' ? 'actual, from your ledger' : 'estimated'}`;
          }}
        />
        <Legend verticalAlign="bottom" height={22} content={<DividendBasisLegend />} />
        <Bar
          dataKey="value"
          radius={[4, 4, 0, 0]}
          // A month that paid something should look different from a month
          // that paid nothing, even at this scale -- minPointSize floors a
          // NON-zero bar at 2px (a zero stays at zero, so it never invents
          // a bar out of nothing).
          minPointSize={2}
        >
          {data.map((entry) => {
            const isActive = activeMonth === entry.key;
            const isPast = !!entry.settled;
            const isActual = entry.basis === 'actual';
            const solid = isActive ? 'var(--accent-primary)' : DIVIDEND_BAR_COLOR;
            const hatch = isActive ? 'url(#dividendHatchActive)' : 'url(#dividendHatchBase)';
            return (
              <Cell
                key={entry.key}
                fill={isActual ? solid : hatch}
                // A settled month showing its real payments is the most
                // trustworthy bar on the chart, so it is never dimmed for
                // being in the past -- only unlogged past months are.
                fillOpacity={isActive ? 1 : (isPast && !isActual ? 0.35 : 0.8)}
                stroke={isActive ? 'var(--accent-primary)' : 'none'}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// 13. How Retirement Is Funded (Detailed Holdings -> Retirement Income)
//
// Stacked areas, one dollar axis, bottom to top: Social Security, pensions &
// annuities, other income, the holdings' dividends taken as cash, and shares
// sold -- their sum is what the plan spends that year
// (computeRetirementFunding, retirementFunding.js), drawn as a dashed line on
// top so a funded plan reads as "the stack reaches the line". Fixed
// per-entity colors: these identify a source, not a rank, so they stay put
// when a year has none of one.
//
// The tooltip is custom so it can list the sources in the SAME order the
// eye reads the stack (top first), skip the ones that are $0 that year, and
// give each its share of spending. Recharts' default listed them in
// declaration order, with "Other income: $0" and "RMDs: $0" every year.
const FUNDING_SERIES = [
  { key: 'socialSecurity', name: 'Social Security', color: 'var(--series-3)' },
  { key: 'pensions', name: 'Pensions & annuities', color: 'var(--series-4)' },
  { key: 'otherIncome', name: 'Other income (rental, work, deferred comp)', color: 'var(--series-7)' },
  { key: 'dividendsAsCash', name: 'Dividends taken as cash', color: 'var(--series-1)' },
  { key: 'shareSales', name: 'Shares sold', color: 'var(--series-2)' },
];
const FUNDING_SURPLUS = { key: 'forcedSurplus', name: 'RMD withdrawn but not spent (reinvested)', color: 'var(--series-2)' };

export function RetirementFundingTooltip({ active, payload, format }) {
  const row = active && payload && payload[0] && payload[0].payload;
  if (!row) return null;
  const pct = (v) => (row.spending > 0 ? `${Math.round((v / row.spending) * 100)}%` : '');
  const lines = [...FUNDING_SERIES].reverse().filter((s) => row[s.key] > 0.5);
  const cell = { padding: '2px 0' };
  // Never wider than the phone (changelog 295): the card used to hold a
  // 260px minimum and grow with its longest line, which ran it off the
  // right edge and made the page drag sideways.
  const narrow = typeof window !== 'undefined' && window.innerWidth <= 600;
  return (
    <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: narrow ? '8px 10px' : '10px 12px', fontSize: narrow ? 'var(--fs-xs)' : 'var(--fs-sm)', minWidth: narrow ? 0 : '260px', maxWidth: 'min(340px, calc(100vw - 72px))', boxSizing: 'border-box' }}>
      <div style={{ fontWeight: 600, marginBottom: '6px' }}>{row.year} &middot; age {row.age1}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '6px' }}>
        <span>Spending need (incl. taxes)</span><strong>{format(row.spending)}</strong>
      </div>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: '2px' }}>Paid for by</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {lines.map((s) => (
            <tr key={s.key}>
              <td style={cell}><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', backgroundColor: s.color, marginRight: '6px' }} />{s.name}</td>
              <td style={{ ...cell, textAlign: 'right', paddingLeft: '12px' }}>{format(row[s.key])}</td>
              <td style={{ ...cell, textAlign: 'right', paddingLeft: '8px', color: 'var(--text-muted)' }}>{pct(row[s.key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '6px' }}>
        {row.shareSales > 0.5
          ? `${Math.round(row.incomePct)}% paid without selling shares`
          : 'Paid without selling any shares'}
      </div>
      {row.forcedSurplus > 0.5 && (
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
          Plus {format(row.forcedSurplus)} of required minimum distributions withdrawn but not needed &mdash; reinvested, not spent
        </div>
      )}
    </div>
  );
}

export function RetirementFundingChart({ data, formatCurrency }) {
  const format = getFormatter(formatCurrency);
  if (!data || data.length === 0) return null;
  // A source no year uses (no pension, no other income) is left out of the
  // legend entirely rather than listed at $0.
  const used = FUNDING_SERIES.filter((s) => data.some((row) => row[s.key] > 0.5));
  const hasSurplus = data.some((row) => row.forcedSurplus > 0.5);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
        <XAxis dataKey="year" ticks={evenYearTicks(data)} interval={0} stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => compactDollars(v)} />
        <Tooltip content={<RetirementFundingTooltip format={format} />} />
        <Legend wrapperStyle={{ fontSize: typeof window !== 'undefined' && window.innerWidth <= 600 ? 11 : 12, paddingTop: 6 }} />
        {used.map((s) => (
          <Area key={s.key} type="monotone" stackId="fund" name={s.name} dataKey={s.key} stroke={s.color} fill={s.color} fillOpacity={0.75} strokeWidth={1} dot={false} />
        ))}
        {/* Above the spending line by construction: RMDs the plan must take
            but doesn't spend (it reinvests them). Light and dashed so it
            reads as "moved", not "spent". */}
        {hasSurplus && (
          <Area type="monotone" stackId="fund" name={FUNDING_SURPLUS.name} dataKey={FUNDING_SURPLUS.key} stroke={FUNDING_SURPLUS.color} fill={FUNDING_SURPLUS.color} fillOpacity={0.18} strokeWidth={1} strokeDasharray="3 3" dot={false} />
        )}
        <Line type="monotone" name="Spending need (incl. taxes)" dataKey="spending" stroke="var(--text-primary)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
