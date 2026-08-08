import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: {
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    NODE_ENV: "test",
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: { consentRecord: { findFirst: vi.fn() } },
}));

import { hasTranslationConsent } from "./compliance.service.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);

describe("hasTranslationConsent (server-verified gate)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is true only for a granted, unwithdrawn translation consent record", async () => {
    (mockPrisma.consentRecord.findFirst as any).mockResolvedValue({ id: "c1" });
    expect(await hasTranslationConsent("user-1")).toBe(true);
    expect(mockPrisma.consentRecord.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", consentType: "translation", granted: true, withdrawnAt: null },
    });
  });

  it("is false when no translation consent is recorded (client logging is not trusted)", async () => {
    (mockPrisma.consentRecord.findFirst as any).mockResolvedValue(null);
    expect(await hasTranslationConsent("user-1")).toBe(false);
  });
});
