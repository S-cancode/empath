import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: { ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" },
}));

vi.mock("../lib/prisma.js", () => {
  const tx = {
    message: { deleteMany: vi.fn() },
    rating: { deleteMany: vi.fn() },
    crisisEvent: { deleteMany: vi.fn() },
    conversation: { updateMany: vi.fn() },
    blockedUser: { deleteMany: vi.fn() },
    complaint: { deleteMany: vi.fn() },
    user: { update: vi.fn() },
    $executeRawUnsafe: vi.fn(),
  };
  return {
    prisma: {
      user: { findUnique: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
      __tx: tx,
    },
  };
});

vi.mock("../auth/auth.service.js", () => ({ revokeUserSessions: vi.fn() }));
vi.mock("../safety/enforcement.service.js", () => ({ disconnectUserSockets: vi.fn() }));
vi.mock("../matching/matching.service.js", () => ({ evictFromMatching: vi.fn() }));
vi.mock("./compliance-gate.service.js", () => ({ invalidateComplianceCache: vi.fn() }));

// The Apple token lifecycle is mocked so we can drive revoke outcomes.
const mockRevoke = vi.fn();
const mockDecrypt = vi.fn();
const mockConfigured = vi.fn();
vi.mock("../auth/apple-tokens.js", () => ({
  revokeRefreshToken: (...a: unknown[]) => mockRevoke(...a),
  decryptAppleRefreshToken: (...a: unknown[]) => mockDecrypt(...a),
  isAppleServerConfigured: () => mockConfigured(),
}));

import { deleteAccount } from "./compliance.service.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.update.mockResolvedValue({});
});

describe("account deletion — Apple revocation lifecycle", () => {
  it("revokes Apple tokens BEFORE local erasure and reports 'revoked'", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", appleSub: "apple-1" });
    mockDecrypt.mockReturnValue("apple-refresh-token");
    mockConfigured.mockReturnValue(true);
    mockRevoke.mockResolvedValue(undefined);

    const result = await deleteAccount("u1");
    expect(result).toEqual({ appleRevocation: "revoked" });
    expect(mockRevoke).toHaveBeenCalledWith("apple-refresh-token");
    // Ordering: revoke ran before the erasure transaction.
    const revokeOrder = mockRevoke.mock.invocationCallOrder[0];
    const txOrder = mockPrisma.$transaction.mock.invocationCallOrder[0];
    expect(revokeOrder).toBeLessThan(txOrder);
  });

  it("still erases locally and reports 'failed' on a transient Apple error (no secret thrown out)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", appleSub: "apple-1" });
    mockDecrypt.mockReturnValue("apple-refresh-token");
    mockConfigured.mockReturnValue(true);
    mockRevoke.mockRejectedValue(new Error("apple revoke failed: 503"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await deleteAccount("u1");
    expect(result).toEqual({ appleRevocation: "failed" });
    // Local erasure still happened.
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    // The stored token never appears in a log line.
    for (const call of errSpy.mock.calls) {
      expect(call.join(" ")).not.toContain("apple-refresh-token");
    }
    errSpy.mockRestore();
  });

  it("legacy account (Apple sub, no stored token) → 'unavailable' + local erasure", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", appleSub: "apple-1" });
    mockDecrypt.mockReturnValue(null);
    mockConfigured.mockReturnValue(true);

    const result = await deleteAccount("u1");
    expect(result).toEqual({ appleRevocation: "unavailable" });
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it("non-Apple account → 'not_applicable'", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", appleSub: null });
    mockDecrypt.mockReturnValue(null);
    mockConfigured.mockReturnValue(false);

    const result = await deleteAccount("u1");
    expect(result).toEqual({ appleRevocation: "not_applicable" });
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("clears the encrypted Apple token columns during erasure", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", appleSub: "apple-1" });
    mockDecrypt.mockReturnValue("apple-refresh-token");
    mockConfigured.mockReturnValue(true);
    mockRevoke.mockResolvedValue(undefined);

    await deleteAccount("u1");
    const updateArg = mockPrisma.__tx.user.update.mock.calls[0][0];
    expect(updateArg.data.appleRefreshTokenCipher).toBeNull();
    expect(updateArg.data.appleRefreshTokenIv).toBeNull();
    expect(updateArg.data.appleRefreshTokenAuthTag).toBeNull();
    expect(updateArg.data.appleSub).toBeNull();
    expect(updateArg.data.deletedAt).toBeInstanceOf(Date);
  });
});
