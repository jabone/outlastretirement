// dataFreshness reads and writes real localStorage, so opt into jsdom the
// same way fullBackup.test.js does.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  FRESHNESS_KEY,
  BACKUP_NUDGE_DAYS,
  SNOOZE_DAYS,
  CADENCE_DAYS,
  DEFAULT_CADENCE,
  getFreshnessState,
  recordPlanChange,
  recordBackup,
  recordPortfolioUpdate,
  setPortfolioReminderCadence,
  snoozeBackupNudge,
  snoozePortfolioNudge,
  computeFreshnessStatus,
  formatAgeDays,
  requestPersistentStorage,
} from '../utils/dataFreshness';
import { buildFullBackupPayload, applyFullBackupToStorage } from '../utils/fullBackup';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-08-23T12:00:00Z').getTime();

// Covers the "keep the data real" reminders (added 2026-08-23): the
// backup-staleness nudge (14 days with unsaved changes) and the portfolio
// freshness reminder (monthly/quarterly cadence), plus their integration
// with Backup Everything. See dataFreshness.js's header for the design.
describe('dataFreshness', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('seeding and grace windows', () => {
    it('seeds firstSeenAt on first touch, so day-one users are never nagged', () => {
      const s = getFreshnessState(T0);
      expect(s.firstSeenAt).toBe(T0);
      expect(s.portfolioReminderCadence).toBe(DEFAULT_CADENCE);
      const status = computeFreshnessStatus({ now: T0 });
      expect(status.backupOverdue).toBe(false);
      expect(status.portfolioOverdue).toBe(false);
    });

    it('keeps the original firstSeenAt on later reads', () => {
      getFreshnessState(T0);
      expect(getFreshnessState(T0 + 5 * DAY).firstSeenAt).toBe(T0);
    });
  });

  describe('backup-staleness nudge', () => {
    it('never fires without plan changes, no matter how old', () => {
      getFreshnessState(T0);
      const status = computeFreshnessStatus({ now: T0 + 400 * DAY });
      expect(status.backupOverdue).toBe(false);
    });

    it('fires when changes exist and no backup has happened for over 14 days', () => {
      getFreshnessState(T0);
      recordPlanChange(T0 + DAY);
      expect(computeFreshnessStatus({ now: T0 + BACKUP_NUDGE_DAYS * DAY }).backupOverdue).toBe(false);
      expect(computeFreshnessStatus({ now: T0 + (BACKUP_NUDGE_DAYS + 2) * DAY }).backupOverdue).toBe(true);
    });

    it('is satisfied by a backup, and only re-arms after NEW changes age past the window', () => {
      getFreshnessState(T0);
      recordPlanChange(T0 + DAY);
      recordBackup(T0 + 2 * DAY);
      // Old change is older than the backup: quiet forever.
      expect(computeFreshnessStatus({ now: T0 + 100 * DAY }).backupOverdue).toBe(false);
      // A new change after the backup re-arms the clock, measured from
      // the BACKUP, not the change.
      recordPlanChange(T0 + 3 * DAY);
      expect(computeFreshnessStatus({ now: T0 + 10 * DAY }).backupOverdue).toBe(false);
      expect(computeFreshnessStatus({ now: T0 + 17 * DAY }).backupOverdue).toBe(true);
    });

    it('snoozes for a week, then returns', () => {
      getFreshnessState(T0);
      recordPlanChange(T0 + DAY);
      const nagTime = T0 + 20 * DAY;
      expect(computeFreshnessStatus({ now: nagTime }).backupOverdue).toBe(true);
      snoozeBackupNudge(nagTime);
      expect(computeFreshnessStatus({ now: nagTime + (SNOOZE_DAYS - 1) * DAY }).backupOverdue).toBe(false);
      expect(computeFreshnessStatus({ now: nagTime + (SNOOZE_DAYS + 1) * DAY }).backupOverdue).toBe(true);
    });

    it('throttles plan-change writes to one per minute', () => {
      getFreshnessState(T0);
      recordPlanChange(T0 + 1000);
      recordPlanChange(T0 + 2000); // within a minute -- ignored
      expect(getFreshnessState().lastPlanChangeAt).toBe(T0 + 1000);
      recordPlanChange(T0 + 70 * 1000);
      expect(getFreshnessState().lastPlanChangeAt).toBe(T0 + 70 * 1000);
    });
  });

  describe('portfolio-freshness reminder', () => {
    it('uses the quarterly window by default and fires when it lapses', () => {
      getFreshnessState(T0);
      recordPortfolioUpdate(T0);
      const limit = CADENCE_DAYS.quarterly;
      expect(computeFreshnessStatus({ now: T0 + limit * DAY }).portfolioOverdue).toBe(false);
      expect(computeFreshnessStatus({ now: T0 + (limit + 2) * DAY }).portfolioOverdue).toBe(true);
    });

    it('respects the monthly and off cadences', () => {
      getFreshnessState(T0);
      recordPortfolioUpdate(T0);
      setPortfolioReminderCadence('monthly');
      expect(computeFreshnessStatus({ now: T0 + 32 * DAY }).portfolioOverdue).toBe(true);
      setPortfolioReminderCadence('off');
      expect(computeFreshnessStatus({ now: T0 + 400 * DAY }).portfolioOverdue).toBe(false);
    });

    it('rejects an unknown cadence rather than storing it', () => {
      getFreshnessState(T0);
      setPortfolioReminderCadence('hourly');
      expect(getFreshnessState().portfolioReminderCadence).toBe(DEFAULT_CADENCE);
    });

    it('resets on a recorded update and clears any snooze', () => {
      getFreshnessState(T0);
      const late = T0 + 100 * DAY;
      expect(computeFreshnessStatus({ now: late }).portfolioOverdue).toBe(true);
      snoozePortfolioNudge(late);
      recordPortfolioUpdate(late + DAY);
      const s = getFreshnessState();
      expect(s.lastPortfolioUpdateAt).toBe(late + DAY);
      expect(s.portfolioSnoozedUntil).toBeNull();
      expect(computeFreshnessStatus({ now: late + 2 * DAY }).portfolioOverdue).toBe(false);
    });

    it('carries hasHoldings through for the banner to phrase its ask', () => {
      getFreshnessState(T0);
      expect(computeFreshnessStatus({ now: T0, hasHoldings: true }).hasHoldings).toBe(true);
      expect(computeFreshnessStatus({ now: T0 }).hasHoldings).toBe(false);
    });
  });

  describe('integration with Backup Everything', () => {
    it('includes the freshness record in the payload', () => {
      getFreshnessState(T0);
      recordPortfolioUpdate(T0 + DAY);
      const payload = buildFullBackupPayload();
      expect(payload.dataFreshness.lastPortfolioUpdateAt).toBe(T0 + DAY);
      expect(payload.dataFreshness.portfolioReminderCadence).toBe(DEFAULT_CADENCE);
    });

    it('restore adopts the file\'s portfolio clock but restarts the backup clock', () => {
      getFreshnessState(T0);
      const fileFreshness = {
        firstSeenAt: T0 - 200 * DAY,
        lastPortfolioUpdateAt: T0 - 50 * DAY,
        portfolioReminderCadence: 'monthly',
        lastBackupAt: T0 - 40 * DAY,
      };
      applyFullBackupToStorage({ activeInputs: undefined, dataFreshness: fileFreshness });
      const s = getFreshnessState();
      // Portfolio date restored as-is: restoring a stale plan does not
      // make its numbers current.
      expect(s.lastPortfolioUpdateAt).toBe(T0 - 50 * DAY);
      expect(s.portfolioReminderCadence).toBe('monthly');
      // Backup clock restarts at the restore moment (>= the old date).
      expect(s.lastBackupAt).toBeGreaterThan(T0 - 40 * DAY);
    });

    it('tolerates an older backup file with no freshness record at all', () => {
      getFreshnessState(T0);
      recordPortfolioUpdate(T0 + DAY);
      applyFullBackupToStorage({ activeInputs: undefined });
      const s = getFreshnessState();
      expect(s.lastPortfolioUpdateAt).toBe(T0 + DAY); // untouched
      expect(s.lastBackupAt).not.toBeNull();          // restore counts as a backup
    });

    it('recordBackup clears the backup snooze', () => {
      getFreshnessState(T0);
      recordPlanChange(T0 + DAY);
      snoozeBackupNudge(T0 + 20 * DAY);
      recordBackup(T0 + 21 * DAY);
      expect(getFreshnessState().backupSnoozedUntil).toBeNull();
    });
  });

  describe('formatAgeDays', () => {
    it('is deliberately coarse', () => {
      expect(formatAgeDays(0)).toBe('today');
      expect(formatAgeDays(1)).toBe('yesterday');
      expect(formatAgeDays(12)).toBe('12 days ago');
      expect(formatAgeDays(95)).toBe('3 months ago');
    });
  });

  describe('requestPersistentStorage', () => {
    it('resolves false rather than throwing when the API is missing (jsdom has none)', async () => {
      await expect(requestPersistentStorage()).resolves.toBe(false);
    });
  });

  it('survives a corrupted stored value by reseeding', () => {
    localStorage.setItem(FRESHNESS_KEY, '{not json');
    const s = getFreshnessState(T0);
    expect(s.firstSeenAt).toBe(T0);
  });
});
