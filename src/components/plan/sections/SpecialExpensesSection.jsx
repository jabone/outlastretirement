// SpecialExpensesSection -- the "Special Expenses" fold on Plan Settings ->
// Spending. It only owns the collapse header and composes two sections the
// guided Interview also mounts on their own steps: SpendingPhasesSection
// and HealthcareSection. The withdrawal and taxable-account mechanics used
// to sit in here too; they are not expenses, and have their own fold
// ("Withdrawals & Taxable Account", WithdrawalSection) right below it.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { CollapsibleHeader } from '../sectionShared';
import { useFoldState } from '../foldState';
import SpendingPhasesSection from './SpendingPhasesSection';
import HealthcareSection from './HealthcareSection';

export default function SpecialExpensesSection({ forceOpen = false }) {
  const { inputs } = useSimulation();
  const [showSpecialExpenses, toggleShowSpecialExpenses] = useFoldState('specialExpenses', () => (
    inputs.lifestyleThreePhaseEnabled || inputs.goGoBumpEnabled || inputs.ltcActive1 || inputs.ltcActive2 ||
    (inputs.medicareEmployerCoverage1 || 'none') !== 'none' || (inputs.medicareEmployerCoverage2 || 'none') !== 'none'
  ), forceOpen);
  return (
    <>
                <CollapsibleHeader title="Special Expenses" isOpen={showSpecialExpenses} onToggle={toggleShowSpecialExpenses} />
                {showSpecialExpenses && (
                <>
                <SpendingPhasesSection />
                <HealthcareSection />
                </>
                )}
    </>
  );
}
