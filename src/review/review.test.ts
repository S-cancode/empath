import { describe, it, expect, vi, beforeEach } from "vitest";

const { cfg } = vi.hoisted(() => ({
  cfg: {
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    NODE_ENV: "test",
    REVIEW_MODE: false as boolean,
    REVIEW_APPLE_SUBS: "" as string,
    REVIEW_ACCESS_CODE: "review-code-abcdef123456" as string | undefined,
  } as Record<string, unknown>,
}));
vi.mock("../config/index.js", () => ({ config: cfg }));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    reviewGrant: { findUnique: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn(), upsert: vi.fn() },
    conversation: { findUnique: vi.fn(), create: vi.fn() },
    message: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import {
  isReviewer,
  isReviewModeEnabled,
  redeemReviewAccess,
  ensureDemoConversation,
} from "./review.service.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma) as any;

function setReview(on: boolean, opts: { subs?: string; code?: string | undefined } = {}) {
  cfg.REVIEW_MODE = on;
  cfg.REVIEW_APPLE_SUBS = opts.subs ?? "";
  if ("code" in opts) cfg.REVIEW_ACCESS_CODE = opts.code;
}

/** Wire $transaction to run its callback against the message/conversation mocks. */
function wireTransaction() {
  mockPrisma.$transaction.mockImplementation(async (fn: any) =>
    fn({ conversation: mockPrisma.conversation, message: mockPrisma.message }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setReview(false, { subs: "", code: "review-code-abcdef123456" });
});

describe("review access — gating", () => {
  it("is disabled by default", () => {
    expect(isReviewModeEnabled()).toBe(false);
  });

  it("isReviewer is false when review mode is off, even with a grant", async () => {
    setReview(false);
    mockPrisma.reviewGrant.findUnique.mockResolvedValue({ userId: "u1" });
    expect(await isReviewer("u1")).toBe(false);
    expect(mockPrisma.reviewGrant.findUnique).not.toHaveBeenCalled();
  });

  it("isReviewer is true when review mode is on and a durable grant exists", async () => {
    setReview(true);
    mockPrisma.reviewGrant.findUnique.mockResolvedValue({ userId: "u1" });
    expect(await isReviewer("u1")).toBe(true);
  });

  it("isReviewer is false with no grant and no allowlisted sub", async () => {
    setReview(true);
    mockPrisma.reviewGrant.findUnique.mockResolvedValue(null);
    expect(await isReviewer("u1")).toBe(false);
  });

  it("still honours an explicitly allowlisted Apple sub (no grant needed)", async () => {
    setReview(true, { subs: "apple-allowed, apple-2" });
    mockPrisma.reviewGrant.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ appleSub: "apple-2" });
    expect(await isReviewer("u1")).toBe(true);
  });

  it("does not trust a non-allowlisted sub when there is no grant", async () => {
    setReview(true, { subs: "apple-allowed" });
    mockPrisma.reviewGrant.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ appleSub: "apple-other" });
    expect(await isReviewer("u1")).toBe(false);
  });
});

describe("redeemReviewAccess — non-circular code redemption", () => {
  it("refuses when review mode is off (route/service unavailable) and mutates nothing", async () => {
    setReview(false);
    await expect(redeemReviewAccess("u1", "review-code-abcdef123456")).rejects.toThrow(/not found/i);
    expect(mockPrisma.reviewGrant.upsert).not.toHaveBeenCalled();
  });

  it("rejects a wrong code with a generic error and no grant", async () => {
    setReview(true);
    await expect(redeemReviewAccess("u1", "wrong-code")).rejects.toThrow(/invalid review access code/i);
    expect(mockPrisma.reviewGrant.upsert).not.toHaveBeenCalled();
  });

  it("rejects when no code is configured, even if the client sends an empty string", async () => {
    setReview(true, { code: undefined });
    await expect(redeemReviewAccess("u1", "")).rejects.toThrow(/invalid review access code/i);
    expect(mockPrisma.reviewGrant.upsert).not.toHaveBeenCalled();
  });

  it("grants only the authenticated user on the correct code (idempotent upsert)", async () => {
    setReview(true);
    mockPrisma.reviewGrant.upsert.mockResolvedValue({ userId: "u1" });
    await redeemReviewAccess("u1", "review-code-abcdef123456");
    expect(mockPrisma.reviewGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" }, create: { userId: "u1" } }),
    );
  });
});

describe("ensureDemoConversation — provisioning", () => {
  beforeEach(() => {
    setReview(true);
    mockPrisma.reviewGrant.findUnique.mockResolvedValue({ userId: "rev-user" });
    mockPrisma.user.upsert.mockResolvedValue({ id: "demo-1" });
    wireTransaction();
  });

  it("refuses a non-reviewer", async () => {
    mockPrisma.reviewGrant.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ appleSub: null });
    await expect(ensureDemoConversation("u1")).rejects.toThrow(/not available/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates a labelled demo peer, seeds scripted text AND a real incoming voice note", async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-demo" });
    mockPrisma.message.create.mockResolvedValue({});

    const r = await ensureDemoConversation("rev-user");
    expect(r).toEqual({ conversationId: "conv-demo", status: "active" });

    // Demo peer labelled as not-a-real-person via a concurrency-safe upsert.
    expect(mockPrisma.user.upsert.mock.calls[0][0].create.anonymousAlias).toMatch(/not a real person/i);

    // At least one seeded message is a real voice note.
    const types = mockPrisma.message.create.mock.calls.map((c: any) => c[0].data.messageType);
    expect(types).toContain("voice");
    const voiceCall = mockPrisma.message.create.mock.calls.find(
      (c: any) => c[0].data.messageType === "voice",
    );
    expect(voiceCall[0].data.senderId).toBe("demo-1");
    expect(voiceCall[0].data.voiceDurationMs).toBeGreaterThan(0);
    expect(typeof voiceCall[0].data.content).toBe("string"); // encrypted, not plaintext
  });

  it("is idempotent — returns an existing ACTIVE demo conversation without re-creating", async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: "conv-existing", status: "active" });
    const r = await ensureDemoConversation("rev-user");
    expect(r).toEqual({ conversationId: "conv-existing", status: "active" });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("preserves safety state: a BLOCKED demo conversation is returned, never re-created active", async () => {
    // After report/block the conversation is status="blocked"; relaunch must NOT
    // create a new active route around the block.
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: "conv-blocked", status: "blocked" });
    const r = await ensureDemoConversation("rev-user");
    expect(r).toEqual({ conversationId: "conv-blocked", status: "blocked" });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
  });

  it("is concurrency-safe: a unique-key race returns the winner's conversation, no duplicate", async () => {
    mockPrisma.conversation.findUnique
      .mockResolvedValueOnce(null) // initial check: none yet
      .mockResolvedValueOnce({ id: "conv-winner", status: "active" }); // post-race lookup
    // The losing transaction hits the unique reviewKey constraint.
    mockPrisma.conversation.create.mockRejectedValue({ code: "P2002" });

    const r = await ensureDemoConversation("rev-user");
    expect(r).toEqual({ conversationId: "conv-winner", status: "active" });
  });

  it("propagates a non-unique failure so provisioning is retryable (no partial state claimed)", async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    mockPrisma.conversation.create.mockRejectedValue(new Error("db down"));
    await expect(ensureDemoConversation("rev-user")).rejects.toThrow(/db down/i);
  });
});
