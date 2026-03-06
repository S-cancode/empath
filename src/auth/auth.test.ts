import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

// Mock config before importing modules
vi.mock("../config/index.js", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
    JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-characters",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    PORT: 3000,
    NODE_ENV: "test",
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { verifyAccessToken, verifyRefreshToken, createAnonymousUser, refreshTokens } from "./auth.service.js";
import { authMiddleware } from "./auth.middleware.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);

describe("auth.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verifyAccessToken", () => {
    it("verifies a valid token", () => {
      const token = jwt.sign(
        { userId: "user-1", tier: "free" },
        "test-jwt-secret-at-least-32-characters-long",
        { expiresIn: "15m" },
      );
      const payload = verifyAccessToken(token);
      expect(payload.userId).toBe("user-1");
      expect(payload.tier).toBe("free");
    });

    it("throws on invalid token", () => {
      expect(() => verifyAccessToken("invalid-token")).toThrow("Invalid or expired token");
    });

    it("throws on expired token", () => {
      const token = jwt.sign(
        { userId: "user-1", tier: "free" },
        "test-jwt-secret-at-least-32-characters-long",
        { expiresIn: "0s" },
      );
      expect(() => verifyAccessToken(token)).toThrow("Invalid or expired token");
    });
  });

  describe("verifyRefreshToken", () => {
    it("verifies a valid refresh token", () => {
      const token = jwt.sign(
        { userId: "user-1", tokenVersion: 0 },
        "test-refresh-secret-at-least-32-characters",
        { expiresIn: "7d" },
      );
      const payload = verifyRefreshToken(token);
      expect(payload.userId).toBe("user-1");
      expect(payload.tokenVersion).toBe(0);
    });
  });

  describe("createAnonymousUser", () => {
    it("creates a new user when device not found", async () => {
      const mockUser = {
        id: "user-1",
        anonymousAlias: "GentleRiver42",
        deviceId: "hashed",
        email: null,
        subscriptionTier: "free",
        tokenVersion: 0,
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await createAnonymousUser("device-123");
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.id).toBe("user-1");
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it("returns existing user when device found", async () => {
      const mockUser = {
        id: "user-1",
        anonymousAlias: "GentleRiver42",
        deviceId: "hashed",
        email: null,
        subscriptionTier: "free",
        tokenVersion: 0,
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await createAnonymousUser("device-123");
      expect(result.user.id).toBe("user-1");
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe("refreshTokens", () => {
    it("issues new tokens for valid refresh token", async () => {
      const mockUser = {
        id: "user-1",
        anonymousAlias: "GentleRiver42",
        deviceId: "hashed",
        email: null,
        subscriptionTier: "free",
        tokenVersion: 0,
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const refreshToken = jwt.sign(
        { userId: "user-1", tokenVersion: 0 },
        "test-refresh-secret-at-least-32-characters",
        { expiresIn: "7d" },
      );

      const result = await refreshTokens(refreshToken);
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it("throws when token version mismatch", async () => {
      const mockUser = {
        id: "user-1",
        anonymousAlias: "GentleRiver42",
        deviceId: "hashed",
        email: null,
        subscriptionTier: "free",
        tokenVersion: 1,
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const refreshToken = jwt.sign(
        { userId: "user-1", tokenVersion: 0 },
        "test-refresh-secret-at-least-32-characters",
        { expiresIn: "7d" },
      );

      await expect(refreshTokens(refreshToken)).rejects.toThrow("Token has been revoked");
    });
  });
});

describe("authMiddleware", () => {
  it("sets req.user for valid token", async () => {
    const token = jwt.sign(
      { userId: "user-1", tier: "free" },
      "test-jwt-secret-at-least-32-characters-long",
      { expiresIn: "15m" },
    );

    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      banned: false,
      suspendedUntil: null,
    });

    const req = { headers: { authorization: `Bearer ${token}` } } as any;
    const res = {} as any;
    const next = vi.fn();

    await authMiddleware(req, res, next);
    expect(req.user.userId).toBe("user-1");
    expect(next).toHaveBeenCalled();
  });

  it("throws on missing header", async () => {
    const req = { headers: {} } as any;
    const res = {} as any;
    const next = vi.fn();

    await expect(authMiddleware(req, res, next)).rejects.toThrow("Missing or malformed authorization header");
  });
});
