import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    termsVersion: { findFirst: vi.fn() },
    consentTextVersion: { findFirst: vi.fn() },
  },
}));

import {
  checkUserCompliance,
  checkUserComplianceCached,
  invalidateComplianceCache,
  invalidateCanonicalVersionCache,
} from "./compliance-gate.service.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);

const eighteenPlusDob = new Date(Date.now() - 25 * 365.25 * 24 * 3600 * 1000);

function compliantUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    deletedAt: null,
    banned: false,
    suspendedUntil: null,
    ageConfirmedAt: new Date("2026-01-01"),
    dateOfBirth: eighteenPlusDob,
    sensitiveDataConsent: true,
    termsAcceptances: [{ termsVersion: "1.1" }],
    consentRecords: [{ consentVersion: "1.1" }],
    ...overrides,
  };
}

function seedCanonicalVersions(terms = "1.1", consent = "1.1") {
  (mockPrisma.termsVersion.findFirst as any).mockResolvedValue({ version: terms });
  (mockPrisma.consentTextVersion.findFirst as any).mockResolvedValue({ version: consent });
}

describe("checkUserCompliance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateComplianceCache();
    invalidateCanonicalVersionCache();
    seedCanonicalVersions();
  });

  it("passes a fully compliant user", async () => {
    (mockPrisma.user.findUnique as any).mockResolvedValue(compliantUser());
    const result = await checkUserCompliance("user-1");
    expect(result.ok).toBe(true);
  });

  it("fails a deleted account", async () => {
    (mockPrisma.user.findUnique as any).mockResolvedValue(
      compliantUser({ deletedAt: new Date() }),
    );
    expect(await checkUserCompliance("user-1")).toMatchObject({
      ok: false,
      reason: "account_deleted",
    });
  });

  it("fails an unknown user", async () => {
    (mockPrisma.user.findUnique as any).mockResolvedValue(null);
    expect(await checkUserCompliance("ghost")).toMatchObject({
      ok: false,
      reason: "account_deleted",
    });
  });

  it("fails a banned account", async () => {
    (mockPrisma.user.findUnique as any).mockResolvedValue(compliantUser({ banned: true }));
    expect(await checkUserCompliance("user-1")).toMatchObject({ ok: false, reason: "banned" });
  });

  it("fails a currently suspended account and reports the lift date", async () => {
    const until = new Date(Date.now() + 3600_000);
    (mockPrisma.user.findUnique as any).mockResolvedValue(
      compliantUser({ suspendedUntil: until }),
    );
    expect(await checkUserCompliance("user-1")).toMatchObject({
      ok: false,
      reason: "suspended",
      suspendedUntil: until,
    });
  });

  it("passes when a past suspension has lapsed", async () => {
    (mockPrisma.user.findUnique as any).mockResolvedValue(
      compliantUser({ suspendedUntil: new Date(Date.now() - 3600_000) }),
    );
    expect((await checkUserCompliance("user-1")).ok).toBe(true);
  });

  it("fails without server-side age confirmation", async () => {
    (mockPrisma.user.findUnique as any).mockResolvedValue(
      compliantUser({ ageConfirmedAt: null }),
    );
    expect(await checkUserCompliance("user-1")).toMatchObject({
      ok: false,
      reason: "age_not_confirmed",
    });
  });

  it("fails a recorded date of birth under 18 even if a confirmation slipped through", async () => {
    const seventeen = new Date(Date.now() - 17 * 365.25 * 24 * 3600 * 1000);
    (mockPrisma.user.findUnique as any).mockResolvedValue(
      compliantUser({ dateOfBirth: seventeen }),
    );
    expect(await checkUserCompliance("user-1")).toMatchObject({
      ok: false,
      reason: "underage",
    });
  });

  it("fails when the accepted terms version is not the canonical current one", async () => {
    seedCanonicalVersions("2.0", "1.1");
    (mockPrisma.user.findUnique as any).mockResolvedValue(compliantUser());
    expect(await checkUserCompliance("user-1")).toMatchObject({
      ok: false,
      reason: "terms_outdated",
    });
  });

  it("fails when no terms were ever accepted", async () => {
    (mockPrisma.user.findUnique as any).mockResolvedValue(
      compliantUser({ termsAcceptances: [] }),
    );
    expect(await checkUserCompliance("user-1")).toMatchObject({
      ok: false,
      reason: "terms_outdated",
    });
  });

  it("fails when the sensitive-data consent flag is off", async () => {
    (mockPrisma.user.findUnique as any).mockResolvedValue(
      compliantUser({ sensitiveDataConsent: false }),
    );
    expect(await checkUserCompliance("user-1")).toMatchObject({
      ok: false,
      reason: "consent_required",
    });
  });

  it("fails when the recorded consent version is not the canonical current one", async () => {
    seedCanonicalVersions("1.1", "2.0");
    (mockPrisma.user.findUnique as any).mockResolvedValue(compliantUser());
    expect(await checkUserCompliance("user-1")).toMatchObject({
      ok: false,
      reason: "consent_required",
    });
  });

  it("ignores client-supplied values entirely: canonical versions come from the database", async () => {
    // The signature takes only a userId — there is no parameter through which
    // a client could assert its own version/hash. This test pins that shape.
    expect(checkUserCompliance.length).toBe(1);
  });

  it("fails closed when the database errors", async () => {
    (mockPrisma.user.findUnique as any).mockRejectedValue(new Error("db down"));
    expect(await checkUserCompliance("user-1")).toMatchObject({
      ok: false,
      reason: "check_failed",
    });
  });
});

describe("checkUserComplianceCached", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateComplianceCache();
    invalidateCanonicalVersionCache();
    seedCanonicalVersions();
  });

  it("serves repeat checks within the TTL from cache", async () => {
    (mockPrisma.user.findUnique as any).mockResolvedValue(compliantUser());

    await checkUserComplianceCached("user-1");
    await checkUserComplianceCached("user-1");

    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it("re-checks after invalidation (enforcement/withdrawal hook)", async () => {
    (mockPrisma.user.findUnique as any).mockResolvedValue(compliantUser());

    await checkUserComplianceCached("user-1");
    invalidateComplianceCache("user-1");
    await checkUserComplianceCached("user-1");

    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures for other users' invalidation", async () => {
    (mockPrisma.user.findUnique as any).mockResolvedValue(compliantUser());

    await checkUserComplianceCached("user-1");
    invalidateComplianceCache("user-2");
    await checkUserComplianceCached("user-1");

    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
});
