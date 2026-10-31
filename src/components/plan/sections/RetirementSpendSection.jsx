// RetirementSpendSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_retirementSpend block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React, { useState } from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { SpendingLedgerPanel, IncomeFloorPanel } from '../sectionShared';
import CommaNumberInput from '../../CommaNumberInput';
import SpendingImportPanel from '../../SpendingImportPanel';
import SpendingReviewSheet from '../../SpendingReviewSheet';
import { Printer } from 'lucide-react';

export default function RetirementSpendSection() {
  const { inputs, updateInput, formatCurrency, setActiveTab, projection } = useSimulation();
  const [reviewing, setReviewing] = useState(false);
  return (
    <>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '16px' }}>
                  What you want to spend per year <em>once retired</em>, in today&rsquo;s dollars. This drives the whole
                  projection &mdash; it&rsquo;s what your portfolio has to sustain, and it&rsquo;s also the basis for the
                  FI/CoastFIRE target and the three-phase lifestyle curve further down. The
                  &ldquo;Annual Lifestyle&rdquo; slider at the top of every screen edits this same number (on a phone, tap the summary line at the top to show it).
                </p>
                {/* Paper for someone checking the budget with a pen (changelog 297). */}
                <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  <button
                    type="button"
                    className="btn-outline"
                    data-testid="print-spending-review"
                    onClick={() => setReviewing(true)}
                    disabled={reviewing}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: 'var(--fs-sm)' }}
                  >
                    <Printer size={14} /> Print for review
                  </button>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                    Every spending line on paper, with a box to tick and room to write a change. Save as PDF from the print dialog to send it.
                  </span>
                </div>
                {reviewing && <SpendingReviewSheet inputs={inputs} formatCurrency={formatCurrency} onDone={() => setReviewing(false)} />}
                {inputs.lifestyleExpenseInputMode === 'categories' ? (
                  <div className="form-group">
                    <label htmlFor="field-lifestyleExpense-categories">Annual Lifestyle Spending ($/yr)</label>
                    <input
                      id="field-lifestyleExpense-categories"
                      className="form-input"
                      value={formatCurrency(inputs.lifestyleExpense)}
                      readOnly
                      disabled
                    />
                    <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                      Built from your categories below. Switching back to a single annual figure keeps the ledger.
                    </span>
                  </div>
                ) : inputs.lifestyleExpenseInputMode === 'monthly' ? (
                  <div className="form-group">
                    <label htmlFor="field-lifestyleExpense-readonly">Annual Lifestyle Spending ($/yr)</label>
                    <input
                      id="field-lifestyleExpense-readonly"
                      className="form-input"
                      value={formatCurrency(inputs.lifestyleExpense)}
                      readOnly
                      disabled
                    />
                    <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                      You&rsquo;re entering this month by month, so this total is the sum of those twelve figures. Edit
                      the monthly amounts in the{' '}
                      <button
                        type="button"
                        onClick={() => setActiveTab('interview')}
                        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-text)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
                      >
                        Full Interview&rsquo;s Spending section
                      </button>, or switch back to a single annual amount there.
                    </span>
                  </div>
                ) : (
                  <div className="form-group">
                    <label htmlFor="field-lifestyleExpense">Annual Lifestyle Spending ($/yr)</label>
                    <CommaNumberInput
                      id="field-lifestyleExpense"
                      value={inputs.lifestyleExpense}
                      onChange={(val) => updateInput('lifestyleExpense', val)}
                    />
                    <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                      In today&rsquo;s dollars &mdash; the model inflates it forward each year. Leave out what the plan
                      charges on its own: taxes, health insurance and Medicare, long-term care, mortgage and other debt
                      payments, gifts and one-time expenses. Prefer to budget month by month? The Full Interview&rsquo;s
                      Spending section offers that entry mode.
                    </span>
                  </div>
                )}

                <SpendingLedgerPanel inputs={inputs} updateInput={updateInput} formatCurrency={formatCurrency} projection={projection} />

                <SpendingImportPanel inputs={inputs} setActiveTab={setActiveTab} />

                <IncomeFloorPanel inputs={inputs} setActiveTab={setActiveTab} />

    </>
  );
}
