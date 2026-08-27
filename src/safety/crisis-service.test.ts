import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    crisisEvent: { create: vi.fn() },
    conversation: { update: vi.fn(), findUnique: vi.fn() },
  },
}));

import { recordCrisisEvent } from "./crisis.service.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);

describe("recordCrisisEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.crisisEvent.create as any).mockResolvedValue({ id: "ce-1" });
  });

  it("persists a minimal crisis event", async () => {
    await recordCrisisEvent({
      userId: "user-1",
      conversationId: "conv-1",
      liveSessionId: null,
      triggerKeywords: ["kill myself"],
      resourcesShown: ["Samaritans"],
    });

    expect(mockPrisma.crisisEvent.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        conversationId: "conv-1",
        liveSessionId: null,
        triggerKeywords: ["kill myself"],
        resourcesShown: ["Samaritans"],
      },
    });
  });

  it("does NOT place any full-conversation retention hold on automated keyword detection", async () => {
    await recordCrisisEvent({
      userId: "user-1",
      conversationId: "conv-1",
      liveSessionId: null,
      triggerKeywords: ["kill myself"],
      resourcesShown: ["Samaritans"],
    });

    // Keyword detection must never freeze the whole conversation indefinitely —
    // it only records the minimal 12-month event. No conversation mutation.
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });

  it("works with no conversation id", async () => {
    await recordCrisisEvent({
      userId: "user-1",
      conversationId: null,
      triggerKeywords: ["overdose"],
      resourcesShown: ["Samaritans"],
    });
    expect(mockPrisma.crisisEvent.create).toHaveBeenCalled();
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });
});
