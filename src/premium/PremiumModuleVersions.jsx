// Preferences > Premium Access: which Premium modules are loaded, their
// version, and where they came from -- the "signed, versioned chunks with the
// version visible in Preferences" promise (OPEN_CORE_PLAN.md decision 5,
// privacy policy "Premium Modules"). Re-reads the registry on an interval
// because modules load lazily as their tabs are opened.
import React, { useEffect, useState } from 'react';
import { loadedModuleVersions, isRemoteLoading, PREMIUM_MODULE_SERVER } from './registry';
import { PREMIUM_AREAS } from '../config/premiumOffering';

export default function PremiumModuleVersions() {
  const [versions, setVersions] = useState(() => loadedModuleVersions());
  useEffect(() => {
    const t = setInterval(() => setVersions(loadedModuleVersions()), 1500);
    return () => clearInterval(t);
  }, []);
  const entries = Object.entries(versions);
  const source = isRemoteLoading() ? new URL(PREMIUM_MODULE_SERVER).host : 'this site';
  return (
    <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', margin: '8px 0 0', maxWidth: '760px' }} data-testid="premium-module-versions">
      Premium modules load from <strong>{source}</strong>
      {isRemoteLoading() ? ', signed and checked before they run' : ''}.{' '}
      {entries.length === 0
        ? 'None loaded yet in this session; a module loads the first time you open its tab.'
        : <>Loaded so far this session: {entries.map(([area, v], i) => (
          <span key={area}>{i > 0 ? ', ' : ''}{PREMIUM_AREAS.find((a) => a.id === area)?.name || area} <code>{v}</code></span>
        ))}. Each module loads the first time you open the part of the App that uses it.</>}
    </p>
  );
}
