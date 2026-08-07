import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
    JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-characters",
    NODE_ENV: "test",
    APPLE_BUNDLE_ID: "com.shivandongha.empath",
    ALLOW_ANONYMOUS_AUTH: false,
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const mockJwtVerify = vi.fn();
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: (...args: unknown[]) => mockJwtVerify(...args),
}));

import { signInWithApple } from "./apple.service.js";
import { isAnonymousAuthAllowed, revokeUserSessions } from "./auth.service.js";
import { prisma } from "../lib/prisma.js";
import { config } from "../config/index.js";

const mockPrisma = vi.mocked(prisma);

const baseUser = {
  id: "user-1",
  anonymousAlias: "GentleRiver0001",
  appleSub: "apple-sub-123",
  subscriptionTier: "free",
  tokenVersion: 0,
  banned: false,
  suspendedUntil: null,
  deletedAt: null,
};

function appleTokenResolves(sub: string, email?: string) {
  mockJwtVerify.mockResolvedValue({ payload: { sub, email } });
}

describe("signInWithApple", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies the identity token against Apple issuer and our bundle id", async () => {
    appleTokenResolves("apple-sub-123");
    (mockPrisma.user.findUnique as any).mockResolvedValue(baseUser);

    await signInWithApple("apple-identity-token", "device-1");

    expect(mockJwtVerify).toHaveBeenCalledWith(
      "apple-identity-token",
      "mock-jwks",
      expect.objectContaining({
        issuer: "https://appleid.apple.com",
        audience: "com.shivandongha.empath",
      }),
    );
  });

  it("creates a new user bound to the Apple sub when none exists", async () => {
    appleTokenResolves("apple-sub-new", "relay@privaterelay.appleid.com");
    (mockPrisma.user.findUnique as any).mockResolvedValue(null); // no appleSub match
    (mockPrisma.user.findFirst as any).mockResolvedValue(null); // no device match
    (mockPrisma.user.create as any).mockImplementation(async (args: any) => ({
      ...baseUser,
      id: "user-new",
      ...args.data,
    }));

    const result = await signInWithApple("token", "device-1");

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appleSub: "apple-sub-new",
        email: "relay@privaterelay.appleid.com",
        deviceId: expect.any(String),
        anonymousAlias: expect.any(String),
      }),
    });
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.id).toBe("user-new");
  });

  it("returns the existing account on repeat sign-in with the same Apple sub", async () => {
    appleTokenResolves("apple-sub-123");
    (mockPrisma.user.findUnique as any).mockResolvedValue(baseUser);

    const result = await signInWithApple("token", "device-other");

    expect(result.user.id).toBe("user-1");
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("links the Apple sub to an existing device-matched anonymous account, preserving its history", async () => {
    appleTokenResolves("apple-sub-new");
    (mockPrisma.user.findUnique as any).mockResolvedValue(null);
    (mockPrisma.user.findFirst as any).mockResolvedValue({
      ...baseUser,
      id: "user-legacy",
      appleSub: null,
    });
    (mockPrisma.user.update as any).mockImplementation(async (args: any) => ({
      ...baseUser,
      id: "user-legacy",
      ...args.data,
    }));

    const result = await signInWithApple("token", "device-1");

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-legacy" },
      data: expect.objectContaining({ appleSub: "apple-sub-new" }),
    });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(result.user.id).toBe("user-legacy");
  });

  it("rejects an invalid identity token without touching the database", async () => {
    mockJwtVerify.mockRejectedValue(new Error("signature verification failed"));

    await expect(signInWithApple("bad-token", "device-1")).rejects.toThrow(
      "Invalid Apple identity token",
    );
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("refuses to issue tokens to a banned account", async () => {
    appleTokenResolves("apple-sub-123");
    (mockPrisma.user.findUnique as any).mockResolvedValue({ ...baseUser, banned: true });

    await expect(signInWithApple("token", "device-1")).rejects.toThrow(
      /banned/i,
    );
  });

  it("refuses to resurrect a deleted account and creates a fresh one instead", async () => {
    appleTokenResolves("apple-sub-123");
    (mockPrisma.user.findUnique as any).mockResolvedValue({
      ...baseUser,
      deletedAt: new Date("2026-01-01"),
    });
    (mockPrisma.user.findFirst as any).mockResolvedValue(null);
    (mockPrisma.user.create as any).mockImplementation(async (args: any) => ({
      ...baseUser,
      id: "user-fresh",
      ...args.data,
    }));

    const result = await signInWithApple("token", "device-1");

    // Erased account stays erased; the person may return, their data may not.
    expect(result.user.id).toBe("user-fresh");
  });
});

describe("isAnonymousAuthAllowed", () => {
  it("forbids anonymous auth in production without an explicit override", () => {
    (config as any).NODE_ENV = "production";
    (config as any).ALLOW_ANONYMOUS_AUTH = false;
    expect(isAnonymousAuthAllowed()).toBe(false);
    (config as any).NODE_ENV = "test";
  });

  it("allows anonymous auth outside production (dev/test flows)", () => {
    (config as any).NODE_ENV = "test";
    expect(isAnonymousAuthAllowed()).toBe(true);
  });

  it("allows anonymous auth in production only with the explicit env override", () => {
    (config as any).NODE_ENV = "production";
    (config as any).ALLOW_ANONYMOUS_AUTH = true;
    expect(isAnonymousAuthAllowed()).toBe(true);
    (config as any).NODE_ENV = "test";
    (config as any).ALLOW_ANONYMOUS_AUTH = false;
  });
});

describe("revokeUserSessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("increments tokenVersion so outstanding refresh tokens die", async () => {
    (mockPrisma.user.update as any).mockResolvedValue({ ...baseUser, tokenVersion: 1 });

    await revokeUserSessions("user-1");

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { tokenVersion: { increment: 1 } },
    });
  });
});
