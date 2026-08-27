import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockJwtVerify } = vi.hoisted(() => ({ mockJwtVerify: vi.fn() }));
vi.mock("jose", () => ({
  createRemoteJWKSet: () => vi.fn(),
  jwtVerify: (...a: unknown[]) => mockJwtVerify(...a),
}));

vi.mock("../config/index.js", () => ({
  config: { APPLE_BUNDLE_ID: "com.shivandongha.empath", APPLE_CLIENT_ID: "com.shivandongha.empath" },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

const mockCascade = vi.fn();
vi.mock("../compliance/compliance.service.js", () => ({
  complianceRevocationCascade: (...a: unknown[]) => mockCascade(...a),
}));

import { handleAppleServerNotification, AppleNotificationError } from "./apple-notifications.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma) as any;

/** Make jwtVerify resolve with the given events object (as Apple encodes it). */
function verifiedWith(events: unknown) {
  mockJwtVerify.mockResolvedValue({
    payload: { events: typeof events === "string" ? events : JSON.stringify(events) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.update.mockResolvedValue({});
});

describe("handleAppleServerNotification", () => {
  it("consent-revoked for a known sub runs the revocation cascade and clears the token", async () => {
    verifiedWith({ type: "consent-revoked", sub: "apple-1" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1" });

    await handleAppleServerNotification("signed.jwt.token");

    expect(mockCascade).toHaveBeenCalledWith("u1");
    const upd = mockPrisma.user.update.mock.calls[0][0];
    expect(upd.data.appleRefreshTokenCipher).toBeNull();
    expect(upd.data.appleRefreshTokenIv).toBeNull();
    expect(upd.data.appleRefreshTokenAuthTag).toBeNull();
  });

  it("account-delete also revokes access", async () => {
    verifiedWith({ type: "account-delete", sub: "apple-1" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1" });
    await handleAppleServerNotification("signed.jwt.token");
    expect(mockCascade).toHaveBeenCalledWith("u1");
  });

  it("rejects an invalid signature without any mutation", async () => {
    mockJwtVerify.mockRejectedValue(new Error("signature verification failed"));
    await expect(handleAppleServerNotification("forged")).rejects.toBeInstanceOf(AppleNotificationError);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockCascade).not.toHaveBeenCalled();
  });

  it("rejects a wrong issuer/audience (jwtVerify throws) without mutation", async () => {
    mockJwtVerify.mockRejectedValue(new Error('unexpected "aud" claim value'));
    await expect(handleAppleServerNotification("wrong-aud")).rejects.toBeInstanceOf(AppleNotificationError);
    expect(mockCascade).not.toHaveBeenCalled();
  });

  it("is neutral for an unknown Apple sub (no disclosure, no cascade)", async () => {
    verifiedWith({ type: "consent-revoked", sub: "apple-unknown" });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(handleAppleServerNotification("signed")).resolves.toBeUndefined();
    expect(mockCascade).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("is idempotent for duplicate events", async () => {
    verifiedWith({ type: "consent-revoked", sub: "apple-1" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1" });
    await handleAppleServerNotification("signed");
    await handleAppleServerNotification("signed");
    expect(mockCascade).toHaveBeenCalledTimes(2); // re-running just re-invalidates
    expect(mockCascade).toHaveBeenCalledWith("u1");
  });

  it("ignores non-revocation events (e.g. email-enabled) with no action", async () => {
    verifiedWith({ type: "email-enabled", sub: "apple-1" });
    await handleAppleServerNotification("signed");
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockCascade).not.toHaveBeenCalled();
  });

  it("rejects a malformed events payload", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { events: "{not json" } });
    await expect(handleAppleServerNotification("signed")).rejects.toBeInstanceOf(AppleNotificationError);
  });

  it("rejects a missing payload", async () => {
    await expect(handleAppleServerNotification(undefined)).rejects.toBeInstanceOf(AppleNotificationError);
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it("never logs the signed token or the Apple sub", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    verifiedWith({ type: "consent-revoked", sub: "apple-secret-sub" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1" });
    await handleAppleServerNotification("signed.secret.jwt");
    for (const spy of [errSpy, logSpy]) {
      for (const call of spy.mock.calls) {
        const line = call.join(" ");
        expect(line).not.toContain("apple-secret-sub");
        expect(line).not.toContain("signed.secret.jwt");
      }
    }
    errSpy.mockRestore();
    logSpy.mockRestore();
  });
});
