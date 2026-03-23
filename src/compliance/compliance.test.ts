import { describe, it, expect, vi, beforeEach } from "vitest";

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
    crisisEvent: { deleteMany: vi.fn() },
    moderationAction: { deleteMany: vi.fn() },
    report: { deleteMany: vi.fn() },
    termsAcceptance: { deleteMany: vi.fn() },
    consentRecord: { deleteMany: vi.fn() },
  },
}));

import {
  deleteExpiredCrisisEvents,
  deleteExpiredReports,
  deleteExpiredTermsRecords,
  deleteExpiredConsentRecords,
} from "./compliance.service.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);

describe("compliance retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("deleteExpiredCrisisEvents", () => {
    it("deletes crisis events older than 12 months", async () => {
      (mockPrisma.crisisEvent.deleteMany as any).mockResolvedValue({ count: 3 });

      const count = await deleteExpiredCrisisEvents();

      expect(count).toBe(3);
      expect(mockPrisma.crisisEvent.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: expect.any(Date) } },
      });
    });
  });

  describe("deleteExpiredReports", () => {
    it("deletes resolved reports older than 12 months from resolution", async () => {
      (mockPrisma.moderationAction.deleteMany as any).mockResolvedValue({ count: 2 });
      (mockPrisma.report.deleteMany as any).mockResolvedValue({ count: 5 });

      const count = await deleteExpiredReports();

      expect(count).toBe(5);
      expect(mockPrisma.moderationAction.deleteMany).toHaveBeenCalledWith({
        where: {
          report: { resolvedAt: { not: null, lt: expect.any(Date) } },
        },
      });
      expect(mockPrisma.report.deleteMany).toHaveBeenCalledWith({
        where: { resolvedAt: { not: null, lt: expect.any(Date) } },
      });
    });

    it("does not delete unresolved reports", async () => {
      (mockPrisma.moderationAction.deleteMany as any).mockResolvedValue({ count: 0 });
      (mockPrisma.report.deleteMany as any).mockResolvedValue({ count: 0 });

      const count = await deleteExpiredReports();

      expect(count).toBe(0);
      // The query filters on resolvedAt: { not: null } so unresolved reports are excluded
      const call = (mockPrisma.report.deleteMany as any).mock.calls[0][0];
      expect(call.where.resolvedAt.not).toBeNull();
    });
  });

  describe("deleteExpiredTermsRecords", () => {
    it("deletes terms records 2 years after account deletion", async () => {
      (mockPrisma.termsAcceptance.deleteMany as any).mockResolvedValue({ count: 4 });

      const count = await deleteExpiredTermsRecords();

      expect(count).toBe(4);
      expect(mockPrisma.termsAcceptance.deleteMany).toHaveBeenCalledWith({
        where: {
          user: { deletedAt: { not: null, lt: expect.any(Date) } },
        },
      });
    });
  });

  describe("deleteExpiredConsentRecords", () => {
    it("deletes consent records 6 years after account deletion", async () => {
      (mockPrisma.consentRecord.deleteMany as any).mockResolvedValue({ count: 7 });

      const count = await deleteExpiredConsentRecords();

      expect(count).toBe(7);
      expect(mockPrisma.consentRecord.deleteMany).toHaveBeenCalledWith({
        where: {
          user: { deletedAt: { not: null, lt: expect.any(Date) } },
        },
      });
    });
  });
});
