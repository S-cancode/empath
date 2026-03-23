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

  // Capture full conversation log for moderation review
  let reportedMessageContent: string | null = null;
  let conversationLog: { totalMessageCount: number; conversationStartedAt: string; conversationLastMessageAt: string; messages: Array<{ senderId: string; senderAlias: string; content: string; messageType: string; sentAt: string }> } | null = null;
  try {
    const allMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { sentAt: "asc" },
      include: { sender: { select: { id: true, anonymousAlias: true } } },
    });
    if (allMessages.length > 0) {
      const logMessages = allMessages.map((m) => {
        let content: string;
        try {
          content = m.messageType === "voice"
            ? "[voice note]"
            : decrypt({ ciphertext: m.content, iv: m.iv, authTag: m.authTag });
        } catch {
          content = "[unable to decrypt]";
        }
        return {
          senderId: m.sender.id,
          senderAlias: m.sender.anonymousAlias,
          content,
          messageType: m.messageType,
          sentAt: m.sentAt.toISOString(),
        };
      });

      conversationLog = {
        totalMessageCount: logMessages.length,
        conversationStartedAt: logMessages[0].sentAt,
        conversationLastMessageAt: logMessages[logMessages.length - 1].sentAt,
        messages: logMessages,
      };

      // Legacy text snapshot (last 10 messages) for backward compatibility
      reportedMessageContent = logMessages
        .slice(-10)
        .map((m) => `[${m.senderAlias}]: ${m.content}`)
        .join("\n");
    }
  } catch {
    // Non-critical — proceed without snapshot
  }

  const report = await prisma.report.create({
    data: {
      conversationId, reporterId, reportedId, reason, details, reportedMessageContent,
      ...(conversationLog ? { conversationLog } : {}),
    },
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

  // Get device IDs for device-level blocking (prevents re-registration bypass)
  const [blocker, blocked] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { deviceId: true } }),
    prisma.user.findUnique({ where: { id: blockedUserId }, select: { deviceId: true } }),
  ]);

  await prisma.blockedUser.upsert({
    where: { userId_blockedUserId: { userId, blockedUserId } },
    create: {
      userId,
      blockedUserId,
      blockerDeviceId: blocker?.deviceId ?? null,
      blockedDeviceId: blocked?.deviceId ?? null,
    },
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
  // Check user-level blocks (both directions)
  const userBlock = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { userId: userAId, blockedUserId: userBId },
        { userId: userBId, blockedUserId: userAId },
      ],
    },
  });
  if (userBlock) return true;

  // Check device-level blocks (prevents bypass via new accounts on same device)
  const [userA, userB] = await Promise.all([
    prisma.user.findUnique({ where: { id: userAId }, select: { deviceId: true } }),
    prisma.user.findUnique({ where: { id: userBId }, select: { deviceId: true } }),
  ]);
  if (!userA || !userB) return false;

  const deviceBlock = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerDeviceId: userA.deviceId, blockedDeviceId: userB.deviceId },
        { blockerDeviceId: userB.deviceId, blockedDeviceId: userA.deviceId },
      ],
    },
  });
  return !!deviceBlock;
}
