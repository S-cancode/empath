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

const onlineSet = new Set<string>();
const hashes = new Map<string, Record<string, string>>();

vi.mock("../lib/redis.js", () => ({
  redis: {
    sadd: vi.fn(async (key: string, member: string) => {
      if (key === "presence:online") onlineSet.add(member);
    }),
    srem: vi.fn(async (key: string, member: string) => {
      if (key === "presence:online") onlineSet.delete(member);
    }),
    sismember: vi.fn(async (key: string, member: string) => {
      if (key === "presence:online") return onlineSet.has(member) ? 1 : 0;
      return 0;
    }),
    hset: vi.fn(async (key: string, data: Record<string, string>) => {
      hashes.set(key, { ...hashes.get(key), ...data });
    }),
    hdel: vi.fn(async (key: string, field: string) => {
      const h = hashes.get(key);
      if (h) delete h[field];
    }),
    expire: vi.fn(),
    pipeline: vi.fn(() => ({
      sismember: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => {
        // Return results for all pipelined commands
        return [];
      }),
    })),
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { setOnline, setOffline, isOnline } from "./presence.service.js";

describe("presence.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onlineSet.clear();
    hashes.clear();
  });

  it("marks user as online", async () => {
    await setOnline("user-1", "socket-abc");
    expect(await isOnline("user-1")).toBe(true);
  });

  it("marks user as offline", async () => {
    await setOnline("user-1", "socket-abc");
    await setOffline("user-1");
    expect(await isOnline("user-1")).toBe(false);
  });

  it("returns false for user that was never online", async () => {
    expect(await isOnline("user-unknown")).toBe(false);
  });

  it("handles multiple users independently", async () => {
    await setOnline("user-1", "socket-1");
    await setOnline("user-2", "socket-2");

    expect(await isOnline("user-1")).toBe(true);
    expect(await isOnline("user-2")).toBe(true);

    await setOffline("user-1");
    expect(await isOnline("user-1")).toBe(false);
    expect(await isOnline("user-2")).toBe(true);
  });
});
