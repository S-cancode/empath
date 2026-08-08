import type { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../auth/auth.service.js";
import { bufferMessage, endLiveSession, extendLiveSession, startLiveSession } from "./chat.service.js";
import { sendAsyncMessage, sendVoiceNote, markDelivered, markRead } from "../conversation/conversation.service.js";
import { setOnline, setOffline, isOnline, getPartnerIdsForUser } from "../presence/presence.service.js";
import { emitNotification, notificationBus } from "../notifications/notification.service.js";
import type { NotificationEvent } from "../notifications/notification.service.js";
import { setActiveConversation } from "../notifications/push.service.js";
import { detectCrisis } from "../safety/crisis.detector.js";
import { getCrisisResources } from "../safety/crisis.resources.js";
import { recordCrisisEvent } from "../safety/crisis.service.js";
import { checkUserCompliance, checkUserComplianceCached } from "../compliance/compliance-gate.service.js";
import {
  assertConversationParticipant,
  assertActiveConversationParticipant,
  assertLiveSessionParticipant,
} from "./authz.js";
import { acceptProposal, declineProposal } from "../matching/matching.service.js";
import { redis } from "../lib/redis.js";
import { getTierLimits } from "../config/tiers.js";
import { SubscriptionTier } from "../shared/types.js";
import { prisma } from "../lib/prisma.js";
import { translateText, isSupportedLanguage } from "../translate/translate.service.js";

const MESSAGE_RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;

interface RateTracker {
  count: number;
  resetAt: number;
}

interface LiveSessionInvite {
  inviterId: string;
  inviterTier: string;
  createdAt: number;
}

const rateLimits = new Map<string, RateTracker>();
const liveSessionTimers = new Map<string, ReturnType<typeof setTimeout>>();
const extendRequests = new Map<string, Set<string>>();
const liveSessionInvites = new Map<string, LiveSessionInvite>();
// Track crisis alerts shown per user per conversation to enforce once-per-session
const crisisAlertsSent = new Map<string, Set<string>>();

// Periodic cleanup of in-memory maps to prevent unbounded growth
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const MAX_MAP_SIZE = 5000;
const INVITE_TTL_MS = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  const now = Date.now();

  // Clean expired rate limit entries
  for (const [key, tracker] of rateLimits) {
    if (now > tracker.resetAt) rateLimits.delete(key);
  }

  // Clean stale live session invites (older than 5 min)
  for (const [key, invite] of liveSessionInvites) {
    if (now - invite.createdAt > INVITE_TTL_MS) liveSessionInvites.delete(key);
  }

  // Hard caps on all maps
  if (liveSessionTimers.size > MAX_MAP_SIZE) {
    for (const timer of liveSessionTimers.values()) clearTimeout(timer);
    liveSessionTimers.clear();
    liveSessionEndsAt.clear();
  }
  if (extendRequests.size > MAX_MAP_SIZE) extendRequests.clear();
  if (liveSessionInvites.size > MAX_MAP_SIZE) liveSessionInvites.clear();
  if (crisisAlertsSent.size > MAX_MAP_SIZE) crisisAlertsSent.clear();
}, CLEANUP_INTERVAL);

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

// endsAt tracked separately from timers so extensions can add to remaining time,
// not replace it.
const liveSessionEndsAt = new Map<string, number>();

function scheduleLiveSessionEnd(io: Server, liveSessionId: string, endsAt: number): void {
  const existing = liveSessionTimers.get(liveSessionId);
  if (existing) clearTimeout(existing);
  liveSessionEndsAt.set(liveSessionId, endsAt);

  const delay = Math.max(0, endsAt - Date.now());
  const timer = setTimeout(async () => {
    await endLiveSession(liveSessionId);
    io.to(`livesession:${liveSessionId}`).emit("livesession:ended", { reason: "timeout", liveSessionId });
    liveSessionTimers.delete(liveSessionId);
    liveSessionEndsAt.delete(liveSessionId);
    extendRequests.delete(liveSessionId);
  }, delay);

  liveSessionTimers.set(liveSessionId, timer);
}

function startLiveSessionTimer(io: Server, liveSessionId: string, duration: number): void {
  scheduleLiveSessionEnd(io, liveSessionId, Date.now() + duration);
}

function extendLiveSessionTimer(io: Server, liveSessionId: string, extensionMs: number): void {
  const currentEnd = liveSessionEndsAt.get(liveSessionId) ?? Date.now();
  // Extension adds to whatever time remains (or, if already past, starts from now).
  const base = Math.max(currentEnd, Date.now());
  scheduleLiveSessionEnd(io, liveSessionId, base + extensionMs);
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

  // Country-aware resources for the affected user (international fallback when
  // unknown). Shown ONLY to the affected sender — the matched keywords reveal
  // what they said and must never be disclosed to the peer.
  const affected = await prisma.user.findUnique({
    where: { id: userId },
    select: { crisisCountry: true },
  });
  const resources = getCrisisResources(affected?.crisisCountry ?? null);

  socket.emit("crisis:detected", {
    resources,
    keywords: crisisResult.matchedKeywords,
  });

  try {
    await recordCrisisEvent({
      userId,
      conversationId,
      liveSessionId: liveSessionId ?? null,
      triggerKeywords: crisisResult.matchedKeywords,
      resourcesShown: resources.map((r) => r.name),
    });
  } catch (err) {
    console.error("Failed to log crisis event:", err);
  }
}

/**
 * Per-event compliance guard for content-producing socket events. Uses the
 * short-TTL cached check; enforcement/withdrawal invalidate that cache and
 * disconnect sockets, so this is a second lock on the same door.
 */
async function socketCompliant(socket: Socket, userId: string): Promise<boolean> {
  const result = await checkUserComplianceCached(userId);
  if (!result.ok) {
    socket.emit("error", { message: "Account compliance required" });
    socket.disconnect(true);
    return false;
  }
  return true;
}

export function setupChatGateway(io: Server): void {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return next(new Error("Invalid token"));
    }

    // A valid JWT is not enough: the account must also satisfy the canonical
    // compliance gate (not deleted/banned/suspended, 18+, current terms and
    // sensitive-data consent). Fail closed on any doubt.
    const compliance = await checkUserCompliance(payload.userId);
    if (!compliance.ok) {
      if (compliance.reason === "banned") {
        return next(new Error("Your account has been permanently banned"));
      }
      if (compliance.reason === "suspended" && compliance.suspendedUntil) {
        return next(
          new Error(
            `Your account is suspended until ${compliance.suspendedUntil.toISOString().split("T")[0]}`,
          ),
        );
      }
      if (compliance.reason === "check_failed") {
        return next(new Error("Authentication check failed"));
      }
      return next(new Error(`compliance_required:${compliance.reason}`));
    }

    socket.data.userId = payload.userId;
    socket.data.tier = payload.tier;
    next();
  });

  io.on("connection", async (socket: Socket) => {
    const userId = socket.data.userId as string;
    const userTier = socket.data.tier as string;

    // Join user-specific room for notifications (match proposals, etc.)
    socket.join(`user:${userId}`);

    // Register presence
    await setOnline(userId, socket.id);

    // Check for pending match proposal and re-send if one exists (only if user hasn't accepted yet)
    try {
      const proposalId = await redis.get(`match:pending:${userId}`);
      if (proposalId) {
        const proposalData = await redis.get(`match:proposal:${proposalId}`);
        if (proposalData) {
          const proposal = JSON.parse(proposalData);
          const isUserA = proposal.userAId === userId;
          const alreadyAccepted = isUserA ? proposal.userAAccepted : proposal.userBAccepted;
          if (!alreadyAccepted) {
            socket.emit("match:proposed", {
              proposalId,
              partnerSummary: isUserA ? proposal.userBSummary : proposal.userASummary,
              partnerCategory: isUserA ? proposal.userBCategory : proposal.userACategory,
            });
          }
        }
      }
    } catch (err) {
      console.error("Failed to check pending proposal on connect:", err);
    }

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
      try {
        await assertActiveConversationParticipant(data.conversationId, userId);
      } catch {
        socket.emit("error", { message: "Invalid or inactive conversation" });
        return;
      }

      socket.join(`conversation:${data.conversationId}`);
      socket.emit("conversation:joined", { conversationId: data.conversationId });
    });

    socket.on("conversation:message", async (data: { conversationId: string; content: string }) => {
      if (!(await socketCompliant(socket, userId))) return;
      if (!data.content || data.content.length > 5000) {
        socket.emit("error", { message: "Message must be between 1 and 5000 characters" });
        return;
      }
      if (!checkMessageRate(userId)) {
        socket.emit("error", { message: "Rate limit exceeded" });
        return;
      }

      try {
        // Authorize BEFORE crisis detection or persistence: a non-participant
        // must not be able to trigger crisis logging or writes on a thread.
        await assertActiveConversationParticipant(data.conversationId, userId);

        await handleCrisisDetection(io, socket, userId, data.content, data.conversationId);

        const message = await sendAsyncMessage(data.conversationId, userId, data.content);

        // Look up the partner's translation prefs and translate before broadcasting
        // so the recipient's socket receives pre-translated content. Sender's own
        // echo (their local UI) uses the original text.
        const conversation = await prisma.conversation.findUnique({
          where: { id: data.conversationId },
          select: { userAId: true, userBId: true },
        });
        const partnerId = conversation
          ? conversation.userAId === userId ? conversation.userBId : conversation.userAId
          : null;

        let translatedContent: string | null = null;
        let partnerPrefs: { preferredLanguage: string | null; preferredDialect: string | null; autoTranslateEnabled: boolean } | null = null;
        if (partnerId) {
          partnerPrefs = await prisma.user.findUnique({
            where: { id: partnerId },
            select: { preferredLanguage: true, preferredDialect: true, autoTranslateEnabled: true },
          });
          if (
            partnerPrefs?.autoTranslateEnabled &&
            partnerPrefs.preferredLanguage &&
            isSupportedLanguage(partnerPrefs.preferredLanguage) &&
            message.sourceLanguage !== partnerPrefs.preferredLanguage
          ) {
            try {
              const r = await translateText(data.content, partnerPrefs.preferredLanguage, {
                dialect: partnerPrefs.preferredDialect ?? undefined,
                knownSourceLang: message.sourceLanguage ?? undefined,
              });
              if (r.translated !== data.content) translatedContent = r.translated;
            } catch (err) {
              console.error("gateway translate failed:", err);
            }
          }
        }

        socket.to(`conversation:${data.conversationId}`).emit("conversation:message", {
          conversationId: data.conversationId,
          messageId: message.id,
          senderId: userId,
          content: translatedContent ?? data.content,
          originalContent: data.content,
          translated: translatedContent !== null,
          sourceLanguage: message.sourceLanguage ?? null,
          sentAt: message.sentAt.toISOString(),
        });
      } catch (err: any) {
        socket.emit("error", { message: err.message ?? "Failed to send message" });
      }
    });

    socket.on("conversation:voice-note", async (data: { conversationId: string; audio: string; durationMs: number; waveform?: number[] }) => {
      // Same gates as text: compliance (blocks users who can't send text),
      // participant authorization, and rate limiting — BEFORE any processing.
      // Audio itself cannot be pre-moderated; sendVoiceNote flags it for review.
      if (!(await socketCompliant(socket, userId))) return;
      if (!checkMessageRate(userId)) {
        socket.emit("error", { message: "Rate limit exceeded" });
        return;
      }
      try {
        await assertActiveConversationParticipant(data.conversationId, userId);
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
      } catch (err: any) {
        socket.emit("error", { message: err.message ?? "Failed to send voice note" });
      }
    });

    socket.on("message:delivered", async (data: { messageIds: string[] }) => {
      await markDelivered(data.messageIds, userId);
    });

    socket.on("message:read", async (data: { conversationId: string; upToMessageId: string }) => {
      try {
        await assertConversationParticipant(data.conversationId, userId);
      } catch {
        socket.emit("error", { message: "Not a participant" });
        return;
      }
      await markRead(data.conversationId, userId, data.upToMessageId);
      socket.to(`conversation:${data.conversationId}`).emit("message:read", {
        conversationId: data.conversationId,
        upToMessageId: data.upToMessageId,
        readBy: userId,
      });
    });

    // --- Live session events ---

    socket.on("livesession:invite", async (data: { conversationId: string }) => {
      let partnerId: string;
      try {
        // Participant check first — otherwise a non-member would resolve to
        // userAId as "partner" and could invite strangers into a session.
        ({ partnerId } = await assertActiveConversationParticipant(data.conversationId, userId));
      } catch {
        socket.emit("error", { message: "Invalid conversation" });
        return;
      }
      if (!(await isOnline(partnerId))) {
        socket.emit("error", { message: "Partner is not online" });
        return;
      }

      liveSessionInvites.set(data.conversationId, { inviterId: userId, inviterTier: userTier, createdAt: Date.now() });

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
      // The accepter must be the other participant of this conversation.
      try {
        await assertActiveConversationParticipant(data.conversationId, userId);
      } catch {
        socket.emit("error", { message: "Not a participant" });
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
      if (!(await socketCompliant(socket, userId))) return;
      if (!data.content || data.content.length > 5000) {
        socket.emit("error", { message: "Message must be between 1 and 5000 characters" });
        return;
      }
      if (!checkMessageRate(userId)) {
        socket.emit("error", { message: "Rate limit exceeded" });
        return;
      }

      // Authorize the session (and that it belongs to this conversation)
      // before crisis detection or buffering.
      try {
        const session = await assertLiveSessionParticipant(data.liveSessionId, userId);
        if (session.conversationId !== data.conversationId) {
          socket.emit("error", { message: "Session/conversation mismatch" });
          return;
        }
      } catch {
        socket.emit("error", { message: "Not a participant" });
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
      try {
        await assertLiveSessionParticipant(data.liveSessionId, userId);
      } catch {
        socket.emit("error", { message: "Not a participant" });
        return;
      }
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
          extendLiveSessionTimer(io, data.liveSessionId, limits.extendedDurationMs);
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
      try {
        await assertLiveSessionParticipant(data.liveSessionId, userId);
      } catch {
        socket.emit("error", { message: "Not a participant" });
        return;
      }
      await endLiveSession(data.liveSessionId);
      const timer = liveSessionTimers.get(data.liveSessionId);
      if (timer) {
        clearTimeout(timer);
        liveSessionTimers.delete(data.liveSessionId);
      }
      liveSessionEndsAt.delete(data.liveSessionId);
      extendRequests.delete(data.liveSessionId);

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

    // --- Match proposal accept/decline ---

    socket.on("match:accept", async (data: { proposalId: string }) => {
      if (!(await socketCompliant(socket, userId))) return;
      try {
        await acceptProposal(data.proposalId, userId);
        // match:confirmed is emitted to both users via the notification bus listener below
      } catch (err) {
        console.error("match:accept error:", err);
        socket.emit("error", { message: "Failed to accept match" });
      }
    });

    socket.on("match:decline", async (data: { proposalId: string }) => {
      try {
        await declineProposal(data.proposalId, userId);
      } catch (err) {
        console.error("match:decline error:", err);
        socket.emit("error", { message: "Failed to decline match" });
      }
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
      setActiveConversation(userId, null).catch((err) => console.error("Failed to clear active conversation:", err));
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

  // Listen for match proposal/confirmation notifications and route via Socket.IO user rooms
  notificationBus.on("notification", (event: NotificationEvent) => {
    if (event.type === "match_proposed") {
      io.to(`user:${event.recipientId}`).emit("match:proposed", event.payload);
    } else if (event.type === "match_confirmed") {
      io.to(`user:${event.recipientId}`).emit("match:confirmed", event.payload);
    } else if (event.type === "match_declined") {
      io.to(`user:${event.recipientId}`).emit("match:declined", event.payload);
    }
  });
}
