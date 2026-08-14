import Redis from "ioredis";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { config } from "../config/index.js";
import { getIoInstance } from "./safety.service.js";
import { revokeUserSessions } from "../auth/auth.service.js";
import { evictFromMatching } from "../matching/matching.service.js";
import { invalidateComplianceCache } from "../compliance/compliance-gate.service.js";

// disconnectSockets() only reaches sockets on the local instance (no Socket.IO
// Redis adapter is installed), so enforcement broadcasts over Redis and every
// instance closes its own sockets for the user.
const DISCONNECT_CHANNEL = "moderation:disconnect";

let subscriber: Redis | null = null;

function disconnectLocalSockets(userId: string): void {
  getIoInstance()?.in(`user:${userId}`).disconnectSockets(true);
}

/**
 * Force-close a user's sockets on every instance. Local sockets close
 * immediately; other instances act on the Redis broadcast. The handshake
 * ban check in the chat gateway stops reconnects.
 */
export function disconnectUserSockets(userId: string): void {
  disconnectLocalSockets(userId);
  redis.publish(DISCONNECT_CHANNEL, userId).catch((err) => {
    console.error("[enforcement] Failed to publish disconnect:", err);
  });
}

/**
 * The only path for banning a user: sets the flag, blocks their
 * conversations, and closes their sockets everywhere. Any future ban
 * source (e.g. classifier auto-bans) must go through here.
 */
export async function applyBan(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { banned: true } });
  await prisma.conversation.updateMany({
    where: {
      status: { in: ["active", "archived"] },
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    data: { status: "blocked" },
  });
  await revokeUserSessions(userId);
  await evictFromMatching(userId);
  invalidateComplianceCache(userId);
  disconnectUserSockets(userId);
}

/**
 * The only path for suspending a user: sets suspendedUntil and closes
 * their sockets everywhere.
 */
export async function applySuspension(userId: string, until: Date): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { suspendedUntil: until },
  });
  await revokeUserSessions(userId);
  await evictFromMatching(userId);
  invalidateComplianceCache(userId);
  disconnectUserSockets(userId);
}

/** The only path for lifting a suspension early (e.g. escalation resolved in the user's favour). */
export async function liftSuspension(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { suspendedUntil: null },
  });
}

export async function startEnforcementSubscriber(): Promise<void> {
  // Dedicated subscriber connection — ioredis rejects other commands in subscribe mode.
  subscriber = new Redis(config.REDIS_URL);
  await subscriber.subscribe(DISCONNECT_CHANNEL);
  subscriber.on("message", (channel: string, userId: string) => {
    if (channel === DISCONNECT_CHANNEL) disconnectLocalSockets(userId);
  });
  subscriber.on("error", (err) => {
    console.error("[enforcement] subscriber error:", err);
  });
}

export function stopEnforcementSubscriber(): void {
  if (subscriber) {
    void subscriber.quit();
    subscriber = null;
  }
}
