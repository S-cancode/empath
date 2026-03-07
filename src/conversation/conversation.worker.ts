import { autoArchiveStaleConversations, deleteExpiredMessages } from "./conversation.service.js";

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
  console.log("Message retention worker started");
  retentionTimer = setInterval(async () => {
    try {
      const count = await deleteExpiredMessages(30);
      if (count > 0) {
        console.log(`Deleted ${count} expired messages`);
      }
    } catch (err) {
      console.error("Message retention worker error:", err);
    }
  }, RETENTION_INTERVAL_MS);
}

export function stopRetentionWorker(): void {
  if (retentionTimer) {
    clearInterval(retentionTimer);
    retentionTimer = null;
  }
  console.log("Message retention worker stopped");
}
