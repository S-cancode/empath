import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    crisisEvent: { create: vi.fn() },
  },
}));

vi.mock("../conversation/conversation.service.js", () => ({
  setRetentionHold: vi.fn().mockResolvedValue(undefined),
}));

import { recordCrisisEvent } from "./crisis.service.js";
import { prisma } from "../lib/prisma.js";
import { setRetentionHold } from "../conversation/conversation.service.js";

const mockPrisma = vi.mocked(prisma);
const mockSetRetentionHold = vi.mocked(setRetentionHold);

describe("recordCrisisEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.crisisEvent.create as any).mockResolvedValue({ id: "ce-1" });
  });

  it("persists the crisis event and places a retention hold on the conversation", async () => {
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
    expect(mockSetRetentionHold).toHaveBeenCalledWith("conv-1");
  });

  it("skips the hold when there is no conversation", async () => {
    await recordCrisisEvent({
      userId: "user-1",
      conversationId: null,
      triggerKeywords: ["overdose"],
      resourcesShown: ["Samaritans"],
    });

    expect(mockPrisma.crisisEvent.create).toHaveBeenCalled();
    expect(mockSetRetentionHold).not.toHaveBeenCalled();
  });
});
