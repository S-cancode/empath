import type { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../auth/auth.service.js";
import { bufferMessage, endLiveSession, extendLiveSession, startLiveSession } from "./chat.service.js";
import { sendAsyncMessage, sendVoiceNote, markDelivered, markRead } from "../conversation/conversation.service.js";
import { setOnline, setOffline, isOnline, getPartnerIdsForUser } from "../presence/presence.service.js";
import { emitNotification } from "../notifications/notification.service.js";
import { setActiveConversation } from "../notifications/push.service.js";
import { detectCrisis } from "../safety/crisis.detector.js";
import { crisisResources } from "../safety/crisis.resources.js";
import { getTierLimits } from "../config/tiers.js";
import { SubscriptionTier } from "../shared/types.js";
import { prisma } from "../lib/prisma.js";

const MESSAGE_RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;

interface RateTracker {
  count: number;
  resetAt: number;
}

interface LiveSessionInvite {
  inviterId: string;
  inviterTier: string;
}

const rateLimits = new Map<string, RateTracker>();
const liveSessionTimers = new Map<string, ReturnType<typeof setTimeout>>();
const extendRequests = new Map<string, Set<string>>();
const liveSessionInvites = new Map<string, LiveSessionInvite>();
// Track crisis alerts shown per user per conversation to enforce once-per-session
const crisisAlertsSent = new Map<string, Set<string>>();

function checkMessageRate(userId: string): boolean {
  const now = Date.now();
  let tracker = rateLimits.get(userId);

  if (!tracker || now > tracker.resetAt) {
    tracker = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateLimits.set(userId, tracker);
  }

  tracker.count++;
  return tracker.count <= MESSAGE_RATE_LIMIT;
}

function startLiveSessionTimer(io: Server, liveSessionId: string, duration: number): void {
  const existing = liveSessionTimers.get(liveSessionId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    await endLiveSession(liveSessionId);
    io.to(`livesession:${liveSessionId}`).emit("livesession:ended", { reason: "timeout", liveSessionId });
    liveSessionTimers.delete(liveSessionId);
  }, duration);

  liveSessionTimers.set(liveSessionId, timer);
}

async function handleCrisisDetection(
  io: Server,
  socket: Socket,
  userId: string,
  content: string,
  conversationId: string,
  liveSessionId?: string,
): Promise<void> {
  const crisisResult = detectCrisis(content);
  if (!crisisResult.detected) return;

  // Once-per-session: skip if already shown to this user in this conversation
  const key = `${userId}:${conversationId}`;
  if (crisisAlertsSent.has(key)) return;

  // Mark as shown
  if (!crisisAlertsSent.has(key)) {
    crisisAlertsSent.set(key, new Set());
  }
  crisisAlertsSent.get(key)!.add(conversationId);

  // Emit to BOTH users in the conversation (spec recommends showing to both)
  const room = liveSessionId
    ? `livesession:${liveSessionId}`
    : `conversation:${conversationId}`;
  io.to(room).emit("crisis:detected", {
    resources: crisisResources,
    keywords: crisisResult.matchedKeywords,
  });
  // Also emit directly to sender in case they haven't joined the room yet
  socket.emit("crisis:detected", {
    resources: crisisResources,
    keywords: crisisResult.matchedKeywords,
  });

  try {
    await prisma.crisisEvent.create({
      data: {
        userId,
        conversationId,
        liveSessionId: liveSessionId ?? null,
        triggerKeywords: crisisResult.matchedKeywords,
        resourcesShown: crisisResources.map((r) => r.name),
      },
    });
  } catch (err) {
    console.error("Failed to log crisis event:", err);
  }
}

export function setupChatGateway(io: Server): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.userId;
      socket.data.tier = payload.tier;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const userId = socket.data.userId as string;
    const userTier = socket.data.tier as string;

    // Register presence
    await setOnline(userId, socket.id);

    // Notify partners that this user is online
    const partnerIds = await getPartnerIdsForUser(userId);
    for (const partnerId of partnerIds) {
      if (await isOnline(partnerId)) {
        const conversations = await prisma.conversation.findMany({
          where: {
            status: "active",
            OR: [
              { userAId: userId, userBId: partnerId },
              { userAId: partnerId, userBId: userId },
            ],
          },
          select: { id: true },
        });

        for (const conv of conversations) {
          socket.emit("match:online", { conversationId: conv.id, partnerId });
          io.to(`conversation:${conv.id}`).emit("match:online", {
            conversationId: conv.id,
            partnerId: userId,
          });
        }

        // Send a single push notification per partner (not per conversation)
        if (conversations.length > 0) {
          emitNotification({
            type: "match_online",
            recipientId: partnerId,
            payload: { conversationId: conversations[0].id, partnerId: userId },
            createdAt: new Date(),
          });
        }
      }
    }

    // --- Conversation events (async messaging) ---

    socket.on("conversation:join", async (data: { conversationId: string }) => {
      const conversation = await prisma.conversation.findUnique({ where: { id: data.conversationId } });
      if (!conversation || conversation.status !== "active") {
        socket.emit("error", { message: "Invalid or inactive conversation" });
        return;
      }
      if (conversation.userAId !== userId && conversation.userBId !== userId) {
        socket.emit("error", { message: "Not a participant" });
        return;
      }

      socket.join(`conversation:${data.conversationId}`);
      socket.emit("conversation:joined", { conversationId: data.conversationId });
    });

    socket.on("conversation:message", async (data: { conversationId: string; content: string }) => {
      if (!checkMessageRate(userId)) {
        socket.emit("error", { message: "Rate limit exceeded" });
        return;
      }

      await handleCrisisDetection(io, socket, userId, data.content, data.conversationId);

      const message = await sendAsyncMessage(data.conversationId, userId, data.content);

      socket.to(`conversation:${data.conversationId}`).emit("conversation:message", {
        conversationId: data.conversationId,
        messageId: message.id,
        senderId: userId,
        content: data.content,
        sentAt: message.sentAt.toISOString(),
      });
    });

    socket.on("conversation:voice-note", async (data: { conversationId: string; audio: string; durationMs: number; waveform?: number[] }) => {
      if (!checkMessageRate(userId)) {
        socket.emit("error", { message: "Rate limit exceeded" });
        return;
      }

      // Validate payload size (~2MB max for 60s compressed audio)
      if (!data.audio || data.audio.length > 2_000_000) {
        socket.emit("error", { message: "Voice note too large (max 60s)" });
        return;
      }

      if (!data.durationMs || data.durationMs > 61_000) {
        socket.emit("error", { message: "Voice note too long (max 60s)" });
        return;
      }

      const message = await sendVoiceNote(data.conversationId, userId, data.audio, data.durationMs, data.waveform);

      socket.to(`conversation:${data.conversationId}`).emit("conversation:message", {
        conversationId: data.conversationId,
        messageId: message.id,
        senderId: userId,
        content: data.audio,
        sentAt: message.sentAt.toISOString(),
        messageType: "voice",
        voiceDurationMs: data.durationMs,
        waveform: data.waveform,
      });
    });

    socket.on("message:delivered", async (data: { messageIds: string[] }) => {
      await markDelivered(data.messageIds, userId);
    });

    socket.on("message:read", async (data: { conversationId: string; upToMessageId: string }) => {
      await markRead(data.conversationId, userId, data.upToMessageId);
      socket.to(`conversation:${data.conversationId}`).emit("message:read", {
        conversationId: data.conversationId,
        upToMessageId: data.upToMessageId,
        readBy: userId,
      });
    });

    // --- Live session events ---

    socket.on("livesession:invite", async (data: { conversationId: string }) => {
      const conversation = await prisma.conversation.findUnique({ where: { id: data.conversationId } });
      if (!conversation || conversation.status !== "active") {
        socket.emit("error", { message: "Invalid conversation" });
        return;
      }

      const partnerId = conversation.userAId === userId ? conversation.userBId : conversation.userAId;
      if (!(await isOnline(partnerId))) {
        socket.emit("error", { message: "Partner is not online" });
        return;
      }

      liveSessionInvites.set(data.conversationId, { inviterId: userId, inviterTier: userTier });

      emitNotification({
        type: "live_session_invite",
        recipientId: partnerId,
        payload: { conversationId: data.conversationId, inviterId: userId },
        createdAt: new Date(),
      });

      socket.to(`conversation:${data.conversationId}`).emit("livesession:invite", {
        conversationId: data.conversationId,
        inviterId: userId,
      });
    });

    socket.on("livesession:accept", async (data: { conversationId: string }) => {
      const invite = liveSessionInvites.get(data.conversationId);
      if (!invite || invite.inviterId === userId) {
        socket.emit("error", { message: "No pending invite" });
        return;
      }

      liveSessionInvites.delete(data.conversationId);

      // Use the higher tier's duration
      const inviterLimits = getTierLimits(invite.inviterTier);
      const accepterLimits = getTierLimits(userTier);
      const sessionDuration = Math.max(
        inviterLimits.liveSessionDurationMs,
        accepterLimits.liveSessionDurationMs,
      );

      const liveSession = await startLiveSession(data.conversationId);

      startLiveSessionTimer(io, liveSession.id, sessionDuration);

      io.to(`conversation:${data.conversationId}`).emit("livesession:started", {
        liveSessionId: liveSession.id,
        conversationId: data.conversationId,
        durationMs: sessionDuration,
      });

      emitNotification({
        type: "live_session_started",
        recipientId: invite.inviterId,
        payload: { conversationId: data.conversationId, liveSessionId: liveSession.id },
        createdAt: new Date(),
      });
    });

    socket.on("livesession:decline", async (data: { conversationId: string }) => {
      const invite = liveSessionInvites.get(data.conversationId);
      if (!invite) return;

      liveSessionInvites.delete(data.conversationId);
      socket.to(`conversation:${data.conversationId}`).emit("livesession:declined", {
        conversationId: data.conversationId,
      });
    });

    socket.on("livesession:join", async (data: { liveSessionId: string }) => {
      const session = await prisma.liveSession.findUnique({
        where: { id: data.liveSessionId },
        include: { conversation: { select: { userAId: true, userBId: true } } },
      });
      if (!session || session.status !== "active") {
        socket.emit("error", { message: "Invalid or inactive live session" });
        return;
      }
      if (session.conversation.userAId !== userId && session.conversation.userBId !== userId) {
        socket.emit("error", { message: "Not a participant" });
        return;
      }

      socket.join(`livesession:${data.liveSessionId}`);
      socket.emit("livesession:joined", { liveSessionId: data.liveSessionId });
    });

    socket.on("livesession:message", async (data: { liveSessionId: string; conversationId: string; content: string }) => {
      if (!checkMessageRate(userId)) {
        socket.emit("error", { message: "Rate limit exceeded" });
        return;
      }

      await handleCrisisDetection(io, socket, userId, data.content, data.conversationId, data.liveSessionId);

      bufferMessage(data.conversationId, userId, data.content, data.liveSessionId);

      socket.to(`livesession:${data.liveSessionId}`).emit("livesession:message", {
        senderId: userId,
        content: data.content,
        sentAt: new Date().toISOString(),
      });
    });

    socket.on("typing", (data: { conversationId?: string; liveSessionId?: string }) => {
      if (data.liveSessionId) {
        socket.to(`livesession:${data.liveSessionId}`).emit("typing", { userId });
      } else if (data.conversationId) {
        socket.to(`conversation:${data.conversationId}`).emit("typing", { userId });
      }
    });

    socket.on("livesession:extend", async (data: { liveSessionId: string }) => {
      const limits = getTierLimits(userTier);

      if (!limits.canExtendSession) {
        socket.emit("error", {
          message: "upgrade_required",
          requiredTier: SubscriptionTier.PREMIUM,
        });
        return;
      }

      if (!extendRequests.has(data.liveSessionId)) {
        extendRequests.set(data.liveSessionId, new Set());
      }
      const requests = extendRequests.get(data.liveSessionId)!;
      requests.add(userId);

      if (requests.size >= 2) {
        const extended = await extendLiveSession(data.liveSessionId);
        if (extended) {
          startLiveSessionTimer(io, data.liveSessionId, limits.extendedDurationMs);
          io.to(`livesession:${data.liveSessionId}`).emit("livesession:extended", {
            liveSessionId: data.liveSessionId,
          });
        }
        extendRequests.delete(data.liveSessionId);
      } else {
        socket.to(`livesession:${data.liveSessionId}`).emit("livesession:extend-requested", { userId });
      }
    });

    socket.on("livesession:end", async (data: { liveSessionId: string }) => {
      await endLiveSession(data.liveSessionId);
      const timer = liveSessionTimers.get(data.liveSessionId);
      if (timer) {
        clearTimeout(timer);
        liveSessionTimers.delete(data.liveSessionId);
      }

      emitNotification({
        type: "live_session_ended",
        recipientId: userId,
        payload: { liveSessionId: data.liveSessionId },
        createdAt: new Date(),
      });

      io.to(`livesession:${data.liveSessionId}`).emit("livesession:ended", {
        reason: "user",
        liveSessionId: data.liveSessionId,
      });
    });

    // --- Push notification active conversation tracking ---

    socket.on("push:active", async (data: { conversationId: string }) => {
      await setActiveConversation(userId, data.conversationId);
    });

    socket.on("push:inactive", async () => {
      await setActiveConversation(userId, null);
    });

    // --- Disconnect ---

    socket.on("disconnect", async () => {
      setActiveConversation(userId, null).catch(() => {});
      await setOffline(userId);
      rateLimits.delete(userId);
      // Clean up crisis alert tracking for this user
      for (const [key] of crisisAlertsSent) {
        if (key.startsWith(`${userId}:`)) crisisAlertsSent.delete(key);
      }

      for (const partnerId of partnerIds) {
        if (await isOnline(partnerId)) {
          const conversations = await prisma.conversation.findMany({
            where: {
              status: "active",
              OR: [
                { userAId: userId, userBId: partnerId },
                { userAId: partnerId, userBId: userId },
              ],
            },
            select: { id: true },
          });
          for (const conv of conversations) {
            io.to(`conversation:${conv.id}`).emit("match:offline", {
              conversationId: conv.id,
              partnerId: userId,
            });
          }
        }
      }
    });
  });
}
