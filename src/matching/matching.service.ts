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

  // Skip if anchor already has a pending proposal
  const anchorPending = await redis.get(`match:pending:${anchor.userId}`);
  if (anchorPending) return null;

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

  // Build proposal instead of creating conversation directly
  // Note: do NOT remove from queue, increment daily counts, or mark as recent
  // until both users accept the proposal. This happens in acceptProposal().
  const ctxA = anchor.matchContext as Record<string, unknown> | undefined;
  const ctxB = matched.matchContext as Record<string, unknown> | undefined;
  const displayCategory = (ctxA?.primaryCategory || ctxB?.primaryCategory || "identity") as string;

  const proposalId = `proposal:${Date.now()}:${anchor.userId.slice(0, 8)}`;
  const proposal = {
    proposalId,
    userAId: anchor.userId,
    userBId: matched.userId,
    category: displayCategory,
    subTag: anchor.subTag || matched.subTag || null,
    similarity: bestMatch.similarity,
    userASummary: (ctxA?.summary as string) || "Someone going through a similar experience.",
    userBSummary: (ctxB?.summary as string) || "Someone going through a similar experience.",
    userACategory: (ctxA?.primaryCategory as string) || displayCategory,
    userBCategory: (ctxB?.primaryCategory as string) || displayCategory,
    matchContextA: ctxA ? { summary: ctxA.summary, keywords: ctxA.keywords } : undefined,
    matchContextB: ctxB ? { summary: ctxB.summary, keywords: ctxB.keywords } : undefined,
    userAAccepted: false,
    userBAccepted: false,
    createdAt: Date.now(),
  };

  // Store proposal in Redis with 5-minute TTL
  await redis.set(
    `match:proposal:${proposalId}`,
    JSON.stringify(proposal),
    "EX",
    300,
  );

  // Mark both users as having a pending proposal (prevents re-matching)
  await redis.set(`match:pending:${anchor.userId}`, proposalId, "EX", 300);
  await redis.set(`match:pending:${matched.userId}`, proposalId, "EX", 300);

  // Notify both users about the proposal
  emitNotification({
    type: "match_proposed",
    recipientId: anchor.userId,
    payload: {
      proposalId,
      partnerSummary: proposal.userBSummary,
      partnerCategory: proposal.userBCategory,
    },
    createdAt: new Date(),
  });
  emitNotification({
    type: "match_proposed",
    recipientId: matched.userId,
    payload: {
      proposalId,
      partnerSummary: proposal.userASummary,
      partnerCategory: proposal.userACategory,
    },
    createdAt: new Date(),
  });

  return {
    conversationId: proposalId, // temporary — actual conversation created on accept
    userAId: anchor.userId,
    userBId: matched.userId,
    category: displayCategory,
    subTag: proposal.subTag ?? undefined,
  };
}

// --- Match proposal accept/decline ---

export async function acceptProposal(
  proposalId: string,
  userId: string,
): Promise<{ status: "waiting" | "matched"; conversationId?: string }> {
  const raw = await redis.get(`match:proposal:${proposalId}`);
  if (!raw) return { status: "waiting" }; // expired

  const proposal = JSON.parse(raw);
  const isUserA = proposal.userAId === userId;
  const isUserB = proposal.userBId === userId;
  if (!isUserA && !isUserB) return { status: "waiting" };

  if (isUserA) proposal.userAAccepted = true;
  if (isUserB) proposal.userBAccepted = true;

  if (proposal.userAAccepted && proposal.userBAccepted) {
    // Both accepted — create conversation
    await redis.del(`match:proposal:${proposalId}`);
    await redis.del(`match:pending:${proposal.userAId}`);
    await redis.del(`match:pending:${proposal.userBId}`);

    const matchContext = {
      userA: proposal.matchContextA,
      userB: proposal.matchContextB,
    };

    const conversation = await prisma.conversation.create({
      data: {
        userAId: proposal.userAId,
        userBId: proposal.userBId,
        category: proposal.category,
        subTag: proposal.subTag,
        matchContext: matchContext as Prisma.InputJsonValue,
      },
    });

    // Log anonymised match quality
    await prisma.matchQualityLog.create({
      data: {
        similarityScore: proposal.similarity,
        categoryA: proposal.userACategory,
        categoryB: proposal.userBCategory,
      },
    });

    // Increment daily counters
    await incrementDailyMatchCount(proposal.userAId);
    await incrementDailyMatchCount(proposal.userBId);

    // Record recent match
    await markRecentlyMatched(proposal.userAId, proposal.userBId);

    // Clean up encrypted raw text
    await redis.del(`${ANALYSE_PENDING_PREFIX}${proposal.userAId}`);
    await redis.del(`${ANALYSE_PENDING_PREFIX}${proposal.userBId}`);

    // Remove from match queue
    await prisma.$executeRawUnsafe(
      `DELETE FROM match_queue_entries WHERE user_id IN ($1, $2)`,
      proposal.userAId,
      proposal.userBId,
    );

    // Notify both
    emitNotification({
      type: "match_confirmed",
      recipientId: proposal.userAId,
      payload: { conversationId: conversation.id, partnerId: proposal.userBId },
      createdAt: new Date(),
    });
    emitNotification({
      type: "match_confirmed",
      recipientId: proposal.userBId,
      payload: { conversationId: conversation.id, partnerId: proposal.userAId },
      createdAt: new Date(),
    });

    return { status: "matched", conversationId: conversation.id };
  }

  // Only one accepted so far — update and wait
  await redis.set(
    `match:proposal:${proposalId}`,
    JSON.stringify(proposal),
    "EX",
    300,
  );
  return { status: "waiting" };
}

export async function declineProposal(
  proposalId: string,
  userId: string,
): Promise<void> {
  const raw = await redis.get(`match:proposal:${proposalId}`);
  if (!raw) return; // expired

  const proposal = JSON.parse(raw);
  await redis.del(`match:proposal:${proposalId}`);
  await redis.del(`match:pending:${proposal.userAId}`);
  await redis.del(`match:pending:${proposal.userBId}`);

  const decliningIsA = proposal.userAId === userId;
  const decliningUserId = decliningIsA ? proposal.userAId : proposal.userBId;
  const otherUserId = decliningIsA ? proposal.userBId : proposal.userAId;

  // Remove declining user from queue entirely
  await leaveQueue(decliningUserId);

  // Re-queue the other user so they aren't left in limbo.
  // tryMatchGlobal() removed both from the Redis sorted set when creating the proposal,
  // so the other user needs to be re-added to be matchable again.
  const otherCtx = decliningIsA ? proposal.matchContextB : proposal.matchContextA;
  const otherUser = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { subscriptionTier: true },
  });
  const otherCategory = decliningIsA ? proposal.userBCategory : proposal.userACategory;

  await joinQueue({
    userId: otherUserId,
    tier: otherUser?.subscriptionTier ?? "FREE",
    category: otherCategory ?? "ai-prompt",
    subTag: proposal.subTag ?? undefined,
    joinedAt: Date.now(),
    matchContext: otherCtx,
  });

  // Notify the other user that the match was declined
  emitNotification({
    type: "match_declined",
    recipientId: otherUserId,
    payload: { proposalId },
    createdAt: new Date(),
  });
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
