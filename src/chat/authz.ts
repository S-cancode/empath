import { prisma } from "../lib/prisma.js";
import { ForbiddenError, NotFoundError } from "../shared/errors.js";

/**
 * Object-level authorization for chat/live-session actions. Every
 * state-changing socket event must confirm the actor is a member of the
 * object it targets BEFORE moderation, persistence, notification, or room
 * emission. Helpers throw on failure so callers fail closed.
 */

export interface ConversationParticipants {
  userAId: string;
  userBId: string;
  status: string;
}

export async function getConversationIfParticipant(
  conversationId: string,
  userId: string,
): Promise<ConversationParticipants> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userAId: true, userBId: true, status: true },
  });
  if (!conversation) throw new NotFoundError("Conversation not found");
  if (conversation.userAId !== userId && conversation.userBId !== userId) {
    throw new ForbiddenError("Not a participant");
  }
  return conversation;
}

export async function assertConversationParticipant(
  conversationId: string,
  userId: string,
): Promise<ConversationParticipants> {
  return getConversationIfParticipant(conversationId, userId);
}

/**
 * Returns the participant conversation only if it is active — for actions
 * that must not run on archived/blocked threads (sending, live sessions).
 */
export async function assertActiveConversationParticipant(
  conversationId: string,
  userId: string,
): Promise<ConversationParticipants & { partnerId: string }> {
  const c = await getConversationIfParticipant(conversationId, userId);
  if (c.status !== "active") {
    throw new ForbiddenError("Conversation is not active");
  }
  return { ...c, partnerId: c.userAId === userId ? c.userBId : c.userAId };
}

export async function assertLiveSessionParticipant(
  liveSessionId: string,
  userId: string,
): Promise<{ conversationId: string; status: string }> {
  const session = await prisma.liveSession.findUnique({
    where: { id: liveSessionId },
    select: {
      conversationId: true,
      status: true,
      conversation: { select: { userAId: true, userBId: true } },
    },
  });
  if (!session) throw new NotFoundError("Live session not found");
  if (
    session.conversation.userAId !== userId &&
    session.conversation.userBId !== userId
  ) {
    throw new ForbiddenError("Not a participant");
  }
  return { conversationId: session.conversationId, status: session.status };
}
