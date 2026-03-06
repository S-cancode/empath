import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";

const ONLINE_SET = "presence:online";
const PRESENCE_PREFIX = "presence:";
const PRESENCE_TTL = 300; // 5 min TTL as heartbeat fallback

export async function setOnline(userId: string, socketId: string): Promise<void> {
  await redis.sadd(ONLINE_SET, userId);
  await redis.hset(`${PRESENCE_PREFIX}${userId}`, {
    status: "online",
    socketId,
    lastSeen: Date.now().toString(),
  });
  await redis.expire(`${PRESENCE_PREFIX}${userId}`, PRESENCE_TTL);
}

export async function setOffline(userId: string): Promise<void> {
  await redis.srem(ONLINE_SET, userId);
  await redis.hset(`${PRESENCE_PREFIX}${userId}`, {
    status: "offline",
    lastSeen: Date.now().toString(),
  });
  await redis.hdel(`${PRESENCE_PREFIX}${userId}`, "socketId");
}

export async function isOnline(userId: string): Promise<boolean> {
  return (await redis.sismember(ONLINE_SET, userId)) === 1;
}

export async function getOnlineUsersFromList(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const pipeline = redis.pipeline();
  for (const id of userIds) {
    pipeline.sismember(ONLINE_SET, id);
  }
  const results = await pipeline.exec();
  if (!results) return [];
  return userIds.filter((_, i) => results[i]?.[1] === 1);
}

export async function getPresenceForConversation(
  conversationId: string,
): Promise<{ userAOnline: boolean; userBOnline: boolean }> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userAId: true, userBId: true },
  });

  if (!conversation) {
    return { userAOnline: false, userBOnline: false };
  }

  const [userAOnline, userBOnline] = await Promise.all([
    isOnline(conversation.userAId),
    isOnline(conversation.userBId),
  ]);

  return { userAOnline, userBOnline };
}

export async function getPartnerIdsForUser(userId: string): Promise<string[]> {
  const conversations = await prisma.conversation.findMany({
    where: {
      status: "active",
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { userAId: true, userBId: true },
  });

  return conversations.map((c) =>
    c.userAId === userId ? c.userBId : c.userAId,
  );
}
