import { createContext } from 'react';

// Mirrors SimulationContext.jsx's pattern exactly. See INTEGRATION_STRATEGY.md
// (repo root), Section 1, for the design this implements: everything that
// needs to know "is this user premium" reads useEntitlement() rather than
// reaching for a specific billing mechanism directly -- so when a real
// EntitlementProvider (Stripe/JWT, IAP, or something else -- still an open
// decision, see the doc) replaces the temporary dev-only flag in App.jsx,
// nothing downstream of this context needs to change.
const EntitlementContext = createContext(null);

export default EntitlementContext;
