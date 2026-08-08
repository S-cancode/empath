import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: {
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    NODE_ENV: "test",
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    blockedUser: { deleteMany: vi.fn(), findFirst: vi.fn() },
    conversation: { updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { unblockUser } from "./safety.service.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);

describe("unblockUser (directional)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.blockedUser.deleteMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.conversation.updateMany as any).mockResolvedValue({ count: 1 });
    (mockPrisma.user.findUnique as any).mockResolvedValue({ deviceId: "dev" });
  });

  it("deletes ONLY the caller's own block, never the reverse direction", async () => {
    // No opposite-direction block remains → isBlocked returns false.
    (mockPrisma.blockedUser.findFirst as any).mockResolvedValue(null);

    await unblockUser("alice", "bob");

    expect(mockPrisma.blockedUser.deleteMany).toHaveBeenCalledWith({
      where: { userId: "alice", blockedUserId: "bob" },
    });
    // The where clause must not reference the reverse (bob→alice) record.
    const call = (mockPrisma.blockedUser.deleteMany as any).mock.calls[0][0];
    expect(JSON.stringify(call)).not.toContain("OR");
  });

  it("does NOT reactivate the conversation while the other direction still blocks", async () => {
    // isBlocked finds a surviving user-level block (bob still blocks alice).
    (mockPrisma.blockedUser.findFirst as any).mockResolvedValue({ id: "b1" });

    await unblockUser("alice", "bob");

    expect(mockPrisma.conversation.updateMany).not.toHaveBeenCalled();
  });

  it("reactivates the conversation only when neither direction blocks anymore", async () => {
    (mockPrisma.blockedUser.findFirst as any).mockResolvedValue(null);

    await unblockUser("alice", "bob");

    expect(mockPrisma.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "archived" } }),
    );
  });
});
