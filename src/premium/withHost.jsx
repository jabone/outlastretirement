// withHost(Component) -- renders a module component with the live `host`
// built from the host's contexts. Used by the host's own tests to exercise a
// module component directly, without going through PremiumMount's async
// load. Not for production code: production mounts go through PremiumMount.
import React from 'react';
import { useHostApi } from './useHostApi';

export function withHost(Component) {
  function Hosted(props) {
    const host = useHostApi();
    return <Component host={host} {...props} />;
  }
  Hosted.displayName = `withHost(${Component.displayName || Component.name || 'Component'})`;
  return Hosted;
}
