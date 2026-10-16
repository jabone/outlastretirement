// The Plan sections the first-visit Quick Setup shows, gathered so App.jsx
// can load them in one chunk only when Quick Setup opens (most visits never
// see it). The Plan tabs import the same components directly.
export { GuidedSection } from './sectionShared';
export { default as DemographicsSection } from './sections/DemographicsSection';
export { default as SalariesSection } from './sections/SalariesSection';
export { default as SocialSecuritySection } from './sections/SocialSecuritySection';
export { default as AnnuitiesPensionsSection } from './sections/AnnuitiesPensionsSection';
export { default as InitialBalancesSection } from './sections/InitialBalancesSection';
export { default as RetirementSpendSection } from './sections/RetirementSpendSection';
export { default as ContributionsSection } from './sections/ContributionsSection';
