import { autoArchiveStaleConversations, deleteExpiredMessages } from "./conversation.service.js";
import {
  deleteExpiredCrisisEvents,
  deleteExpiredReports,
  deleteExpiredTermsRecords,
  deleteExpiredConsentRecords,
} from "../compliance/compliance.service.js";

const AUTO_ARCHIVE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let archiveTimer: ReturnType<typeof setInterval> | null = null;
let retentionTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoArchiveWorker(): void {
  console.log("Auto-archive worker started");
  archiveTimer = setInterval(async () => {
    try {
      const count = await autoArchiveStaleConversations(7);
      if (count > 0) {
        console.log(`Auto-archived ${count} stale conversations`);
      }
    } catch (err) {
      console.error("Auto-archive worker error:", err);
    }
  }, AUTO_ARCHIVE_INTERVAL_MS);
}

export function stopAutoArchiveWorker(): void {
  if (archiveTimer) {
    clearInterval(archiveTimer);
    archiveTimer = null;
  }
  console.log("Auto-archive worker stopped");
}

export function startRetentionWorker(): void {
  console.log("Retention worker started");
  retentionTimer = setInterval(async () => {
    try {
      const msgCount = await deleteExpiredMessages(30);
      if (msgCount > 0) console.log(`Deleted ${msgCount} expired messages`);

      const crisisCount = await deleteExpiredCrisisEvents();
      if (crisisCount > 0) console.log(`Deleted ${crisisCount} expired crisis events`);

      const reportCount = await deleteExpiredReports();
      if (reportCount > 0) console.log(`Deleted ${reportCount} expired reports`);

      const termsCount = await deleteExpiredTermsRecords();
      if (termsCount > 0) console.log(`Deleted ${termsCount} expired terms records`);

      const consentCount = await deleteExpiredConsentRecords();
      if (consentCount > 0) console.log(`Deleted ${consentCount} expired consent records`);
    } catch (err) {
      console.error("Retention worker error:", err);
    }
  }, RETENTION_INTERVAL_MS);
}

export function stopRetentionWorker(): void {
  if (retentionTimer) {
    clearInterval(retentionTimer);
    retentionTimer = null;
  }
  console.log("Retention worker stopped");
}
