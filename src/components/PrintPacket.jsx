import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ModalShell from './ModalShell';
import { Printer, X } from 'lucide-react';
import { printSection } from '../utils/printSection';
import { whenImagesReady } from '../utils/imagesReady';
import { packetTitle } from '../utils/packetTitle';
import { printInputsFor } from '../utils/printNames';
import PlanDetailsSheet from './PlanDetailsSheet';
import PlannerQuestionsSheet from './PlannerQuestionsSheet';
import AccountsSummarySheet from './AccountsSummarySheet';
import { SpendingReviewContent } from './SpendingReviewSheet';
import SwitchRow from './SwitchRow';
import PrintFrame from './PrintFrame';
import LifePlanPacketSheet from './LifePlanPacketSheet';
import EstateChecklistPacketSheet from './EstateChecklistPacketSheet';
import { PRINT_PACKET_EVENT } from './printPacketEvents';
import { DEFAULT_CHOICES } from './printPacketChoices';

// Print / PDF Report, with a choice of what goes in (changelog 298). The
// analysis report is ticked by default, so pressing Print at once prints
// exactly what the button always printed. The other pages make it a packet
// for a planner: every plan setting, the spending review, and what a
// planner will ask for that the app does not hold. "Leave out names"
// masks the spouses and heirs on every page, the report included. The estate
// checklist and the Life Plan joined the list in changelog 332; they start
// unticked, since the Life Plan is personal.
// The event lives in printPacketEvents.js so senders need not import this.
export { PRINT_PACKET_EVENT };
export const PRINT_CHOICES_KEY = 'retire_plan_print_choices';

const readChoices = () => {
  try { return { ...DEFAULT_CHOICES, ...JSON.parse(localStorage.getItem(PRINT_CHOICES_KEY) || '{}') }; } catch { return { ...DEFAULT_CHOICES }; }
};

const OPTIONS = [
  { id: 'report', label: 'Analysis report', hint: 'The readiness answers, action plan, taxes, estate, risk and year-by-year summary.' },
  { id: 'details', label: 'Every plan setting', hint: 'Each value in the plan, grouped the way the Plan page is, plus life events and heirs.' },
  { id: 'accounts', label: 'Account summary', hint: 'Balances by tax type, other assets and debts, and your holdings combined by fund or stock. No account names, firms or numbers.' },
  { id: 'spending', label: 'Spending review', hint: 'Every budget line with a box to tick, as on Plan, Spending.' },
  { id: 'questions', label: 'What a planner will also ask for', hint: 'The documents to bring that the app does not hold.' },
  { id: 'estate', label: 'Estate documents checklist', hint: 'Every item with its box, ticked with the date where you have reviewed it.' },
  { id: 'lifeplan', label: 'What Will You Do?', hint: 'Your Life Plan answers, printed as you wrote them. Leave out names does not change your own words.' },
];

export default function PrintPacket({ inputs, holdings = [], formatCurrency, onHideNamesChange = () => {}, print, openOnMount = false }) {
  const [open, setOpen] = useState(openOnMount);
  const [choices, setChoices] = useState(readChoices);
  const [printing, setPrinting] = useState(null);

  useEffect(() => {
    const show = () => { setChoices(readChoices()); setOpen(true); };
    window.addEventListener(PRINT_PACKET_EVENT, show);
    return () => window.removeEventListener(PRINT_PACKET_EVENT, show);
  }, []);

  useEffect(() => {
    if (!printing) return undefined;
    let canceled = false;
    // Next frame so the sheet is laid out, then once its logo has loaded, so
    // the dialog's snapshot has it (changelog 333).
    const id = requestAnimationFrame(() => {
      whenImagesReady(document.querySelector('.section-print[data-section="packet"]')).then(() => {
        if (canceled) return;
        printSection('packet', {
          withReport: printing.report,
          onDone: () => { setPrinting(null); onHideNamesChange(false); },
          ...(print ? { print } : {}),
        });
      });
    });
    return () => { canceled = true; cancelAnimationFrame(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printing]);

  const toggle = (id) => setChoices((c) => ({ ...c, [id]: !c[id] }));
  const any = OPTIONS.some((o) => choices[o.id]);
  const go = () => {
    try { localStorage.setItem(PRINT_CHOICES_KEY, JSON.stringify(choices)); } catch { /* per-browser convenience */ }
    setOpen(false);
    onHideNamesChange(choices.hideNames);
    setPrinting({ ...choices });
  };

  if (typeof document === 'undefined') return null;
  const shown = printing ? printInputsFor(inputs, printing.hideNames) : inputs;
  return (
    <>
      {open && (
        <ModalShell onClose={() => setOpen(false)} labelledBy="print-packet-title" style={{ maxWidth: '520px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
              <h2 id="print-packet-title" style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Print or save as PDF</h2>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '8px 0 14px' }}>
              Pick what goes in. To send it to a planner, choose Save as PDF in the print dialog; nothing is sent anywhere by the app.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {OPTIONS.map((o) => (
                <label key={o.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="checkbox" data-testid={`print-choice-${o.id}`} checked={Boolean(choices[o.id])} onChange={() => toggle(o.id)} style={{ marginTop: '3px' }} />
                  <span><strong>{o.label}</strong><br /><span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{o.hint}</span></span>
                </label>
              ))}
              <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '10px' }}>
                <SwitchRow id="print-choice-hideNames" checked={choices.hideNames} onChange={() => toggle('hideNames')} hint={"Spouse 1, Spouse 2 and Heir 1, 2\u2026 on every page."}>
                  Leave out names
                </SwitchRow>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="btn-primary" data-testid="print-packet-go" disabled={!any} onClick={go} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Printer size={14} /> Print
              </button>
            </div>
        </ModalShell>
      )}
      {/* Report only: no packet sheet at all. An empty one still printed
          its header on a page of its own after the report (changelog 333). */}
      {printing && OPTIONS.some((o) => o.id !== 'report' && printing[o.id]) && createPortal(
        <div className="section-print" data-section="packet" data-testid="print-packet-sheet">
          <PrintFrame title={packetTitle(printing)}>
          {printing.details && <PlanDetailsSheet inputs={shown} formatCurrency={formatCurrency} hideNames={printing.hideNames} />}
          {printing.accounts && <AccountsSummarySheet inputs={shown} holdings={holdings} formatCurrency={formatCurrency} />}
          {printing.spending && (
            <div className="packet-page"><SpendingReviewContent inputs={shown} formatCurrency={formatCurrency} hideNames={printing.hideNames} /></div>
          )}
          {printing.questions && <PlannerQuestionsSheet />}
          {printing.estate && <EstateChecklistPacketSheet showTitle={packetTitle(printing) !== 'Estate Documents Checklist'} />}
          {printing.lifeplan && <LifePlanPacketSheet showTitle={packetTitle(printing) !== 'Life Plan'} />}
          </PrintFrame>
        </div>,
        document.body,
      )}
    </>
  );
}
