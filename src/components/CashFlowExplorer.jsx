import React from 'react';
import { Play, Pause, Activity, Loader2 } from 'lucide-react';
import MaximizeButton from './MaximizeButton';
import ChartFigure from './ChartFigure';
import { cashFlowSummary } from '../utils/chartSummaries';
import { cashFlowSankeyFlows } from '../utils/cashFlowSankeyFlows';

// The cash-flow explorer: one year's inflows split into taxes, spending,
// savings and surplus, as a Sankey or the Classic SVG, with a year slider
// and autoplay. It lived on the Dashboard until changelog 284; it is a
// picture of one ledger row, so it is the Year by Year tab's third view
// now, beside Balances & draws and Where the money goes. The full-screen
// zoom (App.jsx, maximizedComponent 'waterfall') keeps its own copy of the
// drawing.
const CashFlowSankeyChart = React.lazy(() => import('./LazyCharts').then(m => ({ default: m.CashFlowSankeyChart })));
const ChartFallback = () => (
  <div style={{ height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
    <Loader2 className="animate-spin" size={32} style={{ marginBottom: '16px', color: 'var(--accent-text)' }} />
    <span>Loading visualization engine...</span>
  </div>
);

export default function CashFlowExplorer({ projection, inputs, formatCurrency, setMaximizedComponent, initialYear = null }) {
  const [waterfallYear, setWaterfallYear] = React.useState(initialYear);
  const [hoveredWaterfallNode, setHoveredWaterfallNode] = React.useState(null);
  const [waterfallPlaying, setWaterfallPlaying] = React.useState(false);
  // Sankey's diagonal flow bands and small fixed-offset text labels are hard
  // to read on a narrow phone screen, so default to the simpler Classic SVG
  // view there; desktop still defaults to Sankey. Lazy initializer so this
  // is only checked once, on mount -- the toggle buttons still let anyone
  // switch either way regardless of screen size.
  const [waterfallViewMode, setWaterfallViewMode] = React.useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 600 ? 'classic' : 'sankey'
  );
  // Autoplay: one year every two seconds, wrapping at the end.
  React.useEffect(() => {
    let intervalId;
    if (waterfallPlaying && projection?.years?.length > 0) {
      intervalId = setInterval(() => {
        setWaterfallYear(prev => {
          const yearsArray = projection.years;
          const minYear = yearsArray[0].year;
          const maxYear = yearsArray[yearsArray.length - 1].year;
          const safePrev = prev === null ? minYear : prev;
          if (safePrev >= maxYear) return minYear;
          return safePrev + 1;
        });
      }, 2000);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [waterfallPlaying, projection]);

  if (!projection?.years?.length) return null;
  return (
    <>
    {/* Interactive Cash Flow Waterfall Panel */}
    {(() => {
      const activeYearData = projection.years.find(y => y.year === waterfallYear) || projection.years[0];
      if (!activeYearData) return null;
      
      const minYear = projection.years[0]?.year || 2026;
      const maxYear = projection.years[projection.years.length - 1]?.year || 2066;
      
      const salaryVal = activeYearData.salary || 0;
      const fixedVal = activeYearData.fixedInflows || 0;
      const drawdownVal = activeYearData.drawdown || 0;
      const totalInflowVal = salaryVal + fixedVal + drawdownVal;
      
      const lifestyleVal = activeYearData.lifestyleExpenses || 0;
      const taxVal = activeYearData.totalTaxesPaid || 0;
      const healthcareVal = (activeYearData.healthcareBridge || 0) + (activeYearData.irmaaCost || 0) + (activeYearData.medicareSupplement || 0) + (activeYearData.ltcCost || 0);
      const savingsVal = activeYearData.totalContributions || 0;
      const surplusVal = Math.max(0, totalInflowVal - (lifestyleVal + taxVal + healthcareVal + savingsVal));
      
      const hoverDetails = {
        salary: {
          title: "Salary, Stock Vesting and Deferred Comp",
          amount: salaryVal,
          color: "var(--success)",
          desc: "Salary and part-time pay, RSU/GSU vesting and any deferred-comp payout this year. All of it is ordinary income; payroll tax applies to wages and vesting."
        },
        fixedInflows: {
          title: "Passive & Fixed Inflows",
          amount: fixedVal,
          color: "#6366f1",
          desc: "Non-discretionary passive inflows including Social Security benefits, pension payments, annuities, and rental property income."
        },
        drawdown: {
          title: "Portfolio Drawdowns",
          amount: drawdownVal,
          color: "var(--accent-text)",
          desc: "Discretionary liquidations from Pre-Tax (401k/IRA), Roth, or Taxable brokerage accounts needed to bridge lifestyle and tax funding gaps."
        },
        center: {
          title: "Household Budget Hub",
          amount: totalInflowVal,
          color: "var(--text-primary)",
          desc: "The central budget mixer where all household inflows (active/passive/drawdowns) are aggregated and distributed to fuel outflows."
        },
        lifestyleExpenses: {
          title: "Lifestyle Spending",
          amount: lifestyleVal,
          color: "var(--series-2)",
          desc: "Baseline and discretionary retirement living expenses (housing, utilities, food, travel). Indexed to inflation and adjusted by Go-Go years bump."
        },
        totalTaxesPaid: {
          title: "Federal & State Taxes",
          amount: taxVal,
          color: "var(--warning)",
          desc: "Total ordinary income, capital gains, net investment income tax (NIIT), and progressive state taxes computed by the tax engine."
        },
        healthcare: {
          title: "Healthcare Costs & Surcharges",
          amount: healthcareVal,
          color: "#f97316",
          desc: "Total healthcare costs including pre-65 bridge insurance premiums, Medicare base Part B/D, IRMAA surcharges, and long-term care events."
        },
        totalContributions: {
          title: "Portfolio Savings",
          amount: savingsVal,
          color: "#06b6d4",
          desc: "Active annual contributions saved to Pre-Tax, Roth, or Taxable investment accounts while working. Subject to standard annual IRS contribution limits."
        },
        surplus: {
          title: "Reinvested Surplus",
          amount: surplusVal,
          color: "var(--success)",
          desc: "Unspent positive cash flow remaining when gross income exceeds total expenses, taxes, and savings. Automatically reinvested into Taxable assets."
        }
      };

      const getPathStyle = (nodeKey, activeColor) => {
        const isHovered = hoveredWaterfallNode === nodeKey;
        const isAnyHovered = hoveredWaterfallNode !== null;
        
        return {
          stroke: isHovered ? activeColor : (isAnyHovered ? 'rgba(255,255,255,0.03)' : activeColor),
          strokeWidth: isHovered ? 4.5 : (isAnyHovered ? 1.5 : 2.5),
          opacity: isHovered ? 1 : (isAnyHovered ? 0.15 : 0.65),
          className: isHovered ? 'waterfall-flow-line-active' : 'waterfall-flow-line',
          style: {
            filter: isHovered ? 'url(#waterfall-glow)' : 'none',
          }
        };
      };
      
      const getBlockStyle = (nodeKey, activeColor, hasAmount) => {
        const isHovered = hoveredWaterfallNode === nodeKey;
        const isAnyHovered = hoveredWaterfallNode !== null;
        
        if (!hasAmount) {
          return {
            fill: 'rgba(255,255,255,0.02)',
            stroke: 'rgba(255,255,255,0.05)',
            strokeDasharray: '3, 3',
            opacity: isAnyHovered ? (isHovered ? 1 : 0.3) : 0.45,
            style: { transition: 'all 0.25s ease' }
          };
        }
        
        return {
          fill: 'var(--bg-secondary)',
          stroke: isHovered ? activeColor : 'var(--card-border)',
          strokeWidth: isHovered ? 2 : 1,
          opacity: isHovered ? 1 : (isAnyHovered ? 0.35 : 1),
          style: {
            transition: 'all 0.25s ease',
            filter: isHovered ? 'url(#waterfall-glow)' : 'none',
            boxShadow: isHovered ? `0 0 15px ${activeColor}33` : 'none'
          }
        };
      };

      return (
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity className="text-purple-500" style={{ color: 'var(--accent-text)' }} size={20} />
                <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary)', padding: '3px', borderRadius: '6px', border: '1px solid var(--card-border)' }}>
                  <button 
                    onClick={() => setWaterfallViewMode('classic')}
                    style={{ margin: 0, padding: '4px 10px', fontSize: 'var(--fs-xs)', fontWeight: '600', borderRadius: '4px', border: 'none', cursor: 'pointer', background: waterfallViewMode === 'classic' ? 'var(--or-paper)' : 'transparent', color: waterfallViewMode === 'classic' ? 'var(--or-navy)' : 'var(--text-secondary)', transition: 'all 0.15s ease' }}
                  >
                    Flow diagram
                  </button>
                  <button 
                    onClick={() => setWaterfallViewMode('sankey')}
                    style={{ margin: 0, padding: '4px 10px', fontSize: 'var(--fs-xs)', fontWeight: '600', borderRadius: '4px', border: 'none', cursor: 'pointer', background: waterfallViewMode === 'sankey' ? 'var(--or-paper)' : 'transparent', color: waterfallViewMode === 'sankey' ? 'var(--or-navy)' : 'var(--text-secondary)', transition: 'all 0.15s ease' }}
                  >
                    Sankey Flow
                  </button>
                </div>
              </h3>
              <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
                Interactive directional flow map of gross household inflows splitting into taxes, savings, expenses, and surplus
              </p>
            </div>
            
            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button 
                className="btn-outline"
                onClick={() => setWaterfallPlaying(!waterfallPlaying)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: 'var(--fs-body)' }}
              >
                {waterfallPlaying ? <Pause size={14} /> : <Play size={14} />}
                <span>{waterfallPlaying ? 'Pause Autoplay' : 'Autoplay Projections'}</span>
              </button>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '4px 10px' }}>
                <button 
                  onClick={() => { setWaterfallYear(prev => Math.max(minYear, prev - 1)); setWaterfallPlaying(false); }}
                  disabled={waterfallYear <= minYear}
                  style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', opacity: waterfallYear <= minYear ? 0.3 : 1, fontSize: '14px', fontWeight: 'bold' }}
                >
                  &lt;
                </button>
                <span style={{ fontSize: '14px', fontWeight: '700', minWidth: '70px', textAlign: 'center', fontFamily: 'var(--font-heading)' }}>
                  Year {waterfallYear}
                </span>
                <button 
                  onClick={() => { setWaterfallYear(prev => Math.min(maxYear, prev + 1)); setWaterfallPlaying(false); }}
                  disabled={waterfallYear >= maxYear}
                  style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', opacity: waterfallYear >= maxYear ? 0.3 : 1, fontSize: '14px', fontWeight: 'bold' }}
                >
                  &gt;
                </button>
              </div>
              {setMaximizedComponent && <MaximizeButton target="waterfall" setMaximizedComponent={setMaximizedComponent} label="Maximize chart" />}
            </div>
          </div>

          {/* Slider bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
              <span>Start ({minYear})</span>
              <span style={{ fontWeight: '600', color: 'var(--accent-text)' }}>
                Ages: {inputs.spouse1Name || 'Primary'}: {activeYearData.age1 !== null ? activeYearData.age1 : '†'}
                {inputs.spouse2Enabled && ` / ${inputs.spouse2Name || 'Spouse'}: ${activeYearData.age2 !== null ? activeYearData.age2 : '†'}`}
                {` (${activeYearData.isRetired ? 'Retired' : 'Working'})`}
              </span>
              <span>Horizon ({maxYear})</span>
            </div>
            <input 
              type="range"
              min={minYear}
              max={maxYear}
              value={activeYearData.year}
              onChange={(e) => {
                setWaterfallYear((e.target.value === '' ? '' : parseInt(e.target.value)));
                setWaterfallPlaying(false);
              }}
              className="custom-slider"
              aria-label="Year shown in the cash flow map"
              aria-valuetext={String(activeYearData.year)}
            />
          </div>

          {/* SVG Map, with the year's flows in words under it (changelog 325) */}
          <ChartFigure summary={cashFlowSummary(activeYearData.year, cashFlowSankeyFlows(activeYearData))} testId="cashflow-figure">
          <div style={{ border: '1px solid var(--card-border)', borderRadius: '12px', padding: '16px', background: 'var(--bg-secondary)', overflowX: 'auto', display: 'flex', justifyContent: 'center', height: '482px' }}>
            {waterfallViewMode === 'sankey' ? (
              <div style={{ width: '100%', height: '100%' }}>
                <React.Suspense fallback={<ChartFallback />}>
                  <CashFlowSankeyChart 
                    yearData={activeYearData} 
                    formatCurrency={formatCurrency} 
                  />
                </React.Suspense>
              </div>
            ) : (
            <svg viewBox="0 0 800 450" style={{ width: '100%', maxWidth: '800px', height: 'auto', background: 'transparent' }}>
              <defs>
                <filter id="waterfall-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              
              {/* Connection paths (Tracks first) */}
              {salaryVal > 0 && <path d="M 210,90 C 290,90 290,225 348,225" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
              {fixedVal > 0 && <path d="M 210,225 C 290,225 290,225 348,225" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
              {drawdownVal > 0 && <path d="M 210,360 C 290,360 290,225 348,225" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
              
              {lifestyleVal > 0 && <path d="M 452,225 C 510,225 510,50 590,50" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
              {taxVal > 0 && <path d="M 452,225 C 510,225 510,138 590,138" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
              {healthcareVal > 0 && <path d="M 452,225 C 510,225 510,225 590,225" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
              {savingsVal > 0 && <path d="M 452,225 C 510,225 510,312 590,312" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
              {surplusVal > 0 && <path d="M 452,225 C 510,225 510,400 590,400" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
              
              {/* Active/Animated connection lines */}
              {salaryVal > 0 && (
                <path
                  d="M 210,90 C 290,90 290,225 348,225"
                  fill="none"
                  {...getPathStyle('salary', 'var(--success)')}
                />
              )}
              {fixedVal > 0 && (
                <path
                  d="M 210,225 C 290,225 290,225 348,225"
                  fill="none"
                  {...getPathStyle('fixedInflows', '#6366f1')}
                />
              )}
              {drawdownVal > 0 && (
                <path
                  d="M 210,360 C 290,360 290,225 348,225"
                  fill="none"
                  {...getPathStyle('drawdown', 'var(--series-3)')}
                />
              )}
              
              {lifestyleVal > 0 && (
                <path
                  d="M 452,225 C 510,225 510,50 590,50"
                  fill="none"
                  {...getPathStyle('lifestyleExpenses', 'var(--series-2)')}
                />
              )}
              {taxVal > 0 && (
                <path
                  d="M 452,225 C 510,225 510,138 590,138"
                  fill="none"
                  {...getPathStyle('totalTaxesPaid', 'var(--warning)')}
                />
              )}
              {healthcareVal > 0 && (
                <path
                  d="M 452,225 C 510,225 510,225 590,225"
                  fill="none"
                  {...getPathStyle('healthcare', '#f97316')}
                />
              )}
              {savingsVal > 0 && (
                <path
                  d="M 452,225 C 510,225 510,312 590,312"
                  fill="none"
                  {...getPathStyle('totalContributions', '#06b6d4')}
                />
              )}
              {surplusVal > 0 && (
                <path
                  d="M 452,225 C 510,225 510,400 590,400"
                  fill="none"
                  {...getPathStyle('surplus', 'var(--success)')}
                />
              )}

              {/* INFLOW BLOCKS (LEFT COLUMN) */}
              
              {/* Active Salary Block */}
              <g 
                onMouseEnter={() => setHoveredWaterfallNode('salary')} 
                onMouseLeave={() => setHoveredWaterfallNode(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect x="30" y="63" width="180" height="54" rx="8" {...getBlockStyle('salary', 'var(--success)', salaryVal > 0)} />
                <text x="120" y="85" textAnchor="middle" fontSize="11px" fontWeight="500" fill={salaryVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Pay, Stock &amp; Comp</text>
                <text x="120" y="103" textAnchor="middle" fontSize="14px" fontWeight="700" fill={salaryVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{salaryVal > 0 ? formatCurrency(salaryVal) : '—'}</text>
              </g>

              {/* Passive Income Block */}
              <g 
                onMouseEnter={() => setHoveredWaterfallNode('fixedInflows')} 
                onMouseLeave={() => setHoveredWaterfallNode(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect x="30" y="198" width="180" height="54" rx="8" {...getBlockStyle('fixedInflows', '#6366f1', fixedVal > 0)} />
                <text x="120" y="220" textAnchor="middle" fontSize="11px" fontWeight="500" fill={fixedVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Passive & Fixed Inflow</text>
                <text x="120" y="238" textAnchor="middle" fontSize="14px" fontWeight="700" fill={fixedVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{fixedVal > 0 ? formatCurrency(fixedVal) : '—'}</text>
              </g>

              {/* Portfolio Drawdown Block */}
              <g 
                onMouseEnter={() => setHoveredWaterfallNode('drawdown')} 
                onMouseLeave={() => setHoveredWaterfallNode(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect x="30" y="333" width="180" height="54" rx="8" {...getBlockStyle('drawdown', 'var(--series-3)', drawdownVal > 0)} />
                <text x="120" y="355" textAnchor="middle" fontSize="11px" fontWeight="500" fill={drawdownVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Portfolio Drawdown</text>
                <text x="120" y="373" textAnchor="middle" fontSize="14px" fontWeight="700" fill={drawdownVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{drawdownVal > 0 ? formatCurrency(drawdownVal) : '—'}</text>
              </g>

              {/* CENTRAL MIXER HUB */}
              <g 
                onMouseEnter={() => setHoveredWaterfallNode('center')} 
                onMouseLeave={() => setHoveredWaterfallNode(null)}
                style={{ cursor: 'pointer' }}
              >
                <circle cx="400" cy="225" r="52" {...getBlockStyle('center', 'var(--accent-primary)', true)} />
                <text x="400" y="212" textAnchor="middle" fontSize="10px" fontWeight="600" fill="var(--text-muted)" letterSpacing="0.05em">BUDGET HUB</text>
                <text x="400" y="230" textAnchor="middle" fontSize="14px" fontWeight="800" fill="var(--text-primary)">{formatCurrency(totalInflowVal)}</text>
                <text x="400" y="244" textAnchor="middle" fontSize="9px" fontWeight="500" fill="var(--accent-primary)" opacity="0.8">FLOW MIXER</text>
              </g>

              {/* OUTFLOW BLOCKS (RIGHT COLUMN) */}

              {/* Lifestyle Expenses Block */}
              <g 
                onMouseEnter={() => setHoveredWaterfallNode('lifestyleExpenses')} 
                onMouseLeave={() => setHoveredWaterfallNode(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect x="590" y="23" width="180" height="54" rx="8" {...getBlockStyle('lifestyleExpenses', 'var(--series-2)', lifestyleVal > 0)} />
                <text x="680" y="45" textAnchor="middle" fontSize="11px" fontWeight="500" fill={lifestyleVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Lifestyle Expenses</text>
                <text x="680" y="63" textAnchor="middle" fontSize="14px" fontWeight="700" fill={lifestyleVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{lifestyleVal > 0 ? formatCurrency(lifestyleVal) : '—'}</text>
              </g>

              {/* Taxes Paid Block */}
              <g 
                onMouseEnter={() => setHoveredWaterfallNode('totalTaxesPaid')} 
                onMouseLeave={() => setHoveredWaterfallNode(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect x="590" y="111" width="180" height="54" rx="8" {...getBlockStyle('totalTaxesPaid', 'var(--warning)', taxVal > 0)} />
                <text x="680" y="133" textAnchor="middle" fontSize="11px" fontWeight="500" fill={taxVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Taxes Paid</text>
                <text x="680" y="151" textAnchor="middle" fontSize="14px" fontWeight="700" fill={taxVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{taxVal > 0 ? formatCurrency(taxVal) : '—'}</text>
              </g>

              {/* Healthcare / Medicare Block */}
              <g 
                onMouseEnter={() => setHoveredWaterfallNode('healthcare')} 
                onMouseLeave={() => setHoveredWaterfallNode(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect x="590" y="198" width="180" height="54" rx="8" {...getBlockStyle('healthcare', '#f97316', healthcareVal > 0)} />
                <text x="680" y="220" textAnchor="middle" fontSize="11px" fontWeight="500" fill={healthcareVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Healthcare & IRMAA</text>
                <text x="680" y="238" textAnchor="middle" fontSize="14px" fontWeight="700" fill={healthcareVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{healthcareVal > 0 ? formatCurrency(healthcareVal) : '—'}</text>
              </g>

              {/* Portfolio Savings Block */}
              <g 
                onMouseEnter={() => setHoveredWaterfallNode('totalContributions')} 
                onMouseLeave={() => setHoveredWaterfallNode(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect x="590" y="285" width="180" height="54" rx="8" {...getBlockStyle('totalContributions', '#06b6d4', savingsVal > 0)} />
                <text x="680" y="307" textAnchor="middle" fontSize="11px" fontWeight="500" fill={savingsVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Portfolio Savings</text>
                <text x="680" y="325" textAnchor="middle" fontSize="14px" fontWeight="700" fill={savingsVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{savingsVal > 0 ? formatCurrency(savingsVal) : '—'}</text>
              </g>

              {/* Surplus Block */}
              <g 
                onMouseEnter={() => setHoveredWaterfallNode('surplus')} 
                onMouseLeave={() => setHoveredWaterfallNode(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect x="590" y="373" width="180" height="54" rx="8" {...getBlockStyle('surplus', 'var(--success)', surplusVal > 0)} />
                <text x="680" y="395" textAnchor="middle" fontSize="11px" fontWeight="500" fill={surplusVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Reinvested Surplus</text>
                <text x="680" y="413" textAnchor="middle" fontSize="14px" fontWeight="700" fill={surplusVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{surplusVal > 0 ? formatCurrency(surplusVal) : '—'}</text>
              </g>

            </svg>
            )}
          </div>
          </ChartFigure>

          {/* Informational explorer footer details card */}
          <div style={{ 
            padding: '16px 20px', 
            borderRadius: '10px', 
            backgroundColor: hoveredWaterfallNode ? `${hoverDetails[hoveredWaterfallNode].color}12` : 'rgba(255,255,255,0.02)', 
            border: hoveredWaterfallNode ? `1px solid ${hoverDetails[hoveredWaterfallNode].color}33` : '1px solid var(--card-border)', 
            transition: 'all 0.25s ease',
            minHeight: '84px'
          }}>
            <h4 style={{ 
              fontSize: '14px', 
              fontWeight: '600', 
              marginBottom: '6px', 
              // The node's own color is a MARK color (3:1). This
              // is the readout's heading, so it wears ink -- the
              // tinted panel behind it already carries the identity.
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>{hoveredWaterfallNode ? hoverDetails[hoveredWaterfallNode].title : 'Interactive Explorer Guide'}</span>
              {hoveredWaterfallNode && (
                <span style={{ fontSize: 'var(--fs-body)', fontWeight: '700', marginLeft: 'auto', color: 'var(--text-primary)' }}>
                  Amount: {formatCurrency(hoverDetails[hoveredWaterfallNode].amount)}
                </span>
              )}
            </h4>
            <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              {hoveredWaterfallNode ? hoverDetails[hoveredWaterfallNode].desc : 'Hover over any node block, central hub circle, or animated flow line path to inspect specific details, values, tax treatments, and calculations for this year.'}
            </p>
          </div>
        </div>
      );
    })()}
    </>
  );
}
