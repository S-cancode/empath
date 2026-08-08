import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
    JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-characters",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    PORT: 3000,
    NODE_ENV: "test",
  },
}));

const store = new Map<string, Map<string, number>>();
const sets = new Map<string, Set<string>>();
const strings = new Map<string, string>();

vi.mock("../lib/redis.js", () => ({
  redis: {
    zadd: vi.fn(async (key: string, score: number, member: string) => {
      if (!store.has(key)) store.set(key, new Map());
      store.get(key)!.set(member, score);
    }),
    zrem: vi.fn(async (key: string, ...members: string[]) => {
      const sorted = store.get(key);
      if (sorted) members.forEach((m) => sorted.delete(m));
    }),
    zrange: vi.fn(async (key: string, start: number, stop: number) => {
      const sorted = store.get(key);
      if (!sorted) return [];
      const entries = [...sorted.entries()].sort((a, b) => a[1] - b[1]);
      const end = stop === -1 ? entries.length : stop + 1;
      return entries.slice(start, end).map(([m]) => m);
    }),
    zcard: vi.fn(async (key: string) => store.get(key)?.size ?? 0),
    zscore: vi.fn(async (key: string, member: string) => {
      return store.get(key)?.get(member) ?? null;
    }),
    zremrangebyscore: vi.fn(async (key: string, min: number, max: number) => {
      const sorted = store.get(key);
      if (!sorted) return 0;
      let removed = 0;
      for (const [m, s] of [...sorted.entries()]) {
        if (s >= min && s <= max) {
          sorted.delete(m);
          removed++;
        }
      }
      return removed;
    }),
    zrangebyscore: vi.fn(async (key: string, min: number, max: number) => {
      const sorted = store.get(key);
      if (!sorted) return [];
      return [...sorted.entries()]
        .filter(([, s]) => s >= min && s <= max)
        .sort((a, b) => a[1] - b[1])
        .map(([m]) => m);
    }),
    eval: vi.fn(),
    keys: vi.fn(async (pattern: string) => {
      const prefix = pattern.replace("*", "");
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    }),
    sismember: vi.fn(async (key: string, member: string) => {
      return sets.get(key)?.has(member) ? 1 : 0;
    }),
    sadd: vi.fn(async (key: string, member: string) => {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key)!.add(member);
    }),
    expire: vi.fn(),
    publish: vi.fn(),
    get: vi.fn(async (key: string) => strings.get(key) ?? null),
    incr: vi.fn(async (key: string) => {
      const val = parseInt(strings.get(key) ?? "0", 10) + 1;
      strings.set(key, val.toString());
      return val;
    }),
    set: vi.fn(async (key: string, value: string) => {
      strings.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      strings.delete(key);
    }),
  },
}));

// Mock pgvector similarity results
const mockSimilarities: Array<{ user_id: string; similarity: number }> = [];

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    conversation: {
      create: vi.fn(async (args: any) => ({
        id: "conversation-1",
        ...args.data,
        status: "active",
        createdAt: new Date(),
        lastMessageAt: null,
      })),
    },
    blockedUser: {
      findFirst: vi.fn(async () => null),
    },
    user: {
      findUnique: vi.fn(async () => ({ deviceId: "device-hash" })),
    },
    matchQualityLog: {
      create: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(async () => mockSimilarities),
  },
}));

vi.mock("../notifications/notification.service.js", () => ({
  emitNotification: vi.fn(),
}));

import {
  joinQueue,
  leaveQueue,
  getQueueSize,
  tryMatchGlobal,
  tryMatchAllPairs,
  getDailyMatchCount,
  getDailyMatchStatus,
  declineProposal,
  expireStaleProposals,
  cleanupStaleEntries,
} from "./matching.service.js";
import { emitNotification } from "../notifications/notification.service.js";
import { prisma } from "../lib/prisma.js";

describe("matching.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    sets.clear();
    strings.clear();
    mockSimilarities.length = 0;
  });

  it("adds user to global queue", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    const size = await getQueueSize();
    expect(size).toBe(1);
  });

  it("removes user from queue", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    await leaveQueue("user-1");
    expect(await getQueueSize()).toBe(0);
  });

  it("proposes a match between two users via cosine similarity", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    await joinQueue({ userId: "user-2", category: "grief", tier: "free", joinedAt: 2000 });

    // Mock pgvector returning high similarity
    mockSimilarities.push({ user_id: "user-2", similarity: 0.85 });

    const result = await tryMatchGlobal();
    expect(result).not.toBeNull();
    expect(result!.conversationId).toContain("proposal:");
    expect(result!.userAId).toBe("user-1");
    expect(result!.userBId).toBe("user-2");
  });

  it("does not match with only one user", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    const result = await tryMatchGlobal();
    expect(result).toBeNull();
  });

  it("rejects match below minimum similarity threshold", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    await joinQueue({ userId: "user-2", category: "identity", tier: "free", joinedAt: 2000 });

    // Mock pgvector returning very low similarity
    mockSimilarities.push({ user_id: "user-2", similarity: 0.1 });

    const result = await tryMatchGlobal();
    expect(result).toBeNull();
  });

  it("premium users get priority via tierConfig", async () => {
    await joinQueue({ userId: "user-free", category: "grief", tier: "free", joinedAt: 1000 });
    await joinQueue({ userId: "user-premium", category: "grief", tier: "premium", joinedAt: 2000 });
    await joinQueue({ userId: "user-3", category: "grief", tier: "free", joinedAt: 3000 });

    // Premium user should be anchor (lowest score due to -60000 offset)
    // Mock similarities from premium user's perspective
    mockSimilarities.push(
      { user_id: "user-free", similarity: 0.8 },
      { user_id: "user-3", similarity: 0.7 },
    );

    const result = await tryMatchGlobal();
    expect(result).not.toBeNull();
    expect(result!.userAId).toBe("user-premium");
  });

  it("does not increment daily match count on proposal (only on accept)", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    await joinQueue({ userId: "user-2", category: "grief", tier: "free", joinedAt: 2000 });

    mockSimilarities.push({ user_id: "user-2", similarity: 0.85 });

    await tryMatchGlobal();

    // Counts should still be 0 — incremented only when both users accept
    const count1 = await getDailyMatchCount("user-1");
    const count2 = await getDailyMatchCount("user-2");
    expect(count1).toBe(0);
    expect(count2).toBe(0);
  });

  it("returns correct daily match status for free tier", async () => {
    const status = await getDailyMatchStatus("user-1", "free");
    expect(status.limit).toBe(10);
    expect(status.remaining).toBe(10);
    expect(status.used).toBe(0);
  });

  it("returns unlimited for plus tier", async () => {
    const status = await getDailyMatchStatus("user-1", "plus");
    expect(status.limit).toBe(0);
    expect(status.remaining).toBe(-1);
  });

  it("tryMatchAllPairs forms multiple disjoint pairs in one pass", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    await joinQueue({ userId: "user-2", category: "grief", tier: "free", joinedAt: 2000 });
    await joinQueue({ userId: "user-3", category: "grief", tier: "free", joinedAt: 3000 });
    await joinQueue({ userId: "user-4", category: "grief", tier: "free", joinedAt: 4000 });

    // Return every other user as a high-similarity candidate — the matcher should
    // form two disjoint pairs (1-2 and 3-4) in a single pass.
    mockSimilarities.push(
      { user_id: "user-2", similarity: 0.9 },
      { user_id: "user-3", similarity: 0.85 },
      { user_id: "user-4", similarity: 0.8 },
    );

    const results = await tryMatchAllPairs();
    expect(results.length).toBe(2);
    const allUsers = new Set(results.flatMap((r) => [r.userAId, r.userBId]));
    expect(allUsers.size).toBe(4);
  });

  it("keeps Postgres queue rows when a proposal is created", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    await joinQueue({ userId: "user-2", category: "grief", tier: "free", joinedAt: 2000 });
    mockSimilarities.push({ user_id: "user-2", similarity: 0.85 });

    const result = await tryMatchGlobal();
    expect(result).not.toBeNull();

    const deleteCalls = vi
      .mocked(prisma.$executeRawUnsafe)
      .mock.calls.filter((c) => String(c[0]).includes("DELETE FROM match_queue_entries"));
    expect(deleteCalls.length).toBe(0);
  });

  it("expired proposal re-queues both users and notifies them", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    await joinQueue({ userId: "user-2", category: "grief", tier: "free", joinedAt: 2000 });
    mockSimilarities.push({ user_id: "user-2", similarity: 0.85 });

    await tryMatchGlobal();
    expect(await getQueueSize()).toBe(0);

    // Force the proposal past its 24h deadline by rewinding its zset score.
    const expiryZset = store.get("match:proposals:expiry")!;
    for (const [member] of [...expiryZset.entries()]) {
      expiryZset.set(member, Date.now() - 1000);
    }

    const expired = await expireStaleProposals();
    expect(expired).toBe(1);
    expect(await getQueueSize()).toBe(2);

    const types = vi.mocked(emitNotification).mock.calls.map((c) => c[0].type);
    expect(types.filter((t) => t === "match_expired").length).toBe(2);

    // Second sweep is a no-op — the proposal was fully cleaned up.
    expect(await expireStaleProposals()).toBe(0);
  });

  it("declined proposal is deregistered from expiry tracking", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    await joinQueue({ userId: "user-2", category: "grief", tier: "free", joinedAt: 2000 });
    mockSimilarities.push({ user_id: "user-2", similarity: 0.85 });

    const result = await tryMatchGlobal();
    const proposalId = result!.conversationId;

    await declineProposal(proposalId, "user-1");

    // Other user re-queued by decline; decliner is out.
    expect(await getQueueSize()).toBe(1);

    // Even far past the deadline, nothing expires and nobody is notified.
    const expiryZset = store.get("match:proposals:expiry");
    if (expiryZset) {
      for (const [member] of [...expiryZset.entries()]) {
        expiryZset.set(member, Date.now() - 1000);
      }
    }
    expect(await expireStaleProposals()).toBe(0);
    const types = vi.mocked(emitNotification).mock.calls.map((c) => c[0].type);
    expect(types.filter((t) => t === "match_expired").length).toBe(0);
  });

  it("ignores a decline from a non-participant, leaving the proposal intact", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    await joinQueue({ userId: "user-2", category: "grief", tier: "free", joinedAt: 2000 });
    mockSimilarities.push({ user_id: "user-2", similarity: 0.85 });

    const result = await tryMatchGlobal();
    const proposalId = result!.conversationId;

    // An unrelated authenticated user tries to cancel someone else's match.
    await expect(declineProposal(proposalId, "intruder")).rejects.toThrow(/participant/i);

    // Proposal and both pending markers survive; nobody was re-queued.
    expect(strings.get("match:proposal:" + proposalId)).toBeTruthy();
    expect(strings.get("match:pending:user-1")).toBeTruthy();
    expect(strings.get("match:pending:user-2")).toBeTruthy();
    expect(await getQueueSize()).toBe(0);
  });

  it("cleanup keeps queue entries younger than 7 days", async () => {
    // 31 minutes old — would have been evicted under the old 30-minute window.
    await joinQueue({
      userId: "user-1",
      category: "grief",
      tier: "free",
      joinedAt: Date.now() - 31 * 60 * 1000,
    });
    // Reconciliation reads Postgres user_ids via $queryRawUnsafe (mocked with mockSimilarities).
    mockSimilarities.push({ user_id: "user-1", similarity: 0 });

    await cleanupStaleEntries();
    expect(await getQueueSize()).toBe(1);
  });

  it("cleanup does not delete Postgres rows for users in a pending proposal", async () => {
    // user-9 has a Postgres row but no Redis member — normally a purgeable orphan —
    // and an active pending-proposal marker that must protect the row.
    mockSimilarities.push({ user_id: "user-9", similarity: 0 });
    strings.set("match:pending:user-9", "proposal:123");

    await cleanupStaleEntries();

    const orphanDeletes = vi
      .mocked(prisma.$executeRawUnsafe)
      .mock.calls.filter((c) => String(c[0]).includes("ANY($1::text[])"));
    expect(orphanDeletes.length).toBe(0);
  });
});
