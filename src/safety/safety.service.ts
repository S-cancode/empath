import type { Server } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/crypto.js";
import { ValidationError, ForbiddenError, NotFoundError } from "../shared/errors.js";

let ioInstance: Server | null = null;

export function setIoInstance(io: Server): void {
  ioInstance = io;
}

const REPORT_REASONS = [
  "harassment",
  "self_harm_encouragement",
  "sexual_content",
  "spam_scam",
  "medical_advice",
  "illegal_content",
  "underage_user",
  "other",
] as const;

export async function reportUser(
  reporterId: string,
  conversationId: string,
  reportedId: string,
  reason: string,
  details?: string,
): Promise<{ id: string }> {
  if (!REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number])) {
    throw new ValidationError("Invalid report reason");
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new NotFoundError("Conversation not found");
  if (conversation.userAId !== reporterId && conversation.userBId !== reporterId) {
    throw new ForbiddenError("Not a participant");
  }

  const partnerId =
    conversation.userAId === reporterId ? conversation.userBId : conversation.userAId;
  if (reportedId !== partnerId) {
    throw new ValidationError("Reported user is not your conversation partner");
  }

  // Capture last 10 messages as a snapshot for moderation review
  let reportedMessageContent: string | null = null;
  try {
    const recentMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { sentAt: "desc" },
      take: 10,
      include: { sender: { select: { anonymousAlias: true } } },
    });
    if (recentMessages.length > 0) {
      reportedMessageContent = recentMessages
        .reverse()
        .map((m) => {
          let content: string;
          try {
            content = m.messageType === "voice"
              ? "[voice note]"
              : decrypt({ ciphertext: m.content, iv: m.iv, authTag: m.authTag });
          } catch {
            content = "[unable to decrypt]";
          }
          return `[${m.sender.anonymousAlias}]: ${content}`;
        })
        .join("\n");
    }
  } catch {
    // Non-critical — proceed without snapshot
  }

  const report = await prisma.report.create({
    data: { conversationId, reporterId, reportedId, reason, details, reportedMessageContent },
  });

  // Auto-block the reported user so they are never matched again
  await blockUser(reporterId, reportedId);

  return { id: report.id };
}

export async function blockUser(
  userId: string,
  blockedUserId: string,
): Promise<void> {
  if (userId === blockedUserId) {
    throw new ValidationError("Cannot block yourself");
  }

  await prisma.blockedUser.upsert({
    where: { userId_blockedUserId: { userId, blockedUserId } },
    create: { userId, blockedUserId },
    update: {},
  });

  // Set all shared conversations to "blocked"
  await prisma.conversation.updateMany({
    where: {
      status: { in: ["active", "archived"] },
      OR: [
        { userAId: userId, userBId: blockedUserId },
        { userAId: blockedUserId, userBId: userId },
      ],
    },
    data: { status: "blocked" },
  });

  // Terminate active live sessions
  const activeSessions = await prisma.liveSession.findMany({
    where: {
      status: "active",
      conversation: {
        OR: [
          { userAId: userId, userBId: blockedUserId },
          { userAId: blockedUserId, userBId: userId },
        ],
      },
    },
    select: { id: true },
  });

  for (const session of activeSessions) {
    await prisma.liveSession.update({
      where: { id: session.id },
      data: { status: "terminated", endedAt: new Date() },
    });

    if (ioInstance) {
      ioInstance.to(`livesession:${session.id}`).emit("livesession:ended", {
        reason: "blocked",
        liveSessionId: session.id,
      });
    }
  }
}

export async function isBlocked(
  userAId: string,
  userBId: string,
): Promise<boolean> {
  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { userId: userAId, blockedUserId: userBId },
        { userId: userBId, blockedUserId: userAId },
      ],
    },
  });
  return !!block;
}
