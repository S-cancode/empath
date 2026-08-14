import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: {
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
}));

vi.mock("../lib/prisma.js", () => {
  const tx = {
    message: { deleteMany: vi.fn() },
    rating: { deleteMany: vi.fn() },
    crisisEvent: { deleteMany: vi.fn() },
    conversation: { updateMany: vi.fn() },
    consentRecord: { updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    termsAcceptance: { updateMany: vi.fn() },
    blockedUser: { deleteMany: vi.fn() },
    report: { updateMany: vi.fn() },
    user: { update: vi.fn() },
    complaint: { deleteMany: vi.fn(), updateMany: vi.fn() },
    matchQualityLog: { updateMany: vi.fn() },
    $executeRawUnsafe: vi.fn(),
  };
  return {
    prisma: {
      user: { findUnique: vi.fn(), update: vi.fn() },
      consentRecord: { findFirst: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
      $executeRawUnsafe: vi.fn(),
      __tx: tx,
    },
  };
});

const mockRevoke = vi.fn().mockResolvedValue(undefined);
vi.mock("../auth/auth.service.js", () => ({
  revokeUserSessions: (...a: unknown[]) => mockRevoke(...a),
}));

const mockDisconnect = vi.fn();
vi.mock("../safety/enforcement.service.js", () => ({
  disconnectUserSockets: (...a: unknown[]) => mockDisconnect(...a),
}));

const mockEvict = vi.fn().mockResolvedValue(undefined);
vi.mock("../matching/matching.service.js", () => ({
  evictFromMatching: (...a: unknown[]) => mockEvict(...a),
}));

const mockInvalidate = vi.fn();
vi.mock("./compliance-gate.service.js", () => ({
  invalidateComplianceCache: (...a: unknown[]) => mockInvalidate(...a),
}));

import { withdrawConsent, deleteAccount } from "./compliance.service.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);

describe("consent withdrawal cascade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.user.update as any).mockResolvedValue({});
    (mockPrisma.consentRecord.findFirst as any).mockResolvedValue(null);
  });

  it("revokes sessions, disconnects sockets, evicts from matching, and invalidates the compliance cache", async () => {
    await withdrawConsent("user-1");

    expect(mockRevoke).toHaveBeenCalledWith("user-1");
    expect(mockDisconnect).toHaveBeenCalledWith("user-1");
    expect(mockEvict).toHaveBeenCalledWith("user-1");
    expect(mockInvalidate).toHaveBeenCalledWith("user-1");
  });
});

describe("account deletion cascade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.user.findUnique as any).mockResolvedValue({ id: "user-1" });
    (mockPrisma.user.update as any).mockResolvedValue({});
  });

  it("revokes sessions, disconnects sockets, evicts from matching, and invalidates the compliance cache", async () => {
    await deleteAccount("user-1");

    expect(mockRevoke).toHaveBeenCalledWith("user-1");
    expect(mockDisconnect).toHaveBeenCalledWith("user-1");
    expect(mockEvict).toHaveBeenCalledWith("user-1");
    expect(mockInvalidate).toHaveBeenCalledWith("user-1");
  });
});
