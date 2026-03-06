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

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    message: { createMany: vi.fn() },
    liveSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../lib/redis.js", () => ({
  redis: {},
}));

import { bufferMessage, endLiveSession, extendLiveSession, startLiveSession } from "./chat.service.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);

describe("chat.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("bufferMessage", () => {
    it("returns encrypted payload", () => {
      const result = bufferMessage("conv-1", "user-1", "Hello world");
      expect(result.ciphertext).toBeTruthy();
      expect(result.iv).toBeTruthy();
      expect(result.authTag).toBeTruthy();
      expect(result.ciphertext).not.toBe("Hello world");
    });

    it("accepts optional liveSessionId", () => {
      const result = bufferMessage("conv-1", "user-1", "Hello", "ls-1");
      expect(result.ciphertext).toBeTruthy();
    });
  });

  describe("startLiveSession", () => {
    it("creates a live session for a conversation", async () => {
      (mockPrisma.liveSession.create as any).mockResolvedValue({
        id: "ls-1",
        conversationId: "conv-1",
        status: "active",
        startedAt: new Date(),
        endedAt: null,
        durationSeconds: null,
        extended: false,
      });

      const result = await startLiveSession("conv-1");
      expect(result.id).toBe("ls-1");
      expect(result.conversationId).toBe("conv-1");
    });
  });

  describe("endLiveSession", () => {
    it("ends an active live session", async () => {
      (mockPrisma.liveSession.findUnique as any).mockResolvedValue({
        id: "ls-1",
        conversationId: "conv-1",
        status: "active",
        startedAt: new Date(Date.now() - 600_000),
        endedAt: null,
        durationSeconds: null,
        extended: false,
      });
      (mockPrisma.liveSession.update as any).mockResolvedValue({});

      await endLiveSession("ls-1");
      expect(mockPrisma.liveSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ls-1" },
          data: expect.objectContaining({ status: "completed" }),
        }),
      );
    });

    it("does nothing for non-active session", async () => {
      (mockPrisma.liveSession.findUnique as any).mockResolvedValue({
        id: "ls-1",
        conversationId: "conv-1",
        status: "completed",
        startedAt: new Date(),
        endedAt: new Date(),
        durationSeconds: 600,
        extended: false,
      });

      await endLiveSession("ls-1");
      expect(mockPrisma.liveSession.update).not.toHaveBeenCalled();
    });
  });

  describe("extendLiveSession", () => {
    it("extends an active non-extended session", async () => {
      (mockPrisma.liveSession.findUnique as any).mockResolvedValue({
        id: "ls-1",
        conversationId: "conv-1",
        status: "active",
        startedAt: new Date(),
        endedAt: null,
        durationSeconds: null,
        extended: false,
      });
      (mockPrisma.liveSession.update as any).mockResolvedValue({});

      const result = await extendLiveSession("ls-1");
      expect(result).toBe(true);
    });

    it("rejects extending already-extended session", async () => {
      (mockPrisma.liveSession.findUnique as any).mockResolvedValue({
        id: "ls-1",
        conversationId: "conv-1",
        status: "active",
        startedAt: new Date(),
        endedAt: null,
        durationSeconds: null,
        extended: true,
      });

      const result = await extendLiveSession("ls-1");
      expect(result).toBe(false);
    });
  });
});
