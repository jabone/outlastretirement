// <PremiumMount id="portfolioTab" /> -- one named place in the host UI where a
// Premium module may render (contract section 5). The host decides WHETHER
// to load (entitlement), the registry decides WHERE the code comes from, and
// the module decides WHAT renders. This component is the only piece of the
// host that ever holds a module instance.
//
// States, in order:
//   no entitlement and no preview  -> `locked` (or nothing, for tab-level mounts
//                                     the host already hides)
//   loading                        -> `fallback`
//   module failed to load          -> a short card saying so; never a blank tab
//   module loaded, mount unfilled  -> `locked` (the module may fill a subset)
//   module loaded, mount filled    -> the module's component with { host }
import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { areaForMount } from './contract';
import { loadModule } from './registry';
import { useHostApi } from './useHostApi';
import { useEntitlement } from '../context/useEntitlement';
import { PREMIUM_AREAS } from '../config/premiumOffering';

function areaName(area) {
  return PREMIUM_AREAS.find((a) => a.id === area)?.name || 'Premium';
}

function LoadFailedCard({ area, error }) {
  const mismatch = error?.code === 'CONTRACT_MISMATCH';
  const rejected = error?.code === 'KEY_REJECTED' || error?.code === 'NO_KEY';
  const localOnly = error?.name === 'LocalOnlyModeError';
  return (
    <div className="glass-panel" role="status" style={{ padding: '14px 18px', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
      <Lock size={16} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
      <div style={{ fontSize: 'var(--fs-sm)' }}>
        <div style={{ fontWeight: 600 }}>{localOnly ? `${areaName(area)} is not loaded` : `${areaName(area)} could not be loaded`}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
          {localOnly
            ? 'Local-Only Mode is on, so Premium modules are not fetched. Turn it off in Preferences to load this.'
            : mismatch
            ? 'This part of Premium needs a newer version of the app. Reload the page to pick it up.'
            : rejected
              ? 'Your Premium key was not accepted. Check it in Preferences. Your plan and your data are unaffected.'
              : 'Check your connection and try again. Your plan and your data are unaffected.'}
        </div>
      </div>
    </div>
  );
}

export default function PremiumMount({ id, locked = null, fallback = null, ...rest }) {
  const area = areaForMount(id);
  const host = useHostApi();
  // The key itself never reaches a module (contract section 3); only the
  // loader, which is host code, carries it to the module server.
  const { premiumJwtToken: token } = useEntitlement();
  const { isPremium, preview } = host.entitlement;
  const wanted = isPremium || preview;
  const [state, setState] = useState({ status: wanted ? 'loading' : 'idle', instance: null, error: null });

  useEffect(() => {
    if (!wanted) { setState({ status: 'idle', instance: null, error: null }); return undefined; }
    let canceled = false;
    setState((s) => (s.instance ? s : { status: 'loading', instance: null, error: null }));
    loadModule(area, { token }).then(
      (instance) => { if (!canceled) setState({ status: 'ready', instance, error: null }); },
      (error) => { if (!canceled) setState({ status: 'failed', instance: null, error }); },
    );
    return () => { canceled = true; };
  }, [area, wanted, token]);

  if (!wanted) return locked;
  if (state.status === 'loading') return fallback;
  if (state.status === 'failed') return <LoadFailedCard area={area} error={state.error} />;
  const Component = state.instance?.mounts?.[id];
  if (!Component) return locked;
  return <Component host={host} {...rest} />;
}
