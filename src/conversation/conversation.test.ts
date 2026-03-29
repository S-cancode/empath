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

const redisStrings = new Map<string, string>();

vi.mock("../lib/redis.js", () => ({
  redis: {
    sismember: vi.fn(async () => 0),
    publish: vi.fn(async () => 1),
    get: vi.fn(async (key: string) => redisStrings.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { redisStrings.set(key, value); }),
    del: vi.fn(async (key: string) => { redisStrings.delete(key); }),
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    report: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../notifications/notification.service.js", () => ({
  emitNotification: vi.fn(),
}));

vi.mock("../presence/presence.service.js", () => ({
  isOnline: vi.fn(async () => false),
}));

import {
  getConversationsForUser,
  sendAsyncMessage,
  markDelivered,
  markRead,
  archiveConversation,
  requestReconnect,
  autoArchiveStaleConversations,
  deleteExpiredMessages,
} from "./conversation.service.js";
import { prisma } from "../lib/prisma.js";
import { emitNotification } from "../notifications/notification.service.js";

const mockPrisma = vi.mocked(prisma);

describe("conversation.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisStrings.clear();
  });

  describe("getConversationsForUser", () => {
    it("returns conversations for a user", async () => {
      (mockPrisma.conversation.findMany as any).mockResolvedValue([
        {
          id: "conv-1",
          userAId: "user-1",
          userBId: "user-2",
          category: "grief",
          subTag: null,
          status: "active",
          lastMessageAt: new Date(),
          userA: { id: "user-1", anonymousAlias: "GentleRiver1" },
          userB: { id: "user-2", anonymousAlias: "KindStar2" },
          messages: [{ id: "msg-1", sentAt: new Date(), senderId: "user-2" }],
        },
      ]);

      const result = await getConversationsForUser("user-1");
      expect(result).toHaveLength(1);
      expect(result[0].partner.id).toBe("user-2");
    });
  });

  describe("sendAsyncMessage", () => {
    it("encrypts and persists message immediately", async () => {
      (mockPrisma.conversation.findUnique as any).mockResolvedValue({
        id: "conv-1", userAId: "user-1", userBId: "user-2", status: "active",
      });
      (mockPrisma.message.create as any).mockResolvedValue({
        id: "msg-1", conversationId: "conv-1", senderId: "user-1",
        content: "enc", iv: "iv", authTag: "tag", sentAt: new Date(),
      });
      (mockPrisma.conversation.update as any).mockResolvedValue({});

      const result = await sendAsyncMessage("conv-1", "user-1", "Hello!");
      expect(result.id).toBe("msg-1");
      expect(emitNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "new_message", recipientId: "user-2" }),
      );
    });

    it("rejects non-participants", async () => {
      (mockPrisma.conversation.findUnique as any).mockResolvedValue({
        id: "conv-1", userAId: "user-1", userBId: "user-2", status: "active",
      });
      await expect(sendAsyncMessage("conv-1", "user-3", "Hello!")).rejects.toThrow("Not a participant");
    });
  });

  describe("markDelivered", () => {
    it("updates delivery status", async () => {
      (mockPrisma.message.updateMany as any).mockResolvedValue({ count: 2 });
      await markDelivered(["msg-1", "msg-2"], "user-2");
      expect(mockPrisma.message.updateMany).toHaveBeenCalled();
    });

    it("does nothing with empty array", async () => {
      await markDelivered([], "user-2");
      expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("markRead", () => {
    it("marks messages as read", async () => {
      (mockPrisma.message.findUnique as any).mockResolvedValue({ sentAt: new Date() });
      (mockPrisma.message.updateMany as any).mockResolvedValue({ count: 3 });
      (mockPrisma.conversation.findUnique as any).mockResolvedValue({ userAId: "user-1", userBId: "user-2" });

      await markRead("conv-1", "user-2", "msg-5");
      expect(mockPrisma.message.updateMany).toHaveBeenCalled();
    });
  });

  describe("archiveConversation", () => {
    it("archives a conversation", async () => {
      (mockPrisma.conversation.findUnique as any).mockResolvedValue({
        id: "conv-1", userAId: "user-1", userBId: "user-2", status: "active",
      });
      (mockPrisma.conversation.update as any).mockResolvedValue({});

      await archiveConversation("conv-1", "user-1");
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "archived" } }),
      );
    });
  });

  describe("requestReconnect", () => {
    it("allows free tier users to unarchive", async () => {
      (mockPrisma.conversation.findUnique as any).mockResolvedValue({
        id: "conv-1", userAId: "user-1", userBId: "user-2", status: "archived",
      });
      (mockPrisma.conversation.update as any).mockResolvedValue({});

      const result = await requestReconnect("conv-1", "user-1", "free");
      expect(result.status).toBe("reconnected");
    });

    it("immediately unarchives conversation", async () => {
      (mockPrisma.conversation.findUnique as any).mockResolvedValue({
        id: "conv-1", userAId: "user-1", userBId: "user-2", status: "archived",
      });
      (mockPrisma.conversation.update as any).mockResolvedValue({});

      const result = await requestReconnect("conv-1", "user-1", "premium");
      expect(result.status).toBe("reconnected");
    });

    it("reactivates on mutual consent", async () => {
      (mockPrisma.conversation.findUnique as any).mockResolvedValue({
        id: "conv-1", userAId: "user-1", userBId: "user-2", status: "archived",
      });
      (mockPrisma.conversation.update as any).mockResolvedValue({});

      // First user requests
      redisStrings.set("reconnect:conv-1", "user-1");

      // Second user requests
      const result = await requestReconnect("conv-1", "user-2", "premium");
      expect(result.status).toBe("reconnected");
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "active" } }),
      );
    });

    it("rejects reconnect on non-archived conversation", async () => {
      (mockPrisma.conversation.findUnique as any).mockResolvedValue({
        id: "conv-1", userAId: "user-1", userBId: "user-2", status: "active",
      });
      await expect(requestReconnect("conv-1", "user-1", "premium")).rejects.toThrow("not archived");
    });
  });

  describe("autoArchiveStaleConversations", () => {
    it("archives stale conversations", async () => {
      (mockPrisma.conversation.updateMany as any).mockResolvedValue({ count: 5 });
      const count = await autoArchiveStaleConversations(7);
      expect(count).toBe(5);
    });
  });

  describe("deleteExpiredMessages", () => {
    it("deletes messages older than retention period, skipping active reports", async () => {
      (mockPrisma.report.findMany as any).mockResolvedValue([]);
      (mockPrisma.message.deleteMany as any).mockResolvedValue({ count: 12 });

      const count = await deleteExpiredMessages(7);

      expect(count).toBe(12);
      expect(mockPrisma.message.deleteMany).toHaveBeenCalledWith({
        where: {
          sentAt: { lt: expect.any(Date) },
        },
      });
    });

    it("protects messages in conversations with active reports", async () => {
      (mockPrisma.report.findMany as any).mockResolvedValue([
        { conversationId: "conv-reported" },
      ]);
      (mockPrisma.message.deleteMany as any).mockResolvedValue({ count: 5 });

      const count = await deleteExpiredMessages(7);

      expect(count).toBe(5);
      expect(mockPrisma.message.deleteMany).toHaveBeenCalledWith({
        where: {
          sentAt: { lt: expect.any(Date) },
          conversationId: { notIn: ["conv-reported"] },
        },
      });
    });
  });
});
