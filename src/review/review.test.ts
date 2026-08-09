import { describe, it, expect, vi, beforeEach } from "vitest";

const { cfg } = vi.hoisted(() => ({
  cfg: {
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    NODE_ENV: "test",
    REVIEW_MODE: false as boolean,
    REVIEW_APPLE_SUBS: "" as string,
  } as Record<string, unknown>,
}));
vi.mock("../config/index.js", () => ({ config: cfg }));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn() },
    message: { create: vi.fn() },
  },
}));

import { isReviewer, ensureDemoConversation, isReviewModeEnabled } from "./review.service.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);

function setReview(on: boolean, subs = "") {
  cfg.REVIEW_MODE = on;
  cfg.REVIEW_APPLE_SUBS = subs;
}

describe("review fixture — gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is disabled by default", () => {
    setReview(false);
    expect(isReviewModeEnabled()).toBe(false);
  });

  it("isReviewer is false when review mode is off, even for an allowlisted sub", async () => {
    setReview(false, "apple-123");
    (mockPrisma.user.findUnique as any).mockResolvedValue({ appleSub: "apple-123" });
    expect(await isReviewer("u1")).toBe(false);
  });

  it("isReviewer is false for a non-allowlisted sub when review mode is on", async () => {
    setReview(true, "apple-allowed");
    (mockPrisma.user.findUnique as any).mockResolvedValue({ appleSub: "apple-other" });
    expect(await isReviewer("u1")).toBe(false);
  });

  it("isReviewer is true only for an allowlisted sub with review mode on", async () => {
    setReview(true, "apple-allowed, apple-2");
    (mockPrisma.user.findUnique as any).mockResolvedValue({ appleSub: "apple-2" });
    expect(await isReviewer("u1")).toBe(true);
  });

  it("isReviewer is false when the allowlist is empty", async () => {
    setReview(true, "");
    (mockPrisma.user.findUnique as any).mockResolvedValue({ appleSub: "apple-2" });
    expect(await isReviewer("u1")).toBe(false);
  });

  it("never trusts anything but the persisted Apple sub (anonymous/no-sub user is not a reviewer)", async () => {
    setReview(true, "apple-2");
    (mockPrisma.user.findUnique as any).mockResolvedValue({ appleSub: null });
    expect(await isReviewer("u1")).toBe(false);
  });
});

describe("ensureDemoConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setReview(true, "apple-rev");
    (mockPrisma.user.findUnique as any).mockResolvedValue({ appleSub: "apple-rev" });
  });

  it("refuses a non-reviewer", async () => {
    (mockPrisma.user.findUnique as any).mockResolvedValue({ appleSub: "not-allowed" });
    await expect(ensureDemoConversation("u1")).rejects.toThrow(/not available/i);
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
  });

  it("creates a labelled demo peer and seeds scripted messages on first use", async () => {
    (mockPrisma.user.findFirst as any).mockResolvedValue(null); // no demo peer yet
    (mockPrisma.user.create as any).mockResolvedValue({ id: "demo-1" });
    (mockPrisma.conversation.findFirst as any).mockResolvedValue(null);
    (mockPrisma.conversation.create as any).mockResolvedValue({ id: "conv-demo" });
    (mockPrisma.message.create as any).mockResolvedValue({});

    const r = await ensureDemoConversation("rev-user");
    expect(r.conversationId).toBe("conv-demo");
    // Demo peer labelled as not-a-real-person
    expect((mockPrisma.user.create as any).mock.calls[0][0].data.anonymousAlias).toMatch(/not a real person/i);
    // Scripted messages seeded from the demo peer
    expect((mockPrisma.message.create as any).mock.calls.length).toBeGreaterThan(0);
  });

  it("is idempotent — returns the existing demo conversation without re-creating", async () => {
    (mockPrisma.user.findFirst as any).mockResolvedValue({ id: "demo-1" });
    (mockPrisma.conversation.findFirst as any).mockResolvedValue({ id: "conv-existing" });

    const r = await ensureDemoConversation("rev-user");
    expect(r.conversationId).toBe("conv-existing");
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });
});
