import type { Prisma } from "@prisma/client";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { emitNotification } from "../notifications/notification.service.js";
import { getTierLimits } from "../config/tiers.js";
import { isBlocked } from "../safety/safety.service.js";
import type { MatchRequest, MatchResult } from "./matching.types.js";

const GLOBAL_QUEUE_KEY = "match:queue:global";
const RECENT_MATCH_PREFIX = "match:recent:";
const RECENT_MATCH_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h cooldown window
const RECENT_MATCH_MAX_PENALTY = 0.3; // subtracted from hybrid score at t=0
const DAILY_MATCH_PREFIX = "matches:";
const ANALYSE_PENDING_PREFIX = "analyse:pending:";
const STALE_ENTRY_MS = 30 * 60 * 1000;
const MIN_HYBRID_SCORE = 0.25;
const QUEUE_UPDATED_CHANNEL = "queue:updated";

// --- Queue membership (Postgres is source of truth) ---

export async function joinQueue(request: MatchRequest): Promise<void> {
  const limits = getTierLimits(request.tier);
  const score = request.joinedAt + limits.priorityScoreOffset;

  const redisPayload = { ...request };
  delete redisPayload.embedding;
  const member = JSON.stringify(redisPayload);

  // Postgres first (holds embedding). If this fails, nothing else runs.
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

  // Redis second. If Redis fails, roll back the Postgres row to avoid orphans.
  try {
    await redis.zadd(GLOBAL_QUEUE_KEY, score, member);
    await redis.publish(QUEUE_UPDATED_CHANNEL, request.userId);
  } catch (err) {
    if (request.embedding) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM match_queue_entries WHERE user_id = $1`,
        request.userId,
      ).catch(() => {});
    }
    throw err;
  }
}

export async function leaveQueue(userId: string, _category?: string): Promise<void> {
  // Postgres first (source of truth for pgvector queries).
  await prisma.$executeRawUnsafe(
    `DELETE FROM match_queue_entries WHERE user_id = $1`,
    userId,
  );

  // Redis second. Orphan Redis entries are harmless (skipped by stale check) and
  // the reconciliation sweeper will clean them up.
  const members = await redis.zrange(GLOBAL_QUEUE_KEY, 0, -1);
  for (const member of members) {
    try {
      const parsed = JSON.parse(member) as MatchRequest;
      if (parsed.userId === userId) {
        await redis.zrem(GLOBAL_QUEUE_KEY, member);
        break;
      }
    } catch {
      // Skip malformed entries; the sweeper will clean them.
    }
  }
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
  remaining: number;
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

// --- Recent-match penalty (decayed over 24h) ---

function recentMatchKey(userId: string): string {
  return `${RECENT_MATCH_PREFIX}${userId}`;
}

/**
 * Returns a penalty in [0, RECENT_MATCH_MAX_PENALTY] to subtract from hybrid score.
 * Full penalty at t=0, linearly decays to 0 at t=24h. 0 if no prior match.
 */
async function recentMatchPenalty(userAId: string, userBId: string): Promise<number> {
  const score = await redis.zscore(recentMatchKey(userAId), userBId);
  if (score === null || score === undefined) return 0;
  const matchedAt = typeof score === "string" ? parseFloat(score) : score;
  const elapsed = Date.now() - matchedAt;
  if (elapsed >= RECENT_MATCH_WINDOW_MS) return 0;
  const decay = 1 - elapsed / RECENT_MATCH_WINDOW_MS;
  return RECENT_MATCH_MAX_PENALTY * decay;
}

async function markRecentlyMatched(userAId: string, userBId: string): Promise<void> {
  const now = Date.now();
  await redis.zadd(recentMatchKey(userAId), now, userBId);
  await redis.zadd(recentMatchKey(userBId), now, userAId);
  // Purge entries older than the window so sets stay bounded.
  const cutoff = now - RECENT_MATCH_WINDOW_MS;
  await redis.zremrangebyscore(recentMatchKey(userAId), 0, cutoff);
  await redis.zremrangebyscore(recentMatchKey(userBId), 0, cutoff);
}

// --- Matching logic ---

function buildMatchContext(
  a: MatchRequest,
  b: MatchRequest,
): Record<string, unknown> | undefined {
  const ctxA = a.matchContext as Record<string, unknown> | undefined;
  const ctxB = b.matchContext as Record<string, unknown> | undefined;
  if (!ctxA && !ctxB) return undefined;

  return {
    userA: ctxA ? { summary: ctxA.summary, keywords: ctxA.keywords } : undefined,
    userB: ctxB ? { summary: ctxB.summary, keywords: ctxB.keywords } : undefined,
  };
}

/**
 * Attempt to form as many disjoint matches as possible from the current queue.
 * Returns the list of created proposals. Used by the event-driven worker.
 */
export async function tryMatchAllPairs(): Promise<MatchResult[]> {
  const members = await redis.zrange(GLOBAL_QUEUE_KEY, 0, -1);
  if (members.length < 2) return [];

  const candidates = members.map((m) => JSON.parse(m) as MatchRequest);
  const consumed = new Set<string>();
  const results: MatchResult[] = [];

  for (let anchorIdx = 0; anchorIdx < candidates.length; anchorIdx++) {
    const anchor = candidates[anchorIdx];
    if (consumed.has(anchor.userId)) continue;

    const anchorPending = await redis.get(`match:pending:${anchor.userId}`);
    if (anchorPending) continue;

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

    let bestMatch:
      | { userId: string; score: number; memberIndex: number; similarity: number }
      | null = null;

    for (const sim of similarities) {
      if (sim.user_id === anchor.userId) continue;
      if (consumed.has(sim.user_id)) continue;

      const candidateIndex = candidates.findIndex((c) => c.userId === sim.user_id);
      if (candidateIndex === -1) continue;

      const candidate = candidates[candidateIndex];

      if (await isBlocked(anchor.userId, candidate.userId)) continue;

      const cosinePart = sim.similarity * 0.9;
      const waitMs = Date.now() - candidate.joinedAt;
      const waitBonus = Math.min(waitMs / (10 * 60 * 1000), 1) * 0.1;
      const penalty = await recentMatchPenalty(anchor.userId, candidate.userId);
      const hybridScore = cosinePart + waitBonus - penalty;

      if (!bestMatch || hybridScore > bestMatch.score) {
        bestMatch = {
          userId: candidate.userId,
          score: hybridScore,
          memberIndex: candidateIndex,
          similarity: sim.similarity,
        };
      }
    }

    if (!bestMatch) continue;
    if (bestMatch.score < MIN_HYBRID_SCORE) continue;

    const matched = candidates[bestMatch.memberIndex];

    // Remove both from queue stores. Postgres first (source of truth).
    await prisma.$executeRawUnsafe(
      `DELETE FROM match_queue_entries WHERE user_id IN ($1, $2)`,
      anchor.userId,
      matched.userId,
    );
    await redis.zrem(GLOBAL_QUEUE_KEY, members[anchorIdx], members[bestMatch.memberIndex]);

    consumed.add(anchor.userId);
    consumed.add(matched.userId);

    const ctxA = anchor.matchContext as Record<string, unknown> | undefined;
    const ctxB = matched.matchContext as Record<string, unknown> | undefined;
    const displayCategory = (ctxA?.primaryCategory || ctxB?.primaryCategory || "identity") as string;

    const proposalId = `proposal:${Date.now()}:${anchor.userId.slice(0, 8)}`;
    const proposal = {
      proposalId,
      userAId: anchor.userId,
      userBId: matched.userId,
      userAJoinedAt: anchor.joinedAt,
      userBJoinedAt: matched.joinedAt,
      userATier: anchor.tier,
      userBTier: matched.tier,
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

    const PROPOSAL_TTL = 300;
    await redis.set(`match:proposal:${proposalId}`, JSON.stringify(proposal), "EX", PROPOSAL_TTL);
    await redis.set(`match:pending:${anchor.userId}`, proposalId, "EX", PROPOSAL_TTL);
    await redis.set(`match:pending:${matched.userId}`, proposalId, "EX", PROPOSAL_TTL);

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

    results.push({
      conversationId: proposalId,
      userAId: anchor.userId,
      userBId: matched.userId,
      category: displayCategory,
      subTag: proposal.subTag ?? undefined,
    });
  }

  return results;
}

/**
 * Backward-compatible single-match wrapper. Returns the first created proposal
 * or null if no pair could be formed.
 */
export async function tryMatchGlobal(): Promise<MatchResult | null> {
  const results = await tryMatchAllPairs();
  return results[0] ?? null;
}

// --- Match proposal accept/decline ---

const ACCEPT_LUA = `
local key = KEYS[1]
local userId = ARGV[1]
local raw = redis.call('GET', key)
if not raw then return 'expired' end
local proposal = cjson.decode(raw)
local isA = proposal.userAId == userId
local isB = proposal.userBId == userId
if not isA and not isB then return 'invalid' end
if isA then proposal.userAAccepted = true end
if isB then proposal.userBAccepted = true end
if proposal.userAAccepted and proposal.userBAccepted then
  redis.call('DEL', key)
  redis.call('DEL', 'match:pending:' .. proposal.userAId)
  redis.call('DEL', 'match:pending:' .. proposal.userBId)
  return 'matched:' .. raw
end
redis.call('SET', key, cjson.encode(proposal), 'KEEPTTL')
return 'waiting'
`;

export async function acceptProposal(
  proposalId: string,
  userId: string,
): Promise<{ status: "waiting" | "matched"; conversationId?: string }> {
  const result = await redis.eval(
    ACCEPT_LUA,
    1,
    `match:proposal:${proposalId}`,
    userId,
  ) as string;

  if (result === "expired" || result === "invalid") return { status: "waiting" };
  if (result === "waiting") return { status: "waiting" };

  const raw = result.slice(8);
  const proposal = JSON.parse(raw);

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

  await prisma.matchQualityLog.create({
    data: {
      similarityScore: proposal.similarity,
      categoryA: proposal.userACategory,
      categoryB: proposal.userBCategory,
      conversationId: conversation.id,
      userAId: proposal.userAId,
      userBId: proposal.userBId,
    },
  });

  await incrementDailyMatchCount(proposal.userAId);
  await incrementDailyMatchCount(proposal.userBId);

  await markRecentlyMatched(proposal.userAId, proposal.userBId);

  await redis.del(`${ANALYSE_PENDING_PREFIX}${proposal.userAId}`);
  await redis.del(`${ANALYSE_PENDING_PREFIX}${proposal.userBId}`);

  await prisma.$executeRawUnsafe(
    `DELETE FROM match_queue_entries WHERE user_id IN ($1, $2)`,
    proposal.userAId,
    proposal.userBId,
  );

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

export async function declineProposal(
  proposalId: string,
  userId: string,
): Promise<void> {
  const raw = await redis.get(`match:proposal:${proposalId}`);
  if (!raw) return;

  const proposal = JSON.parse(raw);
  await redis.del(`match:proposal:${proposalId}`);
  await redis.del(`match:pending:${proposal.userAId}`);
  await redis.del(`match:pending:${proposal.userBId}`);

  const decliningIsA = proposal.userAId === userId;
  const decliningUserId = decliningIsA ? proposal.userAId : proposal.userBId;
  const otherUserId = decliningIsA ? proposal.userBId : proposal.userAId;

  await leaveQueue(decliningUserId);

  const otherCtx = decliningIsA ? proposal.matchContextB : proposal.matchContextA;
  const otherCategory = decliningIsA ? proposal.userBCategory : proposal.userACategory;
  const otherTier = (decliningIsA ? proposal.userBTier : proposal.userATier) as string | undefined;
  const otherJoinedAt = (decliningIsA ? proposal.userBJoinedAt : proposal.userAJoinedAt) as number | undefined;

  const tier = otherTier ?? (
    (await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { subscriptionTier: true },
    }))?.subscriptionTier ?? "FREE"
  );

  await joinQueue({
    userId: otherUserId,
    tier,
    category: otherCategory ?? "ai-prompt",
    subTag: proposal.subTag ?? undefined,
    joinedAt: otherJoinedAt ?? Date.now(),
    matchContext: otherCtx,
  });

  emitNotification({
    type: "match_declined",
    recipientId: otherUserId,
    payload: { proposalId },
    createdAt: new Date(),
  });
}

// --- Stale entry cleanup + bidirectional reconciliation ---

export async function cleanupStaleEntries(): Promise<number> {
  let removed = 0;

  // 1) Postgres: delete entries older than the stale window.
  if (isFinite(STALE_ENTRY_MS)) {
    const cutoff = new Date(Date.now() - STALE_ENTRY_MS);
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM match_queue_entries WHERE created_at < $1`,
      cutoff,
    );
    if (typeof result === "number") removed += result;
  }

  // 2) Redis: drop entries older than the stale window.
  const members = await redis.zrange(GLOBAL_QUEUE_KEY, 0, -1);
  if (isFinite(STALE_ENTRY_MS)) {
    const cutoffMs = Date.now() - STALE_ENTRY_MS;
    for (const member of members) {
      try {
        const parsed = JSON.parse(member) as MatchRequest;
        if (parsed.joinedAt < cutoffMs) {
          await redis.zrem(GLOBAL_QUEUE_KEY, member);
          removed++;
        }
      } catch {
        // Malformed — drop it.
        await redis.zrem(GLOBAL_QUEUE_KEY, member);
        removed++;
      }
    }
  }

  // 3) Bidirectional reconciliation: drop entries present in one store but not
  //    the other. Prevents silent "stale candidate" skips in the match loop.
  const redisMembers = await redis.zrange(GLOBAL_QUEUE_KEY, 0, -1);
  const redisUserIds = new Set<string>();
  const redisMemberByUser = new Map<string, string>();
  for (const member of redisMembers) {
    try {
      const parsed = JSON.parse(member) as MatchRequest;
      redisUserIds.add(parsed.userId);
      redisMemberByUser.set(parsed.userId, member);
    } catch {
      // Already handled above.
    }
  }

  const pgRows = await prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
    `SELECT user_id FROM match_queue_entries`,
  );
  const pgUserIds = new Set(pgRows.map((r) => r.user_id));

  // Redis-only orphans: drop from Redis.
  for (const userId of redisUserIds) {
    if (!pgUserIds.has(userId)) {
      const member = redisMemberByUser.get(userId);
      if (member) {
        await redis.zrem(GLOBAL_QUEUE_KEY, member);
        removed++;
      }
    }
  }

  // Postgres-only orphans: drop from Postgres.
  const pgOnly = [...pgUserIds].filter((id) => !redisUserIds.has(id));
  if (pgOnly.length > 0) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM match_queue_entries WHERE user_id = ANY($1::text[])`,
      pgOnly,
    );
    removed += pgOnly.length;
  }

  return removed;
}
