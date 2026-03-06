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
  },
}));

vi.mock("../notifications/notification.service.js", () => ({
  emitNotification: vi.fn(),
}));

import {
  joinQueue,
  leaveQueue,
  getQueueSize,
  tryMatchInCategory,
  getDailyMatchCount,
  getDailyMatchStatus,
} from "./matching.service.js";

describe("matching.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    sets.clear();
    strings.clear();
  });

  it("adds user to queue", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    const size = await getQueueSize("grief");
    expect(size).toBe(1);
  });

  it("removes user from queue", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    await leaveQueue("user-1", "grief");
    expect(await getQueueSize("grief")).toBe(0);
  });

  it("matches two users and creates a conversation", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    await joinQueue({ userId: "user-2", category: "grief", tier: "free", joinedAt: 2000 });

    const result = await tryMatchInCategory("grief");
    expect(result).not.toBeNull();
    expect(result!.conversationId).toBe("conversation-1");
    expect(result!.userAId).toBe("user-1");
    expect(result!.userBId).toBe("user-2");
  });

  it("does not match with only one user", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    const result = await tryMatchInCategory("grief");
    expect(result).toBeNull();
  });

  it("premium users get priority via tierConfig", async () => {
    await joinQueue({ userId: "user-free", category: "grief", tier: "free", joinedAt: 1000 });
    await joinQueue({ userId: "user-premium", category: "grief", tier: "premium", joinedAt: 2000 });
    await joinQueue({ userId: "user-3", category: "grief", tier: "free", joinedAt: 3000 });

    const result = await tryMatchInCategory("grief");
    expect(result).not.toBeNull();
    expect(result!.userAId).toBe("user-premium");
  });

  it("increments daily match count after matching", async () => {
    await joinQueue({ userId: "user-1", category: "grief", tier: "free", joinedAt: 1000 });
    await joinQueue({ userId: "user-2", category: "grief", tier: "free", joinedAt: 2000 });

    await tryMatchInCategory("grief");

    const count1 = await getDailyMatchCount("user-1");
    const count2 = await getDailyMatchCount("user-2");
    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });

  it("returns correct daily match status for free tier", async () => {
    const status = await getDailyMatchStatus("user-1", "free");
    expect(status.limit).toBe(3);
    expect(status.remaining).toBe(3);
    expect(status.used).toBe(0);
  });

  it("returns unlimited for plus tier", async () => {
    const status = await getDailyMatchStatus("user-1", "plus");
    expect(status.limit).toBe(0);
    expect(status.remaining).toBe(-1);
  });
});
