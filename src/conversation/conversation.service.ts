import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { emitNotification } from "../notifications/notification.service.js";
import { isOnline } from "../presence/presence.service.js";
import { getTierLimits } from "../config/tiers.js";
import { NotFoundError, ForbiddenError, UpgradeRequiredError, ValidationError } from "../shared/errors.js";
import { SubscriptionTier } from "../shared/types.js";

const RECONNECT_REQUEST_PREFIX = "reconnect:";
const RECONNECT_REQUEST_TTL = 7 * 24 * 60 * 60;

export async function getConversationsForUser(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: {
      status: "active",
      OR: [{ userAId: userId }, { userBId: userId }],
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

  return conversations.map((c) => ({
    id: c.id,
    partner: c.userAId === userId ? c.userB : c.userA,
    category: c.category,
    subTag: c.subTag,
    lastMessageAt: c.lastMessageAt,
    hasMessages: c.messages.length > 0,
  }));
}

export async function getConversation(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new NotFoundError("Conversation not found");
  if (conversation.userAId !== userId && conversation.userBId !== userId) {
    throw new ForbiddenError("Not a participant");
  }
  return conversation;
}

export async function getMessages(
  conversationId: string,
  userId: string,
  cursor?: string,
  limit = 50,
) {
  // Validate participation
  await getConversation(conversationId, userId);

  const messages = await prisma.message.findMany({
    where: { conversationId },
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
    },
  });

  return messages.map((m) => ({
    ...m,
    content: decrypt({ ciphertext: m.content, iv: m.iv, authTag: m.authTag }),
  }));
}

export async function sendVoiceNote(
  conversationId: string,
  senderId: string,
  base64Audio: string,
  durationMs: number,
  waveform?: number[],
) {
  const conversation = await getConversation(conversationId, senderId);
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
  const recipientId =
    conversation.userAId === senderId
      ? conversation.userBId
      : conversation.userAId;

  const encrypted = encrypt(plaintext);

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId,
      content: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
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
      online: recipientOnline,
    },
    createdAt: new Date(),
  });

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
      OR: [{ userAId: userId }, { userBId: userId }],
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
  const limits = getTierLimits(userTier);
  if (!limits.canReconnectArchived) {
    throw new UpgradeRequiredError(SubscriptionTier.PREMIUM);
  }

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

  const redisKey = `${RECONNECT_REQUEST_PREFIX}${conversationId}`;
  const existingRequesterId = await redis.get(redisKey);

  if (existingRequesterId && existingRequesterId !== userId) {
    // Both users agreed — reactivate
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "active" },
    });
    await redis.del(redisKey);

    emitNotification({
      type: "new_match",
      recipientId: partnerId,
      payload: { conversationId, reconnected: true },
      createdAt: new Date(),
    });

    return { status: "reconnected" };
  }

  // First request — store and notify partner
  await redis.set(redisKey, userId, "EX", RECONNECT_REQUEST_TTL);

  emitNotification({
    type: "new_message",
    recipientId: partnerId,
    payload: { conversationId, reconnectRequested: true, requesterId: userId },
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
