// Which plan inputs the guided Interview shows by default (IA Phase 3 step 2,
// 2026-09-24). The Interview and Plan Settings render the SAME section
// components; in guided mode a section folds every field NOT listed here
// under "More options", so the first pass stays about as long as the old
// Interview was. Keys are spouse-agnostic (a trailing 1/2 is stripped before
// the lookup), which is also how inputCoverage.test.js reads them.
//
// The list started as exactly what the old hand-written Interview asked,
// plus planYear. Add a key here to promote a field to the first pass;
// remove one to fold it. Nothing else changes: the field is still on the
// page either way.
export const GUIDED_CORE_KEYS = new Set([
  'acaCliffProtectionEnabled', 'acaSubsidyAnnualValue', 'acaSubsidyProtectionEnabled', 'afterTaxContributionsAllowed',
  'annuityIncome', 'annuityIndexation', 'annuityIsTaxable', 'annuityPayoutRate', 'annuityPurchaseAge', 'annuityPurchaseAmount', 'annuitySourceAccount',
  'autoMaxContribution', 'backdoorRothAnnualAmount', 'backdoorRothEnabled', 'birthYear',
  'cashFloorEnabled', 'cashFloorInit', 'cashFloorPreFundEnabled', 'cashFloorReturnRate',
  'charitableBequestAmount', 'charitableBequestEnabled', 'charitableBequestMode', 'charitableBequestPct',
  'charitableBequestSource', 'estateIndexingEnabled', 'heirDistributionStrategy', 'heirSplitMode', 'heirs',
  'cashFloorTargetMonths', 'claimingAge', 'concentratedStockCostBasisPct', 'concentratedStockDiversifyPct',
  'concentratedStockEnabled', 'concentratedStockGrowthRate', 'concentratedStockInit', 'concentratedStockLabel',
  'currentHouseholdSpendingCustom', 'currentSpendingMode', 'deficitReductionStrategy', 'employerMatch',
  'employerMatchCapAPct', 'employerMatchCapB', 'employerMatchCombine', 'employerMatchMode',
  'employerMatchRateA', 'employerMatchRateB', 'employerMatchTierBEnabled', 'filingStatus',
  'goGoBumpEnabled', 'goGoBumpEndAge', 'goGoBumpRate', 'goGoEndAge', 'goGoMultiplier', 'governmentPension',
  'healthcareBridgeCost', 'homeAppreciationRate', 'homeOwned', 'homeValueInit', 'hsaContribution',
  'hsaFamilyCoverage', 'hsaInit', 'inflationRate', 'irmaaFreezeEnabled', 'key', 'lifeExpectancy',
  'lifeInsuranceCashValueGrowthRate', 'lifeInsuranceCashValueInit', 'lifeInsuranceDeathBenefit',
  'lifeInsuranceEnabled', 'lifeInsuranceOwnership', 'lifeInsurancePolicyType', 'lifestyleExpense',
  'lifestyleThreePhaseEnabled', 'phasesFloorAware', 'ltcActive', 'ltcCost', 'ltcDurationYears', 'ltcEndsInDeath',
  'ltcStartAge', 'milestones', 'militaryPension', 'mortgageBalance', 'mortgagePayment', 'mortgageRate',
  'noGoMultiplier', 'nqdcDeferralAmount', 'nqdcDistributionStartAge', 'nqdcDistributionYears',
  'nqdcEnabled', 'nqdcGrowthRate', 'nqdcInit', 'nycResident', 'otherDebtBalance', 'otherDebtPayment',
  'otherDebtRate', 'otherEstateAssetsGrowthRate', 'otherEstateAssetsInit', 'partTimeIncome',
  'partTimeIncomeEndAge', 'pension', 'pension1COLA', 'pension1LumpSum', 'pension1LumpSumRollover',
  'pension1LumpSumValue', 'pension1SurvivorBenefit', 'pension2COLA', 'pension2LumpSum', 'pension2LumpSumRollover',
  'pension2LumpSumValue', 'pension2SurvivorBenefit', 'pensionStartAge', 'planYear', 'postRetireReturn',
  'preRetireReturn', 'preTaxBasisInit', 'preTaxContribution', 'preTaxInit', 'qcdAnnualAmount',
  'rentalIncome', 'retireAge', 'reverseMortgageEnabled', 'reverseMortgageMonthlyPayout',
  'reverseMortgagePayoutType', 'reverseMortgageStartAge', 'rothBasisInit', 'rothContribution',
  'rothConversionAmount', 'rothConversionBracket', 'rothConversionBuffer', 'rothConversionDelayUntilRetire',
  'rothConversionDurationYears', 'rothConversionStrategy', 'rothInit', 'rothRecentConversionsInit',
  'rsuGrants', 'rsuSharePrice', 'salary', 'slowGoEndAge', 'slowGoMultiplier', 'spouse1Name',
  'spouse2Enabled', 'spouse2Name', 'ss', 'ssDepletionEnabled', 'ssSpousalEnabled', 'stateOfResidence',
  'stateTaxFlatRate', 'stateTaxPensionTaxable', 'stateTaxSocialSecurityTaxable', 'stateTaxState',
  'taxLossHarvestingEnabled', 'taxableBasisInit', 'taxableCapitalGainsRatio', 'taxableContribution',
  'taxableInit', 'tcjaSunsetEnabled', 'withdrawalStrategy', 'yonkersResident',
]);

export const stripSpouseSuffix = (k) => String(k).replace(/[12]$/, '');
export const isGuidedCore = (key) => GUIDED_CORE_KEYS.has(stripSpouseSuffix(key));
