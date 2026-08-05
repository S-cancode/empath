import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { emitNotification } from "../notifications/notification.service.js";
import { isOnline } from "../presence/presence.service.js";
import { getTierLimits } from "../config/tiers.js";
import { NotFoundError, ForbiddenError, UpgradeRequiredError, ValidationError } from "../shared/errors.js";
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

export async function sendVoiceNote(
  conversationId: string,
  senderId: string,
  base64Audio: string,
  durationMs: number,
  waveform?: number[],
) {
  const conversation = await getConversation(conversationId, senderId);
  assertConversationActive(conversation);
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
      voiceDurationMs: durationMs,
      waveform: waveform ?? undefined,
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
  emitNotification({
    type: "new_message",
    recipientId,
    payload: {
      conversationId,
      messageId: message.id,
      senderId,
      messageContent: plaintext,
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

/**
 * Retention policy:
 * - Live-session messages (has liveSessionId) are transient: deleted after `liveSessionRetentionDays`.
 * - Async messages in archived/blocked conversations: deleted after `archivedRetentionDays` past archive.
 *   We approximate archive time by using the message's sentAt (no per-conversation archivedAt column).
 * - Async messages in active conversations are preserved (persistent async threads).
 * - Messages in conversations with pending/reviewing reports are never deleted.
 * - Messages in conversations under a retention hold (escalations, crisis events)
 *   are never deleted.
 */
export async function deleteExpiredMessages(
  liveSessionRetentionDays = 7,
  archivedRetentionDays = 30,
): Promise<number> {
  const liveCutoff = new Date();
  liveCutoff.setDate(liveCutoff.getDate() - liveSessionRetentionDays);

  const archivedCutoff = new Date();
  archivedCutoff.setDate(archivedCutoff.getDate() - archivedRetentionDays);

  const activeReports = await prisma.report.findMany({
    where: { status: { in: ["pending", "reviewing", "escalated"] } },
    select: { conversationId: true },
    distinct: ["conversationId" as const],
  });
  const heldConversations = await prisma.conversation.findMany({
    where: { retentionHold: true },
    select: { id: true },
  });
  const protectedIds = [
    ...new Set([
      ...activeReports.map((r) => r.conversationId),
      ...heldConversations.map((c) => c.id),
    ]),
  ];

  // 1. Delete old live-session messages (not in a protected conversation).
  const liveWhere: Record<string, unknown> = {
    liveSessionId: { not: null },
    sentAt: { lt: liveCutoff },
  };
  if (protectedIds.length > 0) {
    liveWhere.conversationId = { notIn: protectedIds };
  }
  const liveResult = await prisma.message.deleteMany({ where: liveWhere as never });

  // 2. Delete old async messages only if their conversation is archived or blocked.
  const inactiveConversations = await prisma.conversation.findMany({
    where: { status: { in: ["archived", "blocked"] } },
    select: { id: true },
  });
  const inactiveIds = inactiveConversations
    .map((c) => c.id)
    .filter((id) => !protectedIds.includes(id));

  let asyncCount = 0;
  if (inactiveIds.length > 0) {
    const asyncResult = await prisma.message.deleteMany({
      where: {
        liveSessionId: null,
        conversationId: { in: inactiveIds },
        sentAt: { lt: archivedCutoff },
      },
    });
    asyncCount = asyncResult.count;
  }

  return liveResult.count + asyncCount;
}

/**
 * One-way retention hold: preserves a conversation's messages indefinitely for
 * moderation/safeguarding review. Deliberately no counterpart that clears the
 * flag — resolving an escalation must not unfreeze the record.
 */
export async function setRetentionHold(conversationId: string): Promise<void> {
  await prisma.conversation.updateMany({
    where: { id: conversationId, retentionHold: false },
    data: { retentionHold: true, retentionHoldAt: new Date() },
  });
}
