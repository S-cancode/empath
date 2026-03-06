import { autoArchiveStaleConversations } from "./conversation.service.js";

const AUTO_ARCHIVE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let timer: ReturnType<typeof setInterval> | null = null;

export function startAutoArchiveWorker(): void {
  console.log("Auto-archive worker started");
  timer = setInterval(async () => {
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
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  console.log("Auto-archive worker stopped");
}
