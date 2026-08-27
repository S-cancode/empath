import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { emitNotification } from "../notifications/notification.service.js";
import { isOnline } from "../presence/presence.service.js";
import { getTierLimits } from "../config/tiers.js";
import { NotFoundError, ForbiddenError, UpgradeRequiredError, ValidationError, ContentBlockedError } from "../shared/errors.js";
import { moderateText } from "../safety/content-moderation.service.js";
import { transcribeForModeration } from "../safety/voice-transcription.service.js";
import { validateVoicePayload } from "./voice-validation.js";
import { SubscriptionTier } from "../shared/types.js";
import { detectLanguageHeuristic, translateBatch, isSupportedLanguage } from "../translate/translate.service.js";

const RECONNECT_REQUEST_PREFIX = "reconnect:";
const NICKNAME_PREFIX = "nickname:";

export async function setNickname(
  conversationId: string,
  userId: string,
  nickname: string | null,
): Promise<void> {
  const key = `${NICKNAME_PREFIX}${conversationId}:${userId}`;
  if (nickname) {
    await redis.set(key, nickname);
  } else {
    await redis.del(key);
  }
}

export async function getNickname(
  conversationId: string,
  userId: string,
): Promise<string | null> {
  return redis.get(`${NICKNAME_PREFIX}${conversationId}:${userId}`);
}
const RECONNECT_REQUEST_TTL = 7 * 24 * 60 * 60;

export async function getConversationsForUser(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: {
      status: "active",
      OR: [
        { userAId: userId, userB: { deletedAt: null } },
        { userBId: userId, userA: { deletedAt: null } },
      ],
    },
    include: {
      userA: { select: { id: true, anonymousAlias: true } },
      userB: { select: { id: true, anonymousAlias: true } },
      messages: {
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { id: true, sentAt: true, senderId: true },
      },
    },
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
  });

  // Filter out conversations the user has soft-deleted (unless new messages arrived after deletion)
  const deletionKeys = conversations.map((c) => `deleted:conv:${userId}:${c.id}`);
  const deletedAts = deletionKeys.length > 0 ? await redis.mget(...deletionKeys) : [];

  const results = [];
  for (let i = 0; i < conversations.length; i++) {
    const c = conversations[i];
    const deletedAt = deletedAts[i];
    if (deletedAt) {
      const hasNewMessages = c.lastMessageAt && new Date(c.lastMessageAt) > new Date(deletedAt);
      if (!hasNewMessages) continue;
    }
    results.push({
      id: c.id,
      partner: c.userAId === userId ? c.userB : c.userA,
      category: c.category,
      subTag: c.subTag,
      lastMessageAt: c.lastMessageAt,
      hasMessages: c.messages.length > 0,
    });
  }

  return results;
}

export async function getConversation(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      userA: { select: { deletedAt: true } },
      userB: { select: { deletedAt: true } },
    },
  });
  if (!conversation) throw new NotFoundError("Conversation not found");
  if (conversation.userAId !== userId && conversation.userBId !== userId) {
    throw new ForbiddenError("Not a participant");
  }

  const partner = conversation.userAId === userId ? conversation.userB : conversation.userA;
  if (partner?.deletedAt) {
    throw new NotFoundError("Conversation partner is no longer available");
  }

  // Strip the relation fields before returning so the shape matches existing callers.
  const { userA: _a, userB: _b, ...rest } = conversation;
  return rest;
}

function assertConversationActive(conversation: { status: string }) {
  if (conversation.status !== "active") {
    throw new ForbiddenError("Conversation is not active");
  }
}

export async function getMessages(
  conversationId: string,
  userId: string,
  cursor?: string,
  limit = 50,
) {
  // Validate participation
  await getConversation(conversationId, userId);

  // If user deleted this conversation, only show messages after deletion
  const deletedAt = await redis.get(`deleted:conv:${userId}:${conversationId}`);

  const [messages, reader] = await Promise.all([
    prisma.message.findMany({
      where: {
        conversationId,
        ...(deletedAt ? { sentAt: { gt: new Date(deletedAt) } } : {}),
      },
      orderBy: { sentAt: "desc" },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        senderId: true,
        content: true,
        iv: true,
        authTag: true,
        sentAt: true,
        deliveryStatus: true,
        liveSessionId: true,
        messageType: true,
        voiceDurationMs: true,
        waveform: true,
        sourceLanguage: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { preferredLanguage: true, preferredDialect: true, autoTranslateEnabled: true },
    }),
  ]);

  const decrypted = messages.map((m) => ({
    ...m,
    content: decrypt({ ciphertext: m.content, iv: m.iv, authTag: m.authTag }),
  }));

  const shouldTranslate =
    reader?.autoTranslateEnabled === true &&
    reader.preferredLanguage &&
    isSupportedLanguage(reader.preferredLanguage);

  if (!shouldTranslate) {
    return decrypted.map((m) => ({ ...m, originalContent: m.content, translated: false }));
  }

  const target = reader!.preferredLanguage!;
  const candidates = decrypted.filter(
    (m) =>
      m.messageType === "text" &&
      m.senderId !== userId &&
      (!m.sourceLanguage || m.sourceLanguage !== target),
  );

  if (candidates.length === 0) {
    return decrypted.map((m) => ({ ...m, originalContent: m.content, translated: false }));
  }

  const translations = await translateBatch(
    candidates.map((m) => ({ id: m.id, text: m.content, sourceLang: m.sourceLanguage })),
    target,
    { dialect: reader!.preferredDialect ?? undefined },
  );

  // Backfill newly detected source languages so subsequent reads can short-circuit.
  const backfills = candidates
    .filter((m) => !m.sourceLanguage && translations.get(m.id)?.sourceLang)
    .map((m) =>
      prisma.message.update({
        where: { id: m.id },
        data: { sourceLanguage: translations.get(m.id)!.sourceLang },
      }).catch(() => undefined),
    );
  if (backfills.length > 0) {
    // fire-and-forget: don't block the response
    Promise.all(backfills).catch(() => undefined);
  }

  return decrypted.map((m) => {
    const t = translations.get(m.id);
    if (!t || t.sourceLang === target) {
      return { ...m, originalContent: m.content, translated: false };
    }
    return {
      ...m,
      content: t.translated,
      originalContent: m.content,
      translated: true,
    };
  });
}

// Authoritative server-side limits (never trust the client): ~2MB base64 for
// up to 60s of compressed audio.
export async function sendVoiceNote(
  conversationId: string,
  senderId: string,
  base64Audio: string,
  durationMs: number,
  waveform?: number[],
) {
  const conversation = await getConversation(conversationId, senderId);
  assertConversationActive(conversation);

  // Validate + decode the bounded payload before any processing.
  const { audio, durationMs: validDuration, waveform: validWaveform } =
    validateVoicePayload({ conversationId, audio: base64Audio, durationMs, waveform });

  // Pre-delivery moderation for audio: transcribe → run the SAME text
  // moderator → discard the transcript. Fail closed on any transcription or
  // moderation error so unmoderated audio is never delivered.
  let moderation;
  try {
    const transcript = await transcribeForModeration(audio);
    moderation = await moderateText(transcript);
  } catch {
    // Retryable: the safety provider is unavailable, so quarantine.
    throw new ContentBlockedError(true);
  }
  if (!moderation.allowed) {
    if (moderation.action === "block") {
      await recordModerationBlock(conversationId, senderId, [...moderation.categories, "voice"]);
    }
    throw new ContentBlockedError(moderation.action === "quarantine");
  }

  const recipientId =
    conversation.userAId === senderId
      ? conversation.userBId
      : conversation.userAId;

  const encrypted = encrypt(base64Audio);

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId,
      content: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      messageType: "voice",
      voiceDurationMs: validDuration,
      waveform: validWaveform ?? undefined,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: message.sentAt },
  });

  const recipientOnline = await isOnline(recipientId);
  emitNotification({
    type: "new_message",
    recipientId,
    payload: {
      conversationId,
      messageId: message.id,
      senderId,
      messageType: "voice",
      online: recipientOnline,
    },
    createdAt: new Date(),
  });

  return message;
}

async function recordModerationBlock(
  conversationId: string,
  senderId: string,
  categories: string[],
): Promise<void> {
  try {
    await prisma.moderationBlock.create({
      data: { conversationId, senderId, categories },
    });
  } catch (err) {
    // Metadata logging must never block the rejection path.
    console.error("[moderation] failed to record block:", (err as Error).message);
  }
}

export async function sendAsyncMessage(
  conversationId: string,
  senderId: string,
  plaintext: string,
) {
  const conversation = await getConversation(conversationId, senderId);
  assertConversationActive(conversation);
  const recipientId =
    conversation.userAId === senderId
      ? conversation.userBId
      : conversation.userAId;

  // Pre-delivery moderation: authorization → moderation → persistence →
  // delivery. A blocked/quarantined message is never persisted as delivered,
  // never emitted to the recipient, never pushed.
  const moderation = await moderateText(plaintext);
  if (!moderation.allowed) {
    if (moderation.action === "block") {
      await recordModerationBlock(conversationId, senderId, moderation.categories);
    }
    throw new ContentBlockedError(moderation.action === "quarantine");
  }

  const encrypted = encrypt(plaintext);
  const sourceLanguage = detectLanguageHeuristic(plaintext);

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId,
      content: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      sourceLanguage: sourceLanguage === "und" ? null : sourceLanguage,
    },
  });

  // Update conversation's last message timestamp
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: message.sentAt },
  });

  // Notify recipient
  const recipientOnline = await isOnline(recipientId);
  // Never put message plaintext on the notification bus — push builds neutral
  // copy and the socket path carries content over the authenticated channel.
  emitNotification({
    type: "new_message",
    recipientId,
    payload: {
      conversationId,
      messageId: message.id,
      senderId,
      messageType: "text",
      online: recipientOnline,
    },
    createdAt: new Date(),
  });

  // Locale is set from the device locale at first launch or manually in
  // Settings — message content is never sent to the LLM for language
  // detection (removed for GDPR necessity/proportionality).

  return message;
}

export async function markDelivered(messageIds: string[], userId: string) {
  if (messageIds.length === 0) return;

  await prisma.message.updateMany({
    where: {
      id: { in: messageIds },
      deliveryStatus: "sent",
      // Only mark delivered for messages sent TO this user (not by them)
      NOT: { senderId: userId },
    },
    data: {
      deliveryStatus: "delivered",
      deliveredAt: new Date(),
    },
  });
}

export async function markRead(
  conversationId: string,
  userId: string,
  upToMessageId: string,
) {
  // Get the sentAt of the target message
  const targetMessage = await prisma.message.findUnique({
    where: { id: upToMessageId },
    select: { sentAt: true },
  });
  if (!targetMessage) return;

  // Mark all messages up to and including this one as read
  const result = await prisma.message.updateMany({
    where: {
      conversationId,
      sentAt: { lte: targetMessage.sentAt },
      NOT: { senderId: userId },
      deliveryStatus: { in: ["sent", "delivered"] },
    },
    data: {
      deliveryStatus: "read",
      readAt: new Date(),
      deliveredAt: new Date(), // ensure deliveredAt is set too
    },
  });

  if (result.count > 0) {
    // Find the sender to notify
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { userAId: true, userBId: true },
    });
    if (conversation) {
      const senderId =
        conversation.userAId === userId
          ? conversation.userBId
          : conversation.userAId;
      emitNotification({
        type: "message_read",
        recipientId: senderId,
        payload: { conversationId, upToMessageId },
        createdAt: new Date(),
      });
    }
  }
}

export async function archiveConversation(
  conversationId: string,
  userId: string,
) {
  await getConversation(conversationId, userId);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "archived" },
  });
}

export async function getArchivedConversations(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: {
      status: "archived",
      OR: [
        { userAId: userId, userB: { deletedAt: null } },
        { userBId: userId, userA: { deletedAt: null } },
      ],
    },
    include: {
      userA: { select: { id: true, anonymousAlias: true } },
      userB: { select: { id: true, anonymousAlias: true } },
    },
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
  });

  return conversations.map((c) => ({
    id: c.id,
    partner: c.userAId === userId ? c.userB : c.userA,
    category: c.category,
    subTag: c.subTag,
    lastMessageAt: c.lastMessageAt,
  }));
}

export async function requestReconnect(
  conversationId: string,
  userId: string,
  userTier: string,
): Promise<{ status: "requested" | "reconnected" }> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new NotFoundError("Conversation not found");
  if (conversation.status !== "archived") {
    throw new ValidationError("Conversation is not archived");
  }
  if (conversation.userAId !== userId && conversation.userBId !== userId) {
    throw new ForbiddenError("Not a participant");
  }

  const partnerId =
    conversation.userAId === userId ? conversation.userBId : conversation.userAId;

  // Mutual consent: check if the other user already requested reconnect
  const reconnectKey = `reconnect:request:${conversationId}`;
  const existingRequest = await redis.get(reconnectKey);

  if (existingRequest && existingRequest !== userId) {
    // Partner already requested — both agree, unarchive
    await redis.del(reconnectKey);
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "active" },
    });

    emitNotification({
      type: "new_match",
      recipientId: partnerId,
      payload: { conversationId, reconnected: true },
      createdAt: new Date(),
    });
    emitNotification({
      type: "new_match",
      recipientId: userId,
      payload: { conversationId, reconnected: true },
      createdAt: new Date(),
    });

    return { status: "reconnected" };
  }

  // First request — store and notify partner
  await redis.set(reconnectKey, userId, "EX", 86400); // 24hr TTL

  emitNotification({
    type: "reconnect_requested",
    recipientId: partnerId,
    payload: { conversationId, requesterId: userId },
    createdAt: new Date(),
  });

  return { status: "requested" };
}

export async function autoArchiveStaleConversations(staleDays = 7): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);

  const result = await prisma.conversation.updateMany({
    where: {
      status: "active",
      OR: [
        { lastMessageAt: { lt: cutoff } },
        { lastMessageAt: null, createdAt: { lt: cutoff } },
      ],
    },
    data: { status: "archived" },
  });

  return result.count;
}

// Disclosed retention periods — the single source of truth the privacy notice,
// public policy and App Review notes must match.
export const MESSAGE_RETENTION_DAYS = 7;
export const MATCHING_DATA_RETENTION_DAYS = 180;
// Defined safeguarding hold applied by a moderator ESCALATION (not by automated
// crisis detection). Bounded and clearable via the audited resolve path.
export const SAFEGUARDING_HOLD_DAYS = 90;

const DELETE_BATCH_SIZE = 1000;

/**
 * Message retention (text AND voice — voice audio lives in Message.content, so
 * deleting the row deletes the encrypted payload):
 * - Every message (live-session or async) is deleted `MESSAGE_RETENTION_DAYS`
 *   after it was sent, regardless of whether the conversation is active,
 *   archived or blocked. The conversation relationship is kept; only message
 *   content rows are removed.
 * - Exceptions (content preserved): a conversation with an OPEN report
 *   (pending/reviewing/escalated), or an unexpired safeguarding hold
 *   (retentionHoldUntil > now). Automated crisis detection alone does NOT
 *   preserve conversation content.
 *
 * Bounded + idempotent: deletes in batches of DELETE_BATCH_SIZE so it never
 * takes a table-wide lock, and re-running deletes nothing already gone.
 */
export async function deleteExpiredMessages(
  retentionDays = MESSAGE_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const now = new Date();

  const activeReports = await prisma.report.findMany({
    where: { status: { in: ["pending", "reviewing", "escalated"] } },
    select: { conversationId: true },
    distinct: ["conversationId" as const],
  });
  const heldConversations = await prisma.conversation.findMany({
    where: { retentionHoldUntil: { gt: now } },
    select: { id: true },
  });
  const protectedIds = [
    ...new Set([
      ...activeReports.map((r) => r.conversationId),
      ...heldConversations.map((c) => c.id),
    ]),
  ];

  const where: Record<string, unknown> = { sentAt: { lt: cutoff } };
  if (protectedIds.length > 0) {
    where.conversationId = { notIn: protectedIds };
  }

  let total = 0;
  for (;;) {
    const batch = await prisma.message.findMany({
      where: where as never,
      select: { id: true },
      take: DELETE_BATCH_SIZE,
    });
    if (batch.length === 0) break;
    const res = await prisma.message.deleteMany({
      where: { id: { in: batch.map((m) => m.id) } },
    });
    total += res.count;
    if (batch.length < DELETE_BATCH_SIZE) break;
  }
  return total;
}

/**
 * Anonymised matching-data cleanup (disclosed 180-day period): nulls
 * Conversation.matchContext on conversations older than the cutoff (the row is
 * kept for relational integrity) and deletes MatchQualityLog rows older than the
 * cutoff. Conversations with an OPEN report keep matchContext until the report
 * closes (documented exception). Bounded + idempotent.
 */
export async function deleteExpiredMatchingData(
  retentionDays = MATCHING_DATA_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const activeReports = await prisma.report.findMany({
    where: { status: { in: ["pending", "reviewing", "escalated"] } },
    select: { conversationId: true },
    distinct: ["conversationId" as const],
  });
  const protectedIds = activeReports.map((r) => r.conversationId);

  const convWhere: Record<string, unknown> = {
    createdAt: { lt: cutoff },
    matchContext: { not: Prisma.JsonNull },
  };
  if (protectedIds.length > 0) convWhere.id = { notIn: protectedIds };

  const convResult = await prisma.conversation.updateMany({
    where: convWhere as never,
    data: { matchContext: Prisma.JsonNull },
  });

  const logResult = await prisma.matchQualityLog.deleteMany({
    where: { matchedAt: { lt: cutoff } },
  });

  return convResult.count + logResult.count;
}

/**
 * Apply a time-BOUNDED safeguarding hold. Set only by a moderator escalation
 * (never automated crisis detection). Protects message content from the 7-day
 * cleanup until `holdDays` from now. Extends (never shortens) an existing hold.
 */
export async function setRetentionHold(
  conversationId: string,
  holdDays = SAFEGUARDING_HOLD_DAYS,
): Promise<void> {
  const until = new Date();
  until.setDate(until.getDate() + holdDays);
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { retentionHoldUntil: true },
  });
  // Never shorten an existing, longer hold.
  if (conv?.retentionHoldUntil && conv.retentionHoldUntil > until) return;
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { retentionHold: true, retentionHoldAt: new Date(), retentionHoldUntil: until },
  });
}

/**
 * Clear a safeguarding hold early. Called ONLY from the audited escalation-
 * resolve path so evidence is never released silently. After clearing, the
 * conversation's messages return to the ordinary 7-day deletion schedule.
 */
export async function clearRetentionHold(conversationId: string): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { retentionHold: false, retentionHoldUntil: null },
  });
}
