import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    NODE_ENV: "test",
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    moderator: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    moderatorAuditLog: { create: vi.fn() },
  },
}));

import { authenticator } from "otplib";
import {
  hashPassword,
  moderatorLogin,
  resolveModerator,
  verifyModeratorToken,
  generateTotpSecret,
} from "./moderator.service.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);

async function seedModerator(overrides: Record<string, unknown> = {}) {
  const secret = generateTotpSecret();
  const passwordHash = await hashPassword("correct horse battery staple");
  (mockPrisma.moderator.findUnique as any).mockResolvedValue({
    id: "mod-1",
    email: "mod@empath.app",
    passwordHash,
    totpSecret: secret,
    role: "moderator",
    active: true,
    tokenVersion: 0,
    ...overrides,
  });
  return { secret };
}

describe("moderatorLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.moderator.update as any).mockResolvedValue({});
    (mockPrisma.moderatorAuditLog.create as any).mockResolvedValue({});
  });

  it("issues a session for correct password + TOTP and audits the login", async () => {
    const { secret } = await seedModerator();
    const totp = authenticator.generate(secret);

    const result = await moderatorLogin("mod@empath.app", "correct horse battery staple", totp);

    expect(result.token).toBeTruthy();
    expect(result.role).toBe("moderator");
    const audited = (mockPrisma.moderatorAuditLog.create as any).mock.calls.map((c: any[]) => c[0].data.action);
    expect(audited).toContain("login");
  });

  it("rejects a wrong password and audits login_failed (generic error, no enumeration)", async () => {
    const { secret } = await seedModerator();
    const totp = authenticator.generate(secret);

    await expect(moderatorLogin("mod@empath.app", "wrong", totp)).rejects.toThrow("Invalid credentials");
    const audited = (mockPrisma.moderatorAuditLog.create as any).mock.calls.map((c: any[]) => c[0].data.action);
    expect(audited).toContain("login_failed");
  });

  it("rejects a wrong TOTP even with the correct password", async () => {
    await seedModerator();
    await expect(
      moderatorLogin("mod@empath.app", "correct horse battery staple", "000000"),
    ).rejects.toThrow("Invalid credentials");
  });

  it("rejects an unknown email with the same generic error", async () => {
    (mockPrisma.moderator.findUnique as any).mockResolvedValue(null);
    await expect(moderatorLogin("ghost@empath.app", "x", "123456")).rejects.toThrow("Invalid credentials");
  });

  it("rejects a deactivated moderator", async () => {
    const { secret } = await seedModerator({ active: false });
    const totp = authenticator.generate(secret);
    await expect(
      moderatorLogin("mod@empath.app", "correct horse battery staple", totp),
    ).rejects.toThrow("Invalid credentials");
  });
});

describe("resolveModerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.moderator.update as any).mockResolvedValue({});
    (mockPrisma.moderatorAuditLog.create as any).mockResolvedValue({});
  });

  it("resolves an active moderator whose tokenVersion still matches", async () => {
    const { secret } = await seedModerator();
    const totp = authenticator.generate(secret);
    const { token } = await moderatorLogin("mod@empath.app", "correct horse battery staple", totp);

    (mockPrisma.moderator.findUnique as any).mockResolvedValue({
      active: true, tokenVersion: 0, role: "moderator",
    });
    const session = await resolveModerator(token);
    expect(session.moderatorId).toBe("mod-1");
  });

  it("rejects a session after tokenVersion is bumped (revocation)", async () => {
    const { secret } = await seedModerator();
    const totp = authenticator.generate(secret);
    const { token } = await moderatorLogin("mod@empath.app", "correct horse battery staple", totp);

    (mockPrisma.moderator.findUnique as any).mockResolvedValue({
      active: true, tokenVersion: 1, role: "moderator",
    });
    await expect(resolveModerator(token)).rejects.toThrow("revoked");
  });

  it("rejects a garbage token", () => {
    expect(() => verifyModeratorToken("not-a-jwt")).toThrow();
  });
});
