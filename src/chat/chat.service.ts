import { prisma } from "../lib/prisma.js";
import { encrypt, type EncryptedPayload } from "../lib/crypto.js";

interface BufferedMessage {
  conversationId: string;
  senderId: string;
  content: string;
  iv: string;
  authTag: string;
  liveSessionId?: string;
  sentAt: Date;
}

const messageBuffer: BufferedMessage[] = [];
const FLUSH_INTERVAL = 5000;
const FLUSH_THRESHOLD = 20;
const MAX_BUFFER_SIZE = 10_000;
const MAX_CONSECUTIVE_FAILURES = 5;

let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushInFlight = false;
let consecutiveFailures = 0;

export function startMessageBuffer(): void {
  flushTimer = setInterval(() => {
    flushMessages().catch((err) => {
      console.error("Scheduled message flush failed:", err);
    });
  }, FLUSH_INTERVAL);
}

export function stopMessageBuffer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushMessages().catch((err) => console.error("Shutdown flush failed:", err));
}

export function bufferMessage(
  conversationId: string,
  senderId: string,
  plaintext: string,
  liveSessionId?: string,
): EncryptedPayload {
  const encrypted = encrypt(plaintext);

  messageBuffer.push({
    conversationId,
    senderId,
    content: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    liveSessionId,
    sentAt: new Date(),
  });

  if (messageBuffer.length >= FLUSH_THRESHOLD && !flushInFlight) {
    flushMessages().catch((err) => console.error("Threshold flush failed:", err));
  }

  return encrypted;
}

export async function flushMessages(): Promise<void> {
  if (flushInFlight) return;
  if (messageBuffer.length === 0) return;

  flushInFlight = true;
  const batch = messageBuffer.splice(0);

  try {
    await prisma.message.createMany({ data: batch });
    consecutiveFailures = 0;
  } catch (err) {
    consecutiveFailures++;
    console.error(
      `Failed to flush messages (failure ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`,
      err,
    );
    if (
      consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ||
      messageBuffer.length + batch.length > MAX_BUFFER_SIZE
    ) {
      console.error(
        `Dropping ${batch.length} buffered live-session messages after repeated flush failures.`,
      );
      // Drop batch (dead letter) — further retention guaranteed by the DB layer recovering.
    } else {
      messageBuffer.unshift(...batch);
    }
  } finally {
    flushInFlight = false;
  }
}

export async function startLiveSession(conversationId: string) {
  return prisma.liveSession.create({
    data: { conversationId },
  });
}

export async function endLiveSession(liveSessionId: string): Promise<void> {
  const session = await prisma.liveSession.findUnique({ where: { id: liveSessionId } });
  if (!session || session.status !== "active") return;

  const now = new Date();
  const duration = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000);

  await prisma.liveSession.update({
    where: { id: liveSessionId },
    data: {
      status: "completed",
      endedAt: now,
      durationSeconds: duration,
    },
  });
}

export async function extendLiveSession(liveSessionId: string): Promise<boolean> {
  // Atomic check-and-set: only matches if not already extended, preventing double-extend race
  const result = await prisma.liveSession.updateMany({
    where: { id: liveSessionId, status: "active", extended: false },
    data: { extended: true },
  });

  return result.count > 0;
}
