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

let flushTimer: ReturnType<typeof setInterval> | null = null;

export function startMessageBuffer(): void {
  flushTimer = setInterval(flushMessages, FLUSH_INTERVAL);
}

export function stopMessageBuffer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushMessages();
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

  if (messageBuffer.length >= FLUSH_THRESHOLD) {
    flushMessages();
  }

  return encrypted;
}

async function flushMessages(): Promise<void> {
  if (messageBuffer.length === 0) return;

  const batch = messageBuffer.splice(0);

  try {
    await prisma.message.createMany({ data: batch });
  } catch (err) {
    console.error("Failed to flush messages:", err);
    messageBuffer.unshift(...batch);
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
  const session = await prisma.liveSession.findUnique({ where: { id: liveSessionId } });
  if (!session || session.status !== "active" || session.extended) return false;

  await prisma.liveSession.update({
    where: { id: liveSessionId },
    data: { extended: true },
  });

  return true;
}
