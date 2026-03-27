import { notificationBus, type NotificationEvent } from "./notification.service.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { getNickname } from "../conversation/conversation.service.js";

const ACTIVE_PREFIX = "push:active:";

export async function setActiveConversation(
  userId: string,
  conversationId: string | null
): Promise<void> {
  if (conversationId) {
    await redis.set(`${ACTIVE_PREFIX}${userId}`, conversationId, "EX", 3600);
  } else {
    await redis.del(`${ACTIVE_PREFIX}${userId}`);
  }
}

async function getActiveConversation(userId: string): Promise<string | null> {
  return redis.get(`${ACTIVE_PREFIX}${userId}`);
}

async function getPushToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushToken: true },
  });
  return user?.pushToken ?? null;
}

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data,
        sound: "default",
      }),
    });
    const json = await res.json();
    console.log(`[push] Expo response:`, JSON.stringify(json));
  } catch (err) {
    console.error("[push] Failed to send push notification:", err);
  }
}

const PUSH_TYPES = new Set([
  "new_match",
  "new_message",
  "match_online",
  "match_proposed",
  "match_confirmed",
  "match_declined",
  "live_session_invite",
]);

export function startPushListener(): void {
  notificationBus.on("notification", (event: NotificationEvent) => {
    // Fire-and-forget — errors must not crash the process
    handlePushNotification(event).catch((err) => {
      console.error("Push notification handler error:", err);
    });
  });
}

async function handlePushNotification(event: NotificationEvent): Promise<void> {
  const { type, recipientId, payload } = event;

  if (!PUSH_TYPES.has(type)) return;

  console.log(`[push] Processing ${type} for recipient ${recipientId}`);

  const conversationId = payload.conversationId as string | undefined;

  // Suppress if user is actively viewing this conversation
  if (conversationId) {
    const active = await getActiveConversation(recipientId);
    if (active === conversationId) {
      console.log(`[push] Suppressed — recipient viewing conversation`);
      return;
    }
  }

  const token = await getPushToken(recipientId);
  if (!token) {
    console.log(`[push] No push token found for recipient ${recipientId}`);
    return;
  }

  console.log(`[push] Sending ${type} push to token ${token.slice(0, 25)}...`);

  const pushData = { screen: "chat", conversationId };

  switch (type) {
    case "new_match":
      await sendExpoPush(
        token,
        "New Match",
        "You've been matched with someone who understands",
        pushData
      );
      break;

    case "new_message": {
      const senderId = payload.senderId as string;
      const messageContent = payload.messageContent as string | undefined;
      const messageType = payload.messageType as string | undefined;
      const sender = await prisma.user.findUnique({
        where: { id: senderId },
        select: { anonymousAlias: true },
      });
      const alias = sender?.anonymousAlias ?? "Someone";
      // Check if recipient set a nickname for this sender in this conversation
      const nickname = conversationId
        ? await getNickname(conversationId, recipientId)
        : null;
      const senderName = nickname || alias;
      const body = messageType === "voice"
        ? "Sent you a voice note"
        : messageContent ?? "Sent you a message";
      await sendExpoPush(
        token,
        senderName,
        body,
        { ...pushData, senderAlias: senderName, conversationId },
      );
      break;
    }

    case "match_online":
      await sendExpoPush(
        token,
        "Match Online",
        "Your match is online — start a live session?",
        pushData
      );
      break;

    case "match_proposed":
      await sendExpoPush(
        token,
        "New Match Proposal",
        "Someone who understands wants to connect with you",
        { screen: "match", ...payload }
      );
      break;

    case "match_confirmed":
      await sendExpoPush(
        token,
        "Match Confirmed",
        "You're connected — say hello!",
        pushData
      );
      break;

    case "match_declined":
      await sendExpoPush(
        token,
        "Match Update",
        "Your match didn't go through — try again when you're ready",
        { screen: "home", ...payload }
      );
      break;

    case "live_session_invite":
      await sendExpoPush(
        token,
        "Live Session Invite",
        "Your match wants to start a live session",
        pushData
      );
      break;
  }
}
