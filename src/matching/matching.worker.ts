import { redis } from "../lib/redis.js";
import { tryMatchInCategory } from "./matching.service.js";

const POLL_INTERVAL = 500;
const QUEUE_PREFIX = "match:queue:";

let running = false;

export async function startMatchingWorker(): Promise<void> {
  running = true;
  console.log("Matching worker started");

  while (running) {
    try {
      const keys = await redis.keys(`${QUEUE_PREFIX}*`);
      for (const key of keys) {
        const category = key.replace(QUEUE_PREFIX, "");
        const result = await tryMatchInCategory(category);
        if (result) {
          // Publish match event for Socket.IO to pick up
          await redis.publish("match:created", JSON.stringify(result));
        }
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
