import Redis from "ioredis";
import { redis } from "../lib/redis.js";
import { config } from "../config/index.js";
import { tryMatchAllPairs, cleanupStaleEntries } from "./matching.service.js";

const FALLBACK_POLL_MS = 5000;
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const QUEUE_UPDATED_CHANNEL = "queue:updated";
const MATCH_DECLINED_CHANNEL = "match:declined";

let running = false;
let lastCleanup = Date.now();
let subscriber: Redis | null = null;
let fallbackTimer: NodeJS.Timeout | null = null;
let ticking = false;

async function runTick(): Promise<void> {
  if (!running || ticking) return;
  ticking = true;
  try {
    const results = await tryMatchAllPairs();
    for (const result of results) {
      await redis.publish("match:created", JSON.stringify(result));
    }

    if (Date.now() - lastCleanup > CLEANUP_INTERVAL) {
      const cleaned = await cleanupStaleEntries();
      if (cleaned > 0) console.log(`Cleaned ${cleaned} stale queue entries`);
      lastCleanup = Date.now();
    }
  } catch (err) {
    console.error("Matching worker error:", err);
  } finally {
    ticking = false;
  }
}

export async function startMatchingWorker(): Promise<void> {
  running = true;

  // Dedicated subscriber connection — ioredis rejects other commands in subscribe mode.
  subscriber = new Redis(config.REDIS_URL);
  await subscriber.subscribe(QUEUE_UPDATED_CHANNEL, MATCH_DECLINED_CHANNEL);
  subscriber.on("message", () => {
    void runTick();
  });
  subscriber.on("error", (err) => {
    console.error("[match] subscriber error:", err);
  });

  // Safety-net poll — catches missed pub/sub events and drives the periodic cleanup.
  const pollTick = async () => {
    if (!running) return;
    await runTick();
    if (running) fallbackTimer = setTimeout(pollTick, FALLBACK_POLL_MS);
  };
  fallbackTimer = setTimeout(pollTick, FALLBACK_POLL_MS);

  console.log("Matching worker started (event-driven + 5s fallback)");
}

export function stopMatchingWorker(): void {
  running = false;
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  if (subscriber) {
    void subscriber.quit();
    subscriber = null;
  }
  console.log("Matching worker stopped");
}
