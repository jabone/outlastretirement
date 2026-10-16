// Loads the Print / PDF Report chooser on the first request for it. The
// packet and its sheets (every plan setting with the field index, the
// account summary, the estate checklist...) are print-only, so the app does
// not download them until someone asks to print.
import React, { useEffect, useState } from 'react';
import { PRINT_PACKET_EVENT } from './printPacketEvents';
import { lazyWithRetry } from '../utils/lazyWithRetry';

const PrintPacket = lazyWithRetry(() => import('./PrintPacket'));

export default function PrintPacketLoader(props) {
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    if (wanted) return undefined;
    const want = () => setWanted(true);
    window.addEventListener(PRINT_PACKET_EVENT, want);
    return () => window.removeEventListener(PRINT_PACKET_EVENT, want);
  }, [wanted]);
  if (!wanted) return null;
  // openOnMount: the request that loaded the packet arrived before it could
  // listen for it.
  return (
    <React.Suspense fallback={null}>
      <PrintPacket {...props} openOnMount />
    </React.Suspense>
  );
}
