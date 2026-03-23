import type { Prisma } from "@prisma/client";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { emitNotification } from "../notifications/notification.service.js";
import { getTierLimits } from "../config/tiers.js";
import { isBlocked } from "../safety/safety.service.js";
import type { MatchRequest, MatchResult } from "./matching.types.js";

const GLOBAL_QUEUE_KEY = "match:queue:global";
const RECENT_MATCH_PREFIX = "match:recent:";
const RECENT_MATCH_TTL = 24 * 60 * 60; // 24 hours
const DAILY_MATCH_PREFIX = "matches:";
const ANALYSE_PENDING_PREFIX = "analyse:pending:";
const STALE_ENTRY_MS = 30 * 60 * 1000; // 30 minutes
const MIN_HYBRID_SCORE = 0.25;

export async function joinQueue(request: MatchRequest): Promise<void> {
  const limits = getTierLimits(request.tier);
  const score = request.joinedAt + limits.priorityScoreOffset;

  // Store in Redis without embedding (too large for Redis JSON)
  const redisPayload = { ...request };
  delete redisPayload.embedding;
  await redis.zadd(GLOBAL_QUEUE_KEY, score, JSON.stringify(redisPayload));

  // Store embedding in Postgres via raw SQL
  if (request.embedding) {
    const vectorStr = `[${request.embedding.join(",")}]`;
    const matchCtx = request.matchContext ? JSON.stringify(request.matchContext) : null;
    await prisma.$executeRawUnsafe(
      `INSERT INTO match_queue_entries (id, user_id, tier, joined_at, match_context, embedding, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5::vector, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         embedding = $5::vector,
         match_context = $4::jsonb,
         joined_at = $3,
         tier = $2`,
      request.userId,
      request.tier,
      new Date(request.joinedAt),
      matchCtx,
      vectorStr,
    );
  }
}

export async function leaveQueue(userId: string, _category?: string): Promise<void> {
  // Remove from Redis
  const members = await redis.zrange(GLOBAL_QUEUE_KEY, 0, -1);
  for (const member of members) {
    const parsed = JSON.parse(member) as MatchRequest;
    if (parsed.userId === userId) {
      await redis.zrem(GLOBAL_QUEUE_KEY, member);
      break;
    }
  }

  // Remove from Postgres
  await prisma.$executeRawUnsafe(
    `DELETE FROM match_queue_entries WHERE user_id = $1`,
    userId,
  );
}

export async function getQueueSize(): Promise<number> {
  return redis.zcard(GLOBAL_QUEUE_KEY);
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

function buildMatchContext(
  a: MatchRequest,
  b: MatchRequest,
): Record<string, unknown> | undefined {
  const ctxA = a.matchContext as Record<string, unknown> | undefined;
  const ctxB = b.matchContext as Record<string, unknown> | undefined;
  if (!ctxA && !ctxB) return undefined;

  return {
    userA: ctxA
      ? { summary: ctxA.summary, keywords: ctxA.keywords }
      : undefined,
    userB: ctxB
      ? { summary: ctxB.summary, keywords: ctxB.keywords }
      : undefined,
  };
}

export async function tryMatchGlobal(): Promise<MatchResult | null> {
  const members = await redis.zrange(GLOBAL_QUEUE_KEY, 0, -1);
  if (members.length < 2) return null;

  const candidates = members.map((m) => JSON.parse(m) as MatchRequest);
  const anchor = candidates[0];

  // Query pgvector for cosine similarities against anchor
  const similarities = await prisma.$queryRawUnsafe<
    Array<{ user_id: string; similarity: number }>
  >(
    `SELECT
       b.user_id,
       1 - (a.embedding <=> b.embedding) AS similarity
     FROM match_queue_entries a, match_queue_entries b
     WHERE a.user_id = $1
       AND b.user_id != $1
     ORDER BY a.embedding <=> b.embedding
     LIMIT 20`,
    anchor.userId,
  );

  let bestMatch: { userId: string; score: number; memberIndex: number; similarity: number } | null = null;

  for (const sim of similarities) {
    const candidateIndex = candidates.findIndex((c) => c.userId === sim.user_id);
    if (candidateIndex === -1) continue; // stale Postgres entry

    const candidate = candidates[candidateIndex];

    if (await isBlocked(anchor.userId, candidate.userId)) continue;
    if (await wereRecentlyMatched(anchor.userId, candidate.userId)) continue;

    // Hybrid score: 90% cosine similarity + 10% wait time bonus
    const cosinePart = sim.similarity * 0.9;
    const waitMs = Date.now() - candidate.joinedAt;
    const waitBonus = Math.min(waitMs / (10 * 60 * 1000), 1) * 0.1; // caps at 10 min

    const hybridScore = cosinePart + waitBonus;

    if (!bestMatch || hybridScore > bestMatch.score) {
      bestMatch = { userId: candidate.userId, score: hybridScore, memberIndex: candidateIndex, similarity: sim.similarity };
    }
  }

  if (!bestMatch || bestMatch.score < MIN_HYBRID_SCORE) return null;

  const matched = candidates[bestMatch.memberIndex];

  // Remove both from Redis queue
  await redis.zrem(GLOBAL_QUEUE_KEY, members[0], members[bestMatch.memberIndex]);

  // Remove both from Postgres
  await prisma.$executeRawUnsafe(
    `DELETE FROM match_queue_entries WHERE user_id IN ($1, $2)`,
    anchor.userId,
    matched.userId,
  );

  // Record recent match
  await markRecentlyMatched(anchor.userId, matched.userId);

  // Increment daily counters
  await incrementDailyMatchCount(anchor.userId);
  await incrementDailyMatchCount(matched.userId);

  // Build match context
  const matchContext = buildMatchContext(anchor, matched);
  const ctxA = anchor.matchContext as Record<string, unknown> | undefined;
  const ctxB = matched.matchContext as Record<string, unknown> | undefined;
  const displayCategory = (ctxA?.primaryCategory || ctxB?.primaryCategory || "identity") as string;

  // Create conversation
  const conversation = await prisma.conversation.create({
    data: {
      userAId: anchor.userId,
      userBId: matched.userId,
      category: displayCategory,
      subTag: anchor.subTag || matched.subTag || null,
      matchContext: (matchContext ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  // Log anonymised match quality (no user identifiers)
  await prisma.matchQualityLog.create({
    data: {
      similarityScore: bestMatch.similarity,
      categoryA: displayCategory,
      categoryB: (ctxB?.primaryCategory || ctxA?.primaryCategory || "identity") as string,
    },
  });

  // Clean up encrypted raw text from Redis
  await redis.del(`${ANALYSE_PENDING_PREFIX}${anchor.userId}`);
  await redis.del(`${ANALYSE_PENDING_PREFIX}${matched.userId}`);

  const result: MatchResult = {
    conversationId: conversation.id,
    userAId: anchor.userId,
    userBId: matched.userId,
    category: displayCategory,
    subTag: conversation.subTag ?? undefined,
  };

  emitNotification({
    type: "new_match",
    recipientId: anchor.userId,
    payload: { conversationId: conversation.id, category: displayCategory, partnerId: matched.userId },
    createdAt: new Date(),
  });
  emitNotification({
    type: "new_match",
    recipientId: matched.userId,
    payload: { conversationId: conversation.id, category: displayCategory, partnerId: anchor.userId },
    createdAt: new Date(),
  });

  return result;
}

// --- Stale entry cleanup ---

export async function cleanupStaleEntries(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_ENTRY_MS);

  // Clean Postgres
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM match_queue_entries WHERE created_at < $1`,
    cutoff,
  );

  // Clean Redis
  const members = await redis.zrange(GLOBAL_QUEUE_KEY, 0, -1);
  let removed = 0;
  for (const member of members) {
    const parsed = JSON.parse(member) as MatchRequest;
    if (parsed.joinedAt < cutoff.getTime()) {
      await redis.zrem(GLOBAL_QUEUE_KEY, member);
      removed++;
    }
  }

  return removed + (typeof result === "number" ? result : 0);
}
