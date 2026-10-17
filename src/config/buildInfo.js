// What build is running, for support questions ("which version are you
// on?"). The version is the newest changelog entry's id -- the number users
// see in What's New -- and the build id is the short git commit the bundle
// was built from (vite.config.js defines both globals at build time; tests
// and other non-Vite runs get 'dev').
import { LATEST_CHANGELOG_ID } from './changelogLatest';

/* global __BUILD_ID__, __BUILD_DATE__ */
export const APP_VERSION = LATEST_CHANGELOG_ID;
export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
export const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '';

export const versionLabel = () => `Version ${APP_VERSION} · build ${BUILD_ID}`;
