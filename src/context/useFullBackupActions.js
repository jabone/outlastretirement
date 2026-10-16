// The one implementation of "back up everything" / "restore everything".
//
// Why this exists: those two actions had grown three separate copies --
// the Sidebar's always-visible buttons, Preferences > Your Data, and
// Ledger & Scenarios' "Export JSON" / "Import JSON". All three called into
// fullBackup.js, so the *file format* never diverged, but the call sites
// did: the Sidebar and Ledger copies passed a `projectionSummary` (peak
// balance, ending balance, success flag) into downloadFullBackup(), and
// the Preferences copy silently didn't. Same button, same label, same
// promise -- and a measurably different file depending on which one you
// clicked.
//
// That's the failure mode duplicated actions actually produce. Not "the
// code is repetitive", but "one copy quietly stopped matching the others
// and nothing said so." Hoisting it here means there is exactly one answer
// to what a backup contains, and adding a field to the payload can't
// reach two of the three entry points.
//
// Deliberately a hook rather than a plain util: both callers need `kpis`
// (for the projection summary), `showAlert`/`showConfirm` (for the
// preview and the destructive-restore confirmation), and `isPremium`
// (which decides whether holdings data in the file is applied at all --
// see willRestorePremiumHoldings). Threading five things through a
// function signature at every call site is how copies drift in the first
// place.
import { useSimulation } from './useSimulation';
import { useEntitlement } from './useEntitlement';
import {
  downloadFullBackup,
  downloadEncryptedFullBackup,
  parseFullBackupFile,
  assertBackupShape,
  applyFullBackupToStorage,
  summarizeBackupPayload,
  willRestorePremiumHoldings,
  buildFullBackupPayload,
  describePricingSource,
  looksLikeJwt,
} from '../utils/fullBackup';
import { verifyPremiumJwt } from '../utils/premiumJwt';
import { isEncryptedBackup, decryptBackupPayload, WRONG_PASSWORD_ERROR } from '../utils/backupCrypto';
import {
  isSaveFileSupported,
  getLinkedFileHandle,
  clearLinkedFileHandle,
  pickSaveFile,
  ensureWritePermission,
  writePayloadToHandle,
  readFileFromHandle,
} from '../utils/cloudFileSync';
import { recordBackup } from '../utils/dataFreshness';
import { isDemoModeActive } from '../utils/demoMode';

// Shortest password the encrypted-backup prompt accepts. Not a strength
// policy -- the app cannot judge what the user is protecting against --
// just enough to refuse the "1" and "abc" that a hurried click produces
// and that an offline guess would open in seconds.
export const MIN_BACKUP_PASSWORD_LENGTH = 8;

export function useFullBackupActions() {
  const { kpis, showAlert, showConfirm, showPrompt } = useSimulation();
  const { isPremium } = useEntitlement();

  // `projectionSummary` is a snapshot of the headline figures at backup
  // time. It only ever exists as live React state (App.jsx's `kpis`), so
  // fullBackup.js can't read it itself -- it has to be passed in, which is
  // exactly the bit the Preferences copy used to omit.
  // Demo-mode guard, shared by every durable-copy path below: while the
  // Carters are loaded, backing up would put FICTIONAL data in a file the
  // user trusts (worst case: overwriting their linked cloud file's real
  // plan), and restoring would stomp the demo session confusingly. All
  // three refuse with the same explanation. Exit Demo is one click away.
  const refuseInDemoMode = (verb) => {
    if (!isDemoModeActive()) return false;
    showAlert(
      `You're exploring the demo plan, so ${verb} is paused -- it would use the fictional demo data, not your own plan. Click Exit Demo in the top banner first; your real plan comes back exactly as you left it.`,
      'Not While in Demo Mode'
    );
    return true;
  };

  const backupEverything = () => {
    if (refuseInDemoMode('backing up')) return null;
    const payload = downloadFullBackup({
      projectionSummary: {
        peakPortfolioWorth: kpis.peak,
        endingBalance: kpis.ending,
        isSuccessful: kpis.isSuccessful,
      },
    });
    showAlert(`Downloaded a backup containing ${summarizeBackupPayload(payload)}.`, 'Backup Saved');
    return payload;
  };

  // Password-protected variant of backupEverything (changelog 143). Asks
  // for the password twice -- a typo in a password nobody can recover is
  // the one failure this feature can produce, and confirming is the only
  // defense. Returns the plain payload, or null if the user backed out.
  const backupEverythingEncrypted = async () => {
    if (refuseInDemoMode('backing up')) return null;
    const first = await showPrompt(
      `Choose a password for this backup file. You will need it to restore from the file -- there is no way to recover a forgotten password, and no one (including OutlastRetirement) can open the file without it.\n\nAt least ${MIN_BACKUP_PASSWORD_LENGTH} characters.`,
      { title: 'Encrypted Backup', inputType: 'password', confirmLabel: 'Next' }
    );
    if (first === null || first === undefined) return null;
    if (first.length < MIN_BACKUP_PASSWORD_LENGTH) {
      showAlert(`That password is too short -- use at least ${MIN_BACKUP_PASSWORD_LENGTH} characters.`, 'Encrypted Backup');
      return null;
    }
    const second = await showPrompt(
      'Type the same password again to confirm it.',
      { title: 'Confirm Password', inputType: 'password', confirmLabel: 'Encrypt & Download' }
    );
    if (second === null || second === undefined) return null;
    if (second !== first) {
      showAlert("The two passwords didn't match. Nothing was downloaded -- try again.", 'Encrypted Backup');
      return null;
    }
    let payload;
    try {
      payload = await downloadEncryptedFullBackup(first, {
        projectionSummary: {
          peakPortfolioWorth: kpis.peak,
          endingBalance: kpis.ending,
          isSuccessful: kpis.isSuccessful,
        },
      });
    } catch (err) {
      showAlert(err.message, 'Encrypted Backup Failed');
      return null;
    }
    showAlert(
      `Downloaded a password-protected backup containing ${summarizeBackupPayload(payload)}.\n\nKeep the password somewhere safe: without it the file cannot be opened.`,
      'Encrypted Backup Saved'
    );
    return payload;
  };

  // Returns true if a restore actually ran. The caller doesn't need to do
  // anything with that -- a successful restore reloads the page -- but it
  // makes the "user canceled" path testable without stubbing reload.
  const restoreFromFile = async (file) => {
    if (refuseInDemoMode('restoring a backup')) return false;
    if (!file) return false;
    let parsed;
    try {
      parsed = await parseFullBackupFile(file);
    } catch (err) {
      showAlert(err.message, 'Restore Failed');
      return false;
    }

    // A password-protected file: ask, decrypt, then run the same shape
    // check a plain file gets. A wrong password re-prompts rather than
    // failing, since a typo is far likelier than the wrong file; Cancel
    // on the prompt ends the restore quietly.
    if (isEncryptedBackup(parsed)) {
      let opened = null;
      let message = 'This backup is password-protected. Enter its password to continue.';
      while (opened === null) {
        const password = await showPrompt(message, { title: 'Encrypted Backup', inputType: 'password', confirmLabel: 'Open' });
        if (password === null || password === undefined) return false;
        try {
          opened = await decryptBackupPayload(parsed, password);
        } catch (err) {
          if (err.name !== WRONG_PASSWORD_ERROR) {
            showAlert(err.message, 'Restore Failed');
            return false;
          }
          message = `${err.message}\n\nTry again, or Cancel.`;
        }
      }
      try {
        parsed = assertBackupShape(opened);
      } catch (err) {
        showAlert(err.message, 'Restore Failed');
        return false;
      }
    }

    // The whole file, summarized the same way the backup side does (it
    // counts only what a restore would keep).
    const preview = summarizeBackupPayload(parsed);

    // A Premium key in the file is only restored -- and only unlocks the
    // holdings below -- when its signature actually verifies. Writing a
    // bad or expired key would sign this browser out of one that works.
    const premiumKeyValid = looksLikeJwt(parsed.premiumJwt)
      ? (await verifyPremiumJwt(parsed.premiumJwt)).valid
      : false;

    // Holdings/liquidations are only applied when premium is active here,
    // or the file itself carries a working key. Say so before the user
    // commits, rather than letting them discover it afterwards.
    const restorePremiumData = willRestorePremiumHoldings(parsed, isPremium, premiumKeyValid);
    const premiumDataInFile =
      (Array.isArray(parsed.portfolioHoldings) && parsed.portfolioHoldings.length > 0) ||
      (Array.isArray(parsed.liquidations) && parsed.liquidations.length > 0);
    const skipNotice = (!restorePremiumData && premiumDataInFile)
      ? "\n\nNote: this file also has Detailed Holdings/Liquidations data, but Premium Access isn't active on this browser, so that part will be skipped -- whatever Detailed Holdings you already have here (if any) will be left as-is."
      : '';
    const keyNotice = (looksLikeJwt(parsed.premiumJwt) && !premiumKeyValid)
      ? "\n\nThe Premium Access key in this file isn't valid (or has expired), so it won't be restored. Any key already on this browser stays."
      : '';

    // Live Pricing points this browser at a Sheet, so it is never
    // re-pointed silently: both links are shown, and it is restored only
    // when the user switches it on here.
    const pricing = describePricingSource(parsed.pricingSource);
    const pricingNotice = pricing.present
      ? `\n\nThis file also has a Live Pricing connection:\nApps Script: ${pricing.scriptUrl || '(none)'}\nSheet CSV: ${pricing.csvUrl || '(none)'}${pricing.allowed ? '' : "\nThese aren't Google Sheet or Apps Script addresses, so they can't be restored."}`
      : '';

    const answer = await showConfirm(
      `This will replace everything currently in this browser with the backup's contents: ${preview}.${skipNotice}${keyNotice}${pricingNotice}\n\nThis cannot be undone -- if your current data isn't backed up separately, it will be lost. The page will reload once restore finishes.`,
      {
        title: 'Restore Backup',
        danger: true,
        confirmLabel: 'Restore & Reload',
        ...(pricing.present && pricing.allowed
          ? { toggle: { label: 'Also restore my Live Pricing connection', hint: 'Off keeps this browser\u2019s current Live Pricing links.', defaultOn: false } }
          : {}),
      }
    );
    if (!answer) return false;
    const restorePricingSource = typeof answer === 'object' && answer.toggle === true;

    // Validates every section first and writes all or nothing, so a bad
    // file leaves this browser exactly as it was.
    try {
      applyFullBackupToStorage(parsed, { isPremium, premiumKeyValid, restorePricingSource });
    } catch (err) {
      showAlert(err?.message || "This backup couldn't be restored. Your current data is unchanged.", 'Restore Failed');
      return false;
    }
    window.location.reload();
    return true;
  };

  // --- Linked save file (Premium) ---------------------------------
  //
  // Everything below writes the SAME payload backupEverything downloads,
  // via the same buildFullBackupPayload call. That is the whole point of
  // putting it in this hook rather than in the Preferences component: this
  // module exists because three copies of "back up everything" had already
  // drifted apart once (see the note at the top of this file), and a
  // fourth destination is exactly how it would happen again.
  //
  // Premium-gated at the UI, not here. Recovery itself is never paywalled
  // -- Backup Everything stays available to everyone, and a file written
  // here restores through the ordinary upload path on any browser. What
  // Premium buys is not having to do it by hand.
  const buildPayload = () => buildFullBackupPayload({
    projectionSummary: {
      peakPortfolioWorth: kpis.peak,
      endingBalance: kpis.ending,
      isSuccessful: kpis.isSuccessful,
    },
  });

  // Choose (or re-choose) the file. Returns the file's name, or null if
  // the user canceled the picker -- canceling is an ordinary outcome and
  // must not raise an alert.
  const linkSaveFile = async () => {
    if (!isSaveFileSupported()) {
      showAlert(
        "This browser can't save directly to a file. It needs the File System Access API, which today means a Chromium-based desktop browser (Chrome, Edge, Arc, Brave). Backup Everything works everywhere and produces the same file.",
        'Not Supported Here'
      );
      return null;
    }
    try {
      const picked = await pickSaveFile();
      if (!picked) return null;
      // Write immediately on linking. A "linked" file that is still empty
      // until some later click is a trap: the user has seen a filename in
      // their Drive folder and reasonably believes their plan is in it.
      await writePayloadToHandle(picked.handle, buildPayload());
      return picked.name;
    } catch (err) {
      showAlert(`Could not link that file: ${err.message}`, 'Save File Failed');
      return null;
    }
  };

  // The explicit Save. Returns true only if bytes actually reached disk,
  // so the caller can timestamp "last saved" on a real write rather than
  // on a click.
  const saveToLinkedFile = async () => {
    if (refuseInDemoMode('saving to your linked file')) return false;
    const handle = await getLinkedFileHandle();
    if (!handle) return false;
    try {
      if (!(await ensureWritePermission(handle))) {
        showAlert(
          "This browser needs permission to write to that file again. Choose \u201cAllow on every visit\u201d when prompted and it won't ask each time you reopen the app.",
          'Permission Needed'
        );
        return false;
      }
      await writePayloadToHandle(handle, buildPayload());
      // Bytes actually reached the linked file -- a durable copy, so it
      // resets the backup-staleness clock (dataFreshness.js) the same as
      // a download. downloadFullBackup records its own; this is the only
      // OTHER path that produces a real copy outside localStorage.
      recordBackup();
      return true;
    } catch (err) {
      // The common real-world cause is the file having been moved,
      // renamed or deleted out from under the handle -- say so, since
      // "NotFoundError" on its own explains nothing.
      showAlert(
        `Could not write to the linked file: ${err.message}. If you moved, renamed or deleted it, link it again.`,
        'Save Failed'
      );
      return false;
    }
  };

  // Restore from the linked file. Routes through the same
  // parseFullBackupFile/restoreFromFile path as an uploaded file so the
  // validation, the premium-holdings warning and the destructive-restore
  // confirmation are identical -- there is no second restore
  // implementation here, only a second way of getting hold of the File.
  const restoreFromLinkedFile = async () => {
    const handle = await getLinkedFileHandle();
    if (!handle) return false;
    try {
      if (!(await ensureWritePermission(handle))) return false;
      const file = await readFileFromHandle(handle);
      return await restoreFromFile(file);
    } catch (err) {
      showAlert(`Could not read the linked file: ${err.message}`, 'Restore Failed');
      return false;
    }
  };

  // Forgets the file. Deliberately does not delete or alter it -- it lives
  // in the user's own folder and may be their only copy.
  const unlinkSaveFile = async () => {
    await clearLinkedFileHandle();
  };

  return {
    backupEverything,
    backupEverythingEncrypted,
    restoreFromFile,
    isSaveFileSupported,
    getLinkedFileHandle,
    linkSaveFile,
    saveToLinkedFile,
    restoreFromLinkedFile,
    unlinkSaveFile,
  };
}
