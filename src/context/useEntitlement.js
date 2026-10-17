import { useContext } from 'react';
import EntitlementContext from './EntitlementContext';

export const useEntitlement = () => {
  const context = useContext(EntitlementContext);
  if (!context) {
    throw new Error('useEntitlement must be used within an EntitlementContext.Provider');
  }
  return context;
};
