// @vitest-environment jsdom
//
// PreferencesTab.jsx -- the app's single home for everything that is NOT
// plan data, added 2026-08-19 (IA Phase 2, see IA_REVIEW.md).
//
// The point of these tests is the boundary, not the styling: this tab must
// own app/display settings and must NOT own plan inputs. The bug class
// they guard against is a plan input drifting onto this page (where it
// would silently escape saved Scenarios, since none of these values are
// part of `inputs`), and the four sections silently disappearing.
import { describe, it, expect, vi, afterEach , beforeAll} from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PreferencesTab from '../../components/tabs/PreferencesTab';

// cloudFileSync wraps two browser APIs jsdom has no implementation of
// (showSaveFilePicker, and FileSystemFileHandles persisted in IndexedDB),
// so it is mocked for this whole file.
//
// vi.hoisted + a mutable control object, rather than vi.doMock with a
// dynamic import: re-importing the component under vi.resetModules() also
// re-creates SimulationContext, so the freshly-imported component looks
// for a provider that renderWithSimulation -- still holding the original
// context object -- never rendered. The failure surfaces as "useSimulation
// must be used within a SimulationProvider", which reads like a component
// bug rather than a test-harness one. One module graph avoids it.
const cloudMock = vi.hoisted(() => ({ supported: true, handle: null }));
vi.mock('../../utils/cloudFileSync', () => ({
  isSaveFileSupported: () => cloudMock.supported,
  getLinkedFileHandle: async () => cloudMock.handle,
  clearLinkedFileHandle: async () => { cloudMock.handle = null; },
  pickSaveFile: async () => null,
  ensureWritePermission: async () => true,
  writePayloadToHandle: async () => {},
  readFileFromHandle: async () => null,
}));
// A backup's Premium key is restored (and unlocks its holdings) only when
// its signature verifies; 'good.jwt.token' stands in for one that does.
vi.mock('../../utils/premiumJwt', () => ({
  verifyPremiumJwt: async (token) => ({ valid: token === 'good.jwt.token', expiresAt: null }),
}));
import { renderWithSimulation } from '../testUtils';
import { installBuiltHoldingsModule, premiumIt, hasBuiltChunk } from '../premiumTestHelpers.jsx';
import { releaseWrites, isWriteHeld } from '../../utils/safeStorage';
import { PLAN_KEYS } from '../../utils/storageKeys';
import { DEFAULT_INPUTS } from '../../calculator';

beforeAll(installBuiltHoldingsModule);

describe('PreferencesTab — structure', () => {
  it('renders the host sections; Live Pricing is a Premium mount and stays out without a key', async () => {
    renderWithSimulation(<PreferencesTab />);
    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Display' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Premium Access' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your Data' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Live Pricing Connection' })).not.toBeInTheDocument();
  });

  premiumIt('holdings')('renders Live Pricing once the holdings module loads for a premium user', async () => {
    renderWithSimulation(<PreferencesTab />, {}, { isPremium: true });
    expect(await screen.findByRole('heading', { name: 'Live Pricing Connection' })).toBeInTheDocument();
  });

  it('links to Plan Settings for anything that affects the projection', async () => {
    const user = userEvent.setup({ delay: null });
    const setActiveTab = vi.fn();
    renderWithSimulation(<PreferencesTab />, { setActiveTab });
    await user.click(screen.getByRole('button', { name: 'Plan Settings' }));
    expect(setActiveTab).toHaveBeenCalledWith('settings');
  });
});

describe('PreferencesTab — Premium Access status', () => {
  const until = new Date(2027, 8, 30);
  it('names the address the key was issued to, when the key carries one', () => {
    renderWithSimulation(<PreferencesTab />, {}, { isPremium: true, premiumJwtToken: 'eyJx.y.z', premiumJwtExpiresAt: until, licensedTo: 'someone@example.com' });
    expect(screen.getByText(/Active until .* · licensed to someone@example\.com/)).toBeInTheDocument();
  });
  it('shows only the expiry for a key minted before keys carried an address', () => {
    renderWithSimulation(<PreferencesTab />, {}, { isPremium: true, premiumJwtToken: 'eyJx.y.z', premiumJwtExpiresAt: until, licensedTo: null });
    expect(screen.getByText(/^Active until [^·]*$/)).toBeInTheDocument();
  });
});

describe('PreferencesTab — Display', () => {
  it('theme toggle calls toggleTheme and reports the current mode', async () => {
    const user = userEvent.setup({ delay: null });
    const toggleTheme = vi.fn();
    renderWithSimulation(<PreferencesTab />, { theme: 'dark', toggleTheme });
    const btn = screen.getByRole('button', { name: /Theme/ });
    expect(btn).toHaveAttribute('aria-pressed', 'true'); // dark
    await user.click(btn);
    expect(toggleTheme).toHaveBeenCalled();
  });

  it('large text toggle flips largeTextMode', async () => {
    const user = userEvent.setup({ delay: null });
    const setLargeTextMode = vi.fn();
    renderWithSimulation(<PreferencesTab />, { largeTextMode: false, setLargeTextMode });
    await user.click(screen.getByRole('button', { name: /Large text/ }));
    expect(setLargeTextMode).toHaveBeenCalledWith(true);
  });

  it('dollars toggle flips useRealDollars and shows which mode is active', async () => {
    const user = userEvent.setup({ delay: null });
    const setUseRealDollars = vi.fn();
    renderWithSimulation(<PreferencesTab />, { useRealDollars: true, setUseRealDollars });
    const btn = screen.getByRole('button', { name: /Show figures in/ });
    expect(btn).toHaveTextContent("Today's Dollars");
    await user.click(btn);
    expect(setUseRealDollars).toHaveBeenCalledWith(false);
  });
});

describe.skipIf(!hasBuiltChunk('holdings'))('PreferencesTab — Live Pricing', () => {
  it('edits the shared pricingSource rather than a local copy', async () => {
    const user = userEvent.setup({ delay: null });
    const setPricingSource = vi.fn();
    renderWithSimulation(<PreferencesTab />, { setPricingSource }, { isPremium: true });
    await user.type(await screen.findByLabelText('Sheet CSV URL (fallback)'), 'x');
    expect(setPricingSource).toHaveBeenCalled();
  });

  premiumIt('holdings')('shows the redeploy notice only when the deployed script is behind', async () => {
    const { unmount } = renderWithSimulation(<PreferencesTab />, { pricingScriptOutOfDate: false }, { isPremium: true });
    await screen.findByRole('heading', { name: 'Live Pricing Connection' });
    expect(screen.queryByText(/out of date/i)).not.toBeInTheDocument();
    unmount();

    renderWithSimulation(<PreferencesTab />, {
      pricingScriptOutOfDate: true,
      scriptAckVersion: 1,
      pricingSource: { csvUrl: 'https://docs.google.com/spreadsheets/d/e/test/pub?output=csv', scriptUrl: 'https://script.google.com/macros/s/test/exec' },
    }, { isPremium: true });
    expect(await screen.findByText(/out of date/i)).toBeInTheDocument();
  });
});

describe('PreferencesTab — Your Data', () => {
  it('exposes Reset Plan, and wires it to the shared handler', async () => {
    const user = userEvent.setup({ delay: null });
    const handleReset = vi.fn();
    renderWithSimulation(<PreferencesTab />, { handleReset });
    await user.click(screen.getByRole('button', { name: /Reset Plan to Defaults/ }));
    expect(handleReset).toHaveBeenCalled();
  });

  it('re-runs the setup wizard from step 1', async () => {
    const user = userEvent.setup({ delay: null });
    const setShowOnboarding = vi.fn();
    const setOnboardingStep = vi.fn();
    renderWithSimulation(<PreferencesTab />, { setShowOnboarding, setOnboardingStep });
    await user.click(screen.getByRole('button', { name: /Re-run the Setup Wizard/ }));
    expect(setOnboardingStep).toHaveBeenCalledWith(1);
    expect(setShowOnboarding).toHaveBeenCalledWith(true);
  });
});

describe('PreferencesTab — Plan Status bar visibility', () => {
  // The sticky bar is dismissible from the bar itself, which makes this the
  // only way back. A dismiss control with no restore control is a one-way
  // door, so the two ship together.
  it('shows the bar as Shown by default and turns it off', async () => {
    const user = userEvent.setup({ delay: null });
    const setStatusBarHidden = vi.fn();
    renderWithSimulation(<PreferencesTab />, { statusBarHidden: false, setStatusBarHidden });

    const toggle = screen.getByRole('button', { name: /Plan Status bar/ });
    expect(toggle).toHaveTextContent('Shown');
    await user.click(toggle);
    expect(setStatusBarHidden).toHaveBeenCalledWith(true);
  });

  it('reads as Hidden once dismissed, and turns it back on', async () => {
    const user = userEvent.setup({ delay: null });
    const setStatusBarHidden = vi.fn();
    renderWithSimulation(<PreferencesTab />, { statusBarHidden: true, setStatusBarHidden });

    const toggle = screen.getByRole('button', { name: /Plan Status bar/ });
    expect(toggle).toHaveTextContent('Hidden');
    await user.click(toggle);
    expect(setStatusBarHidden).toHaveBeenCalledWith(false);
  });
});

describe('PreferencesTab — Round far-future dollars (changelog 278)', () => {
  it('is Exact by default and turns rounding on', async () => {
    const user = userEvent.setup({ delay: null });
    const setRoundFarDollars = vi.fn();
    renderWithSimulation(<PreferencesTab />, { roundFarDollars: false, setRoundFarDollars });
    const toggle = screen.getByRole('button', { name: /Round far-future dollars/ });
    expect(toggle).toHaveTextContent('Exact');
    await user.click(toggle);
    expect(setRoundFarDollars).toHaveBeenCalledWith(true);
  });

  it('reads Rounded when on, and turns it back off', async () => {
    const user = userEvent.setup({ delay: null });
    const setRoundFarDollars = vi.fn();
    renderWithSimulation(<PreferencesTab />, { roundFarDollars: true, setRoundFarDollars });
    const toggle = screen.getByRole('button', { name: /Round far-future dollars/ });
    expect(toggle).toHaveTextContent('Rounded');
    await user.click(toggle);
    expect(setRoundFarDollars).toHaveBeenCalledWith(false);
  });
});

describe('PreferencesTab — boundary: no plan inputs live here', () => {
  // The whole reason this tab exists is to separate app settings from plan
  // data. If a plan input ever lands here it would escape saved Scenarios
  // entirely (none of this page is part of `inputs`), so guard it directly.
  it('never calls updateInput', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    renderWithSimulation(<PreferencesTab />, { updateInput });
    for (const btn of screen.getAllByRole('button')) {
      // Reset Plan is destructive in the real app but a no-op stub here.
      // Erase everything really erases (it does not go through a context
      // handler), so it has its own test below instead.
      if (btn.dataset.testid === 'erase-everything') continue;
      await user.click(btn);
    }
    expect(updateInput).not.toHaveBeenCalled();
  });
});

describe('PreferencesTab — Erase everything on this device', () => {
  afterEach(() => { releaseWrites(); localStorage.clear(); });

  it('names what goes, offers a backup first, needs ERASE typed, then removes every app key and reloads to first run', async () => {
    const user = userEvent.setup({ delay: null });
    for (const k of PLAN_KEYS) localStorage.setItem(k, '"x"');
    localStorage.setItem('retire_plan_theme', 'dark');
    localStorage.setItem('retire_plan_onboarding_completed', 'true');
    sessionStorage.setItem('cfe_session_probe', '1');
    const showConfirm = vi.fn().mockResolvedValue(true);
    const replace = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...orig, pathname: '/app/', replace } });
    try {
      renderWithSimulation(<PreferencesTab />, { showConfirm });
      await user.click(screen.getByRole('button', { name: /Erase everything on this device/ }));
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/app/'));
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: orig });
    }
    const [message, opts] = showConfirm.mock.calls[0];
    for (const word of ['plan', 'saved scenarios', 'Detailed Holdings', 'estate checklist', 'Life Plan', 'Premium Access key', 'Live Pricing connection', 'preferences']) {
      expect(message).toContain(word);
    }
    expect(opts).toMatchObject({ title: 'Erase everything on this device', danger: true, requireText: 'ERASE', altLabel: 'Back Up Everything First' });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    // Nothing can be written back before the reload lands.
    expect(isWriteHeld('retire_plan_inputs')).toBe(true);
  });

  it('Back Up Everything First downloads a backup and erases nothing', async () => {
    const user = userEvent.setup({ delay: null });
    localStorage.setItem('retire_plan_inputs', '"keep"');
    const showConfirm = vi.fn().mockResolvedValue('alt');
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    const revoke = URL.revokeObjectURL;
    URL.revokeObjectURL = vi.fn();
    try {
      renderWithSimulation(<PreferencesTab />, { showConfirm });
      await user.click(screen.getByRole('button', { name: /Erase everything on this device/ }));
      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    } finally {
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revoke;
    }
    expect(localStorage.getItem('retire_plan_inputs')).toBe('"keep"');
    expect(isWriteHeld('retire_plan_inputs')).toBe(false);
  });
});

// Backup & Restore -- moved here from LedgerTab.test.jsx 2026-08-19.
//
// These assertions never changed: they cover what a backup file actually
// contains, and the rule that holdings/liquidations are only restored when
// Premium is active on this browser or the file itself carries a key. Only
// the entry point moved. The Ledger tab used to carry a third copy of
// these buttons ("Export JSON" / "Import JSON") alongside the Sidebar's and
// Preferences'; that copy is gone, and all remaining entry points share one
// implementation (useFullBackupActions), which is what these now exercise.
describe('PreferencesTab — Backup & Restore', () => {
  const HOLDINGS_KEY = 'cfe_premium_holdings_v1';
  const LIQUIDATIONS_KEY = 'cfe_premium_liquidations_v1';

  afterEach(() => {
    localStorage.removeItem(HOLDINGS_KEY);
    localStorage.removeItem(LIQUIDATIONS_KEY);
  });

  function captureExportedBlob() {
    let capturedBlob = null;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob) => {
      capturedBlob = blob;
      return 'blob:mock-url';
    });
    URL.revokeObjectURL = vi.fn();
    return {
      getBlob: () => capturedBlob,
      restore: () => {
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
      },
    };
  }

  it('includes portfolioHoldings from localStorage in the exported backup JSON', async () => {
    const user = userEvent.setup({ delay: null });
    localStorage.setItem(HOLDINGS_KEY, JSON.stringify([
      { id: 'h1', symbol: 'AAPL', shares: 10, taxTreatment: 'taxable' },
    ]));
    const capture = captureExportedBlob();
    try {
      renderWithSimulation(<PreferencesTab />);
      await user.click(screen.getByRole('button', { name: /Backup Everything/ }));

      const text = await capture.getBlob().text();
      const parsed = JSON.parse(text);
      expect(parsed.portfolioHoldings).toHaveLength(1);
      expect(parsed.portfolioHoldings[0]).toMatchObject({ symbol: 'AAPL', shares: 10 });
    } finally {
      capture.restore();
    }
  });

  it('exports an empty portfolioHoldings array when no holdings exist, and a null Premium Access Key when none is active', async () => {
    const user = userEvent.setup({ delay: null });
    const capture = captureExportedBlob();
    try {
      renderWithSimulation(<PreferencesTab />);
      await user.click(screen.getByRole('button', { name: /Backup Everything/ }));

      const parsed = JSON.parse(await capture.getBlob().text());
      expect(parsed.portfolioHoldings).toEqual([]);
      // premiumJwt is a deliberately-included field since the consolidation
      // phase (changelog #48) -- a real credential DOES travel in the
      // backup now, precisely so restoring one doesn't require re-pasting
      // it by hand. This just confirms the field is null, not omitted or
      // fabricated, when no credential is active on this browser -- it is
      // no longer testing "never included," which stopped being true on
      // purpose.
      expect(parsed.premiumJwt).toBeNull();
    } finally {
      capture.restore();
    }
  });

  it('includes liquidations from localStorage in the exported backup JSON', async () => {
    const user = userEvent.setup({ delay: null });
    localStorage.setItem(LIQUIDATIONS_KEY, JSON.stringify([
      { id: 'liq-1', symbol: 'AAPL', sharesSold: 5, realizedGainDollars: 50 },
    ]));
    const capture = captureExportedBlob();
    try {
      renderWithSimulation(<PreferencesTab />);
      await user.click(screen.getByRole('button', { name: /Backup Everything/ }));

      const parsed = JSON.parse(await capture.getBlob().text());
      expect(parsed.liquidations).toHaveLength(1);
      expect(parsed.liquidations[0]).toMatchObject({ symbol: 'AAPL', sharesSold: 5 });
    } finally {
      capture.restore();
    }
  });

  // Import JSON (this panel) delegates to the same applyFullBackupToStorage
  // used by the Sidebar's Restore Backup -- see LedgerTab.jsx's
  // handleImportBackup. It confirms via showConfirm (auto-resolves true by
  // default, see testUtils.jsx) and then reloads the page; it does NOT show
  // a post-import showAlert message the way an earlier version of this
  // handler once did, so these tests check the actual localStorage
  // side-effect instead of a success-message string.
  it('Import JSON restores holdings and liquidations from a backup file when this browser is premium', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<PreferencesTab />, {}, { isPremium: true });

    const backupFile = new File(
      [JSON.stringify({
        version: '1.0',
        schemaVersion: 1,
        activeInputs: DEFAULT_INPUTS,
        savedScenarios: [],
        portfolioHoldings: [{ id: 'h1', symbol: 'VTI', shares: 5, taxTreatment: 'taxable' }],
        liquidations: [{ id: 'liq-1', symbol: 'VTI', sharesSold: 5, realizedGainDollars: 25 }],
      })],
      'backup.json',
      { type: 'application/json' }
    );
    // Preferences wraps its hidden file input in a <button> rather than a
    // <label>, so there's no accessible label to query by -- go at the
    // input directly.
    await user.upload(document.querySelector('input[type="file"]'), backupFile);

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(HOLDINGS_KEY));
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ symbol: 'VTI', shares: 5, id: 'h1' });
    });
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(LIQUIDATIONS_KEY));
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ symbol: 'VTI', id: 'liq-1' });
    });
  });

  it('Import JSON leaves existing holdings and liquidations untouched when the backup file predates Detailed Holdings support', async () => {
    const user = userEvent.setup({ delay: null });
    localStorage.setItem(HOLDINGS_KEY, JSON.stringify([{ id: 'existing', symbol: 'MSFT', shares: 3, taxTreatment: 'taxable' }]));
    localStorage.setItem(LIQUIDATIONS_KEY, JSON.stringify([{ id: 'existing-liq', symbol: 'MSFT', sharesSold: 2 }]));
    renderWithSimulation(<PreferencesTab />, {}, { isPremium: true });

    const oldFormatBackup = new File(
      [JSON.stringify({ version: '1.0', schemaVersion: 1, activeInputs: DEFAULT_INPUTS, savedScenarios: [] })],
      'old-backup.json',
      { type: 'application/json' }
    );
    await user.upload(document.querySelector('input[type="file"]'), oldFormatBackup);

    // activeInputs is always restored (it's present in this file), so wait
    // on that landing before asserting the holdings/liquidations keys were
    // never touched -- otherwise this could pass trivially before the
    // import handler has actually run.
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('retire_plan_inputs')).schemaVersion).toBeDefined();
    });
    expect(JSON.parse(localStorage.getItem(HOLDINGS_KEY))).toEqual([{ id: 'existing', symbol: 'MSFT', shares: 3, taxTreatment: 'taxable' }]);
    expect(JSON.parse(localStorage.getItem(LIQUIDATIONS_KEY))).toEqual([{ id: 'existing-liq', symbol: 'MSFT', sharesSold: 2 }]);
  });

  // Direct coverage for "what happens to a linked/premium restore path if
  // premium isn't active" -- see fullBackup.js's willRestorePremiumHoldings
  // and calculator.js's initialBalancesSource comment. Restoring a backup
  // is NOT premium-gated as a whole (anyone can Restore/Import), but the
  // premium-only portfolioHoldings/liquidations fields specifically are
  // skipped when this browser isn't (and won't become, via this same
  // restore) premium, so a lapsed user's existing Detailed Holdings data
  // -- which they have no tab to inspect or edit right now -- can't be
  // silently overwritten by an unrelated file they're restoring for its
  // plan/scenario data.
  it('Import JSON skips restoring holdings and liquidations when this browser is not premium, even though the file has them', async () => {
    const user = userEvent.setup({ delay: null });
    localStorage.setItem(HOLDINGS_KEY, JSON.stringify([{ id: 'existing', symbol: 'MSFT', shares: 3, taxTreatment: 'taxable' }]));
    const showConfirm = vi.fn().mockResolvedValue(true);
    renderWithSimulation(<PreferencesTab />, { scenarios: [], showConfirm }, { isPremium: false });

    const backupFile = new File(
      [JSON.stringify({
        version: '1.0',
        schemaVersion: 1,
        activeInputs: DEFAULT_INPUTS,
        savedScenarios: [],
        portfolioHoldings: [{ id: 'h1', symbol: 'VTI', shares: 5, taxTreatment: 'taxable' }],
        liquidations: [{ id: 'liq-1', symbol: 'VTI', sharesSold: 5, realizedGainDollars: 25 }],
      })],
      'backup.json',
      { type: 'application/json' }
    );
    await user.upload(document.querySelector('input[type="file"]'), backupFile);

    // The confirm dialog itself should warn about the skip before the user
    // commits to it, not just skip silently.
    await waitFor(() => {
      expect(showConfirm).toHaveBeenCalledWith(
        expect.stringContaining("Premium Access isn't active on this browser, so that part will be skipped"),
        expect.anything()
      );
    });
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('retire_plan_inputs')).schemaVersion).toBeDefined();
    });
    // Existing holdings untouched; the file's holdings never landed. (The
    // real usePortfolioHoldings() hook mounted alongside this component
    // writes its own [] default for liquidations on mount regardless of
    // import, so "untouched" here means still empty, not still absent.)
    expect(JSON.parse(localStorage.getItem(HOLDINGS_KEY))).toEqual([{ id: 'existing', symbol: 'MSFT', shares: 3, taxTreatment: 'taxable' }]);
    expect(JSON.parse(localStorage.getItem(LIQUIDATIONS_KEY))).toEqual([]);
  });

  it('Import JSON still restores holdings when this browser is not currently premium but the backup file itself carries a Premium Access credential', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<PreferencesTab />, {}, { isPremium: false });

    const backupFile = new File(
      [JSON.stringify({
        version: '1.0',
        schemaVersion: 1,
        activeInputs: DEFAULT_INPUTS,
        savedScenarios: [],
        portfolioHoldings: [{ id: 'h1', symbol: 'VTI', shares: 5, taxTreatment: 'taxable' }],
        premiumJwt: 'good.jwt.token',
      })],
      'backup.json',
      { type: 'application/json' }
    );
    await user.upload(document.querySelector('input[type="file"]'), backupFile);

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(HOLDINGS_KEY));
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ symbol: 'VTI', shares: 5, id: 'h1' });
    });
    expect(localStorage.getItem('cfe_premium_jwt')).toBe('good.jwt.token');
  });

  it('a Premium key in the file that does not verify is not restored and does not unlock its holdings', async () => {
    const user = userEvent.setup({ delay: null });
    localStorage.setItem('cfe_premium_jwt', 'working.key.here');
    const showConfirm = vi.fn().mockResolvedValue(true);
    renderWithSimulation(<PreferencesTab />, { showConfirm }, { isPremium: false });
    const backupFile = new File(
      [JSON.stringify({
        schemaVersion: 1,
        activeInputs: { ...DEFAULT_INPUTS, lifestyleExpense: 45678 },
        portfolioHoldings: [{ id: 'h1', symbol: 'VTI', shares: 5, taxTreatment: 'taxable' }],
        premiumJwt: 'forged.jwt.token',
      })],
      'backup.json',
      { type: 'application/json' }
    );
    await user.upload(document.querySelector('input[type="file"]'), backupFile);
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('retire_plan_inputs')).inputs.lifestyleExpense).toBe(45678);
    });
    expect(showConfirm).toHaveBeenCalledWith(expect.stringContaining("isn't valid (or has expired), so it won't be restored"), expect.anything());
    expect(localStorage.getItem('cfe_premium_jwt')).toBe('working.key.here');
    expect(JSON.parse(localStorage.getItem(HOLDINGS_KEY) || '[]')).toEqual([]);
    localStorage.removeItem('cfe_premium_jwt');
  });

  it('shows both Live Pricing links and restores them only when the switch is on', async () => {
    const user = userEvent.setup({ delay: null });
    const good = { csvUrl: 'https://docs.google.com/spreadsheets/d/e/x/pub?output=csv', scriptUrl: 'https://script.google.com/macros/s/x/exec' };
    const upload = async (answer) => {
      const showConfirm = vi.fn().mockResolvedValue(answer);
      const view = renderWithSimulation(<PreferencesTab />, { showConfirm });
      const file = new File([JSON.stringify({ schemaVersion: 1, activeInputs: DEFAULT_INPUTS, pricingSource: { csvUrl: '', scriptUrl: good.scriptUrl } })], 'b.json', { type: 'application/json' });
      await user.upload(document.querySelector('input[type="file"]'), file);
      await waitFor(() => expect(showConfirm).toHaveBeenCalled());
      view.unmount();
      return showConfirm;
    };
    localStorage.removeItem('cfe_premium_pricing_source_v1');
    const off = await upload({ confirmed: true, toggle: false });
    const [message, opts] = off.mock.calls[0];
    expect(message).toContain(`Apps Script: ${good.scriptUrl}`);
    expect(message).toContain('Sheet CSV: (none)');
    expect(opts.toggle.label).toBe('Also restore my Live Pricing connection');
    expect(opts.toggle.defaultOn).toBe(false);
    await waitFor(() => expect(localStorage.getItem('retire_plan_inputs')).not.toBeNull());
    expect(localStorage.getItem('cfe_premium_pricing_source_v1')).toBeNull();
    await upload({ confirmed: true, toggle: true });
    await waitFor(() => expect(JSON.parse(localStorage.getItem('cfe_premium_pricing_source_v1') || '{}').scriptUrl).toBe(good.scriptUrl));
    localStorage.removeItem('cfe_premium_pricing_source_v1');
  });

  // Regression guard for the drift that motivated extracting
  // useFullBackupActions: the Sidebar and Ledger copies passed a
  // projectionSummary into downloadFullBackup() and this one didn't, so the
  // same labeled action produced a materially different file depending on
  // which button you happened to press.
  it('includes projectionSummary, the same as every other backup entry point', async () => {
    const user = userEvent.setup({ delay: null });
    const capture = captureExportedBlob();
    try {
      renderWithSimulation(<PreferencesTab />, {
        kpis: { peak: 1234567, ending: 89012, isSuccessful: true, initialNestEgg: 1000 },
      });
      await user.click(screen.getByRole('button', { name: /Backup Everything/ }));
      const parsed = JSON.parse(await capture.getBlob().text());
      expect(parsed.projectionSummary).toEqual({
        peakPortfolioWorth: 1234567,
        endingBalance: 89012,
        isSuccessful: true,
      });
    } finally {
      capture.restore();
    }
  });
});

describe('PreferencesTab — linked save file', () => {
  afterEach(() => {
    cloudMock.supported = true;
    cloudMock.handle = null;
  });

  // The single most important assertion here. Offering a disabled "save to
  // a file" control on iOS or in the mobile app would advertise a
  // capability those browsers will never gain, on the exact page a worried
  // user visits to find out how to keep their data safe.
  it('renders nothing at all where the File System Access API is unsupported', () => {
    cloudMock.supported = false;
    renderWithSimulation(<PreferencesTab />);

    expect(screen.queryByText(/Save to a file in your cloud folder/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Choose a File/ })).not.toBeInTheDocument();
    // ...while the universal path is untouched, which is the whole reason
    // hiding this is acceptable rather than a loss of function.
    expect(screen.getByText('Backup Everything')).toBeInTheDocument();
  });

  it('offers the picker when supported and nothing is linked yet', async () => {
    renderWithSimulation(<PreferencesTab />);
    expect(screen.getByText(/Save to a file in your cloud folder/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Choose a File/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save Now/ })).not.toBeInTheDocument();
  });

  it('shows the filename and the save controls once a file is linked', async () => {
    cloudMock.handle = { name: 'my-plan.json' };
    renderWithSimulation(<PreferencesTab />);

    expect(await screen.findByText('my-plan.json')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Now/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unlink/ })).toBeInTheDocument();
    // Nothing has been written yet this session, and a linked file must not
    // be allowed to imply otherwise.
    expect(screen.getByText(/Not saved yet this session/)).toBeInTheDocument();
  });

  it('is available without Premium -- recovery is never paywalled', async () => {
    renderWithSimulation(<PreferencesTab />, {}, { isPremium: false, tier: 'free' });
    expect(await screen.findByRole('button', { name: /Choose a File/ })).toBeInTheDocument();
  });

  // Guard against the pattern this session kept turning up: a working
  // function exported but wired to no control, so it can never run.
  it('offers restore from the linked file, not just save to it', async () => {
    cloudMock.handle = { name: 'my-plan.json' };
    renderWithSimulation(<PreferencesTab />);
    await screen.findByText('my-plan.json');
    expect(screen.getByRole('button', { name: /Restore From It/ })).toBeInTheDocument();
  });

  // The copy fix. Someone without a sync client would otherwise pick a
  // file, see "Saved", and believe they had a cloud backup while holding a
  // purely local file -- false confidence on the one feature whose whole
  // job is preventing data loss.
  it('states the sync-app requirement up front, and admits it cannot verify it', () => {
    renderWithSimulation(<PreferencesTab />);
    expect(screen.getByText(/only reaches the cloud if you already sync a folder/i)).toBeInTheDocument();
    expect(screen.getByText(/can.t check that for you/i)).toBeInTheDocument();
  });

  it('points the user at their cloud service to confirm the first save landed', async () => {
    const user = userEvent.setup({ delay: null });
    cloudMock.handle = { name: 'my-plan.json' };
    renderWithSimulation(<PreferencesTab />);
    await screen.findByText('my-plan.json');

    // No verification nudge before a save has happened -- there would be
    // nothing to look for yet.
    expect(screen.queryByText(/drive\.google\.com/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save Now/ }));
    await waitFor(() => expect(screen.getByText(/drive\.google\.com/)).toBeInTheDocument());
  });

  // The warning tells people they need a sync app. Without this it never
  // told them how to get one -- a dead end on the page that just told them
  // their data isn't safe.
  it('explains how to set up a sync folder, collapsed by default', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<PreferencesTab />);

    const summary = screen.getByText(/How to set one up/i);
    expect(summary).toBeInTheDocument();

    // Asserted on the <details> element's own open state, not on whether
    // the links are in the DOM: a collapsed <details> still contains its
    // children and the browser hides them itself, which jsdom does not
    // emulate. Checking for absent children would pass for the wrong
    // reason in a real browser and fail here.
    const disclosure = summary.closest('details');
    expect(disclosure).toBeTruthy();
    expect(disclosure.open, 'should start collapsed -- most users already sync a folder').toBe(false);

    await user.click(summary);
    expect(disclosure.open).toBe(true);
    for (const name of [/Drive for desktop/i, /desktop app/i, /System Settings/i, /download it/i]) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('sends people to first-party support pages only, opened safely', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<PreferencesTab />);
    await user.click(screen.getByText(/How to set one up/i));
    // Scoped to the set-up disclosure: the tab's footer also links the
    // Terms and Privacy pages (same-origin, relative, same tab -- added
    // 2026-09-20), which this rule is not about and which made the whole
    // test throw on new URL('/terms.html').
    const disclosure = screen.getByText(/How to set one up/i).closest('details');
    const links = within(disclosure).getAllByRole('link');

    const hosts = links
      .map((a) => new URL(a.getAttribute('href')).host)
      .filter((h) => !h.endsWith('cashflowengine.app'));
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      // No download mirrors or marketing aggregators. This is an app about
      // someone's financial data telling them to install software.
      expect(host, `${host} is not a first-party support domain`).toMatch(
        /(^|\.)(google\.com|dropbox\.com|apple\.com|microsoft\.com)$/
      );
    }
    expect(links.length).toBe(4);
    for (const a of links) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
  });

  it('offers a no-install fallback rather than leaving the user stuck', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<PreferencesTab />);
    await user.click(screen.getByText(/How to set one up/i));
    expect(screen.getByText(/Don.t want to install anything/i)).toBeInTheDocument();
  });

  it('says the save is deliberate, and that unlinking leaves the file alone', async () => {
    cloudMock.handle = { name: 'my-plan.json' };
    renderWithSimulation(<PreferencesTab />);
    await screen.findByText('my-plan.json');
    expect(screen.getByText(/Saving is deliberate, not automatic/)).toBeInTheDocument();
    expect(screen.getByText(/file itself is left exactly where it is/)).toBeInTheDocument();
  });
});

// The disclaimer was unreachable after first visit: setShowDisclaimer was
// only ever called with `false`, so one click put the text permanently out
// of reach with no path back from anywhere in the app.
describe('PreferencesTab — disclaimer', () => {
  it('offers a way back to the disclaimer text', async () => {
    const user = userEvent.setup({ delay: null });
    const setShowDisclaimerReview = vi.fn();
    renderWithSimulation(<PreferencesTab />, { setShowDisclaimerReview });

    await user.click(screen.getByRole('button', { name: /Educational Tool Disclaimer/ }));
    // Opens the review copy, NOT the first-visit gate -- reusing that would
    // hide the whole app behind an overlay and re-prompt for acceptance of
    // terms already accepted.
    expect(setShowDisclaimerReview).toHaveBeenCalledWith(true);
  });
});
