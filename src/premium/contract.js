// The host side of PREMIUM_MODULE_CONTRACT.md: the constants both repos
// compile against. Keep this file free of imports so a module (or its test
// fixture) can read it without pulling the host bundle in.

// Bump the minor on an additive change to the host API or a new mount
// point; bump the major only when something is removed or renamed and every
// module is updated in the same release (contract section 8).
export const CONTRACT_VERSION = '1.0';

export const AREAS = Object.freeze(['holdings', 'spending', 'readiness', 'relocation']);

// Mount point id -> the area whose module may fill it. Adding a mount point
// is a host change: a row here, a <PremiumMount id> in the tree, and copy in
// premiumOffering.js (contract section 5).
export const MOUNT_POINTS = Object.freeze({
  portfolioTab: 'holdings',
  preferencesPricing: 'holdings',
  initialBalancesCta: 'holdings',
  spendingBridge: 'spending',
  spendingFloor: 'spending',
  spendingImport: 'spending',
  readinessDetail: 'readiness',
  historicalStarts: 'readiness',
  relocationCompare: 'relocation',
  residencyTimeline: 'relocation',
});

export function areaForMount(mountId) {
  const area = MOUNT_POINTS[mountId];
  if (!area) throw new Error(`Unknown Premium mount point "${mountId}"`);
  return area;
}

// A module's contract version is compatible when the major matches and its
// minor is not newer than the host's -- it may use only what this host has.
export function isCompatibleContract(moduleVersion) {
  if (typeof moduleVersion !== 'string') return false;
  const [hMajor, hMinor] = CONTRACT_VERSION.split('.').map(Number);
  const [mMajor, mMinor] = moduleVersion.split('.').map(Number);
  if (!Number.isFinite(mMajor) || !Number.isFinite(mMinor)) return false;
  return mMajor === hMajor && mMinor <= hMinor;
}
