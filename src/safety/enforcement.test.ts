import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: {
    REDIS_URL: "redis://localhost:6379",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { update: vi.fn() },
    conversation: { updateMany: vi.fn() },
  },
}));

vi.mock("../lib/redis.js", () => ({
  redis: { publish: vi.fn().mockResolvedValue(1) },
}));

const mockSubscriberInstance = {
  subscribe: vi.fn().mockResolvedValue(1),
  on: vi.fn(),
  quit: vi.fn().mockResolvedValue("OK"),
};
vi.mock("ioredis", () => ({
  default: function MockRedis() {
    return mockSubscriberInstance;
  },
}));

const mockDisconnectSockets = vi.fn();
const mockIo = {
  in: vi.fn().mockReturnValue({ disconnectSockets: mockDisconnectSockets }),
};
vi.mock("./safety.service.js", () => ({
  getIoInstance: vi.fn(() => mockIo),
}));

import {
  applyBan,
  applySuspension,
  disconnectUserSockets,
  startEnforcementSubscriber,
  stopEnforcementSubscriber,
} from "./enforcement.service.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";

const mockPrisma = vi.mocked(prisma);
const mockRedis = vi.mocked(redis);

describe("enforcement.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIo.in.mockReturnValue({ disconnectSockets: mockDisconnectSockets });
  });

  describe("disconnectUserSockets", () => {
    it("closes local sockets in the user room and broadcasts over Redis", () => {
      disconnectUserSockets("user-1");

      expect(mockIo.in).toHaveBeenCalledWith("user:user-1");
      expect(mockDisconnectSockets).toHaveBeenCalledWith(true);
      expect(mockRedis.publish).toHaveBeenCalledWith("moderation:disconnect", "user-1");
    });
  });

  describe("applyBan", () => {
    it("sets banned, blocks conversations, and disconnects everywhere", async () => {
      (mockPrisma.user.update as any).mockResolvedValue({});
      (mockPrisma.conversation.updateMany as any).mockResolvedValue({ count: 2 });

      await applyBan("user-1");

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { banned: true },
      });
      expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith({
        where: {
          status: { in: ["active", "archived"] },
          OR: [{ userAId: "user-1" }, { userBId: "user-1" }],
        },
        data: { status: "blocked" },
      });
      expect(mockIo.in).toHaveBeenCalledWith("user:user-1");
      expect(mockDisconnectSockets).toHaveBeenCalledWith(true);
      expect(mockRedis.publish).toHaveBeenCalledWith("moderation:disconnect", "user-1");
    });
  });

  describe("applySuspension", () => {
    it("sets suspendedUntil and disconnects everywhere", async () => {
      (mockPrisma.user.update as any).mockResolvedValue({});
      const until = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      await applySuspension("user-2", until);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-2" },
        data: { suspendedUntil: until },
      });
      expect(mockIo.in).toHaveBeenCalledWith("user:user-2");
      expect(mockDisconnectSockets).toHaveBeenCalledWith(true);
      expect(mockRedis.publish).toHaveBeenCalledWith("moderation:disconnect", "user-2");
    });
  });

  describe("cross-instance subscriber", () => {
    it("disconnects local sockets when another instance broadcasts", async () => {
      await startEnforcementSubscriber();

      expect(mockSubscriberInstance.subscribe).toHaveBeenCalledWith("moderation:disconnect");
      const messageHandler = mockSubscriberInstance.on.mock.calls.find(
        (c: any[]) => c[0] === "message",
      )![1];

      messageHandler("moderation:disconnect", "user-3");

      expect(mockIo.in).toHaveBeenCalledWith("user:user-3");
      expect(mockDisconnectSockets).toHaveBeenCalledWith(true);

      stopEnforcementSubscriber();
      expect(mockSubscriberInstance.quit).toHaveBeenCalled();
    });

    it("ignores messages on other channels", async () => {
      await startEnforcementSubscriber();
      const messageHandler = mockSubscriberInstance.on.mock.calls.find(
        (c: any[]) => c[0] === "message",
      )![1];

      messageHandler("some:other:channel", "user-3");

      expect(mockDisconnectSockets).not.toHaveBeenCalled();
      stopEnforcementSubscriber();
    });
  });
});
