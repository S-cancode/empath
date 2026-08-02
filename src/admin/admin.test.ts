import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/index.js", () => ({
  config: {
    ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    report: { findUnique: vi.fn(), update: vi.fn() },
    moderationAction: { create: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../safety/enforcement.service.js", () => ({
  applyBan: vi.fn().mockResolvedValue(undefined),
  applySuspension: vi.fn().mockResolvedValue(undefined),
  liftSuspension: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../conversation/conversation.service.js", () => ({
  setRetentionHold: vi.fn().mockResolvedValue(undefined),
}));

import { takeAction, resolveEscalation } from "./admin.service.js";
import { applyBan, applySuspension, liftSuspension } from "../safety/enforcement.service.js";
import { setRetentionHold } from "../conversation/conversation.service.js";
import { prisma } from "../lib/prisma.js";

const mockPrisma = vi.mocked(prisma);
const mockApplyBan = vi.mocked(applyBan);
const mockApplySuspension = vi.mocked(applySuspension);
const mockLiftSuspension = vi.mocked(liftSuspension);
const mockSetRetentionHold = vi.mocked(setRetentionHold);

const baseReport = {
  id: "report-1",
  reporterId: "reporter-1",
  reportedId: "reported-1",
  conversationId: "conv-1",
  reason: "harassment",
  status: "pending",
  reviewedAt: null,
};

describe("admin takeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.report.findUnique as any).mockResolvedValue(baseReport);
    (mockPrisma.report.update as any).mockResolvedValue({});
    (mockPrisma.moderationAction.create as any).mockResolvedValue({ id: "action-1" });
    // notifyUser: no push token → returns without calling fetch
    (mockPrisma.user.findUnique as any).mockResolvedValue({ pushToken: null });
  });

  it("routes ban through applyBan", async () => {
    await takeAction("report-1", "admin", { action: "ban" });

    expect(mockApplyBan).toHaveBeenCalledWith("reported-1");
    expect(mockApplySuspension).not.toHaveBeenCalled();
  });

  it("routes suspend through applySuspension with the lift date", async () => {
    await takeAction("report-1", "admin", { action: "suspend", duration: 3 });

    expect(mockApplySuspension).toHaveBeenCalledTimes(1);
    const [userId, until] = mockApplySuspension.mock.calls[0];
    expect(userId).toBe("reported-1");
    const expectedMs = 3 * 24 * 60 * 60 * 1000;
    expect(until.getTime() - Date.now()).toBeGreaterThan(expectedMs - 60_000);
    expect(until.getTime() - Date.now()).toBeLessThan(expectedMs + 60_000);
    expect(mockApplyBan).not.toHaveBeenCalled();
  });

  it("applies no enforcement for dismiss", async () => {
    await takeAction("report-1", "admin", { action: "dismiss" });

    expect(mockApplyBan).not.toHaveBeenCalled();
    expect(mockApplySuspension).not.toHaveBeenCalled();
    expect(mockPrisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-1" },
        data: expect.objectContaining({ status: "resolved" }),
      }),
    );
  });

  it("applies no enforcement for warn", async () => {
    await takeAction("report-1", "admin", { action: "warn" });

    expect(mockApplyBan).not.toHaveBeenCalled();
    expect(mockApplySuspension).not.toHaveBeenCalled();
  });

  it("rejects suspend without a duration", async () => {
    await expect(
      takeAction("report-1", "admin", { action: "suspend" }),
    ).rejects.toThrow("Suspension requires a duration");
    expect(mockApplySuspension).not.toHaveBeenCalled();
  });

  describe("escalate", () => {
    it("sets a retention hold and suspends via applySuspension for the review window", async () => {
      await takeAction("report-1", "admin", { action: "escalate" });

      expect(mockSetRetentionHold).toHaveBeenCalledWith("conv-1");
      expect(mockApplySuspension).toHaveBeenCalledTimes(1);
      const [userId, until] = mockApplySuspension.mock.calls[0];
      expect(userId).toBe("reported-1");
      const expectedMs = 7 * 24 * 60 * 60 * 1000;
      expect(until.getTime() - Date.now()).toBeGreaterThan(expectedMs - 60_000);
      expect(until.getTime() - Date.now()).toBeLessThan(expectedMs + 60_000);
      expect(mockApplyBan).not.toHaveBeenCalled();
    });

    it("marks the report escalated, not resolved", async () => {
      await takeAction("report-1", "admin", { action: "escalate" });

      expect(mockPrisma.report.update).toHaveBeenCalledWith({
        where: { id: "report-1" },
        data: { status: "escalated", reviewedAt: expect.any(Date) },
      });
      const updateData = (mockPrisma.report.update as any).mock.calls[0][0].data;
      expect(updateData.resolvedAt).toBeUndefined();
    });
  });

  describe("resolveEscalation", () => {
    beforeEach(() => {
      (mockPrisma.report.findUnique as any).mockResolvedValue({
        ...baseReport,
        status: "escalated",
      });
    });

    it("records the outcome and resolves the report without touching the retention hold", async () => {
      await resolveEscalation("report-1", "founder", "warning issued", false);

      expect(mockPrisma.moderationAction.create).toHaveBeenCalledWith({
        data: {
          reportId: "report-1",
          moderatorId: "founder",
          action: "escalation_resolved",
          reason: "warning issued",
        },
      });
      expect(mockPrisma.report.update).toHaveBeenCalledWith({
        where: { id: "report-1" },
        data: {
          status: "resolved",
          resolvedAt: expect.any(Date),
          escalationOutcome: "warning issued",
          escalationResolvedAt: expect.any(Date),
        },
      });
      // The one-way hold must survive resolution: no conversation writes of any kind.
      expect(mockSetRetentionHold).not.toHaveBeenCalled();
      expect((mockPrisma as any).conversation).toBeUndefined();
      expect(mockLiftSuspension).not.toHaveBeenCalled();
    });

    it("lifts the suspension when requested", async () => {
      await resolveEscalation("report-1", "founder", "no violation found", true);

      expect(mockLiftSuspension).toHaveBeenCalledWith("reported-1");
    });

    it("rejects reports that are not escalated", async () => {
      (mockPrisma.report.findUnique as any).mockResolvedValue(baseReport);

      await expect(
        resolveEscalation("report-1", "founder", "outcome", false),
      ).rejects.toThrow("Report is not escalated");
      expect(mockPrisma.report.update).not.toHaveBeenCalled();
    });
  });
});
