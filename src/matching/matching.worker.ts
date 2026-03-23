import { redis } from "../lib/redis.js";
import { tryMatchGlobal, cleanupStaleEntries } from "./matching.service.js";

const POLL_INTERVAL = 500;
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

let running = false;
let lastCleanup = Date.now();

export async function startMatchingWorker(): Promise<void> {
  running = true;
  console.log("Matching worker started");

  while (running) {
    try {
      const result = await tryMatchGlobal();
      if (result) {
        await redis.publish("match:created", JSON.stringify(result));
      }

      // Periodic stale entry cleanup
      if (Date.now() - lastCleanup > CLEANUP_INTERVAL) {
        const cleaned = await cleanupStaleEntries();
        if (cleaned > 0) console.log(`Cleaned ${cleaned} stale queue entries`);
        lastCleanup = Date.now();
      }
    } catch (err) {
      console.error("Matching worker error:", err);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

export function stopMatchingWorker(): void {
  running = false;
  console.log("Matching worker stopped");
}
