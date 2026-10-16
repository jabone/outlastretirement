import React, { useEffect, useState } from 'react';
import { isLocalOnlyMode, subscribeLocalOnlyMode } from '../utils/localOnlyMode';
import { isAnalyticsEnabled, subscribeAnalyticsEnabled } from '../utils/analyticsOptIn';
import { makeAnalyticsBeforeSend } from '../utils/analyticsUrl';

// One instance for the life of the page, so the "same tab as last time"
// check in analyticsUrl.js spans every page view.
const beforeSend = makeAnalyticsBeforeSend();

// Loaded only once a visitor has opted in, so everyone else never downloads
// the analytics code at all. mode="production" pins the first-party script
// (/_vercel/insights/script.js): the package otherwise picks its debug build
// from va.vercel-scripts.com whenever it believes it is in development
// (review 2026-09-30, S8).
const Analytics = React.lazy(() => import('@vercel/analytics/react').then((m) => ({ default: m.Analytics })));

// Vercel Web Analytics, gated on TWO conditions (changelog 149):
//   1. the user has opted in (analyticsOptIn.js -- OFF by default), and
//   2. Local-Only Mode is off (localOnlyMode.js).
// Either one false and this renders nothing, so no page-view beacon ever
// leaves the browser. Both flags are read synchronously before first
// render (see each module), so a fresh visitor -- who has not opted in --
// sends zero beacons, including the initial page-view.
//
// Speed Insights (a web-vitals beacon for high-traffic production tuning)
// was removed in changelog 149 -- not worth sending from a privacy-first
// personal app, and its @vercel/speed-insights dependency is gone.
const GatedAnalytics = () => {
  const [localOnly, setLocalOnly] = useState(isLocalOnlyMode);
  const [optedIn, setOptedIn] = useState(isAnalyticsEnabled);
  useEffect(() => subscribeLocalOnlyMode(setLocalOnly), []);
  useEffect(() => subscribeAnalyticsEnabled(setOptedIn), []);
  if (localOnly || !optedIn) return null;
  // beforeSend strips the query string and hash and keeps only a known
  // tab name (utils/analyticsUrl.js).
  return (
    <React.Suspense fallback={null}>
      <Analytics beforeSend={beforeSend} mode="production" />
    </React.Suspense>
  );
};

export default GatedAnalytics;
