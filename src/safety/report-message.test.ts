import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: { ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", NODE_ENV: "test" },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    conversation: { findUnique: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    message: { findUnique: vi.fn(), findMany: vi.fn() },
    report: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    blockedUser: { upsert: vi.fn() },
    liveSession: { findMany: vi.fn() },
  },
}));

import { reportUser } from "./safety.service.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);

describe("reportUser with an exact reportedMessageId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.conversation.findUnique as any).mockResolvedValue({
      id: "conv-1", userAId: "reporter", userBId: "reported",
    });
    (mockPrisma.message.findMany as any).mockResolvedValue([]); // no snapshot
    (mockPrisma.report.create as any).mockResolvedValue({ id: "report-1" });
    (mockPrisma.blockedUser.upsert as any).mockResolvedValue({});
    (mockPrisma.conversation.updateMany as any).mockResolvedValue({ count: 0 });
    (mockPrisma.liveSession.findMany as any).mockResolvedValue([]);
    (mockPrisma.user.findUnique as any).mockResolvedValue({ deviceId: "d" });
  });

  it("attaches the reported message when it belongs to the conversation and reported sender", async () => {
    (mockPrisma.message.findUnique as any).mockResolvedValue({ conversationId: "conv-1", senderId: "reported" });
    await reportUser("reporter", "conv-1", "reported", "harassment", undefined, "msg-1");
    expect((mockPrisma.report.create as any).mock.calls[0][0].data.reportedMessageId).toBe("msg-1");
  });

  it("rejects a message from another conversation", async () => {
    (mockPrisma.message.findUnique as any).mockResolvedValue({ conversationId: "other-conv", senderId: "reported" });
    await expect(reportUser("reporter", "conv-1", "reported", "harassment", undefined, "msg-x"))
      .rejects.toThrow(/does not belong/i);
    expect(mockPrisma.report.create).not.toHaveBeenCalled();
  });

  it("rejects a message authored by someone other than the reported user", async () => {
    (mockPrisma.message.findUnique as any).mockResolvedValue({ conversationId: "conv-1", senderId: "reporter" });
    await expect(reportUser("reporter", "conv-1", "reported", "harassment", undefined, "msg-y"))
      .rejects.toThrow(/does not belong/i);
  });

  it("rejects a non-existent message id", async () => {
    (mockPrisma.message.findUnique as any).mockResolvedValue(null);
    await expect(reportUser("reporter", "conv-1", "reported", "harassment", undefined, "ghost"))
      .rejects.toThrow(/does not belong/i);
  });

  it("still works for a conversation-level report with no message id, and blocks", async () => {
    const r = await reportUser("reporter", "conv-1", "reported", "harassment");
    expect(r.id).toBe("report-1");
    expect(mockPrisma.blockedUser.upsert).toHaveBeenCalled(); // block-on-report preserved
  });
});
