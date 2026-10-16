import React from 'react';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { hasYearsAbroad } from './hasYearsAbroad';

// The years-abroad notice for surfaces that are part of the app's first
// download (the Dashboard and the printable report). ForeignYearsNotice
// reads our country summaries (config/jurisdictions, about 50 kB), which
// only a plan with a move abroad needs, so it is fetched only for such a
// plan. A plan with no year abroad shows no notice either way -- the same
// test foreignYearsNoticeLines starts with -- and downloads nothing.
const ForeignYearsNotice = lazyWithRetry(() => import('./ForeignYearsNotice'));

export default function ForeignYearsNoticeLoader({ inputs, style }) {
  if (!hasYearsAbroad(inputs)) return null;
  return (
    <React.Suspense fallback={null}>
      <ForeignYearsNotice inputs={inputs} style={style} />
    </React.Suspense>
  );
}
