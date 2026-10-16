// Host tests that need a real Premium module install the Premium repo's
// built chunk (src/__tests__/fixtures/<area>.built.js) as the loader for
// that area. The chunk is the artifact the module server ships, executed
// against this host's real hostLib -- so a host test that mounts Detailed
// Holdings or Retirement Spending is testing what users get.
//
//   import { installBuiltHoldingsModule } from '../premiumTestHelpers.jsx';
//   beforeAll(installBuiltHoldingsModule);
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import { __setModuleLoader, __resetModuleCache } from '../premium/registry.js';
import { publishHostLib } from '../premium/hostLib.js';
import { withHost } from '../premium/withHost.jsx';
import { act } from '@testing-library/react';

const fixtureFor = (area) => join(dirname(fileURLToPath(import.meta.url)), 'fixtures', `${area}.built.js`);

// The built chunks are Premium code and are not part of the public
// repository (OPEN_CORE_PLAN.md step 4): a checkout without them skips the
// tests that need one. `premiumIt(area)` is `it` when the chunk is here
// and `it.skip` when it is not; `describe.skipIf(!hasBuiltChunk(area))`
// covers a whole block. The installers are no-ops without the chunk so a
// shared beforeAll does not fail the free tests beside the skipped ones.
export const hasBuiltChunk = (area) => existsSync(fixtureFor(area));
export const premiumIt = (area) => (hasBuiltChunk(area) ? it : it.skip);

const factoryPromises = new Map();
export function loadBuiltFactory(area) {
  if (!factoryPromises.has(area)) {
    factoryPromises.set(area, (async () => {
      publishHostLib();
      const text = readFileSync(fixtureFor(area), 'utf8');
      // vitest cannot import blob: URLs; a data: URL has the same semantics.
      await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
      const factory = window.__OR_HOST__.modules[area];
      if (typeof factory !== 'function') throw new Error(`built ${area} chunk did not register a factory`);
      return factory;
    })());
  }
  return factoryPromises.get(area);
}
export const loadBuiltHoldingsFactory = () => loadBuiltFactory('holdings');

export async function installBuiltHoldingsModule() {
  if (!hasBuiltChunk('holdings')) return;
  const factory = await loadBuiltHoldingsFactory();
  __resetModuleCache();
  __setModuleLoader('holdings', () => factory());
}

// The module's PortfolioTab wrapped with the live host, for tests that
// render it directly rather than through PremiumMount.
export async function builtPortfolioTab() {
  const factory = await loadBuiltHoldingsFactory();
  return withHost(factory().mounts.portfolioTab);
}

// The Premium repo's built spending chunk, as the loader for 'spending'.
// Does not reset the cache, so it can stack with installBuiltHoldingsModule.
export async function installSpendingModule() {
  if (!hasBuiltChunk('spending')) return;
  const factory = await loadBuiltFactory('spending');
  __setModuleLoader('spending', () => factory());
}

// The Premium repo's built readiness chunk, as the loader for 'readiness'.
export async function installReadinessModule() {
  if (!hasBuiltChunk('readiness')) return;
  const factory = await loadBuiltFactory('readiness');
  __setModuleLoader('readiness', () => factory());
}

// A PremiumMount resolves its (test) loader a few ticks after render. Await
// this after rendering a host surface with an entitlement so the module's
// component is in the DOM before the assertions run.
export async function settled(rendered) {
  await act(() => new Promise((r) => setTimeout(r, 0)));
  return rendered;
}
