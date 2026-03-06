import type { Prisma } from "@prisma/client";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { emitNotification } from "../notifications/notification.service.js";
import { getTierLimits } from "../config/tiers.js";
import { isBlocked } from "../safety/safety.service.js";
import type { MatchRequest, MatchResult } from "./matching.types.js";

const QUEUE_PREFIX = "match:queue:";
const RECENT_MATCH_PREFIX = "match:recent:";
const RECENT_MATCH_TTL = 24 * 60 * 60; // 24 hours
const DAILY_MATCH_PREFIX = "matches:";

export async function joinQueue(request: MatchRequest): Promise<void> {
  const key = `${QUEUE_PREFIX}${request.category}`;
  const limits = getTierLimits(request.tier);
  const score = request.joinedAt + limits.priorityScoreOffset;

  await redis.zadd(key, score, JSON.stringify(request));
}

export async function leaveQueue(userId: string, category: string): Promise<void> {
  const key = `${QUEUE_PREFIX}${category}`;
  const members = await redis.zrange(key, 0, -1);
  for (const member of members) {
    const parsed = JSON.parse(member) as MatchRequest;
    if (parsed.userId === userId) {
      await redis.zrem(key, member);
      return;
    }
  }
}

export async function getQueueSize(category: string): Promise<number> {
  return redis.zcard(`${QUEUE_PREFIX}${category}`);
}

// --- Daily match limits ---

function dailyMatchKey(userId: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${DAILY_MATCH_PREFIX}${userId}:${today}`;
}

function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

export async function getDailyMatchCount(userId: string): Promise<number> {
  const count = await redis.get(dailyMatchKey(userId));
  return count ? parseInt(count, 10) : 0;
}

export async function incrementDailyMatchCount(userId: string): Promise<number> {
  const key = dailyMatchKey(userId);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, secondsUntilMidnightUTC());
  }
  return count;
}

export interface DailyMatchStatus {
  used: number;
  limit: number;
  remaining: number; // -1 = unlimited
  resetsInSeconds: number;
}

export async function getDailyMatchStatus(userId: string, tier: string): Promise<DailyMatchStatus> {
  const limits = getTierLimits(tier);
  const used = await getDailyMatchCount(userId);
  const limit = limits.dailyNewMatches;
  return {
    used,
    limit,
    remaining: limit === 0 ? -1 : Math.max(0, limit - used),
    resetsInSeconds: secondsUntilMidnightUTC(),
  };
}

// --- Matching logic ---

async function wereRecentlyMatched(userAId: string, userBId: string): Promise<boolean> {
  const key = `${RECENT_MATCH_PREFIX}${userAId}`;
  return (await redis.sismember(key, userBId)) === 1;
}

async function markRecentlyMatched(userAId: string, userBId: string): Promise<void> {
  const keyA = `${RECENT_MATCH_PREFIX}${userAId}`;
  const keyB = `${RECENT_MATCH_PREFIX}${userBId}`;
  await redis.sadd(keyA, userBId);
  await redis.expire(keyA, RECENT_MATCH_TTL);
  await redis.sadd(keyB, userAId);
  await redis.expire(keyB, RECENT_MATCH_TTL);
}

function pairScore(a: MatchRequest, b: MatchRequest): number {
  let score = 0;
  if (a.subTag && b.subTag && a.subTag === b.subTag) score += 10;
  if (a.keywords?.length && b.keywords?.length) {
    const setB = new Set(b.keywords.map((k) => k.toLowerCase()));
    score += a.keywords.filter((k) => setB.has(k.toLowerCase())).length * 2;
  }
  if (a.intensity && b.intensity) {
    score += Math.max(0, 5 - Math.abs(a.intensity - b.intensity));
  }
  // Category overlap bonuses (soft signal, not hard requirement)
  const ctxA = a.matchContext as Record<string, unknown> | undefined;
  const ctxB = b.matchContext as Record<string, unknown> | undefined;
  if (ctxA && ctxB) {
    if (ctxA.primaryCategory === ctxB.primaryCategory) score += 10;
    if (ctxA.secondaryCategory && ctxA.secondaryCategory === ctxB.primaryCategory) score += 5;
    if (ctxB.secondaryCategory && ctxB.secondaryCategory === ctxA.primaryCategory) score += 5;
  }
  return score;
}

function buildMatchContext(
  a: MatchRequest,
  b: MatchRequest,
): Record<string, unknown> | undefined {
  const ctxA = a.matchContext as Record<string, unknown> | undefined;
  const ctxB = b.matchContext as Record<string, unknown> | undefined;
  if (!ctxA && !ctxB) return undefined;

  return {
    userA: ctxA
      ? { summary: ctxA.summary, keywords: ctxA.keywords, intensity: ctxA.intensity }
      : undefined,
    userB: ctxB
      ? { summary: ctxB.summary, keywords: ctxB.keywords, intensity: ctxB.intensity }
      : undefined,
  };
}

const ANALYSE_PENDING_PREFIX = "analyse:pending:";

export async function tryMatchInCategory(category: string): Promise<MatchResult | null> {
  const isAiPrompt = category === "ai-prompt";
  const key = `${QUEUE_PREFIX}${category}`;
  const members = await redis.zrange(key, 0, isAiPrompt ? 19 : 9);

  if (members.length < 2) return null;

  const candidates = members.map((m) => JSON.parse(m) as MatchRequest);

  console.log(`[match] ${category}: ${candidates.length} candidates`);
  for (const c of candidates) {
    console.log(`  - ${c.userId.slice(0, 8)} keywords=${JSON.stringify(c.keywords)} intensity=${c.intensity}`);
  }

  // Find best-scoring valid pair
  let bestPair: { i: number; j: number; score: number } | null = null;

  for (let i = 0; i < candidates.length - 1; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];

      const recent = await wereRecentlyMatched(a.userId, b.userId);
      if (recent) {
        console.log(`  [skip] ${a.userId.slice(0, 8)} + ${b.userId.slice(0, 8)} recently matched`);
        continue;
      }

      const blocked = await isBlocked(a.userId, b.userId);
      if (blocked) {
        console.log(`  [skip] ${a.userId.slice(0, 8)} + ${b.userId.slice(0, 8)} blocked`);
        continue;
      }

      const score = pairScore(a, b);
      console.log(`  [score] ${a.userId.slice(0, 8)} + ${b.userId.slice(0, 8)} = ${score}`);
      if (!bestPair || score > bestPair.score) {
        bestPair = { i, j, score };
      }
    }
  }

  if (!bestPair) {
    console.log(`  [result] no valid pair found`);
    return null;
  }
  console.log(`  [result] best pair score=${bestPair.score}`);

  const a = candidates[bestPair.i];
  const b = candidates[bestPair.j];

  // Remove from queue
  await redis.zrem(key, members[bestPair.i], members[bestPair.j]);

  // Record recent match
  await markRecentlyMatched(a.userId, b.userId);

  // Increment daily match counters
  await incrementDailyMatchCount(a.userId);
  await incrementDailyMatchCount(b.userId);

  // Build match context (summaries + keywords, never raw text)
  const matchContext = buildMatchContext(a, b);

  // For ai-prompt matches, use the AI-determined category for display
  const ctxACat = (a.matchContext as Record<string, unknown> | undefined)?.primaryCategory as string | undefined;
  const ctxBCat = (b.matchContext as Record<string, unknown> | undefined)?.primaryCategory as string | undefined;
  const displayCategory = isAiPrompt ? (ctxACat || ctxBCat || "identity") : category;

  // Create conversation
  const conversation = await prisma.conversation.create({
    data: {
      userAId: a.userId,
      userBId: b.userId,
      category: displayCategory,
      subTag: a.subTag || b.subTag || null,
      matchContext: (matchContext ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  // Clean up encrypted raw text from Redis
  await redis.del(`${ANALYSE_PENDING_PREFIX}${a.userId}`);
  await redis.del(`${ANALYSE_PENDING_PREFIX}${b.userId}`);

  const result: MatchResult = {
    conversationId: conversation.id,
    userAId: a.userId,
    userBId: b.userId,
    category,
    subTag: conversation.subTag ?? undefined,
  };

  emitNotification({
    type: "new_match",
    recipientId: a.userId,
    payload: { conversationId: conversation.id, category, partnerId: b.userId },
    createdAt: new Date(),
  });
  emitNotification({
    type: "new_match",
    recipientId: b.userId,
    payload: { conversationId: conversation.id, category, partnerId: a.userId },
    createdAt: new Date(),
  });

  return result;
}
