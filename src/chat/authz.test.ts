import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    conversation: { findUnique: vi.fn() },
    liveSession: { findUnique: vi.fn() },
  },
}));

import {
  assertConversationParticipant,
  assertActiveConversationParticipant,
  assertLiveSessionParticipant,
} from "./authz.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);

describe("assertConversationParticipant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the conversation for a participant", async () => {
    (mockPrisma.conversation.findUnique as any).mockResolvedValue({
      userAId: "a", userBId: "b", status: "active",
    });
    const c = await assertConversationParticipant("conv-1", "a");
    expect(c.userBId).toBe("b");
  });

  it("throws for a non-participant", async () => {
    (mockPrisma.conversation.findUnique as any).mockResolvedValue({
      userAId: "a", userBId: "b", status: "active",
    });
    await expect(assertConversationParticipant("conv-1", "intruder")).rejects.toThrow("Not a participant");
  });

  it("throws NotFound for a missing conversation (arbitrary id)", async () => {
    (mockPrisma.conversation.findUnique as any).mockResolvedValue(null);
    await expect(assertConversationParticipant("nope", "a")).rejects.toThrow("Conversation not found");
  });
});

describe("assertActiveConversationParticipant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves partnerId for a participant of an active conversation", async () => {
    (mockPrisma.conversation.findUnique as any).mockResolvedValue({
      userAId: "a", userBId: "b", status: "active",
    });
    const c = await assertActiveConversationParticipant("conv-1", "b");
    expect(c.partnerId).toBe("a");
  });

  it("throws when the conversation is not active", async () => {
    (mockPrisma.conversation.findUnique as any).mockResolvedValue({
      userAId: "a", userBId: "b", status: "archived",
    });
    await expect(assertActiveConversationParticipant("conv-1", "a")).rejects.toThrow("not active");
  });

  it("throws for a non-participant before any active check leaks membership", async () => {
    (mockPrisma.conversation.findUnique as any).mockResolvedValue({
      userAId: "a", userBId: "b", status: "active",
    });
    await expect(assertActiveConversationParticipant("conv-1", "intruder")).rejects.toThrow("Not a participant");
  });
});

describe("assertLiveSessionParticipant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the session for a participant", async () => {
    (mockPrisma.liveSession.findUnique as any).mockResolvedValue({
      conversationId: "conv-1", status: "active",
      conversation: { userAId: "a", userBId: "b" },
    });
    const s = await assertLiveSessionParticipant("ls-1", "a");
    expect(s.conversationId).toBe("conv-1");
  });

  it("throws for a non-participant targeting an arbitrary session id", async () => {
    (mockPrisma.liveSession.findUnique as any).mockResolvedValue({
      conversationId: "conv-1", status: "active",
      conversation: { userAId: "a", userBId: "b" },
    });
    await expect(assertLiveSessionParticipant("ls-1", "intruder")).rejects.toThrow("Not a participant");
  });

  it("throws NotFound for a missing session", async () => {
    (mockPrisma.liveSession.findUnique as any).mockResolvedValue(null);
    await expect(assertLiveSessionParticipant("ghost", "a")).rejects.toThrow("Live session not found");
  });
});
